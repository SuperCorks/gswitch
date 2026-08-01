import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { createAccount, renewAccount, resolveClientIdFile, run } from '../../../src/cli/index.js';
import { gcloud } from '../../../src/lib/gcloud.js';
import { gws } from '../../../src/lib/gws.js';
import { accountContext } from '../../../src/lib/accountContext.js';
import { profiles } from '../../../src/lib/profiles.js';
import {
  GCLOUD_ADC_IDENTITY_SCOPES,
  GCLOUD_ADC_SCOPE,
  LOGIN_SCOPE_GROUPS
} from '../../../src/lib/oauthScopes.js';

describe('cli/createAccount', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(gws, 'isInstalled').mockResolvedValue(false);
    vi.spyOn(gws, 'hasClientSecret').mockResolvedValue(true);
    vi.spyOn(gws, 'useAdcCredentials').mockResolvedValue(true);
    vi.spyOn(gws, 'updateCredentials').mockResolvedValue(true);
    vi.spyOn(profiles, 'saveRenewalSettings').mockResolvedValue('/profiles/test/renewal.json');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('activates the target configuration and restores ADC for a new account', async () => {
    const callOrder = [];

    vi.spyOn(gcloud, 'configurationExists').mockResolvedValue(false);
    vi.spyOn(gcloud, 'createConfiguration').mockImplementation(async (name) => {
      callOrder.push(`create:${name}`);
    });
    vi.spyOn(gcloud, 'activateConfiguration').mockImplementation(async (name) => {
      callOrder.push(`activate:${name}`);
    });
    vi.spyOn(gcloud, 'login').mockImplementation(async (email) => {
      callOrder.push(`login:${email}`);
    });
    vi.spyOn(gcloud, 'setAccount').mockImplementation(async (email) => {
      callOrder.push(`account:${email}`);
    });
    vi.spyOn(gcloud, 'loginAdc').mockImplementation(async (email) => {
      callOrder.push(`adc:${email}`);
    });
    vi.spyOn(gcloud, 'saveAdc').mockImplementation(async (name) => {
      callOrder.push(`save:${name}`);
    });
    vi.spyOn(gcloud, 'updateAdc').mockImplementation(async (name) => {
      callOrder.push(`restore:${name}`);
      return true;
    });

    await createAccount('peachy', 'hello@peachystudio.com');

    expect(callOrder).toEqual([
      'create:peachy',
      'activate:peachy',
      'login:hello@peachystudio.com',
      'account:hello@peachystudio.com',
      'adc:hello@peachystudio.com',
      'save:peachy',
      'activate:peachy',
      'restore:peachy'
    ]);
  });

  it('passes normalized scopes to both auth steps', async () => {
    vi.spyOn(gcloud, 'configurationExists').mockResolvedValue(false);
    vi.spyOn(gcloud, 'createConfiguration').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'activateConfiguration').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'setAccount').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'saveAdc').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'updateAdc').mockResolvedValue(true);

    const loginSpy = vi.spyOn(gcloud, 'login').mockResolvedValue(undefined);
    const loginAdcSpy = vi.spyOn(gcloud, 'loginAdc').mockResolvedValue(undefined);
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    await createAccount('peachy', 'hello@peachystudio.com', {
      scopes: ' https://www.googleapis.com/auth/spreadsheets, https://www.googleapis.com/auth/cloud-platform ',
      clientIdFile: '/tmp/client_secret.json'
    });

    const expectedScopes = [
      ...GCLOUD_ADC_IDENTITY_SCOPES,
      'https://www.googleapis.com/auth/spreadsheets',
      GCLOUD_ADC_SCOPE
    ].join(',');

    expect(loginSpy).toHaveBeenCalledWith('hello@peachystudio.com', {
      scopes: expectedScopes,
      clientIdFile: '/tmp/client_secret.json'
    });
    expect(loginAdcSpy).toHaveBeenCalledWith('hello@peachystudio.com', {
      scopes: expectedScopes,
      clientIdFile: '/tmp/client_secret.json'
    });
    expect(profiles.saveRenewalSettings).toHaveBeenCalledWith('peachy', {
      email: 'hello@peachystudio.com',
      scopes: expectedScopes,
      clientIdFile: '/tmp/client_secret.json'
    });
  });

  it('forces browser auth when refreshing an existing account', async () => {
    vi.spyOn(gcloud, 'configurationExists').mockResolvedValue(true);
    vi.spyOn(gcloud, 'createConfiguration').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'activateConfiguration').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'setAccount').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'loginAdc').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'saveAdc').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'updateAdc').mockResolvedValue(true);

    const loginSpy = vi.spyOn(gcloud, 'login').mockResolvedValue(undefined);
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    await createAccount('rk', 'simon@redkrypton.com');

    expect(gcloud.createConfiguration).not.toHaveBeenCalled();
    expect(loginSpy).toHaveBeenCalledWith('simon@redkrypton.com', expect.objectContaining({
      force: true
    }));
  });

  it('expands helper permission flags into login scopes', async () => {
    vi.spyOn(gcloud, 'configurationExists').mockResolvedValue(false);
    vi.spyOn(gcloud, 'createConfiguration').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'activateConfiguration').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'setAccount').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'saveAdc').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'updateAdc').mockResolvedValue(true);

    const loginSpy = vi.spyOn(gcloud, 'login').mockResolvedValue(undefined);
    const loginAdcSpy = vi.spyOn(gcloud, 'loginAdc').mockResolvedValue(undefined);
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    await createAccount('peachy', 'hello@peachystudio.com', {
      gmail: true,
      calendar: true,
      drive: true,
      clientIdFile: '/tmp/client_secret.json'
    });

    const expectedScopes = [
      ...GCLOUD_ADC_IDENTITY_SCOPES,
      GCLOUD_ADC_SCOPE,
      ...LOGIN_SCOPE_GROUPS.gmail,
      ...LOGIN_SCOPE_GROUPS.calendar,
      ...LOGIN_SCOPE_GROUPS.drive
    ].join(',');

    expect(loginSpy).toHaveBeenCalledWith('hello@peachystudio.com', {
      gmail: true,
      calendar: true,
      drive: true,
      clientIdFile: '/tmp/client_secret.json',
      scopes: expectedScopes
    });
    expect(loginAdcSpy).toHaveBeenCalledWith('hello@peachystudio.com', {
      gmail: true,
      calendar: true,
      drive: true,
      clientIdFile: '/tmp/client_secret.json',
      scopes: expectedScopes
    });
  });

  it('prefers the local production OAuth client to auth flows by default', async () => {
    vi.spyOn(gcloud, 'configurationExists').mockResolvedValue(false);
    vi.spyOn(gcloud, 'createConfiguration').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'activateConfiguration').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'login').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'setAccount').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'saveAdc').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'updateAdc').mockResolvedValue(true);
    vi.spyOn(fs, 'existsSync').mockImplementation(filePath => (
      String(filePath).endsWith('/.config/gswitch/google-oauth-client.json') ||
      String(filePath).endsWith('/src/config/google-oauth-client.json')
    ));

    const loginAdcSpy = vi.spyOn(gcloud, 'loginAdc').mockResolvedValue(undefined);

    await createAccount('peachy', 'hello@peachystudio.com');

    const expectedClientIdFile = expect.stringMatching(/\.config\/gswitch\/google-oauth-client\.json$/);
    expect(loginAdcSpy).toHaveBeenCalledWith('hello@peachystudio.com', expect.objectContaining({
      clientIdFile: expectedClientIdFile
    }));
  });

  it('falls back to the bundled production OAuth client by default', async () => {
    vi.spyOn(gcloud, 'configurationExists').mockResolvedValue(false);
    vi.spyOn(gcloud, 'createConfiguration').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'activateConfiguration').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'login').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'setAccount').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'saveAdc').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'updateAdc').mockResolvedValue(true);
    vi.spyOn(fs, 'existsSync').mockImplementation(filePath => (
      !String(filePath).endsWith('/.config/gswitch/google-oauth-client.json') &&
      String(filePath).endsWith('/src/config/google-oauth-client.json')
    ));

    const loginAdcSpy = vi.spyOn(gcloud, 'loginAdc').mockResolvedValue(undefined);

    await createAccount('peachy', 'hello@peachystudio.com');

    const expectedClientIdFile = expect.stringMatching(/src\/config\/google-oauth-client\.json$/);
    expect(loginAdcSpy).toHaveBeenCalledWith('hello@peachystudio.com', expect.objectContaining({
      clientIdFile: expectedClientIdFile
    }));
  });

  it('passes the local production OAuth client to the shared ADC flow by default', async () => {
    vi.spyOn(gcloud, 'configurationExists').mockResolvedValue(false);
    vi.spyOn(gcloud, 'createConfiguration').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'activateConfiguration').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'login').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'setAccount').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'saveAdc').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'updateAdc').mockResolvedValue(true);
    vi.spyOn(fs, 'existsSync').mockImplementation(filePath => (
      String(filePath).endsWith('/.config/gswitch/google-oauth-client.json') ||
      String(filePath).endsWith('/src/config/google-oauth-client.json')
    ));

    const loginAdcSpy = vi.spyOn(gcloud, 'loginAdc').mockResolvedValue(undefined);

    await createAccount('peachy', 'hello@peachystudio.com', {
      drive: true
    });

    const expectedClientIdFile = expect.stringMatching(/\.config\/gswitch\/google-oauth-client\.json$/);
    expect(loginAdcSpy).toHaveBeenCalledWith('hello@peachystudio.com', expect.objectContaining({
      clientIdFile: expectedClientIdFile
    }));
  });

  it('configures gws to reuse the saved ADC', async () => {
    vi.spyOn(gcloud, 'configurationExists').mockResolvedValue(false);
    vi.spyOn(gcloud, 'createConfiguration').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'activateConfiguration').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'login').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'setAccount').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'loginAdc').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'saveAdc').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'updateAdc').mockResolvedValue(true);

    vi.mocked(gws.isInstalled).mockResolvedValue(true);
    vi.spyOn(gcloud, 'getAdcPath').mockResolvedValue('/profiles/peachy/adc.json');
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    await createAccount('peachy', 'hello@peachystudio.com', {
      clientIdFile: '/tmp/client_secret.json'
    });

    expect(gws.useAdcCredentials).toHaveBeenCalledWith(
      'peachy',
      '/profiles/peachy/adc.json'
    );
    expect(gws.updateCredentials).toHaveBeenCalledWith('peachy');
  });
});

