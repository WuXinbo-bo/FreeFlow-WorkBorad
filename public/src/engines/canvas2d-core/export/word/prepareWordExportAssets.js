// The compiler receives image bytes only; it never reads arbitrary paths or URLs.
export async function prepareWordExportAssets(inputAst) {
  const ast = structuredClone(inputAst);
  const images = [];
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (value.type === "image") images.push(value);
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === "object") visit(child);
    }
  }
  visit(ast.sections); // arrays are handled by their numeric Object.values entries
  const warnings = [];
  const cache = new Map();
  let total = 0;
  async function resolve(source) {
    if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(source)) return source;
    if (!source || /^(https?:|javascript:|file:)/i.test(source)) return "";
    if (typeof globalThis.desktopShell?.readFileBase64 !== "function") return "";
    const result = await globalThis.desktopShell.readFileBase64(source);
    return result?.ok && /^image\/(png|jpeg|jpg|webp|gif)$/i.test(result.mime || "") ? `data:${result.mime};base64,${result.data}` : "";
  }
  for (const image of images) {
    const source = String(image.src || "");
    try {
      if (!cache.has(source)) cache.set(source, resolve(source).catch(() => ""));
      const data = await cache.get(source);
      const bytes = Math.ceil(data.length * .75);
      if (!data || bytes > 8 * 1024 * 1024 || total + bytes > 24 * 1024 * 1024) throw new Error("图片不存在、未获访问权限或超过导出大小限制");
      image.src = data;
      total += bytes;
    } catch (error) {
      image.src = "";
      warnings.push(`${image.alt || "图片"}：${error.message}`);
    }
  }
  ast.assetWarnings = warnings;
  return ast;
}
