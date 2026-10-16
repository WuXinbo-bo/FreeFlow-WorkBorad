"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { build } = require("esbuild");
const { chromium } = require("playwright");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
const iconModule = path.join(root, "public/src/ui/icons/appIcons.mjs");

async function bundleModule(entry, globals = {}) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: "cjs", platform: "node", external: ["react"] });
  const module = { exports: {} };
  const sandbox = { module, exports: module.exports, require, ...globals };
  vm.runInNewContext(result.outputFiles[0].text, sandbox, { filename: entry });
  return { api: module.exports, sandbox };
}

async function sourceFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.filter((entry) => entry.name !== "_archive").map((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(fullPath) : /\.(?:jsx?|mjs|html)$/.test(entry.name) ? [fullPath] : [];
  }));
  return files.flat();
}

async function checkSources(catalog) {
  const sources = await sourceFiles(path.join(root, "public/src"));
  sources.push(path.join(root, "public/index.html"), path.join(root, "public/canvas-office.html"));
  let references = 0;
  for (const file of sources) {
    const source = await fs.readFile(file, "utf8");
    const names = Array.from(source.matchAll(/(?:data-ui-icon=["']|renderAppIcon\(\s*["']|drawAppIcon\([^,]+,\s*["'])([a-z][a-z0-9-]*)/g), (match) => match[1]);
    for (const icon of source.matchAll(/<AppIcon\b[^>]*\/>/g)) {
      const attribute = icon[0].match(/\bname=(?:["']([^"']+)["']|\{([^}]+)\})/);
      if (attribute?.[1]) names.push(attribute[1]);
      else if (attribute?.[2]) names.push(...Array.from(attribute[2].matchAll(/["']([a-z][a-z0-9-]*)["']/g), (match) => match[1]));
    }
    for (const name of names) {
      assert(Object.hasOwn(catalog, name), `${path.relative(root, file)} references unknown icon ${name}`);
      references++;
    }
  }
  assert(references > 0, "No shared icon usages were checked");
  execFileSync(process.execPath, [path.join(root, "scripts/sync-app-icons.js"), "--check"], { cwd: root, stdio: "pipe" });
  return references;
}

async function checkSvgRenderers(api) {
  const { AppIcon } = (await bundleModule(path.join(root, "public/src/ui/icons/AppIcon.jsx"))).api;
  const names = Object.keys(api.ICON_NODES);
  const hostile = '\"><img src=x onerror="alert(1)"><script>alert(1)</script>&';
  const unknownNames = ["not-an-icon", "__proto__", "constructor", "toString"];
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<main id="dom">${names.map((name) => api.renderAppIcon(name, { size: 20 })).join("")}</main><main id="react">${names.map((name) => renderToStaticMarkup(React.createElement(AppIcon, { name, size: 20 }))).join("")}</main><main id="escaping">${api.renderAppIcon(hostile, { className: hostile })}</main><main id="fallback">${unknownNames.map((name) => api.renderAppIcon(name)).join("")}</main>`);
    const result = await page.evaluate(({ names, hostile }) => {
      const geometry = (svg) => Array.from(svg.children, (node) => [node.localName, Object.fromEntries(Array.from(node.attributes, (attribute) => [attribute.name, attribute.value]).sort(([left], [right]) => left.localeCompare(right)))]);
      const dom = Array.from(document.querySelectorAll("#dom > svg"));
      const react = Array.from(document.querySelectorAll("#react > svg"));
      return {
        names: dom.map((svg) => svg.dataset.uiIcon),
        invalid: dom.filter((svg) => { const box = svg.getBBox(); return !Number.isFinite(box.width + box.height) || box.width + box.height <= 0; }).map((svg) => svg.dataset.uiIcon),
        mismatches: dom.filter((svg, index) => JSON.stringify(geometry(svg)) !== JSON.stringify(geometry(react[index]))).map((svg) => svg.dataset.uiIcon),
        wrongAttributes: [...dom, ...react].filter((svg) => svg.getAttribute("viewBox") !== "0 0 24 24" || svg.getAttribute("aria-hidden") !== "true" || svg.getAttribute("focusable") !== "false" || svg.getAttribute("stroke") !== "currentColor" || svg.getAttribute("stroke-width") !== "1.75" || svg.getAttribute("width") !== "20").length,
        escaped: document.querySelector("#escaping > svg")?.dataset.uiIcon === hostile && document.querySelector("#escaping > svg")?.getAttribute("class") === `app-icon ${hostile}`,
        injected: document.querySelectorAll("#escaping img, #escaping script, #escaping [onerror]").length,
        fallbacks: Array.from(document.querySelectorAll("#fallback > svg"), geometry),
        fallback: geometry(document.querySelector('#dom > svg[data-ui-icon="circle-help"]')),
        count: react.length,
      };
    }, { names, hostile });
    assert.deepEqual(result.names, names);
    assert.equal(result.count, names.length);
    assert.deepEqual(result.invalid, [], "Catalog contains invisible or invalid SVG geometry");
    assert.deepEqual(result.mismatches, [], "React and DOM renderers disagree on icon geometry");
    assert.equal(result.wrongAttributes, 0, "Shared renderer styles or accessibility attributes diverged");
    assert(result.escaped && result.injected === 0, "Icon names/classes escaped their SVG attributes");
    for (const fallback of result.fallbacks) assert.deepEqual(fallback, result.fallback, "Unknown names must render the safe fallback");
    await checkUiStyles(page, api);
  } finally {
    await browser.close();
  }
}

async function checkUiStyles(page, api) {
  const index = await fs.readFile(path.join(root, "public/index.html"), "utf8");
  const styles = Array.from(index.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/g), (match) => match[1]);
  const restore = index.match(/<button id="restore-left-pane-btn"[\s\S]*?<\/button>/)[0].replace(" is-hidden", "");
  await page.setContent(`<body class="desktop-mode">${restore}<button id="mind" class="canvas-mind-node-tool is-toggle-collapse">${api.renderAppIcon("chevron-left", { className: "canvas-mind-collapse-expanded" })}${api.renderAppIcon("chevron-right", { className: "canvas-mind-collapse-collapsed" })}</button><button class="canvas2d-rich-btn is-align-icon is-align-left">${api.renderAppIcon("align-left")}</button><button class="canvas-table-tool">${api.renderAppIcon("plus")}</button><button class="canvas-table-edge-btn">${api.renderAppIcon("plus")}</button><details><summary class="app-icon-disclosure">${api.renderAppIcon("chevron-right", { className: "app-disclosure-chevron" })}更多</summary>选项</details><svg id="document-svg" width="41" height="23" fill="red" stroke="blue"><rect width="41" height="23"/></svg></body>`);
  for (const file of styles) await page.addStyleTag({ content: await fs.readFile(path.join(root, "public", file), "utf8") });
  const result = await page.evaluate(() => {
    const errors = [], check = (ok, message) => { if (!ok) errors.push(message); };
    const mind = document.querySelector("#mind");
    for (const collapsed of [false, true, false, true, false]) {
      mind.classList.toggle("is-collapsed", collapsed);
      const visible = [...mind.querySelectorAll("svg")].filter(svg => getComputedStyle(svg).display !== "none");
      check(visible.length === 1 && visible[0].dataset.uiIcon === (collapsed ? "chevron-right" : "chevron-left"), `mind collapse=${collapsed} must show exactly its intended arrow`);
    }
    const wrapper = document.querySelector("#restore-left-pane-btn .ui-control-icon"), icon = wrapper.querySelector("svg");
    const outer = wrapper.getBoundingClientRect(), inner = icon.getBoundingClientRect();
    check([outer.width, outer.height, inner.width, inner.height].every(size => Math.abs(size - 16) < 0.1) && Math.abs(outer.x - inner.x) < 0.1 && Math.abs(outer.y - inner.y) < 0.1, "restore wrapper and SVG must share a centered 16px box");
    for (const control of document.querySelectorAll(".canvas2d-rich-btn,.canvas-table-tool,.canvas-table-edge-btn,#mind")) {
      for (const pseudo of ["::before", "::after"]) {
        const style = getComputedStyle(control, pseudo);
        check(style.display === "none" || ["none", "normal", '""'].includes(style.content), `${control.className}${pseudo} duplicates the SVG icon`);
      }
    }
    const summary = document.querySelector("summary"), details = summary.parentElement, chevron = summary.querySelector("svg");
    check(getComputedStyle(summary).listStyleType === "none" && (!CSS.supports("selector(summary::-webkit-details-marker)") || getComputedStyle(summary, "::-webkit-details-marker").display === "none"), "summary must suppress its native marker");
    for (const open of [true, false, true, false]) {
      summary.click();
      const transform = getComputedStyle(chevron).transform, matrix = new DOMMatrix(transform === "none" ? undefined : transform);
      check(details.open === open && Math.abs(matrix.a - (open ? 0 : 1)) < 0.001 && Math.abs(matrix.b - (open ? 1 : 0)) < 0.001, `disclosure open=${open} must rotate to ${open ? 90 : 0} degrees`);
    }
    const documentSvg = document.querySelector("#document-svg"), style = getComputedStyle(documentSvg), box = documentSvg.getBoundingClientRect();
    check(box.width === 41 && box.height === 23 && style.fill === "rgb(255, 0, 0)" && style.stroke === "rgb(0, 0, 255)", "functional icon CSS must preserve ordinary document SVG styling");
    return errors;
  });
  assert.deepEqual(result, [], "Actual application stylesheet cascade broke icon interactions");
}

async function checkCanvasRenderer() {
  let allocated = 0;
  class MockPath2D {
    constructor(source) { allocated++; this.commands = source ? [["path", source]] : []; }
    addPath(other) { this.commands.push(...other.commands); }
    moveTo(...args) { this.commands.push(["moveTo", ...args]); }
    lineTo(...args) { this.commands.push(["lineTo", ...args]); }
    arc(...args) { this.commands.push(["arc", ...args]); }
    ellipse(...args) { this.commands.push(["ellipse", ...args]); }
    roundRect(...args) { this.commands.push(["roundRect", ...args]); }
    closePath() { this.commands.push(["closePath"]); }
  }
  const { api, sandbox } = await bundleModule(iconModule, { Path2D: MockPath2D });
  const stack = [], strokes = [];
  const initial = { strokeStyle: "purple", fillStyle: "orange", lineWidth: 7, lineCap: "square", lineJoin: "bevel", globalAlpha: 0.6, transform: [2, 3, 4, 5] };
  let state = structuredClone(initial);
  const context = {
    save() { stack.push(structuredClone(state)); },
    restore() { assert(stack.length, "Unbalanced canvas restore"); state = stack.pop(); },
    translate(x, y) { state.transform[0] += x; state.transform[1] += y; },
    scale(x, y) { state.transform[2] *= x; state.transform[3] *= y; },
    stroke(shape) { strokes.push({ shape, state: structuredClone(state) }); },
  };
  for (const key of ["strokeStyle", "lineWidth", "lineCap", "lineJoin"]) Object.defineProperty(context, key, { get: () => state[key], set: (value) => { state[key] = value; } });
  assert.equal(api.drawAppIcon(context, "lock", 10, 20, 24, { color: "red" }), true);
  const cachedAllocations = allocated;
  assert.equal(api.drawAppIcon(context, "lock", -30, 40, 12, { color: "blue" }), true);
  assert.equal(allocated, cachedAllocations, "Repeated canvas draws rebuild immutable icon geometry");
  assert.equal(strokes[0].shape, strokes[1].shape, "Canvas geometry cache was not reused");
  assert.notDeepEqual(strokes[0].state.transform, strokes[1].state.transform);
  assert.equal(strokes[0].state.strokeStyle, "red");
  assert.equal(strokes[1].state.strokeStyle, "blue");
  for (const name of Object.keys(api.ICON_NODES)) {
    api.drawAppIcon(context, name, 0, 0);
    assert(strokes.at(-1).shape.commands.length, `Canvas icon ${name} has no geometry`);
    assert.deepEqual(state, initial, `Canvas icon ${name} leaked drawing state`);
    assert.equal(stack.length, 0);
  }
  api.drawAppIcon(context, "not-an-icon", 0, 0);
  const fallback = strokes.at(-1).shape;
  api.drawAppIcon(context, "__proto__", 0, 0);
  assert.equal(strokes.at(-1).shape, fallback, "Unknown canvas names did not share the fallback cache");
  sandbox.Path2D = undefined;
  const before = strokes.length;
  assert.equal(api.drawAppIcon(context, "lock", 0, 0), false);
  assert.equal(strokes.length, before, "Missing Path2D must not partially draw");
  assert.deepEqual(state, initial);
}

async function main() {
  const api = await import(pathToFileURL(iconModule));
  const tags = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
  const attributes = new Set(["d", "width", "height", "x", "y", "rx", "ry", "cx", "cy", "r", "x1", "x2", "y1", "y2", "points", "fill"]);
  for (const [name, nodes] of Object.entries(api.ICON_NODES)) {
    assert.match(name, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, `Invalid icon name ${name}`);
    assert(Array.isArray(nodes) && nodes.length, `Empty icon ${name}`);
    for (const [tag, values] of nodes) {
      assert(tags.has(tag), `Unsafe SVG node ${tag} in ${name}`);
      for (const [attribute, value] of Object.entries(values)) {
        assert(attributes.has(attribute), `Unsafe SVG attribute ${attribute} in ${name}`);
        if (attribute === "d") assert.match(value, /^[MmZzLlHhVvCcSsQqTtAa0-9eE+.,\s-]+$/, `Invalid SVG path in ${name}`);
        else if (attribute === "points") assert.match(value, /^[0-9+.,\s-]+$/);
        else if (attribute === "fill") assert(["none", "currentColor"].includes(value));
        else assert(Number.isFinite(Number(value)), `Non-numeric SVG geometry in ${name}`);
      }
    }
  }
  const references = await checkSources(api.ICON_NODES);
  await checkSvgRenderers(api);
  await checkCanvasRenderer();
  console.log(`[app-icons] ${Object.keys(api.ICON_NODES).length} icons, ${references} source references; DOM/React geometry, escaping, static sync, actual UI styles and canvas cache/state passed`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
