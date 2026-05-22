import {
  INPUT_CHANNELS,
  INPUT_ENTRY_KINDS,
  INPUT_SOURCE_KINDS,
} from "../protocols/inputDescriptor.js";

export const IMPORT_PIPELINES = Object.freeze({
  LEGACY: "legacy",
  STRUCTURED: "structured",
});

export const PIPELINE_SWITCH_DECISION_SOURCES = Object.freeze({
  RULE: "rule",
  SOURCE_KIND: "source-kind",
  CHANNEL: "channel",
  ENVIRONMENT: "environment",
  DEFAULT: "default",
});

export function createImportPipelineSwitchboard(options = {}) {
  let config = normalizeSwitchConfig(options.config || {});

  function getConfig() {
    return cloneConfig(config);
  }

  function setConfig(nextConfig = {}) {
    config = normalizeSwitchConfig(nextConfig);
    return getConfig();
  }

  function updateConfig(patch = {}) {
    config = normalizeSwitchConfig({
      ...config,
      ...patch,
      channelOverrides: {
        ...config.channelOverrides,
        ...(patch.channelOverrides || {}),
      },
      sourceKindOverrides: {
        ...config.sourceKindOverrides,
        ...(patch.sourceKindOverrides || {}),
      },
      environmentOverrides: {
        ...config.environmentOverrides,
        ...(patch.environmentOverrides || {}),
      },
      rules: Array.isArray(patch.rules) ? patch.rules : config.rules,
    });
    return getConfig();
  }

  function resolve(descriptor, context = {}) {
    const normalizedContext = normalizeDecisionContext(context);
    const normalizedDescriptor = descriptor && typeof descriptor === "object" ? descriptor : {};

    const ruleMatch = matchRules(config.rules, normalizedDescriptor, normalizedContext);
    if (ruleMatch) {
      return buildDecision({
        pipeline: ruleMatch.pipeline,
        source: PIPELINE_SWITCH_DECISION_SOURCES.RULE,
        configId: ruleMatch.id,
        reason: ruleMatch.reason,
        descriptor: normalizedDescriptor,
        context: normalizedContext,
      });
    }

    const sourceKind = String(normalizedDescriptor.sourceKind || "");
    if (config.sourceKindOverrides[sourceKind]) {
      return buildDecision({
        pipeline: config.sourceKindOverrides[sourceKind],
        source: PIPELINE_SWITCH_DECISION_SOURCES.SOURCE_KIND,
        configId: sourceKind,
        reason: `source-kind:${sourceKind}`,
        descriptor: normalizedDescriptor,
        context: normalizedContext,
      });
    }

    const channel = String(normalizedDescriptor.channel || "");
    if (config.channelOverrides[channel]) {
      return buildDecision({
        pipeline: config.channelOverrides[channel],
        source: PIPELINE_SWITCH_DECISION_SOURCES.CHANNEL,
        configId: channel,
        reason: `channel:${channel}`,
        descriptor: normalizedDescriptor,
        context: normalizedContext,
      });
    }

    const environment = String(normalizedContext.environment || "");
    if (config.environmentOverrides[environment]) {
      return buildDecision({
        pipeline: config.environmentOverrides[environment],
        source: PIPELINE_SWITCH_DECISION_SOURCES.ENVIRONMENT,
        configId: environment,
        reason: `environment:${environment}`,
        descriptor: normalizedDescriptor,
        context: normalizedContext,
      });
    }

    return buildDecision({
      pipeline: config.defaultPipeline,
      source: PIPELINE_SWITCH_DECISION_SOURCES.DEFAULT,
      configId: "default",
      reason: "default-pipeline",
      descriptor: normalizedDescriptor,
      context: normalizedContext,
    });
  }

  return {
    getConfig,
    setConfig,
    updateConfig,
    resolve,
  };
}

export function normalizeSwitchConfig(config = {}) {
  return {
    defaultPipeline: normalizePipeline(config.defaultPipeline, IMPORT_PIPELINES.LEGACY),
    channelOverrides: normalizePipelineMap(config.channelOverrides, Object.values(INPUT_CHANNELS)),
    sourceKindOverrides: normalizePipelineMap(config.sourceKindOverrides, Object.values(INPUT_SOURCE_KINDS)),
    environmentOverrides: normalizePipelineMap(config.environmentOverrides),
    rules: normalizeRules(config.rules),
  };
}

function normalizeRules(rules) {
  if (!Array.isArray(rules)) {
    return [];
  }
  return rules
    .map((rule, index) => normalizeRule(rule, index))
    .filter(Boolean)
    .sort(compareRules);
}

