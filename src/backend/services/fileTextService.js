const path = require("path");
const {
  EXTRACTED_FILE_TEXT_LIMIT,
  detectExtractableFileType,
  readSupportedFileText,
} = require("../utils/fileTextExtractors");

async function extractFileText({ filePath, fileName, mimeType }) {
  const fileType = detectExtractableFileType(filePath, fileName, mimeType);
  if (!filePath) {
    const error = new Error("filePath is required");
    error.statusCode = 400;
    throw error;
  }
  if (!fileType) {
    const error = new Error("Unsupported file type for extraction");
    error.statusCode = 400;
    throw error;
  }

  const result = await readSupportedFileText(filePath, fileName, mimeType);
  return {
    ok: true,
    filePath: path.resolve(filePath),
    fileType: result.fileType,
    text: result.text,
    truncated: result.text.length >= EXTRACTED_FILE_TEXT_LIMIT,
  };
}

module.exports = {
  extractFileText,
};
