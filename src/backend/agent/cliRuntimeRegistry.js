const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const PROVIDERS = Object.freeze({
  codex: { command: "codex", label: "Codex CLI" },
  claude: { command: "claude", label: "Claude Code" },
});

function uniqueCandidates(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    if (!item?.path) continue;
    const resolved = path.resolve(String(item.path));
    const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ path: resolved, source: item.source || "system" });
  }
  return result;
}

function wrapperCommand(candidate) {
  if (/\.(?:m?js)$/i.test(candidate)) return { command: process.execPath, args: [candidate] };
  if (process.platform === "win32" && /\.(?:cmd|bat)$/i.test(candidate)) {
    const commandName = path.basename(candidate, path.extname(candidate));
    const nearby = [
      path.join(path.dirname(candidate), "node_modules", "@openai", "codex", "bin", `${commandName}.js`),
      path.join(path.dirname(candidate), "node_modules", "@anthropic-ai", "claude-code", "cli.js"),
    ].find((item) => fs.existsSync(item));
    if (nearby) return { command: process.execPath, args: [nearby] };
    return { command: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", candidate] };
  }
  return { command: candidate, args: [] };
}

function execFileResult(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, timeout: 8000, maxBuffer: 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (error) return reject(error);
      resolve(`${stdout || ""}\n${stderr || ""}`.trim());
    });
  });
}

async function probeExecutable(candidate) {
  if (!fs.existsSync(candidate)) return { ok: false, version: "", error: "文件不存在" };
  const resolved = wrapperCommand(candidate);
  try {
    const version = await execFileResult(resolved.command, [...resolved.args, "--version"]);
    return { ok: true, version: version || "可用", launch: resolved };
  } catch (error) {
    return { ok: false, version: "", error: String(error?.message || error).slice(0, 300), launch: resolved };
  }
}

async function commandCandidates(command) {
  const result = [];
  const pathEntries = String(process.env.PATH || process.env.Path || "").split(path.delimiter).filter(Boolean);
  for (const directory of pathEntries) {
    const names = process.platform === "win32" ? [`${command}.exe`, `${command}.cmd`, `${command}.bat`] : [command];
    names.forEach((name) => result.push({ path: path.join(directory, name), source: "system" }));
  }
  try {
    const resolver = process.platform === "win32" ? "where.exe" : "which";
    const output = await execFileResult(resolver, [command], { timeout: 5000 });
    output.split(/\r?\n/).filter(Boolean).forEach((candidate) => result.push({ path: candidate, source: "system" }));
  } catch {
    // Known user locations below cover GUI processes with a reduced PATH.
  }
  return result;
}

function directoryCandidates(provider) {
  const command = PROVIDERS[provider].command;
  const env = process.env;
  const roots = [
    env.npm_config_prefix,
    env.NPM_CONFIG_PREFIX,
    env.APPDATA && path.join(env.APPDATA, "npm"),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "npm"),
    env.PNPM_HOME,
    env.VOLTA_HOME && path.join(env.VOLTA_HOME, "bin"),
    env.BUN_INSTALL && path.join(env.BUN_INSTALL, "bin"),
    env.USERPROFILE && path.join(env.USERPROFILE, ".npm-global", "bin"),
    env.USERPROFILE && path.join(env.USERPROFILE, ".local", "bin"),
    process.platform === "win32" && path.dirname(process.execPath),
  ].filter(Boolean);
  const candidates = roots.flatMap((root) => process.platform === "win32"
    ? [{ path: path.join(root, `${command}.exe`), source: "npm" }, { path: path.join(root, `${command}.cmd`), source: "npm" }]
    : [{ path: path.join(root, command), source: "npm" }]);
  if (provider === "codex" && env.LOCALAPPDATA) {
    const desktopBin = path.join(env.LOCALAPPDATA, "OpenAI", "Codex", "bin");
    try {
      for (const entry of fs.readdirSync(desktopBin, { withFileTypes: true })) {
        if (entry.isDirectory()) candidates.push({ path: path.join(desktopBin, entry.name, "codex.exe"), source: "desktop" });
      }
    } catch {
      // The desktop installation is optional.
    }
  }
  return candidates;
}

async function defaultCandidateResolver(provider, configuredPath = "") {
  const info = PROVIDERS[provider];
  if (!info) throw new Error(`不支持的 CLI Provider：${provider}`);
  return uniqueCandidates([
    ...(configuredPath ? [{ path: configuredPath, source: "configured" }] : []),
    ...(await commandCandidates(info.command)),
    ...directoryCandidates(provider),
  ]).filter((item) => fs.existsSync(item.path));
}

function createCliRuntimeRegistry(options = {}) {
  const candidateResolver = options.candidateResolver || defaultCandidateResolver;
  const probe = options.probe || probeExecutable;
  return {
    async detect(provider, input = {}) {
      if (!PROVIDERS[provider]) throw new Error(`不支持的 CLI Provider：${provider}`);
      const configuredPath = String(input.configuredPath || "").trim();
      const discovered = uniqueCandidates(await candidateResolver(provider, configuredPath));
      const candidates = [];
      for (const item of discovered) {
        const result = await probe(item.path, provider);
        if (!result?.ok) continue;
        candidates.push({
          path: item.path,
          source: item.source,
          version: String(result.version || "可用"),
          label: item.source === "desktop" ? "桌面应用" : item.source === "npm" ? "用户 npm" : item.source === "configured" ? "已指定" : "系统",
        });
      }
      const configuredKey = configuredPath
        ? (process.platform === "win32" ? path.resolve(configuredPath).toLowerCase() : path.resolve(configuredPath))
        : "";
      const selected = configuredKey
        ? candidates.find((item) => (process.platform === "win32" ? item.path.toLowerCase() : item.path) === configuredKey)
        : null;
      return {
        provider,
        label: PROVIDERS[provider].label,
        available: Boolean(selected),
        requiresSelection: !selected && candidates.length > 0,
        path: selected?.path || "",
        version: selected?.version || "",
        source: selected?.source || "",
        candidates,
        error: selected ? "" : candidates.length ? "请选择一个已发现的 CLI" : `未找到 ${PROVIDERS[provider].label}`,
        checkedAt: Date.now(),
      };
    },
    probe,
  };
}

module.exports = {
  PROVIDERS,
  createCliRuntimeRegistry,
  defaultCandidateResolver,
  probeExecutable,
  wrapperCommand,
};
