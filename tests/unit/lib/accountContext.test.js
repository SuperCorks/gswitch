import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as execaModule from 'execa';
import { accountContext } from '../../../src/lib/accountContext.js';
import { gcloud } from '../../../src/lib/gcloud.js';
import { profiles } from '../../../src/lib/profiles.js';

vi.mock('execa');

describe('lib/accountContext', () => {
  const inheritedSelectors = [
    'CLOUDSDK_AUTH_ACCESS_TOKEN',
    'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE',
    'CLOUDSDK_CORE_ACCOUNT',
    'CLOUDSDK_CORE_PROJECT',
    'GCLOUD_PROJECT',
    'GOOGLE_CLOUD_PROJECT',
    'GOOGLE_CLOUD_QUOTA_PROJECT',
    'GOOGLE_OAUTH_ACCESS_TOKEN',
    'GOOGLE_WORKSPACE_CLI_CLIENT_ID',
    'GOOGLE_WORKSPACE_CLI_CLIENT_SECRET',
    'GOOGLE_WORKSPACE_CLI_TOKEN',
    'GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE'
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const selector of inheritedSelectors) {
      delete process.env[selector];
    }
  });

  it('runs commands with a scoped account environment and preserves arguments', async () => {
    for (const selector of inheritedSelectors) {
      process.env[selector] = `wrong-${selector}`;
    }
    vi.spyOn(gcloud, 'configurationExists').mockResolvedValue(true);
    vi.spyOn(profiles, 'getScopedEnvironment').mockResolvedValue({
      GSWITCH_PROFILE: 'rk',
      CLOUDSDK_ACTIVE_CONFIG_NAME: 'rk',
      CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE: '/profiles/rk/adc.json',
      GOOGLE_APPLICATION_CREDENTIALS: '/profiles/rk/adc.json',
      GOOGLE_WORKSPACE_CLI_CONFIG_DIR: '/profiles/rk/gws'
    });
    vi.mocked(execaModule.execa).mockResolvedValue({ exitCode: 7 });

    await expect(accountContext.run('rk', ['gws', 'auth', 'status'])).resolves.toBe(7);

    expect(execaModule.execa).toHaveBeenCalledWith(
      'gws',
      ['auth', 'status'],
      expect.objectContaining({
        extendEnv: false,
        stdio: 'inherit',
        reject: false,
        env: expect.objectContaining({
          GSWITCH_PROFILE: 'rk',
          CLOUDSDK_ACTIVE_CONFIG_NAME: 'rk',
          CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE: '/profiles/rk/adc.json',
          GOOGLE_APPLICATION_CREDENTIALS: '/profiles/rk/adc.json'
        })
      })
    );
    for (const selector of inheritedSelectors.filter(
      selector => selector !== 'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE'
    )) {
      expect(execaModule.execa.mock.calls[0][2].env).not.toHaveProperty(selector);
    }
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
        extendEnv: false,
        stdio: 'inherit',
        reject: false,
        env: expect.objectContaining({ GSWITCH_PROFILE: 'sim' })
      })
    );
  });

  it('prints spawn failures and returns the command-not-found exit code', async () => {
    vi.spyOn(gcloud, 'configurationExists').mockResolvedValue(true);
    vi.spyOn(profiles, 'getScopedEnvironment').mockResolvedValue({
      GSWITCH_PROFILE: 'rk'
    });
    vi.mocked(execaModule.execa).mockResolvedValue({
      failed: true,
      exitCode: undefined,
      signal: undefined,
      shortMessage: 'Command failed with ENOENT: missing-command'
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(accountContext.run('rk', ['missing-command'])).resolves.toBe(127);
    expect(errorSpy).toHaveBeenCalledWith('Command failed with ENOENT: missing-command');
  });
});
