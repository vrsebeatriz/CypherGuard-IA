import * as path from 'path';
import { assertWithinRoot, PathTraversalError } from './pathGuard';

describe('assertWithinRoot', () => {
  const root = '/home/user/projeto';

  it('aceita um caminho relativo dentro da raiz', () => {
    expect(assertWithinRoot(root, 'src/index.ts')).toBe(path.resolve(root, 'src/index.ts'));
  });

  it('aceita a própria raiz', () => {
    expect(assertWithinRoot(root, '.')).toBe(path.resolve(root));
  });

  it('rejeita um caminho que sobe para fora da raiz com ../', () => {
    expect(() => assertWithinRoot(root, '../../etc/passwd')).toThrow(PathTraversalError);
  });

  it('rejeita um caminho absoluto fora da raiz', () => {
    expect(() => assertWithinRoot(root, '/etc/passwd')).toThrow(PathTraversalError);
  });

  it('rejeita um diretório irmão com prefixo igual (ex: projeto-malicioso não é "projeto")', () => {
    expect(() => assertWithinRoot(root, '../projeto-malicioso/x.js')).toThrow(PathTraversalError);
  });
});
