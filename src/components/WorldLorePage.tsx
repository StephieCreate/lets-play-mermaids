import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  Bold,
  ChevronDown,
  Eye,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  LockKeyhole,
  Maximize2,
  Pencil,
  Pilcrow,
  Quote,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useFontSettings } from '@/context/FontSettingsContext';
import { supabase } from '@/lib/supabase';

const LORE_SLUG = 'main';
const LORE_BUCKET = 'world-lore-images';

interface TocEntry {
  id: string;
  text: string;
  level: 1 | 2 | 3;
}

function slugifyHeading(text: string, used: Set<string>): string {
  const base =
    text
      .toLowerCase()
      .replace(/<[^>]*>/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section';
  let id = base;
  let counter = 2;
  while (used.has(id)) {
    id = `${base}-${counter}`;
    counter += 1;
  }
  used.add(id);
  return id;
}

function extractHeadings(html: string): TocEntry[] {
  if (!html.trim()) return [];
  const host = document.createElement('div');
  host.innerHTML = html;
  const used = new Set<string>();
  const entries: TocEntry[] = [];
  host.querySelectorAll('h1, h2, h3').forEach((h) => {
    const text = (h.textContent ?? '').trim();
    if (!text) return;
    const level = (h.tagName === 'H1' ? 1 : h.tagName === 'H2' ? 2 : 3) as 1 | 2 | 3;
    entries.push({ id: slugifyHeading(text, used), text, level });
  });
  return entries;
}

function sanitizeLoreHtml(html: string): string {
  const host = document.createElement('div');
  host.innerHTML = html;

  host
    .querySelectorAll('script, style, iframe, object, embed, link, meta')
    .forEach((el) => el.remove());

  host.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
      } else if (
        (name === 'href' || name === 'src') &&
        (value.startsWith('javascript:') || value.startsWith('data:text/html'))
      ) {
        el.removeAttribute(attr.name);
      }
    }
  });

  return host.innerHTML;
}

function assignHeadingIds(html: string): string {
  if (!html.trim()) return html;
  const host = document.createElement('div');
  host.innerHTML = html;
  const used = new Set<string>();
  host.querySelectorAll('h1, h2, h3').forEach((h) => {
    const text = (h.textContent ?? '').trim();
    if (!text) return;
    h.id = slugifyHeading(text, used);
    h.classList.add('scroll-mt-24');
  });
  return host.innerHTML;
}

