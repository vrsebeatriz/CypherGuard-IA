import fs from 'fs';
import path from 'path';
import * as semver from 'semver';
import { SCAResult, SCAScanOutcome } from '../types';

interface DependencyQuery {
  name: string;
  version: string;
}

export interface SCAScannerOptions {
  /** Caminho do arquivo de cache de respostas OSV. Útil para testes e isolamento. */
  cachePath?: string;
}

const OSV_BATCH_LIMIT = 1000;
const OSV_TIMEOUT_MS = 30_000;

type CacheStore = Record<string, SCAResult[]>;

export class SCAScanner {
  private cachePath: string;

  constructor(options: SCAScannerOptions = {}) {
    this.cachePath = options.cachePath ?? path.join(process.cwd(), '.cache', 'cypherguard', 'osv-cache.json');
  }

  private resolveManifestDir(targetPath: string): string {
    if (fs.existsSync(targetPath) && fs.lstatSync(targetPath).isDirectory()) {
      return targetPath;
    }
    return path.dirname(targetPath);
  }

  /**
   * Extrai o nome do pacote a partir da chave de "packages" do package-lock.json,
   * removendo os prefixos node_modules/ intermediários (inclusive para pacotes
   * com escopo, ex: node_modules/@scope/pkg).
   */
  private packageNameFromLockKey(key: string): string | null {
    const segments = key.split('node_modules/');
    return segments[segments.length - 1] || null;
  }

  private readTransitiveDependencies(manifestDir: string): DependencyQuery[] | null {
    const lockPath = path.join(manifestDir, 'package-lock.json');
    if (!fs.existsSync(lockPath)) return null;

    try {
      const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (!lockData.packages || typeof lockData.packages !== 'object') return null;

      const seen = new Map<string, DependencyQuery>();

      for (const [key, value] of Object.entries<any>(lockData.packages)) {
        if (key === '' || !value?.version) continue;
        const name = this.packageNameFromLockKey(key);
        if (!name) continue;
        seen.set(`${name}@${value.version}`, { name, version: value.version });
      }

      return Array.from(seen.values());
    } catch (e) {
      console.warn(`[SCA] package-lock.json inválido, usando dependências diretas de package.json.`);
      return null;
    }
  }

  private readDirectDependencies(manifestDir: string): DependencyQuery[] {
    const packageJsonPath = path.join(manifestDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) return [];

    const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const deps = { ...packageData.dependencies, ...packageData.devDependencies };

    const queries: DependencyQuery[] = [];
    for (const [name, version] of Object.entries<string>(deps)) {
      // Resolve o range para a MENOR versão que o satisfaz (ex.: "^4.16.0" -> "4.16.0",
      // ">=1.2.3 <2.0.0" -> "1.2.3"). Ranges não resolvíveis (ex.: "latest", "workspace:*")
      // são pulados em vez de gerar uma query inválida à OSV. minVersion LANÇA para
      // valores inválidos — capturamos para tratar como "não resolvível".
      let resolved: semver.SemVer | null = null;
      try {
        resolved = semver.minVersion(version);
      } catch {
        resolved = null;
      }
      if (!resolved) {
        console.warn(`[SCA] Ignorando dependência "${name}" com versão não resolvível: "${version}".`);
        continue;
      }
      queries.push({ name, version: resolved.version });
    }

    return queries;
  }

  private loadCache(): CacheStore {
    try {
      return JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
    } catch {
      return {};
    }
  }

  private saveCache(cache: CacheStore) {
    try {
      fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
      fs.writeFileSync(this.cachePath, JSON.stringify(cache, null, 2), 'utf8');
    } catch (e: any) {
      console.warn(`[SCA] Não foi possível gravar o cache: ${e.message}`);
    }
  }

  private cacheKey(query: DependencyQuery): string {
    return `${query.name}@${query.version}`;
  }

  /** Prioriza severidade GHSA (HIGH/MODERATE/...), depois CVSS, com default HIGH. */
  private severityFromVuln(vuln: any): string {
    const ghsa = vuln.database_specific?.severity;
    if (typeof ghsa === 'string') {
      const upper = ghsa.toUpperCase();
      if (['CRITICAL', 'HIGH', 'MODERATE', 'LOW'].includes(upper)) return upper;
    }

    const score = Number(vuln.severity?.[0]?.score);
    if (Number.isFinite(score)) {
      if (score >= 9.0) return 'CRITICAL';
      if (score >= 7.0) return 'HIGH';
      if (score >= 4.0) return 'MODERATE';
      return 'LOW';
    }

    return 'HIGH';
  }

