const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const MATHJAX_DIR = path.join(ROOT_DIR, "node_modules", "mathjax");
const FORMULAS = [
  "x^2+y^2=z^2",
  "\\frac{1+\\frac{a}{b}}{\\sqrt[3]{x}}",
  "\\sum_{n=1}^{\\infty}\\frac{1}{n^2}=\\frac{\\pi^2}{6}",
  "\\int_0^1 x^2\\,dx=\\frac13",
  "\\prod_{i=1}^{n}a_i",
  "\\lim_{x\\to0}\\frac{\\sin x}{x}=1",
  "\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}",
  "\\begin{bmatrix}1&0&0\\\\0&1&0\\\\0&0&1\\end{bmatrix}",
  "f(x)=\\begin{cases}x^2&x\\ge0\\\\-x&x<0\\end{cases}",
  "\\begin{aligned}a&=b+c\\\\d&=e-f\\end{aligned}",
  "\\left\\langle\\frac{x}{y},z\\right\\rangle",
  "\\overline{AB}+\\underline{CD}+\\widehat{ABC}+\\vec v",
  "\\underbrace{a+\\cdots+a}_{n}=na",
  "\\binom{n}{k}=\\frac{n!}{k!(n-k)!}",
  "\\mathbb{R}\\supset\\mathbb{Q},\\quad\\mathcal{F}=\\mathbf{A}",
  "\\alpha+\\beta+\\Gamma+\\Omega+\\partial+\\nabla",
  "A\\xrightarrow{f}B\\xleftarrow[g]{}C",
  "\\overset{!}{=}\\quad\\underset{x\\in X}{\\arg\\max}f(x)",
  "\\text{面积}=\\pi r^2",
  "E=mc^2\\tag{1}",
  "\\color{red}{x}+\\cancel{y}",
  "\\require{AMScd}\\begin{CD}A @>f>> B\\\\@VgVV @VVhV\\\\C @>>k> D\\end{CD}",
];

async function readDocumentXml(buffer) {
  const yauzl = require("yauzl");
  return new Promise((resolve, reject) => yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
    if (error) return reject(error);
    let result = "";
    zip.on("error", reject);
    zip.on("end", () => resolve(result));
    zip.on("entry", (entry) => {
      if (entry.fileName !== "word/document.xml") return zip.readEntry();
      zip.openReadStream(entry, (error, stream) => {
        if (error) return reject(error);
        const chunks = [];
        stream.on("error", reject);
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("end", () => { result = Buffer.concat(chunks).toString("utf8"); zip.readEntry(); });
      });
    });
    zip.readEntry();
  }));
}

async function probe(mathjaxDir) {
  mathjaxDir = fs.realpathSync(mathjaxDir);
  // MathJax loads extensions through jsdom at runtime. A restricted copy plus a
  // network guard makes missing files fail rather than falling back to a CDN.
  const Module = require("node:module");
  const entry = require.resolve(mathjaxDir);
  assert.ok(entry.startsWith(path.join(mathjaxDir, "unpacked") + path.sep), "MathJax entry no longer uses the retained unpacked distribution");
  const resolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request, ...args) {
    return request === "mathjax" ? entry : resolveFilename.call(this, request, ...args);
  };
  const networkAttempts = [];
  function denyNetwork() { networkAttempts.push("network"); throw new Error("Formula packaging check must run offline"); }
  for (const protocol of ["node:http", "node:https"]) {
    const transport = require(protocol);
    transport.request = denyNetwork;
    transport.get = denyNetwork;
  }
  require("node:net").connect = denyNetwork;
  require("node:net").createConnection = denyNetwork;
  globalThis.fetch = denyNetwork;
  const { latexToOMML } = require("latex-to-omml");
  const results = [];
  // Alternate inline/block mode and repeat after all autoloaded extensions to
  // catch initialization, cached-load and subsequent-conversion regressions.
  for (const [index, latex] of [...FORMULAS, ...FORMULAS.slice().reverse()].entries()) {
    const omml = await latexToOMML(latex, { displayMode: index % 2 === 0 });
    assert.match(omml, /<m:oMath[ >]/, `No editable Word math for ${latex}`);
    results.push(omml);
  }
  await assert.rejects(latexToOMML(""), /不能为空/);
  await assert.rejects(latexToOMML("\\frac{"), /Missing close brace/);
  const recovered = await latexToOMML(FORMULAS[1], { displayMode: true });
  assert.match(recovered, /<m:oMath[ >]/, "Formula conversion did not recover after invalid input");
  results.push(recovered);
  const { compileWordExportAstToDocxBuffer } = require("../electron/wordDocxCompiler");
  const ast = {
    kind: "freeflow-word-export", version: 1, meta: { title: "Formula packaging regression" },
    sections: [{ children: FORMULAS.map((latex, index) => index % 2 === 0
      ? { type: "mathBlock", latex }
      : { type: "paragraph", children: [{ type: "text", text: "公式 " }, { type: "mathInline", latex }] }) }],
  };
  const xml = await readDocumentXml(await compileWordExportAstToDocxBuffer(ast));
  assert.ok((xml.match(/<m:oMath[ >]/g) || []).length >= FORMULAS.length, "DOCX lost editable formula content");
  assert.match(xml, /<m:f[ >]/, "DOCX lost fractions");
  assert.match(xml, /<m:rad[ >]/, "DOCX lost radicals");
  assert.match(xml, /<m:m[ >]/, "DOCX lost matrices");
  assert.deepEqual(networkAttempts, [], "Formula export attempted a network request");
  process.stdout.write(JSON.stringify({ results, xml, formulas: FORMULAS.length }));
}

function runProbe(mathjaxDir) {
  const child = spawnSync(process.execPath, [__filename, "--probe", mathjaxDir], {
    cwd: ROOT_DIR, encoding: "utf8", timeout: 90000, maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(child.status, 0, child.error?.message || child.stderr || child.stdout);
  return JSON.parse(child.stdout);
}

async function main() {
  if (process.argv[2] === "--probe") return probe(process.argv[3]);
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "freeflow-mathjax-packaging-"));
  try {
    const trimmedDir = path.join(temporaryDir, "mathjax");
    fs.mkdirSync(trimmedDir);
    for (const entry of ["unpacked", "package.json", "LICENSE"]) {
      fs.cpSync(path.join(MATHJAX_DIR, entry), path.join(trimmedDir, entry), { recursive: true });
    }
    const baseline = runProbe(MATHJAX_DIR);
    const trimmed = runProbe(trimmedDir);
    assert.deepEqual(trimmed, baseline, "Trimming MathJax changed formula export output");
    console.log(`[mathjax-packaging] ${trimmed.formulas} complex formulas, repeated inline/block conversion, invalid-input recovery and editable DOCX are identical offline with unpacked-only MathJax`);
  } finally {
    fs.rmSync(temporaryDir, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
