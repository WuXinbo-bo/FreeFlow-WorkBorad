import { renderMarkdownHtml } from "../textModel/markdownRuntime.js";

export function renderMarkdownPlainTextToRichHtml(text = "") {
  return renderMarkdownHtml(text);
}