  /**
   * Consulta a OSV em batches de até 1000 queries, com timeout, e retorna as
   * vulnerabilidades. O código-fonte e caminhos de arquivo nunca compõem o
   * payload — apenas nome e versão de pacotes npm.
   */
  private async queryOsv(queries: DependencyQuery[]): Promise<SCAResult[]> {
    const results: SCAResult[] = [];

    for (let i = 0; i < queries.length; i += OSV_BATCH_LIMIT) {
      const batch = queries.slice(i, i + OSV_BATCH_LIMIT);
      const payload = {
        queries: batch.map((dep) => ({
          package: { name: dep.name, ecosystem: 'npm' },
          version: dep.version,
        })),
      };

      const response = await fetch('https://api.osv.dev/v1/querybatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(OSV_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`OSV API Error: ${response.statusText}`);
      }

      const responseData = await response.json();
      responseData.results.forEach((res: any, index: number) => {
        if (res.vulns && res.vulns.length > 0) {
          const pkg = batch[index];

          res.vulns.forEach((vuln: any) => {
            const cveId = vuln.aliases?.find((a: string) => a.startsWith('CVE-')) || vuln.id;

            if (!results.find((r) => r.vulnerabilityId === cveId)) {
              results.push({
                package: pkg.name,
                version: pkg.version,
                vulnerabilityId: cveId,
                severity: this.severityFromVuln(vuln),
                summary: vuln.summary || 'Vulnerabilidade de Dependência Conhecida',
                details: vuln.details || 'Sem descrição adicional detalhada.',
                references: vuln.references?.map((r: any) => r.url) || [],
              });
            }
          });
        }
      });
    }

    return results;
  }

  /**
   * Procura o package.json (e, se existir, o package-lock.json para cobrir
   * dependências transitivas) e consulta a API da OSV (Open Source Vulnerabilities),
   * com cache local por nome@versão. Falhas de rede/API são reportadas como
   * status "error" (fail-closed) — nunca "0 vulnerabilidades" enganoso.
   */
  public async scan(targetPath: string): Promise<SCAScanOutcome> {
    const manifestDir = this.resolveManifestDir(targetPath);
    const packageJsonPath = path.join(manifestDir, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      console.log(`[SCA] Nenhuma dependência encontrada em ${packageJsonPath}`);
      return { status: 'ok', results: [] };
    }

    const transitive = this.readTransitiveDependencies(manifestDir);
    const dependencies = transitive ?? this.readDirectDependencies(manifestDir);

    if (transitive) {
      console.log(
        `[SCA] package-lock.json encontrado — auditando ${dependencies.length} dependências (diretas + transitivas).`
      );
    } else {
      console.log(`[SCA] Sem lockfile — auditando apenas ${dependencies.length} dependências diretas de package.json.`);
    }

    if (dependencies.length === 0) return { status: 'ok', results: [] };

    const cache = this.loadCache();
    const toQuery: DependencyQuery[] = [];
    const cachedResults: SCAResult[] = [];

    for (const dep of dependencies) {
      const key = this.cacheKey(dep);
      const hit = cache[key];
      if (hit) {
        cachedResults.push(...hit);
      } else {
        toQuery.push(dep);
      }
    }

    if (cache && toQuery.length < dependencies.length) {
      console.log(`[SCA] Cache: ${dependencies.length - toQuery.length} dependências servidas do cache local.`);
    }

    if (toQuery.length > 0) {
      try {
        const fresh = await this.queryOsv(toQuery);
        toQuery.forEach((dep, index) => {
          const depResults = fresh.filter((r) => r.package === dep.name && r.version === dep.version);
          cache[this.cacheKey(dep)] = depResults;
        });
        this.saveCache(cache);
        cachedResults.push(...fresh);
        console.log(`[SCA] ${fresh.length} vulnerabilidades encontradas nas dependências.`);
      } catch (error: any) {
        console.error(`[SCA] Falha na análise de dependências:`, error.message);
        return { status: 'error', results: [] };
      }
    }

    // Dedup por vulnerabilityId preservando a primeira ocorrência.
    const seen = new Set<string>();
    const results = cachedResults.filter((r) => {
      if (seen.has(r.vulnerabilityId)) return false;
      seen.add(r.vulnerabilityId);
      return true;
    });

    return { status: 'ok', results };
  }
}