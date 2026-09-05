import "./jszip.min.js";

const JSZip = globalThis.JSZip;

if (!JSZip) {
  throw new Error("JSZip global export is unavailable");
}

export default JSZip;
