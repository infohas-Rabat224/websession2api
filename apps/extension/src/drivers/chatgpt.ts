import { DomProviderDriver } from './base-driver';
import { CHATGPT_SELECTORS } from '../../../../providers/selectors';

export function createChatGptDriver() {
  return new DomProviderDriver({
    providerId: 'chatgpt',
    domain: 'chatgpt.com',
    driverVersion: '1.0.0-chatgpt',
    selectors: CHATGPT_SELECTORS,
  });
}
