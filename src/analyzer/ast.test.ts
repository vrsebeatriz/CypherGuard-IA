import { ASTAnalyzer } from './ast';

describe('ASTAnalyzer.isFlowSuspicious', () => {
  const analyzer = new ASTAnalyzer();

  it('marca como suspeito um dado de req.query usado sem qualquer sanitização', () => {
    const snippet = `
      const host = req.query.host;
      exec("ping -c 1 " + host, (err, stdout) => { res.send(stdout); });
    `;
    expect(analyzer.isFlowSuspicious(snippet)).toBe(true);
  });

  it('marca como seguro quando o identificador tainted é efetivamente sanitizado', () => {
    const snippet = `
      const host = req.query.host;
      const safeHost = sanitize(host);
      exec("ping -c 1 " + safeHost, (err, stdout) => { res.send(stdout); });
    `;
    expect(analyzer.isFlowSuspicious(snippet)).toBe(false);
  });

  it('REGRESSÃO: não confunde um sanitizador não relacionado com proteção real (sink fora de exec/eval/query/run)', () => {
    // Este é o caso que a v1 (heurística "existe algum sanitize() no snippet")
    // e uma v2 anterior (whitelist de sinks conhecidos) classificavam
    // incorretamente como seguro: existe um sanitize() no trecho, mas ele
    // nunca toca o dado que chega ao fs.readFile — que não está em nenhuma
    // lista fixa de "sinks perigosos".
    const snippet = `
      const file = req.query.file;
      const outraCoisa = sanitize(algumOutroValor);
      fs.readFile('/var/www/html/' + file, (err, data) => { res.send(data); });
    `;
    expect(analyzer.isFlowSuspicious(snippet)).toBe(true);
  });

  it('REGRESSÃO: o mesmo caso para um sink de XSS (res.send)', () => {
    const snippet = `
      const name = req.query.name;
      const outraCoisa = sanitize(algumOutroValor);
      res.send("<h1>Hello " + name + "</h1>");
    `;
    expect(analyzer.isFlowSuspicious(snippet)).toBe(true);
  });

  it('REGRESSÃO: o mesmo caso para desserialização insegura (unserialize)', () => {
    const snippet = `
      const data = req.body.data;
      const outraCoisa = sanitize(algumOutroValor);
      const obj = serialize.unserialize(data);
    `;
    expect(analyzer.isFlowSuspicious(snippet)).toBe(true);
  });

  it('propaga taint através de um alias simples antes de checar a sanitização', () => {
    const snippet = `
      const raw = req.params.id;
      const id = raw;
      const query = "SELECT * FROM users WHERE id = " + id;
    `;
    expect(analyzer.isFlowSuspicious(snippet)).toBe(true);
  });

  it('reconhece sanitização aplicada depois da propagação de alias', () => {
    const snippet = `
      const raw = req.params.id;
      const id = sanitize(raw);
      const query = "SELECT * FROM users WHERE id = " + id;
    `;
    expect(analyzer.isFlowSuspicious(snippet)).toBe(false);
  });

  it('trata Number() como sanitizador válido para coerção numérica', () => {
    const snippet = `
      const id = req.query.id;
      const safeId = Number(id);
      db.query('SELECT * FROM users WHERE id = ' + safeId);
    `;
    expect(analyzer.isFlowSuspicious(snippet)).toBe(false);
  });

  it('detecta vulnerabilidade quando outra variável é sanitizada, mas não a usada no sink', () => {
    const snippet = `
      const a = req.query.cmd;
      const b = req.query.other;
      sanitize(a);
      exec(b);
    `;
    expect(analyzer.isFlowSuspicious(snippet)).toBe(true);
  });

  it('considera suspeito um snippet que falha o parse (fail-safe)', () => {
    expect(analyzer.isFlowSuspicious('const x = ')).toBe(true);
  });

  it('considera suspeito quando não é possível identificar a origem do dado', () => {
    const snippet = `console.log(algumaVariavelSemOrigemConhecida);`;
    expect(analyzer.isFlowSuspicious(snippet)).toBe(true);
  });

  it('REGRESSÃO: não trata unescape() como sanitizador (é o oposto — decodifica, não protege)', () => {
    const snippet = `
      const raw = req.query.x;
      db.query("SELECT * WHERE id=" + unescape(raw));
    `;
    expect(analyzer.isFlowSuspicious(snippet)).toBe(true);
  });
});
