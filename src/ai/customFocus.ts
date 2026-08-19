import { CypherConfig } from '../types';

/**
 * Procura, entre as chaves de rules.customPrompts, a primeira que aparece como
 * substring do check_id da regra violada (ex.: a chave "sql-injection" deve
 * casar com o check_id completo do Semgrep
 * "javascript.lang.security.audit.sql-injection.sequelize-sqli"), e devolve
 * um bloco de instrução extra para o prompt. Retorna string vazia se não
 * houver customPrompts ou nenhum match.
 */
export function getCustomFocus(
  customPrompts: CypherConfig['rules']['customPrompts'],
  vulnerability: string
): string {
  if (!customPrompts) return '';

  const matchKey = Object.keys(customPrompts).find((key) =>
    vulnerability.toLowerCase().includes(key.toLowerCase())
  );

  return matchKey ? `DIRETRIZES CUSTOMIZADAS DA EQUIPE:\n${customPrompts[matchKey]}\n` : '';
}
