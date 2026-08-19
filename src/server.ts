import { createApp } from './app';

const port = Number(process.env.PORT) || 3000;
const app = createApp();

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
