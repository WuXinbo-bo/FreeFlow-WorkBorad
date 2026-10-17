// Keep the shared application whitelist. A mac.files exclusion-only list creates
// an additional catch-all matcher in electron-builder instead of narrowing it.
module.exports = async function prepareMacosPackage(context) {
  if (context.electronPlatformName !== "darwin") return;
  const rootFiles = context.packager.config.files.find((entry) => entry && typeof entry === "object" && !entry.from && !entry.to);
  if (!Array.isArray(rootFiles?.filter)) throw new Error("Missing normalized application file whitelist");
  rootFiles.filter.push("!node_modules/koffi/**/*");
};
