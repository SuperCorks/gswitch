import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const PROFILE_NAME_PATTERN = /^[a-z][-a-z0-9]*$/;
const GWS_CREDENTIAL_FILES = ['credentials.enc', 'credentials.json'];
const GWS_ADC_MARKER = 'use-adc';
const RENEWAL_SETTINGS_FILE = 'renewal.json';

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export class ProfileStore {
  validateName(name) {
    if (!PROFILE_NAME_PATTERN.test(name)) {
      throw new Error(`Invalid configuration name '${name}'`);
    }
  }

  getRootDir() {
    return path.join(os.homedir(), '.config/gswitch/profiles');
  }

  getProfileDir(name) {
    this.validateName(name);
    return path.join(this.getRootDir(), name);
  }

  getAdcPath(name) {
    return path.join(this.getProfileDir(name), 'adc.json');
  }

  getRenewalSettingsPath(name) {
    return path.join(this.getProfileDir(name), RENEWAL_SETTINGS_FILE);
  }

  getGwsConfigDir(name) {
    return path.join(this.getProfileDir(name), 'gws');
  }

  getGwsAdcMarkerPath(name) {
    return path.join(this.getGwsConfigDir(name), GWS_ADC_MARKER);
  }

  getActiveAdcPath() {
    return path.join(os.homedir(), '.config/gcloud/application_default_credentials.json');
  }

  getLegacyAdcPath(name) {
    this.validateName(name);
    return path.join(
      os.homedir(),
      '.config/gcloud',
      `application_default_credentials_${name}.json`
    );
  }

  getLegacyGwsCredentialPath(name, fileName) {
    this.validateName(name);
    const extension = path.extname(fileName);
    const baseName = path.basename(fileName, extension);
    return path.join(os.homedir(), '.config/gws', `${baseName}_${name}${extension}`);
  }

  async ensureProfile(name) {
    const profileDir = this.getProfileDir(name);
    const gwsConfigDir = this.getGwsConfigDir(name);
    await fs.mkdir(profileDir, { recursive: true, mode: 0o700 });
    await fs.mkdir(gwsConfigDir, { recursive: true, mode: 0o700 });
    return profileDir;
  }

  async copyPrivate(source, destination) {
    await fs.copyFile(source, destination);
    await fs.chmod(destination, 0o600);
  }

  async ensureAdc(name) {
    await this.ensureProfile(name);
    const adcPath = this.getAdcPath(name);
    if (await fileExists(adcPath)) {
      return adcPath;
    }

    const legacyAdcPath = this.getLegacyAdcPath(name);
    if (!(await fileExists(legacyAdcPath))) {
      return null;
    }

    await this.copyPrivate(legacyAdcPath, adcPath);
    return adcPath;
  }

  async saveActiveAdc(name) {
    await this.ensureProfile(name);
    const adcPath = this.getAdcPath(name);
    await this.copyPrivate(this.getActiveAdcPath(), adcPath);
    return adcPath;
  }

  async hasStoredProfile(name) {
    const paths = [
      this.getProfileDir(name),
      this.getLegacyAdcPath(name),
      ...GWS_CREDENTIAL_FILES.map(fileName => this.getLegacyGwsCredentialPath(name, fileName))
    ];
    const existingPaths = await Promise.all(paths.map(fileExists));
    return existingPaths.some(Boolean);
  }

  async removeProfile(name) {
    await fs.rm(this.getProfileDir(name), { recursive: true, force: true });
    await fs.rm(this.getLegacyAdcPath(name), { force: true });

    for (const fileName of GWS_CREDENTIAL_FILES) {
      await fs.rm(this.getLegacyGwsCredentialPath(name, fileName), { force: true });
    }
  }

  async saveRenewalSettings(name, { email, scopes, clientIdFile } = {}) {
    if (typeof email !== 'string' || email.trim() === '') {
      throw new Error(`Cannot save renewal settings for '${name}' without an email`);
    }

    await this.ensureProfile(name);
    const settingsPath = this.getRenewalSettingsPath(name);
    const settings = {
      version: 1,
      email,
      ...(scopes ? { scopes } : {}),
      ...(clientIdFile ? { clientIdFile } : {})
    };

    await fs.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
    await fs.chmod(settingsPath, 0o600);
    return settingsPath;
  }

  async loadRenewalSettings(name) {
    const settingsPath = this.getRenewalSettingsPath(name);
    let rawSettings;

    try {
      rawSettings = await fs.readFile(settingsPath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return null;
      }
      throw new Error(`Failed to read renewal settings for '${name}': ${error.message}`);
    }

    let settings;
    try {
      settings = JSON.parse(rawSettings);
    } catch {
      throw new Error(`Renewal settings for '${name}' are invalid`);
    }

    if (
      settings?.version !== 1 ||
      typeof settings.email !== 'string' ||
      settings.email.trim() === '' ||
      (settings.scopes !== undefined && typeof settings.scopes !== 'string') ||
      (settings.clientIdFile !== undefined && typeof settings.clientIdFile !== 'string')
    ) {
      throw new Error(`Renewal settings for '${name}' are invalid`);
    }

    return settings;
  }

  async migrateLegacyGwsCredentials(name) {
    await this.ensureProfile(name);
    if (await this.usesAdcForGws(name)) {
      return;
    }

    const gwsConfigDir = this.getGwsConfigDir(name);
    const profileCredentialPaths = GWS_CREDENTIAL_FILES.map(fileName => (
      path.join(gwsConfigDir, fileName)
    ));
    const hasProfileCredentials = (
      await Promise.all(profileCredentialPaths.map(fileExists))
    ).some(Boolean);

    if (hasProfileCredentials) {
      return;
    }

    for (const fileName of GWS_CREDENTIAL_FILES) {
      const profilePath = path.join(gwsConfigDir, fileName);
      const legacyPath = this.getLegacyGwsCredentialPath(name, fileName);
      if (await fileExists(legacyPath)) {
        await this.copyPrivate(legacyPath, profilePath);
      }
    }
  }

  async usesAdcForGws(name) {
    return fileExists(this.getGwsAdcMarkerPath(name));
  }

  async markGwsUsesAdc(name) {
    await this.ensureProfile(name);
    const markerPath = this.getGwsAdcMarkerPath(name);
    await fs.writeFile(markerPath, 'ADC\n', { mode: 0o600 });
    await fs.chmod(markerPath, 0o600);

    // ADC is already stored at the profile root. Keep encrypted legacy
    // credentials as rollback data, but remove redundant plaintext state.
    await fs.rm(path.join(this.getGwsConfigDir(name), 'credentials.json'), { force: true });
    await fs.rm(path.join(this.getGwsConfigDir(name), 'token_cache.json'), { force: true });
  }

  async getScopedEnvironment(name) {
    const adcPath = await this.ensureAdc(name);
    if (!adcPath) {
      throw new Error(
        `Application Default Credentials are missing for '${name}'. Run: gswitch new ${name}`
      );
    }

    await this.migrateLegacyGwsCredentials(name);
    const gwsConfigDir = this.getGwsConfigDir(name);
    const usesAdc = await this.usesAdcForGws(name);
    const encryptedGwsCredentials = path.join(gwsConfigDir, 'credentials.enc');
    const plainGwsCredentials = path.join(gwsConfigDir, 'credentials.json');
    const hasDedicatedGwsCredentials = (
      (await fileExists(encryptedGwsCredentials)) ||
      (await fileExists(plainGwsCredentials))
    );

    const environment = {
      GSWITCH_PROFILE: name,
      CLOUDSDK_ACTIVE_CONFIG_NAME: name,
      GOOGLE_APPLICATION_CREDENTIALS: adcPath,
      GOOGLE_WORKSPACE_CLI_CONFIG_DIR: gwsConfigDir
    };

    if (usesAdc || !hasDedicatedGwsCredentials) {
      environment.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE = adcPath;
    }

    return environment;
  }
}

export const profiles = new ProfileStore();
