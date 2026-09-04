import { hexToRgb, mixRgb, normalizeThemeHexColor } from "../utils/color.js";

export const PERMISSION_META = [
  { key: "systemMonitor", name: "系统监控", description: "允许读取 CPU、内存、磁盘和运行状态。" },
  { key: "fileRead", name: "读取文件", description: "允许 AI 读取你手动授权目录下的文件和目录。" },
  { key: "fileWrite", name: "写入文件", description: "允许 AI 创建、修改授权目录下的文件。" },
  { key: "desktopOrganize", name: "整理桌面", description: "允许 AI 按文件类型整理桌面文件。" },
  { key: "appControl", name: "软件控制", description: "允许 AI 打开或关闭本地软件。" },
  { key: "inputControl", name: "鼠标键盘", description: "允许 AI 模拟鼠标移动、点击与键盘输入。" },
  { key: "scriptExecution", name: "脚本执行", description: "允许 AI 运行 PowerShell 脚本。" },
  { key: "selfRepair", name: "自动修复", description: "允许 AI 运行预设的修复任务。" },
];

export const SIDEBAR_SECTION_DEFS = [
  { key: "overview", label: "工作台概览", description: "服务状态与主控区" },
  { key: "runtime", label: "模型与设备", description: "模型、设备与 Thinking" },
  { key: "customize", label: "界面定制", description: "名称、副标题与上下文摘要" },
  { key: "clipboard", label: "剪贴板保留区", description: "复制内容队列与快速保留" },
  { key: "sessions", label: "会话历史", description: "最近对话与会话管理" },
];

function rgbToHex(rgb = {}) {
  const toChannel = (value) => Math.min(255, Math.max(0, Math.round(Number(value) || 0))).toString(16).padStart(2, "0");
  return `#${toChannel(rgb.r)}${toChannel(rgb.g)}${toChannel(rgb.b)}`;
}

