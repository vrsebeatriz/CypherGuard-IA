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

function makeScanner(cachePath?: string): SCAScanner {
  return new SCAScanner({ cachePath: cachePath ?? path.join(os.tmpdir(), `cg-cache-${Date.now()}-${Math.random()}`) });
}

describe('SCAScanner.scan', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('retorna status "ok" e lista vazia quando não há package.json', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cypherguard-sca-empty-'));
    const scanner = makeScanner();

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

    const scanner = makeScanner();
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

    const scanner = makeScanner();
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

    const scanner = makeScanner();
    const outcome = await scanner.scan(dir);

    expect(outcome.status).toBe('error');
    expect(outcome.results).toEqual([]);
  });

  it('retorna status "error" quando o fetch da OSV é rejeitado (timeout/rede)', async () => {
    const dir = makeProjectDir({
      'package.json': JSON.stringify({ dependencies: { express: '^4.16.0' } }),
    });

    global.fetch = jest.fn().mockRejectedValue(new Error('aborted')) as any;

    const scanner = makeScanner();
    const outcome = await scanner.scan(dir);

    expect(outcome.status).toBe('error');
    expect(outcome.results).toEqual([]);
  });

  it('passa um sinal de timeout no fetch da OSV', async () => {
    const dir = makeProjectDir({
      'package.json': JSON.stringify({ dependencies: { express: '^4.16.0' } }),
    });

    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{}] }) });
    global.fetch = fetchMock as any;

    const scanner = makeScanner();
    await scanner.scan(dir);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBeDefined();
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

    const scanner = makeScanner();
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

    const scanner = makeScanner();
    await scanner.scan(dir);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.osv.dev/v1/querybatch');
    expect(init.body).not.toContain(dir);
  });

  it('resolve ranges com a versão mínima satisfeita e pula ranges não resolvíveis', async () => {
    const dir = makeProjectDir({
      'package.json': JSON.stringify({
        dependencies: {
          pkgA: '>=1.2.3 <2.0.0',
          pkgB: 'latest',
        },
      }),
    });

    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    global.fetch = fetchMock as any;

    const scanner = makeScanner();
    await scanner.scan(dir);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body.queries).toEqual([{ package: { name: 'pkgA', ecosystem: 'npm' }, version: '1.2.3' }]);
  });

  it('pagina o batch da OSV em blocos de até 1000 queries', async () => {
    const deps: Record<string, string> = {};
    for (let i = 0; i < 1500; i++) {
      deps[`dep-${i}`] = `${i}.0.0`;
    }
    const dir = makeProjectDir({ 'package.json': JSON.stringify({ dependencies: deps }) });

    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    global.fetch = fetchMock as any;

    const scanner = makeScanner();
    await scanner.scan(dir);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    const secondBody = JSON.parse((fetchMock.mock.calls[1][1] as any).body);
    expect(firstBody.queries).toHaveLength(1000);
    expect(secondBody.queries).toHaveLength(500);
  });

  it('usa o cache local e não reconsulta a OSV na segunda varredura', async () => {
    const dir = makeProjectDir({
      'package.json': JSON.stringify({ dependencies: { express: '^4.16.0' } }),
    });

    const vulnPayload = {
      ok: true,
      json: async () => ({
        results: [
          {
            vulns: [{ id: 'GHSA-abc', aliases: ['CVE-2017-9999'], summary: 'XSS' }],
          },
        ],
      }),
    };
    const fetchMock = jest.fn().mockResolvedValue(vulnPayload);
    global.fetch = fetchMock as any;

    const cachePath = path.join(os.tmpdir(), `cg-cache-test-${Date.now()}.json`);
    const scanner = makeScanner(cachePath);

    const first = await scanner.scan(dir);
    expect(first.results).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Segunda varredura: mesmo com fetch quebrado, o cache atende.
    const offlineMock = jest.fn().mockRejectedValue(new Error('offline'));
    global.fetch = offlineMock as any;
    const second = await scanner.scan(dir);

    expect(second.status).toBe('ok');
    expect(second.results).toHaveLength(1);
    expect(offlineMock).not.toHaveBeenCalled();
    fs.unlinkSync(cachePath);
  });

  it('usa severidade GHSA quando presente e default HIGH quando ausente', async () => {
    const dir = makeProjectDir({
      'package.json': JSON.stringify({ dependencies: { a: '1.0.0', b: '1.0.0' } }),
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            vulns: [{ id: 'GHSA-1', database_specific: { severity: 'MODERATE' }, summary: 'x' }],
          },
          {
            vulns: [{ id: 'GHSA-2', summary: 'y' }],
          },
        ],
      }),
    }) as any;

    const scanner = makeScanner();
    const outcome = await scanner.scan(dir);

    const severities = outcome.results.map((r) => r.severity).sort();
    expect(severities).toEqual(['HIGH', 'MODERATE']);
  });
});