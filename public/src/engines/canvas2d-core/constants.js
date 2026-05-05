export const STORAGE_KEY = "ai_worker_canvas_office_board_v3";
export const DEFAULT_STORAGE_KEY = STORAGE_KEY;
export const LEGACY_STORAGE_KEYS = ["ai_worker_canvas_office_board_v2", "ai_worker_canvas_office_board_v1"];
export const HISTORY_LIMIT = 80;

export const DEFAULT_VIEW = Object.freeze({
  scale: 0.75,
  offsetX: 0,
  offsetY: 0,
});

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 4;

export const TOOL_SHORTCUTS = Object.freeze({
  v: "select",
  t: "text",
  r: "rect",
  a: "arrow",
  l: "line",
  e: "ellipse",
  h: "highlight",
});

export const DRAW_TOOLS = Object.freeze(["rect", "ellipse", "arrow", "line", "highlight"]);
