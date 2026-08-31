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
    const model = config.ollama?.model || 'llama3';
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

  public static async checkOpenAI(): Promise<ProviderHealth> {
    const config = ConfigLoader.loadConfig();
    if (!config.ai?.openaiApiKey) {
      return { status: 'unconfigured' };
    }
    const model = config.ai?.model || 'gpt-4o';
    try {
      const start = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${config.ai.openaiApiKey}` },
        signal: controller.signal
      });
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

  public static async checkGemini(): Promise<ProviderHealth> {
    const config = ConfigLoader.loadConfig();
    if (!config.ai?.googleApiKey) {
      return { status: 'unconfigured' };
    }
    const model = config.ai?.model || 'gemini-1.5-pro';
    try {
      const start = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${config.ai.googleApiKey}`, {
        signal: controller.signal
      });
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
    const config = ConfigLoader.loadConfig();
    let activeProvider = 'ollama';
    if (config.ai?.provider === 'openai') activeProvider = 'openai';
    else if (config.ai?.provider === 'google') activeProvider = 'google';

    const [ollama, openai, gemini] = await Promise.all([
      this.checkOllama(),
      this.checkOpenAI(),
      this.checkGemini()
    ]);

    return {
      ollama,
      openai,
      gemini,
      activeProvider
    };
  }
}
