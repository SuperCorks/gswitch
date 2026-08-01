import { describe, expect, it } from 'vitest';
import {
  GCLOUD_ADC_IDENTITY_SCOPES,
  GCLOUD_ADC_SCOPE,
  LOGIN_SCOPE_GROUPS,
  getUnsupportedProductionScopes,
  normalizeScopes,
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

  it('uses one Drive scope for Drive, Docs, and Sheets operations', () => {
    expect(LOGIN_SCOPE_GROUPS.drive).toEqual([
      'https://www.googleapis.com/auth/drive'
    ]);
  });

  it('removes redundant Docs and Sheets scopes when Drive is present', () => {
    expect(normalizeScopes([
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets'
    ])).toBe('https://www.googleapis.com/auth/drive');
  });

  it('preserves standalone Docs and Sheets scopes without Drive', () => {
    expect(normalizeScopes([
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/spreadsheets'
    ])).toBe([
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/spreadsheets'
    ].join(','));
  });

  it('identifies scopes not declared for the bundled production client', () => {
    expect(getUnsupportedProductionScopes([
      GCLOUD_ADC_SCOPE,
      ...LOGIN_SCOPE_GROUPS.gmail,
      'https://www.googleapis.com/auth/contacts'
    ])).toEqual(['https://www.googleapis.com/auth/contacts']);
  });

  it('does not add scopes to the default ADC flow', () => {
    expect(resolveLoginScopes()).toBeUndefined();
  });
});
