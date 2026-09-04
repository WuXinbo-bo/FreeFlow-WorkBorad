import { dispatchTutorialUiEvent, subscribeTutorialUiEvent } from "../../tutorial-core/tutorialEventBus.js";
import { TUTORIAL_EVENT_TYPES, TUTORIAL_IDS } from "../../tutorial-core/tutorialTypes.js";
import { createGlobalTutorialEntryItems } from "./globalTutorialEntry.js";
import { createGlobalTutorialRuntime } from "./globalTutorialRuntime.js";

const TUTORIAL_FLOATING_OBSTACLE_SELECTORS = Object.freeze([
  "#insight-drawer.is-open",
  "#conversation-shell-menu:not(.is-hidden)",
  ".screen-source-header-panel:not(.is-hidden)",
]);

const SHORTCUT_GUIDE_ITEMS = Object.freeze([
  { key: "V", value: "框选工具" },
  { key: "R", value: "矩形" },
  { key: "E", value: "椭圆" },
  { key: "A", value: "箭头" },
  { key: "L", value: "直线" },
  { key: "H", value: "高亮" },
  { key: "T", value: "文本工具" },
  { key: "F", value: "添加文件" },
  { key: "I", value: "添加图片" },
  { key: "N", value: "添加节点" },
  { key: "P", value: "画布截图" },
  { key: "Ctrl/Cmd + Wheel", value: "缩放画布" },
  { key: "Ctrl/Cmd + Z", value: "撤销" },
  { key: "Ctrl/Cmd + Y", value: "重做" },
  { key: "Ctrl/Cmd + C", value: "复制所选" },
  { key: "Ctrl/Cmd + X", value: "剪切所选" },
  { key: "Ctrl/Cmd + V", value: "粘贴" },
  { key: "Ctrl/Cmd + S", value: "保存画布" },
  { key: "Ctrl/Cmd + L", value: "锁定/解锁" },
  { key: "Del", value: "删除所选" },
  { key: "Arrow Keys", value: "微调移动 (Shift 加速)" },
  { key: "Enter", value: "进入文本/节点编辑" },
  { key: "Esc", value: "退出编辑/取消操作" },
]);

function ensureHostElement(overlayRoot) {
  if (!(overlayRoot instanceof HTMLElement)) {
    return null;
  }
  let host = overlayRoot.querySelector("#global-tutorial-host");
  if (!(host instanceof HTMLElement)) {
    host = document.createElement("div");
    host.id = "global-tutorial-host";
    host.className = "global-tutorial-host";
    overlayRoot.appendChild(host);
  }
  // The host is a full-viewport container. Only visible child panels should participate
  // in desktop window shape; keeping the host marked would make the whole transparent
  // window non-click-through.
  host.removeAttribute("data-shape-include");
  host.removeAttribute("data-shape-padding");
  host.removeAttribute("data-shape-exclude");
  return host;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function rectContainsPoint(rect, x, y) {
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}

function rectsOverlap(a, b) {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}

function getRectArea(rect) {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function getRelativeRect(element, layerRect, padding = 0) {
  if (!(element instanceof HTMLElement)) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  const safePadding = Math.max(0, Number(padding) || 0);
  return {
    left: rect.left - layerRect.left - safePadding,
    top: rect.top - layerRect.top - safePadding,
    width: rect.width + safePadding * 2,
    height: rect.height + safePadding * 2,
  };
}

function resolveTargetRect(layerRect, snapshot) {
  const targetId = String(snapshot?.currentStep?.targetId || "").trim();
  const target = targetId ? snapshot?.config?.targets?.[targetId] : null;
  const selector = String(target?.selector || "").trim();
  if (!selector) {
    return null;
  }
  const targetNode = document.querySelector(selector);
  if (!(targetNode instanceof HTMLElement)) {
    return null;
  }
  return getRelativeRect(targetNode, layerRect, target?.padding || 0);
}

function collectFloatingObstacleRects(layerRect, host) {
  const rects = [];
  for (const selector of TUTORIAL_FLOATING_OBSTACLE_SELECTORS) {
    document.querySelectorAll(selector).forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      if (host?.contains(node)) {
        return;
      }
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") <= 0) {
        return;
      }
      const rect = getRelativeRect(node, layerRect, 12);
      if (rect) {
        rects.push(rect);
      }
    });
  }
  return rects;
}

