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

function createCenterMarkup(snapshot) {
  const items = createGlobalTutorialEntryItems(snapshot?.config || null);
  const centerView = String(snapshot?.centerView || "root").trim().toLowerCase();
  if (centerView === "intro-later") {
    return `
      <div
        class="canvas2d-tutorial-layer global-tutorial-layer"
        data-shape-include="true"
        data-shape-padding="0"
      >
        <div class="canvas2d-tutorial-backdrop global-tutorial-backdrop" aria-hidden="true"></div>
        <div
          class="canvas2d-tutorial-center global-tutorial-center"
          role="dialog"
          aria-modal="true"
          aria-label="教程入口提示"
          data-shape-include="true"
          data-shape-padding="8"
          style="width:min(560px, calc(100vw - 48px)); padding:32px 32px 26px; border-radius:30px;"
        >
          <div class="canvas2d-tutorial-center-header" style="margin-bottom: 18px;">
            <div>
              <div style="font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(100,116,139,0.92); margin-bottom: 10px;">
                Tutorial
              </div>
              <div class="canvas2d-tutorial-center-title" style="font-size: 30px; line-height: 1.08; font-weight: 800; letter-spacing: -0.03em;">
                后续入口
              </div>
            </div>
          </div>
          <div class="canvas2d-tutorial-center-submenu canvas2d-engine-menu-section" style="display:flex; flex-direction:column; gap:14px;">
            <div
              class="canvas2d-engine-menu-item canvas2d-engine-menu-item-primary is-static"
              style="padding: 22px 22px; border-radius: 24px; background: linear-gradient(180deg, rgba(248,250,252,0.98) 0%, rgba(241,245,249,0.96) 100%); border: 1px solid rgba(148,163,184,0.18); box-shadow: inset 0 1px 0 rgba(255,255,255,0.9);"
            >
              <span style="font-size: 16px; line-height: 1.9; white-space: normal; color: rgba(51,65,85,0.92);">
                若后续需要使用教程，可随时点击画布右上角三点菜单，进入「教程中心」查看完整引导～
              </span>
            </div>
            <div class="canvas2d-engine-menu-group canvas2d-tutorial-center-submenu-group" style="margin-top: 2px;">
              <button
                type="button"
                class="canvas2d-engine-menu-item canvas2d-engine-menu-item-primary"
                data-global-tutorial-later-confirm
                style="min-height: 60px; border-radius: 20px; font-size: 18px; font-weight: 700; justify-content: center; background: rgba(15,23,42,0.92); color: #f8fafc;"
              >
                <span>我知道了</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  if (centerView === "intro") {
    return `
      <div
        class="canvas2d-tutorial-layer global-tutorial-layer"
        data-shape-include="true"
        data-shape-padding="0"
      >
        <div class="canvas2d-tutorial-backdrop global-tutorial-backdrop" aria-hidden="true"></div>
        <div
          class="canvas2d-tutorial-center global-tutorial-center"
          role="dialog"
          aria-modal="true"
          aria-label="欢迎使用 FreeFlow"
          data-shape-include="true"
          data-shape-padding="8"
          style="width:min(620px, calc(100vw - 48px)); padding:34px 34px 28px; border-radius:32px;"
        >
          <div class="canvas2d-tutorial-center-header" style="margin-bottom: 22px;">
            <div>
              <div style="font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(100,116,139,0.92); margin-bottom: 10px;">
                Welcome
              </div>
              <div class="canvas2d-tutorial-center-title" style="font-size: 40px; line-height: 1.04; font-weight: 800; letter-spacing: -0.035em;">
                欢迎使用 FreeFlow
              </div>
              <div class="canvas2d-tutorial-center-subtitle" style="margin-top: 10px; font-size: 16px; line-height: 1.8; color: rgba(71,85,105,0.92);">
                随时点击画布内右上角三点菜单，再次进入「教程中心」～
              </div>
            </div>
          </div>
          <div class="canvas2d-tutorial-center-submenu canvas2d-engine-menu-section" style="display:flex; flex-direction:column; gap:14px;">
            <div class="canvas2d-engine-menu-group canvas2d-tutorial-center-submenu-group">
              <button
                type="button"
                class="canvas2d-engine-menu-item canvas2d-engine-menu-item-primary"
                data-global-tutorial-open-center
                style="min-height: 132px; border-radius: 28px; padding: 24px 28px; align-items: center; justify-content: center; text-align: center; background: linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(30,41,59,0.94) 100%); color: #f8fafc; box-shadow: 0 18px 42px rgba(15,23,42,0.16);"
              >
                <span style="font-size: 24px; font-weight: 800; line-height: 1.12; letter-spacing: -0.015em; text-align: center;">教程中心</span>
                <span class="canvas2d-engine-menu-meta" style="font-size: 14px; line-height: 1.8; white-space: normal; color: rgba(226,232,240,0.72); text-align: center; max-width: 460px; margin-top: 8px;">
                  点击后立即进入完整教程内容，查看主界面教程、画布教程、AI 镜像教程与快捷键说明。
                </span>
              </button>
            </div>
            <div class="canvas2d-engine-menu-group canvas2d-tutorial-center-submenu-group">
              <button
                type="button"
                class="canvas2d-engine-menu-item"
                data-global-tutorial-dismiss-intro
                style="min-height: 58px; border-radius: 20px; justify-content: center; font-size: 16px; font-weight: 700; background: rgba(248,250,252,0.96); color: rgba(30,41,59,0.9); border: 1px solid rgba(148,163,184,0.18);"
              >
                <span>稍后再看</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  if (centerView === "shortcut-guide") {
    return `
      <div
        class="canvas2d-tutorial-layer global-tutorial-layer"
        data-shape-include="true"
        data-shape-padding="0"
      >
        <button type="button" class="canvas2d-tutorial-backdrop global-tutorial-backdrop" aria-label="关闭教程中心"></button>
        <div
          class="canvas2d-tutorial-center global-tutorial-center"
          role="dialog"
          aria-modal="true"
          aria-label="快捷键说明"
          data-shape-include="true"
          data-shape-padding="8"
        >
          <div class="canvas2d-tutorial-center-header">
            <div>
              <div class="canvas2d-tutorial-center-title">快捷键说明</div>
            </div>
            <div class="canvas2d-tutorial-center-header-actions">
              <button type="button" class="canvas2d-tutorial-center-close" data-global-tutorial-close>关闭</button>
            </div>
          </div>
          <div class="canvas2d-tutorial-center-submenu canvas2d-engine-menu-section">
            <div class="canvas2d-engine-menu-title">快捷键速查</div>
            <div class="canvas2d-engine-menu-group canvas2d-floating-card-shortcuts">
              ${SHORTCUT_GUIDE_ITEMS.map(
                (item) => `
                  <div class="canvas2d-shortcut-row">
                    <kbd>${item.key}</kbd>
                    <span>${item.value}</span>
                  </div>
                `
              ).join("")}
            </div>
            <div class="canvas2d-engine-menu-group">
              <button type="button" class="canvas2d-engine-menu-item" data-global-tutorial-back-root>
                <span>返回教程分区</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  return `
    <div
      class="canvas2d-tutorial-layer global-tutorial-layer"
      data-shape-include="true"
      data-shape-padding="0"
    >
      <button type="button" class="canvas2d-tutorial-backdrop global-tutorial-backdrop" aria-label="关闭教程中心"></button>
      <div
        class="canvas2d-tutorial-center global-tutorial-center"
        role="dialog"
        aria-modal="true"
        aria-label="教程中心"
        data-shape-include="true"
        data-shape-padding="8"
      >
        <div class="canvas2d-tutorial-center-header">
          <div>
            <div class="canvas2d-tutorial-center-title">教程中心</div>
          </div>
          <div class="canvas2d-tutorial-center-header-actions">
            <button type="button" class="canvas2d-tutorial-center-close" data-global-tutorial-close>关闭</button>
          </div>
        </div>
        <div class="canvas2d-tutorial-center-submenu canvas2d-engine-menu-section">
          <div class="canvas2d-engine-menu-title">教程分区</div>
          <div class="canvas2d-engine-menu-group canvas2d-tutorial-center-submenu-group">
            ${items
              .map(
                (item) => `
                  <button
                    type="button"
                    class="canvas2d-engine-menu-item canvas2d-engine-menu-item-primary"
                    data-global-tutorial-action="${item.id}"
                  >
                    <span>${item.label}</span>
                    <span class="canvas2d-engine-menu-meta">${item.description}</span>
                  </button>
                `
              )
              .join("")}
          </div>
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
            <div class="canvas2d-tutorial-overlay-step-meta">
              第 ${snapshot?.currentStepNumber || 0} / ${snapshot?.totalSteps || 0} 步
            </div>
            <div class="canvas2d-tutorial-overlay-title">${snapshot?.currentStep?.title || "教程步骤"}</div>
          </div>
          <button type="button" class="canvas2d-tutorial-overlay-close" data-global-tutorial-close>关闭</button>
        </div>
        <div class="canvas2d-tutorial-overlay-body">
          <div class="canvas2d-tutorial-overlay-chapter">${snapshot?.currentChapter?.title || "教程步骤"}</div>
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
