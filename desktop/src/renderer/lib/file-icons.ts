import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileCog,
  FileImage,
  FileJson,
  FileLock,
  FileSpreadsheet,
  FileTerminal,
  FileText,
  FileType,
  FileVideo,
  Folder,
  type LucideIcon,
} from "lucide-react";

const SPREADSHEET_EXTS = new Set(["csv", "xlsx", "xls", "tsv", "numbers", "ods"]);
const TEXT_EXTS = new Set(["txt", "md", "mdx", "rst", "adoc", "tex", "rtf", "org"]);
const DOC_EXTS = new Set(["pdf", "doc", "docx", "odt", "pages"]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "tiff", "avif", "heic"]);
const VIDEO_EXTS = new Set(["mp4", "mov", "webm", "mkv", "avi", "m4v"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "m4a", "aac", "flac", "ogg", "opus"]);
const ARCHIVE_EXTS = new Set(["zip", "tar", "gz", "bz2", "7z", "rar", "xz"]);
const JSON_EXTS = new Set(["json", "jsonc", "json5"]);
const CODE_EXTS = new Set([
  "js", "mjs", "cjs", "ts", "jsx", "tsx",
  "py", "rb", "go", "rs", "java", "kt", "kts", "scala", "swift",
  "c", "h", "cc", "cpp", "cxx", "hpp", "hxx", "m", "mm",
  "cs", "fs", "fsx", "vb",
  "php", "lua", "pl", "pm", "r", "jl", "dart", "ex", "exs", "erl",
  "vue", "svelte", "astro", "hbs", "mustache",
  "html", "htm", "css", "scss", "sass", "less", "styl",
  "xml", "xsd", "xslt", "gql", "graphql", "proto",
  "sql",
]);
const SHELL_EXTS = new Set(["sh", "bash", "zsh", "fish", "ps1", "bat", "cmd"]);
const CONFIG_EXTS = new Set(["yaml", "yml", "toml", "ini", "env", "conf", "cfg", "properties"]);
const LOCK_EXTS = new Set(["lock"]);
const FONT_EXTS = new Set(["ttf", "otf", "woff", "woff2", "eot"]);

const SPECIAL_FILES: Record<string, LucideIcon> = {
  dockerfile: FileCog,
  makefile: FileCog,
  rakefile: FileCog,
  procfile: FileCog,
  gemfile: FileCog,
  "package.json": FileJson,
  "package-lock.json": FileLock,
  "pnpm-lock.yaml": FileLock,
  "yarn.lock": FileLock,
  "bun.lockb": FileLock,
  "cargo.lock": FileLock,
  "poetry.lock": FileLock,
  "tsconfig.json": FileCog,
  ".gitignore": FileCog,
  ".env": FileCog,
  "readme.md": FileText,
};

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 1) return "";
  return filename.slice(dot + 1).toLowerCase();
}

function getBaseName(filename: string): string {
  const slash = Math.max(filename.lastIndexOf("/"), filename.lastIndexOf("\\"));
  return (slash >= 0 ? filename.slice(slash + 1) : filename).toLowerCase();
}

export function getFileIcon(filename: string, isDirectory = false): LucideIcon {
  if (isDirectory) return Folder;

  const base = getBaseName(filename);
  if (SPECIAL_FILES[base]) return SPECIAL_FILES[base];

  const ext = getExtension(filename);
  if (!ext) return File;
  if (JSON_EXTS.has(ext)) return FileJson;
  if (LOCK_EXTS.has(ext)) return FileLock;
  if (SHELL_EXTS.has(ext)) return FileTerminal;
  if (CONFIG_EXTS.has(ext)) return FileCog;
  if (CODE_EXTS.has(ext)) return FileCode;
  if (SPREADSHEET_EXTS.has(ext)) return FileSpreadsheet;
  if (TEXT_EXTS.has(ext)) return FileText;
  if (DOC_EXTS.has(ext)) return FileText;
  if (IMAGE_EXTS.has(ext)) return FileImage;
  if (VIDEO_EXTS.has(ext)) return FileVideo;
  if (AUDIO_EXTS.has(ext)) return FileAudio;
  if (ARCHIVE_EXTS.has(ext)) return FileArchive;
  if (FONT_EXTS.has(ext)) return FileType;
  return File;
}

const LABELS: Record<string, string> = {
  csv: "Spreadsheet", xlsx: "Spreadsheet", xls: "Spreadsheet", tsv: "Spreadsheet", numbers: "Spreadsheet", ods: "Spreadsheet",
  txt: "Text", md: "Markdown", mdx: "MDX", html: "Web Page", htm: "Web Page", pdf: "PDF", rtf: "Rich Text",
  doc: "Word", docx: "Word", odt: "Document", tex: "LaTeX",
  json: "JSON", jsonc: "JSON", json5: "JSON", xml: "XML", yaml: "YAML", yml: "YAML", toml: "TOML",
  png: "Image", jpg: "Image", jpeg: "Image", gif: "Image", svg: "SVG", webp: "Image", avif: "Image",
  mp4: "Video", mov: "Video", webm: "Video", mkv: "Video",
  mp3: "Audio", wav: "Audio", m4a: "Audio", flac: "Audio",
  zip: "Archive", tar: "Archive", gz: "Archive", "7z": "Archive",
  js: "JavaScript", mjs: "JavaScript", cjs: "JavaScript", ts: "TypeScript", jsx: "JSX", tsx: "TSX",
  py: "Python", rb: "Ruby", go: "Go", rs: "Rust", sh: "Shell", sql: "SQL",
  css: "CSS", scss: "Sass", less: "Less",
  vue: "Vue", svelte: "Svelte",
  java: "Java", kt: "Kotlin", swift: "Swift", cpp: "C++", c: "C", cs: "C#",
  php: "PHP", lua: "Lua",
  env: "Env",
  ttf: "Font", otf: "Font", woff: "Font", woff2: "Font",
};

export function getFileLabel(filename: string, isDirectory = false): string {
  if (isDirectory) return "Folder";
  const ext = getExtension(filename);
  return LABELS[ext] ?? (ext ? ext.toUpperCase() : "File");
}
