function normalizeUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }
    return parsed.toString();
  } catch (_error) {
    if (/^www\./i.test(raw)) {
      try {
        return new URL(`https://${raw}`).toString();
      } catch (_fallbackError) {
        return "";
      }
    }
    return "";
  }
}

function safeText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function deriveTitleFromUrl(url = "") {
  try {
    const parsed = new URL(url);
    const pathname = String(parsed.pathname || "/");
    const slug = pathname
      .split("/")
      .filter(Boolean)
      .pop();
    if (!slug) {
      return parsed.hostname;
    }
    return slug.replace(/[-_]+/g, " ").slice(0, 120) || parsed.hostname;
  } catch (_error) {
    return "";
  }
}

export function buildFallbackUrlMeta(url = "") {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) {
    return null;
  }
  let domain = "";
  try {
    domain = String(new URL(normalizedUrl).hostname || "").trim().toLowerCase();
  } catch (_error) {
    domain = "";
  }
  return {
    url: normalizedUrl,
    domain,
    title: deriveTitleFromUrl(normalizedUrl),
    description: "",
    image: "",
    siteName: domain,
    status: "",
    fetchState: "ready",
    updatedAt: Date.now(),
    embeddable: false,
  };
}

function normalizeMetaPayload(payload = {}, url = "") {
  const fallback = buildFallbackUrlMeta(url);
  if (!fallback) {
    return null;
  }
  const normalized = {
    ...fallback,
    title: safeText(payload?.title || fallback.title || ""),
    description: safeText(payload?.description || payload?.summary || ""),
    image: String(payload?.image || payload?.imageUrl || payload?.cover || "").trim(),
    siteName: safeText(payload?.siteName || payload?.site || fallback.siteName || ""),
    status: safeText(payload?.status || ""),
    fetchState: safeText(payload?.fetchState || payload?.state || "ready").toLowerCase() || "ready",
    updatedAt: Number(payload?.updatedAt || payload?.fetchedAt || Date.now()) || Date.now(),
  };
  if (typeof payload?.embeddable === "boolean") {
    normalized.embeddable = payload.embeddable;
  }
  return normalized;
}

async function fetchDesktopMeta(url = "") {
  if (typeof globalThis?.desktopShell?.fetchUrlMeta !== "function") {
    return null;
  }
  const result = await globalThis.desktopShell.fetchUrlMeta(url);
  if (!result || result.ok === false) {
    return null;
  }
  return result.meta || result.data || result;
}

async function fetchApiMeta(url = "", fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") {
    return null;
  }
  try {
    const response = await fetchImpl(`/api/url-meta?url=${encodeURIComponent(url)}`, { method: "GET" });
    if (!response?.ok) {
      return null;
    }
    const data = await response.json();
    return data?.meta || data?.data || data || null;
  } catch (_error) {
    return null;
  }
}

export async function resolveUrlMeta(url = "", options = {}) {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) {
    return null;
  }
  const timeoutMs = Math.max(500, Number(options?.timeoutMs || 4500) || 4500);
  const fetchImpl = options?.fetchImpl || globalThis.fetch;
  const fallback = buildFallbackUrlMeta(normalizedUrl);
  const timeoutTask = new Promise((resolve) => {
    setTimeout(() => resolve(null), timeoutMs);
  });

  const resolverTask = (async () => {
    const desktopMeta = await fetchDesktopMeta(normalizedUrl);
    if (desktopMeta) {
      return normalizeMetaPayload(desktopMeta, normalizedUrl);
    }
    const apiMeta = await fetchApiMeta(normalizedUrl, fetchImpl);
    if (apiMeta) {
      return normalizeMetaPayload(apiMeta, normalizedUrl);
    }
    return fallback;
  })();

  const resolved = await Promise.race([resolverTask, timeoutTask]);
  return resolved || fallback;
}

