import { ASTAnalyzer } from './ast';

describe('ASTAnalyzer.isFlowSuspicious', () => {
  let analyzer: ASTAnalyzer;

  beforeEach(() => {
    analyzer = new ASTAnalyzer();
  });

  it('considera suspeito quando há exec() sem sanitização', () => {
    const code = `
      const a = req.query.cmd;
      exec(a);
    `;
    expect(analyzer.isFlowSuspicious(code)).toBe(true);
  });

  it('detecta mitigação quando a variável passada ao exec é sanitizada antes', () => {
    const code = `
      const a = req.query.cmd;
      const b = sanitize(a);
      exec(b);
    `;
    expect(analyzer.isFlowSuspicious(code)).toBe(false);
  });

  it('detecta vulnerabilidade quando outra variável é sanitizada, mas não a do exec', () => {
    const code = `
      const a = req.query.cmd;
      const b = req.query.other;
      sanitize(a);
      exec(b);
    `;
    expect(analyzer.isFlowSuspicious(code)).toBe(true);
  });

  it('suporta TemplateLiteral com variável sanitizada', () => {
    const code = `
      const a = req.query.cmd;
      const b = escape(a);
      exec(\`ping \${b}\`);
    `;
    expect(analyzer.isFlowSuspicious(code)).toBe(false);
  });

  it('falha se o TemplateLiteral tiver uma variável não sanitizada', () => {
    const code = `
      const a = req.query.cmd;
      const b = escape(a);
      const c = req.query.untrusted;
      exec(\`ping \${b} \${c}\`);
    `;
    expect(analyzer.isFlowSuspicious(code)).toBe(true);
  });

  it('fallback para heurística antiga se não achar sink conhecido', () => {
    const code = `
      const a = req.query.cmd;
      const b = sanitize(a);
      unknownSink(b);
    `;
    expect(analyzer.isFlowSuspicious(code)).toBe(false);
  });

  it('considera suspeito se falhar no parse', () => {
    const code = `const a = ;`;
    expect(analyzer.isFlowSuspicious(code)).toBe(true);
  });
});
