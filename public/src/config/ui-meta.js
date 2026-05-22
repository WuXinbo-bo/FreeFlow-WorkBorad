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
  const backgroundOpacity = Number.isFinite(Number(source.backgroundOpacity))
    ? Math.min(Math.max(Number(source.backgroundOpacity), 0), 1)
    : 1;
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
    backgroundColor,
    backgroundOpacity,
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
  "silent-luxury": {
    key: "silent-luxury",
    label: "素简静谧",
    description: "低饱和灰调，柔和内敛。",
    settings: createThemePresetSettings({
      panelOpacity: 0.94,
      backgroundColor: "#f5f3ee",
      backgroundOpacity: 1,
      textColor: "#2c3e50",
      patternColor: "#95a5a6",
      buttonColor: "#2c3e50",
      buttonTextColor: "#ffffff",
    }),
  },
  "terracotta-earth": {
    key: "terracotta-earth",
    label: "赤陶大地",
    description: "暖调陶土色系，温润质感。",
    settings: createThemePresetSettings({
      panelOpacity: 0.94,
      backgroundColor: "#fafaf9",
      backgroundOpacity: 1,
      textColor: "#4a3f35",
      patternColor: "#e6b89c",
      buttonColor: "#c25953",
      buttonTextColor: "#fafaf9",
    }),
  },
  "midnight-neon": {
    key: "midnight-neon",
    label: "暗夜霓虹",
    description: "暗调基底，深色点缀。",
    settings: createThemePresetSettings({
      panelOpacity: 0.92,
      backgroundColor: "#0f172a",
      backgroundOpacity: 1,
      textColor: "#f8fafc",
      patternColor: "#1e293b",
      buttonColor: "#10b981",
      buttonTextColor: "#f8fafc",
    }),
  },
  "morandi-sage": {
    key: "morandi-sage",
    label: "青雾松灰",
    description: "青灰融合色调，清浅柔和。",
    settings: createThemePresetSettings({
      panelOpacity: 0.9,
      backgroundColor: "#faf9f6",
      backgroundOpacity: 1,
      textColor: "#333333",
      patternColor: "#7c9082",
      buttonColor: "#7c9082",
      buttonTextColor: "#faf9f6",
    }),
  },
  "misty-blue-clarity": {
    key: "misty-blue-clarity",
    label: "雾蓝清透",
    description: "雾感浅蓝，通透清爽。",
    settings: createThemePresetSettings({
      panelOpacity: 0.9,
      backgroundColor: "#f1e4d1",
      backgroundOpacity: 1,
      textColor: "#2c3e50",
      patternColor: "#95a5a6",
      buttonColor: "#162660",
      buttonTextColor: "#ffffff",
      shellPanelColor: "#f7f5f1",
      shellPanelTextColor: "#1f2937",
      controlColor: "#f8f6f2",
      controlActiveColor: "#d0e6fd",
      floatingPanelColor: "#d0e6fd",
      inputColor: "#f8f6f3",
      inputTextColor: "#1f2937",
      messageColor: "#f8f6f3",
      userMessageColor: "#d0e6fd",
      dialogColor: "#162660",
    }),
  },
};
