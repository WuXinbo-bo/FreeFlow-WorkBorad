import { THEME_PRESET_DEFS } from "../../config/ui-meta.js";
import { DEFAULT_THEME_SETTINGS, deriveCustomThemeSettings } from "../../theme/themeSettings.js";
import { getThemePresetMeta } from "./themePresetMeta.js";

const PRESET_ITEMS = Object.freeze(
  Object.values(THEME_PRESET_DEFS).filter((item) => item?.key && item.key !== "custom")
);

const COLOR_FIELDS = Object.freeze([
  { key: "backgroundColor", label: "应用背景", description: "主界面背景" },
  { key: "shellPanelColor", label: "主面板", description: "左右主背景板" },
  { key: "controlColor", label: "控件表面", description: "按钮槽与切换器" },
  { key: "buttonColor", label: "强调色", description: "主操作与选中状态" },
  { key: "shellPanelTextColor", label: "主文字", description: "主界面正文" },
  { key: "messageColor", label: "消息区域", description: "助手消息与日志" },
]);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderPresetButtons(activePresetKey) {
  return PRESET_ITEMS.map((item) => {
    const isActive = item.key === activePresetKey;
    return `
      <button
        class="theme-panel-preset-chip${isActive ? " is-active" : ""}"
        type="button"
        data-theme-action="preset"
        data-theme-preset="${escapeHtml(item.key)}"
        aria-pressed="${isActive ? "true" : "false"}"
      >
        ${escapeHtml(item.label)}
      </button>
    `;
  }).join("");
}

function renderColorFields(settings = {}) {
  return COLOR_FIELDS.map((field) => `
    <label class="settings-field theme-panel-color-field">
      <span class="label">${escapeHtml(field.label)}</span>
      <span class="field-inline-note">${escapeHtml(field.description)}</span>
      <div class="theme-panel-color-input-row">
        <input
          class="color-input"
          type="color"
          data-theme-color="${escapeHtml(field.key)}"
          value="${escapeHtml(settings[field.key] || DEFAULT_THEME_SETTINGS[field.key] || "#ffffff")}"
        />
        <code class="theme-panel-color-code" data-theme-color-value="${escapeHtml(field.key)}">${escapeHtml(
          settings[field.key] || DEFAULT_THEME_SETTINGS[field.key] || "#ffffff"
        )}</code>
      </div>
    </label>
  `).join("");
}

export function mountThemeSettingsPanel(
  host,
  { onPreviewChange = () => {}, onSave = () => {}, onReset = () => {} } = {}
) {
  if (!(host instanceof Element)) {
    return {
      update() {},
      destroy() {},
    };
  }

  host.innerHTML = `
    <section class="usage-card theme-panel-shell">
      <div class="panel-head">
        <div class="section-title">统一主题管理</div>
        <div class="pill-note">全局主题 / 集中调度</div>
      </div>
      <p class="field-inline-note theme-panel-description" data-theme-description></p>
      <details class="theme-panel-section">
        <summary class="theme-panel-section-summary">
          <span class="theme-panel-section-title">主题预设</span>
          <span class="theme-panel-section-indicator" aria-hidden="true"></span>
        </summary>
        <div class="theme-panel-section-body">
          <div class="theme-panel-preset-grid" data-theme-presets></div>
        </div>
      </details>
      <details class="theme-panel-section">
        <summary class="theme-panel-section-summary">
          <span class="theme-panel-section-title">自定义主题</span>
          <span class="theme-panel-section-indicator" aria-hidden="true"></span>
        </summary>
        <div class="theme-panel-section-body">
          <div class="theme-panel-color-grid" data-theme-colors></div>
        </div>
      </details>
      <div class="settings-action-row theme-panel-actions">
        <button class="ghost-btn compact-btn" type="button" data-theme-action="reset">恢复默认</button>
        <button class="primary-btn compact-btn" type="button" data-theme-action="save">保存主题设置</button>
      </div>
    </section>
  `;

  const presetGridEl = host.querySelector("[data-theme-presets]");
  const descriptionEl = host.querySelector("[data-theme-description]");
  const colorGridEl = host.querySelector("[data-theme-colors]");
  let currentSettings = { ...DEFAULT_THEME_SETTINGS };

  function getEventTargetElement(event) {
    return event?.target instanceof Element ? event.target : null;
  }

  function update(settings = {}) {
    currentSettings = { ...DEFAULT_THEME_SETTINGS, ...settings };
    const themePreset = getThemePresetMeta(settings.themePreset);

    if (presetGridEl) {
      presetGridEl.innerHTML = renderPresetButtons(themePreset.key);
    }
    if (descriptionEl) {
      descriptionEl.textContent =
        themePreset.key === "custom"
          ? "当前为自定义主题。以下颜色统一控制宿主层 UI，不影响两个独立嵌入引擎。"
          : `${themePreset.label} · ${themePreset.description}`;
    }
    if (colorGridEl) {
      colorGridEl.innerHTML = renderColorFields(settings);
    }
  }

  function handleClick(event) {
    const eventTarget = getEventTargetElement(event);
    const actionEl = eventTarget?.closest("[data-theme-action]");
    if (!actionEl) return;

    event.preventDefault();
    event.stopPropagation();

    const action = actionEl.dataset.themeAction;
    if (action === "save") {
      onSave();
      return;
    }
    if (action === "reset") {
      onReset();
      return;
    }
    if (action === "preset") {
      const preset = THEME_PRESET_DEFS[actionEl.dataset.themePreset];
      if (!preset?.settings) return;
      onPreviewChange({
        ...preset.settings,
        themePreset: preset.key,
      });
    }
  }

  function handleInput(event) {
    const eventTarget = getEventTargetElement(event);
    const colorInput = eventTarget?.closest("[data-theme-color]");
    if (!colorInput) return;

    const key = colorInput.dataset.themeColor;
    if (!COLOR_FIELDS.some((field) => field.key === key)) return;
    onPreviewChange(deriveCustomThemeSettings({ ...currentSettings, [key]: String(colorInput.value || "").trim() }));
  }

  host.addEventListener("click", handleClick);
  host.addEventListener("input", handleInput);
  host.addEventListener("change", handleInput);

  return {
    update,
    destroy() {
      host.removeEventListener("click", handleClick);
      host.removeEventListener("input", handleInput);
      host.removeEventListener("change", handleInput);
      host.innerHTML = "";
    },
  };
}
