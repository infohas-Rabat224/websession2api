import crypto from 'node:crypto';
import type {
  ProviderError,
  ProviderId,
  RoutingConfig,
  RoutingHistoryEntry,
  TaskCategory,
} from '../../../packages/shared-types/src/index';
import { PROVIDER_MODEL_ALIASES } from '../../../packages/configuration/src/index';
import { createProviderError } from '../../../packages/provider-sdk/src/index';

export interface RouteCandidateInfo {
  providerId: ProviderId;
  enabled: boolean;
  available: boolean;
}

export interface RouteResolutionResult {
  ok: true;
  providerId: ProviderId;
  resolvedAlias: string;
  taskCategory: TaskCategory | null;
  fallbackUsed: boolean;
  fallbackFromProviderId: ProviderId | null;
  reason: string;
}

export interface RouteResolutionFailure {
  ok: false;
  error: ProviderError;
}

const ALIAS_TO_PROVIDER = new Map<string, ProviderId>();
for (const [providerId, meta] of Object.entries(PROVIDER_MODEL_ALIASES) as [
  ProviderId,
  (typeof PROVIDER_MODEL_ALIASES)[ProviderId],
][]) {
  ALIAS_TO_PROVIDER.set(meta.alias.toLowerCase(), providerId);
  ALIAS_TO_PROVIDER.set(meta.prefixedAlias.toLowerCase(), providerId);
  ALIAS_TO_PROVIDER.set(providerId.toLowerCase(), providerId);
}

export function resolveAliasToProviderId(requestedModel: string): ProviderId | null {
  const normalized = requestedModel.trim().toLowerCase();
  return ALIAS_TO_PROVIDER.get(normalized) ?? null;
}

export function extractTaskCategory(requestedModel: string): TaskCategory | null {
  const normalized = requestedModel.trim().toLowerCase();
  if (normalized === 'auto:coding' || normalized === 'task:coding') return 'coding';
  if (normalized === 'auto:long-context' || normalized === 'task:long-context') return 'long-context';
  if (normalized === 'auto:general' || normalized === 'task:general') return 'general';
  return null;
}

export class ModelRouter {
  private config: RoutingConfig;
  private readonly conversationPins = new Map<string, ProviderId>();
  private readonly history: RoutingHistoryEntry[] = [];
  private readonly activePerProvider = new Map<ProviderId, number>();
  private readonly waitQueues = new Map<ProviderId, Array<() => void>>();

  constructor(initialConfig: RoutingConfig) {
    this.config = { ...initialConfig };
  }

  getConfig(): RoutingConfig {
    return {
      ...this.config,
      providerPriority: [...this.config.providerPriority],
      taskPreferences: {
        coding: [...this.config.taskPreferences.coding],
        'long-context': [...this.config.taskPreferences['long-context']],
        general: [...this.config.taskPreferences.general],
      },
    };
  }

  updateConfig(partial: Partial<RoutingConfig>): RoutingConfig {
    this.config = {
      ...this.config,
      ...partial,
      strictConversationPinning: true,
    };
    return this.getConfig();
  }

  getHistory(limit = 50): RoutingHistoryEntry[] {
    return this.history.slice(0, limit);
  }

  getQueueMetrics(): { activeRequests: number; queuedRequests: number } {
    let activeRequests = 0;
    for (const count of this.activePerProvider.values()) {
      activeRequests += count;
    }
    let queuedRequests = 0;
    for (const queue of this.waitQueues.values()) {
      queuedRequests += queue.length;
    }
    return { activeRequests, queuedRequests };
  }

