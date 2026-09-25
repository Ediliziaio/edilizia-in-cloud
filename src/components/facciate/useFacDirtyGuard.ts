import { useContext, useEffect, useRef } from "react";
import { UNSAFE_NavigationContext, useLocation } from "react-router-dom";

function identity(url: URL): string {
  const p = new URLSearchParams(url.search);
  p.delete("section"); // Switching native editor pages must retain the unsaved form.
  p.sort();
  return `${url.pathname}?${p.toString()}`;
}

/** BrowserRouter-compatible guard: links, push/replace, navigate(delta), back/forward and reload. */
export function useFacDirtyGuard(dirty: boolean, onDiscard?: () => void) {
  const discardRef = useRef(onDiscard);
  discardRef.current = onDiscard;
  const context = useContext(UNSAFE_NavigationContext);
  const location = useLocation();
  const current = useRef(location);
  current.current = location;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!context) return;
    const navigator = context.navigator;
    const push = navigator.push, replace = navigator.replace, go = navigator.go;
    const permit = () => {
      if (!dirtyRef.current) return true;
      if (!window.confirm("Uscire senza salvare le modifiche al modulo Facciate?")) return false;
      dirtyRef.current = false;
      discardRef.current?.();
      return true;
    };
    const changesDocument = (to: Parameters<typeof push>[0]) => {
      const origin = window.location.origin;
      const from = new URL(`${current.current.pathname}${current.current.search}`, origin);
      const next = typeof to === "string" ? new URL(to, from) : new URL(`${to.pathname ?? from.pathname}${to.search ?? ""}`, origin);
      return identity(from) !== identity(next);
    };
    navigator.push = (...args) => { if (!changesDocument(args[0]) || permit()) push.apply(navigator, args); };
    navigator.replace = (...args) => { if (!changesDocument(args[0]) || permit()) replace.apply(navigator, args); };
    navigator.go = delta => { if (permit()) go.call(navigator, delta); };
    let index = window.history.state?.idx as number | undefined;
    let restoring = false;
    const pop = (event: PopStateEvent) => {
      const nextIndex = event.state?.idx as number | undefined;
      if (restoring) { restoring = false; event.stopImmediatePropagation(); return; }
      const from = new URL(`${current.current.pathname}${current.current.search}`, window.location.origin);
      if (identity(from) !== identity(new URL(window.location.href)) && dirtyRef.current) {
        // Stop before opening a native modal: history traversal may otherwise reach
        // React Router while the browser's confirm event loop is suspended.
        event.stopImmediatePropagation();
        if (permit()) {
          index = nextIndex;
          window.dispatchEvent(new PopStateEvent("popstate", { state: event.state }));
          return;
        }
        if (typeof index === "number" && typeof nextIndex === "number" && index !== nextIndex) {
          restoring = true; window.history.go(index - nextIndex);
        }
        return;
      }
      index = nextIndex;
    };
    const clicks = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.download || target.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey) return;
      if (!target.href.startsWith("http")) return;
      const from = new URL(`${current.current.pathname}${current.current.search}`, window.location.origin);
      const next = new URL(target.href);
      if ((next.origin !== from.origin || identity(next) !== identity(from)) && !permit()) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    };
    const unload = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("popstate", pop, true);
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", clicks, true);
    return () => {
      navigator.push = push; navigator.replace = replace; navigator.go = go;
      window.removeEventListener("popstate", pop, true); window.removeEventListener("beforeunload", unload); document.removeEventListener("click", clicks, true);
    };
  }, [context, location.key]);
}