function getColorBrightness(hexColor) {
  const { r, g, b } = hexToRgb(hexColor);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function mixHex(baseHex, targetHex, ratio) {
  return rgbToHex(mixRgb(hexToRgb(baseHex), hexToRgb(targetHex), ratio));
}

function createThemePresetSettings(source = {}) {
  const backgroundColor = normalizeThemeHexColor(source.backgroundColor, "#f8f9fa");
  const textColor = normalizeThemeHexColor(source.textColor, "#212529");
  const patternColor = normalizeThemeHexColor(source.patternColor, "#e9ecef");
  const buttonColor = normalizeThemeHexColor(source.buttonColor, "#111111");
  const buttonTextColor = normalizeThemeHexColor(source.buttonTextColor, "#f8f9fa");
  const panelOpacity = Number.isFinite(Number(source.panelOpacity))
    ? Math.min(Math.max(Number(source.panelOpacity), 0.55), 1)
    : 0.96;
  const isLightBackground = getColorBrightness(backgroundColor) >= 158;
  const shellPanelBase = isLightBackground ? mixHex(backgroundColor, "#ffffff", 0.18) : mixHex(backgroundColor, "#08111f", 0.42);
  const shellPanelTextBase = isLightBackground ? "#1f2937" : "#f5f7ff";
  const controlBase = isLightBackground ? mixHex(shellPanelBase, "#ffffff", 0.08) : mixHex(shellPanelBase, "#243754", 0.3);
  const controlActiveBase = mixHex(controlBase, buttonColor, 0.44);
  const floatingPanelBase = isLightBackground ? mixHex(shellPanelBase, buttonColor, 0.12) : mixHex(shellPanelBase, buttonColor, 0.2);
  const inputBase = isLightBackground ? mixHex(shellPanelBase, "#ffffff", 0.14) : mixHex(shellPanelBase, "#152238", 0.22);
  const messageBase = isLightBackground ? mixHex(shellPanelBase, "#ffffff", 0.12) : mixHex(shellPanelBase, "#223453", 0.26);
  const userMessageBase = mixHex(messageBase, buttonColor, isLightBackground ? 0.28 : 0.42);
  const dialogBase = isLightBackground ? mixHex(floatingPanelBase, "#ffffff", 0.08) : mixHex(floatingPanelBase, "#101a2e", 0.2);

  return {
    panelOpacity,
    canvasOpacity: 1,
    backgroundColor,
    backgroundOpacity: 1,
    textColor,
    patternColor,
    buttonColor,
    buttonTextColor,
    shellPanelColor: normalizeThemeHexColor(source.shellPanelColor, shellPanelBase),
    shellPanelTextColor: normalizeThemeHexColor(source.shellPanelTextColor, shellPanelTextBase),
    controlColor: normalizeThemeHexColor(source.controlColor, controlBase),
    controlActiveColor: normalizeThemeHexColor(source.controlActiveColor, controlActiveBase),
    floatingPanelColor: normalizeThemeHexColor(source.floatingPanelColor, floatingPanelBase),
    inputColor: normalizeThemeHexColor(source.inputColor, inputBase),
    inputTextColor: normalizeThemeHexColor(source.inputTextColor, shellPanelTextBase),
    messageColor: normalizeThemeHexColor(source.messageColor, messageBase),
    userMessageColor: normalizeThemeHexColor(source.userMessageColor, userMessageBase),
    dialogColor: normalizeThemeHexColor(source.dialogColor, dialogBase),
  };
}

export const THEME_PRESET_DEFS = {
  custom: {
    key: "custom",
    label: "自定义",
    description: "可先选择预设，再继续自由调整颜色；手动修改后会自动切回自定义。",
    settings: null,
  },
  "minimalist-slate": {
    key: "minimalist-slate",
    label: "极简冷灰",
    description: "冷灰基底，克制灰度。",
    settings: createThemePresetSettings({
      panelOpacity: 0.96,
      backgroundColor: "#f8f9fa",
      backgroundOpacity: 1,
      textColor: "#212529",
      patternColor: "#e9ecef",
      buttonColor: "#111111",
      buttonTextColor: "#f8f9fa",
    }),
  },
  "midnight-slate-glow": {
    key: "midnight-slate-glow",
    label: "深夜墨色",
    description: "深邃墨调，沉静内敛。",
    settings: createThemePresetSettings({
      panelOpacity: 0.94,
      backgroundColor: "#0f1115",
      backgroundOpacity: 1,
      textColor: "#e5e7eb",
      patternColor: "#2b313a",
      buttonColor: "#d4d8df",
      buttonTextColor: "#0f1115",
      shellPanelColor: "#171b22",
      shellPanelTextColor: "#f3f4f6",
      controlColor: "#1e242d",
      controlActiveColor: "#4c5868",
      floatingPanelColor: "#1b212a",
      inputColor: "#141920",
      inputTextColor: "#f3f4f6",
      messageColor: "#1c222c",
      userMessageColor: "#5c6777",
      dialogColor: "#20262f",
    }),
  },
  "clear-day": {
    key: "clear-day",
    label: "清昼白",
    description: "明亮白色界面，适合长时间创作。",
    settings: createThemePresetSettings({
      backgroundColor: "#f3f5f6",
      textColor: "#20262d",
      patternColor: "#c7d0d6",
      buttonColor: "#2563eb",
      buttonTextColor: "#ffffff",
      shellPanelColor: "#ffffff",
      shellPanelTextColor: "#20262d",
      controlColor: "#f2f4f6",
      controlActiveColor: "#dce7fb",
      floatingPanelColor: "#f8fafb",
      inputColor: "#ffffff",
      inputTextColor: "#20262d",
      messageColor: "#f4f6f8",
      userMessageColor: "#dce8ff",
      dialogColor: "#ffffff",
    }),
  },
  "harbor-blue": {
    key: "harbor-blue",
    label: "海湾蓝",
    description: "冷灰外壳与稳重蓝色强调。",
    settings: createThemePresetSettings({
      backgroundColor: "#eaf0f3",
      textColor: "#26333b",
      patternColor: "#a6b7c0",
      buttonColor: "#246f91",
      buttonTextColor: "#ffffff",
      shellPanelColor: "#f7fafb",
      shellPanelTextColor: "#26333b",
      controlColor: "#edf3f5",
      controlActiveColor: "#cee2eb",
      floatingPanelColor: "#eef5f7",
      inputColor: "#fbfcfd",
      inputTextColor: "#26333b",
      messageColor: "#f0f4f6",
      userMessageColor: "#c9e0ea",
      dialogColor: "#f5f9fa",
    }),
  },
  "spruce-green": {
    key: "spruce-green",
    label: "云杉绿",
    description: "中性浅灰与低饱和绿色强调。",
    settings: createThemePresetSettings({
      backgroundColor: "#edf1ef",
      textColor: "#25322d",
      patternColor: "#a9b8b0",
      buttonColor: "#34745f",
      buttonTextColor: "#ffffff",
      shellPanelColor: "#f8faf9",
      shellPanelTextColor: "#25322d",
      controlColor: "#edf2ef",
      controlActiveColor: "#d4e5dd",
      floatingPanelColor: "#f0f5f2",
      inputColor: "#fbfcfb",
      inputTextColor: "#25322d",
      messageColor: "#f1f5f3",
      userMessageColor: "#cfe3da",
      dialogColor: "#f7faf8",
    }),
  },
};

export const THEME_PRESET_ALIASES = Object.freeze({
  "silent-luxury": "minimalist-slate",
  "terracotta-earth": "clear-day",
  "midnight-neon": "midnight-slate-glow",
  "morandi-sage": "spruce-green",
  "misty-blue-clarity": "harbor-blue",
});
