import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const PROFILE_NAME_PATTERN = /^[a-z][-a-z0-9]*$/;
const GWS_CREDENTIAL_FILES = ['credentials.enc', 'credentials.json'];

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

  getGwsConfigDir(name) {
    return path.join(this.getProfileDir(name), 'gws');
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

  async migrateLegacyGwsCredentials(name) {
    await this.ensureProfile(name);
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

  async getScopedEnvironment(name) {
    const adcPath = await this.ensureAdc(name);
    if (!adcPath) {
      throw new Error(
        `Application Default Credentials are missing for '${name}'. Run: gswitch new ${name}`
      );
    }

    await this.migrateLegacyGwsCredentials(name);
    const gwsConfigDir = this.getGwsConfigDir(name);
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

    if (!hasDedicatedGwsCredentials) {
      environment.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE = adcPath;
    }

    return environment;
  }
}

export const profiles = new ProfileStore();
