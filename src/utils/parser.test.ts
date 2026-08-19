import { ParserUtils } from './parser';

describe('ParserUtils.extractValidationResult', () => {
  it('extrai um JSON válido sem código', () => {
    const input = `{
      "status": "False Positive",
      "gravidade": "Nenhuma",
      "explicacao": "Tudo certo"
    }`;
    const result = ParserUtils.extractValidationResult(input);
    expect(result.status).toBe('False Positive');
    expect(result.gravidade).toBe('Nenhuma');
    expect(result.explicacao).toBe('Tudo certo');
    expect(result.correcao).toBeUndefined();
  });

  it('extrai JSON mesmo com lixo antes e depois', () => {
    const input = `Aqui está minha resposta:
    {
      "status": "False Positive"
    }
    Espero que ajude.`;
    const result = ParserUtils.extractValidationResult(input);
    expect(result.status).toBe('False Positive');
  });

  it('extrai código corrigido quando True Positive e há crases', () => {
    const input = `{
      "status": "True Positive",
      "gravidade": "Alta",
      "explicacao": "Vulnerável"
    }
    \`\`\`javascript
    const x = safe();
    \`\`\`
    `;
    const result = ParserUtils.extractValidationResult(input);
    expect(result.status).toBe('True Positive');
    expect(result.correcao).toBe('const x = safe();');
  });

  it('extrai código como fallback quando True Positive e NÃO há crases', () => {
    const input = `{
      "status": "True Positive",
      "gravidade": "Alta",
      "explicacao": "Vulnerável"
    }
    const x = fallback();
    `;
    const result = ParserUtils.extractValidationResult(input);
    expect(result.status).toBe('True Positive');
    expect(result.correcao).toBe('const x = fallback();');
  });

  it('lança erro se o JSON for malformado e não puder ser parseado (além do JSON5)', () => {
    const input = `{ "status": "True Positive", erro_aqui }`;
    expect(() => ParserUtils.extractValidationResult(input)).toThrow();
  });

  it('lança erro se não houver chaves de JSON na resposta', () => {
    const input = `Apenas texto, sem JSON.`;
    expect(() => ParserUtils.extractValidationResult(input)).toThrow('Não foi possível localizar as chaves do objeto JSON na resposta.');
  });
});
