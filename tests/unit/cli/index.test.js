import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAccount } from '../../../src/cli/index.js';
import { gcloud } from '../../../src/lib/gcloud.js';

describe('cli/createAccount', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
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

    await createAccount('peachy', 'hello@peachystudio.com', {
      scopes: ' https://www.googleapis.com/auth/spreadsheets, https://www.googleapis.com/auth/cloud-platform '
    });

    expect(loginSpy).toHaveBeenCalledWith('hello@peachystudio.com', {
      scopes: 'https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/cloud-platform'
    });
    expect(loginAdcSpy).toHaveBeenCalledWith('hello@peachystudio.com', {
      scopes: 'https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/cloud-platform'
    });
  });
});
