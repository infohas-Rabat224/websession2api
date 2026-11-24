import { DomProviderDriver } from './base-driver';
import { CLAUDE_SELECTORS } from '../../../../providers/selectors';

export function createClaudeDriver() {
  return new DomProviderDriver({
    providerId: 'claude',
    domain: 'claude.ai',
    driverVersion: '1.0.0-claude',
    selectors: CLAUDE_SELECTORS,
  });
}
