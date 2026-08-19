import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SarifGenerator } from './sarif';
import { SemgrepMatch, AIValidationResult } from '../types';

function makeFinding(overrides: Partial<SemgrepMatch> = {}): SemgrepMatch {
  return {
    check_id: 'javascript.lang.security.audit.command-injection',
    path: 'test/more_vulnerabilities.js',
    start: { line: 12, col: 3, offset: 0 },
    end: { line: 14, col: 5, offset: 0 },
    extra: {
      message: 'Possível command injection',
      metadata: {},
      severity: 'ERROR',
      lines: 'exec("ping -c 1 " + host, ...)',
    },
    ...overrides,
  };
}

function makeVerdict(overrides: Partial<AIValidationResult> = {}): AIValidationResult {
  return {
    status: 'True Positive',
    gravidade: 'Alta',
    explicacao: 'Entrada do usuário concatenada diretamente no exec().',
    correcao: 'const safeHost = sanitize(host);',
    ...overrides,
  };
}

describe('SarifGenerator', () => {
  it('produz um log SARIF 2.1.0 com o driver correto', () => {
    const gen = new SarifGenerator();
    const log = gen.getLog();
    expect(log.version).toBe('2.1.0');
    expect(log.runs[0].tool.driver.name).toBe('CypherGuard AI');
  });

  it('adiciona uma regra única por check_id, mesmo com múltiplos resultados da mesma regra', () => {
    const gen = new SarifGenerator();
    gen.addResult(makeFinding(), makeVerdict());
    gen.addResult(
      makeFinding({ start: { line: 20, col: 1, offset: 0 }, end: { line: 22, col: 1, offset: 0 } }),
      makeVerdict()
    );

    const log = gen.getLog();
    expect(log.runs[0].tool.driver.rules).toHaveLength(1);
    expect(log.runs[0].results).toHaveLength(2);
  });

  it('mapeia gravidade Alta para level "error" e Baixa para "note"', () => {
    const gen = new SarifGenerator();
    gen.addResult(makeFinding(), makeVerdict({ gravidade: 'Alta' }));
    gen.addResult(makeFinding({ check_id: 'other-rule' }), makeVerdict({ gravidade: 'Baixa' }));

    const log = gen.getLog();
    expect(log.runs[0].results[0].level).toBe('error');
    expect(log.runs[0].results[1].level).toBe('note');
  });

  it('grava um arquivo JSON válido em disco', () => {
    const gen = new SarifGenerator();
    gen.addResult(makeFinding(), makeVerdict());

    const outPath = path.join(os.tmpdir(), `cypherguard-sarif-test-${Date.now()}.sarif`);
    gen.save(outPath);

    const written = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
    expect(written.runs[0].results).toHaveLength(1);
    fs.unlinkSync(outPath);
  });
});
