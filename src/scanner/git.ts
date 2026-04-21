import { execSync } from 'child_process';

export class GitHelper {
  /**
   * Verifica se o diretório atual é um repositório Git.
   */
  public static isGitRepo(): boolean {
    try {
      execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Verifica se há alterações não commitadas no repositório.
   */
  public static isDirty(): boolean {
    try {
      const status = execSync('git status --porcelain', { encoding: 'utf8' });
      return status.trim().length > 0;
    } catch (e) {
      return false;
    }
  }

  /**
   * Retorna o nome da branch atual.
   */
  public static getCurrentBranch(): string {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    } catch (e) {
      return 'unknown';
    }
  }
}
