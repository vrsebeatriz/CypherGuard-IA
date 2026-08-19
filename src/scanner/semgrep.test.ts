import { SemgrepScanner } from './semgrep';

jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process');
  return { ...actual, execFile: jest.fn() };
});

import { execFile } from 'child_process';
const execFileMock = execFile as unknown as jest.Mock;

function makeResult() {
  return {
    errors: [],
    results: [],
    paths: { scanned: ['x.js'] },
  };
}

describe('SemgrepScanner', () => {
  const scanner = new SemgrepScanner();
  const originalConfigCwd = process.cwd;

  beforeEach(() => {
    execFileMock.mockReset();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('passa o targetPath como ARGUMENTO literal, nunca interpolado no shell', async () => {
    execFileMock.mockImplementation((cmd: string, args: string[], _options: any, cb: any) => {
      cb(null, { stdout: JSON.stringify(makeResult()), stderr: '' });
    });

    const malicious = '/tmp/a"; rm -rf /; #';
    await scanner.scan(malicious);

    expect(execFileMock).toHaveBeenCalledTimes(1);
    const [cmd, args] = execFileMock.mock.calls[0];
    expect(cmd).toBe('semgrep');
    // O caminho malicioso é um elemento ÚNICO de argv — nenhum shell o interpreta.
    expect(args).toContain(malicious);
    expect(args[args.length - 1]).toBe(malicious);
    // A montagem nunca é uma string única de comando.
    expect(typeof args.join(' ')).toBe('string');
    expect(execFileMock.mock.calls[0][0]).toBe('semgrep');
  });

  it('passa o caminho com espaços sem quebrar a montagem do comando', async () => {
    execFileMock.mockImplementation((cmd: string, args: string[], _options: any, cb: any) => {
      cb(null, { stdout: JSON.stringify(makeResult()), stderr: '' });
    });

    const withSpaces = '/tmp/dir com espaços/projeto';
    await scanner.scan(withSpaces);

    const [, args] = execFileMock.mock.calls[0];
    expect(args).toContain(withSpaces);
  });

  it('configura timeout e maxBuffer no subprocesso', async () => {
    execFileMock.mockImplementation((cmd: string, args: string[], options: any, cb: any) => {
      expect(options.timeout).toBe(5 * 60 * 1000);
      expect(options.maxBuffer).toBe(10 * 1024 * 1024);
      cb(null, { stdout: JSON.stringify(makeResult()), stderr: '' });
    });

    await scanner.scan('.');

    const [, , options] = execFileMock.mock.calls[0];
    expect(options.timeout).toBe(5 * 60 * 1000);
    expect(options.maxBuffer).toBe(10 * 1024 * 1024);
  });

  it('recupera o JSON do stdout mesmo quando o semgrep sai com código 1 (achados encontrados)', async () => {
    const err: any = new Error('semgrep exited with code 1');
    err.stdout = JSON.stringify({ ...makeResult(), results: [{ check_id: 'x', path: 'a.js' }] });
    err.stderr = '';

    execFileMock.mockImplementation((cmd: string, args: string[], _options: any, cb: any) => {
      cb(err);
    });

    const result = await scanner.scan('.');
    expect(result.results).toHaveLength(1);
  });

  it('lança erro explícito quando o subprocesso é morto por timeout', async () => {
    const err: any = new Error('ESERVERTIMEDOUT');
    err.killed = true;

    execFileMock.mockImplementation((cmd: string, args: string[], _options: any, cb: any) => {
      cb(err);
    });

    await expect(scanner.scan('.')).rejects.toThrow('timed out');
  });

  it('propaga erro sem stdout com mensagem descritiva', async () => {
    const err: any = new Error('semgrep: command not found');

    execFileMock.mockImplementation((cmd: string, args: string[], _options: any, cb: any) => {
      cb(err);
    });

    await expect(scanner.scan('.')).rejects.toThrow('Semgrep execution failed');
  });

  it('hasScanErrors identifica erros de regra/execução no resultado', () => {
    expect(scanner.hasScanErrors({ errors: [], results: [], paths: { scanned: [] } })).toBe(false);
    expect(
      scanner.hasScanErrors({ errors: [{ message: 'regra inválida' }], results: [], paths: { scanned: [] } })
    ).toBe(true);
  });
});