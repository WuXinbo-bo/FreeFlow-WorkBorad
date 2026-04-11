const fs = require("fs/promises");
const path = require("path");
const yauzl = require("yauzl");
const { PDFParse } = require("pdf-parse");

const DOCX_XML_ENTRY_PATTERN = /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i;
const PPTX_XML_ENTRY_PATTERN = /^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/i;
const EXTRACTED_FILE_TEXT_LIMIT = 200000;

function decodeXmlEntities(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, value) => String.fromCodePoint(Number(value) || 0))
    .replace(/&#x([0-9a-f]+);/gi, (_match, value) => String.fromCodePoint(parseInt(value, 16) || 0));
}

function normalizeDocxXmlText(xml) {
  return decodeXmlEntities(
    String(xml || "")
      .replace(/<w:tab\b[^>]*\/>/gi, "\t")
      .replace(/<w:(?:br|cr)\b[^>]*\/>/gi, "\n")
      .replace(/<\/w:p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizePptxXmlText(xml) {
  return decodeXmlEntities(
    String(xml || "")
      .replace(/<a:br\b[^>]*\/>/gi, "\n")
      .replace(/<\/a:p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function readZipTextEntries(filePath, entryPattern, normalizeEntryText) {
  const resolvedPath = path.resolve(String(filePath || "").trim());
  if (!resolvedPath) throw new Error("Missing file path");

  const stats = await fs.stat(resolvedPath);
  if (!stats.isFile()) throw new Error("Target path is not a file");

  return new Promise((resolve, reject) => {
    yauzl.open(resolvedPath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError) return reject(openError);

      const xmlParts = [];
      let finished = false;

      const complete = (error, text = "") => {
        if (finished) return;
        finished = true;
        zipFile.close();
        if (error) return reject(error);
        resolve(text);
      };

      zipFile.on("error", (error) => complete(error));
      zipFile.on("end", () => {
        const text = xmlParts
          .map((part) => normalizeEntryText(part))
          .filter(Boolean)
          .join("\n\n")
          .slice(0, EXTRACTED_FILE_TEXT_LIMIT);
        complete(null, text);
      });

      zipFile.on("entry", (entry) => {
        if (!entryPattern.test(entry.fileName)) {
          zipFile.readEntry();
          return;
        }

        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError) return complete(streamError);
          const chunks = [];
          stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          stream.on("error", (error) => complete(error));
          stream.on("end", () => {
            xmlParts.push(Buffer.concat(chunks).toString("utf8"));
            zipFile.readEntry();
          });
        });
      });

      zipFile.readEntry();
    });
  });
}

async function readDocxText(filePath) {
  return readZipTextEntries(filePath, DOCX_XML_ENTRY_PATTERN, normalizeDocxXmlText);
}

async function readPptxText(filePath) {
  return readZipTextEntries(filePath, PPTX_XML_ENTRY_PATTERN, normalizePptxXmlText);
}

async function readPdfText(filePath) {
  const resolvedPath = path.resolve(String(filePath || "").trim());
  const data = await fs.readFile(resolvedPath);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return String(result?.text || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, EXTRACTED_FILE_TEXT_LIMIT);
  } finally {
    await parser.destroy().catch(() => {});
  }
}

function detectExtractableFileType(filePath = "", fileName = "", mimeType = "") {
  const lowerPath = String(filePath || "").trim().toLowerCase();
  const lowerName = String(fileName || "").trim().toLowerCase();
  const lowerMimeType = String(mimeType || "").trim().toLowerCase();

  if (
    lowerMimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx") ||
    lowerPath.endsWith(".docx")
  ) {
    return "docx";
  }

  if (
    lowerMimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    lowerName.endsWith(".pptx") ||
    lowerPath.endsWith(".pptx")
  ) {
    return "pptx";
  }

  if (lowerMimeType === "application/pdf" || lowerName.endsWith(".pdf") || lowerPath.endsWith(".pdf")) {
    return "pdf";
  }

  return "";
}

async function readSupportedFileText(filePath, fileName, mimeType) {
  const fileType = detectExtractableFileType(filePath, fileName, mimeType);
  if (!fileType) throw new Error("Unsupported file type");

  const readers = {
    docx: readDocxText,
    pptx: readPptxText,
    pdf: readPdfText,
  };

  const text = await readers[fileType](filePath);
  return {
    fileType,
    text,
  };
}

module.exports = {
  EXTRACTED_FILE_TEXT_LIMIT,
  detectExtractableFileType,
  readSupportedFileText,
};
