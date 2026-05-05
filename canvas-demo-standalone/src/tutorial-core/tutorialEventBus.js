export const TUTORIAL_UI_EVENT_NAME = "freeflow:tutorial-ui-event";

function normalizeDetail(detail = {}) {
  return detail && typeof detail === "object" ? detail : {};
}

export function dispatchTutorialUiEvent(detail = {}, target = globalThis?.window) {
  if (!target || typeof target.dispatchEvent !== "function" || typeof CustomEvent !== "function") {
    return false;
  }
  target.dispatchEvent(
    new CustomEvent(TUTORIAL_UI_EVENT_NAME, {
      detail: normalizeDetail(detail),
    })
  );
  return true;
}

export function subscribeTutorialUiEvent(listener, target = globalThis?.window) {
  if (!target || typeof target.addEventListener !== "function" || typeof listener !== "function") {
    return () => {};
  }
  const handler = (event) => {
    listener(normalizeDetail(event?.detail), event);
  };
  target.addEventListener(TUTORIAL_UI_EVENT_NAME, handler);
  return () => target.removeEventListener(TUTORIAL_UI_EVENT_NAME, handler);
}
