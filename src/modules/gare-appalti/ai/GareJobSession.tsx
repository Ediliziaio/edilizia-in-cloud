import { useEffect } from 'react';
import { useWorkspace } from '../WorkspaceContext';

// Long-running jobs reuse the user's current access token in memory.
export function GareJobSession(): null {
  const { api } = useWorkspace();
  useEffect(() => {
    let pending = false;
    async function renew() {
      if (pending) return;
      pending = true;
      try {
        await api.ai('renew', {});
      } catch {
        // The AI panel shows interrupted jobs and lets the user resume them.
      } finally {
        pending = false;
      }
    }
    const interval = window.setInterval(renew, 45_000);
    return () => window.clearInterval(interval);
  }, [api]);
  return null;
}
