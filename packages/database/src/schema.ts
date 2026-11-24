import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  shortName: text('short_name').notNull(),
  domain: text('domain').notNull(),
  url: text('url').notNull(),
  driverVersion: text('driver_version').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  mode: text('mode').notNull().default('browser_session'),
  verificationStatus: text('verification_status').notNull().default('IMPLEMENTED'),
  officialApiBaseUrl: text('official_api_base_url'),
  officialApiKeyEncrypted: text('official_api_key_encrypted'),
  capabilitiesJson: text('capabilities_json').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const providerSessions = sqliteTable('provider_sessions', {
  providerId: text('provider_id').primaryKey(),
  sessionStatus: text('session_status').notNull().default('disconnected'),
  authStatus: text('auth_status').notNull().default('unknown'),
  activeTabId: integer('active_tab_id'),
  activeTabTitle: text('active_tab_title'),
  activeTabUrl: text('active_tab_url'),
  visibleModelName: text('visible_model_name'),
  lastConnectedAt: text('last_connected_at'),
  lastSuccessfulRequestAt: text('last_successful_request_at'),
  lastErrorJson: text('last_error_json'),
  updatedAt: text('updated_at').notNull(),
});

export const models = sqliteTable('models', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').notNull(),
  visibleModelName: text('visible_model_name'),
  available: integer('available', { mode: 'boolean' }).notNull().default(false),
  capabilitiesJson: text('capabilities_json').notNull(),
  lastDiscoveredAt: text('last_discovered_at').notNull(),
});

export const modelAliases = sqliteTable('model_aliases', {
  alias: text('alias').primaryKey(),
  prefixedAlias: text('prefixed_alias').notNull(),
  providerId: text('provider_id').notNull(),
  modelId: text('model_id').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  updatedAt: text('updated_at').notNull(),
});

// Prompt and response bodies are intentionally NOT stored by default.
export const requests = sqliteTable('requests', {
  id: text('id').primaryKey(),
  requestId: text('request_id').notNull(),
  timestamp: text('timestamp').notNull(),
  providerId: text('provider_id'),
  model: text('model').notNull(),
  protocol: text('protocol').notNull(),
  mode: text('mode').notNull(),
  durationMs: integer('duration_ms').notNull().default(0),
  status: text('status').notNull(),
  httpStatus: integer('http_status').notNull(),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  streaming: integer('streaming', { mode: 'boolean' }).notNull().default(false),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  isSimulated: integer('is_simulated', { mode: 'boolean' }).notNull().default(false),
});

export const routingRules = sqliteTable('routing_rules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  taskCategory: text('task_category').notNull(),
  preferredAliasesJson: text('preferred_aliases_json').notNull(),
  fallbackEnabled: integer('fallback_enabled', { mode: 'boolean' }).notNull().default(true),
  priorityOrderJson: text('priority_order_json').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  updatedAt: text('updated_at').notNull(),
});

export const agentProfiles = sqliteTable('agent_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  protocol: text('protocol').notNull(),
  endpointUrl: text('endpoint_url').notNull(),
  compatibilityStatus: text('compatibility_status').notNull(),
  versionNotes: text('version_notes').notNull(),
  toolExecutionWarning: text('tool_execution_warning').notNull(),
  configFilename: text('config_filename').notNull(),
  configFormat: text('config_format').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const sessions = providerSessions;

export const diagnostics = sqliteTable('diagnostics', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').notNull(),
  driverVersion: text('driver_version').notNull(),
  healthy: integer('healthy', { mode: 'boolean' }).notNull().default(false),
  uiDriftDetected: integer('ui_drift_detected', { mode: 'boolean' }).notNull().default(false),
  resultsJson: text('results_json').notNull(),
  summary: text('summary').notNull(),
  checkedAt: text('checked_at').notNull(),
});

export const providerVerifications = sqliteTable('provider_verifications', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').notNull(),
  driverVersion: text('driver_version').notNull(),
  mode: text('mode').notNull(),
  operationalStatus: text('operational_status').notNull(),
  passedCoreChecks: integer('passed_core_checks').notNull().default(0),
  totalCoreChecks: integer('total_core_checks').notNull().default(6),
  reportJson: text('report_json').notNull(),
  lastSuccessfulTestAt: text('last_successful_test_at'),
  checkedAt: text('checked_at').notNull(),
  isSimulated: integer('is_simulated', { mode: 'boolean' }).notNull().default(false),
});
