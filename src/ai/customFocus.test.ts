import { getCustomFocus } from './customFocus';

describe('getCustomFocus', () => {
  const customPrompts = {
    'sql-injection': 'Foque especialmente em identificar se há uso de query builders como Knex ou Sequelize.',
  };

  it('retorna string vazia quando não há customPrompts configurados', () => {
    expect(getCustomFocus(undefined, 'javascript.lang.security.audit.sql-injection')).toBe('');
  });

  it('retorna string vazia quando nenhuma chave corresponde à regra violada', () => {
    expect(getCustomFocus(customPrompts, 'javascript.lang.security.audit.command-injection')).toBe('');
  });

  it('REGRESSÃO: casa a chave curta contra o check_id completo do Semgrep (não é um lookup de chave exata)', () => {
    // Semgrep nunca emite um check_id igual a "sql-injection" puro — é sempre
    // um caminho qualificado como abaixo. Um lookup de chave exata
    // (customPrompts[vulnerability]) nunca ativaria esta regra.
    const result = getCustomFocus(customPrompts, 'javascript.lang.security.audit.sql-injection.sequelize-sqli');
    expect(result).toContain('Knex ou Sequelize');
  });

  it('a correspondência de chave não diferencia maiúsculas de minúsculas', () => {
    const result = getCustomFocus({ 'SQL-INJECTION': 'foco X' }, 'sql-injection-rule');
    expect(result).toContain('foco X');
  });
});
