import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { SCAResult } from '../types';

export class SCAScanner {
  /**
   * Procura o package.json e package-lock.json e executa npm audit.
   */
  public async scan(targetPath: string): Promise<SCAResult[]> {
    let targetDir = targetPath;
    
    if (fs.existsSync(targetPath) && fs.lstatSync(targetPath).isFile()) {
      targetDir = path.dirname(targetPath);
    }

    const packageJsonPath = path.join(targetDir, 'package.json');
    const packageLockPath = path.join(targetDir, 'package-lock.json');

    if (!fs.existsSync(packageJsonPath) || !fs.existsSync(packageLockPath)) {
      console.log(`[SCA] package.json ou package-lock.json não encontrados em ${targetDir}. Pulando análise SCA.`);
      return [];
    }

    try {
      console.log(`[SCA] Executando npm audit em ${targetDir}...`);
      let auditOutput = '';
      try {
        auditOutput = execSync('npm audit --json', { 
          cwd: targetDir, 
          encoding: 'utf8', 
          stdio: ['ignore', 'pipe', 'ignore'] 
        });
      } catch (err: any) {
        // npm audit exits with non-zero code if vulnerabilities are found
        auditOutput = err.stdout || '';
      }

      if (!auditOutput) return [];

      const auditData = JSON.parse(auditOutput);
      const results: SCAResult[] = [];

      if (auditData.vulnerabilities) {
        for (const [pkgName, vulnDetails] of Object.entries<any>(auditData.vulnerabilities)) {
          if (Array.isArray(vulnDetails.via)) {
             for (const via of vulnDetails.via) {
               if (typeof via === 'object' && via.title) {
                 // Try to get a CVE ID or a meaningful ID
                 const idMatch = via.title.match(/CVE-\d+-\d+/i);
                 const cveId = idMatch ? idMatch[0] : (via.source || via.url || via.title);
                 
                 // Evitar duplicados
                 if (!results.find(r => r.vulnerabilityId === cveId)) {
                   results.push({
                     package: pkgName,
                     version: vulnDetails.range || 'unknown',
                     vulnerabilityId: cveId,
                     severity: (via.severity || vulnDetails.severity || 'HIGH').toUpperCase(),
                     summary: via.title,
                     details: `Nó vulnerável: ${pkgName}. Efeitos: ${(vulnDetails.effects || []).join(', ')}. Fix disponível: ${vulnDetails.fixAvailable ? 'Sim' : 'Não'}`,
                     references: via.url ? [via.url] : []
                   });
                 }
               }
             }
          }
          
          // Se não extraímos nada do 'via' mas a vuln existe
          if (results.filter(r => r.package === pkgName).length === 0 && vulnDetails.severity) {
             results.push({
                package: pkgName,
                version: vulnDetails.range || 'unknown',
                vulnerabilityId: `NPM-AUDIT-${pkgName}`,
                severity: vulnDetails.severity.toUpperCase(),
                summary: `Vulnerabilidade em ${pkgName}`,
                details: `Efeitos: ${(vulnDetails.effects || []).join(', ')}. Fix disponível: ${vulnDetails.fixAvailable ? 'Sim' : 'Não'}`,
                references: []
             });
          }
        }
      }

      console.log(`[SCA] ${results.length} vulnerabilidades encontradas via npm audit.`);
      return results;

    } catch (error: any) {
      console.error(`[SCA] Falha na análise de dependências:`, error.message);
      return [];
    }
  }
}
