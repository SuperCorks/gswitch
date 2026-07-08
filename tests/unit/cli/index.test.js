import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { createAccount } from '../../../src/cli/index.js';
import { gcloud } from '../../../src/lib/gcloud.js';
import { gws } from '../../../src/lib/gws.js';
import { GCLOUD_ADC_SCOPE, LOGIN_SCOPE_GROUPS } from '../../../src/lib/oauthScopes.js';

describe('cli/createAccount', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(gws, 'login').mockResolvedValue(false);
    vi.spyOn(gws, 'saveCredentials').mockResolvedValue(false);
    vi.spyOn(gws, 'hasClientSecret').mockResolvedValue(true);
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

    expect(loginSpy).toHaveBeenCalledWith('hello@peachystudio.com', {
      scopes: 'https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/cloud-platform',
      clientIdFile: '/tmp/client_secret.json'
    });
    expect(loginAdcSpy).toHaveBeenCalledWith('hello@peachystudio.com', {
      scopes: 'https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/cloud-platform',
      clientIdFile: '/tmp/client_secret.json'
    });
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
    const gwsLoginSpy = vi.spyOn(gws, 'login').mockResolvedValue(false);
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    await createAccount('peachy', 'hello@peachystudio.com', {
      gmail: true,
      calendar: true,
      drive: true,
      clientIdFile: '/tmp/client_secret.json'
    });

    const expectedScopes = [
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
    expect(gwsLoginSpy).toHaveBeenCalledWith({
      gmail: true,
      calendar: true,
      drive: true,
      clientIdFile: '/tmp/client_secret.json',
      scopes: expectedScopes
    });
  });

  it('passes the bundled production OAuth client to Workspace auth flows by default', async () => {
    vi.spyOn(gcloud, 'configurationExists').mockResolvedValue(false);
    vi.spyOn(gcloud, 'createConfiguration').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'activateConfiguration').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'login').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'setAccount').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'saveAdc').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'updateAdc').mockResolvedValue(true);

    const loginAdcSpy = vi.spyOn(gcloud, 'loginAdc').mockResolvedValue(undefined);
    const gwsLoginSpy = vi.spyOn(gws, 'login').mockResolvedValue(false);

    await createAccount('peachy', 'hello@peachystudio.com', {
      drive: true
    });

    const expectedClientIdFile = expect.stringMatching(/src\/config\/google-oauth-client\.json$/);
    expect(loginAdcSpy).toHaveBeenCalledWith('hello@peachystudio.com', expect.objectContaining({
      clientIdFile: expectedClientIdFile
    }));
    expect(gwsLoginSpy).toHaveBeenCalledWith(expect.objectContaining({
      clientIdFile: expectedClientIdFile
    }));
  });

  it('does not run gws login without an explicit OAuth client file', async () => {
    vi.spyOn(gcloud, 'configurationExists').mockResolvedValue(false);
    vi.spyOn(gcloud, 'createConfiguration').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'activateConfiguration').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'login').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'setAccount').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'loginAdc').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'saveAdc').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'updateAdc').mockResolvedValue(true);

    const gwsLoginSpy = vi.spyOn(gws, 'login').mockResolvedValue(true);
    const saveCredentialsSpy = vi.spyOn(gws, 'saveCredentials').mockResolvedValue(true);

    await createAccount('peachy', 'hello@peachystudio.com');

    expect(gwsLoginSpy).not.toHaveBeenCalled();
    expect(saveCredentialsSpy).not.toHaveBeenCalled();
  });

  it('saves gws credentials after gws login succeeds', async () => {
    vi.spyOn(gcloud, 'configurationExists').mockResolvedValue(false);
    vi.spyOn(gcloud, 'createConfiguration').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'activateConfiguration').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'login').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'setAccount').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'loginAdc').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'saveAdc').mockResolvedValue(undefined);
    vi.spyOn(gcloud, 'updateAdc').mockResolvedValue(true);

    vi.spyOn(gws, 'login').mockResolvedValue(true);
    const saveCredentialsSpy = vi.spyOn(gws, 'saveCredentials').mockResolvedValue(true);
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    await createAccount('peachy', 'hello@peachystudio.com', {
      clientIdFile: '/tmp/client_secret.json'
    });

    expect(saveCredentialsSpy).toHaveBeenCalledWith('peachy');
  });
});
