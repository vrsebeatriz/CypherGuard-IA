import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Patcher } from './patcher';

function tmpFile(content: string, name = ''): string {
  const filePath = path.join(
    os.tmpdir(),
    `cypherguard-patcher-test-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.js`
  );
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function tmpJson(content: string): string {
  const filePath = path.join(
    os.tmpdir(),
    `cypherguard-patcher-test-json-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
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
    fs.unlinkSync(`${filePath}.bak`);
  });

  it('preserva o separador de linha CRLF do arquivo original', () => {
    const filePath = tmpFile('linha1\r\nlinha2\r\nlinha3\r\n');

    Patcher.applyPatch(filePath, 2, 2, 'linhaNova');

    expect(fs.readFileSync(filePath, 'utf8')).toBe('linha1\r\nlinhaNova\r\nlinha3\r\n');
    fs.unlinkSync(filePath);
    fs.unlinkSync(`${filePath}.bak`);
  });

  it('retorna false e não lança quando startLine está fora do alcance', () => {
    const filePath = tmpFile('linha1\nlinha2\n');

    const success = Patcher.applyPatch(filePath, 99, 100, 'x');

    expect(success).toBe(false);
    fs.unlinkSync(filePath);
  });

  it('retorna false e não toca o arquivo quando endLine é inválido', () => {
    const filePath = tmpFile('linha1\nlinha2\nlinha3\n');

    const before = fs.readFileSync(filePath, 'utf8');
    const success = Patcher.applyPatch(filePath, 2, 99, 'x');

    expect(success).toBe(false);
    expect(fs.readFileSync(filePath, 'utf8')).toBe(before);
    fs.unlinkSync(filePath);
  });

  it('retorna false quando endLine é menor que startLine', () => {
    const filePath = tmpFile('linha1\nlinha2\nlinha3\n');

    const success = Patcher.applyPatch(filePath, 3, 1, 'x');

    expect(success).toBe(false);
    fs.unlinkSync(filePath);
  });

  it('retorna false quando o arquivo não existe', () => {
    const success = Patcher.applyPatch('/caminho/que/nao/existe.js', 1, 1, 'x');
    expect(success).toBe(false);
  });

  it('rejeita extensões fora da allowlist sem tocar o arquivo', () => {
    const filePath = path.join(os.tmpdir(), `cg-blocked-${Date.now()}.exe`);
    fs.writeFileSync(filePath, 'conteudo');

    const success = Patcher.applyPatch(filePath, 1, 1, 'x');

    expect(success).toBe(false);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('conteudo');
    expect(fs.existsSync(`${filePath}.bak`)).toBe(false);
    fs.unlinkSync(filePath);
  });

  it('cria um backup .bak com o conteúdo original antes de escrever', () => {
    const filePath = tmpFile('v1\nv2\nv3\n');

    Patcher.applyPatch(filePath, 2, 2, 'vNOVO');

    expect(fs.readFileSync(`${filePath}.bak`, 'utf8')).toBe('v1\nv2\nv3\n');
    expect(fs.readFileSync(filePath, 'utf8')).toBe('v1\nvNOVO\nv3\n');
    fs.unlinkSync(filePath);
    fs.unlinkSync(`${filePath}.bak`);
  });

  it('rejeita um patch que quebra a sintaxe do JS e não modifica o arquivo', () => {
    const filePath = tmpFile('const a = 1;\nconst b = 2;\n');

    const before = fs.readFileSync(filePath, 'utf8');
    const success = Patcher.applyPatch(filePath, 1, 2, 'const quebrado = ;;;');

    expect(success).toBe(false);
    expect(fs.readFileSync(filePath, 'utf8')).toBe(before);
    expect(fs.existsSync(`${filePath}.bak`)).toBe(false);
    fs.unlinkSync(filePath);
  });

  it('valida a sintaxe do JSON no conteúdo corrigido', () => {
    const filePath = tmpJson('{\n  "a": 1,\n  "b": 2\n}\n');

    const bad = Patcher.applyPatch(filePath, 1, 3, '{ inválido');
    expect(bad).toBe(false);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('{\n  "a": 1,\n  "b": 2\n}\n');

    const good = Patcher.applyPatch(filePath, 2, 2, '"a": 10,');
    expect(good).toBe(true);
    expect(JSON.parse(fs.readFileSync(filePath, 'utf8')).a).toBe(10);
    fs.unlinkSync(filePath);
    fs.unlinkSync(`${filePath}.bak`);
  });

  it('não deixa arquivo temporário residual após sucesso ou falha', () => {
    const filePath = tmpFile('a\nb\nc\n');

    Patcher.applyPatch(filePath, 2, 2, 'novo');

    const tmpName = `.${path.basename(filePath)}.cypherguard.tmp`;
    const dir = path.dirname(filePath);
    const leftovers = fs.readdirSync(dir).filter((f) => f === tmpName);
    expect(leftovers).toHaveLength(0);

    fs.unlinkSync(filePath);
    fs.unlinkSync(`${filePath}.bak`);
  });
});

describe('Patcher.preview', () => {
  it('retorna o bloco antes e o código corrigido depois', () => {
    const filePath = tmpFile('l1\nl2\nl3\nl4\n');

    const preview = Patcher.preview(filePath, 2, 3, 'corrigido');

    expect(preview).toEqual({ before: 'l2\nl3', after: 'corrigido' });
    // preview é read-only.
    expect(fs.readFileSync(filePath, 'utf8')).toBe('l1\nl2\nl3\nl4\n');
    fs.unlinkSync(filePath);
  });

  it('retorna null para intervalo inválido ou arquivo inexistente', () => {
    const filePath = tmpFile('l1\nl2\n');

    expect(Patcher.preview(filePath, 5, 6, 'x')).toBeNull();
    expect(Patcher.preview('/nao/existe.js', 1, 1, 'x')).toBeNull();
    fs.unlinkSync(filePath);
  });
});
