import { EntropyAnalyzer } from './entropy';

describe('EntropyAnalyzer.calculateShannonEntropy', () => {
  it('retorna 0 para string vazia', () => {
    expect(EntropyAnalyzer.calculateShannonEntropy('')).toBe(0);
  });

  it('retorna 0 para uma string de um único caractere repetido', () => {
    expect(EntropyAnalyzer.calculateShannonEntropy('aaaaaaaa')).toBe(0);
  });

  it('retorna ~4.58 bits para 24 caracteres distintos (distribuição uniforme)', () => {
    const entropy = EntropyAnalyzer.calculateShannonEntropy('aB3$eF7!hK9@nQ2#tW5&yZ8*');
    expect(entropy).toBeCloseTo(4.585, 2);
  });
});

describe('EntropyAnalyzer.isSuspiciouslyHigh', () => {
  it('marca uma chave de alta entropia como suspeita (acima do limiar padrão 4.5)', () => {
    expect(EntropyAnalyzer.isSuspiciouslyHigh('aB3$eF7!hK9@nQ2#tW5&yZ8*')).toBe(true);
  });

  it('não marca um valor mock de baixa entropia como suspeito', () => {
    expect(EntropyAnalyzer.isSuspiciouslyHigh('mock-secret-123')).toBe(false);
  });

  it('respeita um limiar customizado', () => {
    expect(EntropyAnalyzer.isSuspiciouslyHigh('ab', 0)).toBe(true);
  });
});

describe('EntropyAnalyzer.findSuspiciousStrings', () => {
  it('detecta um segredo de alta entropia entre literais do código', () => {
    const code = `const key = "aB3$eF7!hK9@nQ2#tW5&yZ8*"; const label = "user";`;
    const found = EntropyAnalyzer.findSuspiciousStrings(code);
    expect(found).toContain('aB3$eF7!hK9@nQ2#tW5&yZ8*');
    expect(found).not.toContain('user');
  });

  it('ignora valores mock de baixa entropia', () => {
    const code = `const apiKey = "test-key-123"; const host = "localhost";`;
    expect(EntropyAnalyzer.findSuspiciousStrings(code)).toEqual([]);
  });

  it('respeita o limiar configurado', () => {
    const code = `const secret = "abc123XYZ";`;
    expect(EntropyAnalyzer.findSuspiciousStrings(code, 4.5)).toEqual([]);
    expect(EntropyAnalyzer.findSuspiciousStrings(code, 0)).toContain('abc123XYZ');
  });

  it('analisa literais individualmente, não o snippet inteiro', () => {
    const code = `const a = "aaaaaaaa"; const b = "bbbbbbbb"; const secret = "aB3$eF7!hK9@nQ2#tW5&yZ8*";`;
    const found = EntropyAnalyzer.findSuspiciousStrings(code);
    // Apenas o literal de alta entropia é sinalizado; os de baixa entropia nunca.
    expect(found).toEqual(['aB3$eF7!hK9@nQ2#tW5&yZ8*']);
    expect(found).not.toContain('aaaaaaaa');
    expect(found).not.toContain('bbbbbbbb');
  });
});
