import { exec } from 'child_process';
import { promisify } from 'util';
import { SemgrepResult } from '../types';
import { ConfigLoader } from '../config/loader';

const execAsync = promisify(exec);

export class SemgrepScanner {
  /**
   * Executa o semgrep no diretório alvo e retorna os resultados formatados em JSON.
   * @param targetPath Caminho do diretório ou arquivo a ser analisado.
   * @returns Resultados parseados em JSON do Semgrep.
   */
  public async scan(targetPath: string): Promise<SemgrepResult> {
    const config = ConfigLoader.loadConfig();
    
    // Regras padrão mais abrangentes
    let rules = ['p/javascript', 'p/typescript', 'p/nodejs', 'p/security-audit', 'p/sql-injection'];
    
    // Se houver regras customizadas no YAML (opcionalmente poderíamos adicionar suporte a isso)
    // Por enquanto, vamos apenas garantir que o comando seja robusto.

    const configArgs = rules.map(r => `--config=${r}`).join(' ');
    
    try {
      const command = `semgrep scan ${configArgs} --json "${targetPath}"`;
      
      const { stdout, stderr } = await execAsync(command);
      
      if (!stdout) {
        throw new Error('No output from Semgrep');
      }

      return JSON.parse(stdout) as SemgrepResult;
    } catch (error: any) {
      // Semgrep can exit with code 1 if findings are discovered, 
      // but stdout might still contain the JSON result.
      if (error.stdout) {
        try {
          return JSON.parse(error.stdout) as SemgrepResult;
        } catch (parseError) {
          throw new Error(`Failed to parse Semgrep output: ${parseError}`);
        }
      }
      throw new Error(`Semgrep execution failed: ${error.message}`);
    }
  }
}
