export const GCLOUD_ADC_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const DOCUMENTS_SCOPE = 'https://www.googleapis.com/auth/documents';
const SPREADSHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

export const GCLOUD_ADC_IDENTITY_SCOPES = Object.freeze([
  'openid',
  'https://www.googleapis.com/auth/userinfo.email'
]);

export const LOGIN_SCOPE_GROUPS = Object.freeze({
  gmail: ['https://www.googleapis.com/auth/gmail.modify'],
  calendar: ['https://www.googleapis.com/auth/calendar'],
  drive: [DRIVE_SCOPE]
});

export const PRODUCTION_OAUTH_CLIENT_SCOPES = Object.freeze([
  ...GCLOUD_ADC_IDENTITY_SCOPES,
  GCLOUD_ADC_SCOPE,
  ...LOGIN_SCOPE_GROUPS.gmail,
  ...LOGIN_SCOPE_GROUPS.calendar,
  ...LOGIN_SCOPE_GROUPS.drive
]);

const WORKSPACE_SCOPE_PREFIXES = Object.freeze([
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets'
]);

export function parseScopes(rawScopes) {
  if (!rawScopes) {
    return [];
  }

  const scopeValues = Array.isArray(rawScopes) ? rawScopes : String(rawScopes).split(',');

  return scopeValues
    .map(scope => String(scope).trim())
    .filter(Boolean);
}

export function normalizeScopes(rawScopes) {
  return mergeScopes(rawScopes);
}

export function mergeScopes(...scopeLists) {
  const scopes = scopeLists.flatMap(scopeList => parseScopes(scopeList));
  let uniqueScopes = [...new Set(scopes)];

  // Full Drive access is accepted by the Docs and Sheets APIs. Drop the two
  // narrower duplicates so renewals from older releases stay least-privilege.
  if (uniqueScopes.includes(DRIVE_SCOPE)) {
    uniqueScopes = uniqueScopes.filter(scope => (
      scope !== DOCUMENTS_SCOPE && scope !== SPREADSHEETS_SCOPE
    ));
  }

  return uniqueScopes.length > 0 ? uniqueScopes.join(',') : undefined;
}

export function getUnsupportedProductionScopes(rawScopes) {
  const supportedScopes = new Set(PRODUCTION_OAUTH_CLIENT_SCOPES);
  return parseScopes(normalizeScopes(rawScopes)).filter(scope => !supportedScopes.has(scope));
}

export function resolveLoginScopes(options = {}) {
  const requestedScopes = parseScopes(options.scopes);
  const helperScopes = [];

  if (options.gmail) {
    helperScopes.push(...LOGIN_SCOPE_GROUPS.gmail);
  }

  if (options.calendar) {
    helperScopes.push(...LOGIN_SCOPE_GROUPS.calendar);
  }

  if (options.drive) {
    helperScopes.push(...LOGIN_SCOPE_GROUPS.drive);
  }

  const scopes = [...requestedScopes, ...helperScopes];

  if (helperScopes.length > 0) {
    scopes.unshift(GCLOUD_ADC_SCOPE);
  }

  // gcloud validates the positional account from the ID token. Custom scope
  // lists must request OpenID identity data or that validation crashes.
  if (scopes.length > 0) {
    scopes.unshift(...GCLOUD_ADC_IDENTITY_SCOPES);
  }

  return mergeScopes(scopes);
}

export function usesWorkspaceScopes(rawScopes) {
  return parseScopes(rawScopes).some(scope =>
    WORKSPACE_SCOPE_PREFIXES.some(prefix => scope.startsWith(prefix))
  );
}
