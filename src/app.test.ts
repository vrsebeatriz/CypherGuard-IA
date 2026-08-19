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
});
