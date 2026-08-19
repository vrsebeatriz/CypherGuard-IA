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
