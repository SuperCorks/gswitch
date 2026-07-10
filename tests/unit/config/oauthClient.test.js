import { describe, expect, it } from 'vitest';
import fs from 'fs';
import { fileURLToPath } from 'url';

const clientFile = fileURLToPath(
  new URL('../../../src/config/google-oauth-client.json', import.meta.url)
);

describe('bundled OAuth client', () => {
  it('contains a complete Desktop client for standalone Workspace login', () => {
    const clientJson = JSON.parse(fs.readFileSync(clientFile, 'utf8'));
    const client = clientJson.installed;

    expect(client).toBeDefined();
    expect(client.client_id).toMatch(/\.apps\.googleusercontent\.com$/);
    expect(client.client_secret).toBeTypeOf('string');
    expect(client.client_secret.length).toBeGreaterThan(0);
    expect(client.redirect_uris).toContain('http://localhost');
    expect(client).not.toHaveProperty('access_token');
    expect(client).not.toHaveProperty('refresh_token');
  });
});
