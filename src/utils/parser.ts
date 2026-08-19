import JSON5 from 'json5';
import chalk from 'chalk';
import { AIValidationResult } from '../types';

export class ParserUtils {
  /**
   * Extrai o JSON e o código corrigido da resposta bruta do LLM.
   */
  public static extractValidationResult(llmResponse: string): AIValidationResult {
    let cleanString = llmResponse.trim();

    // EXTRAÇÃO 1: O Objeto JSON
    const jsonStartIndex = cleanString.indexOf('{');
    const jsonEndIndex = cleanString.indexOf('}'); // Pegamos a primeira ocorrência do fechamento
    
    if (jsonStartIndex === -1 || jsonEndIndex === -1 || jsonStartIndex >= jsonEndIndex) {
      throw new Error('Não foi possível localizar as chaves do objeto JSON na resposta.');
    }

    const jsonStr = cleanString.substring(jsonStartIndex, jsonEndIndex + 1);
    
    let parsedResult: AIValidationResult;
    try {
      const tempObj = JSON5.parse(jsonStr);
      parsedResult = {
        status: tempObj.status || 'Unknown',
        gravidade: tempObj.gravidade || 'Nenhuma',
        explicacao: tempObj.explicacao || 'Sem explicação',
        correcao: undefined // Será preenchido na Extração 2
      };
    } catch (e: any) {
      console.error(chalk.red(`[Erro IA] Falha no Parse do Metadado JSON. Erro: ${e.message}`));
      throw e;
    }

    // EXTRAÇÃO 2: O Código Corrigido (se houver)
    if (parsedResult.status === 'True Positive') {
      const codeBlockRegex = /```(?:javascript|js)?\s*\n([\s\S]*?)\n\s*```/i;
      const codeMatch = cleanString.match(codeBlockRegex);
      
      if (codeMatch && codeMatch[1]) {
        parsedResult.correcao = codeMatch[1].trim();
      } else {
        // Fallback: se o LLM não usou crases mas colocou código depois do JSON
        const afterJson = cleanString.substring(jsonEndIndex + 1).trim();
        if (afterJson.length > 5) { // Evita pegar espaços ou lixo
           parsedResult.correcao = afterJson;
        }
      }
    }

    return parsedResult;
  }
}
