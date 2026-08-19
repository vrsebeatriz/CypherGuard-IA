import * as path from 'path';
import * as fs from 'fs';

export class PathTraversalError extends Error {
  constructor(public readonly attemptedPath: string, public readonly root: string) {
    super(`Caminho "${attemptedPath}" está fora do diretório permitido "${root}".`);
    this.name = 'PathTraversalError';
  }
}

/**
 * Resolve o caminho real (sem symlinks) de `p`. Se `p` (ou parte dele) ainda
 * não existir, sobe até o ancestral existente mais próximo, resolve-o e
 * reanexa os segmentos restantes — preservando o caminho lexical sem quebrar
 * a checagem para alvos futuros (ex.: arquivo ainda não criado).
 */
function canonicalize(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    const missing: string[] = [];
    let current = p;
    while (true) {
      try {
        return path.join(fs.realpathSync(current), ...missing.reverse());
      } catch {
        missing.push(path.basename(current));
        const parent = path.dirname(current);
        if (parent === current) return p;
        current = parent;
      }
    }
  }
}

/**
 * Resolve `targetPath` relativo a `root` e garante que o resultado não escapa da raiz.
 * Lança PathTraversalError se o caminho resolvido ficar fora dela.
 *
 * A checagem usa caminhos canônicos (realpath) para impedir que um symlink
 * dentro da raiz aponte para fora dela. Quando o alvo existe, retorna o
 * caminho real; quando não existe, retorna o caminho lexical resolvido.
 */
export function assertWithinRoot(root: string, targetPath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(resolvedRoot, targetPath);

  const canonicalRoot = canonicalize(resolvedRoot);
  const canonicalTarget = canonicalize(resolvedTarget);

  const isSamePath = canonicalTarget === canonicalRoot;
  // path.sep no final evita que "/root-evil" passe no startsWith de "/root"
  const isInsideRoot = canonicalTarget.startsWith(canonicalRoot + path.sep);

  if (!isSamePath && !isInsideRoot) {
    throw new PathTraversalError(targetPath, resolvedRoot);
  }

  return fs.existsSync(resolvedTarget) ? fs.realpathSync(resolvedTarget) : resolvedTarget;
}