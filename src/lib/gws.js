import { execa } from 'execa';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { profiles } from './profiles.js';

const CREDENTIAL_FILES = ['credentials.enc', 'credentials.json'];

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export class GoogleWorkspace {
  getConfigDir() {
    return path.join(os.homedir(), '.config/gws');
  }

  getClientConfigPath() {
    return path.join(this.getConfigDir(), 'client_secret.json');
  }

  getDisabledClientConfigPath() {
    return path.join(this.getConfigDir(), 'client_secret.json.gswitch-disabled');
  }

  async isInstalled() {
    try {
      const result = await execa('gws', ['--help'], {
        reject: false,
        stdout: 'ignore',
        stderr: 'ignore',
        timeout: 5000
      });

      return !result.failed && result.exitCode === 0;
    } catch {
      return false;
    }
  }

  async hasClientSecret(clientIdFile) {
    const clientFile = JSON.parse(await fs.readFile(clientIdFile, 'utf8'));
    const clientConfig = clientFile.installed || clientFile.web || clientFile;
    return Boolean(clientConfig.client_secret);
  }

  async updateCredentials(account) {
    await profiles.migrateLegacyGwsCredentials(account);
    await fs.mkdir(this.getConfigDir(), { recursive: true, mode: 0o700 });

    if (await profiles.usesAdcForGws(account)) {
      const adcPath = await profiles.ensureAdc(account);
      if (!adcPath) {
        return false;
      }

      await this.disableClientConfig();
      return this.activateAdcCredentials(adcPath);
    }

    const credentialPaths = CREDENTIAL_FILES.map(fileName => ({
      active: path.join(this.getConfigDir(), fileName),
      profile: path.join(profiles.getGwsConfigDir(account), fileName)
    }));
    const profileState = await Promise.all(
      credentialPaths.map(async credentialPath => ({
        ...credentialPath,
        exists: await fileExists(credentialPath.profile)
      }))
    );

    if (!profileState.some(credentialPath => credentialPath.exists)) {
      const adcPath = await profiles.ensureAdc(account);
      if (!adcPath) {
        return false;
      }

      await profiles.markGwsUsesAdc(account);
      await this.disableClientConfig();
      return this.activateAdcCredentials(adcPath);
    }

    await this.restoreClientConfig();

    for (const credentialPath of profileState) {
      if (credentialPath.exists) {
        await fs.copyFile(credentialPath.profile, credentialPath.active);
        await fs.chmod(credentialPath.active, 0o600);
      } else {
        await fs.rm(credentialPath.active, { force: true });
      }
    }

    await fs.rm(path.join(this.getConfigDir(), 'token_cache.json'), { force: true });
    return true;
  }

  async activateAdcCredentials(adcPath) {
    const plainCredentialsPath = path.join(this.getConfigDir(), 'credentials.json');
    await fs.copyFile(adcPath, plainCredentialsPath);
    await fs.chmod(plainCredentialsPath, 0o600);
    await fs.rm(path.join(this.getConfigDir(), 'credentials.enc'), { force: true });
    await fs.rm(path.join(this.getConfigDir(), 'token_cache.json'), { force: true });
    return true;
  }

  async useAdcCredentials(account, adcPath) {
    await fs.access(adcPath);
    await profiles.markGwsUsesAdc(account);
    return true;
  }

  async disableClientConfig() {
    const clientConfigPath = this.getClientConfigPath();
    if (!(await fileExists(clientConfigPath))) {
      return false;
    }

    const disabledPath = this.getDisabledClientConfigPath();
    await fs.rm(disabledPath, { force: true });
    await fs.rename(clientConfigPath, disabledPath);
    return true;
  }

  async restoreClientConfig() {
    const clientConfigPath = this.getClientConfigPath();
    if (await fileExists(clientConfigPath)) {
      return false;
    }

    const disabledPath = this.getDisabledClientConfigPath();
    if (!(await fileExists(disabledPath))) {
      return false;
    }

    await fs.rename(disabledPath, clientConfigPath);
    return true;
  }
}

export const gws = new GoogleWorkspace();
