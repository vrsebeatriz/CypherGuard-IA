import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { CypherConfig } from '../types';

export class ConfigLoader {
  private static readonly DEFAULT_CONFIG: CypherConfig = {
    ollama: {
      model: 'llama3',
      temperature: 0.1,
      baseUrl: 'http://localhost:11434',
    },
    entropy: {
      threshold: 4.5,
    },
    rules: {}
  };

  /**
   * Carrega a configuração do arquivo cypherguard.yml ou retorna o padrão.
   */
  public static loadConfig(configPath?: string): CypherConfig {
    const targetPath = configPath || path.join(process.cwd(), 'cypherguard.yml');

    if (!fs.existsSync(targetPath)) {
      return this.DEFAULT_CONFIG;
    }

    try {
      const fileContents = fs.readFileSync(targetPath, 'utf8');
      const userConfig = yaml.load(fileContents) as Partial<CypherConfig>;

      // Merge profundo simples para primeiro nível
      return {
        ollama: { ...this.DEFAULT_CONFIG.ollama, ...(userConfig.ollama || {}) },
        entropy: { ...this.DEFAULT_CONFIG.entropy, ...(userConfig.entropy || {}) },
        rules: { ...this.DEFAULT_CONFIG.rules, ...(userConfig.rules || {}) },
      };
    } catch (e) {
      console.warn(`[!] Erro ao carregar cypherguard.yml, usando padrões.`, e);
      return this.DEFAULT_CONFIG;
    }
  }
}
