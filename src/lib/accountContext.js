import { execa } from 'execa';
import { gcloud } from './gcloud.js';
import { profiles } from './profiles.js';

export class AccountContext {
  async buildEnvironment(account) {
    if (!(await gcloud.configurationExists(account))) {
      const configurations = await gcloud.getConfigurations();
      throw new Error(
        `Configuration '${account}' does not exist. Available configurations: ${configurations.join(', ')}`
      );
    }

    const environment = { ...process.env };
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
    for (const selector of inheritedSelectors) {
      delete environment[selector];
    }

    Object.assign(environment, await profiles.getScopedEnvironment(account));
    return environment;
  }

  async run(account, command) {
    if (!Array.isArray(command) || command.length === 0) {
      throw new Error('A command is required after --');
    }

    const environment = await this.buildEnvironment(account);
    const result = await execa(command[0], command.slice(1), {
      env: environment,
      extendEnv: false,
      stdio: 'inherit',
      reject: false
    });

    if (result.failed && result.exitCode == null) {
      console.error(result.shortMessage || `Failed to start command: ${command[0]}`);
      return result.signal ? 1 : 127;
    }

    return result.exitCode ?? 1;
  }

  async shell(account) {
    const environment = await this.buildEnvironment(account);
    const shell = process.env.SHELL || '/bin/sh';
    const result = await execa(shell, ['-i'], {
      env: environment,
      extendEnv: false,
      stdio: 'inherit',
      reject: false
    });

    return result.exitCode ?? 1;
  }
}

export const accountContext = new AccountContext();
