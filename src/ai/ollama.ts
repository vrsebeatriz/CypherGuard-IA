import { ChatOllama } from '@langchain/ollama';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { AIValidationResult, CypherConfig } from '../types';
import { ConfigLoader } from '../config/loader';
import { KnowledgeBase } from './knowledge';
import chalk from 'chalk';
import JSON5 from 'json5';

export class OllamaValidator {
  private llm: ChatOllama;
  private config: CypherConfig;

  constructor() {
    this.config = ConfigLoader.loadConfig();
    this.llm = new ChatOllama({
      baseUrl: this.config.ollama.baseUrl,
      model: this.config.ollama.model,
      temperature: 0,
    });
  }

  /**
   * Envia um alerta suspeito para validação do LLM.
   */
  public async validateAlert(
    codeSnippet: string,
    vulnerability: string,
    context: string
  ): Promise<AIValidationResult> {
    const parser = new StringOutputParser();

    const prompt = PromptTemplate.fromTemplate(`
Você é um auditor de segurança sênior. Sua tarefa é validar se um alerta de segurança é um Verdadeiro Positivo ou Falso Positivo.

DIRETRIZES DE SEGURANÇA:
{guidelines}

ALERTA:
- Vulnerabilidade: {vulnerability}
- Contexto: {context}

CÓDIGO:
--- INICIO DO CODIGO ---
{codeSnippet}
--- FIM DO CODIGO ---

INSTRUÇÃO DE SAÍDA:
Você deve retornar SUA RESPOSTA EM DUAS PARTES ESTRITAMENTE SEPARADAS:

PARTE 1: Um objeto JSON contendo APENAS metadados. Não inclua código aqui.
{{
  "status": "True Positive" | "False Positive",
  "gravidade": "Alta" | "Media" | "Baixa" | "Nenhuma",
  "explicacao": "Breve explicação técnica"
}}

PARTE 2: Se o status for "True Positive", forneça o código corrigido EXATAMENTE dentro de um bloco de código markdown, logo ABAIXO do JSON. Se for False Positive, não escreva a Parte 2.
Exemplo da Parte 2:
\`\`\`javascript
// seu código corrigido aqui
\`\`\`
`);

    const chain = prompt.pipe(this.llm).pipe(parser);
    
    try {
      const resultString = await chain.invoke({
        guidelines: KnowledgeBase.getSecurityGuidelines(),
        vulnerability,
        context,
        codeSnippet,
      });

      let cleanString = resultString.trim();

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
        const codeBlockRegex = /```(?:javascript|js)?\n([\s\S]*?)\n```/i;
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

    } catch (error: any) {
      console.error(chalk.red(`\n[Erro IA] Falha na extração de dupla fase: ${error.message}`));
      
      return {
        status: 'Unknown',
        gravidade: 'Nenhuma',
        explicacao: `Erro no processamento da IA: ${error.message}`,
      };
    }
  }
}





