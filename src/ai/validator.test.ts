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

  it('pede a análise antes do veredito e define o critério de falso positivo', () => {
    jest.mocked(ConfigLoader.loadConfig).mockReturnValueOnce({
      ai: { provider: 'ollama' },
      ollama: { model: 'llama3', temperature: 0, baseUrl: 'http://localhost:11434' },
      entropy: { threshold: 4.5 }
    });

    const prompt = new AIValidator().buildValidationPrompt();

    expect(prompt).toContain('CRITÉRIO DE DECISÃO');
    // O campo de raciocínio precisa vir antes do status no JSON pedido,
    // para o modelo não decidir o veredito antes de analisar o código.
    const schema = prompt.slice(prompt.indexOf('PARTE 1'));
    expect(schema.indexOf('"analise"')).toBeGreaterThan(-1);
    expect(schema.indexOf('"analise"')).toBeLessThan(schema.indexOf('"status"'));
    // Nenhum exemplo de código concreto no prompt (evita enviesar o veredito).
    expect(prompt).not.toContain('sanitize(host)');
  });
});

describe('AIValidator — Fase 2 (geração dedicada do patch)', () => {
  const VULN_SEM_PATCH = '{ "analise": "entrada chega ao exec sem proteção", "status": "True Positive", "gravidade": "Alta", "explicacao": "Injeção de comando" }';
  const VULN_COM_PATCH = VULN_SEM_PATCH + '\n```javascript\nexecFile("ping", ["-c", "1", host]);\n```';
  const SEGURO = '{ "analise": "entrada escapada", "status": "False Positive", "gravidade": "Nenhuma", "explicacao": "Protegido" }';

  beforeEach(() => {
    jest.mocked(ConfigLoader.loadConfig).mockReturnValue({
      ai: { provider: 'ollama', model: 'llama3', temperature: 0, baseUrl: 'http://localhost:11434' },
      entropy: { threshold: 4.5 },
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('faz uma segunda chamada pedindo o patch quando o veredito é True Positive e veio sem código', async () => {
    const v = new AIValidator();
    const run = jest.spyOn(v as any, 'runPrompt')
      .mockResolvedValueOnce(VULN_SEM_PATCH)
      .mockResolvedValueOnce('```javascript\nexecFile("ping", ["-c", "1", host]);\n```');

    const r = await v.validateAlert('exec("ping " + host)', 'command-injection', 'ctx');

    expect(run).toHaveBeenCalledTimes(2);
    expect(r.status).toBe('True Positive');
    expect(r.correcao).toBe('execFile("ping", ["-c", "1", host]);');
  });

  it('não faz a segunda chamada quando o patch já veio na primeira resposta', async () => {
    const v = new AIValidator();
    const run = jest.spyOn(v as any, 'runPrompt').mockResolvedValueOnce(VULN_COM_PATCH);

    const r = await v.validateAlert('exec("ping " + host)', 'command-injection', 'ctx');

    expect(run).toHaveBeenCalledTimes(1);
    expect(r.correcao).toBe('execFile("ping", ["-c", "1", host]);');
  });

  it('não pede patch para False Positive', async () => {
    const v = new AIValidator();
    const run = jest.spyOn(v as any, 'runPrompt').mockResolvedValueOnce(SEGURO);

    const r = await v.validateAlert('res.send(escapeHtml(x))', 'xss', 'ctx');

    expect(run).toHaveBeenCalledTimes(1);
    expect(r.status).toBe('False Positive');
    expect(r.correcao).toBeUndefined();
  });

  it('mantém o veredito se a Fase 2 falhar', async () => {
    const v = new AIValidator();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(v as any, 'runPrompt')
      .mockResolvedValueOnce(VULN_SEM_PATCH)
      .mockRejectedValueOnce(new Error('timeout'));

    const r = await v.validateAlert('exec("ping " + host)', 'command-injection', 'ctx');

    expect(r.status).toBe('True Positive');
    expect(r.correcao).toBeUndefined();
  });
});
