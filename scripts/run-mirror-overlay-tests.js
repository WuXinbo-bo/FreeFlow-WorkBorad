"use strict";
const { spawnSync } = require("node:child_process");
const path = require("node:path");

// Native windows run last and serially, so focus from another test cannot interfere.
const scripts = [
  "check-webcontents-view-embed.js",
  "check-ai-mirror-target-lifecycle.js",
  "check-mirror-runtime-lifecycle.js",
  "check-mirror-visibility.js",
  "check-mirror-overlay-manager.js",
  "check-mirror-overlay-ui.js",
  "check-mirror-overlay-host.js",
  ...(!process.argv.includes("--no-desktop") ? ["check-mirror-overlay-desktop.js"] : []),
];
for (const script of scripts) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script)], { cwd: path.resolve(__dirname, ".."), stdio: "inherit" });
  if (result.status !== 0) { process.exitCode = result.status || 1; break; }
}
