import { useCallback, useEffect, useRef, useState } from "react";

/** Follow replies only while the reader is at the bottom; never steal their place. */
export function useSilvioChatScroll({ open, channelId, latestMessage, hasMessages }: {
  open: boolean;
  channelId: string | null | undefined;
  latestMessage: string;
  hasMessages: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const initialized = useRef(false);
  const previousMessage = useRef(latestMessage);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [hasNewReply, setHasNewReply] = useState(false);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    following.current = true;
    setShowScrollDown(false);
    setHasNewReply(false);
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
    following.current = nearBottom;
    setShowScrollDown(!nearBottom);
    if (nearBottom) setHasNewReply(false);
  }, []);

  useEffect(() => {
    initialized.current = false;
    // The channel/open transition resets an external DOM scroll position and its indicator together.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    scrollToBottom();
  }, [open, channelId, scrollToBottom]);

  useEffect(() => {
    if (!open || !hasMessages) return;
    if (!initialized.current || following.current) {
      scrollToBottom();
      initialized.current = true;
    } else if (latestMessage !== previousMessage.current) {
      setHasNewReply(true);
    }
    previousMessage.current = latestMessage;
  }, [open, channelId, latestMessage, hasMessages, scrollToBottom]);

  // Images, expanded sources and typewriter text may grow after the render.
  useEffect(() => {
    if (!open || !contentRef.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (following.current) scrollToBottom();
    });
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [open, channelId, scrollToBottom]);

  return { scrollRef, contentRef, onScroll, scrollToBottom, showScrollDown, hasNewReply };
}
