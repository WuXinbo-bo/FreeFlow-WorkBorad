import { normalizeTextLinkTokens, normalizeTextUrlMetaCache } from "../textModel/richTextDocument.js";

const URL_MATCH_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const ALLOWED_FETCH_STATES = new Set(["idle", "pending", "ready", "error", "stale"]);
const DEFAULT_FETCH_STATE = "pending";
const CANVAS_INTERNAL_LINK_SCHEME = "freeflow://canvas/item/";

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
  if (/^freeflow:\/\/canvas\/item\//i.test(source)) {
    return source;
  }
  if (/^file:\/\//i.test(source)) {
    try {
      return new URL(source).toString();
    } catch {
      return "";
    }
  }
  if (/^[a-zA-Z]:[\\/]/.test(source)) {
    return encodeURI(`file:///${source.replace(/\\/g, "/")}`);
  }
  if (/^\\\\[^\\]+\\[^\\]+/.test(source)) {
    return encodeURI(`file:${source.replace(/\\/g, "/")}`);
  }
  if (/^\/[^/]/.test(source)) {
    return encodeURI(`file://${source}`);
  }
  if (/^https?:\/\//i.test(source)) {
    return source;
  }
  if (/^www\./i.test(source)) {
    return `https://${source}`;
  }
  if (/^(mailto:|tel:)/i.test(source)) {
    try {
      return new URL(source).toString();
    } catch {
      return "";
    }
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

function resolveKindHintFromUrl(urlValue = "", domain = "") {
  const normalizedUrl = String(urlValue || "").trim();
  if (!normalizedUrl) {
    return "plain-link";
  }
  if (normalizedUrl.toLowerCase().startsWith(CANVAS_INTERNAL_LINK_SCHEME)) {
    return "canvas-link";
  }
  if (/^(file:|mailto:|tel:)/i.test(normalizedUrl)) {
    return "plain-link";
  }
  return resolveKindHint(domain);
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

export function createLinkTokensFromRichHtml(html = "", plainText = "") {
  const rawHtml = String(html || "").trim();
  const sourceText = String(plainText || "");
  if (!rawHtml || !sourceText || typeof document === "undefined") {
    return [];
  }
  const template = document.createElement("template");
  template.innerHTML = rawHtml;
  const anchors = Array.from(template.content.querySelectorAll("a[href]"));
  if (!anchors.length) {
    return [];
  }
  const tokens = [];
  let searchCursor = 0;
  anchors.forEach((anchor) => {
    if (!(anchor instanceof HTMLAnchorElement)) {
      return;
    }
    const normalizedUrl = normalizeUrl(anchor.getAttribute("href") || anchor.href || "");
    const linkText = String(anchor.textContent || "");
    if (!normalizedUrl || !linkText) {
      return;
    }
    let rangeStart = sourceText.indexOf(linkText, Math.max(0, searchCursor));
    if (rangeStart < 0) {
      rangeStart = sourceText.indexOf(linkText);
    }
    if (rangeStart < 0) {
      return;
    }
    const rangeEnd = rangeStart + linkText.length;
    searchCursor = rangeEnd;
    const domain = resolveDomain(normalizedUrl);
    tokens.push({
      url: normalizedUrl,
      rangeStart,
      rangeEnd,
      domain,
      kindHint: resolveKindHintFromUrl(normalizedUrl, domain),
      fetchState: /^(https?:)/i.test(normalizedUrl) ? DEFAULT_FETCH_STATE : "idle",
      label: linkText,
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
  const tokens = normalizeTextLinkTokens([
    ...createLinkTokensFromPlainText(plainText),
    ...createLinkTokensFromRichHtml(item?.html || "", plainText),
  ]).map((token) => ({
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
      fetchState: token?.fetchState || DEFAULT_FETCH_STATE,
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
