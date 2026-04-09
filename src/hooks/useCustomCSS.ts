/**
 * useCustomCSS — Inietta CSS custom dalla company_branding.custom_css
 * Usato nei layout CompanyLayout e CustomerLayout per white-label avanzato.
 */
import { useEffect, useRef } from "react";
import { useBranding } from "@/hooks/useBranding";

export function useCustomCSS() {
  const { branding } = useBranding();
  const styleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    const customCSS = branding?.custom_css;

    // Remove previous injected style
    if (styleRef.current) {
      styleRef.current.remove();
      styleRef.current = null;
    }

    if (!customCSS || typeof customCSS !== "string" || customCSS.trim().length === 0) {
      return;
    }

    // Sanitize: strip script tags and @import
    const sanitized = customCSS
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/@import\s+[^;]+;/gi, "/* @import blocked */");

    const style = document.createElement("style");
    style.setAttribute("data-custom-css", "true");
    style.textContent = sanitized;
    document.head.appendChild(style);
    styleRef.current = style;

    return () => {
      if (styleRef.current) {
        styleRef.current.remove();
        styleRef.current = null;
      }
    };
  }, [branding?.custom_css]);
}
