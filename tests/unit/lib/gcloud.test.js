import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { gcloud } from '../../../src/lib/gcloud.js';
import * as execaModule from 'execa';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { PassThrough } from 'stream';

vi.mock('execa');
vi.mock('fs/promises');
vi.mock('os');

describe('lib/gcloud', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('configuration management', () => {
    it('should list configurations', async () => {
      vi.mocked(execaModule.execa).mockResolvedValue({ stdout: 'default\npersonal\nwork' });

      const configs = await gcloud.getConfigurations();
      
      expect(execaModule.execa).toHaveBeenCalledWith(
        'gcloud', 
        ['config', 'configurations', 'list', '--format=value(name)'],
        { timeout: 10000 }
      );
      expect(configs).toEqual(['default', 'personal', 'work']);
    });

    it('should handle empty configurations list', async () => {
      vi.mocked(execaModule.execa).mockResolvedValue({ stdout: '' });

      const configs = await gcloud.getConfigurations();
      expect(configs).toEqual([]);
    });

    it('should throw error when listing configurations fails', async () => {
      vi.mocked(execaModule.execa).mockRejectedValue(new Error('Command failed'));

      await expect(gcloud.getConfigurations()).rejects.toThrow('Failed to list configurations: Command failed');
    });

    it('should check if configuration exists', async () => {
      vi.mocked(execaModule.execa).mockResolvedValue({ stdout: 'default\npersonal\nwork' });

      expect(await gcloud.configurationExists('personal')).toBe(true);
      expect(await gcloud.configurationExists('nonexistent')).toBe(false);
    });

    it('should activate configuration', async () => {
      vi.mocked(execaModule.execa).mockResolvedValue({ stdout: '' });

      await gcloud.activateConfiguration('personal');
      
      expect(execaModule.execa).toHaveBeenCalledWith(
        'gcloud', 
        ['config', 'configurations', 'activate', 'personal', '--quiet'],
        { timeout: 10000 }
      );
    });

    it('should throw error when activating configuration fails', async () => {
      vi.mocked(execaModule.execa).mockRejectedValue(new Error('Command failed'));

      await expect(gcloud.activateConfiguration('invalid')).rejects.toThrow("Failed to activate configuration 'invalid': Command failed");
    });
  });

  describe('project info', () => {
    it('should get current project', async () => {
      vi.mocked(execaModule.execa).mockResolvedValue({ stdout: 'my-project' });

      const project = await gcloud.getCurrentProject();
      
      expect(execaModule.execa).toHaveBeenCalledWith(
        'gcloud', 
        ['config', 'get-value', 'project', '--quiet'],
        { timeout: 5000 }
      );
      expect(project).toBe('my-project');
    });

    it('should return null when get current project fails', async () => {
      vi.mocked(execaModule.execa).mockRejectedValue(new Error('Command failed'));

      const project = await gcloud.getCurrentProject();
      expect(project).toBeNull();
    });

    it('should get available projects', async () => {
      vi.mocked(execaModule.execa).mockResolvedValue({ stdout: 'proj1\nproj2' });

      const projects = await gcloud.getAvailableProjects();
      
      expect(execaModule.execa).toHaveBeenCalledWith(
        'gcloud', 
        ['projects', 'list', '--format=value(projectId)', '--quiet'], 
        { reject: false, timeout: 15000 }
      );
      expect(projects).toEqual(['proj1', 'proj2']);
    });

    it('should return empty list when get available projects fails', async () => {
      vi.mocked(execaModule.execa).mockRejectedValue(new Error('Command failed'));

      const projects = await gcloud.getAvailableProjects();
      expect(projects).toEqual([]);
    });

    it('should return empty list when get available projects times out', async () => {
      vi.mocked(execaModule.execa).mockResolvedValue({ stdout: '', timedOut: true });

      const projects = await gcloud.getAvailableProjects();
      expect(projects).toEqual([]);
    });

    it('should set project', async () => {
      vi.mocked(execaModule.execa).mockResolvedValue({ stdout: '' });

      await gcloud.setProject('my-project');
      
      expect(execaModule.execa).toHaveBeenCalledWith(
        'gcloud', 
        ['config', 'set', 'project', 'my-project', '--quiet'],
        { timeout: 10000 }
      );
    });

    it('should throw error when set project fails', async () => {
      vi.mocked(execaModule.execa).mockRejectedValue(new Error('Command failed'));

      await expect(gcloud.setProject('invalid')).rejects.toThrow("Failed to set project 'invalid': Command failed");
    });

    it('should get available projects with org info', async () => {
      vi.mocked(execaModule.execa)
        .mockResolvedValueOnce({ stdout: 'proj1\torganization\t123456\nproj2\t\t' })
        .mockResolvedValueOnce({ stdout: 'My Org' });

      const projects = await gcloud.getAvailableProjectsWithOrg();
      
      expect(projects).toEqual([
        { projectId: 'proj1', orgName: 'My Org' },
        { projectId: 'proj2', orgName: null }
      ]);
    });

    it('should return empty list when get available projects with org fails', async () => {
      vi.mocked(execaModule.execa).mockRejectedValue(new Error('Command failed'));

      const projects = await gcloud.getAvailableProjectsWithOrg();
      expect(projects).toEqual([]);
    });
  });

  describe('ADC management', () => {
    const mockHome = '/home/user';
    
    beforeEach(() => {
      vi.mocked(os.homedir).mockReturnValue(mockHome);
    });

    it('should update ADC if source file exists', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined); // File exists
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);

      const result = await gcloud.updateAdc('personal');

      const expectedSource = path.join(mockHome, '.config/gcloud/application_default_credentials_personal.json');
      const expectedDest = path.join(mockHome, '.config/gcloud/application_default_credentials.json');

      expect(fs.access).toHaveBeenCalledWith(expectedSource);
      expect(fs.copyFile).toHaveBeenCalledWith(expectedSource, expectedDest);
      expect(result).toBe(true);
    });

    it('should not update ADC if source file does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await gcloud.updateAdc('personal');

      expect(fs.copyFile).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe('auth flows', () => {
    it('should run standard auth login by default', async () => {
      vi.mocked(execaModule.execa).mockResolvedValue({ stdout: '' });

      await gcloud.login('user@example.com');

      expect(execaModule.execa).toHaveBeenCalledWith(
        'gcloud',
        ['auth', 'login', '--account=user@example.com'],
        { stdio: 'inherit' }
      );
    });

    it('should launch Chrome incognito for private login on macOS', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');

      const stdout = new PassThrough();
      const stderr = new PassThrough();
      let resolveChild;
      const child = new Promise(resolve => {
        resolveChild = resolve;
      });
      child.stdout = stdout;
      child.stderr = stderr;

      vi.mocked(execaModule.execa)
        .mockImplementationOnce(() => child)
        .mockResolvedValueOnce({ exitCode: 0, failed: false });

      const stdoutWrite = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      const url = 'https://accounts.google.com/o/oauth2/auth?foo=bar';

      const loginPromise = gcloud.login('user@example.com', { private: true });
      stdout.write(`Open the following link in your browser:\n${url}\n`);
      resolveChild({ exitCode: 0 });
      await loginPromise;

      expect(execaModule.execa).toHaveBeenNthCalledWith(
        1,
        'gcloud',
        ['auth', 'login', '--account=user@example.com', '--no-launch-browser'],
        {
          stdin: 'inherit',
          stdout: 'pipe',
          stderr: 'pipe'
        }
      );
      expect(execaModule.execa).toHaveBeenNthCalledWith(
        2,
        'open',
        ['-na', 'Google Chrome', '--args', '--incognito', url],
        { reject: false }
      );

      stdoutWrite.mockRestore();
    });
  });
});
