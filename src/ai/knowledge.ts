import * as fs from 'fs';
import * as path from 'path';

export class KnowledgeBase {
  /**
   * Carrega diretrizes de segurança de um arquivo local.
   */
  public static getSecurityGuidelines(): string {
    const guidelinesPath = path.join(process.cwd(), 'security-guidelines.md');
    
    if (!fs.existsSync(guidelinesPath)) {
      // Diretrizes padrão se o arquivo não existir
      return `
      - Sempre use queries parametrizadas para evitar SQL Injection.
      - Evite usar 'eval()' ou 'new Function()' com entrada de usuário.
      - Não armazene segredos (chaves, tokens) diretamente no código; use variáveis de ambiente.
      - Use funções de escape/sanitização aprovadas (ex: DOMPurify para HTML).
      `;
    }

    try {
      return fs.readFileSync(guidelinesPath, 'utf8');
    } catch (e) {
      return '';
    }
  }
}
