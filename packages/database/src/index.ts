import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { desc, eq } from 'drizzle-orm';
import * as schema from './schema';
import type {
  AgentProfile,
  GatewaySettings,
  ProviderId,
  ProviderVerificationReport,
  RequestLogEntry,
  RoutingConfig,
  RoutingRule,
  SelectorHealthReport,
} from '../../shared-types/src/index';

export * from './schema';

export interface DatabaseContext {
  sqlite: Database.Database;
  db: BetterSQLite3Database<typeof schema>;
  dbPath: string;
  close: () => void;
}

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  domain TEXT NOT NULL,
  url TEXT NOT NULL,
  driver_version TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  mode TEXT NOT NULL DEFAULT 'browser_session',
  verification_status TEXT NOT NULL DEFAULT 'IMPLEMENTED',
  official_api_base_url TEXT,
  official_api_key_encrypted TEXT,
  capabilities_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_sessions (
  provider_id TEXT PRIMARY KEY,
  session_status TEXT NOT NULL DEFAULT 'disconnected',
  auth_status TEXT NOT NULL DEFAULT 'unknown',
  active_tab_id INTEGER,
  active_tab_title TEXT,
  active_tab_url TEXT,
  visible_model_name TEXT,
  last_connected_at TEXT,
  last_successful_request_at TEXT,
  last_error_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  visible_model_name TEXT,
  available INTEGER NOT NULL DEFAULT 0,
  capabilities_json TEXT NOT NULL,
  last_discovered_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS model_aliases (
  alias TEXT PRIMARY KEY,
  prefixed_alias TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  provider_id TEXT,
  model TEXT NOT NULL,
  protocol TEXT NOT NULL,
  mode TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  http_status INTEGER NOT NULL,
  error_code TEXT,
  error_message TEXT,
  streaming INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER,
  output_tokens INTEGER,
  is_simulated INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_requests_provider ON requests(provider_id);

CREATE TABLE IF NOT EXISTS routing_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  task_category TEXT NOT NULL,
  preferred_aliases_json TEXT NOT NULL,
  fallback_enabled INTEGER NOT NULL DEFAULT 1,
  priority_order_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL,
  endpoint_url TEXT NOT NULL,
  compatibility_status TEXT NOT NULL,
  version_notes TEXT NOT NULL,
  tool_execution_warning TEXT NOT NULL,
  config_filename TEXT NOT NULL,
  config_format TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS diagnostics (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  driver_version TEXT NOT NULL,
  healthy INTEGER NOT NULL DEFAULT 0,
  ui_drift_detected INTEGER NOT NULL DEFAULT 0,
  results_json TEXT NOT NULL,
  summary TEXT NOT NULL,
  checked_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_diagnostics_provider ON diagnostics(provider_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS provider_verifications (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  driver_version TEXT NOT NULL,
  mode TEXT NOT NULL,
  operational_status TEXT NOT NULL,
  passed_core_checks INTEGER NOT NULL DEFAULT 0,
  total_core_checks INTEGER NOT NULL DEFAULT 6,
  report_json TEXT NOT NULL,
  last_successful_test_at TEXT,
  checked_at TEXT NOT NULL,
  is_simulated INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_provider_verifications_provider ON provider_verifications(provider_id, checked_at DESC);
`;

export function initDatabase(dbPathInput?: string): DatabaseContext {
  const dbPath = dbPathInput || process.env.WEBSESSION2API_DB_PATH || './data/websession2api.db';
  if (dbPath !== ':memory:') {
    const resolved = path.resolve(dbPath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(MIGRATION_SQL);

  const db = drizzle(sqlite, { schema });

  return {
    sqlite,
    db,
    dbPath,
    close: () => {
      sqlite.close();
    },
  };
}

export class WebSessionRepository {
  constructor(private readonly ctx: DatabaseContext) {}

  getSetting<T>(key: string): T | null {
    const row = this.ctx.db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, key))
      .get();
    if (!row) return null;
    try {
      return JSON.parse(row.valueJson) as T;
    } catch {
      return null;
    }
  }

  setSetting<T>(key: string, value: T): void {
    const now = new Date().toISOString();
    this.ctx.db
      .insert(schema.settings)
      .values({ key, valueJson: JSON.stringify(value), updatedAt: now })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { valueJson: JSON.stringify(value), updatedAt: now },
      })
      .run();
  }

  getGatewaySettings(): GatewaySettings | null {
    return this.getSetting<GatewaySettings>('gateway_settings');
  }

  saveGatewaySettings(next: GatewaySettings): void {
    this.setSetting('gateway_settings', next);
  }

  getRoutingConfig(): RoutingConfig | null {
    return this.getSetting<RoutingConfig>('routing_config');
  }

  saveRoutingConfig(next: RoutingConfig): void {
    this.setSetting('routing_config', next);
  }

  upsertProviderRecord(record: {
    id: ProviderId;
    name: string;
    shortName: string;
    domain: string;
    url: string;
    driverVersion: string;
    enabled: boolean;
    mode: string;
    verificationStatus: string;
    officialApiBaseUrl: string | null;
    officialApiKeyEncrypted?: string | null;
    capabilitiesJson: string;
  }): void {
    const now = new Date().toISOString();
    const existing = this.ctx.db
      .select()
      .from(schema.providers)
      .where(eq(schema.providers.id, record.id))
      .get();

    if (!existing) {
      this.ctx.db
        .insert(schema.providers)
        .values({
          ...record,
          officialApiKeyEncrypted: record.officialApiKeyEncrypted ?? null,
          updatedAt: now,
        })
        .run();
      return;
    }

    this.ctx.db
      .update(schema.providers)
      .set({
        name: record.name,
        shortName: record.shortName,
        domain: record.domain,
        url: record.url,
        driverVersion: record.driverVersion,
        enabled: record.enabled,
        mode: record.mode,
        verificationStatus: record.verificationStatus,
        officialApiBaseUrl: record.officialApiBaseUrl,
        ...(record.officialApiKeyEncrypted !== undefined
          ? { officialApiKeyEncrypted: record.officialApiKeyEncrypted }
          : {}),
        capabilitiesJson: record.capabilitiesJson,
        updatedAt: now,
      })
      .where(eq(schema.providers.id, record.id))
      .run();
  }

  getProviderRecords() {
    return this.ctx.db.select().from(schema.providers).all();
  }

  getProviderRecord(providerId: ProviderId) {
    return this.ctx.db
      .select()
      .from(schema.providers)
      .where(eq(schema.providers.id, providerId))
      .get();
  }

  upsertProviderSession(session: {
    providerId: ProviderId;
    sessionStatus: string;
    authStatus: string;
    activeTabId: number | null;
    activeTabTitle: string | null;
    activeTabUrl: string | null;
    visibleModelName: string | null;
    lastConnectedAt: string | null;
    lastSuccessfulRequestAt: string | null;
    lastErrorJson: string | null;
  }): void {
    const now = new Date().toISOString();
    this.ctx.db
      .insert(schema.providerSessions)
      .values({ ...session, updatedAt: now })
      .onConflictDoUpdate({
        target: schema.providerSessions.providerId,
        set: { ...session, updatedAt: now },
      })
      .run();
  }

  getProviderSessions() {
    return this.ctx.db.select().from(schema.providerSessions).all();
  }

  upsertModelAlias(entry: {
    alias: string;
    prefixedAlias: string;
    providerId: ProviderId;
    modelId: string;
    enabled: boolean;
  }): void {
    const now = new Date().toISOString();
    this.ctx.db
      .insert(schema.modelAliases)
      .values({ ...entry, updatedAt: now })
      .onConflictDoUpdate({
        target: schema.modelAliases.alias,
        set: { ...entry, updatedAt: now },
      })
      .run();
  }

  upsertModel(entry: {
    id: string;
    providerId: ProviderId;
    visibleModelName: string | null;
    available: boolean;
    capabilitiesJson: string;
  }): void {
    const now = new Date().toISOString();
    this.ctx.db
      .insert(schema.models)
      .values({ ...entry, lastDiscoveredAt: now })
      .onConflictDoUpdate({
        target: schema.models.id,
        set: { ...entry, lastDiscoveredAt: now },
      })
      .run();
  }

  logRequest(entry: RequestLogEntry): void {
    this.ctx.db
      .insert(schema.requests)
      .values({
        id: entry.id,
        requestId: entry.requestId,
        timestamp: entry.timestamp,
        providerId: entry.providerId,
        model: entry.model,
        protocol: entry.protocol,
        mode: entry.mode,
        durationMs: entry.durationMs,
        status: entry.status,
        httpStatus: entry.httpStatus,
        errorCode: entry.errorCode,
        errorMessage: entry.errorMessage,
        streaming: entry.streaming,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        isSimulated: entry.isSimulated,
      })
      .run();
  }

  listRequests(limit = 100, isSimulated?: boolean): RequestLogEntry[] {
    const rows =
      isSimulated === undefined
        ? this.ctx.db
            .select()
            .from(schema.requests)
            .orderBy(desc(schema.requests.timestamp))
            .limit(limit)
            .all()
        : this.ctx.db
            .select()
            .from(schema.requests)
            .where(eq(schema.requests.isSimulated, isSimulated))
            .orderBy(desc(schema.requests.timestamp))
            .limit(limit)
            .all();

    return rows.map((row) => ({
      id: row.id,
      requestId: row.requestId,
      timestamp: row.timestamp,
      providerId: (row.providerId as ProviderId | null) ?? null,
      model: row.model,
      protocol: row.protocol as RequestLogEntry['protocol'],
      mode: row.mode as RequestLogEntry['mode'],
      durationMs: row.durationMs,
      status: row.status as RequestLogEntry['status'],
      httpStatus: row.httpStatus,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      streaming: row.streaming,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      isSimulated: row.isSimulated,
    }));
  }

  upsertRoutingRule(rule: RoutingRule): void {
    this.ctx.db
      .insert(schema.routingRules)
      .values({
        id: rule.id,
        name: rule.name,
        taskCategory: rule.taskCategory,
        preferredAliasesJson: JSON.stringify(rule.preferredAliases),
        fallbackEnabled: rule.fallbackEnabled,
        priorityOrderJson: JSON.stringify(rule.priorityOrder),
        enabled: rule.enabled,
        updatedAt: rule.updatedAt,
      })
      .onConflictDoUpdate({
        target: schema.routingRules.id,
        set: {
          name: rule.name,
          taskCategory: rule.taskCategory,
          preferredAliasesJson: JSON.stringify(rule.preferredAliases),
          fallbackEnabled: rule.fallbackEnabled,
          priorityOrderJson: JSON.stringify(rule.priorityOrder),
          enabled: rule.enabled,
          updatedAt: rule.updatedAt,
        },
      })
      .run();
  }

  listRoutingRules(): RoutingRule[] {
    return this.ctx.db
      .select()
      .from(schema.routingRules)
      .all()
      .map((r) => ({
        id: r.id,
        name: r.name,
        taskCategory: r.taskCategory as RoutingRule['taskCategory'],
        preferredAliases: JSON.parse(r.preferredAliasesJson) as string[],
        fallbackEnabled: r.fallbackEnabled,
        priorityOrder: JSON.parse(r.priorityOrderJson) as ProviderId[],
        allowSilentMidConversationSwitch: false,
        enabled: r.enabled,
        updatedAt: r.updatedAt,
      }));
  }

  upsertAgentProfile(profile: AgentProfile): void {
    const now = new Date().toISOString();
    this.ctx.db
      .insert(schema.agentProfiles)
      .values({ ...profile, updatedAt: now })
      .onConflictDoUpdate({
        target: schema.agentProfiles.id,
        set: { ...profile, updatedAt: now },
      })
      .run();
  }

  listAgentProfiles(): AgentProfile[] {
    return this.ctx.db
      .select()
      .from(schema.agentProfiles)
      .all()
      .map((a) => ({
        id: a.id as AgentProfile['id'],
        name: a.name,
        protocol: a.protocol as AgentProfile['protocol'],
        endpointUrl: a.endpointUrl,
        compatibilityStatus: a.compatibilityStatus as AgentProfile['compatibilityStatus'],
        versionNotes: a.versionNotes,
        toolExecutionWarning: a.toolExecutionWarning,
        configFilename: a.configFilename,
        configFormat: a.configFormat as AgentProfile['configFormat'],
      }));
  }

  saveDiagnostic(providerId: ProviderId, report: SelectorHealthReport): void {
    const id = `diag_${providerId}_${Date.now()}`;
    this.ctx.db
      .insert(schema.diagnostics)
      .values({
        id,
        providerId,
        driverVersion: report.driverVersion,
        healthy: report.healthy,
        uiDriftDetected: report.uiDriftDetected,
        resultsJson: JSON.stringify(report.results),
        summary: report.summary,
        checkedAt: report.checkedAt,
      })
      .run();
  }

  getLatestDiagnostics(): Record<string, SelectorHealthReport> {
    const rows = this.ctx.db
      .select()
      .from(schema.diagnostics)
      .orderBy(desc(schema.diagnostics.checkedAt))
      .limit(50)
      .all();

    const map: Record<string, SelectorHealthReport> = {};
    for (const row of rows) {
      if (!map[row.providerId]) {
        map[row.providerId] = {
          checkedAt: row.checkedAt,
          driverVersion: row.driverVersion,
          healthy: row.healthy,
          uiDriftDetected: row.uiDriftDetected,
          results: JSON.parse(row.resultsJson),
          summary: row.summary,
        };
      }
    }
    return map;
  }

  saveVerificationReport(report: ProviderVerificationReport): void {
    this.ctx.db
      .insert(schema.providerVerifications)
      .values({
        id: report.id,
        providerId: report.providerId,
        driverVersion: report.driverVersion,
        mode: report.mode,
        operationalStatus: report.operationalStatus,
        passedCoreChecks: report.passedCoreChecks,
        totalCoreChecks: report.totalCoreChecks,
        reportJson: JSON.stringify(report),
        lastSuccessfulTestAt: report.lastSuccessfulTestAt,
        checkedAt: report.checkedAt,
        isSimulated: report.isSimulated,
      })
      .onConflictDoUpdate({
        target: schema.providerVerifications.id,
        set: {
          operationalStatus: report.operationalStatus,
          passedCoreChecks: report.passedCoreChecks,
          totalCoreChecks: report.totalCoreChecks,
          reportJson: JSON.stringify(report),
          lastSuccessfulTestAt: report.lastSuccessfulTestAt,
          checkedAt: report.checkedAt,
        },
      })
      .run();
  }

  getLatestVerificationReports(isSimulated = false): Record<string, ProviderVerificationReport> {
    const rows = this.ctx.db
      .select()
      .from(schema.providerVerifications)
      .where(eq(schema.providerVerifications.isSimulated, isSimulated))
      .orderBy(desc(schema.providerVerifications.checkedAt))
      .limit(100)
      .all();

    const map: Record<string, ProviderVerificationReport> = {};
    for (const row of rows) {
      if (!map[row.providerId]) {
        try {
          map[row.providerId] = JSON.parse(row.reportJson) as ProviderVerificationReport;
        } catch {
          // Skip malformed report row
        }
      }
    }
    return map;
  }
}
