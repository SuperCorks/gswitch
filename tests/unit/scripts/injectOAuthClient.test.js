import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  injectOAuthClient,
  parseOAuthClient,
  verifyOAuthClientFile
} from '../../../scripts/inject-oauth-client.js';

const validClient = {
  installed: {
    client_id: 'example.apps.googleusercontent.com',
    client_secret: 'desktop-client-value',
    redirect_uris: ['http://localhost']
  }
};

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('OAuth client release injection', () => {
  it('writes a validated Desktop client with owner-only permissions', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gswitch-oauth-'));
    const outputFile = path.join(directory, 'config', 'google-oauth-client.json');
    temporaryDirectories.push(directory);

    injectOAuthClient(JSON.stringify(validClient), outputFile);

    expect(JSON.parse(fs.readFileSync(outputFile, 'utf8'))).toEqual(validClient);
    expect(fs.statSync(outputFile).mode & 0o777).toBe(0o600);
    expect(verifyOAuthClientFile(outputFile)).toBe(outputFile);
  });

  it('rejects missing or malformed release secrets', () => {
    expect(() => parseOAuthClient()).toThrow('GSWITCH_OAUTH_CLIENT_JSON is required');
    expect(() => parseOAuthClient('{')).toThrow('must contain valid JSON');
    expect(() => parseOAuthClient('{}')).toThrow('installed Desktop client');
  });

  it('rejects OAuth payloads containing user tokens', () => {
    const clientWithToken = {
      ...validClient,
      installed: {
        ...validClient.installed,
        refresh_token: 'must-not-ship'
      }
    };

    expect(() => parseOAuthClient(JSON.stringify(clientWithToken))).toThrow(
      'must not contain refresh_token'
    );
  });

  it('blocks publishing when the bundled client is missing', () => {
    expect(() => verifyOAuthClientFile('/missing/google-oauth-client.json')).toThrow(
      'bundled OAuth client is missing'
    );
  });
});
