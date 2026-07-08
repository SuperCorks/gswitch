import { execa } from 'execa';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { GWS_IDENTITY_SCOPES, mergeScopes } from './oauthScopes.js';
import { ui } from './ui.js';

const OAUTH_URL_PATTERN = /https:\/\/accounts\.google\.com\/[^\s]+|https:\/\/[^\s]+/g;

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

  getDefaultClientIdFile() {
    return path.join(this.getConfigDir(), 'client_secret.json');
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

    const authEnv = await this.getAuthEnv(options);
    const execaOptions = {};
    if (authEnv) {
      execaOptions.env = authEnv;
    }

    await this.runLogin(args, execaOptions, options);
    return true;
  }

  async runLogin(args, execaOptions = {}, options = {}) {
    const child = execa('gws', args, {
      ...execaOptions,
      stdin: 'inherit',
      stdout: 'pipe',
      stderr: 'pipe'
    });

    let launched = false;
    let recentOutput = '';

    const handleChunk = (chunk, stream) => {
      const text = chunk.toString();
      stream.write(text);

      if (launched) {
        return;
      }

      recentOutput = `${recentOutput}${text}`.slice(-12000);
      const url = this.extractOAuthUrl(recentOutput);
      if (!url) {
        return;
      }

      launched = true;
      void this.launchOAuthUrl(url, options).catch(() => {
        console.error(ui.warn(`\nCould not open the gws OAuth URL automatically.`));
        console.error(ui.hint(`Open this URL manually: ${url}`));
      });
    };

    child.stdout?.on('data', chunk => handleChunk(chunk, process.stdout));
    child.stderr?.on('data', chunk => handleChunk(chunk, process.stderr));

    await child;
  }

  extractOAuthUrl(output) {
    const matches = output.match(OAUTH_URL_PATTERN);
    if (!matches?.length) {
      return null;
    }

    return matches.find(url => url.includes('accounts.google.com')) || matches[0];
  }

  async launchOAuthUrl(url, options = {}) {
    if (options.private) {
      await this.launchChromePrivate(url);
      return;
    }

    await this.launchDefaultBrowser(url);
  }

  async launchDefaultBrowser(url) {
    const platform = os.platform();
    const commands = {
      darwin: [['open', [url]]],
      linux: [['xdg-open', [url]]],
      win32: [['cmd', ['/c', 'start', '', url]]]
    };

    for (const [command, args] of commands[platform] || []) {
      const result = await execa(command, args, { reject: false });
      if (!result.failed && result.exitCode === 0) {
        console.log(ui.hint('Opened the gws OAuth URL in your browser.'));
        return;
      }
    }

    throw new Error(`Failed to open browser on ${platform}`);
  }

  async launchChromePrivate(url) {
    const platform = os.platform();
    const commands = {
      darwin: [['open', ['-na', 'Google Chrome', '--args', '--incognito', url]]],
      linux: [
        ['google-chrome', ['--incognito', url]],
        ['google-chrome-stable', ['--incognito', url]],
        ['chromium', ['--incognito', url]],
        ['chromium-browser', ['--incognito', url]]
      ],
      win32: [['cmd', ['/c', 'start', '', 'chrome', '--incognito', url]]]
    };

    for (const [command, args] of commands[platform] || []) {
      const result = await execa(command, args, { reject: false });
      if (!result.failed && result.exitCode === 0) {
        console.log(ui.hint('Opened the gws OAuth URL in a Chrome incognito window.'));
        return;
      }
    }

    throw new Error(`Failed to launch Chrome on ${platform}`);
  }

  async getAuthEnv(options = {}) {
    if (!options.clientIdFile) {
      return undefined;
    }

    const clientFile = JSON.parse(await fs.readFile(options.clientIdFile, 'utf8'));
    const clientConfig = clientFile.installed || clientFile.web || clientFile;

    if (!clientConfig.client_id) {
      throw new Error(`Invalid OAuth client file: ${options.clientIdFile}`);
    }

    const authEnv = {
      ...process.env,
      GOOGLE_WORKSPACE_CLI_CLIENT_ID: clientConfig.client_id
    };

    if (clientConfig.client_secret) {
      authEnv.GOOGLE_WORKSPACE_CLI_CLIENT_SECRET = clientConfig.client_secret;
    }

    return authEnv;
  }

  async hasClientSecret(clientIdFile) {
    const clientFile = JSON.parse(await fs.readFile(clientIdFile, 'utf8'));
    const clientConfig = clientFile.installed || clientFile.web || clientFile;

    return Boolean(clientConfig.client_secret);
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
