export interface ExportRequest {
  filename: string;
  content: string;
  mimeType: string;
}

export type ExportResult =
  | { status: 'shared' }
  | { status: 'cancelled' }
  | { status: 'downloaded' }
  | {
      status: 'needs-manual-modal';
      blob: Blob;
      filename: string;
      mimeType: string;
      content: string;
    };

// True on phones, Android tablets, and iPads. iPadOS reports "Macintosh" in
// its userAgent, so the touch-points check is required to catch it.
export function isMobileOrTablet(): boolean {
  try {
    if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
    if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) return true;
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  } catch {
    return false;
  }
}

// iOS silently rejects some MIME types on share. Fall back step by step so
// .md/.json files always make it into the share sheet.
function buildShareableFile(content: string, filename: string, mimeType: string): File | null {
  const attempts: Array<{ name: string; type: string }> = [
    { name: filename, type: mimeType },
    { name: filename, type: 'text/plain' },
    { name: filename.replace(/\.[^.]+$/, '') + '.txt', type: 'text/plain' },
  ];
  for (const attempt of attempts) {
    try {
      const file = new File([content], attempt.name, { type: attempt.type });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        return file;
      }
    } catch {
      // Try the next fallback.
    }
  }
  return null;
}

function desktopDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  // Cleanup must be delayed — a synchronous revoke can kill the download.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function exportFile({ filename, content, mimeType }: ExportRequest): Promise<ExportResult> {
  if (!isMobileOrTablet()) {
    desktopDownload(new Blob([content], { type: mimeType }), filename);
    return { status: 'downloaded' };
  }

  const shareFile = buildShareableFile(content, filename, mimeType);
  if (shareFile && typeof navigator.share === 'function') {
    // ONLY files in the payload — iOS strips the file if text/url are combined.
    try {
      await navigator.share({ files: [shareFile] });
      return { status: 'shared' };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { status: 'cancelled' };
      }
      // NotAllowedError (gesture expired) or anything else — fall through to
      // the manual modal path.
    }
  }

  return {
    status: 'needs-manual-modal',
    blob: new Blob([content], { type: mimeType }),
    filename,
    mimeType,
    content,
  };
}
