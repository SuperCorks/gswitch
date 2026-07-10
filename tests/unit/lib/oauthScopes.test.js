import { describe, expect, it } from 'vitest';
import {
  GCLOUD_ADC_IDENTITY_SCOPES,
  GCLOUD_ADC_SCOPE,
  LOGIN_SCOPE_GROUPS,
  resolveLoginScopes
} from '../../../src/lib/oauthScopes.js';

describe('lib/oauthScopes', () => {
  it('adds identity scopes when explicit ADC scopes are requested', () => {
    expect(resolveLoginScopes({ scopes: 'scope-a,scope-b' })).toBe([
      ...GCLOUD_ADC_IDENTITY_SCOPES,
      'scope-a',
      'scope-b'
    ].join(','));
  });

  it('adds cloud and identity scopes for Workspace helper flags', () => {
    expect(resolveLoginScopes({ gmail: true, drive: true })).toBe([
      ...GCLOUD_ADC_IDENTITY_SCOPES,
      GCLOUD_ADC_SCOPE,
      ...LOGIN_SCOPE_GROUPS.gmail,
      ...LOGIN_SCOPE_GROUPS.drive
    ].join(','));
  });

  it('does not add scopes to the default ADC flow', () => {
    expect(resolveLoginScopes()).toBeUndefined();
  });
});
