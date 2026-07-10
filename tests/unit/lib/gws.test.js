import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as execaModule from 'execa';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { gws } from '../../../src/lib/gws.js';
import { profiles } from '../../../src/lib/profiles.js';

vi.mock('execa');
vi.mock('fs/promises');
vi.mock('os');

describe('lib/gws', () => {
  const mockHome = '/home/user';
  const profileGwsDir = path.join(mockHome, '.config/gswitch/profiles/personal/gws');

  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue(mockHome);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.spyOn(profiles, 'migrateLegacyGwsCredentials').mockResolvedValue(undefined);
    vi.spyOn(profiles, 'usesAdcForGws').mockResolvedValue(false);
    vi.spyOn(profiles, 'ensureAdc').mockResolvedValue(null);
    vi.spyOn(profiles, 'markGwsUsesAdc').mockResolvedValue(undefined);
    vi.spyOn(gws, 'disableClientConfig').mockResolvedValue(false);
    vi.spyOn(gws, 'restoreClientConfig').mockResolvedValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  it('detects when gws is installed', async () => {
    vi.mocked(execaModule.execa).mockResolvedValue({ exitCode: 0, failed: false });

    await expect(gws.isInstalled()).resolves.toBe(true);
    expect(execaModule.execa).toHaveBeenCalledWith('gws', ['--help'], {
      reject: false,
      stdout: 'ignore',
      stderr: 'ignore',
      timeout: 5000
    });
  });

  it('detects when gws is not installed', async () => {
    vi.mocked(execaModule.execa).mockRejectedValue(new Error('ENOENT'));
    await expect(gws.isInstalled()).resolves.toBe(false);
  });

  it('detects whether an OAuth client file contains a secret', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
      installed: { client_id: 'client.apps.googleusercontent.com', client_secret: 'secret' }
    }));
    await expect(gws.hasClientSecret('/tmp/client.json')).resolves.toBe(true);

    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
      installed: { client_id: 'client.apps.googleusercontent.com' }
    }));
    await expect(gws.hasClientSecret('/tmp/client.json')).resolves.toBe(false);
  });

  it('activates shared ADC credentials for a marked profile', async () => {
    vi.mocked(profiles.usesAdcForGws).mockResolvedValue(true);
    vi.mocked(profiles.ensureAdc).mockResolvedValue('/profiles/personal/adc.json');
    vi.mocked(fs.copyFile).mockResolvedValue(undefined);
    vi.mocked(fs.chmod).mockResolvedValue(undefined);
    vi.mocked(fs.rm).mockResolvedValue(undefined);

    await expect(gws.updateCredentials('personal')).resolves.toBe(true);

    expect(fs.copyFile).toHaveBeenCalledWith(
      '/profiles/personal/adc.json',
      path.join(mockHome, '.config/gws/credentials.json')
    );
    expect(gws.disableClientConfig).toHaveBeenCalled();
    expect(fs.rm).toHaveBeenCalledWith(
      path.join(mockHome, '.config/gws/credentials.enc'),
      { force: true }
    );
  });

  it('restores a legacy encrypted profile credential', async () => {
    vi.mocked(fs.access)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('ENOENT'));
    vi.mocked(fs.copyFile).mockResolvedValue(undefined);
    vi.mocked(fs.chmod).mockResolvedValue(undefined);
    vi.mocked(fs.rm).mockResolvedValue(undefined);

    await expect(gws.updateCredentials('personal')).resolves.toBe(true);

    expect(fs.copyFile).toHaveBeenCalledWith(
      path.join(profileGwsDir, 'credentials.enc'),
      path.join(mockHome, '.config/gws/credentials.enc')
    );
    expect(fs.rm).toHaveBeenCalledWith(
      path.join(mockHome, '.config/gws/credentials.json'),
      { force: true }
    );
    expect(gws.restoreClientConfig).toHaveBeenCalled();
  });

  it('falls back to ADC and marks profiles without dedicated gws credentials', async () => {
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(profiles.ensureAdc).mockResolvedValue('/profiles/personal/adc.json');
    vi.mocked(fs.copyFile).mockResolvedValue(undefined);
    vi.mocked(fs.chmod).mockResolvedValue(undefined);
    vi.mocked(fs.rm).mockResolvedValue(undefined);

    await expect(gws.updateCredentials('personal')).resolves.toBe(true);

    expect(profiles.markGwsUsesAdc).toHaveBeenCalledWith('personal');
    expect(gws.disableClientConfig).toHaveBeenCalled();
    expect(fs.copyFile).toHaveBeenCalledWith(
      '/profiles/personal/adc.json',
      path.join(mockHome, '.config/gws/credentials.json')
    );
  });

  it('returns false when neither gws credentials nor ADC exist', async () => {
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
    await expect(gws.updateCredentials('personal')).resolves.toBe(false);
    expect(fs.copyFile).not.toHaveBeenCalled();
  });

  it('marks a refreshed profile to use ADC without copying or deleting encrypted rollback data', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);

    await expect(
      gws.useAdcCredentials('personal', '/profiles/personal/adc.json')
    ).resolves.toBe(true);

    expect(profiles.markGwsUsesAdc).toHaveBeenCalledWith('personal');
    expect(fs.copyFile).not.toHaveBeenCalled();
    expect(fs.rm).not.toHaveBeenCalled();
  });

  it('reversibly disables and restores the global client config', async () => {
    vi.mocked(gws.disableClientConfig).mockRestore();
    vi.mocked(gws.restoreClientConfig).mockRestore();
    vi.mocked(fs.access)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('ENOENT'))
      .mockResolvedValueOnce(undefined);
    vi.mocked(fs.rm).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);

    await expect(gws.disableClientConfig()).resolves.toBe(true);
    expect(fs.rename).toHaveBeenCalledWith(
      path.join(mockHome, '.config/gws/client_secret.json'),
      path.join(mockHome, '.config/gws/client_secret.json.gswitch-disabled')
    );

    await expect(gws.restoreClientConfig()).resolves.toBe(true);
    expect(fs.rename).toHaveBeenCalledWith(
      path.join(mockHome, '.config/gws/client_secret.json.gswitch-disabled'),
      path.join(mockHome, '.config/gws/client_secret.json')
    );
  });
});
