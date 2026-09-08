import express from 'express';
import crypto from 'crypto';
import { assertWithinRoot, PathTraversalError } from './security/pathGuard';
import path from 'path';
import fs from 'fs';
import { SemgrepScanner } from './scanner/semgrep';
import { ASTAnalyzer } from './analyzer/ast';
import { AIValidator } from './ai/validator';
import { Patcher } from './scanner/patcher';
import { SCAScanner } from './scanner/sca';
import { HealthCheck } from './utils/healthCheck';
import { UnifiedAlert } from './types';
import { HistoryStorage, ScanHistoryEntry } from './history/storage';
import { ConfigLoader } from './config/loader';
import { SarifGenerator } from './scanner/sarif';
import { AuthService } from './auth/service';
import { UserRole } from './auth/types';

export interface CreateAppOptions {
  sessionToken?: string;
  rateLimit?: { windowMs: number; max: number };
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

export function createApp(options: CreateAppOptions = {}) {
  const app = express();

  const sessionToken = options.sessionToken ?? crypto.randomBytes(24).toString('hex');

  const authService = new AuthService();

  function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
    const authHeader = req.header('Authorization');
    const customAuthToken = req.header('X-CypherGuard-Auth-Token');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const tokenToTest = bearerToken || customAuthToken;

    if (tokenToTest) {
      const session = authService.getSession(tokenToTest);
      if (session) {
        (req as any).user = {
          id: session.userId,
          username: session.username,
          name: session.name,
          role: session.role
        };
        (req as any).authToken = tokenToTest;
        return next();
      }
    }

    const provided = req.header('X-CypherGuard-Token') || req.query.token;
    if (provided && provided === sessionToken) {
      (req as any).user = {
        id: 'usr-admin',
        username: 'admin',
        name: 'Administrador do Sistema',
        role: 'admin' as UserRole
      };
      return next();
    }

    return res.status(401).json({ error: 'Token de sessão inválido ou ausente.' });
  }

