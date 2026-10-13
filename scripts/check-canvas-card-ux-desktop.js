const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright');
const { checkCanvasCardUx } = require('./check-canvas-card-ux');
const ROOT = path.resolve(__dirname, '..');

async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'freeflow-card-desktop-'));
  const data = path.join(temp, 'Data');
  await fs.mkdir(data);
  const version = require('../package.json').version;
  await fs.writeFile(path.join(data, 'ui-settings.json'), JSON.stringify({ hasShownStartupTutorial: true, lastTutorialIntroVersion: version, dismissedTutorialIntroVersion: version, defaultLaunchFullscreen: false }));
  const bootstrap = path.join(temp, 'bootstrap.cjs');
  await fs.writeFile(bootstrap, `const { app } = require('electron'); app.setPath('userData', ${JSON.stringify(path.join(temp, 'Profile'))}); app.getAppPath = () => ${JSON.stringify(ROOT)}; require(${JSON.stringify(path.join(ROOT, 'electron/main.js'))});`);
  const env = { ...process.env, FREEFLOW_HOME_DIR: temp, FREEFLOW_USER_DATA_DIR: data, FREEFLOW_CANVAS_BOARD_DIR: path.join(temp, 'Boards'), FREEFLOW_LEGACY_PROJECT_DATA_DIR: path.join(temp, 'Legacy'), FREEFLOW_PORT: '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({ executablePath: require('electron'), args: [bootstrap], cwd: ROOT, env });
    const page = await app.firstWindow();
    await page.waitForFunction(() => window.__canvas2dEngine && !document.body.classList.contains('app-booting'));
    await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.setFullScreen(false); win.setContentSize(1440, 960); win.show(); win.focus(); });
    await page.waitForTimeout(250);
    const collapse = page.locator('.canvas2d-workspace-panel').getByRole('button', { name: '收起画布工作区', exact: true });
    if (await collapse.isVisible()) await collapse.click();
    const directory = page.getByRole('button', { name: '收起画布目录', exact: true });
    if (await directory.isVisible()) await directory.click();
    await checkCanvasCardUx(page);
    console.log('[check-canvas-card-ux-desktop] Electron desktop passed');
  } finally {
    if (app) { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await app.close(); }
    await fs.rm(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
