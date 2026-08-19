import * as path from 'path';

export class PathTraversalError extends Error {
  constructor(public readonly attemptedPath: string, public readonly root: string) {
    super(`Caminho "${attemptedPath}" está fora do diretório permitido "${root}".`);
    this.name = 'PathTraversalError';
  }
}

/**
 * Resolve `targetPath` relativo a `root` e garante que o resultado não escapa da raiz.
 * Lança PathTraversalError se o caminho resolvido ficar fora dela.
 */
export function assertWithinRoot(root: string, targetPath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(resolvedRoot, targetPath);

  const isSamePath = resolvedTarget === resolvedRoot;
  // path.sep no final evita que "/root-evil" passe no startsWith de "/root"
  const isInsideRoot = resolvedTarget.startsWith(resolvedRoot + path.sep);

  if (!isSamePath && !isInsideRoot) {
    throw new PathTraversalError(targetPath, resolvedRoot);
  }

  return resolvedTarget;
}