  function requireRole(...allowedRoles: UserRole[]) {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      authenticate(req, res, () => {
        const user = (req as any).user;
        if (!user || !allowedRoles.includes(user.role)) {
          return res.status(403).json({
            error: 'Acesso negado: seu perfil não tem permissão para realizar esta operação.'
          });
        }
        next();
      });
    };
  }

  const requireSessionToken = authenticate;

  function serveIndexWithToken(req: express.Request, res: express.Response) {
    const indexPath = path.join(__dirname, '../public/index.html');
    const html = fs
      .readFileSync(indexPath, 'utf-8')
      .replace('</head>', `  <meta name="cg-token" content="${sessionToken}">\n</head>`);
    res.type('html').send(html);
  }

  // Rate limiting simples por IP — local-first, limite generoso para scans legítimos.
  const rateLimit = options.rateLimit ?? { windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX };
  const rateLimitState = new Map<string, { count: number; resetAt: number }>();

  function rateLimiter(req: express.Request, res: express.Response, next: express.NextFunction) {
    const ip = req.ip || 'unknown';
    const now = Date.now();

    let entry = rateLimitState.get(ip);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + rateLimit.windowMs };
      rateLimitState.set(ip, entry);
    }

    entry.count += 1;
    if (entry.count > rateLimit.max) {
      return res.status(429).json({ error: 'Limite de requisições excedido. Tente novamente mais tarde.' });
    }

    // Limpeza leve para evitar crescimento ilimitado do mapa.
    if (rateLimitState.size > 1000) {
      for (const [key, e] of rateLimitState) {
        if (e.resetAt <= now) rateLimitState.delete(key);
      }
    }

    next();
  }

  app.use(express.json({ limit: '2mb' }));
  app.get(['/', '/index.html'], serveIndexWithToken);
  app.use(express.static(path.join(__dirname, '../public'), {
    etag: false,
    maxAge: 0,
    setHeaders: (res, path) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }));
  app.use('/api', rateLimiter);

  const semgrep = new SemgrepScanner();
  const astAnalyzer = new ASTAnalyzer();
  const aiValidator = new AIValidator();
  const scaScanner = new SCAScanner();
  const historyStorage = new HistoryStorage();

  // --- ROTAS DE AUTENTICAÇÃO E RBAC ---
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
    }
    const result = authService.login(username, password, req.ip);
    if (!result) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }
    res.json(result);
  });

  app.post('/api/auth/logout', authenticate, (req, res) => {
    const token = (req as any).authToken;
    if (token) {
      authService.logout(token);
    }
    res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
  });

  app.get('/api/auth/me', authenticate, (req, res) => {
    res.json({ user: (req as any).user });
  });

  app.get('/api/auth/users', requireRole('admin'), (req, res) => {
    try {
      res.json(authService.getUsers());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/auth/users', requireRole('admin'), (req, res) => {
    try {
      const { username, name, password, role } = req.body || {};
      if (!username || !name || !password || !role) {
        return res.status(400).json({ error: 'Campos username, name, password e role são obrigatórios.' });
      }
      if (!['admin', 'analyst', 'auditor'].includes(role)) {
        return res.status(400).json({ error: 'Perfil inválido. Deve ser admin, analyst ou auditor.' });
      }
      const actor = (req as any).user?.username || 'admin';
      const user = authService.createUser({ username, name, password, role }, actor);
      res.status(201).json({ user });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // --- TRILHA DE AUDITORIA (AUDIT LOG) ---
  app.get('/api/audit', requireRole('admin', 'auditor'), (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      res.json(authService.getAuditLogs(limit));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- HISTÓRICO DE SCANS ---
  app.get('/api/history', authenticate, (req, res) => {
    try {
      const history = historyStorage.getHistory();
      res.json(history);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/history/stats', authenticate, (req, res) => {
    try {
      res.json(historyStorage.getStats());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/history/:id', authenticate, (req, res) => {
    try {
      const id = String(req.params.id);
      const entry = historyStorage.getEntry(id);
      if (!entry) {
        return res.status(404).json({ error: 'Scan não encontrado no histórico.' });
      }
      const results = historyStorage.getFullResults(id);
      res.json({ entry, results: results || [] });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/history/:id', requireRole('admin'), (req, res) => {
    try {
      const id = String(req.params.id);
      const ok = historyStorage.deleteEntry(id);
      if (ok) {
        const actor = (req as any).user?.username || 'admin';
        authService.logAudit(actor, 'admin', 'Exclusão de histórico', `Scan ${id} removido`);
        res.json({ success: true, message: 'Scan removido do histórico.' });
      } else {
        res.status(404).json({ error: 'Scan não encontrado.' });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- CONFIGURAÇÕES ---
  app.get('/api/config', authenticate, (req, res) => {
    try {
      const fullConfig = ConfigLoader.loadConfig();
      const aiConf = fullConfig.ai || {};
      res.json({
        provider: aiConf.provider || 'ollama',
        model: aiConf.model || 'llama3',
        openaiApiKey: aiConf.openaiApiKey || aiConf.apiKey || '',
        googleApiKey: aiConf.googleApiKey || aiConf.apiKey || ''
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/config', requireRole('admin'), (req, res) => {
    try {
      const { model, provider, openaiApiKey, googleApiKey } = req.body;

      if (!model) {
        return res.status(400).json({ error: 'Model is required.' });
      }

      if (provider === 'openai' && !openaiApiKey && !process.env.OPENAI_API_KEY) {
        return res.status(400).json({ error: 'OpenAI API Key is required.' });
      }
      if (provider === 'google' && !googleApiKey && !process.env.GOOGLE_API_KEY) {
        return res.status(400).json({ error: 'Google API Key is required.' });
      }

      aiValidator.updateModel(model, provider, openaiApiKey, googleApiKey);
      ConfigLoader.saveConfig(aiValidator['config']);
      const actor = (req as any).user?.username || 'admin';
      authService.logAudit(actor, 'admin', 'Alteração de configurações de IA', `Provedor: ${provider}, Modelo: ${model}`, req.ip);
      res.json({ success: true, model });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
  
  app.get('/api/export/sarif', requireSessionToken, (req, res) => {
    const { id } = req.query;
    let results: UnifiedAlert[] = [];
    if (id) {
       const stored = historyStorage.getFullResults(id as string);
       if (!stored) return res.status(404).json({ error: 'Scan not found' });
       results = stored;
    } else {
       return res.status(400).json({ error: 'ID is required for SARIF export' });
    }

    const sarifGen = new SarifGenerator();
    for (const alert of results) {
      if (alert.type === 'SAST' && alert.aiValidation && alert.aiValidation.status === 'True Positive') {
        sarifGen.addResult(alert.finding!, alert.aiValidation);
      }
    }
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="cypherguard-report-${id}.sarif"`);
    res.send(JSON.stringify(sarifGen.getLog(), null, 2));
  });

  app.get('/api/health', requireSessionToken, async (req, res) => {
    try {
      const health = await HealthCheck.getFullHealth();
      res.json(health);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/scan', requireRole('admin', 'analyst'), async (req, res) => {
    const { targetPath } = req.body;

    if (!targetPath) {
      return res.status(400).json({ error: 'targetPath is required' });
    }

    let fullPath: string;
    try {
      fullPath = assertWithinRoot(process.cwd(), targetPath);
    } catch (error) {
      if (error instanceof PathTraversalError) {
        console.error(`[Server] Tentativa de path traversal bloqueada: ${targetPath}`);
        return res.status(403).json({ error: 'Caminho fora do diretório permitido.' });
      }
      throw error;
    }

    if (!fs.existsSync(fullPath)) {
      console.error(`[Server] Caminho não encontrado: ${fullPath}`);
      return res.status(404).json({ error: 'Arquivo ou diretório não encontrado.' });
    }

    try {
      console.log(`[Server] Executando Semgrep (Camada 1)...`);
      const semgrepResults = await semgrep.scan(fullPath);

      if (semgrep.hasScanErrors(semgrepResults)) {
        console.warn(
          `[Server] Semgrep reportou ${semgrepResults.errors.length} erro(s) — o resultado pode estar incompleto.`
        );
      }

      console.log(
        `[Server] Semgrep finalizado. Iniciando validação sequencial de ${semgrepResults.results.length} alertas...`
      );

      const processedAlerts: UnifiedAlert[] = [];

      for (let i = 0; i < semgrepResults.results.length; i++) {
        const finding = semgrepResults.results[i];
        console.log(`[Server] Analisando Alerta ${i + 1}/${semgrepResults.results.length}: ${finding.check_id}`);

        const codeSnippet = finding.extra.lines;
        const suspiciousFlow = astAnalyzer.isFlowSuspicious(codeSnippet);

        if (!suspiciousFlow) {
          console.log(`[Server] Alerta ${i + 1} mitigado via AST.`);
          processedAlerts.push({
            type: 'SAST',
            finding,
            aiValidation: {
              status: 'False Positive',
              gravidade: 'Nenhuma',
              explicacao: 'Mitigado via AST (Sanitizador detectado).',
            },
          });
          continue;
        }

        console.log(`[Server] Solicitando auditoria da IA para Alerta ${i + 1}...`);
        const aiResult = await aiValidator.validateAlert(codeSnippet, finding.check_id, finding.extra.message);

        processedAlerts.push({
          type: 'SAST',
          finding,
          aiValidation: aiResult,
        });
      }

      console.log(`[Server] Executando SCA nas dependências...`);
      const scaOutcome = await scaScanner.scan(fullPath);
      scaOutcome.results.forEach((scaDetails) => {
        processedAlerts.push({ type: 'SCA', scaDetails });
      });

      if (scaOutcome.status === 'error') {
        console.warn('[Server] A análise de dependências (SCA) falhou — resultado pode estar incompleto.');
      }

      console.log(`[Server] Varredura completa enviada para o frontend.`);
      
      const scanId = crypto.randomUUID();
      const config = ConfigLoader.loadConfig();
      const historyEntry: ScanHistoryEntry = {
        id: scanId,
        timestamp: new Date().toISOString(),
        targetPath: fullPath,
        totalAlerts: processedAlerts.length,
        modelUsed: config.ai?.model || config.ollama?.model || 'llama3',
        scaStatus: scaOutcome.status
      };
      historyStorage.addEntry(historyEntry, processedAlerts);

      const actor = (req as any).user?.username || 'unknown';
      const actorRole = (req as any).user?.role || 'analyst';
      authService.logAudit(actor, actorRole, 'Execução de Scan', `Alvo: ${targetPath} | Alertas: ${processedAlerts.length}`, req.ip);

      res.json({ id: scanId, results: processedAlerts, scaStatus: scaOutcome.status });
    } catch (error: any) {
      console.error('Erro durante o scan:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/apply', requireRole('admin', 'analyst'), (req, res) => {
    const { filePath, startLine, endLine, correction } = req.body;

    if (!filePath || !startLine || !endLine || !correction) {
      return res.status(400).json({ error: 'Parâmetros incompletos.' });
    }

    let fullPath: string;
    try {
      fullPath = assertWithinRoot(process.cwd(), filePath);
    } catch (error) {
      if (error instanceof PathTraversalError) {
        console.error(`[Server] Tentativa de path traversal bloqueada: ${filePath}`);
        return res.status(403).json({ error: 'Caminho fora do diretório permitido.' });
      }
      throw error;
    }
    console.log(`[Server] Aplicando patch em: ${fullPath} (Linhas ${startLine}-${endLine})`);

    const success = Patcher.applyPatch(fullPath, startLine, endLine, correction);

    if (success) {
      const actor = (req as any).user?.username || 'unknown';
      const actorRole = (req as any).user?.role || 'analyst';
      authService.logAudit(actor, actorRole, 'Aplicação de Correção', `Arquivo: ${filePath}:${startLine}-${endLine}`, req.ip);
      res.json({ success: true, message: 'Correção aplicada com sucesso!' });
    } else {
      res.status(500).json({ error: 'Falha ao aplicar a correção.' });
    }
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada.' });
  });

  return app;
}
