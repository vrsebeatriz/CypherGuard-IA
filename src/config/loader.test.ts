import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigLoader } from './loader';

describe('ConfigLoader.loadConfig', () => {
  it('retorna a configuração padrão quando o arquivo não existe', () => {
    const config = ConfigLoader.loadConfig(path.join(os.tmpdir(), 'arquivo-inexistente-xyz.yml'));
    expect(config.ollama.model).toBe('llama3');
    expect(config.entropy.threshold).toBe(4.5);
  });

  it('mescla valores customizados do YAML com os padrões', () => {
    const tmpPath = path.join(os.tmpdir(), `cypherguard-config-test-${Date.now()}.yml`);
    fs.writeFileSync(tmpPath, "ollama:\n  model: 'mistral'\nentropy:\n  threshold: 5.0\n");

    const config = ConfigLoader.loadConfig(tmpPath);

    expect(config.ollama.model).toBe('mistral');
    expect(config.ollama.baseUrl).toBe('http://localhost:11434');
    expect(config.entropy.threshold).toBe(5.0);

    fs.unlinkSync(tmpPath);
  });

  it('recorre aos padrões se o YAML estiver malformado', () => {
    const tmpPath = path.join(os.tmpdir(), `cypherguard-config-broken-${Date.now()}.yml`);
    fs.writeFileSync(tmpPath, 'ollama: [ isso não é: um mapa válido');

    const config = ConfigLoader.loadConfig(tmpPath);

    expect(config.ollama.model).toBe('llama3');

    fs.unlinkSync(tmpPath);
  });
});
