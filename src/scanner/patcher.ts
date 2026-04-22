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
      const isCrlf = content.includes('\r\n');
      const separator = isCrlf ? '\r\n' : '\n';
      const lines = content.split(separator);

      if (startLine > lines.length || startLine < 1) {
        throw new Error(`Linha de início ${startLine} fora do alcance (Total: ${lines.length})`);
      }

      const before = lines.slice(0, startLine - 1);
      const after = lines.slice(endLine);
      
      const newContent = [...before, fixedCode, ...after].join(separator);
      
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`[Patcher] Sucesso ao aplicar patch em ${filePath}`);
      return true;
    } catch (e: any) {
      console.error(`[Patcher] Erro ao aplicar patch em ${filePath}:`, e.message);
      return false;
    }
  }
}
