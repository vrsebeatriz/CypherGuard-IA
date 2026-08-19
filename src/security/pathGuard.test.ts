import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
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

  it('não quebra para caminho inexistente dentro da raiz (fallback do realpath)', () => {
    const fakeRoot = path.join(os.tmpdir(), 'cg-inexistente', 'raiz');
    const target = assertWithinRoot(fakeRoot, 'sub/arquivo.js');
    expect(target).toBe(path.resolve(fakeRoot, 'sub/arquivo.js'));
  });

  it('rejeita um symlink dentro da raiz que aponta para fora dela', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-root-'));
    const outsideFile = path.join(os.tmpdir(), `cg-outside-${Date.now()}.txt`);
    fs.writeFileSync(outsideFile, 'secret');

    const linkPath = path.join(rootDir, 'vazamento.txt');
    fs.symlinkSync(outsideFile, linkPath);

    expect(() => assertWithinRoot(rootDir, 'vazamento.txt')).toThrow(PathTraversalError);

    fs.unlinkSync(linkPath);
    fs.unlinkSync(outsideFile);
    fs.rmdirSync(rootDir);
  });

  it('resolver o alvo real (desfazendo o symlink) quando ele está dentro da raiz', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-root-'));
    const realDir = fs.mkdirSync(path.join(rootDir, 'real'), { recursive: true })!;
    const realFile = path.join(realDir, 'x.js');
    fs.writeFileSync(realFile, 'code');

    const linkPath = path.join(rootDir, 'link.js');
    fs.symlinkSync(realFile, linkPath);

    const resolved = assertWithinRoot(rootDir, 'link.js');
    expect(resolved).toBe(fs.realpathSync(linkPath));

    fs.unlinkSync(linkPath);
    fs.unlinkSync(realFile);
    fs.rmdirSync(realDir);
    fs.rmdirSync(rootDir);
  });
});
