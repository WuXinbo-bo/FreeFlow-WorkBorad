const { app, BrowserWindow } = require("electron");

const TARGET_URL = "http://127.0.0.1:3000";
const USER_DATA_PATH = "C:\\Users\\lenovo\\AppData\\Roaming\\FreeFlow";

app.setPath("userData", USER_DATA_PATH);

async function main() {
  await app.whenReady();

  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
    },
  });

  try {
    await win.loadURL(TARGET_URL);
    const result = await win.webContents.executeJavaScript(
      `
        localStorage.setItem("freeflow:update-check-mock", "true");
        ({
          value: localStorage.getItem("freeflow:update-check-mock"),
          origin: location.origin
        });
      `,
      true
    );
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: error?.message || "ENABLE_UPDATE_CHECK_MOCK_FAILED",
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  } finally {
    win.destroy();
    app.quit();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error?.message || "ENABLE_UPDATE_CHECK_MOCK_FATAL",
      },
      null,
      2
    )
  );
  process.exit(1);
});
