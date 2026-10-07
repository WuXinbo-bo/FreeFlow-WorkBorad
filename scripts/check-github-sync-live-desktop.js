// Opt-in: uses a real account and writes only to an explicitly named test repository.
const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { _electron } = require("playwright");
const { GitHubApiClient } = require("../src/backend/services/githubApiClient");

async function main() {
  const tokenFile = process.env.FREEFLOW_GITHUB_TEST_TOKEN_FILE;
  const repositoryName = process.env.FREEFLOW_GITHUB_TEST_REPOSITORY;
  const expectedLogin = process.env.FREEFLOW_GITHUB_TEST_LOGIN;
  if (!tokenFile || !repositoryName || !expectedLogin) throw new Error("Provide a token file, test repository name and expected login explicitly");
  const token = fs.readFileSync(tokenFile, "utf8").trim();
  const client = new GitHubApiClient({ token });
  const user = await client.getUser();
  assert.equal(user.login, expectedLogin);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "freeflow-github-live-"));
  const dataDir = path.join(root, "AppData");
  const boardsDir = path.join(root, "Boards");
  fs.mkdirSync(dataDir);
  fs.mkdirSync(boardsDir);
  const version = require("../package.json").version;
  fs.writeFileSync(path.join(dataDir, "ui-settings.json"), JSON.stringify({ hasShownStartupTutorial: true, lastTutorialIntroVersion: version, dismissedTutorialIntroVersion: version }));
  const env = {
    ...process.env,
    FREEFLOW_HOME_DIR: root,
    FREEFLOW_USER_DATA_DIR: dataDir,
    FREEFLOW_CANVAS_BOARD_DIR: boardsDir,
    FREEFLOW_LEGACY_PROJECT_DATA_DIR: path.join(root, "Legacy"),
    FREEFLOW_CACHE_DIR: path.join(root, "Cache"),
    FREEFLOW_RUNTIME_DIR: path.join(root, "Runtime"),
    FREEFLOW_TEMP_DRAG_DIR: path.join(root, "Drag"),
    FREEFLOW_GITHUB_CLIENT_ID: "",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.FREEFLOW_GITHUB_TEST_TOKEN_FILE;
  let application;
  const report = { platform: process.platform, login: user.login, checks: [] };
  const passed = (check) => { report.checks.push(check); console.log(`[github-live] ${check}`); };
  try {
    application = await _electron.launch({ executablePath: require("electron"), args: [path.resolve(__dirname, ".."), `--user-data-dir=${path.join(root, "Electron")}`], env, timeout: 30000 });
    const page = await application.firstWindow();
    await page.waitForFunction(() => window.desktopShell?.githubSync && !document.body.classList.contains("app-booting"), null, { timeout: 30000 });
    page.setDefaultTimeout(30000);
    await page.locator("#conversation-settings-btn").evaluate((button) => button.click());
    await page.locator('[data-settings-section="diagnostics"]').click();
    await page.locator('[data-settings-action="github-connect"]').click();
    await page.waitForFunction(() => document.querySelector(".settings-center-runtime-error")?.textContent.includes("尚未配置 GitHub Client ID"));
    assert(!(await page.locator(".settings-center-runtime-error").innerText()).includes("404"));
    passed("actual Electron UI reports missing Client ID without local 404");

    await page.locator("[data-github-token]").fill("invalid-live-test-token");
    await page.locator('[data-settings-action="github-token-connect"]').click();
    await page.waitForFunction(() => document.querySelector(".settings-center-runtime-error")?.textContent.includes("凭证无效"));
    assert.equal((await page.evaluate(() => window.desktopShell.githubSync.getStatus())).connected, false);
    assert.equal(await page.locator("[data-github-token]").inputValue(), "");
    passed("real GitHub rejects invalid token; UI restores retry and clears secret input");

    async function connect() {
      await page.locator("[data-github-token]").fill(token);
      await page.locator('[data-settings-action="github-token-connect"]').click();
      await page.waitForFunction(() => Boolean(document.querySelector('[data-settings-action="github-disconnect"]')));
      const status = await page.evaluate(() => window.desktopShell.githubSync.getStatus());
      assert.equal(status.connected, true);
      assert.equal(status.auth.user.login, expectedLogin);
      assert(!JSON.stringify(status).includes(token), "status exposed a credential");
      assert(!fs.readFileSync(path.join(dataDir, "credentials.json"), "utf8").includes(token), "vault stored a plaintext token");
      assert(await page.evaluate((secret) => !JSON.stringify(localStorage).includes(secret) && !document.documentElement.outerHTML.includes(secret), token), "renderer persisted a credential");
    }
    await connect();
    passed("actual Electron password input connects the authorized GitHub account; vault is encrypted");

    let repository;
    if (process.env.FREEFLOW_GITHUB_TEST_REUSE === "1") {
      repository = await client.getRepository(expectedLogin, repositoryName);
    } else {
      const created = await page.evaluate((name) => window.desktopShell.githubSync.createRepository({ name, description: "FreeFlow isolated GitHub synchronization verification; synthetic test data only" }), repositoryName);
      repository = created.repository;
    }
    assert.equal(repository.private, true);
    assert.equal(repository.owner.login, expectedLogin);
    report.repository = repository.html_url;
    report.branch = repository.default_branch;
    await page.locator('[data-settings-action="github-repositories"]').click();
    await page.locator(`[data-github-repository] option[value="${expectedLogin}/${repositoryName}"]`).waitFor({ state: "attached" });
    await page.locator("[data-github-repository]").selectOption(`${expectedLogin}/${repositoryName}`);
    await page.locator('[data-settings-action="github-repository-save"]').click();
    await page.waitForFunction((repo) => [...document.querySelectorAll(".settings-center-diagnostic-grid strong")].some((node) => node.textContent === repo), `${expectedLogin}/${repositoryName}`);
    const bound = await page.evaluate(() => window.desktopShell.githubSync.getStatus());
    assert.equal(bound.repository.repo, repositoryName);
    assert.equal(bound.repository.branch, repository.default_branch);
    assert.equal(bound.auth.user.login, expectedLogin);
    passed("private test repository created, listed and bound through actual desktop IPC");

    if (!await page.evaluate(() => globalThis.__canvas2dEngine.getSnapshot().boardFilePath)) {
      await page.locator('[data-settings-action="github-sync"]').click();
      await page.waitForFunction(() => document.querySelector(".settings-center-runtime-error")?.textContent.includes("先将当前画布保存"));
      passed("unsaved canvas stops sync instead of uploading the unrelated default file");
    }

    const boardId = crypto.randomUUID();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=", "base64");
    const largePath = path.join(boardsDir, "oversize.png");
    fs.writeFileSync(largePath, Buffer.alloc(6 * 1024 * 1024));
    const fixturePath = path.join(boardsDir, "github-live-fixture.freeflow");
    fs.writeFileSync(fixturePath, JSON.stringify({ kind: "structured-host-board", version: "1.0.0", board: { boardId, items: [
      { id: "text", type: "text", text: "FreeFlow 真实 GitHub 同步测试 / macOS + Windows" },
      { id: "small", type: "image", name: "pixel.png", mime: "image/png", dataUrl: `data:image/png;base64,${png.toString("base64")}` },
      { id: "large", type: "image", name: "oversize.png", mime: "image/png", sourcePath: largePath, size: 6 * 1024 * 1024 },
      { id: "video", type: "fileCard", name: "clip.mp4", mime: "video/mp4", size: 1024 },
    ] } }));
    const uploaded = await page.evaluate((boardPath) => window.desktopShell.githubSync.sync({ boardPath, message: "Verify FreeFlow desktop GitHub sync with synthetic data" }), fixturePath);
    assert.equal(uploaded.bundle.manifest.skippedCount, 2);
    assert.equal(uploaded.bundle.manifest.resources.length, 1);
    const remote = await client.getContent(expectedLogin, repositoryName, `.freeflow/boards/${boardId}/board.freeflow`, repository.default_branch);
    const remoteText = Buffer.from(remote.content.replace(/\n/g, ""), "base64").toString("utf8");
    assert(remoteText.includes("真实 GitHub 同步测试"));
    assert(!remoteText.includes(largePath));
    assert(!remoteText.includes(token));
    report.commit = uploaded.commitSha;
    passed("real GitHub commit uploaded text and small image; oversized image/video became placeholders");

    const downloadPath = path.join(root, "Downloaded", "board.freeflow");
    await page.evaluate((payload) => window.desktopShell.githubSync.download(payload), { boardId, boardPath: downloadPath });
    const restored = JSON.parse(fs.readFileSync(downloadPath, "utf8"));
    assert.equal(restored.board.items.find((item) => item.id === "text").text, "FreeFlow 真实 GitHub 同步测试 / macOS + Windows");
    assert.equal(restored.board.items.find((item) => item.id === "large").resourceStatus, "placeholder");
    assert.equal(restored.board.items.find((item) => item.id === "video").syncReason, "video-disabled");
    const image = restored.board.items.find((item) => item.id === "small");
    assert(fs.readFileSync(path.resolve(path.dirname(downloadPath), image.sourcePath)).equals(png), "downloaded image bytes differ");
    passed("real repository download restores text and exact image bytes; placeholders remain intact");

    assert.equal(await page.evaluate((file) => globalThis.__canvas2dEngine.openBoardAtPath(file), fixturePath), true);
    await page.locator('[data-settings-action="github-sync"]').click();
    await page.waitForFunction(() => document.querySelector(".settings-center-save-state")?.textContent.includes("当前画布已同步"), null, { timeout: 60000 });
    const currentStatus = await page.evaluate(() => window.desktopShell.githubSync.getStatus());
    const current = Object.values(currentStatus.ledger.boards).find((entry) => entry.remoteHeadSha !== uploaded.commitSha);
    assert(current, "desktop sync button did not create a new commit for the open canvas");
    const currentRemote = await client.getContent(expectedLogin, repositoryName, `.freeflow/boards/${current.boardId}/board.freeflow`, repository.default_branch);
    assert(Buffer.from(currentRemote.content.replace(/\n/g, ""), "base64").toString("utf8").includes("真实 GitHub 同步测试"));
    passed("actual sync button saves and uploads the currently opened named canvas");

    await page.evaluate(() => globalThis.__canvas2dEngine.addCodeBlock({ code: "// repeated sync check" }));
    await page.locator('[data-settings-action="github-sync"]').click();
    await page.waitForFunction(() => document.querySelector(".settings-center-save-state")?.textContent.includes("当前画布已同步") && !document.querySelector('[data-settings-action="github-sync"]')?.disabled, null, { timeout: 60000 });
    const repeatedStatus = await page.evaluate(() => window.desktopShell.githubSync.getStatus());
    assert.equal(Object.keys(repeatedStatus.ledger.boards).length, Object.keys(currentStatus.ledger.boards).length, "editing and re-syncing created a duplicate cloud board");
    assert.notEqual(repeatedStatus.ledger.boards[current.boardId].remoteHeadSha, current.remoteHeadSha);
    passed("edit/save/repeated sync preserves the cloud board identity and updates its commit");

    await page.locator('[data-settings-action="github-disconnect"]').click();
    await page.locator("[data-github-token]").waitFor();
    assert.equal((await page.evaluate(() => window.desktopShell.githubSync.getStatus())).connected, false);
    await connect();
    passed("disconnect/reconnect succeeds and preserves same-account repository selection");
    if (process.env.FREEFLOW_GITHUB_TEST_SCREENSHOT) await page.screenshot({ path: process.env.FREEFLOW_GITHUB_TEST_SCREENSHOT });
    if (process.env.FREEFLOW_GITHUB_TEST_REPORT) fs.writeFileSync(process.env.FREEFLOW_GITHUB_TEST_REPORT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (application) await application.close();
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

main().catch((error) => { console.error(`[github-live] ${error.message}`); process.exitCode = 1; });
