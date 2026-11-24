import { DomProviderDriver } from './base-driver';
import { QWEN_SELECTORS } from '../../../../providers/selectors';

export function createQwenDriver() {
  return new DomProviderDriver({
    providerId: 'qwen',
    domain: 'chat.qwen.ai',
    driverVersion: '1.0.0-qwen',
    selectors: QWEN_SELECTORS,
  });
}