function normalizeRule(rule, index) {
  if (!rule || typeof rule !== "object") {
    return null;
  }
  return {
    id: String(rule.id || `rule-${index}`),
    enabled: rule.enabled !== false,
    priority: Number.isFinite(rule.priority) ? Number(rule.priority) : 0,
    pipeline: normalizePipeline(rule.pipeline, IMPORT_PIPELINES.LEGACY),
    channels: normalizeStringList(rule.channels),
    sourceKinds: normalizeStringList(rule.sourceKinds),
    entryKinds: normalizeStringList(rule.entryKinds),
    environments: normalizeStringList(rule.environments),
    tags: normalizeStringList(rule.tags),
    reason: String(rule.reason || "").trim() || `rule:${String(rule.id || `rule-${index}`)}`,
  };
}

function normalizePipelineMap(values, allowedKeys = null) {
  const safe = values && typeof values === "object" ? values : {};
  const result = {};
  Object.entries(safe).forEach(([key, value]) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) {
      return;
    }
    if (Array.isArray(allowedKeys) && allowedKeys.length && !allowedKeys.includes(normalizedKey)) {
      return;
    }
    result[normalizedKey] = normalizePipeline(value, null);
  });
  return Object.fromEntries(Object.entries(result).filter(([, value]) => Boolean(value)));
}

function normalizePipeline(value, fallback = IMPORT_PIPELINES.LEGACY) {
  const pipeline = String(value || "").trim().toLowerCase();
  if (pipeline === IMPORT_PIPELINES.LEGACY || pipeline === IMPORT_PIPELINES.STRUCTURED) {
    return pipeline;
  }
  return fallback;
}

function normalizeDecisionContext(context = {}) {
  const safe = context && typeof context === "object" ? context : {};
  return {
    environment: String(safe.environment || "").trim().toLowerCase() || "default",
    tags: normalizeStringList(safe.tags),
  };
}

function matchRules(rules, descriptor, context) {
  for (const rule of rules) {
    if (!rule.enabled) {
      continue;
    }
    if (!matchesRule(rule, descriptor, context)) {
      continue;
    }
    return rule;
  }
  return null;
}

function matchesRule(rule, descriptor, context) {
  if (rule.channels.length && !rule.channels.includes(String(descriptor.channel || ""))) {
    return false;
  }
  if (rule.sourceKinds.length && !rule.sourceKinds.includes(String(descriptor.sourceKind || ""))) {
    return false;
  }
  if (rule.environments.length && !rule.environments.includes(String(context.environment || ""))) {
    return false;
  }
  if (rule.entryKinds.length) {
    const entryKinds = new Set(
      (Array.isArray(descriptor.entries) ? descriptor.entries : [])
        .map((entry) => String(entry?.kind || ""))
        .filter(Boolean)
    );
    if (!rule.entryKinds.some((kind) => entryKinds.has(kind))) {
      return false;
    }
  }
  if (rule.tags.length) {
    const tags = new Set([
      ...normalizeStringList(descriptor.tags),
      ...normalizeStringList(context.tags),
    ]);
    if (!rule.tags.some((tag) => tags.has(tag))) {
      return false;
    }
  }
  return true;
}

function buildDecision({ pipeline, source, configId, reason, descriptor, context }) {
  return {
    pipeline,
    useStructured: pipeline === IMPORT_PIPELINES.STRUCTURED,
    useLegacy: pipeline === IMPORT_PIPELINES.LEGACY,
    source,
    configId: String(configId || ""),
    reason: String(reason || ""),
    descriptorId: String(descriptor?.descriptorId || ""),
    channel: String(descriptor?.channel || ""),
    sourceKind: String(descriptor?.sourceKind || ""),
    environment: String(context?.environment || "default"),
  };
}

function normalizeStringList(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function compareRules(a, b) {
  if (b.priority !== a.priority) {
    return b.priority - a.priority;
  }
  return a.id.localeCompare(b.id);
}

function cloneConfig(config) {
  return {
    defaultPipeline: config.defaultPipeline,
    channelOverrides: { ...config.channelOverrides },
    sourceKindOverrides: { ...config.sourceKindOverrides },
    environmentOverrides: { ...config.environmentOverrides },
    rules: config.rules.map((rule) => ({
      ...rule,
      channels: rule.channels.slice(),
      sourceKinds: rule.sourceKinds.slice(),
      entryKinds: rule.entryKinds.slice(),
      environments: rule.environments.slice(),
      tags: rule.tags.slice(),
    })),
  };
}
