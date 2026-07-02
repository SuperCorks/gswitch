import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { gws } from '../../../src/lib/gws.js';
import * as execaModule from 'execa';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { GWS_IDENTITY_SCOPES } from '../../../src/lib/oauthScopes.js';

vi.mock('execa');
vi.mock('fs/promises');
vi.mock('os');

describe('lib/gws', () => {
  const mockHome = '/home/user';

  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue(mockHome);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('detects when gws is installed', async () => {
    vi.mocked(execaModule.execa).mockResolvedValue({ exitCode: 0, failed: false });

    await expect(gws.isInstalled()).resolves.toBe(true);
    expect(execaModule.execa).toHaveBeenCalledWith(
      'gws',
      ['--help'],
      {
        reject: false,
        stdout: 'ignore',
        stderr: 'ignore',
        timeout: 5000
      }
    );
  });

  it('detects when gws is not installed', async () => {
    vi.mocked(execaModule.execa).mockRejectedValue(new Error('ENOENT'));

    await expect(gws.isInstalled()).resolves.toBe(false);
  });

  it('runs gws auth login with custom scopes when installed', async () => {
    vi.mocked(execaModule.execa)
      .mockResolvedValueOnce({ exitCode: 0, failed: false })
      .mockResolvedValueOnce({ stdout: '' });

    await expect(gws.login({ scopes: 'scope-a,scope-b' })).resolves.toBe(true);

    expect(execaModule.execa).toHaveBeenNthCalledWith(
      2,
      'gws',
      ['auth', 'login', `--scopes=${[...GWS_IDENTITY_SCOPES, 'scope-a', 'scope-b'].join(',')}`],
      { stdio: 'inherit' }
    );
  });

  it('uses identity-only scopes for plain gws login', async () => {
    vi.mocked(execaModule.execa)
      .mockResolvedValueOnce({ exitCode: 0, failed: false })
      .mockResolvedValueOnce({ stdout: '' });

    await expect(gws.login()).resolves.toBe(true);

    expect(execaModule.execa).toHaveBeenNthCalledWith(
      2,
      'gws',
      ['auth', 'login', `--scopes=${GWS_IDENTITY_SCOPES.join(',')}`],
      { stdio: 'inherit' }
    );
  });

  it('passes OAuth client file credentials through environment variables', async () => {
    vi.mocked(execaModule.execa)
      .mockResolvedValueOnce({ exitCode: 0, failed: false })
      .mockResolvedValueOnce({ stdout: '' });
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
      installed: {
        client_id: 'client-id.apps.googleusercontent.com',
        client_secret: 'client-secret'
      }
    }));

    await expect(gws.login({
      scopes: 'scope-a',
      clientIdFile: '/tmp/client_secret.json'
    })).resolves.toBe(true);

    expect(execaModule.execa).toHaveBeenNthCalledWith(
      2,
      'gws',
      ['auth', 'login', `--scopes=${[...GWS_IDENTITY_SCOPES, 'scope-a'].join(',')}`],
      {
        stdio: 'inherit',
        env: expect.objectContaining({
          GOOGLE_WORKSPACE_CLI_CLIENT_ID: 'client-id.apps.googleusercontent.com',
          GOOGLE_WORKSPACE_CLI_CLIENT_SECRET: 'client-secret'
        })
      }
    );
  });

  it('skips login when gws is not installed', async () => {
    vi.mocked(execaModule.execa).mockRejectedValue(new Error('ENOENT'));

    await expect(gws.login({ scopes: 'scope-a' })).resolves.toBe(false);
    expect(execaModule.execa).toHaveBeenCalledTimes(1);
  });

  it('saves active encrypted and plain credentials for an account', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.copyFile).mockResolvedValue(undefined);

    await expect(gws.saveCredentials('personal')).resolves.toBe(true);

    expect(fs.copyFile).toHaveBeenCalledWith(
      path.join(mockHome, '.config/gws/credentials.enc'),
      path.join(mockHome, '.config/gws/credentials_personal.enc')
    );
    expect(fs.copyFile).toHaveBeenCalledWith(
      path.join(mockHome, '.config/gws/credentials.json'),
      path.join(mockHome, '.config/gws/credentials_personal.json')
    );
  });

  it('restores saved credentials and clears stale active credential files', async () => {
    vi.mocked(fs.access)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('ENOENT'));
    vi.mocked(fs.copyFile).mockResolvedValue(undefined);
    vi.mocked(fs.rm).mockResolvedValue(undefined);

    await expect(gws.updateCredentials('personal')).resolves.toBe(true);

    expect(fs.copyFile).toHaveBeenCalledWith(
      path.join(mockHome, '.config/gws/credentials_personal.enc'),
      path.join(mockHome, '.config/gws/credentials.enc')
    );
    expect(fs.rm).toHaveBeenCalledWith(
      path.join(mockHome, '.config/gws/credentials.json'),
      { force: true }
    );
  });

  it('returns false when no saved credentials exist', async () => {
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

    await expect(gws.updateCredentials('personal')).resolves.toBe(false);
    expect(fs.copyFile).not.toHaveBeenCalled();
  });
});
