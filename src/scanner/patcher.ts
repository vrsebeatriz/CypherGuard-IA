import * as fs from 'fs';
import * as path from 'path';
import * as acorn from 'acorn';

const ALLOWED_EXTENSIONS = new Set(['.js', '.ts', '.jsx', '.tsx', '.json', '.cjs', '.mjs']);

/**
 * Valida sintaticamente o conteúdo final do arquivo antes de gravar.
 * - .json  → JSON.parse
 * - .js/.cjs/.mjs → Acorn
 * - .ts/.tsx/.jsx → skip (Acorn sem plugins não cobre TS/JSX; a segurança
 *   fica com backup + diff, conforme risco documentado no plano).
 */
function isSyntaxValid(filePath: string, content: string): boolean {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.json') {
    try {
      JSON.parse(content);
      return true;
    } catch {
      return false;
    }
  }

  if (ext === '.ts' || ext === '.tsx' || ext === '.jsx') {
    return true;
  }

  try {
    acorn.parse(content, { ecmaVersion: 'latest', sourceType: 'module' });
    return true;
  } catch {
    return false;
  }
}

export class Patcher {
  /**
   * Aplica a correção sugerida no arquivo original, de forma segura:
   * valida a extensão, o intervalo de linhas e a sintaxe do resultado;
   * cria backup `.bak`; grava via arquivo temporário + rename atômico
   * no mesmo diretório (evita EXDEV).
   *
   * @param filePath Caminho do arquivo
   * @param startLine Linha de início (1-indexed)
   * @param endLine Linha de fim (1-indexed)
   * @param fixedCode Código corrigido sugerido pela IA
   */
  public static applyPatch(filePath: string, startLine: number, endLine: number, fixedCode: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      console.warn(`[Patcher] Extensão "${ext}" não é permitida para patches.`);
      return false;
    }

    const backupPath = `${filePath}.bak`;
    const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.cypherguard.tmp`);

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const isCrlf = content.includes('\r\n');
      const separator = isCrlf ? '\r\n' : '\n';
      const lines = content.split(separator);

      if (startLine < 1 || startLine > lines.length) {
        throw new Error(`Linha de início ${startLine} fora do alcance (Total: ${lines.length})`);
      }

      if (endLine < startLine || endLine > lines.length) {
        throw new Error(`Intervalo de linhas inválido: ${startLine}-${endLine} (Total: ${lines.length})`);
      }

      const before = lines.slice(0, startLine - 1);
      const after = lines.slice(endLine);

      const newContent = [...before, fixedCode, ...after].join(separator);

      if (!isSyntaxValid(filePath, newContent)) {
        console.error('[Patcher] Conteúdo corrigido inválido sintaticamente — patch rejeitado.');
        return false;
      }

      // Backup do estado original antes de qualquer escrita.
      fs.copyFileSync(filePath, backupPath);

      // Escrita atômica: temp no mesmo diretório + rename.
      fs.writeFileSync(tmpPath, newContent, 'utf8');
      fs.renameSync(tmpPath, filePath);

      console.log(`[Patcher] Sucesso ao aplicar patch em ${filePath} (backup: ${backupPath})`);
      return true;
    } catch (e: any) {
      if (fs.existsSync(tmpPath)) {
        try {
          fs.unlinkSync(tmpPath);
        } catch {
          /* melhor esforço */
        }
      }
      console.error(`[Patcher] Erro ao aplicar patch em ${filePath}:`, e.message);
      return false;
    }
  }

  /**
   * Gera o diff (antes/depois) do patch, sem gravar nada no disco.
   * Retorna null se o arquivo ou intervalo forem inválidos.
   */
  public static preview(
    filePath: string,
    startLine: number,
    endLine: number,
    fixedCode: string
  ): { before: string; after: string } | null {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const separator = content.includes('\r\n') ? '\r\n' : '\n';
      const lines = content.split(separator);

      if (startLine < 1 || startLine > lines.length || endLine < startLine || endLine > lines.length) {
        return null;
      }

      return {
        before: lines.slice(startLine - 1, endLine).join(separator),
        after: fixedCode,
      };
    } catch {
      return null;
    }
  }
}