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

    const sanitizedVars = new Set<string>();
    let hasSuspiciousSink = false;
    let isMitigated = false;

    // Pass 1: identificar variáveis que receberam valor sanitizado
    walk.simple(ast, {
      VariableDeclarator(node: any) {
        if (node.init && node.init.type === 'CallExpression') {
          const calleeName = node.init.callee.name?.toLowerCase() || node.init.callee.property?.name?.toLowerCase() || '';
          if (calleeName.includes('sanitize') || calleeName.includes('escape') || calleeName === 'number') {
            if (node.id && node.id.type === 'Identifier') {
              sanitizedVars.add(node.id.name);
            }
          }
        }
      },
      AssignmentExpression(node: any) {
        if (node.right.type === 'CallExpression') {
          const calleeName = node.right.callee.name?.toLowerCase() || node.right.callee.property?.name?.toLowerCase() || '';
          if (calleeName.includes('sanitize') || calleeName.includes('escape') || calleeName === 'number') {
            if (node.left.type === 'Identifier') {
              sanitizedVars.add(node.left.name);
            }
          }
        }
      }
    });

    // Pass 2: procurar chamadas perigosas e validar os argumentos
    walk.simple(ast, {
      CallExpression(node: any) {
        const calleeName = node.callee.name?.toLowerCase() || node.callee.property?.name?.toLowerCase() || '';
        const isSink = ['exec', 'eval', 'query', 'run'].includes(calleeName);
        
        if (isSink) {
          hasSuspiciousSink = true;
          let allArgsSafe = true;

          if (node.arguments && node.arguments.length > 0) {
            for (const arg of node.arguments) {
              if (arg.type === 'Identifier') {
                if (!sanitizedVars.has(arg.name)) allArgsSafe = false;
              } else if (arg.type === 'BinaryExpression') {
                walk.simple(arg, {
                  Identifier(innerNode: any) {
                    if (!sanitizedVars.has(innerNode.name)) allArgsSafe = false;
                  }
                });
              } else if (arg.type === 'TemplateLiteral') {
                for (const exp of arg.expressions) {
                  walk.simple(exp, {
                    Identifier(innerNode: any) {
                      if (!sanitizedVars.has(innerNode.name)) allArgsSafe = false;
                    }
                  });
                }
              } else if (arg.type !== 'Literal') {
                allArgsSafe = false;
              }
            }
          } else {
            allArgsSafe = false;
          }

          if (allArgsSafe) {
            isMitigated = true;
          }
        }
      }
    });

    if (!hasSuspiciousSink) {
      return sanitizedVars.size === 0;
    }

    return !isMitigated;
  }
}

