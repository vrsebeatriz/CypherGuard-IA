import request from 'supertest';
import { createApp } from './app';

describe('createApp — smoke test', () => {
  it('responde 400 em /api/scan sem targetPath', async () => {
    const app = createApp();
    const response = await request(app).post('/api/scan').send({});
    expect(response.status).toBe(400);
  });

  it('responde 400 em /api/apply com parâmetros incompletos', async () => {
    const app = createApp();
    const response = await request(app).post('/api/apply').send({ filePath: 'x.js' });
    expect(response.status).toBe(400);
  });

  it('bloqueia path traversal em /api/scan com 403', async () => {
    const app = createApp();
    const response = await request(app).post('/api/scan').send({ targetPath: '../../etc' });
    expect(response.status).toBe(403);
  });

  it('bloqueia path traversal em /api/apply com 403', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/apply')
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
});

