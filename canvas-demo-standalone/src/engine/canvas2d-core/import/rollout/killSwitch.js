import { IMPORT_PIPELINES } from "./pipelineSwitches.js";

export const IMPORT_KILL_SWITCH_SOURCES = Object.freeze({
  GLOBAL: "global",
  SOURCE_KIND: "source-kind",
  CHANNEL: "channel",
  ENVIRONMENT: "environment",
  NONE: "none",
});

export function createImportKillSwitch(options = {}) {
  let config = normalizeKillSwitchConfig(options.config || {});

  function getConfig() {
    return cloneConfig(config);
  }

  function setConfig(nextConfig = {}) {
    config = normalizeKillSwitchConfig(nextConfig);
    return getConfig();
  }

  function updateConfig(patch = {}) {
    config = normalizeKillSwitchConfig({
      ...config,
      ...patch,
      sourceKindFallbacks: {
        ...config.sourceKindFallbacks,
        ...(patch.sourceKindFallbacks || {}),
      },
      channelFallbacks: {
        ...config.channelFallbacks,
        ...(patch.channelFallbacks || {}),
      },
      environmentFallbacks: {
        ...config.environmentFallbacks,
        ...(patch.environmentFallbacks || {}),
      },
    });
    return getConfig();
  }

  function shouldForceLegacy(descriptor = {}, context = {}) {
    const normalizedDescriptor = descriptor && typeof descriptor === "object" ? descriptor : {};
    const normalizedContext = normalizeDecisionContext(context);

    if (config.forceLegacy === true) {
      return buildKillDecision({
        active: true,
        source: IMPORT_KILL_SWITCH_SOURCES.GLOBAL,
        configId: "global",
        reason: config.reason || "global-kill-switch",
        descriptor: normalizedDescriptor,
        context: normalizedContext,
      });
    }

    const sourceKind = String(normalizedDescriptor.sourceKind || "");
    if (config.sourceKindFallbacks[sourceKind]) {
      return buildKillDecision({
        active: true,
        source: IMPORT_KILL_SWITCH_SOURCES.SOURCE_KIND,
        configId: sourceKind,
        reason: `source-kind:${sourceKind}`,
        descriptor: normalizedDescriptor,
        context: normalizedContext,
      });
    }

    const channel = String(normalizedDescriptor.channel || "");
    if (config.channelFallbacks[channel]) {
      return buildKillDecision({
        active: true,
        source: IMPORT_KILL_SWITCH_SOURCES.CHANNEL,
        configId: channel,
        reason: `channel:${channel}`,
        descriptor: normalizedDescriptor,
        context: normalizedContext,
      });
    }

    const environment = String(normalizedContext.environment || "");
    if (config.environmentFallbacks[environment]) {
      return buildKillDecision({
        active: true,
        source: IMPORT_KILL_SWITCH_SOURCES.ENVIRONMENT,
        configId: environment,
        reason: `environment:${environment}`,
        descriptor: normalizedDescriptor,
        context: normalizedContext,
      });
    }

    return buildKillDecision({
      active: false,
      source: IMPORT_KILL_SWITCH_SOURCES.NONE,
      configId: "",
      reason: "",
      descriptor: normalizedDescriptor,
      context: normalizedContext,
    });
  }

  function apply(decision, descriptor = {}, context = {}) {
    const normalizedDecision = decision && typeof decision === "object"
      ? { ...decision }
      : {
          pipeline: IMPORT_PIPELINES.LEGACY,
          useLegacy: true,
          useStructured: false,
          source: "unknown",
          configId: "",
          reason: "",
        };
    const killDecision = shouldForceLegacy(descriptor, context);
    if (!killDecision.active) {
      return {
        ...normalizedDecision,
        killSwitch: killDecision,
      };
    }
    return {
      ...normalizedDecision,
      pipeline: IMPORT_PIPELINES.LEGACY,
      useLegacy: true,
      useStructured: false,
      source: normalizedDecision.source || "unknown",
      configId: normalizedDecision.configId || "",
      reason: normalizedDecision.reason || "",
      killSwitch: killDecision,
      overriddenByKillSwitch: true,
    };
  }

  function clear() {
    config = normalizeKillSwitchConfig({});
    return getConfig();
  }

  return {
    getConfig,
    setConfig,
    updateConfig,
    shouldForceLegacy,
    apply,
    clear,
  };
}

export function normalizeKillSwitchConfig(config = {}) {
  return {
    forceLegacy: config.forceLegacy === true,
    reason: String(config.reason || "").trim(),
    sourceKindFallbacks: normalizeBooleanMap(config.sourceKindFallbacks),
    channelFallbacks: normalizeBooleanMap(config.channelFallbacks),
    environmentFallbacks: normalizeBooleanMap(config.environmentFallbacks),
  };
}

function normalizeBooleanMap(values) {
  const safe = values && typeof values === "object" ? values : {};
  const result = {};
  Object.entries(safe).forEach(([key, value]) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) {
      return;
    }
    result[normalizedKey] = value === true;
  });
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value === true));
}

function normalizeDecisionContext(context = {}) {
  const safe = context && typeof context === "object" ? context : {};
  return {
    environment: String(safe.environment || "").trim().toLowerCase() || "default",
  };
}

function buildKillDecision({ active, source, configId, reason, descriptor, context }) {
  return {
    active: active === true,
    source,
    configId: String(configId || ""),
    reason: String(reason || ""),
    descriptorId: String(descriptor?.descriptorId || ""),
    channel: String(descriptor?.channel || ""),
    sourceKind: String(descriptor?.sourceKind || ""),
    environment: String(context?.environment || "default"),
    forcedPipeline: active === true ? IMPORT_PIPELINES.LEGACY : "",
  };
}

function cloneConfig(config) {
  return {
    forceLegacy: config.forceLegacy === true,
    reason: String(config.reason || ""),
    sourceKindFallbacks: { ...(config.sourceKindFallbacks || {}) },
    channelFallbacks: { ...(config.channelFallbacks || {}) },
    environmentFallbacks: { ...(config.environmentFallbacks || {}) },
  };
}
