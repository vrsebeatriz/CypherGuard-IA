import { execFileSync } from 'child_process';

export class GitHelper {
  /**
   * Verifica se o diretório atual é um repositório Git.
   */
  public static isGitRepo(): boolean {
    try {
      execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
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
      const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
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
      return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch (e) {
      return 'unknown';
    }
  }

  /**
   * Lança se houver um repositório Git com alterações não commitadas. Usado
   * antes de --apply: a flag anuncia "requer git limpo", então precisa de
   * fato bloquear, não apenas avisar. Sem repositório Git, não há árvore de
   * trabalho para sujar — nada é bloqueado.
   */
  public static assertCleanForApply(): void {
    if (this.isGitRepo() && this.isDirty()) {
      throw new Error(
        '--apply requer um repositório Git limpo (sem alterações não commitadas). Faça commit ou stash antes de aplicar patches automaticamente.'
      );
    }
  }
}
