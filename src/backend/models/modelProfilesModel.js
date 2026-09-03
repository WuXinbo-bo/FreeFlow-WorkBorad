const MODEL_PROFILES_SCHEMA_VERSION = 2;

function getDefaultModelProfiles() {
  return {
    schemaVersion: MODEL_PROFILES_SCHEMA_VERSION,
    profiles: {},
    updatedAt: Date.now(),
  };
}

function normalizeModelProfilesStore(payload = {}) {
  const source = payload.profiles && typeof payload.profiles === "object" ? payload.profiles : {};
  const profiles = {};
  for (const [rawName, rawProfile] of Object.entries(source).slice(0, 200)) {
    const name = String(rawName || "").trim().slice(0, 160);
    if (!name || !rawProfile || typeof rawProfile !== "object") continue;
    const requestedLimit = Number(rawProfile.contextLimit);
    const deviceMode = String(rawProfile.deviceMode || "auto").trim().toLowerCase();
    profiles[name] = {
      contextLimit: Number.isFinite(requestedLimit)
        ? Math.min(2_000_000, Math.max(256, Math.round(requestedLimit)))
        : 2048,
      deviceMode: deviceMode === "cpu" || /^gpu:\d+$/.test(deviceMode) ? deviceMode : "auto",
      thinkingEnabled: rawProfile.thinkingEnabled === true,
    };
  }
  return {
    schemaVersion: MODEL_PROFILES_SCHEMA_VERSION,
    profiles,
    updatedAt: payload.updatedAt || Date.now(),
  };
}

module.exports = {
  MODEL_PROFILES_SCHEMA_VERSION,
  getDefaultModelProfiles,
  normalizeModelProfilesStore,
};
