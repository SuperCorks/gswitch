import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const defaultOutputFile = fileURLToPath(
  new URL('../src/config/google-oauth-client.json', import.meta.url)
);

export function parseOAuthClient(rawClient) {
  if (!rawClient) {
    throw new Error('GSWITCH_OAUTH_CLIENT_JSON is required');
  }

  let clientJson;
  try {
    clientJson = JSON.parse(rawClient);
  } catch {
    throw new Error('GSWITCH_OAUTH_CLIENT_JSON must contain valid JSON');
  }

  const client = clientJson.installed;
  if (!client || typeof client !== 'object') {
    throw new Error('OAuth client JSON must contain an installed Desktop client');
  }

  if (!/^[^\s]+\.apps\.googleusercontent\.com$/.test(client.client_id || '')) {
    throw new Error('OAuth client JSON has an invalid Desktop client_id');
  }

  if (typeof client.client_secret !== 'string' || client.client_secret.length === 0) {
    throw new Error('OAuth client JSON must contain client_secret');
  }

  if (!Array.isArray(client.redirect_uris) || !client.redirect_uris.some(isLoopbackRedirect)) {
    throw new Error('OAuth client JSON must contain a loopback redirect URI');
  }

  for (const tokenField of ['access_token', 'refresh_token']) {
    if (tokenField in clientJson || tokenField in client) {
      throw new Error(`OAuth client JSON must not contain ${tokenField}`);
    }
  }

  return clientJson;
}

export function injectOAuthClient(rawClient, outputFile = defaultOutputFile) {
  const clientJson = parseOAuthClient(rawClient);
  const outputDirectory = path.dirname(outputFile);
  const temporaryFile = `${outputFile}.${process.pid}.tmp`;

  fs.mkdirSync(outputDirectory, { recursive: true });

  try {
    fs.writeFileSync(temporaryFile, `${JSON.stringify(clientJson)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600
    });
    fs.renameSync(temporaryFile, outputFile);
    fs.chmodSync(outputFile, 0o600);
  } catch (error) {
    fs.rmSync(temporaryFile, { force: true });
    throw error;
  }

  return outputFile;
}

function isLoopbackRedirect(redirectUri) {
  try {
    const url = new URL(redirectUri);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const outputFile = injectOAuthClient(process.env.GSWITCH_OAUTH_CLIENT_JSON);
    console.log(`Prepared OAuth client at ${path.relative(process.cwd(), outputFile)}`);
  } catch (error) {
    console.error(`Failed to prepare OAuth client: ${error.message}`);
    process.exitCode = 1;
  }
}