function resolveAnchorRect(targetRect, obstacleRects = []) {
  if (!targetRect) {
    return null;
  }
  const centerX = targetRect.left + targetRect.width / 2;
  const centerY = targetRect.top + targetRect.height / 2;
  const containingRect = obstacleRects
    .filter((rect) => rectContainsPoint(rect, centerX, centerY))
    .sort((a, b) => getRectArea(a) - getRectArea(b))[0];
  return containingRect || targetRect;
}

function buildPanelCandidate(anchorRect, panelWidth, panelHeight, placement, layerRect) {
  const margin = 20;
  if (!anchorRect || placement === "center") {
    return {
      left: Math.round((layerRect.width - panelWidth) / 2),
      top: Math.round(Math.max(margin, layerRect.height * 0.58)),
      width: panelWidth,
    };
  }
  let left = anchorRect.left;
  let top = anchorRect.top + anchorRect.height + margin;
  if (placement === "right") {
    left = anchorRect.left + anchorRect.width + margin;
    top = anchorRect.top;
  } else if (placement === "left") {
    left = anchorRect.left - panelWidth - margin;
    top = anchorRect.top;
  } else if (placement === "top") {
    left = anchorRect.left;
    top = anchorRect.top - panelHeight - margin;
  }
  return {
    left: Math.round(clamp(left, margin, Math.max(margin, layerRect.width - panelWidth - margin))),
    top: Math.round(clamp(top, margin, Math.max(margin, layerRect.height - panelHeight - margin))),
    width: panelWidth,
  };
}

function scorePanelCandidate(candidateRect, obstacleRects, targetRect, layerRect) {
  let overlapPenalty = 0;
  for (const rect of obstacleRects) {
    if (rectsOverlap(candidateRect, rect)) {
      overlapPenalty += 100000 + Math.min(candidateRect.width, rect.width) * Math.min(candidateRect.height, rect.height);
    }
  }
  if (targetRect && rectsOverlap(candidateRect, targetRect)) {
    overlapPenalty += 80000;
  }
  const viewportPenalty =
    Math.max(0, 20 - candidateRect.left) +
    Math.max(0, 20 - candidateRect.top) +
    Math.max(0, candidateRect.left + candidateRect.width - (layerRect.width - 20)) +
    Math.max(0, candidateRect.top + candidateRect.height - (layerRect.height - 20));
  return overlapPenalty + viewportPenalty;
}

function resolvePanelStyle(layerRect, targetRect, placement = "bottom", panelSize = null, obstacleRects = []) {
  const panelWidth = Math.min(380, Math.max(320, layerRect.width * 0.28));
  const panelHeight = Math.max(220, Number(panelSize?.height) || 240);
  const anchorRect = resolveAnchorRect(targetRect, obstacleRects);
  const preferred = String(placement || "bottom").trim().toLowerCase();
  const candidatePlacements = preferred === "center"
    ? ["center", "bottom", "right", "left", "top"]
    : [preferred, "right", "left", "bottom", "top", "center"].filter((value, index, array) => array.indexOf(value) === index);
  let best = null;

  for (const candidatePlacement of candidatePlacements) {
    const style = buildPanelCandidate(anchorRect, panelWidth, panelHeight, candidatePlacement, layerRect);
    const rect = {
      left: style.left,
      top: style.top,
      width: panelWidth,
      height: panelHeight,
    };
    const score = scorePanelCandidate(rect, obstacleRects, targetRect, layerRect);
    if (!best || score < best.score) {
      best = { style, score };
    }
    if (score === 0) {
      break;
    }
  }

  return best?.style || buildPanelCandidate(anchorRect, panelWidth, panelHeight, preferred, layerRect);
}

