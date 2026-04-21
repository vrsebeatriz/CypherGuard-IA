/**
 * Módulo de Análise Semântica via AST (Abstract Syntax Tree)
 * Utiliza o Acorn para converter código-fonte em AST e analisá-lo.
 */
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

export class ASTAnalyzer {
  /**
   * Realiza o parsing de um código fonte para AST.
   */
  public parse(code: string): acorn.Node | null {
    try {
      return acorn.parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true,
      });
    } catch (e) {
      // Snippet pode ser incompleto, falhando o parse strict
      return null;
    }
  }

  /**
   * Função de Taint Analysis simplificada.
   * Verifica na AST do snippet se há uma função de sanitização evidente.
   * Retorna true se fluxo parecer suspeito (Sem sanitizer), false se tiver proteção.
   */
  public isFlowSuspicious(codeSnippet: string): boolean {
    const ast = this.parse(codeSnippet);
    if (!ast) return true; // Se não conseguir fazer parse, considera suspeito por segurança

    let hasSanitizer = false;

    walk.simple(ast, {
      CallExpression(node: any) {
        if (node.callee && node.callee.type === 'Identifier') {
          const name = node.callee.name.toLowerCase();
          if (name.includes('sanitize') || name.includes('escape') || name === 'number') {
            hasSanitizer = true;
          }
        } else if (node.callee && node.callee.type === 'MemberExpression') {
          if (node.callee.property && node.callee.property.type === 'Identifier') {
            const propName = node.callee.property.name.toLowerCase();
            if (propName.includes('sanitize') || propName.includes('escape')) {
              hasSanitizer = true;
            }
          }
        }
      }
    });

    return !hasSanitizer; // É suspeito se NÃO tiver sanitizador
  }
}

