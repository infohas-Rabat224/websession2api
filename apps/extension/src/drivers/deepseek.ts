import { DomProviderDriver } from './base-driver';
import { DEEPSEEK_SELECTORS } from '../../../../providers/selectors';

export function createDeepSeekDriver() {
  return new DomProviderDriver({
    providerId: 'deepseek',
    domain: 'chat.deepseek.com',
    driverVersion: '1.2.0-deepseek',
    selectors: DEEPSEEK_SELECTORS,
  });
}