describe('cli/renewAccount', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(gws, 'isInstalled').mockResolvedValue(false);
    vi.spyOn(gws, 'hasClientSecret').mockResolvedValue(true);
    vi.spyOn(gws, 'useAdcCredentials').mockResolvedValue(true);
    vi.spyOn(gws, 'updateCredentials').mockResolvedValue(true);
    vi.spyOn(profiles, 'saveRenewalSettings').mockResolvedValue('/profiles/rk/renewal.json');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refreshes an existing account with its saved email and scopes', async () => {
    const scopes = [
      ...GCLOUD_ADC_IDENTITY_SCOPES,
      GCLOUD_ADC_SCOPE,
      ...LOGIN_SCOPE_GROUPS.drive
    ].join(',');

    vi.spyOn(profiles, 'loadRenewalSettings').mockResolvedValue({
      version: 1,
      email: 'simon@redkrypton.com',
      scopes,
      clientIdFile: '/tmp/client_secret.json'
    });
    vi.spyOn(gcloud, 'configurationExists').mockResolvedValue(true);
    vi.spyOn(gcloud, 'activateConfiguration').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'setAccount').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'saveAdc').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'updateAdc').mockResolvedValue(true);
    const loginSpy = vi.spyOn(gcloud, 'login').mockResolvedValue(undefined);
    const loginAdcSpy = vi.spyOn(gcloud, 'loginAdc').mockResolvedValue(undefined);
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    await renewAccount('rk', { private: true });

    expect(loginSpy).toHaveBeenCalledWith('simon@redkrypton.com', {
      scopes,
      clientIdFile: '/tmp/client_secret.json',
      private: true,
      force: true
    });
    expect(loginAdcSpy).toHaveBeenCalledWith('simon@redkrypton.com', {
      scopes,
      clientIdFile: '/tmp/client_secret.json',
      private: true
    });
    expect(profiles.saveRenewalSettings).toHaveBeenCalledWith('rk', {
      email: 'simon@redkrypton.com',
      scopes,
      clientIdFile: '/tmp/client_secret.json'
    });
  });

  it('explains how to bootstrap renewal for a legacy profile', async () => {
    vi.spyOn(profiles, 'loadRenewalSettings').mockResolvedValue(null);

    await expect(renewAccount('rk')).rejects.toThrow(
      'Run gswitch new rk <email> with the profile\'s original scope flags once'
    );
  });
});

