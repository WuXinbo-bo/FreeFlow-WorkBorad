import { FILE_CARD_DEFAULT_WIDTH, FILE_CARD_DEFAULT_HEIGHT } from "./elements/fileCard.js";
import { formatBytes } from "./utils.js";

export const FILE_CARD_FONT = '"Segoe UI", "PingFang SC", sans-serif';

// Shared scene-space metrics for DOM, canvas fallback and exported images.
export function getFileCardLayout(item) {
  const width = Math.max(1, Number(item.width) || FILE_CARD_DEFAULT_WIDTH);
  const height = Math.max(1, Number(item.height) || FILE_CARD_DEFAULT_HEIGHT);
  const scale = Math.min(width / FILE_CARD_DEFAULT_WIDTH, height / FILE_CARD_DEFAULT_HEIGHT);
  const top = (height - 64 * scale) / 2;
  return {
    scale, radius: 16 * scale,
    tag: { x: 16 * scale, y: (height - 56 * scale) / 2, width: 48 * scale, height: 56 * scale, font: 11 * scale },
    name: { x: 80 * scale, y: top, width: width - 96 * scale, height: 44 * scale, font: 16 * scale, lineHeight: 22 * scale },
    meta: { x: 80 * scale, y: top + 50 * scale, width: width - 96 * scale, font: 12 * scale },
    extension: (String(item.ext || "").toUpperCase() || "FILE").slice(0, 7),
    metadata: item.sourceMissing ? "文件缺失 · 请重新关联" : Number(item.size) > 0 ? formatBytes(item.size) : "文件",
  };
}

// Character wrapping also supports Chinese and filenames with no spaces.
// Keep the extension on the truncated final line so file types stay identifiable.
export function getFileCardNameLines(name, maxWidth, measure) {
  const chars = Array.from(String(name || "未命名文件").replace(/\s+/g, " "));
  const takeLine = (remaining) => {
    let line = "";
    while (remaining.length && measure(line + remaining[0]) <= maxWidth) line += remaining.shift();
    return line;
  };
  const first = takeLine(chars);
  if (!chars.length) return [first];
  let second = takeLine(chars);
  if (chars.length) {
    const suffix = String(name || "").match(/\.[^.\s]{1,10}$/)?.[0] || "";
    const ending = `…${suffix}`;
    while (second && measure(second + ending) > maxWidth) second = Array.from(second).slice(0, -1).join("");
    second += ending;
  }
  return [first, second];
}
