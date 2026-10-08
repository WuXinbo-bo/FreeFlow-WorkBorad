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
    description: "银灰面板、石墨按钮，适合专注工作。",
    settings: createThemePresetSettings({
      panelOpacity: 0.96,
      backgroundColor: "#e7ebf0",
      backgroundOpacity: 1,
      textColor: "#253246",
      patternColor: "#a5afbc",
      buttonColor: "#293b50",
      buttonTextColor: "#ffffff",
      shellPanelColor: "#f9fafb",
      shellPanelTextColor: "#253246",
      controlColor: "#f7f9fc",
      controlActiveColor: "#d1dbe8",
      floatingPanelColor: "#e9eef4",
      inputColor: "#ffffff",
      inputTextColor: "#253246",
      messageColor: "#e7ecf3",
      userMessageColor: "#d5dfec",
      dialogColor: "#f1f4f8",
    }),
  },
  "midnight-slate-glow": {
    key: "midnight-slate-glow",
    label: "深夜墨色",
    description: "深蓝墨色面板、冰蓝强调，适合夜间使用。",
    settings: createThemePresetSettings({
      panelOpacity: 0.96,
      backgroundColor: "#101722",
      backgroundOpacity: 1,
      textColor: "#e8eff9",
      patternColor: "#71839b",
      buttonColor: "#8ebcff",
      buttonTextColor: "#102238",
      shellPanelColor: "#192536",
      shellPanelTextColor: "#e8eff9",
      controlColor: "#22324a",
      controlActiveColor: "#344e71",
      floatingPanelColor: "#1d2c40",
      inputColor: "#152031",
      inputTextColor: "#e8eff9",
      messageColor: "#1e2e43",
      userMessageColor: "#304766",
      dialogColor: "#1c2a3d",
    }),
  },
  "clear-day": {
    key: "clear-day",
    label: "清昼白",
    description: "纯白面板、暖橙强调，清晰明亮。",
    settings: createThemePresetSettings({
      backgroundColor: "#fbfaf7",
      textColor: "#352c24",
      patternColor: "#c7b9a9",
      buttonColor: "#a84916",
      buttonTextColor: "#ffffff",
      shellPanelColor: "#ffffff",
      shellPanelTextColor: "#352c24",
      controlColor: "#faf6f0",
      controlActiveColor: "#f6e0cc",
      floatingPanelColor: "#fffcf7",
      inputColor: "#ffffff",
      inputTextColor: "#352c24",
      messageColor: "#faf7f2",
      userMessageColor: "#f7e3d1",
      dialogColor: "#ffffff",
    }),
  },
  "harbor-blue": {
    key: "harbor-blue",
    label: "海湾蓝",
    description: "雾蓝面板、海蓝按钮，冷静清爽。",
    settings: createThemePresetSettings({
      backgroundColor: "#cbddeb",
      textColor: "#173650",
      patternColor: "#7c9fb9",
      buttonColor: "#176197",
      buttonTextColor: "#ffffff",
      shellPanelColor: "#deebf6",
      shellPanelTextColor: "#173650",
      controlColor: "#edf5fc",
      controlActiveColor: "#b4d2eb",
      floatingPanelColor: "#d7e7f4",
      inputColor: "#f6fbff",
      inputTextColor: "#173650",
      messageColor: "#d8e8f5",
      userMessageColor: "#bdd8ed",
      dialogColor: "#e2eef8",
    }),
  },
  "spruce-green": {
    key: "spruce-green",
    label: "云杉绿",
    description: "鼠尾草绿面板、森林绿按钮，柔和自然。",
    settings: createThemePresetSettings({
      backgroundColor: "#cedfd3",
      textColor: "#214134",
      patternColor: "#85a38f",
      buttonColor: "#226449",
      buttonTextColor: "#ffffff",
      shellPanelColor: "#ddeae1",
      shellPanelTextColor: "#214134",
      controlColor: "#eef6f0",
      controlActiveColor: "#b9d6c4",
      floatingPanelColor: "#d6e6db",
      inputColor: "#f6fcf8",
      inputTextColor: "#214134",
      messageColor: "#d8e8dd",
      userMessageColor: "#bfdbc9",
      dialogColor: "#e2eee6",
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
