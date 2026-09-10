import 'dotenv/config';
import { createApp } from './app';
import { OllamaManager } from './utils/ollamaManager';
import { ConfigLoader } from './config/loader';

const port = Number(process.env.PORT) || 3000;
const app = createApp();

async function startServer() {
  const config = ConfigLoader.loadConfig();
  const provider = config.ai?.provider || 'ollama';

  // Garante que o motor Ollama local esteja rodando apenas quando o provider configurado for ollama
  if (provider === 'ollama') {
    await OllamaManager.ensureRunning();
  }

  const server = app.listen(port, () => {
    console.log(`\n🛡️ CypherGuard AI Local Interface rodando em http://localhost:${port}\n`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[Erro Crítico] A porta ${port} já está sendo usada por outro processo.`);
      console.error(`Por favor, feche outros terminais ou processos do Node e tente novamente.\n`);
    } else {
      console.error(`\n[Erro Crítico] Falha ao iniciar o servidor:`, err.message);
    }
    process.exit(1);
  });

  // Handle graceful shutdown
  const shutdown = () => {
    console.log('\n[CypherGuard] Recebido sinal de encerramento. Fechando servidor...');
    server.close(() => {
      OllamaManager.killOllama(true);
      process.exit(0);
    });
    // Fallback in case connections are lingering
    setTimeout(() => {
      OllamaManager.killOllama(true);
      process.exit(0);
    }, 3000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGHUP', shutdown);
}

startServer();

// removed empty listener since error handling is now inside startServer
