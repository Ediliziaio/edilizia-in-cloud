import { NavLink as RouterNavLink, NavLinkProps } from "react-router-dom";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { preloadRoute } from "@/lib/routePreload";

interface NavLinkCompatProps extends Omit<NavLinkProps, "className"> {
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
}

// Estrae un pathname dalla prop `to` (stringa o oggetto To) per il prefetch.
function hrefOf(to: NavLinkProps["to"]): string | null {
  if (typeof to === "string") return to;
  return to?.pathname ?? null;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, pendingClassName, to, onMouseEnter, onFocus, ...props }, ref) => {
    // Prefetch best-effort del chunk della rotta al hover/focus (vedi routePreload).
    const warm = () => preloadRoute(hrefOf(to));
    return (
      <RouterNavLink
        ref={ref}
        to={to}
        className={({ isActive, isPending }) =>
          cn(className, isActive && activeClassName, isPending && pendingClassName)
        }
        onMouseEnter={(e) => { warm(); onMouseEnter?.(e); }}
        onFocus={(e) => { warm(); onFocus?.(e); }}
        {...props}
      />
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
