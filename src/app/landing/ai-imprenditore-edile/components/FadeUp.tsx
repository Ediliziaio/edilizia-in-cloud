import { createElement, useRef, type CSSProperties, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP, ScrollTrigger);

type FadeUpProps = {
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  children: ReactNode;
  transition?: { delay?: number };
  style?: CSSProperties;
  id?: string;
  role?: string;
  "aria-label"?: string;
};

export function FadeUp({ as = "div", className, children, transition, ...props }: FadeUpProps) {
  const ref = useRef<HTMLElement | null>(null);

  useGSAP(() => {
    const element = ref.current;
    if (!element) return;

    const motion = gsap.matchMedia();
    const delay = transition?.delay ?? 0;

    motion.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(element, { opacity: 1, y: 0, clearProps: "transform" });
    });

    motion.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(
        element,
        { autoAlpha: 0, y: 30 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.72,
          delay,
          ease: "power3.out",
          clearProps: "opacity,visibility,transform",
          scrollTrigger: {
            trigger: element,
            start: "top 84%",
            once: true,
          },
        },
      );
    });

    return () => motion.revert();
  }, { scope: ref, dependencies: [transition?.delay] });

  return createElement(as, { ref, className: cn(className), ...props }, children);
}

export const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

export const staggerItem = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};
