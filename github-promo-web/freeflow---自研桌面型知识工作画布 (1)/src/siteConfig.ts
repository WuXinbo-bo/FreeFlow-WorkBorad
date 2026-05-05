const DEFAULT_GITHUB_RELEASES_URL = "https://github.com/WuXinbo-bo/FreeFlow-WorkBorad/releases";
const DEFAULT_GITHUB_DOWNLOAD_URL = `${DEFAULT_GITHUB_RELEASES_URL}/latest/download/FreeFlow-Setup-x64.exe`;
const DEFAULT_QUARK_DOWNLOAD_URL = "https://pan.quark.cn/s/7caece083436";
const DEFAULT_LIVE_DEMO_URL = "https://wuxinbo-bo.github.io/canvas-demo-standalone/";

const trimString = (value: unknown) => String(value || "").trim();

const githubReleasesUrl =
  trimString(import.meta.env.VITE_FREEFLOW_GITHUB_RELEASES_URL) || DEFAULT_GITHUB_RELEASES_URL;

const githubDownloadUrl =
  trimString(import.meta.env.VITE_FREEFLOW_GITHUB_DOWNLOAD_URL) ||
  `${githubReleasesUrl.replace(/\/$/, "")}/latest/download/FreeFlow-Setup-x64.exe`;

const quarkDownloadUrl =
  trimString(import.meta.env.VITE_FREEFLOW_QUARK_DOWNLOAD_URL) || DEFAULT_QUARK_DOWNLOAD_URL;

const liveDemoUrl =
  trimString(import.meta.env.VITE_FREEFLOW_LIVE_DEMO_URL) || DEFAULT_LIVE_DEMO_URL;

export const siteLinks = {
  githubReleasesUrl,
  githubDownloadUrl,
  quarkDownloadUrl,
  liveDemoUrl,
};

export const downloadChannels = [
  {
    id: "github",
    label: "GitHub",
    href: githubDownloadUrl,
  },
  {
    id: "quark",
    label: "夸克网盘",
    href: quarkDownloadUrl,
  },
] as const;
