const SAMPLE_HTML = '<h1>让一个想法，成为一份成果</h1><p>把资料带进画布，继续思考和编辑。</p><h2>调研笔记</h2><ul><li><strong>收集</strong>：保留资料原有的层次</li><li><strong>整理</strong>：连接想法，形成结构</li><li><strong>交付</strong>：输出一份可以分享的文档</li></ul><blockquote>从零散资料，到清晰表达。</blockquote><p><a href="https://example.com/research">查看资料来源</a></p>';
const FORMULA = '$$\nE = mc^2\n$$';
const MIRROR_NOTE = '<h2>从资料到行动</h2><p>先把最重要的想法变成可验证的下一步。</p><ul><li><strong>收集</strong>：保留资料来源和关键结论</li><li><strong>整理</strong>：按主题连接相关内容</li><li><strong>交付</strong>：形成可以分享的行动方案</li></ul>';
export const MIRROR_SAMPLE_DOCUMENT = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>
body{margin:0;padding:22px;font:13px/1.9 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#263247;background:#fafbfc}
small{color:#7b8798;font-size:10px}.question{margin:22px 0;padding:12px 16px;border-radius:14px 14px 3px 14px;background:#edf1f7}
article{padding:6px 3px}h2{font-size:21px;letter-spacing:-.6px;line-height:1.4}ul{padding-left:20px}li{margin:8px 0}::selection{background:#cce2ff;color:#1b385e}
</style><small>示例网页 · 内置内容，无需登录</small><div class="question">如何把这份调研整理成行动方案？</div><article id="mirror-result">${MIRROR_NOTE}</article></html>`;
const abortIfNeeded = (signal) => { if (signal.aborted) throw new DOMException("演示已取消", "AbortError"); };

export function createShowcaseScene({ engine, setVisual, previewWord }) {
  let rootId = "";
  let formulaId = "";
  let mindRootId = "";
  let documentFile = null;
  let imageFile = null;
  const files = new Map();
  const checkpoints = new Map();
  let preparing = false;
  const show = (value) => { if (!preparing) setVisual(value); };
  const items = () => engine.getSnapshotData().items;
  const check = (value, message) => { if (!value) throw new Error(message); return value; };

  async function waitFor(predicate, signal, message, timeout = 15000) {
    const started = performance.now();
    while (!predicate()) {
      abortIfNeeded(signal);
      if (performance.now() - started > timeout) throw new Error(message);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    abortIfNeeded(signal);
  }

  function focus(item, animate = !preparing) {
    if (!item) return;
    engine.focusOnBounds({ left: item.x, top: item.y, width: item.width || 700, height: item.height || 300 }, {
      mode: "fit", padding: 90, maxScale: 1.05, animate: animate && !matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
  }

  function select(id) {
    const board = engine.getSnapshotData();
    engine.loadStructuredBoardForExport({ ...board, selectedIds: [id] });
    engine.setTool("select");
  }

  async function paste(html, text, signal) {
    const before = new Set(items().map((item) => item.id));
    const data = new DataTransfer();
    if (html) data.setData("text/html", html);
    data.setData("text/plain", text || "");
    const canvas = document.querySelector("#canvas-office-canvas");
    canvas.focus({ preventScroll: true });
    canvas.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
    await waitFor(() => items().some((item) => !before.has(item.id)), signal, "内容导入超时，请重播本章");
    return items().filter((item) => !before.has(item.id));
  }

  async function importNote(signal) {
    const imported = await paste(SAMPLE_HTML, "让一个想法，成为一份成果\n调研笔记\n收集\n整理\n交付", signal);
    rootId = check(imported.find((item) => item.type === "text"), "带格式文本未能导入").id;
    focus(items().find((item) => item.id === rootId));
  }

  function editRich(html) {
    const editor = check(document.querySelector("#canvas-rich-editor:not(.is-hidden)"), "编辑器未就绪");
    editor.innerHTML = html;
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
  }

  function commit() { engine.runCommand("element.commit-edit"); engine.setTool("select"); }

  async function addFormula(signal) {
    const imported = await paste("", FORMULA, signal);
    formulaId = imported[0].id;
    const note = items().find((item) => item.id === rootId);
    engine.runCommand("selection.set-geometry", { x: note.x + 950, y: note.y + 20 });
    focus(items().find((item) => item.id === formulaId));
  }

  async function makeDocument(signal) {
    if (documentFile) return documentFile;
    check(previewWord, "Word 预览需要桌面版，请使用 FreeFlow 桌面应用观看本章");
    const { buildWordExportAstFromItems } = await import("/src/engines/canvas2d-core/export/word/buildWordExportAst.js");
    abortIfNeeded(signal);
    const result = await previewWord({ ast: buildWordExportAstFromItems(items().filter((item) => item.id === rootId)), defaultName: "FreeFlow-导览资料" });
    abortIfNeeded(signal);
    check(result?.ok && result.docxBase64, result?.error || "示例 Word 生成失败");
    const bytes = Uint8Array.from(atob(result.docxBase64), (character) => character.charCodeAt(0));
    documentFile = new File([bytes], "调研资料.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    Object.defineProperty(documentFile, "path", { value: "showcase://调研资料.docx" });
    files.set(documentFile.path, documentFile);
    return documentFile;
  }

  async function dropFile(file, signal) {
    const before = new Set(items().map((item) => item.id));
    const canvas = document.querySelector("#canvas-office-canvas");
    const rect = canvas.getBoundingClientRect();
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    canvas.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer,
      clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
    await waitFor(() => items().some((item) => !before.has(item.id)), signal, "拖拽导入超时，请重试");
    return items().find((item) => !before.has(item.id));
  }

  const chapters = [
    { id: "import", title: "带格式导入", description: "标题、列表与强调，一次带进画布。", steps: [
      { caption: "一份有结构的资料，准备进入画布。", duration: 2800, run: () => show({ source: true, cursor: "source" }) },
      { caption: "一次粘贴，保留标题、列表、强调和链接。", duration: 4500, run: async (signal) => { show({ source: false, cursor: "center" }); await importNote(signal); } },
    ] },
    { id: "edit", title: "继续编辑", description: "带进来的资料，可以继续成为自己的内容。", steps: [
      { caption: "进入真实编辑器，继续修改整份笔记。", duration: 2300, run: () => { select(rootId); focus(items().find((item) => item.id === rootId)); check(engine.runCommand("element.edit"), "无法进入文本编辑"); } },
      { caption: "修改标题、补充重点，原有层次继续保留。", duration: 3500, run: () => {
        if (engine.getSnapshot().editingType !== "text") { select(rootId); engine.runCommand("element.edit"); }
        editRich(SAMPLE_HTML.replace("让一个想法，成为一份成果", "项目调研 · 我的行动方案").replace("从零散资料，到清晰表达。", "下一步：先验证最重要的想法。"));
      } },
      { caption: "完成编辑，正文与编辑态保持一致。", duration: 2500, run: () => commit() },
    ] },
    { id: "math", title: "数学公式", description: "熟悉的美元符号，可阅读，也可再编辑。", steps: [
      { caption: "用 $$ 包住独立公式，自动得到清晰的排版。", duration: 3200, run: async (signal) => { show({ formula: true }); await addFormula(signal); } },
      { caption: "再次进入编辑态，保留可修改的 LaTeX 源码。", duration: 2500, run: () => { select(formulaId); check(engine.runCommand("element.edit"), "无法进入公式编辑"); } },
      { caption: "修改表达式，完成后立即更新渲染。", duration: 3500, run: () => {
        // A window blur legitimately commits the editor while playback is paused.
        if (engine.getSnapshot().editingType !== "math") { select(formulaId); engine.runCommand("element.edit"); }
        const editor = check(document.querySelector("#canvas-text-editor.is-math"), "公式编辑器未就绪");
        editor.value = "E^2 = m^2c^4 + p^2c^2";
        editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
        commit(); show({ formula: false });
      } },
    ] },
    { id: "organize", title: "组织思路", description: "让收集、整理和交付，形成清晰的结构。", steps: [
      { caption: "从一个中心想法开始。", duration: 2200, run: () => {
        engine.addMindMapRoot(); mindRootId = items().findLast((item) => item.type === "mindNode").id;
        editRich("<p>从资料到成果</p>"); commit();
        const note = items().find((item) => item.id === rootId);
        engine.runCommand("selection.set-geometry", { x: note.x + 950, y: note.y + 350 });
        focus(items().find((item) => item.id === mindRootId));
      } },
      ...["收集资料", "整理思路", "输出成果"].map((title) => ({ caption: `建立分支：${title}。`, duration: 1800, run: () => {
        engine.addMindChildNode(mindRootId); editRich(`<p>${title}</p>`); commit();
        const mindItems = items().filter((item) => item.type === "mindNode");
        const left = Math.min(...mindItems.map((item) => item.x)); const top = Math.min(...mindItems.map((item) => item.y));
        focus({ x: left, y: top, width: Math.max(...mindItems.map((item) => item.x + item.width)) - left,
          height: Math.max(...mindItems.map((item) => item.y + item.height)) - top });
      } })),
      { caption: "折叠、再展开，把复杂度掌握在自己手中。", duration: 2200, run: () => engine.toggleMindNodeCollapsed(mindRootId) },
      { caption: "展开结构，继续补充和调整。", duration: 1800, run: () => engine.toggleMindNodeCollapsed(mindRootId) },
    ] },
    { id: "media", title: "图片与文件", description: "拖进来，直接看，资料就在思路旁边。", steps: [
      { caption: "把图片拖入画布，直接参与整理。", duration: 3200, run: async (signal) => {
        if (!imageFile) {
          const response = await fetch("/assets/tutorial-group.png", { signal });
          check(response.ok, "示例图片读取失败"); imageFile = new File([await response.blob()], "灵感参考.png", { type: "image/png" });
        }
        const image = await dropFile(imageFile, signal);
        const note = items().find((item) => item.id === rootId);
        engine.runCommand("selection.set-geometry", { x: note.x, y: note.y + 650 });
        focus(items().find((item) => item.id === image.id)); show({ cursor: "center" });
      } },
      { caption: "再拖入一份真实 Word 文件，生成文件卡片。", duration: 2600, run: async (signal) => {
        const file = await makeDocument(signal); const card = await dropFile(file, signal);
        check(card?.type === "fileCard", "未生成文件卡片");
        const note = items().find((item) => item.id === rootId);
        engine.runCommand("selection.set-geometry", { x: note.x + 950, y: note.y + 950 });
        focus(items().find((item) => item.id === card.id));
      } },
      { caption: "打开文件预览，内容始终贴在文件卡片旁。", duration: 5000, run: async (signal) => {
        const card = items().findLast((item) => item.type === "fileCard");
        check(engine.openFileCardPreview(card), "文件预览无法打开");
        engine.focusOnBounds({ left: card.x, top: card.y, width: 670, height: 650 }, { mode: "fit", padding: 35, maxScale: .9 });
        await waitFor(() => engine.getSnapshot().fileCardPreviewRequests?.some((request) => request.previewStatus === "ready"), signal, "Word 文件预览读取失败");
        await waitFor(() => document.querySelector(".canvas2d-file-preview-react-frame iframe")?.contentDocument?.querySelector("section.canvas2d-file-card-docx-preview-document"), signal, "Word 文件预览渲染失败");
      } },
    ] },
    { id: "mirror", title: "AI 镜像", description: "让已有 AI 网页，与画布并肩工作。", steps: [
      { caption: "打开映射控制，选择已有 AI 网页。", duration: 3000, run: () => { show({ mirror: "choose" }); focus(items().find((item) => item.id === rootId)); } },
      { caption: "开始嵌入，网页与画布并排显示。这里使用无需登录的离线示例。", duration: 3200, run: async (signal) => {
        if (preparing) return;
        show({ mirror: "embedded" });
        await waitFor(() => document.querySelector(".showcase-mirror-webpage")?.contentDocument?.querySelector("#mirror-result"), signal, "镜像示例网页未就绪");
      } },
      { caption: "在镜像网页里，选中需要带回画布的内容。", duration: 2600, run: () => {
        if (preparing) return;
        const doc = check(document.querySelector(".showcase-mirror-webpage")?.contentDocument, "镜像示例未就绪");
        const range = doc.createRange(); range.selectNodeContents(doc.querySelector("#mirror-result"));
        const selection = doc.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      } },
      { caption: "把有用的资料带回画布，继续整理自己的结论。", duration: 3800, run: async (signal) => {
        const result = document.querySelector(".showcase-mirror-webpage")?.contentDocument?.querySelector("#mirror-result");
        const imported = await paste(result?.innerHTML || MIRROR_NOTE, result?.textContent || "从资料到行动", signal);
        const note = items().find((item) => item.id === rootId);
        engine.runCommand("selection.set-geometry", { x: note.x, y: note.y + 1200 });
        focus(items().find((item) => item.id === imported[0].id)); show({ mirror: "embedded" });
      } },
    ] },
    { id: "word", title: "导出 Word", description: "把画布里的思考，变成可分享的文档。", steps: [
      { caption: "选择笔记，打开真实 Word 导出预览。", duration: 2500, run: async (signal) => {
        check(previewWord, "Word 生成需要桌面版，请在 FreeFlow 桌面应用中观看");
        const selection = items().filter((item) => item.type !== "fileCard");
        await engine.exportSelectionAsWord(selection);
        await waitFor(() => engine.getSnapshot().wordExportPreviewRequest?.previewStatus !== "loading", signal, "Word 生成超时");
        check(engine.getSnapshot().wordExportPreviewRequest?.previewStatus === "ready", "Word 文档生成失败");
      } },
      { caption: "调整阅读顺序，预览会重新生成。", duration: 4000, run: async (signal) => {
        const request = engine.getSnapshot().wordExportPreviewRequest;
        const order = request.preview.orderedItemIds;
        if (order.length > 1) engine.reorderWordExportPreview(request.id, order.at(-1), -1);
        await waitFor(() => engine.getSnapshot().wordExportPreviewRequest?.previewStatus !== "loading", signal, "调整顺序后的 Word 生成超时");
        check(engine.getSnapshot().wordExportPreviewRequest?.previewStatus === "ready", "Word 预览生成失败");
      } },
      { caption: "文档已真实生成。点击“导出为 Word”，即可保存示例。", duration: 6500 },
    ] },
  ];

  return {
    chapters,
    files,
    refit(index) {
      const snapshot = engine.getSnapshot();
      if (snapshot.fileCardPreviewRequests?.length) {
        const card = items().find((item) => item.id === snapshot.fileCardPreviewRequests[0].itemId);
        if (card) engine.focusOnBounds({ left: card.x, top: card.y, width: 670, height: 650 }, { mode: "fit", padding: 35, maxScale: .9 });
        return;
      }
      const selected = engine.getSnapshotData().selectedIds || [];
      const targets = items().filter((item) => index === 3 ? item.type === "mindNode" : selected.includes(item.id));
      if (!targets.length) return;
      const x = Math.min(...targets.map((item) => item.x)); const y = Math.min(...targets.map((item) => item.y));
      focus({ x, y, width: Math.max(...targets.map((item) => item.x + item.width)) - x,
        height: Math.max(...targets.map((item) => item.y + item.height)) - y }, false);
    },
    complete(index) {
      commit();
      checkpoints.set(index + 1, { board: engine.getSnapshotData(), rootId, formulaId, mindRootId });
    },
    async prepare(index, signal) {
      preparing = true;
      setVisual({});
      engine.closeWordExportPreview();
      engine.setTool("select");
      engine.loadStructuredBoardForExport({ boardId: "freeflow-feature-showcase", items: [], view: { scale: 1, offsetX: 0, offsetY: 0 }, preferences: { backgroundPattern: "dots" } });
      rootId = ""; formulaId = ""; mindRootId = "";
      try {
        let start = index;
        while (start > 0 && !checkpoints.has(start)) start -= 1;
        const cached = checkpoints.get(start);
        if (cached) {
          engine.loadStructuredBoardForExport(cached.board);
          rootId = cached.rootId; formulaId = cached.formulaId; mindRootId = cached.mindRootId;
        }
        for (let previous = start; previous < index; previous += 1) {
          for (const step of chapters[previous].steps) { abortIfNeeded(signal); await step.run?.(signal); }
          commit();
          checkpoints.set(previous + 1, { board: engine.getSnapshotData(), rootId, formulaId, mindRootId });
          engine.closeWordExportPreview();
          for (const request of engine.getSnapshot().fileCardPreviewRequests || []) engine.closeFileCardPreview(request.id);
        }
        for (const request of engine.getSnapshot().fileCardPreviewRequests || []) engine.closeFileCardPreview(request.id);
        abortIfNeeded(signal);
      } finally {
        preparing = false;
      }
    },
  };
}
