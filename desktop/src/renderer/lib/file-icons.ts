import {
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  type LucideIcon,
} from "lucide-react";

const SPREADSHEET_EXTS = new Set(["csv", "xlsx", "xls", "tsv", "numbers", "ods"]);
const DOCUMENT_EXTS = new Set(["txt", "md", "html", "htm", "pdf", "rtf", "doc", "docx", "odt", "tex", "json", "xml", "yaml", "yml", "toml"]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "tiff", "avif"]);

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 1) return "";
  return filename.slice(dot + 1).toLowerCase();
}

export function getFileIcon(filename: string, isDirectory = false): LucideIcon {
  if (isDirectory) return Folder;
  const ext = getExtension(filename);
  if (SPREADSHEET_EXTS.has(ext)) return FileSpreadsheet;
  if (DOCUMENT_EXTS.has(ext)) return FileText;
  if (IMAGE_EXTS.has(ext)) return FileImage;
  return File;
}

const LABELS: Record<string, string> = {
  csv: "Spreadsheet", xlsx: "Spreadsheet", xls: "Spreadsheet", tsv: "Spreadsheet", numbers: "Spreadsheet", ods: "Spreadsheet",
  txt: "Text", md: "Markdown", html: "Web Page", htm: "Web Page", pdf: "PDF", rtf: "Rich Text",
  doc: "Word", docx: "Word", odt: "Document", tex: "LaTeX",
  json: "JSON", xml: "XML", yaml: "YAML", yml: "YAML", toml: "TOML",
  png: "Image", jpg: "Image", jpeg: "Image", gif: "Image", svg: "SVG", webp: "Image",
  js: "JavaScript", ts: "TypeScript", jsx: "JSX", tsx: "TSX",
  py: "Python", rb: "Ruby", go: "Go", rs: "Rust", sh: "Shell", sql: "SQL",
  css: "CSS",
};

export function getFileLabel(filename: string, isDirectory = false): string {
  if (isDirectory) return "Folder";
  const ext = getExtension(filename);
  return LABELS[ext] ?? (ext ? ext.toUpperCase() : "File");
}
