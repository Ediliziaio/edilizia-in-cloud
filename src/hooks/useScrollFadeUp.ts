import { useRef } from "react";
import { useInView } from "framer-motion";

export function useScrollFadeUp() {
  const ref = useRef<HTMLElement | null>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return {
    ref,
    initial: { opacity: 0, y: 24 },
    animate: isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 },
    transition: { duration: 0.6, ease: "easeOut" },
  };
}
