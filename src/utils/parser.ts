import JSON5 from 'json5';
import chalk from 'chalk';
import { z } from 'zod';
import { AIValidationResult } from '../types';

/**
 * Schema estruturado da resposta da IA. Qualquer saída fora deste contrato é
 * rejeitada (fail-safe → status "Unknown" na camada chamadora), impedindo que
 * uma resposta malformada ou manipulada vire um "True Positive" silencioso.
 */
const AIValidationSchema = z.object({
  status: z.enum(['True Positive', 'False Positive', 'Unknown']),
  gravidade: z.enum(['Alta', 'Media', 'Baixa', 'Nenhuma']).default('Nenhuma'),
  explicacao: z.string().default('Sem explicação'),
  correcao: z.string().optional(),
});

/**
 * Localiza o primeiro objeto JSON top-level em `text`, respeitando aninhamento
 * de chaves e conteúdo de strings, e retorna o substring correspondente
 * completo (chaves balanceadas). Retorna null se não encontrar um objeto
 * bem-formado.
 */
function extractBalancedJson(text: string): { json: string; endIndex: number } | null {
  const startIndex = text.indexOf('{');
  if (startIndex === -1) return null;

  let depth = 0;
  let inString = false;
  let stringQuote = '';
  let escaped = false;

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === stringQuote) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      stringQuote = char;
      continue;
    }

    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) {
        return { json: text.slice(startIndex, i + 1), endIndex: i };
      }
    }
  }

  return null;
}

export class ParserUtils {
  /**
   * Extrai o conteúdo do primeiro bloco de código cercado por ``` que não seja
   * JSON. Usado pela Fase 2 (chamada dedicada ao patch). Se não houver cercas,
   * devolve o texto inteiro (aparado), ou undefined se estiver vazio.
   */
  public static extractCodeBlock(text: string): string | undefined {
    const fenceRegex = /```([A-Za-z]*)[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```/g;
    let match: RegExpExecArray | null;
    while ((match = fenceRegex.exec(text)) !== null) {
      if (match[1].toLowerCase() === 'json') continue;
      const body = match[2].trim();
      if (body) return body;
    }
    const plain = text.replace(/```[A-Za-z]*/g, '').trim();
    return plain.length > 0 ? plain : undefined;
  }

  /**
   * Extrai o JSON e o código corrigido da resposta bruta do LLM.
   */
  public static extractValidationResult(llmResponse: string): AIValidationResult {
    const cleanString = llmResponse.trim();

    // EXTRAÇÃO 1: O Objeto JSON (chaves balanceadas, não apenas a primeira '{' até a primeira '}')
    const extracted = extractBalancedJson(cleanString);

    if (!extracted) {
      throw new Error('Não foi possível localizar as chaves do objeto JSON na resposta.');
    }

    const { json: jsonStr, endIndex: jsonEndIndex } = extracted;

    let parsedResult: AIValidationResult;
    try {
      const tempObj = JSON5.parse(jsonStr);
      const schemaResult = AIValidationSchema.safeParse(tempObj);
      if (!schemaResult.success) {
        throw new Error(`Resposta da IA fora do schema esperado: ${schemaResult.error.message}`);
      }
      parsedResult = schemaResult.data;
    } catch (e: any) {
      console.error(chalk.red(`[Erro IA] Falha no Parse do Metadado JSON. Erro: ${e.message}`));
      throw e;
    }

    // EXTRAÇÃO 2: O Código Corrigido (se houver)
    if (parsedResult.status === 'True Positive') {
      // Percorre todos os blocos cercados por ``` e escolhe o primeiro que NÃO
      // é o próprio JSON. Antes, uma única regex não-global casava com a cerca
      // de FECHAMENTO de um bloco ```json, e o patch extraído passava a começar
      // com a linha "```javascript" — o que o tornava sintaticamente inválido.
      const fenceRegex = /```([A-Za-z]*)[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```/g;
      let code: string | undefined;
      let match: RegExpExecArray | null;
      while ((match = fenceRegex.exec(cleanString)) !== null) {
        const lang = match[1].toLowerCase();
        const body = match[2];
        if (lang === 'json' || body.includes(jsonStr)) continue;
        code = body.trim();
        break;
      }

      if (code) {
        parsedResult.correcao = code;
      } else {
        // Fallback: o LLM não usou crases mas colocou código depois do JSON.
        // Remove uma eventual cerca de fechamento do bloco do JSON.
        const afterJson = cleanString
          .substring(jsonEndIndex + 1)
          .replace(/^\s*```[ \t]*/, '')
          .trim();
        if (afterJson.length > 5) { // Evita pegar espaços ou lixo
           parsedResult.correcao = afterJson;
        }
      }
    }

    return parsedResult;
  }
}
