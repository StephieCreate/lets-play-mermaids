export type FontFamilyKey = 'inter' | 'lexend' | 'atkinson' | 'comic';
export type FontSizeKey = 'small' | 'medium' | 'large' | 'xlarge' | 'jumbo';
export type LineHeightKey = 'compact' | 'comfortable' | 'relaxed';

export interface FontOption {
  key: FontFamilyKey;
  label: string;
  description: string;
  className: string;
}

export const FONT_OPTIONS: FontOption[] = [
  { key: 'inter', label: 'Inter', description: 'Clean and modern', className: 'font-read-inter' },
  { key: 'lexend', label: 'Lexend', description: 'Dyslexic-friendly, wider spacing', className: 'font-read-lexend' },
  { key: 'atkinson', label: 'Atkinson Hyperlegible', description: 'Designed for low vision', className: 'font-read-atkinson' },
  { key: 'comic', label: 'Comic Neue', description: 'Casual, easy to read', className: 'font-read-comic' },
];

export interface FontSizeOption {
  key: FontSizeKey;
  label: string;
  px: string;
}

export const FONT_SIZE_OPTIONS: FontSizeOption[] = [
  { key: 'small', label: 'Small', px: '0.875rem' },
  { key: 'medium', label: 'Medium', px: '1rem' },
  { key: 'large', label: 'Large', px: '1.125rem' },
  { key: 'xlarge', label: 'Extra Large', px: '1.3125rem' },
  { key: 'jumbo', label: 'Jumbo', px: '1.625rem' },
];

export interface LineHeightOption {
  key: LineHeightKey;
  label: string;
  description: string;
  value: string;
}

export const LINE_HEIGHT_OPTIONS: LineHeightOption[] = [
  { key: 'compact', label: 'Compact', description: 'Tighter lines', value: '1.5' },
  { key: 'comfortable', label: 'Comfortable', description: 'Balanced spacing', value: '1.75' },
  { key: 'relaxed', label: 'Relaxed', description: 'Airy and easy to scan', value: '2' },
];

export interface ReadingPreferences {
  family: FontFamilyKey;
  size: FontSizeKey;
  lineHeight: LineHeightKey;
}

export const DEFAULT_READING_PREFERENCES: ReadingPreferences = {
  family: 'lexend',
  size: 'medium',
  lineHeight: 'comfortable',
};

export function toReadingPreferences(raw: { family?: unknown; size?: unknown; lineHeight?: unknown }): ReadingPreferences {
  return {
    family: FONT_OPTIONS.some((o) => o.key === raw.family)
      ? (raw.family as FontFamilyKey)
      : DEFAULT_READING_PREFERENCES.family,
    size: FONT_SIZE_OPTIONS.some((o) => o.key === raw.size)
      ? (raw.size as FontSizeKey)
      : DEFAULT_READING_PREFERENCES.size,
    lineHeight: LINE_HEIGHT_OPTIONS.some((o) => o.key === raw.lineHeight)
      ? (raw.lineHeight as LineHeightKey)
      : DEFAULT_READING_PREFERENCES.lineHeight,
  };
}
