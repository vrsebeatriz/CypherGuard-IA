import { ConfigLoader } from '../config/loader';

export interface ProviderHealth {
  status: 'online' | 'offline' | 'unconfigured';
  model?: string;
  latencyMs?: number;
}

export interface HealthStatus {
  ollama: ProviderHealth;
  openai: ProviderHealth;
  gemini: ProviderHealth;
  activeProvider: string;
}

export class HealthCheck {
  public static async checkOllama(): Promise<ProviderHealth> {
    const config = ConfigLoader.loadConfig();
    const model = config.ai?.model || config.ollama?.model || 'qwen2.5:7b';
    try {
      const start = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch('http://localhost:11434/api/tags', { signal: controller.signal });
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - start;
      if (res.ok) {
        return { status: 'online', model, latencyMs };
      }
      return { status: 'offline', model };
    } catch {
      return { status: 'offline', model };
    }
  }

  public static async getFullHealth(): Promise<HealthStatus> {
    const ollama = await this.checkOllama();

    return {
      ollama,
      openai: { status: 'unconfigured' },
      gemini: { status: 'unconfigured' },
      activeProvider: 'ollama'
    };
  }
}
