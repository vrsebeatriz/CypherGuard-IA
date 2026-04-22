import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { SemgrepScanner } from './scanner/semgrep';
import { ASTAnalyzer } from './analyzer/ast';
import { OllamaValidator } from './ai/ollama';
import { Patcher } from './scanner/patcher';

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Serve os arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, '../public')));

const semgrep = new SemgrepScanner();
const astAnalyzer = new ASTAnalyzer();
const aiValidator = new OllamaValidator();

// Rota para iniciar um scan
app.post('/api/scan', async (req, res) => {
  const { targetPath } = req.body;

  if (!targetPath) {
    return res.status(400).json({ error: 'targetPath is required' });
  }

  console.log(`[Server] Recebida requisição de scan para: ${targetPath}`);
  const fullPath = path.resolve(process.cwd(), targetPath);

  if (!fs.existsSync(fullPath)) {
    console.error(`[Server] Caminho não encontrado: ${fullPath}`);
    return res.status(404).json({ error: 'Arquivo ou diretório não encontrado.' });
  }

  try {
    console.log(`[Server] Executando Semgrep (Camada 1)...`);
    const semgrepResults = await semgrep.scan(fullPath);
    
    console.log(`[Server] Semgrep finalizado. Iniciando validação paralela de ${semgrepResults.results.length} alertas...`);
    
    const processedAlerts = [];
    
    for (let i = 0; i < semgrepResults.results.length; i++) {
      const finding = semgrepResults.results[i];
      console.log(`[Server] Analisando Alerta ${i + 1}/${semgrepResults.results.length}: ${finding.check_id}`);
      
      const codeSnippet = finding.extra.lines;
      const suspiciousFlow = astAnalyzer.isFlowSuspicious(codeSnippet);
      
      if (!suspiciousFlow) {
        console.log(`[Server] Alerta ${i + 1} mitigado via AST.`);
        processedAlerts.push({
          finding,
          aiValidation: { status: 'False Positive', gravidade: 'Nenhuma', explicacao: 'Mitigado via AST (Sanitizador detectado).' }
        });
        continue;
      }

      console.log(`[Server] Solicitando auditoria Llama 3 para Alerta ${i + 1}...`);
      const aiResult = await aiValidator.validateAlert(
        codeSnippet,
        finding.check_id,
        finding.extra.message
      );

      processedAlerts.push({
        finding,
        aiValidation: aiResult
      });
    }

    console.log(`[Server] Varredura completa enviada para o frontend.`);
    res.json({ results: processedAlerts });

  } catch (error: any) {
    console.error('Erro durante o scan:', error);
    res.status(500).json({ error: error.message });
  }
});

// Rota para aplicar uma correção
app.post('/api/apply', (req, res) => {
  const { filePath, startLine, endLine, correction } = req.body;

  if (!filePath || !startLine || !endLine || !correction) {
    return res.status(400).json({ error: 'Parâmetros incompletos.' });
  }

  const fullPath = path.resolve(process.cwd(), filePath);
  console.log(`[Server] Aplicando patch em: ${fullPath} (Linhas ${startLine}-${endLine})`);
  
  const success = Patcher.applyPatch(fullPath, startLine, endLine, correction);

  if (success) {
    res.json({ success: true, message: 'Correção aplicada com sucesso!' });
  } else {
    res.status(500).json({ error: 'Falha ao aplicar a correção.' });
  }
});

// Rota principal (serve o index.html para qualquer outra rota)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

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
