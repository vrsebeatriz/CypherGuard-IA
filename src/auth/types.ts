export type UserRole = 'admin' | 'analyst' | 'auditor';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  passwordHash: string;
  salt: string;
  createdAt: string;
  lastLogin?: string;
}

export interface UserPublic {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  createdAt: string;
  lastLogin?: string;
}

export interface Session {
  token: string;
  userId: string;
  username: string;
  name: string;
  role: UserRole;
  createdAt: number;
  expiresAt: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  username: string;
  role: UserRole | 'system';
  action: string;
  details?: string;
  ip?: string;
}
