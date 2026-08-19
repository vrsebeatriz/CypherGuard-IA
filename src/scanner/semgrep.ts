import { execFile } from 'child_process';
import { promisify } from 'util';
import { SemgrepResult } from '../types';
import { ConfigLoader } from '../config/loader';

const execFileAsync = promisify(execFile);

// 5 min: scans de diretórios grandes podem demorar, mas não podem pendurar o servidor.
const SEMGREP_TIMEOUT_MS = 5 * 60 * 1000;
// 10 MB de JSON de saída é mais que suficiente para um scan local.
const SEMGREP_MAX_BUFFER = 10 * 1024 * 1024;

export class SemgrepScanner {
  /**
   * Executa o semgrep no diretório alvo e retorna os resultados formatados em JSON.
   *
   * Usa execFile (sem shell) para que `targetPath` seja tratado como caminho
   * literal e nunca como código de shell.
   *
   * @param targetPath Caminho do diretório ou arquivo a ser analisado.
   * @returns Resultados parseados em JSON do Semgrep.
   */
  public async scan(targetPath: string): Promise<SemgrepResult> {
    const config = ConfigLoader.loadConfig();
    
    // Regras padrão mais abrangentes. 'auto' exige telemetria (conflita com --metrics=off).
    const rules = ['p/javascript', 'p/typescript', 'p/nodejs', 'p/security-audit'];
    
    const args = [
      'scan',
      ...rules.map((r) => `--config=${r}`),
      '--json',
      '--quiet',
      '--metrics=off',
      targetPath,
    ];
    
    try {
      const { stdout } = await execFileAsync('semgrep', args, {
        timeout: SEMGREP_TIMEOUT_MS,
        maxBuffer: SEMGREP_MAX_BUFFER,
      });
      
      if (!stdout) {
        throw new Error('No output from Semgrep');
      }

      return JSON.parse(stdout) as SemgrepResult;
    } catch (error: any) {
      // Semgrep pode sair com código 1 quando encontra achados, mas o stdout
      // ainda contém o JSON. Sem shell, o erro chega no objeto de execFile.
      if (error.killed) {
        throw new Error(`Semgrep execution timed out after ${SEMGREP_TIMEOUT_MS}ms`);
      }
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

  /**
   * Indica se o resultado do semgrep contém erros de execução/regra que
   * devem ser reportados ao usuário em vez de passarem em silêncio.
   */
  public hasScanErrors(result: SemgrepResult): boolean {
    return Array.isArray(result.errors) && result.errors.length > 0;
  }
}
