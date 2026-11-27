import { useCallback, useEffect, useRef } from 'react';

/**
 * Bottom-anchor helper for chat feeds.
 *
 * Returns a ref to attach to the scrollable feed container and a `scrollToBottom`
 * helper. Snaps to the bottom on mount, new messages, tab switches, visibility
 * changes, and rotation/resize — but never fights the user while they are scrolled
 * up reading. Uses double requestAnimationFrame so markdown/layout finishes
 * painting before the scroll lands.
 */
export function useChatScrollBottom<T extends HTMLElement>(
  messageCount: number,
  options?: {
    /** Extra event names (tab switches) that should snap to the bottom. */
    resnapSignal?: unknown;
    /** While true (e.g. feed still loading), no auto-scroll happens. */
    disabled?: boolean;
  },
) {
  const { resnapSignal, disabled = false } = options ?? {};
  const containerRef = useRef<T | null>(null);
  const stickToBottomRef = useRef(true);
  const lastCountRef = useRef(messageCount);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
        stickToBottomRef.current = true;
      });
    });
  }, []);

  // Free reading: track whether the user is near the bottom. Only scrolling
  // updates this; programmatic snaps re-arm the stick flag.
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom <= 120;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // 1 & 2. Mount / load finished / message count changed (new message or reply done).
  useEffect(() => {
    if (disabled) return;
    if (messageCount > 0 || lastCountRef.current !== messageCount) {
      scrollToBottom();
    }
    lastCountRef.current = messageCount;
  }, [messageCount, disabled, scrollToBottom]);

  // 3. Tab switch signal + returning to the visible tab.
  useEffect(() => {
    if (disabled) return;
    scrollToBottom();
  }, [resnapSignal, disabled, scrollToBottom]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') scrollToBottom();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [scrollToBottom]);

  // 4. Rotation / viewport resize. On visualViewport changes (keyboard), only
  // snap if the user was already near the bottom.
  useEffect(() => {
    function onResize() {
      scrollToBottom();
    }
    function onVisualViewportResize() {
      if (stickToBottomRef.current) scrollToBottom();
    }
    window.addEventListener('orientationchange', onResize);
    window.addEventListener('resize', onResize);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', onVisualViewportResize);
    return () => {
      window.removeEventListener('orientationchange', onResize);
      window.removeEventListener('resize', onResize);
      vv?.removeEventListener('resize', onVisualViewportResize);
    };
  }, [scrollToBottom]);

  return { containerRef, scrollToBottom };
}