  resolveRoute(params: {
    requestId: string;
    requestedModel: string;
    conversationId?: string;
    candidates: RouteCandidateInfo[];
  }): RouteResolutionResult | RouteResolutionFailure {
    const candidateMap = new Map<ProviderId, RouteCandidateInfo>();
    for (const c of params.candidates) {
      candidateMap.set(c.providerId, c);
    }

    // Rule: Never silently change provider mid-conversation
    if (params.conversationId && this.conversationPins.has(params.conversationId)) {
      const pinned = this.conversationPins.get(params.conversationId)!;
      const pinnedCandidate = candidateMap.get(pinned);
      if (!pinnedCandidate || !pinnedCandidate.enabled || !pinnedCandidate.available) {
        const error = createProviderError(
          'PROVIDER_DISCONNECTED',
          `Conversation "${params.conversationId}" is pinned to provider "${pinned}", which is currently unavailable. WebSession2API refuses to silently switch providers mid-conversation.`,
          503,
          { providerId: pinned, retryable: false }
        );
        this.recordHistory({
          requestId: params.requestId,
          requestedModel: params.requestedModel,
          taskCategory: null,
          selectedProviderId: pinned,
          fallbackFromProviderId: null,
          reason: 'Pinned conversation provider unavailable; silent mid-conversation switch blocked',
          status: 'rejected',
        });
        return { ok: false, error };
      }

      const alias = PROVIDER_MODEL_ALIASES[pinned].alias;
      this.recordHistory({
        requestId: params.requestId,
        requestedModel: params.requestedModel,
        taskCategory: null,
        selectedProviderId: pinned,
        fallbackFromProviderId: null,
        reason: 'Routed to conversation-pinned provider',
        status: 'routed',
      });
      return {
        ok: true,
        providerId: pinned,
        resolvedAlias: alias,
        taskCategory: null,
        fallbackUsed: false,
        fallbackFromProviderId: null,
        reason: 'Conversation pinned to provider',
      };
    }

    const taskCategory = extractTaskCategory(params.requestedModel);
    let orderedCandidates: ProviderId[] = [];
    let primaryProvider: ProviderId | null = null;

    if (taskCategory) {
      const preferredAliases = this.config.taskPreferences[taskCategory] ?? [];
      for (const alias of preferredAliases) {
        const pid = resolveAliasToProviderId(alias);
        if (pid && !orderedCandidates.includes(pid)) {
          orderedCandidates.push(pid);
        }
      }
      primaryProvider = orderedCandidates[0] ?? this.config.defaultProviderId;
    } else if (
      params.requestedModel.trim().toLowerCase() === 'default' ||
      params.requestedModel.trim().toLowerCase() === 'auto'
    ) {
      primaryProvider = this.config.defaultProviderId;
      orderedCandidates = [primaryProvider];
    } else {
      primaryProvider = resolveAliasToProviderId(params.requestedModel);
      if (!primaryProvider) {
        return {
          ok: false,
          error: createProviderError(
            'INVALID_REQUEST',
            `Unknown model alias "${params.requestedModel}". Use a registered alias (e.g. deepseek-web, glm-web, websession/deepseek, websession/glm) or task route (auto:coding, auto:long-context, auto:general).`,
            404
          ),
        };
      }
      orderedCandidates = [primaryProvider];
    }

    if (this.config.fallbackEnabled) {
      for (const pid of this.config.providerPriority) {
        if (!orderedCandidates.includes(pid)) {
          orderedCandidates.push(pid);
        }
      }
    }

    for (let i = 0; i < orderedCandidates.length; i++) {
      const pid = orderedCandidates[i];
      const info = candidateMap.get(pid);
      if (info && info.enabled && info.available) {
        const fallbackUsed = pid !== primaryProvider;
        if (params.conversationId) {
          this.conversationPins.set(params.conversationId, pid);
        }
        const reason = fallbackUsed
          ? `Primary provider "${primaryProvider}" unavailable; fell back to "${pid}" per priority order`
          : taskCategory
            ? `Matched task preference "${taskCategory}" -> "${pid}"`
            : `Direct model alias match -> "${pid}"`;

        this.recordHistory({
          requestId: params.requestId,
          requestedModel: params.requestedModel,
          taskCategory,
          selectedProviderId: pid,
          fallbackFromProviderId: fallbackUsed ? primaryProvider : null,
          reason,
          status: fallbackUsed ? 'fallback_routed' : 'routed',
        });

        return {
          ok: true,
          providerId: pid,
          resolvedAlias: PROVIDER_MODEL_ALIASES[pid].alias,
          taskCategory,
          fallbackUsed,
          fallbackFromProviderId: fallbackUsed ? primaryProvider : null,
          reason,
        };
      }
    }

    // No candidate available — return explicit error pointing at primaryProvider
    const primary = primaryProvider || this.config.defaultProviderId;
    const primaryInfo = candidateMap.get(primary);
    const reason = !primaryInfo?.enabled
      ? `Provider "${primary}" is disabled and no fallback provider is connected.`
      : `Provider "${primary}" is disconnected${this.config.fallbackEnabled ? ' and no fallback provider is currently authenticated' : ' (fallback disabled)'}.`;

    this.recordHistory({
      requestId: params.requestId,
      requestedModel: params.requestedModel,
      taskCategory,
      selectedProviderId: primary,
      fallbackFromProviderId: null,
      reason,
      status: 'rejected',
    });

    return {
      ok: false,
      error: createProviderError(
        !primaryInfo?.enabled ? 'PROVIDER_DISABLED' : 'PROVIDER_DISCONNECTED',
        reason,
        503,
        { providerId: primary, retryable: false }
      ),
    };
  }

  async acquireSlot(providerId: ProviderId): Promise<() => void> {
    const active = this.activePerProvider.get(providerId) ?? 0;
    if (active < this.config.maxConcurrencyPerProvider) {
      this.activePerProvider.set(providerId, active + 1);
      return () => this.releaseSlot(providerId);
    }

    const queue = this.waitQueues.get(providerId) ?? [];
    if (queue.length >= this.config.maxQueueDepth) {
      throw createProviderError(
        'QUEUE_FULL',
        `Provider "${providerId}" request queue is full (max ${this.config.maxQueueDepth} queued).`,
        429,
        { providerId, retryable: true }
      );
    }

    await new Promise<void>((resolve) => {
      queue.push(resolve);
      this.waitQueues.set(providerId, queue);
    });

    const nextActive = this.activePerProvider.get(providerId) ?? 0;
    this.activePerProvider.set(providerId, nextActive + 1);
    return () => this.releaseSlot(providerId);
  }

  private releaseSlot(providerId: ProviderId): void {
    const active = this.activePerProvider.get(providerId) ?? 0;
    this.activePerProvider.set(providerId, Math.max(0, active - 1));
    const queue = this.waitQueues.get(providerId);
    if (queue && queue.length > 0) {
      const next = queue.shift();
      next?.();
    }
  }

  private recordHistory(entry: Omit<RoutingHistoryEntry, 'id' | 'timestamp'>): void {
    this.history.unshift({
      id: `rt_${crypto.randomBytes(6).toString('hex')}`,
      timestamp: new Date().toISOString(),
      ...entry,
    });
    if (this.history.length > 100) {
      this.history.length = 100;
    }
  }
}
