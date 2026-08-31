jest.mock('@langchain/ollama', () => ({
  ChatOllama: jest.fn().mockImplementation((opts) => ({ __opts: opts })),
}));
jest.mock('../config/loader', () => ({
  ConfigLoader: { loadConfig: jest.fn() },
}));

import { ChatOllama } from '@langchain/ollama';
import { ConfigLoader } from '../config/loader';
import { CypherConfig } from '../types';
import { AIValidator } from './validator';

describe('AIValidator — configuração', () => {
  let mockConfig: CypherConfig;

  beforeEach(() => {
    mockConfig = {
      ai: { provider: 'ollama', model: 'llama3', temperature: 0.1, baseUrl: 'http://test:11434' },
      ollama: { model: 'llama3', temperature: 0.1, baseUrl: 'http://test:11434' },
      entropy: { threshold: 4.5 },
      rules: {}
    };
    (ConfigLoader.loadConfig as jest.Mock).mockReturnValue(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('carrega o model, baseUrl e temperature do cypherguard.yml', () => {
    new AIValidator();
    expect(ChatOllama).toHaveBeenCalledWith(expect.objectContaining({
      model: 'llama3',
      baseUrl: 'http://test:11434',
      temperature: 0.1,
    }));
  });

  it('usa valores padrão caso cypherguard.yml esteja vazio', () => {
    jest.mocked(ConfigLoader.loadConfig).mockReturnValueOnce({
      ai: { provider: 'ollama' },
      ollama: { model: 'llama3', temperature: 0, baseUrl: 'http://localhost:11434' },
      entropy: { threshold: 4.5 }
    });
    new AIValidator();
    expect(ChatOllama).toHaveBeenCalledWith(expect.objectContaining({
      model: 'llama3',
      baseUrl: 'http://localhost:11434',
      temperature: 0,
    }));
  });
});

describe('AIValidator — prompt anti-injection', () => {
  it('injeta as diretrizes de segurança no prompt base', () => {
    jest.mocked(ConfigLoader.loadConfig).mockReturnValueOnce({
      ai: { provider: 'ollama' },
      ollama: { model: 'llama3', temperature: 0, baseUrl: 'http://localhost:11434' },
      entropy: { threshold: 4.5 }
    });
    const prompt = new AIValidator().buildValidationPrompt();
    expect(prompt).toContain('DIRETRIZES DE SEGURANÇA:');
  });

  it('delimita o código com marcadores <CODE> e instrui a ignorar instruções dentro dele', () => {
    jest.mocked(ConfigLoader.loadConfig).mockReturnValueOnce({
      ai: { provider: 'ollama' },
      ollama: { model: 'llama3', temperature: 0, baseUrl: 'http://localhost:11434' },
      entropy: { threshold: 4.5 }
    });

    const prompt = new AIValidator().buildValidationPrompt();

    expect(prompt).toContain('<CODE>');
    expect(prompt).toContain('</CODE>');
    expect(prompt).toContain('IGNORE-A');
    expect(prompt).toMatch(/DADO, não comando/i);
    expect(prompt).toContain('{codeSnippet}');
  });
});
