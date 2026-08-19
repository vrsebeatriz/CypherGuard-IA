/**
 * Módulo de Análise Semântica via AST (Abstract Syntax Tree)
 * Utiliza o Acorn para converter código-fonte em AST e rastrear, de forma leve,
 * se um dado originado de req.* chega a um sink sem passar por um sanitizador.
 */
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const SANITIZER_PATTERN = /sanitize|escape/i;

function calleeName(node: any): string | null {
  if (!node.callee) return null;
  if (node.callee.type === 'Identifier') return node.callee.name;
  if (node.callee.type === 'MemberExpression' && node.callee.property?.type === 'Identifier') {
    return node.callee.property.name;
  }
  return null;
}

function isSanitizerCall(node: any): boolean {
  const name = calleeName(node);
  if (!name) return false;
  return SANITIZER_PATTERN.test(name) || name === 'Number';
}

/** Detecta cadeias como req.query.x, req.params.id, req.body.data, request.query.x */
function isRequestSourceExpression(node: any): boolean {
  let current = node;
  while (current && current.type === 'MemberExpression') {
    current = current.object;
  }
  return !!current && current.type === 'Identifier' && /^req(uest)?$/i.test(current.name);
}

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
   * Coleta identificadores cujo valor se origina de uma entrada de requisição
   * (req.query, req.params, req.body, ...), incluindo uma propagação simples
   * de alias (const b = a, quando "a" já é tainted).
   */
  private collectTaintedIdentifiers(ast: acorn.Node): Set<string> {
    const tainted = new Set<string>();
    const aliasQueue: Array<{ name: string; sourceName: string }> = [];

    const visitAssignment = (id: any, valueNode: any) => {
      if (!id || id.type !== 'Identifier' || !valueNode) return;

      if (isRequestSourceExpression(valueNode)) {
        tainted.add(id.name);
      } else if (valueNode.type === 'Identifier') {
        aliasQueue.push({ name: id.name, sourceName: valueNode.name });
      }
    };

    walk.simple(ast, {
      VariableDeclarator(node: any) {
        visitAssignment(node.id, node.init);
      },
      AssignmentExpression(node: any) {
        visitAssignment(node.left, node.right);
      },
    });

    // Propagação de alias até o ponto fixo (const b = a; const c = b; ...)
    let changed = true;
    while (changed) {
      changed = false;
      for (const alias of aliasQueue) {
        if (!tainted.has(alias.name) && tainted.has(alias.sourceName)) {
          tainted.add(alias.name);
          changed = true;
        }
      }
    }

    return tainted;
  }

  /**
   * Verifica se algum identificador tainted é efetivamente passado como
   * argumento para uma chamada de sanitização em qualquer ponto do trecho.
   */
  private isTaintSanitized(ast: acorn.Node, taintedName: string): boolean {
    let sanitized = false;

    walk.simple(ast, {
      CallExpression(node: any) {
        if (!isSanitizerCall(node)) return;
        const usesTainted = node.arguments.some(
          (arg: any) => arg.type === 'Identifier' && arg.name === taintedName
        );
        if (usesTainted) sanitized = true;
      },
    });

    return sanitized;
  }

  /**
   * Retorna true se o fluxo parecer suspeito (dado tainted sem sanitização
   * comprovada), false se todo dado rastreável até req.* passar por um
   * sanitizador antes de ser usado.
   *
   * Importante: a checagem de sanitização é por identificador tainted, não
   * por "existe alguma chamada de sanitize() neste snippet" — um sanitize()
   * aplicado a uma variável não relacionada nunca mascara o alerta.
   */
  public isFlowSuspicious(codeSnippet: string): boolean {
    const ast = this.parse(codeSnippet);
    if (!ast) return true;

    const tainted = this.collectTaintedIdentifiers(ast);

    if (tainted.size === 0) {
      // Não foi possível identificar a origem do dado nesta amostra —
      // mantém o comportamento fail-safe: trata como suspeito.
      return true;
    }

    for (const name of tainted) {
      if (!this.isTaintSanitized(ast, name)) {
        return true;
      }
    }

    return false;
  }
}
