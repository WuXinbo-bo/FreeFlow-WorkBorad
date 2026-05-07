const { checkForAppUpdate } = require("../electron/updateService");

async function main() {
  const result = await checkForAppUpdate({
    currentVersion: "1.1.1",
    mockRelease: {
      tag_name: "v1.1.2",
      name: "FreeFlow v1.1.2",
      body: "- 临时测试版本提醒\n- 用于验证更新检查与提示链路",
      published_at: "2026-05-08T08:00:00Z",
      html_url: "https://github.com/WuXinbo-bo/FreeFlow-WorkBorad/releases/tag/v1.1.2",
      assets: [
        {
          name: "FreeFlow-v1.1.2-x64.exe",
          browser_download_url:
            "https://github.com/WuXinbo-bo/FreeFlow-WorkBorad/releases/download/v1.1.2/FreeFlow-v1.1.2-x64.exe",
          size: 125829120,
        },
      ],
    },
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
