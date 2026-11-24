import { DomProviderDriver } from './base-driver';
import { ZAI_SELECTORS } from '../../../../providers/selectors';

export function createZaiDriver() {
  return new DomProviderDriver({
    providerId: 'zai',
    domain: 'chat.z.ai',
    driverVersion: '1.2.0-zai',
    selectors: ZAI_SELECTORS,
  });
}
