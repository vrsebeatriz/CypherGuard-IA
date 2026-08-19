import fs from 'fs';
import path from 'path';
import { SCAResult, SCAScanOutcome } from '../types';

interface DependencyQuery {
  name: string;
  version: string;
}

export class SCAScanner {
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

    return Object.entries(deps).map(([name, version]) => ({
      name,
      version: (version as string).replace(/[\^~>=<]/g, '').trim(),
    }));
  }

  /**
   * Procura o package.json (e, se existir, o package-lock.json para cobrir
   * dependências transitivas) e consulta a API da OSV (Open Source Vulnerabilities).
   * O código-fonte e caminhos de arquivo nunca compõem esse payload — apenas
   * nome e versão de pacotes npm.
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

    const queries = dependencies.map((dep) => ({
      package: { name: dep.name, ecosystem: 'npm' },
      version: dep.version,
    }));

    try {
      const response = await fetch('https://api.osv.dev/v1/querybatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries }),
      });

      if (!response.ok) {
        throw new Error(`OSV API Error: ${response.statusText}`);
      }

      const responseData = await response.json();
      const results: SCAResult[] = [];

      responseData.results.forEach((res: any, index: number) => {
        if (res.vulns && res.vulns.length > 0) {
          const pkg = queries[index];

          res.vulns.forEach((vuln: any) => {
            const cveId = vuln.aliases?.find((a: string) => a.startsWith('CVE-')) || vuln.id;

            if (!results.find((r) => r.vulnerabilityId === cveId)) {
              results.push({
                package: pkg.package.name,
                version: pkg.version,
                vulnerabilityId: cveId,
                severity: vuln.database_specific?.severity || 'HIGH',
                summary: vuln.summary || 'Vulnerabilidade de Dependência Conhecida',
                details: vuln.details || 'Sem descrição adicional detalhada.',
                references: vuln.references?.map((r: any) => r.url) || [],
              });
            }
          });
        }
      });

      console.log(`[SCA] ${results.length} vulnerabilidades encontradas nas dependências.`);
      return { status: 'ok', results };
    } catch (error: any) {
      console.error(`[SCA] Falha na análise de dependências:`, error.message);
      return { status: 'error', results: [] };
    }
  }
}
