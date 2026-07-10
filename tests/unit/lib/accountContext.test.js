import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as execaModule from 'execa';
import { accountContext } from '../../../src/lib/accountContext.js';
import { gcloud } from '../../../src/lib/gcloud.js';
import { profiles } from '../../../src/lib/profiles.js';

vi.mock('execa');

describe('lib/accountContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GOOGLE_WORKSPACE_CLI_TOKEN;
    delete process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE;
    delete process.env.CLOUDSDK_CORE_ACCOUNT;
    delete process.env.CLOUDSDK_CORE_PROJECT;
  });

  it('runs commands with a scoped account environment and preserves arguments', async () => {
    process.env.GOOGLE_WORKSPACE_CLI_TOKEN = 'stale-parent-token';
    process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE = '/wrong/account.json';
    process.env.CLOUDSDK_CORE_ACCOUNT = 'wrong@example.com';
    process.env.CLOUDSDK_CORE_PROJECT = 'wrong-project';
    vi.spyOn(gcloud, 'configurationExists').mockResolvedValue(true);
    vi.spyOn(profiles, 'getScopedEnvironment').mockResolvedValue({
      GSWITCH_PROFILE: 'rk',
      CLOUDSDK_ACTIVE_CONFIG_NAME: 'rk',
      GOOGLE_APPLICATION_CREDENTIALS: '/profiles/rk/adc.json',
      GOOGLE_WORKSPACE_CLI_CONFIG_DIR: '/profiles/rk/gws'
    });
    vi.mocked(execaModule.execa).mockResolvedValue({ exitCode: 7 });

    await expect(accountContext.run('rk', ['gws', 'auth', 'status'])).resolves.toBe(7);

    expect(execaModule.execa).toHaveBeenCalledWith(
      'gws',
      ['auth', 'status'],
      expect.objectContaining({
        stdio: 'inherit',
        reject: false,
        env: expect.objectContaining({
          GSWITCH_PROFILE: 'rk',
          CLOUDSDK_ACTIVE_CONFIG_NAME: 'rk',
          GOOGLE_APPLICATION_CREDENTIALS: '/profiles/rk/adc.json'
        })
      })
    );
    expect(execaModule.execa.mock.calls[0][2].env).not.toHaveProperty('GOOGLE_WORKSPACE_CLI_TOKEN');
    expect(execaModule.execa.mock.calls[0][2].env).not.toHaveProperty('GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE');
    expect(execaModule.execa.mock.calls[0][2].env).not.toHaveProperty('CLOUDSDK_CORE_ACCOUNT');
    expect(execaModule.execa.mock.calls[0][2].env).not.toHaveProperty('CLOUDSDK_CORE_PROJECT');
  });

  it('rejects unknown configurations before launching a command', async () => {
    vi.spyOn(gcloud, 'configurationExists').mockResolvedValue(false);
    vi.spyOn(gcloud, 'getConfigurations').mockResolvedValue(['rk', 'sim']);

    await expect(accountContext.run('missing', ['true'])).rejects.toThrow(
      "Configuration 'missing' does not exist. Available configurations: rk, sim"
    );
    expect(execaModule.execa).not.toHaveBeenCalled();
  });

  it('opens an interactive shell with the same isolated environment', async () => {
    vi.spyOn(gcloud, 'configurationExists').mockResolvedValue(true);
    vi.spyOn(profiles, 'getScopedEnvironment').mockResolvedValue({
      GSWITCH_PROFILE: 'sim',
      CLOUDSDK_ACTIVE_CONFIG_NAME: 'sim',
      GOOGLE_APPLICATION_CREDENTIALS: '/profiles/sim/adc.json'
    });
    vi.mocked(execaModule.execa).mockResolvedValue({ exitCode: 0 });

    await expect(accountContext.shell('sim')).resolves.toBe(0);

    expect(execaModule.execa).toHaveBeenCalledWith(
      process.env.SHELL || '/bin/sh',
      ['-i'],
      expect.objectContaining({
        stdio: 'inherit',
        reject: false,
        env: expect.objectContaining({ GSWITCH_PROFILE: 'sim' })
      })
    );
  });
});