export default function WorldLorePage({ onSignIn }: { onSignIn: () => void }) {
  const { user, isAdmin } = useAuth();
  const { fontFamilyClass, fontPx } = useFontSettings();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savedHtml, setSavedHtml] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [draftHtml, setDraftHtml] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const isDirty = editMode && draftHtml !== savedHtml;

  // Load the published lore document once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      const { data, error } = await supabase
        .from('world_lore_content')
        .select('content')
        .eq('slug', LORE_SLUG)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error('Failed to load world lore', error);
        setLoadError('The World Lore could not be loaded. Please try again.');
      } else {
        setSavedHtml(((data as { content?: string } | null)?.content) ?? '');
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const headings = useMemo(
    () => extractHeadings(editMode ? draftHtml : savedHtml),
    [editMode, draftHtml, savedHtml]
  );

  const renderedHtml = useMemo(
    () => sanitizeLoreHtml(assignHeadingIds(editMode ? draftHtml : savedHtml)),
    [editMode, draftHtml, savedHtml]
  );

  // Keep the contentEditable DOM in sync when entering edit mode or loading
  useEffect(() => {
    if (editMode && editorRef.current && editorRef.current.innerHTML !== draftHtml) {
      editorRef.current.innerHTML = draftHtml;
    }
  }, [editMode, draftHtml]);

  const enterEditMode = () => {
    setDraftHtml(savedHtml);
    setSaveError(null);
    setJustSaved(false);
    setEditMode(true);
  };

  const exitEditMode = () => {
    setEditMode(false);
    setDraftHtml('');
    setSaveError(null);
    setSelectedImage(null);
  };

  const handleEditorInput = () => {
    if (editorRef.current) {
      setDraftHtml(editorRef.current.innerHTML);
    }
  };

  const handleSave = async () => {
    if (!user || !isAdmin || saving) return;
    setSaving(true);
    setSaveError(null);
    const { error } = await supabase.from('world_lore_content').upsert(
      {
        slug: LORE_SLUG,
        content: draftHtml,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'slug' }
    );
    setSaving(false);
    if (error) {
      console.error('Failed to save world lore', error);
      setSaveError('The lore could not be saved. Please try again.');
      return;
    }
    setSavedHtml(draftHtml);
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2500);
  };

  const execCommand = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    handleEditorInput();
  };

  const insertHtml = (html: string) => {
    editorRef.current?.focus();
    document.execCommand('insertHTML', false, html);
    handleEditorInput();
  };

  const handleMakeCollapsible = () => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() ?? '';
    if (selectedText) {
      const [firstLine, ...rest] = selectedText.split('\n');
      const body = rest.join('\n').replace(/\n/g, '<br/>');
      insertHtml(
        `<details class="lore-collapsible"><summary>${firstLine}</summary><div>${body || '<br/>'}</div></details><p><br/></p>`
      );
    } else {
      insertHtml(
        `<details class="lore-collapsible"><summary>Click to expand section</summary><div><br/></div></details><p><br/></p>`
      );
    }
  };

  const handleImagePick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || uploadingImage) return;

    if (!file.type.startsWith('image/')) {
      setUploadError('That file is not an image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Images must be 5 MB or smaller.');
      return;
    }

    setUploadingImage(true);
    setUploadError(null);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
      const path = `lore/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: uploadError2 } = await supabase.storage
        .from(LORE_BUCKET)
        .upload(path, file, { contentType: file.type });
      if (uploadError2) throw uploadError2;

      const { data: urlData } = supabase.storage.from(LORE_BUCKET).getPublicUrl(path);
      const url = urlData?.publicUrl;
      if (!url) throw new Error('Could not resolve image URL');

      insertHtml(
        `<img src="${url}" alt="${file.name.replace(/"/g, '')}" style="width: 100%; max-width: 100%; height: auto;" class="rounded-xl" />`
      );
    } catch (err) {
      console.error('Image upload failed', err);
      setUploadError('The image could not be uploaded. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const removeImage = (img: HTMLImageElement) => {
    img.remove();
    setSelectedImage(null);
    handleEditorInput();
  };

  const applyImageWidth = (img: HTMLImageElement, width: string) => {
    img.setAttribute('style', `width: ${width}; max-width: 100%; height: auto;`);
    handleEditorInput();
  };

  const applyImageAlign = (img: HTMLImageElement, align: string) => {
    img.style.display = 'block';
    img.style.marginLeft = align === 'left' ? '0' : align === 'center' ? 'auto' : '0';
    img.style.marginRight = align === 'right' ? '0' : align === 'center' ? 'auto' : '0';
    handleEditorInput();
  };

  // Handle image clicks in edit mode (select + resize) and view mode (lightbox)
  const handleBodyClick = useCallback(
    (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName !== 'IMG') {
        if (selectedImage) {
          selectedImage.classList.remove('selected-image');
          setSelectedImage(null);
        }
        return;
      }
      const img = target as HTMLImageElement;
      if (editMode) {
        event.preventDefault();
        img.classList.add('selected-image');
        setSelectedImage((prev) => {
          if (prev && prev !== img) prev.classList.remove('selected-image');
          return prev === img ? null : img;
        });
      } else {
        event.preventDefault();
        setLightboxSrc(img.getAttribute('src'));
      }
    },
    [editMode, selectedImage]
  );

  // Escape key closes lightbox
  useEffect(() => {
    if (!lightboxSrc) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightboxSrc(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxSrc]);

  const scrollToHeading = (id: string) => {
    setMobileTocOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const toolbarBtn =
    'inline-flex min-h-9 min-w-9 items-center justify-center gap-1 rounded-lg border border-abyss-500/35 bg-abyss-800/50 px-2 py-1.5 text-xs font-medium text-pearl transition-colors hover:border-abyss-300/60 hover:bg-abyss-700/60 disabled:cursor-not-allowed disabled:opacity-40';

  const tocIndent: Record<number, string> = {
    1: '',
    2: 'pl-4',
    3: 'pl-8',
  };

  const emptyState = (
    <div className="glass-panel rounded-2xl p-8 text-center">
      <p className="text-sm leading-relaxed text-muted">
        The World Lore codex is still being written in the deep. Check back soon for biomes,
        currents, merfolk culture, and deep-water field notes.
      </p>
    </div>
  );

  return (
    <section className="mx-auto max-w-6xl space-y-5 py-4">
      <div className="text-center">
        <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-abyss-300">
          <Maximize2 className="h-4 w-4" />
          <span>Atlas of the Abyss</span>
        </div>
        <h2 className="font-display text-3xl font-bold text-pearl sm:text-4xl">
          World Lore
        </h2>
        <p className="mt-2 text-sm text-muted">
          Biomes, currents, merfolk culture, and deep-water field notes.
        </p>
      </div>

      {isAdmin && (
        <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={editMode ? exitEditMode : enterEditMode}
              className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                editMode
                  ? 'bg-abyss-700/60 text-pearl hover:bg-abyss-600/60'
                  : 'bg-gradient-to-r from-abyss-500 to-abyss-400 text-pearl hover:from-abyss-400 hover:to-abyss-300'
              }`}
            >
              {editMode ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
              <span>{editMode ? 'Preview' : 'Edit Lore'}</span>
            </button>
            {editMode && isDirty && (
              <span className="rounded-full bg-coral-500/15 px-2.5 py-1 text-[11px] font-semibold text-coral-300 ring-1 ring-coral-500/40">
                Unsaved changes
              </span>
            )}
            {justSaved && (
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-500/40">
                Saved
              </span>
            )}
          </div>
          {editMode && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-abyss-500 to-abyss-400 px-4 py-2 text-sm font-semibold text-pearl transition-all hover:from-abyss-400 hover:to-abyss-300 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>{saving ? 'Saving...' : 'Save Lore Changes'}</span>
            </button>
          )}
        </div>
      )}

      {uploadError && (
        <div className="flex items-center gap-2 rounded-xl border border-coral-500/30 bg-coral-900/20 px-4 py-3 text-sm text-coral-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {uploadError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
          Diving into the archives...
        </div>
      ) : loadError ? (
        <div className="glass-panel flex items-center gap-3 rounded-2xl border-coral-500/30 p-6 text-sm text-coral-300">
          <AlertCircle className="h-5 w-5 shrink-0" />
          {loadError}
        </div>
      ) : !user ? (
        <div className="glass-panel rounded-2xl p-8 text-center">
          <LockKeyhole className="mx-auto mb-4 h-8 w-8 text-abyss-300/60" />
          <h3 className="font-display text-xl font-semibold text-pearl">
            The Atlas of the Abyss
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
            Sign in to read the World Lore codex.
          </p>
          <button
            type="button"
            onClick={onSignIn}
            className="mt-5 min-h-11 rounded-xl bg-abyss-500/80 px-5 py-2.5 text-sm font-semibold text-pearl transition-colors hover:bg-abyss-400"
          >
            Sign In
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start lg:gap-6">
          {/* Desktop Table of Contents */}
          <aside className="hidden min-w-0 lg:block">
            <div className="glass-panel sticky top-24 rounded-2xl p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-abyss-300">
                <List className="h-3.5 w-3.5" />
                <span>Contents</span>
              </div>
              {headings.length === 0 ? (
                <p className="text-xs text-muted">No sections yet.</p>
              ) : (
                <ul className="space-y-0.5">
                  {headings.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => scrollToHeading(entry.id)}
                        className={`w-full rounded-lg px-2 py-1.5 text-left text-xs leading-snug text-muted transition-colors hover:bg-abyss-700/40 hover:text-pearl ${tocIndent[entry.level]}`}
                      >
                        {entry.text}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>

          <div className="min-w-0 space-y-4">
            {/* Mobile ToC toggle */}
            {headings.length > 0 && (
              <div className="lg:hidden">
                <button
                  type="button"
                  onClick={() => setMobileTocOpen((v) => !v)}
                  className="glass-panel flex min-h-11 w-full items-center justify-between rounded-xl px-4 text-sm font-medium text-pearl"
                >
                  <span className="flex items-center gap-2">
                    <List className="h-4 w-4 text-foam-400" />
                    Contents / Jump to Section
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-muted transition-transform ${mobileTocOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {mobileTocOpen && (
                  <ul className="glass-panel mt-1 space-y-0.5 rounded-xl p-2">
                    {headings.map((entry) => (
                      <li key={entry.id}>
                        <button
                          type="button"
                          onClick={() => scrollToHeading(entry.id)}
                          className={`w-full rounded-lg px-2 py-2 text-left text-xs text-muted transition-colors hover:bg-abyss-700/40 hover:text-pearl ${tocIndent[entry.level]}`}
                        >
                          {entry.text}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Admin edit toolbar */}
            {editMode && (
              <div className="glass-panel flex flex-wrap items-center gap-1.5 rounded-2xl p-3">
                <button type="button" onClick={() => execCommand('formatBlock', 'h1')} className={toolbarBtn} title="Heading 1">
                  <Heading1 className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => execCommand('formatBlock', 'h2')} className={toolbarBtn} title="Heading 2">
                  <Heading2 className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => execCommand('formatBlock', 'h3')} className={toolbarBtn} title="Heading 3">
                  <Heading3 className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => execCommand('formatBlock', 'p')} className={toolbarBtn} title="Paragraph">
                  <Pilcrow className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => execCommand('bold')} className={toolbarBtn} title="Bold">
                  <Bold className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => execCommand('italic')} className={toolbarBtn} title="Italic">
                  <Italic className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => execCommand('insertUnorderedList')} className={toolbarBtn} title="Bulleted List">
                  <List className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => execCommand('insertOrderedList')} className={toolbarBtn} title="Numbered List">
                  <ListOrdered className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => execCommand('formatBlock', 'blockquote')} className={toolbarBtn} title="Blockquote">
                  <Quote className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const url = window.prompt('Link URL:');
                    if (url) execCommand('createLink', url);
                  }}
                  className={toolbarBtn}
                  title="Insert Link"
                >
                  <Link2 className="h-4 w-4" />
                </button>
                <button type="button" onClick={handleMakeCollapsible} className={toolbarBtn} title="Make Collapsible">
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploadingImage}
                  className={toolbarBtn}
                  title="Insert Image"
                >
                  {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                </button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImagePick}
                  className="hidden"
                  aria-hidden="true"
                  tabIndex={-1}
                />
              </div>
            )}

            {/* Document: edit mode = contentEditable, view mode = sanitized render */}
            {editMode ? (
              <div className="relative">
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={handleEditorInput}
                  onClick={handleBodyClick}
                  className={`glass-panel lore-editor min-h-[32rem] rounded-2xl p-5 text-pearl focus:outline-none sm:p-6 ${fontFamilyClass} [&_details.lore-collapsible]:my-4 [&_details.lore-collapsible]:overflow-hidden [&_details.lore-collapsible]:rounded-xl [&_details.lore-collapsible]:border [&_details.lore-collapsible]:border-foam-400/30 [&_details.lore-collapsible]:bg-abyss-900/40 [&_summary]:cursor-pointer [&_summary]:list-none [&_summary]:rounded-lg [&_summary]:bg-abyss-800/60 [&_summary]:px-4 [&_summary]:py-3 [&_summary]:font-display [&_summary]:text-sm [&_summary]:font-semibold [&_summary]:text-foam-200 [&_summary::-webkit-details-marker]:hidden [&_details.lore-collapsible_div]:px-4 [&_details.lore-collapsible_div]:py-3 [&_img]:rounded-xl [&_img.selected-image]:ring-2 [&_img.selected-image]:ring-foam-400 [&_h1]:font-display [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-4 [&_blockquote]:border-foam-400/40 [&_blockquote]:pl-4 [&_blockquote]:italic`}
                  style={{ fontSize: `${fontPx}px` }}
                />
                {selectedImage && (
                  <div className="glass-panel absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-xl p-2">
                    {['25%', '50%', '75%', '100%'].map((width) => (
                      <button
                        key={width}
                        type="button"
                        onClick={() => applyImageWidth(selectedImage, width)}
                        className="rounded-lg border border-abyss-500/40 bg-abyss-800/60 px-2.5 py-1 text-xs font-medium text-pearl transition-colors hover:bg-abyss-700/70"
                      >
                        {width}
                      </button>
                    ))}
                    {[
                      { label: 'L', align: 'left' },
                      { label: 'C', align: 'center' },
                      { label: 'R', align: 'right' },
                    ].map(({ label, align }) => (
                      <button
                        key={align}
                        type="button"
                        onClick={() => applyImageAlign(selectedImage, align)}
                        className="rounded-lg border border-abyss-500/40 bg-abyss-800/60 px-2.5 py-1 text-xs font-medium text-pearl transition-colors hover:bg-abyss-700/70"
                      >
                        {label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => removeImage(selectedImage)}
                      className="rounded-lg border border-coral-500/40 bg-coral-500/10 px-2.5 py-1 text-xs font-medium text-coral-300 transition-colors hover:bg-coral-500/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div
                onClick={handleBodyClick}
                className={`glass-panel lore-view min-h-[12rem] rounded-2xl p-5 text-pearl sm:p-6 ${fontFamilyClass} [&_details.lore-collapsible]:my-4 [&_details.lore-collapsible]:overflow-hidden [&_details.lore-collapsible]:rounded-xl [&_details.lore-collapsible]:border [&_details.lore-collapsible]:border-abyss-400/25 [&_details.lore-collapsible]:bg-abyss-900/40 [&_summary]:cursor-pointer [&_summary]:list-none [&_summary]:select-none [&_summary]:rounded-lg [&_summary]:bg-abyss-800/50 [&_summary]:px-4 [&_summary]:py-3 [&_summary]:font-display [&_summary]:text-sm [&_summary]:font-semibold [&_summary]:text-foam-200 [&_summary]:transition-colors [&_summary:hover]:bg-abyss-700/60 [&_summary::-webkit-details-marker]:hidden [&_summary::before]:mr-2 [&_summary::before]:inline-block [&_summary::before]:text-[10px] [&_summary::before]:text-foam-300 [&_summary::before]:content-['▸'] [&_details[open]_summary::before]:content-['▾'] [&_details.lore-collapsible_div]:px-4 [&_details.lore-collapsible_div]:py-3 [&_details.lore-collapsible_div]:text-sm [&_details.lore-collapsible_div]:leading-relaxed [&_details.lore-collapsible_div]:text-muted [&_img]:cursor-zoom-in [&_img]:rounded-xl [&_img]:transition-opacity [&_img:hover]:opacity-90 [&_a]:text-foam-300 [&_a]:underline [&_a:hover]:text-foam-200 [&_h1]:font-display [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-pearl [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-pearl [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-pearl [&_p]:my-2 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-4 [&_blockquote]:border-foam-400/40 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted`}
                style={{ fontSize: `${fontPx}px` }}
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            )}

            {editMode && saveError && (
              <p className="text-xs font-medium text-coral-300">{saveError}</p>
            )}
          </div>
        </div>
      )}

      {/* Full-screen lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-abyss-950/90 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxSrc(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxSrc(null)}
            className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-abyss-400/40 bg-abyss-900/80 text-pearl transition-colors hover:bg-abyss-700/80"
            aria-label="Close image viewer"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightboxSrc}
            alt="Expanded lore image"
            className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </section>
  );
}
