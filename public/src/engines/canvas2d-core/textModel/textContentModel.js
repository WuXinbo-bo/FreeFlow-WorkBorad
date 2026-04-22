import {
  ensureRichTextDocumentFields,
  extractTextLinkData,
  mergeTextLinkData,
  normalizeTextLinkFetchState,
  normalizeTextLinkKindHint,
  normalizeTextLinkToken,
  normalizeTextLinkTokens,
  normalizeTextUrlMetaCache,
  normalizeTextUrlMetaEntry,
} from "./richTextDocument.js";

const URL_REGEX = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING_CHARS_REGEX = /[).,!?;:'"!?，。；：！？、》】）]+$/;

export function normalizeLinkToken(token = null) {
  return normalizeTextLinkToken(token);
}

export function normalizeLinkTokens(tokens = [], plainText = "") {
  const normalized = normalizeTextLinkTokens(tokens);
  const text = String(plainText || "");
  if (!text) {
    return normalized;
  }
  return normalized.filter((token) => {
    const start = Number(token?.rangeStart);
    const end = Number(token?.rangeEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      return false;
    }
    if (start < 0 || end > text.length) {
      return false;
    }
    const snippet = text.slice(start, end);
    if (!snippet || snippet === token.url) {
      return true;
    }
    const snippetToken = normalizeTextLinkToken({
      url: snippet,
      rangeStart: start,
      rangeEnd: end,
      kindHint: token?.kindHint,
      fetchState: token?.fetchState,
    });
    return Boolean(snippetToken && snippetToken.url === token.url);
  });
}

export function normalizeUrlMetaEntry(entry = null, urlKey = "") {
  return normalizeTextUrlMetaEntry(entry, urlKey);
}

export function normalizeUrlMetaCache(cache = {}) {
  return normalizeTextUrlMetaCache(cache);
}

export function extractLinkTokensFromPlainText(value = "") {
  const text = String(value || "");
  if (!text.trim()) {
    return [];
  }
  const tokens = [];
  URL_REGEX.lastIndex = 0;
  let match = URL_REGEX.exec(text);
  while (match) {
    const raw = String(match[0] || "").trim().replace(TRAILING_CHARS_REGEX, "");
    if (raw) {
      const start = Number(match.index) || 0;
      const end = start + raw.length;
      tokens.push({
        url: raw,
        rangeStart: start,
        rangeEnd: end,
        kindHint: normalizeTextLinkKindHint("preview-candidate"),
        fetchState: normalizeTextLinkFetchState("pending"),
      });
    }
    match = URL_REGEX.exec(text);
  }
  return normalizeLinkTokens(tokens, text);
}

export function mergeTextLinkSemantics(source = {}, fallback = {}) {
  const sourcePlainText = String(source?.plainText || source?.text || "");
  const fallbackPlainText = String(fallback?.plainText || fallback?.text || "");
  const sourceExtractedTokens = extractLinkTokensFromPlainText(sourcePlainText);
  const fallbackExtractedTokens = extractLinkTokensFromPlainText(fallbackPlainText);

  const sourceMerged = mergeTextLinkData(
    {
      linkTokens: sourceExtractedTokens,
      urlMetaCache: {},
    },
    {
      linkTokens: source?.linkTokens,
      urlMetaCache: source?.urlMetaCache,
      richTextDocument: source?.richTextDocument,
    }
  );

  const fallbackMerged = mergeTextLinkData(
    {
      linkTokens: fallbackExtractedTokens,
      urlMetaCache: {},
    },
    {
      linkTokens: fallback?.linkTokens,
      urlMetaCache: fallback?.urlMetaCache,
      richTextDocument: fallback?.richTextDocument,
    }
  );

  const extracted = extractTextLinkData(source, fallback);
  const merged = mergeTextLinkData(
    mergeTextLinkData(fallbackMerged, sourceMerged),
    extracted
  );

  return {
    linkTokens: normalizeLinkTokens(merged.linkTokens, sourcePlainText || fallbackPlainText),
    urlMetaCache: normalizeUrlMetaCache(merged.urlMetaCache),
  };
}

export function normalizeTextContentModel(source = {}, fallback = {}) {
  const normalized = ensureRichTextDocumentFields(source, fallback);
  const linkSemantics = mergeTextLinkSemantics(
    {
      ...source,
      plainText: normalized.plainText,
      text: normalized.text,
      linkTokens: source?.linkTokens ?? normalized.linkTokens,
      urlMetaCache: source?.urlMetaCache ?? normalized.urlMetaCache,
      richTextDocument: normalized.richTextDocument,
    },
    fallback
  );
  const richTextDocument =
    normalized.richTextDocument && typeof normalized.richTextDocument === "object"
      ? {
          ...normalized.richTextDocument,
          meta: {
            ...(normalized.richTextDocument.meta && typeof normalized.richTextDocument.meta === "object"
              ? normalized.richTextDocument.meta
              : {}),
            linkTokens: linkSemantics.linkTokens,
            urlMetaCache: linkSemantics.urlMetaCache,
          },
        }
      : normalized.richTextDocument;
  return {
    html: normalized.html,
    plainText: normalized.plainText,
    text: normalized.text,
    richTextDocument,
    linkTokens: linkSemantics.linkTokens,
    urlMetaCache: linkSemantics.urlMetaCache,
    isEmpty: !String(normalized.html || "").trim() && !String(normalized.plainText || "").trim(),
  };
}
