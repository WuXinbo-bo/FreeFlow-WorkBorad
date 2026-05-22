const LANGUAGE_DEFINITIONS = Object.freeze([
  {
    value: "",
    label: "Plain Text",
    prismLanguage: "plain",
    fileExtension: "txt",
    aliases: ["plain", "plaintext", "text", "txt", "none"],
    weak: true,
  },
  {
    value: "javascript",
    label: "JavaScript",
    prismLanguage: "javascript",
    fileExtension: "js",
    aliases: ["js", "jsx"],
  },
  {
    value: "typescript",
    label: "TypeScript",
    prismLanguage: "typescript",
    fileExtension: "ts",
    aliases: ["ts", "tsx"],
  },
  {
    value: "python",
    label: "Python",
    prismLanguage: "python",
    fileExtension: "py",
    aliases: ["py"],
  },
  {
    value: "json",
    label: "JSON",
    prismLanguage: "json",
    fileExtension: "json",
  },
  {
    value: "html",
    label: "HTML",
    prismLanguage: "markup",
    fileExtension: "html",
    aliases: ["xml"],
  },
  {
    value: "css",
    label: "CSS",
    prismLanguage: "css",
    fileExtension: "css",
  },
  {
    value: "markdown",
    label: "Markdown",
    prismLanguage: "markdown",
    fileExtension: "md",
    aliases: ["md", "mdx", "gfm"],
    weak: true,
  },
  {
    value: "sql",
    label: "SQL",
    prismLanguage: "sql",
    fileExtension: "sql",
  },
  {
    value: "c",
    label: "C",
    prismLanguage: "cpp",
    fileExtension: "c",
  },
  {
    value: "cpp",
    label: "C++",
    prismLanguage: "cpp",
    fileExtension: "cpp",
    aliases: ["c++"],
  },
  {
    value: "java",
    label: "Java",
    prismLanguage: "java",
    fileExtension: "java",
  },
  {
    value: "bash",
    label: "Bash",
    prismLanguage: "bash",
    fileExtension: "sh",
    aliases: ["sh", "shell"],
  },
  {
    value: "mermaid",
    label: "Mermaid",
    prismLanguage: "mermaid",
    fileExtension: "mmd",
  },
]);

const languageDefinitionMap = new Map();
const languageAliasMap = new Map();

LANGUAGE_DEFINITIONS.forEach((definition) => {
  const normalizedValue = String(definition.value || "").trim().toLowerCase();
  languageDefinitionMap.set(normalizedValue, {
    ...definition,
    value: normalizedValue,
    aliases: Array.isArray(definition.aliases)
      ? definition.aliases.map((alias) => String(alias || "").trim().toLowerCase()).filter(Boolean)
      : [],
  });
});

languageDefinitionMap.forEach((definition, normalizedValue) => {
  languageAliasMap.set(normalizedValue, normalizedValue);
  definition.aliases.forEach((alias) => {
    languageAliasMap.set(alias, normalizedValue);
  });
});

export const CODE_BLOCK_LANGUAGE_OPTIONS = Object.freeze(
  LANGUAGE_DEFINITIONS.map(({ value, label }) => ({
    value: String(value || "").trim().toLowerCase(),
    label,
  }))
);

export function normalizeCodeBlockLanguageTag(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  return languageAliasMap.get(normalized) || normalized;
}

export function getCodeBlockLanguageDefinition(value = "") {
  const normalized = normalizeCodeBlockLanguageTag(value);
  return languageDefinitionMap.get(normalized) || null;
}

export function getCodeBlockLanguageDisplayLabel(value = "") {
  const definition = getCodeBlockLanguageDefinition(value);
  if (definition) {
    return definition.label;
  }
  const normalized = normalizeCodeBlockLanguageTag(value);
  return normalized || "Plain Text";
}

export function resolveCodeBlockPrismLanguage(value = "") {
  const definition = getCodeBlockLanguageDefinition(value);
  if (definition?.prismLanguage) {
    return definition.prismLanguage;
  }
  return normalizeCodeBlockLanguageTag(value) || "plain";
}

export function getCodeBlockLanguageFileExtension(value = "") {
  const definition = getCodeBlockLanguageDefinition(value);
  if (definition?.fileExtension) {
    return String(definition.fileExtension || "").trim().toLowerCase();
  }
  const normalized = normalizeCodeBlockLanguageTag(value);
  return normalized || "txt";
}

export function isWeakCodeLanguageTag(value = "") {
  const definition = getCodeBlockLanguageDefinition(value);
  if (definition) {
    return definition.weak === true;
  }
  return !normalizeCodeBlockLanguageTag(value);
}
