import * as fs from 'fs';
import * as path from 'path';
import * as acorn from 'acorn';
import { AIValidator } from '../ai/validator';
import { ASTAnalyzer } from '../analyzer/ast';

/**
 * Benchmark da validação semântica (Camada 3) e do pipeline Camada 2 + Camada 3.
 *
 * Uso:
 *   npm run bench                         # modelo do cypherguard.yml
 *   npm run bench -- --model qwen2.5:7b   # outro modelo (só em memória, não grava o yml)
 *   npm run bench -- --out resultado.json # grava o relatório completo em JSON
 *
 * Métricas: acurácia, precisão, recall, taxa de falsos positivos (FPR),
 * validade sintática dos patches (mesma checagem com Acorn do patcher.ts)
 * e tempo médio por alerta. Falhas de conexão com o Ollama abortam a execução:
 * erro de infraestrutura nunca é contabilizado como veredito.
 */

interface BenchmarkSample {
  id: string;
  check_id: string;
  message: string;
  code: string;
  expected: 'True Positive' | 'False Positive';
}

interface Confusion { tp: number; tn: number; fp: number; fn: number }

function loadSamples(): BenchmarkSample[] {
  const raw = fs.readFileSync(path.join(__dirname, 'data', 'samples.json'), 'utf8');
  return JSON.parse(raw) as BenchmarkSample[];
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function isSyntaxValid(code: string): boolean {
  try {
    acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
    return true;
  } catch {
    return false;
  }
}

function metrics(c: Confusion, n: number) {
  return {
    ...c,
    accuracy: (c.tp + c.tn) / n,
    precision: c.tp + c.fp > 0 ? c.tp / (c.tp + c.fp) : null,
    recall: c.tp + c.fn > 0 ? c.tp / (c.tp + c.fn) : null,
    fpr: c.fp + c.tn > 0 ? c.fp / (c.fp + c.tn) : null,
  };
}

function count(c: Confusion, predicted: boolean, expected: boolean) {
  if (predicted && expected) c.tp++;
  else if (!predicted && !expected) c.tn++;
  else if (predicted && !expected) c.fp++;
  else c.fn++;
}

const pct = (v: number | null) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);

async function main() {
  const samples = loadSamples();
  const model = argValue('--model');
  const out = argValue('--out');

  const validator = new AIValidator();
  if (model) validator.useModelInMemory(model);
  const astAnalyzer = new ASTAnalyzer();

  console.log(`[Bench] ${samples.length} amostras. Modelo: ${validator.getModelName()}\n`);

  const onlyAI: Confusion = { tp: 0, tn: 0, fp: 0, fn: 0 };
  const pipeline: Confusion = { tp: 0, tn: 0, fp: 0, fn: 0 };
  const rows: any[] = [];
  let totalMs = 0;
  let patches = 0;
  let validPatches = 0;

  for (const sample of samples) {
    const expected = sample.expected === 'True Positive';

    // Camada 2 (determinística): se o fluxo não é suspeito, o alerta é descartado antes da IA.
    const l2Suspicious = astAnalyzer.isFlowSuspicious(sample.code);

    const t0 = Date.now();
    const result = await validator.validateAlert(sample.code, sample.check_id, sample.message);
    const ms = Date.now() - t0;
    totalMs += ms;

    if (result.status === 'Unknown' && /fetch failed|ECONNREFUSED|ECONNRESET|socket/i.test(result.explicacao)) {
      console.error(`\n[Bench] ABORTADO em ${sample.id}: falha de conexão com o Ollama. Nenhum resultado foi gravado.`);
      process.exit(3);
    }

    const aiSaysVuln = result.status === 'True Positive';
    count(onlyAI, aiSaysVuln, expected);
    count(pipeline, l2Suspicious && aiSaysVuln, expected);

    let patchValid: boolean | null = null;
    if (result.correcao) {
      patches++;
      patchValid = isSyntaxValid(result.correcao);
      if (patchValid) validPatches++;
    }

    rows.push({ id: sample.id, expected: sample.expected, ai: result.status, l2Suspicious, ms, patchValid, result });
    const mark = aiSaysVuln === expected ? 'PASS' : 'FAIL';
    console.log(`[${mark}] ${sample.id} — esperado ${sample.expected}, IA ${result.status}, Camada 2 ${l2Suspicious ? 'suspeito' : 'mitigado'} (${(ms / 1000).toFixed(1)}s)`);
  }

  const n = samples.length;
  const report = {
    model: validator.getModelName(),
    n,
    date: new Date().toISOString(),
    onlyAI: metrics(onlyAI, n),
    pipelineL2L3: metrics(pipeline, n),
    patches: { generated: patches, syntaxValid: validPatches },
    meanSecondsPerAlert: totalMs / n / 1000,
    rows,
  };

  console.log('\n--- Relatório ---');
  const summaries: Array<[string, ReturnType<typeof metrics>]> = [
    ['Só IA (Camada 3)', report.onlyAI],
    ['Camada 2 + Camada 3', report.pipelineL2L3],
  ];
  for (const [label, m] of summaries) {
    console.log(`${label}: acurácia ${pct(m.accuracy)} | precisão ${pct(m.precision)} | recall ${pct(m.recall)} | FPR ${pct(m.fpr)} | TP=${m.tp} TN=${m.tn} FP=${m.fp} FN=${m.fn}`);
  }
  console.log(`Patches sintaticamente válidos: ${validPatches}/${patches}`);
  console.log(`Tempo médio por alerta: ${report.meanSecondsPerAlert.toFixed(1)}s`);

  if (out) {
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(`\n[Bench] Relatório completo gravado em ${out}`);
  }
}

main().catch((error) => {
  console.error('[Bench] Falha na execução:', error);
  process.exit(1);
});
