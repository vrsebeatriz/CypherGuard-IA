/**
 * Módulo de cálculo da Entropia de Shannon
 * Utilizado para identificar strings com alta aleatoriedade (cifras, hashes, chaves criptográficas).
 */

export class EntropyAnalyzer {
  /**
   * Calcula a Entropia de Shannon para uma dada string.
   * Valores altos (> 4.5 ou 5.0 dependendo do contexto) podem indicar ofuscação ou chaves.
   */
  public static calculateShannonEntropy(str: string): number {
    if (!str || str.length === 0) return 0;

    const charCounts = new Map<string, number>();
    for (const char of str) {
      charCounts.set(char, (charCounts.get(char) || 0) + 1);
    }

    let entropy = 0;
    const len = str.length;

    for (const count of charCounts.values()) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }

    return entropy;
  }

  /**
   * Verifica se a string tem uma entropia acima do limiar suspeito.
   */
  public static isSuspiciouslyHigh(str: string, threshold: number = 4.5): boolean {
    return this.calculateShannonEntropy(str) > threshold;
  }
}
