import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { User, UserPublic, UserRole, Session, AuditLogEntry } from './types';

const dataDir = path.join(__dirname, '../../data');
const usersFile = path.join(dataDir, 'users.json');
const auditFile = path.join(dataDir, 'audit_log.json');

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

export class AuthService {
  private sessions: Map<string, Session> = new Map();

  constructor() {
    this.ensureDataDir();
  }

  private ensureDataDir() {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(usersFile)) {
      this.seedDefaultUsers();
    }
    if (!fs.existsSync(auditFile)) {
      fs.writeFileSync(auditFile, JSON.stringify([]), 'utf-8');
    }
  }

  private hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  }

  private seedDefaultUsers() {
    const defaultUsers = [
      {
        id: 'usr-admin',
        username: 'admin',
        name: 'Administrador do Sistema',
        role: 'admin' as UserRole,
        pass: 'admin123'
      },
      {
        id: 'usr-analyst',
        username: 'analista',
        name: 'Analista de Segurança',
        role: 'analyst' as UserRole,
        pass: 'analista123'
      },
      {
        id: 'usr-auditor',
        username: 'auditor',
        name: 'Auditor de Conformidade',
        role: 'auditor' as UserRole,
        pass: 'auditor123'
      }
    ];

    const users: User[] = defaultUsers.map(u => {
      const salt = crypto.randomBytes(16).toString('hex');
      return {
        id: u.id,
        username: u.username,
        name: u.name,
        role: u.role,
        salt,
        passwordHash: this.hashPassword(u.pass, salt),
        createdAt: new Date().toISOString()
      };
    });

    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), 'utf-8');
    this.logAudit('system', 'system', 'Inicialização do banco de usuários locais', 'Usuários padrão criados');
  }

  private readUsers(): User[] {
    try {
      if (!fs.existsSync(usersFile)) {
        this.seedDefaultUsers();
      }
      return JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
    } catch (e) {
      console.error('[AuthService] Erro ao ler users.json:', e);
      return [];
    }
  }

  private saveUsers(users: User[]) {
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), 'utf-8');
  }

  public getUsers(): UserPublic[] {
    return this.readUsers().map(u => ({
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role,
      createdAt: u.createdAt,
      lastLogin: u.lastLogin
    }));
  }

  public createUser(input: { username: string; name: string; password: string; role: UserRole }, actor = 'admin'): UserPublic {
    const users = this.readUsers();
    const existing = users.find(u => u.username.toLowerCase() === input.username.toLowerCase().trim());
    if (existing) {
      throw new Error(`Nome de usuário "${input.username}" já existe.`);
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const newUser: User = {
      id: `usr-${crypto.randomBytes(6).toString('hex')}`,
      username: input.username.trim(),
      name: input.name.trim(),
      role: input.role,
      salt,
      passwordHash: this.hashPassword(input.password, salt),
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    this.saveUsers(users);
    this.logAudit(actor, 'admin', 'Criação de novo usuário', `Usuário "${newUser.username}" (${newUser.role}) criado.`);

    return {
      id: newUser.id,
      username: newUser.username,
      name: newUser.name,
      role: newUser.role,
      createdAt: newUser.createdAt
    };
  }

  public login(username: string, pass: string, ip?: string): { token: string; user: UserPublic } | null {
    const users = this.readUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase().trim());
    if (!user) {
      this.logAudit(username, 'system', 'Falha no login', 'Usuário não encontrado', ip);
      return null;
    }

    const testHash = this.hashPassword(pass, user.salt);
    if (!crypto.timingSafeEqual(Buffer.from(testHash, 'hex'), Buffer.from(user.passwordHash, 'hex'))) {
      this.logAudit(username, user.role, 'Falha no login', 'Senha incorreta', ip);
      return null;
    }

    // Atualiza lastLogin
    user.lastLogin = new Date().toISOString();
    this.saveUsers(users);

    // Cria token de sessão
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    const session: Session = {
      token,
      userId: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS
    };

    this.sessions.set(token, session);
    this.logAudit(user.username, user.role, 'Login bem-sucedido', `Sessão iniciada`, ip);

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }
    };
  }

  public logout(token: string) {
    const session = this.sessions.get(token);
    if (session) {
      this.logAudit(session.username, session.role, 'Logout efetuado', 'Sessão finalizada');
      this.sessions.delete(token);
    }
  }

  public getSession(token: string): Session | undefined {
    const session = this.sessions.get(token);
    if (!session) return undefined;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token);
      return undefined;
    }
    return session;
  }

  public logAudit(username: string, role: UserRole | 'system', action: string, details?: string, ip?: string): void {
    try {
      this.ensureDataDir();
      let logs: AuditLogEntry[] = [];
      if (fs.existsSync(auditFile)) {
        logs = JSON.parse(fs.readFileSync(auditFile, 'utf-8'));
      }

      const entry: AuditLogEntry = {
        id: `aud-${crypto.randomBytes(4).toString('hex')}`,
        timestamp: new Date().toISOString(),
        username,
        role,
        action,
        details,
        ip
      };

      logs.unshift(entry);
      // Mantém últimos 200 logs
      if (logs.length > 200) {
        logs = logs.slice(0, 200);
      }
      fs.writeFileSync(auditFile, JSON.stringify(logs, null, 2), 'utf-8');
    } catch (e) {
      console.error('[AuthService] Erro ao registrar log de auditoria:', e);
    }
  }

  public getAuditLogs(limit = 50): AuditLogEntry[] {
    try {
      this.ensureDataDir();
      if (!fs.existsSync(auditFile)) return [];
      const logs: AuditLogEntry[] = JSON.parse(fs.readFileSync(auditFile, 'utf-8'));
      return logs.slice(0, limit);
    } catch (e) {
      console.error('[AuthService] Erro ao ler audit_log.json:', e);
      return [];
    }
  }
}
