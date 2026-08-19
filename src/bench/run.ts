import * as fs from 'fs';
import * as path from 'path';
import { OllamaValidator } from '../ai/ollama';

interface BenchmarkSample {
  id: string;
  check_id: string;
  message: string;
  code: string;
  expected: 'True Positive' | 'False Positive';
}

function loadSamples(): BenchmarkSample[] {
  const raw = fs.readFileSync(path.join(__dirname, 'data', 'samples.json'), 'utf8');
  return JSON.parse(raw) as BenchmarkSample[];
}

async function main() {
  const samples = loadSamples();
  console.log(`[Bench] ${samples.length} amostras carregadas. Requer Ollama local rodando com o modelo configurado.\n`);

  const validator = new OllamaValidator();
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;

  for (const sample of samples) {
    const result = await validator.validateAlert(sample.code, sample.check_id, sample.message);
    const actual = result.status === 'True Positive';
    const expected = sample.expected === 'True Positive';
    const correct = actual === expected;

    if (correct && expected) tp++;
    else if (correct && !expected) tn++;
    else if (!correct && expected) fn++;
    else fp++;

    const mark = correct ? 'PASS' : 'FAIL';
    console.log(
      `[${mark}] ${sample.id} — esperado ${sample.expected}, obtido ${result.status} (${result.explicacao})`
    );
  }

  const total = samples.length;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const accuracy = total > 0 ? (tp + tn) / total : 0;

  console.log('\n--- Relatório ---');
  console.log(`Acurácia: ${(accuracy * 100).toFixed(1)}%`);
  console.log(`Precisão: ${(precision * 100).toFixed(1)}%`);
  console.log(`Revocação: ${(recall * 100).toFixed(1)}%`);
  console.log(`TP=${tp} TN=${tn} FP=${fp} FN=${fn}`);

  // Gate de qualidade: falha se acurácia < 80%.
  if (accuracy >= 0.8) {
    console.log('\n[Bench] OK — acurácia dentro do esperado.');
    process.exit(0);
  } else {
    console.log('\n[Bench] ABAIXO DO LIMITE — revisar prompts/modelo.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[Bench] Falha na execução:', error);
  process.exit(1);
});