import React, { useEffect, useMemo, useRef, useState } from "react";
import { createTutorialEntryItems } from "./tutorialEntry.js";
import { TUTORIAL_ENTRY_ACTIONS } from "./tutorialConfig.js";

function TutorialIcon({ type = "book" }) {
  const paths = {
    layout: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M9 9h12" /></>,
    canvas: <><path d="M4 19.5V7.8L8.2 3h8.9L20 5.9v13.6H4Z" /><path d="M8 3v5h5M8 14h8M8 17h5" /></>,
    screen: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4M8 9h8M8 12h5" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    back: <path d="m15 18-6-6 6-6" />,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    book: <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16ZM20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z" />,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{paths[type] || paths.book}</svg>;
}

function TutorialCenter({ snapshot, onAction, onClose, entryItemsFactory = createTutorialEntryItems }) {
  const items = entryItemsFactory(snapshot);
  const inStartMenu = String(snapshot?.centerView || "").trim() === "start-menu";
  const iconTypes = ["layout", "canvas", "screen"];
  return (
    <div className="canvas2d-tutorial-center is-canvas-directory" role="dialog" aria-modal="true" aria-label="画布教程中心">
      <div className="canvas2d-tutorial-center-header">
        <div>
          <span className="tutorial-eyebrow">画布学习</span>
          <div className="canvas2d-tutorial-center-title">{inStartMenu ? "选择一条学习路径" : "画布教程"}</div>
          <div className="canvas2d-tutorial-center-subtitle">
            {inStartMenu ? "按需要进入独立教程，退出时会保留进度。" : "从基础操作开始，逐步掌握画布。"}
          </div>
        </div>
        <div className="canvas2d-tutorial-center-header-actions">
          {inStartMenu ? (
            <button
              type="button"
              className="tutorial-text-action"
              onClick={() => onAction?.(TUTORIAL_ENTRY_ACTIONS.BACK_TO_ROOT)}
            >
              <TutorialIcon type="back" />
              <span>返回</span>
            </button>
          ) : null}
          <button type="button" className="canvas2d-tutorial-center-close is-icon" aria-label="关闭" title="关闭" onClick={() => onClose?.()}>
            <TutorialIcon type="close" />
          </button>
        </div>
      </div>
      {inStartMenu ? (
        <div className="tutorial-center-grid">
            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className="tutorial-center-card"
                disabled={item.disabled}
                onClick={() => onAction?.(item.id)}
              >
                <span className="tutorial-center-card-head"><span className="tutorial-center-card-icon"><TutorialIcon type={iconTypes[index]} /></span><TutorialIcon type="arrow" /></span>
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </button>
            ))}
        </div>
      ) : (
        <div className="canvas2d-tutorial-center-actions">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="canvas2d-tutorial-center-action"
              disabled={item.disabled}
              onClick={() => onAction?.(item.id)}
            >
              <span>{item.label}</span>
              <span className="canvas2d-tutorial-center-meta">{item.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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
  const rect = targetNode.getBoundingClientRect();
  const padding = Math.max(0, Number(target?.padding || 0));
  return {
    left: rect.left - layerRect.left - padding,
    top: rect.top - layerRect.top - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function resolvePanelStyle(layerRect, targetRect, placement = "bottom") {
  const panelWidth = Math.min(380, Math.max(320, layerRect.width * 0.28));
  const margin = 20;
  if (!targetRect || placement === "center") {
    return {
      left: Math.round((layerRect.width - panelWidth) / 2),
      top: Math.round(Math.max(margin, layerRect.height * 0.58)),
      width: panelWidth,
    };
  }
  let left = targetRect.left;
  let top = targetRect.top + targetRect.height + margin;
  if (placement === "right") {
    left = targetRect.left + targetRect.width + margin;
    top = targetRect.top;
  } else if (placement === "left") {
    left = targetRect.left - panelWidth - margin;
    top = targetRect.top;
  } else if (placement === "top") {
    left = targetRect.left;
    top = targetRect.top - 220;
  }
  return {
    left: Math.round(clamp(left, margin, Math.max(margin, layerRect.width - panelWidth - margin))),
    top: Math.round(clamp(top, margin, Math.max(margin, layerRect.height - 240))),
    width: panelWidth,
  };
}

function TutorialStage({ rootRef, snapshot, onClose, onNext, onPrevious, onSkip }) {
  const [targetRect, setTargetRect] = useState(null);

  useEffect(() => {
    if (!(rootRef.current instanceof HTMLElement)) {
      return undefined;
    }
    let frame = 0;
    const measure = () => {
      if (!(rootRef.current instanceof HTMLElement)) {
        return;
      }
      const layerRect = rootRef.current.getBoundingClientRect();
      const nextRect = resolveTargetRect(layerRect, snapshot);
      setTargetRect((current) => {
        if (
          current &&
          nextRect &&
          current.left === nextRect.left &&
          current.top === nextRect.top &&
          current.width === nextRect.width &&
          current.height === nextRect.height
        ) {
          return current;
        }
        if (!current && !nextRect) {
          return current;
        }
        return nextRect;
      });
      frame = window.requestAnimationFrame(measure);
    };
    measure();
    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [rootRef, snapshot]);

  const panelStyle = useMemo(() => {
    if (!(rootRef.current instanceof HTMLElement)) {
      return null;
    }
    const layerRect = rootRef.current.getBoundingClientRect();
    return resolvePanelStyle(layerRect, targetRect, snapshot?.currentStep?.placement || "bottom");
  }, [rootRef, snapshot, targetRect]);

  return (
    <>
      {targetRect ? (
        <div
          className="canvas2d-tutorial-highlight"
          style={{
            left: `${Math.round(targetRect.left)}px`,
            top: `${Math.round(targetRect.top)}px`,
            width: `${Math.round(targetRect.width)}px`,
            height: `${Math.round(targetRect.height)}px`,
          }}
        />
      ) : null}
      <div
        className="canvas2d-tutorial-overlay-panel"
        role="dialog"
        aria-modal="true"
        aria-label="画布教程"
        style={
          panelStyle
            ? {
                left: `${panelStyle.left}px`,
                top: `${panelStyle.top}px`,
                width: `${panelStyle.width}px`,
                transform: "none",
              }
            : undefined
        }
      >
        <div className="canvas2d-tutorial-overlay-header">
          <div>
            <div className="canvas2d-tutorial-overlay-chapter">{snapshot?.currentChapter?.title || "教程步骤"}</div>
            <div className="canvas2d-tutorial-overlay-title">{snapshot?.currentStep?.title || "画布教程"}</div>
          </div>
          <button type="button" className="canvas2d-tutorial-overlay-close is-icon" aria-label="关闭" title="关闭" onClick={() => onClose?.()}>
            <TutorialIcon type="close" />
          </button>
        </div>
        <div className="tutorial-step-progress">
          <progress value={snapshot?.currentStepNumber || 0} max={Math.max(1, snapshot?.totalSteps || 0)} />
          <span>{snapshot?.currentStepNumber || 0} / {snapshot?.totalSteps || 0}</span>
        </div>
        <div className="canvas2d-tutorial-overlay-body">
          <div className="canvas2d-tutorial-overlay-description">
            {snapshot?.currentStep?.description || "教程流程骨架已接入，后续任务包会逐步填充具体步骤与判定。"}
          </div>
        </div>
        <div className="canvas2d-tutorial-overlay-actions">
          <button
            type="button"
            className="canvas2d-tutorial-overlay-btn"
            disabled={!snapshot?.hasPreviousStep}
            onClick={() => onPrevious?.()}
          >
            上一步
          </button>
          <div className="canvas2d-tutorial-overlay-actions-right">
            {snapshot?.currentStep?.skippable !== false ? (
              <button type="button" className="canvas2d-tutorial-overlay-btn is-secondary" onClick={() => onSkip?.()}>
                跳过
              </button>
            ) : null}
            <button type="button" className="canvas2d-tutorial-overlay-btn is-primary" onClick={() => onNext?.()}>
              {snapshot?.hasNextStep ? "下一步" : "完成教程"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function TutorialOverlay({
  snapshot,
  onAction,
  onClose,
  onNext,
  onPrevious,
  onSkip,
  entryItemsFactory = createTutorialEntryItems,
}) {
  const rootRef = useRef(null);
  if (!snapshot?.centerOpen && !snapshot?.overlayOpen) {
    return null;
  }
  return (
    <div ref={rootRef} className="canvas2d-tutorial-layer">
      <button type="button" className="canvas2d-tutorial-backdrop" aria-label="关闭教程" onClick={() => onClose?.()} />
      {snapshot?.centerOpen ? (
        <TutorialCenter
          snapshot={snapshot}
          onAction={onAction}
          onClose={onClose}
          entryItemsFactory={entryItemsFactory}
        />
      ) : null}
      {snapshot?.overlayOpen ? (
        <TutorialStage
          rootRef={rootRef}
          snapshot={snapshot}
          onClose={onClose}
          onNext={onNext}
          onPrevious={onPrevious}
          onSkip={onSkip}
        />
      ) : null}
    </div>
  );
}
