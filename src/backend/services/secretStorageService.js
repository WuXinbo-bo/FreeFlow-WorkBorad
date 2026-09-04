const crypto = require("crypto");
const fs = require("fs/promises");
const { execFileSync } = require("child_process");
const { CREDENTIALS_FILE, CREDENTIALS_KEY_FILE } = require("../config/paths");
const { atomicWriteFile, atomicWriteJsonFile } = require("../utils/atomicWrite");

const VAULT_VERSION = 1;
let vaultQueue = Promise.resolve();

async function readVault() {
  try {
    const raw = JSON.parse(await fs.readFile(CREDENTIALS_FILE, "utf8"));
    return raw && typeof raw.entries === "object" ? raw : { schemaVersion: VAULT_VERSION, entries: {} };
  } catch {
    return { schemaVersion: VAULT_VERSION, entries: {} };
  }
}

async function getFallbackKey() {
  try {
    const key = Buffer.from(String(await fs.readFile(CREDENTIALS_KEY_FILE, "utf8")).trim(), "base64");
    if (key.length === 32) return key;
  } catch {
    // Create a new installation-local encryption key below.
  }
  const key = crypto.randomBytes(32);
  const result = await atomicWriteFile(CREDENTIALS_KEY_FILE, key.toString("base64"), { mode: 0o600 });
  if (!result.ok) throw new Error(result.error || "Unable to create credential key");
  await fs.chmod(CREDENTIALS_KEY_FILE, 0o600).catch(() => {});
  return key;
}

function protectWithDpapi(value, operation) {
  const method = operation === "protect" ? "Protect" : "Unprotect";
  const script = `Add-Type -AssemblyName System.Security;$raw=[Console]::In.ReadToEnd();$bytes=[Convert]::FromBase64String($raw);$out=[Security.Cryptography.ProtectedData]::${method}($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($out))`;
  const result = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    input: Buffer.from(value).toString("base64"),
    encoding: "utf8",
    windowsHide: true,
    timeout: 15000,
    maxBuffer: 1024 * 1024,
  });
  return Buffer.from(String(result || "").trim(), "base64");
}

async function encryptSecret(value) {
  const text = String(value || "");
  if (process.platform === "win32") {
    try {
      return {
        scheme: "dpapi-current-user",
        value: protectWithDpapi(Buffer.from(text, "utf8"), "protect").toString("base64"),
      };
    } catch {
      // Portable and constrained Windows environments use the local fallback.
    }
  }
  const key = await getFallbackKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return {
    scheme: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    value: encrypted.toString("base64"),
  };
}

async function decryptSecret(entry) {
  if (!entry) return "";
  if (entry.scheme === "dpapi-current-user") {
    if (process.platform !== "win32") return "";
    return protectWithDpapi(Buffer.from(entry.value, "base64"), "unprotect").toString("utf8");
  }
  if (entry.scheme !== "aes-256-gcm") return "";
  const key = await getFallbackKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(entry.iv, "base64"));
  decipher.setAuthTag(Buffer.from(entry.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(entry.value, "base64")), decipher.final()]).toString("utf8");
}

async function readSecret(id) {
  const vault = await readVault();
  try {
    return await decryptSecret(vault.entries[String(id || "")]);
  } catch {
    return "";
  }
}

function mutateVault(mutator) {
  const operation = vaultQueue.catch(() => {}).then(async () => {
    const vault = await readVault();
    await mutator(vault.entries);
    vault.schemaVersion = VAULT_VERSION;
    const result = await atomicWriteJsonFile(CREDENTIALS_FILE, vault, { mode: 0o600 });
    if (!result.ok) throw new Error(result.error || "Unable to persist credentials");
    await fs.chmod(CREDENTIALS_FILE, 0o600).catch(() => {});
  });
  vaultQueue = operation;
  return operation;
}

async function writeSecret(id, value) {
  const key = String(id || "").trim();
  if (!key) throw new Error("Credential id is required");
  const encrypted = await encryptSecret(value);
  await mutateVault((entries) => {
    entries[key] = encrypted;
  });
}

async function clearSecret(id) {
  const key = String(id || "").trim();
  if (!key) return;
  await mutateVault((entries) => {
    delete entries[key];
  });
}

module.exports = {
  CREDENTIALS_FILE,
  CREDENTIALS_KEY_FILE,
  readSecret,
  writeSecret,
  clearSecret,
};
