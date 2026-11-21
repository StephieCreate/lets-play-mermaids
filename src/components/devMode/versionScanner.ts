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

export function detectVersionTag(content: string): string {
  const labeled = content.match(/version\s*[:#]?\s*v?(\d+\.\d+(?:\.\d+)?)/i);
  if (labeled) return labeled[1];
  const stamped = content.match(/\bv(\d+\.\d+(?:\.\d+)?)\b/);
  return stamped ? stamped[1] : '';
}

export function bumpVersion(tag: string): string {
  const parts = tag.split('.').map((part) => parseInt(part, 10) || 0);
  parts[parts.length - 1] = parts[parts.length - 1] + 1;
  return parts.join('.');
}

export function recommendBump(tag: string): string {
  if (!tag) return 'Add v1.0';
  return `v${tag} → v${bumpVersion(tag)}`;
}

export function nextCartridgeVersion(
  cartridge: CartridgeSnapshot | null,
  files: DevFile[],
): string {
  if (cartridge?.version) {
    const tag = detectVersionTag(cartridge.version) || cartridge.version.replace(/^v/i, '');
    if (/^\d+\.\d+/.test(tag)) return `v${bumpVersion(tag)}`;
  }
  let highest = '';
  for (const file of files) {
    const tag = detectVersionTag(file.content);
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

export function scanFiles(
  files: DevFile[],
  cartridge: CartridgeSnapshot | null,
  baseline: Record<string, string>,
): ScanRow[] {
  return files.map((file) => {
    const versionTag = detectVersionTag(file.content);
    const inCartridge = cartridge
      ? Object.prototype.hasOwnProperty.call(cartridge.contents, file.slug)
      : false;
    const cartridgeContent = inCartridge && cartridge ? cartridge.contents[file.slug] : null;
    const baselineContent = Object.prototype.hasOwnProperty.call(baseline, file.slug)
      ? baseline[file.slug]
      : null;

    let status: ChangeStatus;
    if (!inCartridge) {
      status = 'new';
    } else if (cartridgeContent !== file.content || (baselineContent !== null && baselineContent !== file.content)) {
      status = 'modified';
    } else {
      status = 'unchanged';
    }

    return {
      file,
      versionTag,
      status,
      recommendation: recommendBump(versionTag),
    };
  });
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
