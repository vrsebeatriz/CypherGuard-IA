import express from 'express';
import crypto from 'crypto';
import { assertWithinRoot, PathTraversalError } from './security/pathGuard';
import path from 'path';
import fs from 'fs';
import { SemgrepScanner } from './scanner/semgrep';
import { ASTAnalyzer } from './analyzer/ast';
import { OllamaValidator } from './ai/ollama';
import { Patcher } from './scanner/patcher';
import { SCAScanner } from './scanner/sca';
import { UnifiedAlert } from './types';

export interface CreateAppOptions {
  sessionToken?: string;
  rateLimit?: { windowMs: number; max: number };
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

export function createApp(options: CreateAppOptions = {}) {
  const app = express();

  const sessionToken = options.sessionToken ?? crypto.randomBytes(24).toString('hex');

  function requireSessionToken(req: express.Request, res: express.Response, next: express.NextFunction) {
    const provided = req.header('X-CypherGuard-Token');
    if (provided !== sessionToken) {
      return res.status(401).json({ error: 'Token de sessão inválido ou ausente.' });
    }
    next();
  }

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
  app.use(express.static(path.join(__dirname, '../public')));
  app.use('/api', rateLimiter);

  const semgrep = new SemgrepScanner();
  const astAnalyzer = new ASTAnalyzer();
  const aiValidator = new OllamaValidator();
  const scaScanner = new SCAScanner();

  app.post('/api/scan', requireSessionToken, async (req, res) => {
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

        console.log(`[Server] Solicitando auditoria Llama 3 para Alerta ${i + 1}...`);
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
      res.json({ results: processedAlerts, scaStatus: scaOutcome.status });
    } catch (error: any) {
      console.error('Erro durante o scan:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/apply', requireSessionToken, (req, res) => {
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
