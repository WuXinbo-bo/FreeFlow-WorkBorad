function now() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

export function createInteractionPriorityGate({
  cooldownMs = 120,
  onChange = null,
} = {}) {
  let active = false;
  let reason = "";
  let lastActivatedAt = 0;
  let releaseTimer = 0;

  function emit() {
    if (typeof onChange === "function") {
      onChange({
        active,
        reason,
        lastActivatedAt,
      });
    }
  }

  function clearReleaseTimer() {
    if (releaseTimer) {
      clearTimeout(releaseTimer);
      releaseTimer = 0;
    }
  }

  function activate(nextReason = "interaction") {
    clearReleaseTimer();
    active = true;
    reason = String(nextReason || "interaction");
    lastActivatedAt = now();
    emit();
  }

  function release() {
    clearReleaseTimer();
    if (!active) {
      return;
    }
    active = false;
    reason = "";
    emit();
  }

  function scheduleRelease(delayMs = cooldownMs) {
    clearReleaseTimer();
    const waitMs = Math.max(0, Number(delayMs || cooldownMs) || cooldownMs);
    releaseTimer = setTimeout(() => {
      releaseTimer = 0;
      release();
    }, waitMs);
  }

  return {
    activate,
    isActive: () => active,
    getSnapshot: () => ({
      active,
      reason,
      lastActivatedAt,
    }),
    release,
    scheduleRelease,
  };
}
