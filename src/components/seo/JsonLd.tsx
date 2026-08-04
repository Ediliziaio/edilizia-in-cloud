// src/components/seo/JsonLd.tsx
import { useEffect } from "react";

interface JsonLdProps {
  data: Record<string, unknown>;
  id?: string;
}

// Tipo di ritorno esplicito: senza, con noImplicitAny il compilatore alza
// TS7010 ("lacks return-type annotation, implicitly has an 'any' return
// type"). Il componente non renderizza nulla — inietta lo script nell'head —
// quindi il tipo corretto e' null.
export function JsonLd({ data, id = "jsonld-main" }: JsonLdProps): null {
  useEffect(() => {
    let script = document.getElementById(id) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = id;
      script.type = "application/ld+json";
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(data);
    return () => {
      const el = document.getElementById(id);
      if (el) el.remove();
    };
  }, [data, id]);
  return null;
}
