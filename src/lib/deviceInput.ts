import type { KeyboardEvent } from 'react';

// Touch-primary device detection. Desktop browsers (even narrow windows) keep
// a fine pointer and hover capability, so they never match the media query.
export function isTouchMobileDevice(): boolean {
  try {
    if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) return true;
  } catch {
    // matchMedia unavailable — fall through to UA fallback below
  }
  try {
    const isMobileUa = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
    return isMobileUa && window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

// Shared Enter-key matrix for all chat textareas:
// - IME composition: never intercept
// - Mobile: Enter always inserts a new line; sending happens via the Send button
// - Desktop: Enter submits, Shift+Enter inserts a new line
export function handleChatKeyDown(e: KeyboardEvent<HTMLTextAreaElement>, submit: () => void): void {
  if (e.nativeEvent.isComposing) return;
  if (e.key !== 'Enter') return;
  if (e.shiftKey) return;
  if (isTouchMobileDevice()) return;
  e.preventDefault();
  submit();
}