const TUTORIAL_ICON_PATHS = Object.freeze({
  layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M9 9h12"/>',
  canvas: '<path d="M4 19.5V7.8L8.2 3h8.9L20 5.9v13.6H4Z"/><path d="M8 3v5h5M8 14h8M8 17h5"/>',
  screen: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M8 9h8M8 12h5"/>',
  keyboard: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M6 9h.01M9 9h.01M12 9h.01M15 9h.01M18 9h.01M7 13h10"/>',
  play: '<path d="m9 7 8 5-8 5V7Z"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16ZM20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderTutorialIcon(name, className = "") {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${TUTORIAL_ICON_PATHS[name] || TUTORIAL_ICON_PATHS.book}</svg>`;
}

function renderCloseButton(attribute) {
  return `<button type="button" class="canvas2d-tutorial-center-close is-icon" ${attribute} aria-label="关闭" title="关闭">${renderTutorialIcon("close")}</button>`;
}

function renderTutorialCard(item) {
  const stepCount = Math.max(0, Number(item.stepCount) || 0);
  const completedSteps = Math.min(stepCount, Math.max(0, Number(item.completedSteps) || 0));
  return `
    <button type="button" class="tutorial-center-card" data-global-tutorial-action="${escapeHtml(item.id)}">
      <span class="tutorial-center-card-head">
        <span class="tutorial-center-card-icon">${renderTutorialIcon(item.icon)}</span>
        <span class="tutorial-center-card-meta">${escapeHtml(item.category || "教程")} · ${stepCount} 步</span>
        ${renderTutorialIcon("arrow", "tutorial-center-card-arrow")}
      </span>
      <strong>${escapeHtml(item.label)}</strong>
      <small>${escapeHtml(item.description)}</small>
      <progress value="${completedSteps}" max="${Math.max(1, stepCount)}" aria-label="${escapeHtml(item.label)}进度"></progress>
    </button>
  `;
}

function createCenterMarkup(snapshot) {
  const items = createGlobalTutorialEntryItems(snapshot);
  const centerView = String(snapshot?.centerView || "root").trim().toLowerCase();
  if (centerView === "intro-later") {
    return `
      <div class="canvas2d-tutorial-layer global-tutorial-layer" data-shape-include="true" data-shape-padding="0">
        <div class="canvas2d-tutorial-backdrop global-tutorial-backdrop" aria-hidden="true"></div>
        <div class="canvas2d-tutorial-center global-tutorial-center is-intro-later" role="dialog" aria-modal="true" aria-label="教程入口提示" data-shape-include="true" data-shape-padding="8">
          <span class="tutorial-later-icon">${renderTutorialIcon("book")}</span>
          <div class="tutorial-later-copy">
            <span class="tutorial-eyebrow">使用说明</span>
            <h2>以后也能随时回来</h2>
            <p>打开画布右上角菜单，选择“画布教程”即可继续学习。</p>
          </div>
          <button type="button" class="canvas2d-tutorial-overlay-btn is-primary" data-global-tutorial-later-confirm>知道了</button>
        </div>
      </div>
    `;
  }
  if (centerView === "intro") {
    return `
      <div class="canvas2d-tutorial-layer global-tutorial-layer" data-shape-include="true" data-shape-padding="0">
        <div class="canvas2d-tutorial-backdrop global-tutorial-backdrop" aria-hidden="true"></div>
        <div class="canvas2d-tutorial-center global-tutorial-center is-intro" role="dialog" aria-modal="true" aria-label="欢迎使用 FreeFlow" data-shape-include="true" data-shape-padding="8">
          <div class="tutorial-intro-brand">
            <img class="tutorial-intro-logo" src="./assets/brand/FreeFlow_app_icon.png" alt="" />
            <span><strong>FreeFlow</strong><small>Air Canvas</small></span>
          </div>
          <div class="tutorial-intro-copy">
            <span class="tutorial-eyebrow">快速了解</span>
            <h2>欢迎使用 FreeFlow</h2>
            <p>在左侧组织想法，在右侧与 AI 协作，让内容始终留在同一个工作空间。</p>
          </div>
          <div class="tutorial-workflow" aria-label="FreeFlow 工作流示意">
            <section class="tutorial-workflow-panel is-canvas">
              <header><span>${renderTutorialIcon("canvas")}</span><strong>画布</strong></header>
              <div class="tutorial-workflow-canvas"><i></i><i></i><i></i><b></b></div>
            </section>
            <span class="tutorial-workflow-link">${renderTutorialIcon("arrow")}</span>
            <section class="tutorial-workflow-panel is-assistant">
              <header><span>${renderTutorialIcon("screen")}</span><strong>AI 工作台</strong></header>
              <div class="tutorial-workflow-chat"><i></i><i></i><b></b></div>
            </section>
          </div>
          <div class="tutorial-intro-steps">
            <div class="tutorial-intro-step"><span>01</span><strong>创建内容</strong><small>文字、文件与节点</small></div>
            <div class="tutorial-intro-step"><span>02</span><strong>组织画布</strong><small>排布、连接与聚焦</small></div>
            <div class="tutorial-intro-step"><span>03</span><strong>交给 AI</strong><small>基于当前工作区协作</small></div>
          </div>
          <div class="tutorial-intro-actions">
            <button type="button" class="canvas2d-tutorial-overlay-btn is-primary" data-global-tutorial-open-center>${renderTutorialIcon("play")}<span>开始快速了解</span></button>
            <button type="button" class="canvas2d-tutorial-overlay-btn is-secondary" data-global-tutorial-dismiss-intro>稍后再看</button>
          </div>
        </div>
      </div>
    `;
  }
  if (centerView === "shortcut-guide") {
    return `
      <div class="canvas2d-tutorial-layer global-tutorial-layer" data-shape-include="true" data-shape-padding="0">
        <button type="button" class="canvas2d-tutorial-backdrop global-tutorial-backdrop" aria-label="关闭教程中心"></button>
        <div class="canvas2d-tutorial-center global-tutorial-center is-shortcuts" role="dialog" aria-modal="true" aria-label="快捷键说明" data-shape-include="true" data-shape-padding="8">
          <div class="canvas2d-tutorial-center-header">
            <div><span class="tutorial-eyebrow">效率工具</span><div class="canvas2d-tutorial-center-title">快捷键速查</div></div>
            <div class="canvas2d-tutorial-center-header-actions">${renderCloseButton("data-global-tutorial-close")}</div>
          </div>
          <div class="tutorial-shortcut-grid">
            ${SHORTCUT_GUIDE_ITEMS.map((item) => `<div class="canvas2d-shortcut-row"><kbd>${escapeHtml(item.key)}</kbd><span>${escapeHtml(item.value)}</span></div>`).join("")}
          </div>
          <button type="button" class="tutorial-text-action" data-global-tutorial-back-root>${renderTutorialIcon("back")}<span>返回教程中心</span></button>
        </div>
      </div>
    `;
  }
  const hasProgress = Boolean(snapshot?.lastStartedAt && !snapshot?.completed && snapshot?.currentStep);
  return `
    <div class="canvas2d-tutorial-layer global-tutorial-layer" data-shape-include="true" data-shape-padding="0">
      <button type="button" class="canvas2d-tutorial-backdrop global-tutorial-backdrop" aria-label="关闭教程中心"></button>
      <div class="canvas2d-tutorial-center global-tutorial-center is-directory" role="dialog" aria-modal="true" aria-label="教程中心" data-shape-include="true" data-shape-padding="8">
        <div class="canvas2d-tutorial-center-header">
          <div><span class="tutorial-eyebrow">学习中心</span><div class="canvas2d-tutorial-center-title">选择一条学习路径</div><div class="canvas2d-tutorial-center-subtitle">每个教程都可以随时退出，进度会自动保留。</div></div>
          <div class="canvas2d-tutorial-center-header-actions">${renderCloseButton("data-global-tutorial-close")}</div>
        </div>
        ${hasProgress ? `<button type="button" class="tutorial-resume-bar" data-global-tutorial-action="resume">${renderTutorialIcon("play")}<span><strong>继续上次进度</strong><small>${escapeHtml(snapshot?.currentStep?.title || "继续教程")}</small></span>${renderTutorialIcon("arrow")}</button>` : ""}
        <div class="tutorial-center-grid">${items.map(renderTutorialCard).join("")}</div>
        <div class="tutorial-center-tools">
          <button type="button" data-global-tutorial-open-board>${renderTutorialIcon("canvas")}<span><strong>打开示例画布</strong><small>在独立示例中自由练习</small></span></button>
          <button type="button" data-global-tutorial-action="shortcut-guide">${renderTutorialIcon("keyboard")}<span><strong>快捷键说明</strong><small>快速查看常用操作</small></span></button>
        </div>
      </div>
    </div>
  `;
}

function createOverlayMarkup(snapshot) {
  return `
    <div
      class="canvas2d-tutorial-layer global-tutorial-layer"
      data-global-tutorial-overlay
      data-shape-include="true"
      data-shape-padding="0"
    >
      <button type="button" class="canvas2d-tutorial-backdrop global-tutorial-backdrop" aria-label="关闭教程"></button>
      <div class="canvas2d-tutorial-highlight global-tutorial-highlight is-hidden" data-global-tutorial-highlight></div>
      <div
        class="canvas2d-tutorial-overlay-panel global-tutorial-overlay-panel"
        role="dialog"
        aria-modal="true"
        aria-label="教程步骤"
        data-global-tutorial-panel
        data-shape-include="true"
        data-shape-padding="8"
      >
        <div class="canvas2d-tutorial-overlay-header">
          <div>
            <div class="canvas2d-tutorial-overlay-chapter">${escapeHtml(snapshot?.currentChapter?.title || "教程步骤")}</div>
            <div class="canvas2d-tutorial-overlay-title">${snapshot?.currentStep?.title || "教程步骤"}</div>
          </div>
          ${renderCloseButton("data-global-tutorial-close")}
        </div>
        <div class="tutorial-step-progress"><progress value="${snapshot?.currentStepNumber || 0}" max="${Math.max(1, snapshot?.totalSteps || 0)}"></progress><span>${snapshot?.currentStepNumber || 0} / ${snapshot?.totalSteps || 0}</span></div>
        <div class="canvas2d-tutorial-overlay-body">
          <div class="canvas2d-tutorial-overlay-description">
            ${snapshot?.currentStep?.description || "教程步骤说明"}
          </div>
        </div>
        <div class="canvas2d-tutorial-overlay-actions">
          <button type="button" class="canvas2d-tutorial-overlay-btn" data-global-tutorial-prev ${snapshot?.hasPreviousStep ? "" : "disabled"}>
            上一步
          </button>
          <div class="canvas2d-tutorial-overlay-actions-right">
            ${snapshot?.currentStep?.skippable !== false ? '<button type="button" class="canvas2d-tutorial-overlay-btn is-secondary" data-global-tutorial-skip>跳过</button>' : ""}
            <button type="button" class="canvas2d-tutorial-overlay-btn is-primary" data-global-tutorial-next>
              ${snapshot?.hasNextStep ? "下一步" : "完成教程"}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function mountGlobalTutorialHost({
  overlayRoot,
  onShapeChange,
  onFinalShapeChange,
  onIntroDismiss,
  onIntroDismissVersion,
} = {}) {
  const host = ensureHostElement(overlayRoot);
  const runtime = createGlobalTutorialRuntime();
  const requestShapeSync = typeof onShapeChange === "function" ? onShapeChange : () => {};
  const requestFinalShapeSync = typeof onFinalShapeChange === "function" ? onFinalShapeChange : () => {};
  let unsubscribeBus = () => {};
  let unsubscribeStore = () => {};
  let measureFrame = 0;

  function stopMeasureLoop() {
    if (measureFrame) {
      window.cancelAnimationFrame(measureFrame);
      measureFrame = 0;
    }
  }

  function closeTutorial() {
    stopMeasureLoop();
    void runtime.closeTutorial();
  }

  function closeCenter() {
    runtime.closeCenter();
  }

  function dismissIntroForCurrentVersion() {
    if (typeof onIntroDismissVersion === "function") {
      onIntroDismissVersion();
      return;
    }
    onIntroDismiss?.();
  }

  function openIntro() {
    runtime.setCenterView("intro");
  }

  function startMeasureLoop() {
    stopMeasureLoop();
    const tick = () => {
      measureFrame = 0;
      updateOverlayPosition();
      if (runtime.getSnapshot().overlayOpen) {
        measureFrame = window.requestAnimationFrame(tick);
      }
    };
    measureFrame = window.requestAnimationFrame(tick);
  }

  function updateOverlayPosition() {
    if (!(host instanceof HTMLElement)) {
      return;
    }
    const snapshot = runtime.getSnapshot();
    if (!snapshot.overlayOpen) {
      return;
    }
    const layer = host.querySelector("[data-global-tutorial-overlay]");
    const highlight = host.querySelector("[data-global-tutorial-highlight]");
    const panel = host.querySelector("[data-global-tutorial-panel]");
    if (!(layer instanceof HTMLElement) || !(highlight instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
      return;
    }
    const layerRect = layer.getBoundingClientRect();
    const targetRect = resolveTargetRect(layerRect, snapshot);
    if (targetRect) {
      highlight.classList.remove("is-hidden");
      highlight.style.left = `${Math.round(targetRect.left)}px`;
      highlight.style.top = `${Math.round(targetRect.top)}px`;
      highlight.style.width = `${Math.round(targetRect.width)}px`;
      highlight.style.height = `${Math.round(targetRect.height)}px`;
    } else {
      highlight.classList.add("is-hidden");
      highlight.style.removeProperty("left");
      highlight.style.removeProperty("top");
      highlight.style.removeProperty("width");
      highlight.style.removeProperty("height");
    }
    panel.style.width = `${Math.min(380, Math.max(320, layerRect.width * 0.28))}px`;
    panel.style.left = "20px";
    panel.style.top = "20px";
    panel.style.transform = "none";
    const obstacleRects = collectFloatingObstacleRects(layerRect, host);
    const panelRect = panel.getBoundingClientRect();
    const panelStyle = resolvePanelStyle(
      layerRect,
      targetRect,
      snapshot?.currentStep?.placement || "bottom",
      { width: panelRect.width, height: panelRect.height },
      obstacleRects
    );
    panel.style.left = `${panelStyle.left}px`;
    panel.style.top = `${panelStyle.top}px`;
    panel.style.width = `${panelStyle.width}px`;
    panel.style.transform = "none";
    requestShapeSync();
  }

  function startTutorial(tutorialId) {
    if (tutorialId === TUTORIAL_IDS.CANVAS) {
      closeCenter();
      dispatchTutorialUiEvent({
        type: TUTORIAL_EVENT_TYPES.START_CANVAS_TUTORIAL,
        tutorialId: TUTORIAL_IDS.CANVAS,
      });
      return;
    }
    if (tutorialId === TUTORIAL_IDS.MAIN_SHELL) {
      runtime.startMainShellTutorial();
      startMeasureLoop();
      return;
    }
    if (tutorialId === TUTORIAL_IDS.AI_MIRROR) {
      runtime.startAiMirrorTutorial();
      startMeasureLoop();
    }
  }

  function handleAction(actionId) {
    const action = String(actionId || "").trim().toLowerCase();
    if (!action) {
      return;
    }
    if (action === "shortcut-guide") {
      runtime.setCenterView("shortcut-guide");
      return;
    }
    if (action === "resume") {
      runtime.resumeTutorial();
      startMeasureLoop();
      return;
    }
    startTutorial(action);
  }

  function bindInteractions(snapshot) {
    if (!(host instanceof HTMLElement)) {
      return;
    }
    host.querySelectorAll("[data-global-tutorial-close]").forEach((button) => {
      button.addEventListener("click", () => {
        if (snapshot.centerOpen) {
          const centerView = String(snapshot?.centerView || "").trim().toLowerCase();
          if (centerView === "intro" || centerView === "intro-later") {
            dismissIntroForCurrentVersion();
          }
          closeCenter();
          return;
        }
        closeTutorial();
      });
    });
    host.querySelector(".global-tutorial-backdrop")?.addEventListener("click", () => {
      const centerView = String(snapshot?.centerView || "").trim().toLowerCase();
      if (centerView === "intro" || centerView === "intro-later") {
        return;
      }
      if (snapshot.centerOpen) {
        closeCenter();
        return;
      }
      closeTutorial();
    });
    host.querySelectorAll("[data-global-tutorial-action]").forEach((button) => {
      button.addEventListener("click", () => handleAction(button.getAttribute("data-global-tutorial-action")));
    });
    host.querySelector("[data-global-tutorial-open-center]")?.addEventListener("click", () => {
      const centerView = String(snapshot?.centerView || "").trim().toLowerCase();
      if (centerView === "intro" || centerView === "intro-later") {
        dismissIntroForCurrentVersion();
      }
      runtime.setCenterView("root");
    });
    host.querySelector("[data-global-tutorial-dismiss-intro]")?.addEventListener("click", () => {
      runtime.setCenterView("intro-later");
    });
    host.querySelector("[data-global-tutorial-later-confirm]")?.addEventListener("click", () => {
      dismissIntroForCurrentVersion();
      closeCenter();
    });
    host.querySelector("[data-global-tutorial-open-board]")?.addEventListener("click", () => {
      closeCenter();
      dispatchTutorialUiEvent({
        type: TUTORIAL_EVENT_TYPES.START_CANVAS_TUTORIAL,
        action: "open-board",
      });
    });
    host.querySelector("[data-global-tutorial-back-root]")?.addEventListener("click", () => runtime.setCenterView("root"));
    host.querySelector("[data-global-tutorial-prev]")?.addEventListener("click", () => runtime.goToPreviousStep());
    host.querySelector("[data-global-tutorial-next]")?.addEventListener("click", () => {
      void runtime.goToNextStep();
    });
    host.querySelector("[data-global-tutorial-skip]")?.addEventListener("click", () => {
      void runtime.skipCurrentStep();
    });
  }

  function render() {
    if (!(host instanceof HTMLElement)) {
      return;
    }
    const snapshot = runtime.getSnapshot();
    host.innerHTML = snapshot.centerOpen
      ? createCenterMarkup(snapshot)
      : snapshot.overlayOpen
        ? createOverlayMarkup(snapshot)
        : "";
    if (!snapshot.centerOpen && !snapshot.overlayOpen) {
      stopMeasureLoop();
      requestShapeSync();
      return;
    }
    bindInteractions(snapshot);
    if (snapshot.overlayOpen) {
      updateOverlayPosition();
      startMeasureLoop();
    }
    requestShapeSync();
    requestFinalShapeSync();
  }

  if (host) {
    unsubscribeStore = runtime.subscribe(() => render());
    unsubscribeBus = subscribeTutorialUiEvent((detail) => {
      if (detail?.type === TUTORIAL_EVENT_TYPES.OPEN_GLOBAL_TUTORIAL_INTRO) {
        openIntro();
        return;
      }
      if (detail?.type === TUTORIAL_EVENT_TYPES.OPEN_GLOBAL_TUTORIAL_CENTER) {
        runtime.openCenter();
        return;
      }
      if (detail?.type === TUTORIAL_EVENT_TYPES.START_GLOBAL_TUTORIAL) {
        startTutorial(detail.tutorialId);
        return;
      }
      runtime.reportUiEvent(detail);
    });
    render();
  }

  return {
    runtime,
    openIntro,
    openCenter() {
      runtime.openCenter();
    },
    destroy() {
      stopMeasureLoop();
      unsubscribeBus();
      unsubscribeStore();
      if (host) {
        host.innerHTML = "";
      }
    },
  };
}
