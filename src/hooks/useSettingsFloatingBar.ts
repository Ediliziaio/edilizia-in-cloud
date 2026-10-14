import { useEffect, useRef, useState, type CSSProperties } from "react";

/** Su desktop il layout azienda scorre nel documento, ma i suoi contenitori
 * overflow impediscono a sticky di seguirlo. Fissa solo questa barra quando
 * esce in alto, conservandone spazio e larghezza. Su mobile resta sticky. */
export function useSettingsFloatingBar() {
  const contenitore = useRef<HTMLDivElement>(null);
  const barra = useRef<HTMLDivElement>(null);
  const [posizione, setPosizione] = useState<{ left: number; width: number; height: number } | null>(null);

  useEffect(() => {
    let frame = 0;
    const misura = () => {
      frame = 0;
      if (!contenitore.current || !barra.current) return;
      const rect = contenitore.current.getBoundingClientRect();
      const next = window.innerWidth >= 768 && rect.top < 8
        ? { left: rect.left, width: rect.width, height: barra.current.getBoundingClientRect().height }
        : null;
      setPosizione(previous => {
        if (!previous && !next) return previous;
        if (previous && next && previous.left === next.left && previous.width === next.width && previous.height === next.height) return previous;
        return next;
      });
    };
    const pianifica = () => {
      if (!frame) frame = window.requestAnimationFrame(misura);
    };
    misura();
    window.addEventListener("scroll", pianifica, true);
    window.addEventListener("resize", pianifica);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(pianifica);
    if (contenitore.current) observer?.observe(contenitore.current);
    if (barra.current) observer?.observe(barra.current);
    return () => {
      window.removeEventListener("scroll", pianifica, true);
      window.removeEventListener("resize", pianifica);
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const stile: CSSProperties | undefined = posizione
    ? { position: "fixed", top: 8, left: posizione.left, width: posizione.width }
    : undefined;
  return { contenitore, barra, stile, altezza: posizione?.height };
}
