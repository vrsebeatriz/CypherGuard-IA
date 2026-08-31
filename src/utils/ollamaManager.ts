import { spawn, ChildProcess } from 'child_process';
import http from 'http';
// @ts-ignore
import treeKill from 'tree-kill';

export class OllamaManager {
  private static ollamaProcess: ChildProcess | null = null;
  private static wasStartedByUs = false;

  public static async isOllamaRunning(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get('http://127.0.0.1:11434/', (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => {
        resolve(false);
      });
      req.setTimeout(1000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  public static async ensureRunning(): Promise<void> {
    const isRunning = await this.isOllamaRunning();
    if (isRunning) {
      console.log('✅ [OllamaManager] Motor de IA local já está rodando em background.');
      return;
    }

    console.log('⏳ [OllamaManager] Ollama offline. Iniciando processo em background...');
    this.startOllama();

    // Aguardar até que a porta responda
    let retries = 15;
    while (retries > 0) {
      await new Promise((r) => setTimeout(r, 1000));
      const up = await this.isOllamaRunning();
      if (up) {
        console.log('🚀 [OllamaManager] Ollama inicializado e pronto para receber requisições!');
        this.wasStartedByUs = true;
        return;
      }
      retries--;
    }
    
    console.warn('⚠️ [OllamaManager] Ollama demorou muito para responder. Pode haver um erro na inicialização.');
  }

  private static startOllama(): void {
    try {
      this.ollamaProcess = spawn('ollama', ['serve'], {
        detached: true,
        stdio: 'ignore', // ignorar output para não sujar o terminal
        shell: process.platform === 'win32'
      });

      this.ollamaProcess.on('error', (err: any) => {
        if (err.code === 'ENOENT') {
          console.warn('\n⚠️  [OllamaManager] Ollama não está instalado no sistema!');
          console.warn('⚠️  [OllamaManager] A inicialização falhou pois o executável "ollama" não foi encontrado.');
          console.warn('⚠️  [OllamaManager] O servidor continuará funcionando normalmente para integrações em Nuvem (OpenAI/Gemini).\n');
        } else {
          console.error('❌ [OllamaManager] Erro no processo Ollama:', err.message);
        }
      });

      // Evita que o Node impeça de fechar se por algum motivo travar
      if (this.ollamaProcess.unref) {
        this.ollamaProcess.unref();
      }
    } catch (e) {
      console.error('❌ [OllamaManager] Falha ao iniciar ollama:', e);
    }
  }

  public static killOllama(): void {
    if (!this.wasStartedByUs) {
      console.log('✅ [OllamaManager] Ollama estava rodando previamente, não será encerrado.');
      return;
    }
    
    if (this.ollamaProcess && this.ollamaProcess.pid) {
      console.log('🛑 [OllamaManager] Encerrando o serviço Ollama...');
      try {
        // Usa tree-kill para matar o processo filho e toda a sua árvore de processos
        treeKill(this.ollamaProcess.pid, 'SIGKILL');
        console.log('✅ [OllamaManager] Serviço Ollama encerrado com sucesso.');
      } catch (e) {
        console.error('❌ [OllamaManager] Erro ao tentar encerrar o Ollama:', e);
      }
    }
  }
}
