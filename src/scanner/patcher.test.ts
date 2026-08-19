import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Patcher } from './patcher';

function tmpFile(content: string): string {
  const filePath = path.join(
    os.tmpdir(),
    `cypherguard-patcher-test-${Date.now()}-${Math.random().toString(36).slice(2)}.js`
  );
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

describe('Patcher.applyPatch', () => {
  it('substitui o intervalo de linhas indicado pelo código corrigido', () => {
    const filePath = tmpFile('linha1\nlinha2\nlinha3\nlinha4\n');

    const success = Patcher.applyPatch(filePath, 2, 3, 'linhaCorrigida');

    expect(success).toBe(true);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('linha1\nlinhaCorrigida\nlinha4\n');
    fs.unlinkSync(filePath);
  });

  it('preserva o separador de linha CRLF do arquivo original', () => {
    const filePath = tmpFile('linha1\r\nlinha2\r\nlinha3\r\n');

    Patcher.applyPatch(filePath, 2, 2, 'linhaNova');

    expect(fs.readFileSync(filePath, 'utf8')).toBe('linha1\r\nlinhaNova\r\nlinha3\r\n');
    fs.unlinkSync(filePath);
  });

  it('retorna false e não lança quando startLine está fora do alcance', () => {
    const filePath = tmpFile('linha1\nlinha2\n');

    const success = Patcher.applyPatch(filePath, 99, 100, 'x');

    expect(success).toBe(false);
    fs.unlinkSync(filePath);
  });

  it('retorna false quando o arquivo não existe', () => {
    const success = Patcher.applyPatch('/caminho/que/nao/existe.js', 1, 1, 'x');
    expect(success).toBe(false);
  });
});
