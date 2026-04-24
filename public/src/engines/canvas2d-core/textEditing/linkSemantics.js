import { normalizeTextLinkTokens, normalizeTextUrlMetaCache } from "../textModel/richTextDocument.js";

const URL_MATCH_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const ALLOWED_FETCH_STATES = new Set(["idle", "pending", "ready", "error", "stale"]);
const DEFAULT_FETCH_STATE = "pending";

const TRAILING_TRIM_CHARS = new Set([
  ".",
  ",",
  ";",
  ":",
  "!",
  "?",
  ")",
  "]",
  "}",
  ">",
  "'",
  '"',
  "，",
  "。",
  "；",
  "：",
  "！",
  "？",
  "）",
  "】",
  "》",
  "」",
]);

const EMBED_CANDIDATE_DOMAINS = Object.freeze([
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "bilibili.com",
  "figma.com",
  "miro.com",
  "codepen.io",
  "observablehq.com",
  "docs.google.com",
]);

function normalizeUrl(rawValue = "") {
  const source = String(rawValue || "").trim();
  if (!source) {
    return "";
  }
  if (/^https?:\/\//i.test(source)) {
    return source;
  }
  if (/^www\./i.test(source)) {
    return `https://${source}`;
  }
  return "";
}

function normalizeFetchState(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "unknown") {
    return DEFAULT_FETCH_STATE;
  }
  return ALLOWED_FETCH_STATES.has(normalized) ? normalized : DEFAULT_FETCH_STATE;
}

function resolveDomain(urlValue = "") {
  try {
    const parsed = new URL(urlValue);
    return String(parsed.hostname || "").toLowerCase();
  } catch {
    return "";
  }
}

function resolveKindHint(domain = "") {
  if (!domain) {
    return "preview-candidate";
  }
  const matched = EMBED_CANDIDATE_DOMAINS.some((entry) => domain === entry || domain.endsWith(`.${entry}`));
  return matched ? "embed-candidate" : "preview-candidate";
}

function trimTrailingToken(rawText = "", startIndex = 0) {
  let token = String(rawText || "");
  while (token.length > 0 && TRAILING_TRIM_CHARS.has(token[token.length - 1])) {
    token = token.slice(0, -1);
  }
  return {
    text: token,
    rangeEnd: startIndex + token.length,
  };
}

export function createLinkTokensFromPlainText(value = "") {
  const text = String(value || "");
  if (!text) {
    return [];
  }

  const matches = Array.from(text.matchAll(URL_MATCH_PATTERN));
  if (!matches.length) {
    return [];
  }

  const tokens = [];
  matches.forEach((match) => {
    const rawToken = String(match?.[0] || "");
    const matchIndex = Number(match?.index);
    if (!rawToken || !Number.isFinite(matchIndex) || matchIndex < 0) {
      return;
    }
    const trimmed = trimTrailingToken(rawToken, matchIndex);
    if (!trimmed.text) {
      return;
    }
    const normalizedUrl = normalizeUrl(trimmed.text);
    if (!normalizedUrl) {
      return;
    }
    const domain = resolveDomain(normalizedUrl);
    tokens.push({
      url: normalizedUrl,
      rangeStart: matchIndex,
      rangeEnd: trimmed.rangeEnd,
      domain,
      kindHint: resolveKindHint(domain),
      fetchState: DEFAULT_FETCH_STATE,
    });
  });

  return normalizeTextLinkTokens(tokens).map((token) => ({
    ...token,
    fetchState: normalizeFetchState(token.fetchState),
  }));
}

export function applyLinkTokensToTextItem(item, plainText = "") {
  if (!item || item.type !== "text") {
    return item;
  }
  const semanticData = refreshTextLinkSemantics(item, plainText);
  item.linkTokens = semanticData.linkTokens;
  item.urlMetaCache = semanticData.urlMetaCache;
  if (item.richTextDocument && typeof item.richTextDocument === "object") {
    const currentMeta =
      item.richTextDocument.meta && typeof item.richTextDocument.meta === "object" ? item.richTextDocument.meta : {};
    item.richTextDocument = {
      ...item.richTextDocument,
      meta: {
        ...currentMeta,
        linkTokens: semanticData.linkTokens,
        urlMetaCache: semanticData.urlMetaCache,
      },
    };
  }
  return item;
}

function normalizeUrlMetaCache(cache = {}) {
  const normalized = normalizeTextUrlMetaCache(cache);
  const next = {};
  Object.entries(normalized).forEach(([url, value]) => {
    next[url] = {
      ...value,
      fetchState: normalizeFetchState(value?.fetchState),
    };
  });
  return next;
}

export function refreshTextLinkSemantics(item, plainText = "") {
  const tokens = createLinkTokensFromPlainText(plainText).map((token) => ({
    ...token,
    fetchState: normalizeFetchState(token.fetchState),
  }));
  const normalizedCache = normalizeUrlMetaCache(item?.urlMetaCache || item?.richTextDocument?.meta?.urlMetaCache || {});
  if (!tokens.length) {
    return {
      linkTokens: [],
      urlMetaCache: {},
    };
  }
  const nextCache = {};
  tokens.forEach((token) => {
    const url = String(token?.url || "").trim();
    if (!url) {
      return;
    }
    if (normalizedCache[url]) {
      nextCache[url] = normalizedCache[url];
      return;
    }
    nextCache[url] = {
      url,
      domain: String(token?.domain || resolveDomain(url)).trim().toLowerCase(),
      title: "",
      description: "",
      image: "",
      siteName: "",
      status: "",
      fetchState: DEFAULT_FETCH_STATE,
      updatedAt: 0,
      embeddable: token?.kindHint === "embed-candidate",
    };
  });
  return {
    linkTokens: normalizeTextLinkTokens(tokens).map((token) => ({
      ...token,
      fetchState: normalizeFetchState(token.fetchState),
    })),
    urlMetaCache: normalizeUrlMetaCache(nextCache),
  };
}
