import * as fs from 'fs';

export class Patcher {
  /**
   * Aplica a correção sugerida no arquivo original.
   * @param filePath Caminho do arquivo
   * @param startLine Linha de início (1-indexed)
   * @param endLine Linha de fim (1-indexed)
   * @param fixedCode Código corrigido sugerido pela IA
   */
  public static applyPatch(filePath: string, startLine: number, endLine: number, fixedCode: string): boolean {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      // Precisamos ser cuidadosos com o mapeamento de linhas do Semgrep vs o arquivo
      // O Semgrep costuma ser preciso. Vamos substituir o bloco de linhas.
      
      const before = lines.slice(0, startLine - 1);
      const after = lines.slice(endLine);
      
      const newContent = [...before, fixedCode, ...after].join('\n');
      
      fs.writeFileSync(filePath, newContent, 'utf8');
      return true;
    } catch (e) {
      console.error(`[-] Falha ao aplicar patch em ${filePath}:`, e);
      return false;
    }
  }
}
