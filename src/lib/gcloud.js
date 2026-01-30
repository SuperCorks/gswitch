import { execa } from 'execa';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ui } from './ui.js';

export class GCloud {
  async getConfigurations() {
    try {
      const { stdout } = await execa('gcloud', ['config', 'configurations', 'list', '--format=value(name)']);
      return stdout.split('\n').filter(Boolean);
    } catch (error) {
      throw new Error(`Failed to list configurations: ${error.message}`);
    }
  }

  async getConfigurationsWithAccounts() {
    try {
      const { stdout } = await execa('gcloud', ['config', 'configurations', 'list', '--format=value(name,properties.core.account)']);
      return stdout.split('\n').filter(Boolean).map(line => {
        const [name, account] = line.split('\t');
        return { name, account: account || null };
      });
    } catch (error) {
      throw new Error(`Failed to list configurations: ${error.message}`);
    }
  }

  async getActiveConfiguration() {
    try {
      const { stdout } = await execa('gcloud', ['config', 'configurations', 'list', '--filter=is_active:true', '--format=value(name)']);
      return stdout.trim();
    } catch (error) {
      return null;
    }
  }

  async activateConfiguration(name) {
    try {
      await execa('gcloud', ['config', 'configurations', 'activate', name]);
    } catch (error) {
      throw new Error(`Failed to activate configuration '${name}': ${error.message}`);
    }
  }

  async getCurrentProject() {
    try {
      const { stdout } = await execa('gcloud', ['config', 'get-value', 'project', '--quiet']);
      return stdout.trim();
    } catch (error) {
      return null;
    }
  }

  async getAvailableProjects() {
    try {
      // This can be slow, maybe we skip it or timeout?
      // Bash script: gcloud projects list --format="value(projectId)" 2>/dev/null
      const { stdout } = await execa('gcloud', ['projects', 'list', '--format=value(projectId)'], { 
        reject: false,
        timeout: 5000 // 5 second timeout to avoid hanging
      });
      return stdout.split('\n').filter(Boolean);
    } catch (error) {
      return [];
    }
  }

  async updateAdc(account) {
    const homeDir = os.homedir();
    const gcloudConfigPath = path.join(homeDir, '.config/gcloud/application_default_credentials.json');
    const accountAdcPath = path.join(homeDir, '.config/gcloud', `application_default_credentials_${account}.json`);

    try {
      await fs.access(accountAdcPath);
      // File exists, copy it
      await fs.copyFile(accountAdcPath, gcloudConfigPath);
      return true;
    } catch (error) {
      // File doesn't exist
      return false;
    }
  }
  
  async getCurrentAccount() {
     try {
      const { stdout } = await execa('gcloud', ['config', 'get-value', 'account', '--quiet']);
      return stdout.trim();
    } catch (error) {
      return null;
    } 
  }

  async createConfiguration(name) {
    try {
      await execa('gcloud', ['config', 'configurations', 'create', name], { stdio: 'inherit' });
    } catch (error) {
      // It might fail if it already exists, let caller handle or ignore if safe
      throw error;
    }
  }

  async setAccount(email) {
    await execa('gcloud', ['config', 'set', 'account', email], { stdio: 'inherit' });
  }

  async login(email) {
    await execa('gcloud', ['auth', 'login', `--account=${email}`], { stdio: 'inherit' });
  }

  async loginAdc(email) {
    await execa('gcloud', ['auth', 'application-default', 'login', `--account=${email}`], { stdio: 'inherit' });
  }

  async saveAdc(account) {
    const homeDir = os.homedir();
    const gcloudConfigPath = path.join(homeDir, '.config/gcloud/application_default_credentials.json');
    const accountAdcPath = path.join(homeDir, '.config/gcloud', `application_default_credentials_${account}.json`);
    
    // Rename/Move
    try {
        await fs.rename(gcloudConfigPath, accountAdcPath);
    } catch (error) {
        throw new Error(`Failed to save ADC file: ${error.message}`);
    }
  }
}

export const gcloud = new GCloud();
