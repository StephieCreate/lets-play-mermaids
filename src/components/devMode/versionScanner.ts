export interface DevFile {
  id: string;
  kind: 'rule' | 'apex';
  dbId: string;
  slug: string;
  title: string;
  category: string;
  content: string;
  updatedAt: string;
}

export interface CartridgeSnapshot {
  version: string;
  uploadedAt: string;
  contents: Record<string, string>;
}

export type ChangeStatus = 'unchanged' | 'modified' | 'new';

export interface ScanRow {
  file: DevFile;
  versionTag: string;
  status: ChangeStatus;
  recommendation: string;
}

// Matches version-labeled lines like:
// "System Version: Let's Play Mermaids! - Universal Core Engine (Vrs 5.8.0)"
// "**Plugin Version:** Kial — Ver. 2.1"
// "Lore Version: 1.4.2", "Core Version #3.0", "Release: 2.1", "Build: 1.0"
const VERSION_LABEL_LINE =
  /\b(?:(?:system|core|engine|rule|rules|file|doc|document|plugin|apex|triad|npc|lore|world|template|module|cartridge|patch|current|latest|game)\s+)?(?:version|vers\.?|ver\.?|vrs\.?|release|revision|rev\.?|build)\b\s*[:#\-–—]?/i;

// Matches explicit version tokens like:
// "Vrs 5.8.0", "Vrs. 2.1", "Vrs: 1.4", "Ver 3.0", "Version 2.2", "Rev 1.1", "v5.8.0", "V5.8", "v. 1.2"
const EXPLICIT_VERSION_TOKEN =
  /(?:\b(?:vrs|vers|ver|version|rev)\.?\s*[:#\-–—]?\s*|\bv\.\s*|\bv)(\d+\.\d+(?:\.\d+)?)\b/i;

// Fallback for a bare semantic version on an already-labeled version line (e.g. "System Version: 5.8.0")
const BARE_SEMVER = /\b(\d+\.\d+(?:\.\d+)?)\b/;

function cleanLine(line: string): string {
  return line.replace(/[*_`~]/g, '').trim();
}

function extractVersionFromLines(lines: string[]): string {
  // Pass 1: Look for lines that have an explicit version title/label
  for (const rawLine of lines) {
    const line = cleanLine(rawLine);
    if (!line || !VERSION_LABEL_LINE.test(line)) continue;

    // Prefer an explicit token on that line first (e.g. "Vrs 5.8.0" inside a System Version line)
    const explicit = line.match(EXPLICIT_VERSION_TOKEN);
    if (explicit) return explicit[1];

    // Otherwise grab the first semantic version appearing after the label
    const labelMatch = line.match(VERSION_LABEL_LINE);
    if (labelMatch && labelMatch.index !== undefined) {
      const afterLabel = line.slice(labelMatch.index + labelMatch[0].length);
      const bare = afterLabel.match(BARE_SEMVER);
      if (bare) return bare[1];
    }
  }

  // Pass 2: Look for any standalone explicit version token (e.g. "# Kial (Vrs 2.1)" or "v5.7.0")
  for (const rawLine of lines) {
    const line = cleanLine(rawLine);
    if (!line) continue;
    const explicit = line.match(EXPLICIT_VERSION_TOKEN);
    if (explicit) return explicit[1];
  }

  return '';
}

export function detectVersionTag(content: string, title = ''): string {
  const allLines = (content ?? '').split(/\r?\n/);
  const headerLines = allLines.slice(0, 30);

  // 1. Check the top header of the document first so changelog mentions don't override it
  const fromHeader = extractVersionFromLines(headerLines);
  if (fromHeader) return fromHeader;

  // 2. Check the document title if provided
  if (title) {
    const fromTitle = extractVersionFromLines([title]);
    if (fromTitle) return fromTitle;
  }

  // 3. Fallback: scan the rest of the document (in case a file stamps its version at the bottom)
  if (allLines.length > 30) {
    return extractVersionFromLines(allLines.slice(30));
  }

  return '';
}

export function bumpVersion(tag: string): string {
  const parts = tag.split('.').map((part) => parseInt(part, 10) || 0);
  parts[parts.length - 1] = parts[parts.length - 1] + 1;
  return parts.join('.');
}

export function recommendBump(tag: string, status: ChangeStatus = 'modified'): string {
  if (!tag) return 'Add v1.0';
  if (status === 'unchanged') return 'No bump needed';
  return `v${tag} → v${bumpVersion(tag)}`;
}

export function nextCartridgeVersion(
  cartridge: CartridgeSnapshot | null,
  files: DevFile[],
): string {
  if (cartridge?.version) {
    const tag = detectVersionTag(cartridge.version) || cartridge.version.replace(/^v/i, '').trim();
    if (/^\d+\.\d+/.test(tag)) return `v${bumpVersion(tag)}`;
  }
  let highest = '';
  for (const file of files) {
    const tag = detectVersionTag(file.content, file.title);
    if (tag && compareTags(tag, highest) > 0) highest = tag;
  }
  if (highest) return `v${bumpVersion(highest)}`;
  return 'v1.0';
}

function compareTags(a: string, b: string): number {
  if (!b) return 1;
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, '\n').trim();
}

export function scanFiles(
  files: DevFile[],
  cartridge: CartridgeSnapshot | null,
  baseline: Record<string, string>,
): ScanRow[] {
  return files.map((file) => {
    const versionTag = detectVersionTag(file.content, file.title);
    const inCartridge = cartridge
      ? Object.prototype.hasOwnProperty.call(cartridge.contents, file.slug)
      : false;
    const cartridgeContent = inCartridge && cartridge ? cartridge.contents[file.slug] : null;
    const baselineContent = Object.prototype.hasOwnProperty.call(baseline, file.slug)
      ? baseline[file.slug]
      : null;

    const normalizedCurrent = normalizeText(file.content);

    let status: ChangeStatus;
    if (!inCartridge) {
      status = 'new';
    } else if (
      (cartridgeContent !== null && normalizeText(cartridgeContent) !== normalizedCurrent) ||
      (baselineContent !== null && normalizeText(baselineContent) !== normalizedCurrent)
    ) {
      status = 'modified';
    } else {
      status = 'unchanged';
    }

    return {
      file,
      versionTag,
      status,
      recommendation: recommendBump(versionTag, status),
    };
  });
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}