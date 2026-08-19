import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SCAScanner } from './sca';

function makeProjectDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cypherguard-sca-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, 'utf8');
  }
  return dir;
}

describe('SCAScanner.scan', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('retorna status "ok" e lista vazia quando não há package.json', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cypherguard-sca-empty-'));
    const scanner = new SCAScanner();

    const outcome = await scanner.scan(dir);

    expect(outcome).toEqual({ status: 'ok', results: [] });
  });

  it('consulta apenas as dependências diretas quando não há package-lock.json', async () => {
    const dir = makeProjectDir({
      'package.json': JSON.stringify({ dependencies: { express: '^4.16.0' } }),
    });

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{}] }),
    });
    global.fetch = fetchMock as any;

    const scanner = new SCAScanner();
    await scanner.scan(dir);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body.queries).toEqual([{ package: { name: 'express', ecosystem: 'npm' }, version: '4.16.0' }]);
  });

  it('consulta as dependências transitivas do package-lock.json quando ele existe', async () => {
    const lockfile = {
      lockfileVersion: 3,
      packages: {
        '': { name: 'root' },
        'node_modules/express': { version: '4.16.0' },
        'node_modules/express/node_modules/qs': { version: '6.5.1' },
      },
    };
    const dir = makeProjectDir({
      'package.json': JSON.stringify({ dependencies: { express: '^4.16.0' } }),
      'package-lock.json': JSON.stringify(lockfile),
    });

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{}, {}] }),
    });
    global.fetch = fetchMock as any;

    const scanner = new SCAScanner();
    await scanner.scan(dir);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body.queries).toEqual(
      expect.arrayContaining([
        { package: { name: 'express', ecosystem: 'npm' }, version: '4.16.0' },
        { package: { name: 'qs', ecosystem: 'npm' }, version: '6.5.1' },
      ])
    );
    expect(body.queries).toHaveLength(2);
  });

  it('retorna status "error" e NÃO finge que as dependências estão limpas quando a OSV falha', async () => {
    const dir = makeProjectDir({
      'package.json': JSON.stringify({ dependencies: { express: '^4.16.0' } }),
    });

    global.fetch = jest.fn().mockResolvedValue({ ok: false, statusText: 'Service Unavailable' }) as any;

    const scanner = new SCAScanner();
    const outcome = await scanner.scan(dir);

    expect(outcome.status).toBe('error');
    expect(outcome.results).toEqual([]);
  });

  it('deduplica vulnerabilidades pelo vulnerabilityId e prioriza o alias CVE-*', async () => {
    const dir = makeProjectDir({
      'package.json': JSON.stringify({ dependencies: { 'node-serialize': '0.0.4' } }),
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            vulns: [{ id: 'GHSA-xxxx', aliases: ['CVE-2017-5941'], summary: 'RCE via unserialize' }],
          },
        ],
      }),
    }) as any;

    const scanner = new SCAScanner();
    const outcome = await scanner.scan(dir);

    expect(outcome.results).toHaveLength(1);
    expect(outcome.results[0].vulnerabilityId).toBe('CVE-2017-5941');
  });

  it('nunca inclui código-fonte ou caminhos de arquivo no corpo da requisição à OSV', async () => {
    const dir = makeProjectDir({
      'package.json': JSON.stringify({ dependencies: { express: '^4.16.0' } }),
    });

    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{}] }) });
    global.fetch = fetchMock as any;

    const scanner = new SCAScanner();
    await scanner.scan(dir);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.osv.dev/v1/querybatch');
    expect(init.body).not.toContain(dir);
  });
});
