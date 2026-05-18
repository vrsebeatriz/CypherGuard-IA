import fs from 'fs';
import path from 'path';
import { SCAResult } from '../types';

export class SCAScanner {
  /**
   * Procura o package.json e consulta a API da OSV (Open Source Vulnerabilities).
   */
  public async scan(targetPath: string): Promise<SCAResult[]> {
    let packageJsonPath = targetPath;
    
    if (fs.existsSync(targetPath) && fs.lstatSync(targetPath).isDirectory()) {
      packageJsonPath = path.join(targetPath, 'package.json');
    } else if (fs.existsSync(targetPath)) {
      packageJsonPath = path.join(path.dirname(targetPath), 'package.json');
    }

    if (!fs.existsSync(packageJsonPath)) {
      console.log(`[SCA] Nenhuma dependência encontrada em ${packageJsonPath}`);
      return [];
    }

    try {
      const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const deps = { ...packageData.dependencies, ...packageData.devDependencies };
      
      const queries = Object.entries(deps).map(([name, version]) => {
        // Remover prefixos semver como ^, ~, >= para a consulta
        const cleanVersion = (version as string).replace(/[\^~>=<]/g, '').trim();
        return {
          package: { name, ecosystem: 'npm' },
          version: cleanVersion
        };
      });

      if (queries.length === 0) return [];

      console.log(`[SCA] Verificando ${queries.length} dependências no OSV...`);
      
      const response = await fetch('https://api.osv.dev/v1/querybatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries })
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
            // Filtrar apenas vulnerabilidades relevantes que tenham ID
            const cveId = vuln.aliases?.find((a: string) => a.startsWith('CVE-')) || vuln.id;
            
            // Checar para não duplicar exatamente a mesma CVE
            if (!results.find(r => r.vulnerabilityId === cveId)) {
              results.push({
                package: pkg.package.name,
                version: pkg.version,
                vulnerabilityId: cveId,
                severity: vuln.database_specific?.severity || 'HIGH',
                summary: vuln.summary || 'Vulnerabilidade de Dependência Conhecida',
                details: vuln.details || 'Sem descrição adicional detalhada.',
                references: vuln.references?.map((r: any) => r.url) || []
              });
            }
          });
        }
      });

      console.log(`[SCA] ${results.length} vulnerabilidades encontradas nas dependências.`);
      return results;

    } catch (error) {
      console.error(`[SCA] Falha na análise de dependências:`, error);
      return [];
    }
  }
}
