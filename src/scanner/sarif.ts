import * as fs from 'fs';
import { SemgrepMatch, AIValidationResult } from '../types';

export class SarifGenerator {
  private sarifLog: any;

  constructor() {
    this.sarifLog = {
      version: "2.1.0",
      $schema: "https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/schemas/sarif-schema-2.1.0.json",
      runs: [
        {
          tool: {
            driver: {
              name: "CypherGuard AI",
              informationUri: "https://github.com/beatriz/cypherguard-ai",
              rules: []
            }
          },
          results: []
        }
      ]
    };
  }

  /**
   * Adiciona um alerta validado como "True Positive" ao relatório SARIF.
   */
  public addResult(finding: SemgrepMatch, aiResult: AIValidationResult) {
    // Registra a regra, se ainda não existir
    const ruleId = finding.check_id;
    const rules = this.sarifLog.runs[0].tool.driver.rules;
    if (!rules.find((r: any) => r.id === ruleId)) {
      rules.push({
        id: ruleId,
        shortDescription: { text: finding.extra.message },
        properties: {
          category: "Security"
        }
      });
    }

    // Mapeia o nível de severidade para o padrão SARIF
    let level = "warning";
    if (aiResult.gravidade === 'Alta') level = "error";
    if (aiResult.gravidade === 'Baixa') level = "note";

    // Adiciona o resultado
    this.sarifLog.runs[0].results.push({
      ruleId: ruleId,
      level: level,
      message: {
        text: `[AI Validated] ${aiResult.explicacao}\n\nCorreção Sugerida:\n${aiResult.correcao || 'N/A'}`
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: finding.path
            },
            region: {
              startLine: finding.start.line,
              endLine: finding.end.line,
              startColumn: finding.start.col,
              endColumn: finding.end.col
            }
          }
        }
      ]
    });
  }

  /**
   * Salva o relatório SARIF no disco.
   */
  public save(outputPath: string) {
    fs.writeFileSync(outputPath, JSON.stringify(this.sarifLog, null, 2), 'utf-8');
  }
}
