import { useEffect, useState, type RefObject } from 'react';

/** Follow replies only while the reader is already at the end. */
export function useQuoteChatScroll(log: RefObject<HTMLDivElement>, token: string, active: boolean) {
  const [following, setFollowing] = useState(true);
  const [lastSeen, setLastSeen] = useState(token);
  useEffect(() => {
    const element = log.current;
    if (active && following && element) element.scrollTo?.({ top: element.scrollHeight, behavior: 'auto' });
  }, [log, token, active, following]);
  const onScroll = () => {
    const element = log.current; if (!element) return;
    const bottom = element.scrollHeight - element.scrollTop - element.clientHeight <= 96;
    setFollowing(bottom); if (bottom) setLastSeen(token);
  };
  const jumpToLatest = () => {
    setFollowing(true); setLastSeen(token);
    const element = log.current;
    if (element) element.scrollTo?.({ top: element.scrollHeight, behavior: 'auto' });
  };
  return { onScroll, jumpToLatest, followNextMessage: () => setFollowing(true), unread: !following && token !== lastSeen };
}
