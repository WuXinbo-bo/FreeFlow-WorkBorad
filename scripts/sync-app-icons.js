const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const targets = ["public/index.html", "public/src/runtime/assistant-plugin/assistantTemplate.html"];

async function main() {
  const { ICON_NODES, renderAppIcon } = await import(pathToFileURL(path.join(root, "public/src/ui/icons/appIcons.mjs")));
  const checking = process.argv.includes("--check");
  let total = 0;
  for (const target of targets) {
    const source = await fs.readFile(path.join(root, target), "utf8");
    const next = source.replace(/<svg\b([^>]*\bdata-ui-icon=["']([^"']+)["'][^>]*)>[\s\S]*?<\/svg>/g, (_, rawAttributes, name) => {
      if (!ICON_NODES[name]) throw new Error(`Unknown icon ${name} in ${target}`);
      const attributes = Array.from(rawAttributes.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g), (match) => [match[1], match[3]]);
      const className = [...new Set((attributes.find(([key]) => key === "class")?.[1] || "").split(/\s+/).filter((key) => key && key !== "app-icon"))].join(" ");
      const size = Number(attributes.find(([key]) => key === "data-ui-icon-size")?.[1]) || 18;
      const generatedAttributes = new Set(["class", "xmlns", "data-ui-icon", "viewBox", "width", "height", "style", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "aria-hidden", "focusable"]);
      const extras = attributes.filter(([key]) => !generatedAttributes.has(key)).map(([key, value]) => `${key}="${value.replaceAll('"', "&quot;")}"`).join(" ");
      total++;
      return renderAppIcon(name, { className, size }).replace("<svg ", extras ? `<svg ${extras} ` : "<svg ");
    });
    if (checking && next !== source) throw new Error(`${target}: run node scripts/sync-app-icons.js`);
    if (!checking && next !== source) await fs.writeFile(path.join(root, target), next);
  }
  console.log(`[app-icons] ${total} static icons ${checking ? "verified" : "synchronized"}`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
