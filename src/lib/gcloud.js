import { execa } from 'execa';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ui } from './ui.js';

export class GCloud {
  async getConfigurations() {
    try {
      const { stdout } = await execa('gcloud', ['config', 'configurations', 'list', '--format=value(name)'], {
        timeout: 10000
      });
      return stdout.split('\n').filter(Boolean);
    } catch (error) {
      throw new Error(`Failed to list configurations: ${error.message}`);
    }
  }

  async configurationExists(name) {
    const configs = await this.getConfigurations();
    return configs.includes(name);
  }

  async getConfigurationsWithAccounts() {
    try {
      const { stdout } = await execa('gcloud', ['config', 'configurations', 'list', '--format=value(name,properties.core.account)'], {
        timeout: 10000
      });
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
      const { stdout } = await execa('gcloud', ['config', 'configurations', 'list', '--filter=is_active:true', '--format=value(name)'], {
        timeout: 10000
      });
      return stdout.trim();
    } catch (error) {
      return null;
    }
  }

  async activateConfiguration(name) {
    try {
      await execa('gcloud', ['config', 'configurations', 'activate', name, '--quiet'], {
        timeout: 10000
      });
    } catch (error) {
      throw new Error(`Failed to activate configuration '${name}': ${error.message}`);
    }
  }

  async getCurrentProject() {
    try {
      const { stdout } = await execa('gcloud', ['config', 'get-value', 'project', '--quiet'], {
        timeout: 5000
      });
      return stdout.trim();
    } catch (error) {
      return null;
    }
  }

  async getAvailableProjects() {
    try {
      // This can be slow, maybe we skip it or timeout?
      // Bash script: gcloud projects list --format="value(projectId)" 2>/dev/null
      const result = await execa('gcloud', ['projects', 'list', '--format=value(projectId)', '--quiet'], { 
        reject: false,
        timeout: 15000
      });
      if (result.timedOut || result.failed) {
        return [];
      }
      return result.stdout.split('\n').filter(Boolean);
    } catch (error) {
      return [];
    }
  }

  async getAvailableProjectsWithOrg() {
    try {
      // Get projects with their parent org/folder info
      const result = await execa('gcloud', [
        'projects', 'list', 
        '--format=value(projectId,parent.type,parent.id)',
        '--quiet'
      ], { 
        reject: false,
        timeout: 15000
      });
      if (result.timedOut || result.failed) {
        return [];
      }
      
      const projects = result.stdout.split('\n').filter(Boolean).map(line => {
        const parts = line.split('\t');
        return {
          projectId: parts[0],
          parentType: parts[1] || null,
          parentId: parts[2] || null
        };
      });

      // Get unique org IDs to fetch their names
      const orgIds = [...new Set(
        projects
          .filter(p => p.parentType === 'organization')
          .map(p => p.parentId)
      )];

      // Fetch org names (with timeout for each)
      const orgNames = {};
      await Promise.all(orgIds.map(async (orgId) => {
        try {
          const orgResult = await execa('gcloud', [
            'organizations', 'describe', orgId,
            '--format=value(displayName)',
            '--quiet'
          ], { reject: false, timeout: 5000 });
          if (!orgResult.timedOut && !orgResult.failed && orgResult.stdout) {
            orgNames[orgId] = orgResult.stdout.trim();
          }
        } catch (e) {
          // Ignore - we just won't have the org name
        }
      }));

      return projects.map(p => ({
        projectId: p.projectId,
        orgName: p.parentType === 'organization' ? (orgNames[p.parentId] || null) : null
      }));
    } catch (error) {
      return [];
    }
  }

  async setProject(projectId) {
    try {
      await execa('gcloud', ['config', 'set', 'project', projectId, '--quiet'], {
        timeout: 10000
      });
    } catch (error) {
      throw new Error(`Failed to set project '${projectId}': ${error.message}`);
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
      const { stdout } = await execa('gcloud', ['config', 'get-value', 'account', '--quiet'], {
        timeout: 5000
      });
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
