jest.mock('@langchain/ollama', () => ({
  ChatOllama: jest.fn().mockImplementation((opts) => ({ __opts: opts })),
}));
jest.mock('../config/loader', () => ({
  ConfigLoader: { loadConfig: jest.fn() },
}));

import { ChatOllama } from '@langchain/ollama';
import { ConfigLoader } from '../config/loader';
import { OllamaValidator } from './ollama';

describe('OllamaValidator — configuração', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('usa a temperatura definida em cypherguard.yml, não um valor fixo', () => {
    (ConfigLoader.loadConfig as jest.Mock).mockReturnValue({
      ollama: { model: 'mistral', temperature: 0.3, baseUrl: 'http://localhost:11434' },
      entropy: { threshold: 4.5 },
      rules: {},
    });

    new OllamaValidator();

    expect(ChatOllama).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'mistral', temperature: 0.3, baseUrl: 'http://localhost:11434' })
    );
  });

  it('usa 0 como padrão determinístico quando o config não define temperatura', () => {
    (ConfigLoader.loadConfig as jest.Mock).mockReturnValue({
      ollama: { model: 'llama3', temperature: 0, baseUrl: 'http://localhost:11434' },
      entropy: { threshold: 4.5 },
      rules: {},
    });

    new OllamaValidator();

    expect(ChatOllama).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0 }));
  });
});
