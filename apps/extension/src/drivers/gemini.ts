import { DomProviderDriver } from './base-driver';
import { GEMINI_SELECTORS } from '../../../../providers/selectors';

export function createGeminiDriver() {
  return new DomProviderDriver({
    providerId: 'gemini',
    domain: 'gemini.google.com',
    driverVersion: '1.0.0-gemini',
    selectors: GEMINI_SELECTORS,
  });
}
