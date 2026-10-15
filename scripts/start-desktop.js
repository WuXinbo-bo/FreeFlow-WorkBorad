const path = require("path");
const { spawn, spawnSync } = require("child_process");

// Source checkouts build the optional package separately; release apps do not run this launcher.
const extensionBuild = spawnSync(process.execPath, [path.join(__dirname, "build-assistant-extension.js")], { cwd: path.resolve(__dirname, ".."), stdio: "inherit" });
if (extensionBuild.status !== 0) process.exit(extensionBuild.status || 1);

// Electron must run as a desktop application, including from a Node-enabled host.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), [path.resolve(__dirname, ".."), ...process.argv.slice(2)], {
  cwd: path.resolve(__dirname, ".."),
  env,
  stdio: "inherit",
});
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
