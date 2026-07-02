import { execa } from 'execa';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { GWS_IDENTITY_SCOPES, mergeScopes } from './oauthScopes.js';

const CREDENTIAL_FILES = [
  { activeName: 'credentials.enc', snapshotName: account => `credentials_${account}.enc` },
  { activeName: 'credentials.json', snapshotName: account => `credentials_${account}.json` }
];

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

export class GoogleWorkspace {
  getConfigDir() {
    return path.join(os.homedir(), '.config/gws');
  }

  getCredentialPaths(account) {
    const configDir = this.getConfigDir();

    return CREDENTIAL_FILES.map(file => ({
      active: path.join(configDir, file.activeName),
      snapshot: path.join(configDir, file.snapshotName(account))
    }));
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
    } catch (error) {
      return false;
    }
  }

  async login(options = {}) {
    const installed = await this.isInstalled();
    if (!installed) {
      return false;
    }

    const args = ['auth', 'login'];
    args.push(`--scopes=${mergeScopes(GWS_IDENTITY_SCOPES, options.scopes)}`);

    await execa('gws', args, { stdio: 'inherit' });
    return true;
  }

  async saveCredentials(account) {
    const credentialPaths = this.getCredentialPaths(account);
    await fs.mkdir(this.getConfigDir(), { recursive: true });

    let saved = false;
    for (const credentialPath of credentialPaths) {
      if (await fileExists(credentialPath.active)) {
        await fs.copyFile(credentialPath.active, credentialPath.snapshot);
        saved = true;
      } else {
        await fs.rm(credentialPath.snapshot, { force: true });
      }
    }

    return saved;
  }

  async updateCredentials(account) {
    const credentialPaths = this.getCredentialPaths(account);
    const snapshotState = await Promise.all(
      credentialPaths.map(async credentialPath => ({
        ...credentialPath,
        exists: await fileExists(credentialPath.snapshot)
      }))
    );

    if (!snapshotState.some(credentialPath => credentialPath.exists)) {
      return false;
    }

    for (const credentialPath of snapshotState) {
      if (credentialPath.exists) {
        await fs.copyFile(credentialPath.snapshot, credentialPath.active);
      } else {
        await fs.rm(credentialPath.active, { force: true });
      }
    }

    return true;
  }
}

export const gws = new GoogleWorkspace();
