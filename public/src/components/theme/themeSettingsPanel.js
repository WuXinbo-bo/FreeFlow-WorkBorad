import { THEME_PRESET_DEFS } from "../../config/ui-meta.js";
import { DEFAULT_THEME_SETTINGS, THEME_SETTING_KEYS } from "../../theme/themeSettings.js";
import { getThemePresetMeta } from "./themePresetMeta.js";

const PRESET_ITEMS = Object.freeze(
  Object.values(THEME_PRESET_DEFS).filter((item) => item?.key && item.key !== "custom")
);

const COLOR_FIELDS = Object.freeze([
  { key: "backgroundColor", label: "背景底色", description: "主界面背景" },
  { key: "shellPanelColor", label: "主面板", description: "左右主背景板" },
  { key: "floatingPanelColor", label: "浮层面板", description: "抽屉与悬浮卡片" },
  { key: "dialogColor", label: "弹窗底色", description: "菜单与弹出面板" },
  { key: "controlColor", label: "控件底色", description: "按钮槽与切换器" },
  { key: "controlActiveColor", label: "控件激活", description: "激活态控件" },
  { key: "inputColor", label: "输入框底色", description: "输入框与编辑区" },
  { key: "textColor", label: "全局文本", description: "说明与辅助文字" },
  { key: "shellPanelTextColor", label: "主面板文字", description: "主界面正文" },
  { key: "inputTextColor", label: "输入框文字", description: "输入内容文字" },
  { key: "messageColor", label: "AI 对话框", description: "助手消息气泡" },
  { key: "userMessageColor", label: "我的对话框", description: "用户消息气泡" },
  { key: "buttonColor", label: "主按钮", description: "主操作按钮" },
  { key: "buttonTextColor", label: "按钮文字", description: "主按钮文本" },
  { key: "patternColor", label: "纹理线条", description: "背景纹理与分隔氛围" },
]);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toPanelOpacityPercent(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return Math.round(DEFAULT_THEME_SETTINGS.panelOpacity * 100);
  return Math.round(Math.min(Math.max(next, 0.55), 1) * 100);
}

function toBackgroundOpacityPercent(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return Math.round(DEFAULT_THEME_SETTINGS.backgroundOpacity * 100);
  return Math.round(Math.min(Math.max(next, 0), 1) * 100);
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
          <div class="theme-panel-slider-grid">
            <label class="settings-field theme-panel-slider">
              <span class="label">面板透明度</span>
              <input class="theme-panel-range" data-theme-slider="panelOpacity" type="range" min="55" max="100" step="1" />
              <span class="theme-panel-slider-value" data-theme-value="panelOpacity"></span>
            </label>
            <label class="settings-field theme-panel-slider">
              <span class="label">背景透出</span>
              <input class="theme-panel-range" data-theme-slider="backgroundOpacity" type="range" min="0" max="100" step="1" />
              <span class="theme-panel-slider-value" data-theme-value="backgroundOpacity"></span>
            </label>
          </div>
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
  const panelOpacityRangeEl = host.querySelector('[data-theme-slider="panelOpacity"]');
  const backgroundOpacityRangeEl = host.querySelector('[data-theme-slider="backgroundOpacity"]');
  const panelOpacityValueEl = host.querySelector('[data-theme-value="panelOpacity"]');
  const backgroundOpacityValueEl = host.querySelector('[data-theme-value="backgroundOpacity"]');
  const colorGridEl = host.querySelector("[data-theme-colors]");

  function getEventTargetElement(event) {
    return event?.target instanceof Element ? event.target : null;
  }

  function update(settings = {}) {
    const themePreset = getThemePresetMeta(settings.themePreset);
    const panelOpacityPercent = toPanelOpacityPercent(settings.panelOpacity);
    const backgroundOpacityPercent = toBackgroundOpacityPercent(settings.backgroundOpacity);

    if (presetGridEl) {
      presetGridEl.innerHTML = renderPresetButtons(themePreset.key);
    }
    if (descriptionEl) {
      descriptionEl.textContent =
        themePreset.key === "custom"
          ? "当前为自定义主题。以下颜色统一控制宿主层 UI，不影响两个独立嵌入引擎。"
          : `${themePreset.label} · ${themePreset.description}`;
    }
    if (panelOpacityRangeEl) {
      panelOpacityRangeEl.value = String(panelOpacityPercent);
    }
    if (backgroundOpacityRangeEl) {
      backgroundOpacityRangeEl.value = String(backgroundOpacityPercent);
    }
    if (panelOpacityValueEl) {
      panelOpacityValueEl.textContent = `${panelOpacityPercent}%`;
    }
    if (backgroundOpacityValueEl) {
      backgroundOpacityValueEl.textContent = `${backgroundOpacityPercent}%`;
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
    const slider = eventTarget?.closest("[data-theme-slider]");
    if (slider) {
      event.stopPropagation();
      if (slider.dataset.themeSlider === "panelOpacity") {
        onPreviewChange({
          panelOpacity: Math.min(Math.max(Number(slider.value) / 100, 0.55), 1),
          themePreset: "custom",
        });
        return;
      }

      if (slider.dataset.themeSlider === "backgroundOpacity") {
        onPreviewChange({
          backgroundOpacity: Math.min(Math.max(Number(slider.value) / 100, 0), 1),
          themePreset: "custom",
        });
      }
      return;
    }

    const colorInput = eventTarget?.closest("[data-theme-color]");
    if (!colorInput) return;

    const key = colorInput.dataset.themeColor;
    if (!THEME_SETTING_KEYS.includes(key)) return;
    onPreviewChange({
      [key]: String(colorInput.value || "").trim(),
      themePreset: "custom",
    });
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
