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

  const fullPath = path.resolve(process.cwd(), targetPath);

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'Arquivo ou diretório não encontrado.' });
  }

  try {
    const semgrepResults = await semgrep.scan(fullPath);
    
    const processedAlerts = [];

    for (const finding of semgrepResults.results) {
      const codeSnippet = finding.extra.lines;
      const suspiciousFlow = astAnalyzer.isFlowSuspicious(codeSnippet);
      
      if (!suspiciousFlow) {
        processedAlerts.push({
          finding,
          aiValidation: { status: 'False Positive', gravidade: 'Nenhuma', explicacao: 'Mitigado via AST (Sanitizador detectado).' }
        });
        continue;
      }

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

  const success = Patcher.applyPatch(filePath, startLine, endLine, correction);

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

app.listen(port, () => {
  console.log(`\n🛡️ CypherGuard AI Local Interface rodando em http://localhost:${port}\n`);
});
