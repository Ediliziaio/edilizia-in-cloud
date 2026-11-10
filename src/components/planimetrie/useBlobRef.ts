import { useCallback, useRef } from "react";

/** Il nodo può arrivare dopo il mount (Dialog/Portal). Libera l'URL al distacco. */
export function useBlobRef<T extends HTMLElement>(file: Blob | undefined, attributo: "src" | "href") {
  const url = useRef<string | null>(null);
  return useCallback((nodo: T | null) => {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = nodo && file ? URL.createObjectURL(file) : null;
    if (nodo && url.current) nodo.setAttribute(attributo, url.current);
  }, [file, attributo]);
}
