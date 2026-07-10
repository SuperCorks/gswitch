import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { profiles } from '../../../src/lib/profiles.js';

vi.mock('fs/promises');
vi.mock('os');

describe('lib/profiles', () => {
  const mockHome = '/home/user';

  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue(mockHome);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  it('migrates a legacy ADC into the private profile directory', async () => {
    vi.mocked(fs.access)
      .mockRejectedValueOnce(new Error('ENOENT'))
      .mockResolvedValueOnce(undefined);
    vi.mocked(fs.copyFile).mockResolvedValue(undefined);
    vi.mocked(fs.chmod).mockResolvedValue(undefined);

    const adcPath = await profiles.ensureAdc('personal');

    expect(adcPath).toBe(path.join(mockHome, '.config/gswitch/profiles/personal/adc.json'));
    expect(fs.copyFile).toHaveBeenCalledWith(
      path.join(mockHome, '.config/gcloud/application_default_credentials_personal.json'),
      adcPath
    );
    expect(fs.chmod).toHaveBeenCalledWith(adcPath, 0o600);
  });

  it('builds an isolated environment that explicitly shares ADC with gws', async () => {
    vi.spyOn(profiles, 'ensureAdc').mockResolvedValue('/profiles/rk/adc.json');
    vi.spyOn(profiles, 'migrateLegacyGwsCredentials').mockResolvedValue(undefined);
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

    await expect(profiles.getScopedEnvironment('rk')).resolves.toEqual({
      GSWITCH_PROFILE: 'rk',
      CLOUDSDK_ACTIVE_CONFIG_NAME: 'rk',
      GOOGLE_APPLICATION_CREDENTIALS: '/profiles/rk/adc.json',
      GOOGLE_WORKSPACE_CLI_CONFIG_DIR: path.join(mockHome, '.config/gswitch/profiles/rk/gws'),
      GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE: '/profiles/rk/adc.json'
    });
  });

  it('does not re-import legacy gws credentials after ADC consolidation', async () => {
    vi.mocked(fs.access).mockResolvedValueOnce(undefined);

    await profiles.migrateLegacyGwsCredentials('rk');

    expect(fs.copyFile).not.toHaveBeenCalled();
  });

  it('marks ADC reuse without deleting encrypted rollback credentials', async () => {
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.chmod).mockResolvedValue(undefined);
    vi.mocked(fs.rm).mockResolvedValue(undefined);

    await profiles.markGwsUsesAdc('rk');

    expect(fs.writeFile).toHaveBeenCalledWith(
      path.join(mockHome, '.config/gswitch/profiles/rk/gws/use-adc'),
      'ADC\n',
      { mode: 0o600 }
    );
    expect(fs.rm).toHaveBeenCalledWith(
      path.join(mockHome, '.config/gswitch/profiles/rk/gws/credentials.json'),
      { force: true }
    );
    expect(fs.rm).not.toHaveBeenCalledWith(
      path.join(mockHome, '.config/gswitch/profiles/rk/gws/credentials.enc'),
      expect.anything()
    );
  });

  it('uses dedicated legacy gws credentials when no ADC marker exists', async () => {
    vi.spyOn(profiles, 'ensureAdc').mockResolvedValue('/profiles/sim/adc.json');
    vi.spyOn(profiles, 'migrateLegacyGwsCredentials').mockResolvedValue(undefined);
    vi.spyOn(profiles, 'usesAdcForGws').mockResolvedValue(false);
    vi.mocked(fs.access).mockResolvedValueOnce(undefined);

    const environment = await profiles.getScopedEnvironment('sim');

    expect(environment).not.toHaveProperty('GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE');
    expect(environment.GOOGLE_WORKSPACE_CLI_CONFIG_DIR).toBe(
      path.join(mockHome, '.config/gswitch/profiles/sim/gws')
    );
  });

  it('rejects names that could escape the profile directory', () => {
    expect(() => profiles.getProfileDir('../rk')).toThrow("Invalid configuration name '../rk'");
  });
});
