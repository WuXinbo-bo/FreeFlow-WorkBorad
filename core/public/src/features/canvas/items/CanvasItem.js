export class CanvasItem {
  constructor(payload = {}) {
    this.payload = { ...payload };
  }

  get payloadValue() {
    return this.payload;
  }

  get id() {
    return this.payload.id;
  }

  get kind() {
    return this.payload.kind;
  }

  get title() {
    return this.payload.title || "";
  }

  set title(value) {
    this.payload.title = String(value || "");
  }

  get text() {
    return this.payload.text || "";
  }

  set text(value) {
    this.payload.text = String(value || "");
  }

  get x() {
    return Number(this.payload.x) || 0;
  }

  set x(value) {
    this.payload.x = Number(value) || 0;
  }

  get y() {
    return Number(this.payload.y) || 0;
  }

  set y(value) {
    this.payload.y = Number(value) || 0;
  }

  get width() {
    return Number(this.payload.width) || 0;
  }

  set width(value) {
    this.payload.width = Number(value) || 0;
  }

  get height() {
    return Number(this.payload.height) || 0;
  }

  set height(value) {
    this.payload.height = Number(value) || 0;
  }

  get renderX() {
    return Number(this.payload.renderX) || 0;
  }

  set renderX(value) {
    this.payload.renderX = Number(value) || 0;
  }

  get renderY() {
    return Number(this.payload.renderY) || 0;
  }

  set renderY(value) {
    this.payload.renderY = Number(value) || 0;
  }

  get dataUrl() {
    return String(this.payload.dataUrl || "");
  }

  set dataUrl(value) {
    this.payload.dataUrl = String(value || "");
  }

  get filePath() {
    return String(this.payload.filePath || "");
  }

  set filePath(value) {
    this.payload.filePath = String(value || "");
  }

  get fileName() {
    return String(this.payload.fileName || "");
  }

  set fileName(value) {
    this.payload.fileName = String(value || "");
  }

  get fileBaseName() {
    return String(this.payload.fileBaseName || "");
  }

  set fileBaseName(value) {
    this.payload.fileBaseName = String(value || "");
  }

  get fileExt() {
    return String(this.payload.fileExt || "");
  }

  set fileExt(value) {
    this.payload.fileExt = String(value || "");
  }

  get detectedExt() {
    return String(this.payload.detectedExt || "");
  }

  set detectedExt(value) {
    this.payload.detectedExt = String(value || "");
  }

  get mimeType() {
    return String(this.payload.mimeType || "");
  }

  set mimeType(value) {
    this.payload.mimeType = String(value || "");
  }

  get detectedMimeType() {
    return String(this.payload.detectedMimeType || "");
  }

  set detectedMimeType(value) {
    this.payload.detectedMimeType = String(value || "");
  }

  get hasFileSize() {
    return Boolean(this.payload.hasFileSize);
  }

  set hasFileSize(value) {
    this.payload.hasFileSize = Boolean(value);
  }

  get isDirectory() {
    return Boolean(this.payload.isDirectory);
  }

  set isDirectory(value) {
    this.payload.isDirectory = Boolean(value);
  }

  get fileSize() {
    return Number(this.payload.fileSize) || 0;
  }

  set fileSize(value) {
    this.payload.fileSize = Number(value) || 0;
  }

  get fontSize() {
    return Number(this.payload.fontSize) || 0;
  }

  set fontSize(value) {
    this.payload.fontSize = Number(value) || 0;
  }

  get bold() {
    return Boolean(this.payload.bold);
  }

  set bold(value) {
    this.payload.bold = Boolean(value);
  }

  get highlighted() {
    return Boolean(this.payload.highlighted);
  }

  set highlighted(value) {
    this.payload.highlighted = Boolean(value);
  }

  get createdAt() {
    return Number(this.payload.createdAt) || 0;
  }

  set createdAt(value) {
    this.payload.createdAt = Number(value) || 0;
  }

  toPayload() {
    return { ...this.payload };
  }

  toJSON() {
    return this.toPayload();
  }
}
