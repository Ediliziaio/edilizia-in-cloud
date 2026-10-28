import { useLayoutEffect, useRef, type ReactNode } from "react";
import "./order-view-transition.css";

/** One entrance per navigation, without remounting forms or animating the header. */
export function OrderViewTransition({
  viewKey,
  children,
}: {
  viewKey: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (
      !element?.animate ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const animation = element.animate([{ opacity: 0.72 }, { opacity: 1 }], {
      duration: 180,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
    });
    return () => animation.cancel();
  }, [viewKey]);

  return (
    <div ref={ref} data-order-view={viewKey} className="space-y-3 sm:space-y-4">
      {children}
    </div>
  );
}
