export const GCLOUD_ADC_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

export const GWS_IDENTITY_SCOPES = Object.freeze([
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
]);

export const LOGIN_SCOPE_GROUPS = Object.freeze({
  gmail: ['https://www.googleapis.com/auth/gmail.modify'],
  calendar: ['https://www.googleapis.com/auth/calendar'],
  drive: [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/spreadsheets'
  ]
});

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
  const scopes = parseScopes(rawScopes);
  return scopes.length > 0 ? scopes.join(',') : undefined;
}

export function mergeScopes(...scopeLists) {
  const scopes = scopeLists.flatMap(scopeList => parseScopes(scopeList));
  const uniqueScopes = [...new Set(scopes)];
  return uniqueScopes.length > 0 ? uniqueScopes.join(',') : undefined;
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

  return mergeScopes(scopes);
}

export function usesWorkspaceScopes(rawScopes) {
  return parseScopes(rawScopes).some(scope =>
    WORKSPACE_SCOPE_PREFIXES.some(prefix => scope.startsWith(prefix))
  );
}