describe('cli OAuth client resolution', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects secretless default clients for Workspace scopes', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(gws, 'hasClientSecret').mockResolvedValue(false);

    await expect(resolveClientIdFile(undefined, LOGIN_SCOPE_GROUPS.drive[0])).rejects.toThrow(
      'Workspace OAuth scopes require a Desktop OAuth client JSON containing client_secret'
    );
  });

  it('rejects an explicitly selected secretless client for Workspace scopes', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(gws, 'hasClientSecret').mockResolvedValue(false);

    await expect(
      resolveClientIdFile('/tmp/client.json', LOGIN_SCOPE_GROUPS.gmail[0])
    ).rejects.toThrow('/tmp/client.json');
  });

  it('requires a custom client for scopes outside the bundled production set', async () => {
    vi.spyOn(fs, 'existsSync').mockImplementation(filePath => (
      !String(filePath).endsWith('/.config/gswitch/google-oauth-client.json') &&
      String(filePath).endsWith('/src/config/google-oauth-client.json')
    ));
    vi.spyOn(gws, 'hasClientSecret').mockResolvedValue(true);

    await expect(
      resolveClientIdFile(undefined, 'https://www.googleapis.com/auth/contacts')
    ).rejects.toThrow('cannot request undeclared scope(s)');
  });
});

describe('cli run command', () => {
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  it('awaits variadic run commands and preserves flags after --', async () => {
    const runSpy = vi.spyOn(accountContext, 'run').mockResolvedValue(7);
    process.argv = ['node', 'gswitch', 'run', 'rk', '--', 'cmd', '--flag'];

    await run();

    expect(runSpy).toHaveBeenCalledWith('rk', ['cmd', '--flag']);
    expect(process.exitCode).toBe(7);
  });

  it('propagates async action errors to the binary entry point', async () => {
    vi.spyOn(accountContext, 'run').mockRejectedValue(new Error('missing profile'));
    process.argv = ['node', 'gswitch', 'run', 'missing', '--', 'true'];

    await expect(run()).rejects.toThrow('missing profile');
  });
});
