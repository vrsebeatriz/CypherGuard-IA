import request from 'supertest';
import { createApp } from './app';

describe('createApp — smoke test', () => {
  it('responde 400 em /api/scan sem targetPath', async () => {
    const app = createApp({ sessionToken: 'teste-token-123' });
    const response = await request(app)
      .post('/api/scan')
      .set('X-CypherGuard-Token', 'teste-token-123')
      .send({});
    expect(response.status).toBe(400);
  });

  it('responde 400 em /api/apply com parâmetros incompletos', async () => {
    const app = createApp({ sessionToken: 'teste-token-123' });
    const response = await request(app)
      .post('/api/apply')
      .set('X-CypherGuard-Token', 'teste-token-123')
      .send({ filePath: 'x.js' });
    expect(response.status).toBe(400);
  });

  it('bloqueia path traversal em /api/scan com 403', async () => {
    const app = createApp({ sessionToken: 'teste-token-123' });
    const response = await request(app)
      .post('/api/scan')
      .set('X-CypherGuard-Token', 'teste-token-123')
      .send({ targetPath: '../../etc' });
    expect(response.status).toBe(403);
  });

  it('bloqueia path traversal em /api/apply com 403', async () => {
    const app = createApp({ sessionToken: 'teste-token-123' });
    const response = await request(app)
      .post('/api/apply')
      .set('X-CypherGuard-Token', 'teste-token-123')
      .send({ filePath: '../../etc/passwd', startLine: 1, endLine: 1, correction: 'x' });
    expect(response.status).toBe(403);
  });

  it('não expõe mais cabeçalho de CORS irrestrito', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/scan')
      .set('Origin', 'https://site-malicioso.example')
      .send({});
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejeita /api/scan sem token de sessão com 401', async () => {
    const app = createApp({ sessionToken: 'teste-token-123' });
    const response = await request(app).post('/api/scan').send({ targetPath: '.' });
    expect(response.status).toBe(401);
  });

  it('aceita /api/scan quando o token de sessão correto é enviado', async () => {
    const app = createApp({ sessionToken: 'teste-token-123' });
    const response = await request(app)
      .post('/api/scan')
      .set('X-CypherGuard-Token', 'teste-token-123')
      .send({});
    // Ainda deve falhar por targetPath ausente (400), não por autenticação (401):
    expect(response.status).toBe(400);
  });

  it('serve a página inicial com o token injetado em uma <meta>', async () => {
    const app = createApp({ sessionToken: 'teste-token-123' });
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('<meta name="cg-token" content="teste-token-123">');
  });

  it('não expõe o token em rotas inexistentes (404 real)', async () => {
    const app = createApp({ sessionToken: 'teste-token-123' });
    const response = await request(app).get('/rota/que/nao/existe');
    expect(response.status).toBe(404);
    expect(response.text).not.toContain('cg-token');
    expect(response.text).not.toContain('teste-token-123');
  });

  it('não expõe o token em asset estático inexistente', async () => {
    const app = createApp({ sessionToken: 'teste-token-123' });
    const response = await request(app).get('/nao-existe.js');
    expect(response.status).toBe(404);
    expect(response.text).not.toContain('teste-token-123');
  });

  it('rejeita payload de scan maior que 2 MB com 413', async () => {
    const app = createApp({ sessionToken: 'teste-token-123' });
    const big = 'x'.repeat(3 * 1024 * 1024);
    const response = await request(app)
      .post('/api/scan')
      .set('X-CypherGuard-Token', 'teste-token-123')
      .send({ targetPath: big });
    expect(response.status).toBe(413);
  });

  it('aplica rate limiting nas rotas /api/*', async () => {
    const app = createApp({
      sessionToken: 'teste-token-123',
      rateLimit: { windowMs: 60_000, max: 3 },
    });

    let status = 0;
    for (let i = 0; i < 4; i++) {
      const response = await request(app)
        .post('/api/scan')
        .set('X-CypherGuard-Token', 'teste-token-123')
        .send({});
      status = response.status;
    }

    expect(status).toBe(429);
  });
});
