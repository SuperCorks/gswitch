import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { gws } from '../../../src/lib/gws.js';
import * as execaModule from 'execa';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { PassThrough } from 'stream';
import { GWS_IDENTITY_SCOPES } from '../../../src/lib/oauthScopes.js';
import { profiles } from '../../../src/lib/profiles.js';

vi.mock('execa');
vi.mock('fs/promises');
vi.mock('os');

describe('lib/gws', () => {
  const mockHome = '/home/user';

  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue(mockHome);
    vi.spyOn(profiles, 'ensureProfile').mockResolvedValue(
      path.join(mockHome, '.config/gswitch/profiles/personal')
    );
    vi.spyOn(profiles, 'migrateLegacyGwsCredentials').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
      {
        stdin: 'inherit',
        stdout: 'pipe',
        stderr: 'pipe'
      }
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
      {
        stdin: 'inherit',
        stdout: 'pipe',
        stderr: 'pipe'
      }
    );
  });

  it('opens the emitted gws OAuth URL in the default browser', async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    let resolveChild;
    const child = new Promise(resolve => {
      resolveChild = resolve;
    });
    child.stdout = stdout;
    child.stderr = stderr;

    vi.mocked(execaModule.execa)
      .mockResolvedValueOnce({ exitCode: 0, failed: false })
      .mockImplementationOnce(() => child);

    const launchSpy = vi.spyOn(gws, 'launchOAuthUrl').mockResolvedValue(undefined);
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const url = 'https://accounts.google.com/o/oauth2/auth?foo=bar';

    const loginPromise = gws.login();
    stdout.write(`Open this URL:\n${url}\n`);
    await new Promise(resolve => setImmediate(resolve));
    resolveChild({ exitCode: 0 });
    await loginPromise;

    expect(launchSpy).toHaveBeenCalledWith(url, {});

    stdoutWrite.mockRestore();
  });

  it('opens the emitted gws OAuth URL in Chrome incognito for private login', async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    let resolveChild;
    const child = new Promise(resolve => {
      resolveChild = resolve;
    });
    child.stdout = stdout;
    child.stderr = stderr;

    vi.mocked(execaModule.execa)
      .mockResolvedValueOnce({ exitCode: 0, failed: false })
      .mockImplementationOnce(() => child);

    const launchSpy = vi.spyOn(gws, 'launchOAuthUrl').mockResolvedValue(undefined);
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const url = 'https://accounts.google.com/o/oauth2/auth?foo=bar';

    const loginPromise = gws.login({ private: true });
    stdout.write(`Open this URL:\n${url}\n`);
    await new Promise(resolve => setImmediate(resolve));
    resolveChild({ exitCode: 0 });
    await loginPromise;

    expect(launchSpy).toHaveBeenCalledWith(url, { private: true });

    stdoutWrite.mockRestore();
  });

  it('uses the default browser for standard gws OAuth URLs', async () => {
    const url = 'https://accounts.google.com/o/oauth2/auth?foo=bar';
    const launchSpy = vi.spyOn(gws, 'launchDefaultBrowser').mockResolvedValue(undefined);

    await gws.launchOAuthUrl(url);

    expect(launchSpy).toHaveBeenCalledWith(url);
  });

  it('uses Chrome incognito for private gws OAuth URLs', async () => {
    const url = 'https://accounts.google.com/o/oauth2/auth?foo=bar';
    const launchSpy = vi.spyOn(gws, 'launchChromePrivate').mockResolvedValue(undefined);

    await gws.launchOAuthUrl(url, { private: true });

    expect(launchSpy).toHaveBeenCalledWith(url);
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
        stdin: 'inherit',
        stdout: 'pipe',
        stderr: 'pipe',
        env: expect.objectContaining({
          GOOGLE_WORKSPACE_CLI_CLIENT_ID: 'client-id.apps.googleusercontent.com',
          GOOGLE_WORKSPACE_CLI_CLIENT_SECRET: 'client-secret'
        })
      }
    );
  });

  it('passes OAuth client IDs through environment variables without requiring a secret', async () => {
    vi.mocked(execaModule.execa)
      .mockResolvedValueOnce({ exitCode: 0, failed: false })
      .mockResolvedValueOnce({ stdout: '' });
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
      installed: {
        client_id: 'client-id.apps.googleusercontent.com'
      }
    }));

    await expect(gws.login({
      scopes: 'scope-a',
      clientIdFile: '/tmp/client_id.json'
    })).resolves.toBe(true);

    expect(execaModule.execa).toHaveBeenNthCalledWith(
      2,
      'gws',
      ['auth', 'login', `--scopes=${[...GWS_IDENTITY_SCOPES, 'scope-a'].join(',')}`],
      {
        stdin: 'inherit',
        stdout: 'pipe',
        stderr: 'pipe',
        env: expect.objectContaining({
          GOOGLE_WORKSPACE_CLI_CLIENT_ID: 'client-id.apps.googleusercontent.com'
        })
      }
    );
    expect(execaModule.execa.mock.calls[1][2].env).not.toHaveProperty('GOOGLE_WORKSPACE_CLI_CLIENT_SECRET');
  });

  it('detects whether an OAuth client file contains a secret', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
      installed: {
        client_id: 'client-id.apps.googleusercontent.com',
        client_secret: 'client-secret'
      }
    }));

    await expect(gws.hasClientSecret('/tmp/client_secret.json')).resolves.toBe(true);

    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
      installed: {
        client_id: 'client-id.apps.googleusercontent.com'
      }
    }));

    await expect(gws.hasClientSecret('/tmp/client_id.json')).resolves.toBe(false);
  });

  it('installs OAuth client config when it contains a secret', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
      installed: {
        client_id: 'client-id.apps.googleusercontent.com',
        client_secret: 'client-secret'
      }
    }));
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.copyFile).mockResolvedValue(undefined);
    vi.mocked(fs.chmod).mockResolvedValue(undefined);

    await expect(gws.installClientConfig('/tmp/client_secret.json')).resolves.toBe(true);

    expect(fs.copyFile).toHaveBeenCalledWith(
      '/tmp/client_secret.json',
      path.join(mockHome, '.config/gws/client_secret.json')
    );
    expect(fs.chmod).toHaveBeenCalledWith(
      path.join(mockHome, '.config/gws/client_secret.json'),
      0o600
    );
  });

  it('does not install OAuth client config when it has no secret', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
      installed: {
        client_id: 'client-id.apps.googleusercontent.com'
      }
    }));

    await expect(gws.installClientConfig('/tmp/client_id.json')).resolves.toBe(false);

    expect(fs.copyFile).not.toHaveBeenCalled();
    expect(fs.chmod).not.toHaveBeenCalled();
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
      path.join(mockHome, '.config/gswitch/profiles/personal/gws/credentials.enc')
    );
    expect(fs.copyFile).toHaveBeenCalledWith(
      path.join(mockHome, '.config/gws/credentials.json'),
      path.join(mockHome, '.config/gswitch/profiles/personal/gws/credentials.json')
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
      path.join(mockHome, '.config/gswitch/profiles/personal/gws/credentials.enc'),
      path.join(mockHome, '.config/gws/credentials.enc')
    );
    expect(fs.rm).toHaveBeenCalledWith(
      path.join(mockHome, '.config/gws/credentials.json'),
      { force: true }
    );
    expect(fs.rm).toHaveBeenCalledWith(
      path.join(mockHome, '.config/gws/token_cache.json'),
      { force: true }
    );
  });

  it('returns false when no saved credentials exist', async () => {
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
    vi.spyOn(profiles, 'ensureAdc').mockResolvedValue(null);

    await expect(gws.updateCredentials('personal')).resolves.toBe(false);
    expect(fs.copyFile).not.toHaveBeenCalled();
  });

  it('falls back to the profile ADC when no dedicated gws credential exists', async () => {
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(fs.copyFile).mockResolvedValue(undefined);
    vi.mocked(fs.chmod).mockResolvedValue(undefined);
    vi.mocked(fs.rm).mockResolvedValue(undefined);
    vi.spyOn(profiles, 'ensureAdc').mockResolvedValue('/profiles/personal/adc.json');

    await expect(gws.updateCredentials('personal')).resolves.toBe(true);

    expect(fs.copyFile).toHaveBeenCalledWith(
      '/profiles/personal/adc.json',
      path.join(mockHome, '.config/gswitch/profiles/personal/gws/credentials.json')
    );
    expect(fs.copyFile).toHaveBeenCalledWith(
      path.join(mockHome, '.config/gswitch/profiles/personal/gws/credentials.json'),
      path.join(mockHome, '.config/gws/credentials.json')
    );
  });

  it('stores ADC as the profile gws credential and removes a dedicated token', async () => {
    vi.mocked(fs.copyFile).mockResolvedValue(undefined);
    vi.mocked(fs.chmod).mockResolvedValue(undefined);
    vi.mocked(fs.rm).mockResolvedValue(undefined);

    await expect(gws.useAdcCredentials('personal', '/profiles/personal/adc.json')).resolves.toBe(true);

    expect(fs.copyFile).toHaveBeenCalledWith(
      '/profiles/personal/adc.json',
      path.join(mockHome, '.config/gswitch/profiles/personal/gws/credentials.json')
    );
    expect(fs.rm).toHaveBeenCalledWith(
      path.join(mockHome, '.config/gswitch/profiles/personal/gws/credentials.enc'),
      { force: true }
    );
  });
});
