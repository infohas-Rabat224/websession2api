import { DomProviderDriver } from './base-driver';
import { KIMI_SELECTORS } from '../../../../providers/selectors';

export function createKimiDriver() {
  return new DomProviderDriver({
    providerId: 'kimi',
    domain: 'kimi.moonshot.cn',
    driverVersion: '1.0.0-kimi',
    selectors: KIMI_SELECTORS,
  });
}
