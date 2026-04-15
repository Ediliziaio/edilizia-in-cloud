/**
 * TextWidget — widget per contenuti testuali e markdown.
 *
 * Parser markdown inline super-leggero (no dipendenze) che copre i casi più
 * comuni: intestazioni, grassetto, corsivo, codice inline, link, liste
 * puntate / numerate, righe orizzontali e paragrafi. Per tutto ciò che non
 * matcha viene stampato testo preservando a-capo e spazi.
 *
 * ⚠️  L'HTML generato è costruito server-side da stringhe controllate: ogni
 * testo utente passa da `escapeHtml` prima del rimpiazzo inline per evitare
 * XSS.
 */
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { DashboardWidget } from "@/lib/dashboardBuilder/types";

interface Props {
  widget: DashboardWidget;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Converte una stringa "inline markdown" (senza newline) in HTML sicuro.
 * Supporta: **bold**, *italic* / _italic_, `code`, [testo](url).
 */
function inlineMd(src: string): string {
  let s = escapeHtml(src);
  // Link [text](url) - accetta solo http(s) e mailto per sicurezza
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">$1</a>',
  );
  // Bold **...**
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italic *...* o _..._  (evita conflitto con **)
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
  // Codice inline
  s = s.replace(
    /`([^`]+)`/g,
    '<code class="px-1 py-0.5 rounded bg-muted text-[0.85em] font-mono">$1</code>',
  );
  return s;
}

/** Converte markdown multiriga in HTML. */
function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let listBuf: string[] | null = null;
  let listType: "ul" | "ol" | null = null;
  let paraBuf: string[] = [];

  const flushList = () => {
    if (listBuf && listType) {
      const cls =
        listType === "ul"
          ? "list-disc pl-5 space-y-0.5"
          : "list-decimal pl-5 space-y-0.5";
      out.push(`<${listType} class="${cls}">${listBuf.join("")}</${listType}>`);
    }
    listBuf = null;
    listType = null;
  };

  const flushPara = () => {
    if (paraBuf.length > 0) {
      out.push(
        `<p class="leading-relaxed">${paraBuf.map(inlineMd).join("<br/>")}</p>`,
      );
      paraBuf = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.trim() === "") {
      flushList();
      flushPara();
      continue;
    }

    // Heading ###### ... #
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushList();
      flushPara();
      const level = h[1].length;
      const sizes = [
        "text-base font-bold mt-2",
        "text-base font-bold mt-2",
        "text-sm font-bold mt-2",
        "text-sm font-semibold mt-1",
        "text-xs font-semibold mt-1",
        "text-xs font-semibold mt-1",
      ];
      out.push(
        `<h${level} class="${sizes[level - 1]}">${inlineMd(h[2])}</h${level}>`,
      );
      continue;
    }

    // Horizontal rule
    if (/^\s*---+\s*$/.test(line)) {
      flushList();
      flushPara();
      out.push('<hr class="my-2 border-border" />');
      continue;
    }

    // Unordered list: -  o  *
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      flushPara();
      if (listType !== "ul") {
        flushList();
        listType = "ul";
        listBuf = [];
      }
      listBuf!.push(`<li>${inlineMd(ul[1])}</li>`);
      continue;
    }

    // Ordered list: 1. / 2. / ...
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      flushPara();
      if (listType !== "ol") {
        flushList();
        listType = "ol";
        listBuf = [];
      }
      listBuf!.push(`<li>${inlineMd(ol[1])}</li>`);
      continue;
    }

    // Paragrafo accumulato
    flushList();
    paraBuf.push(line);
  }

  flushList();
  flushPara();

  return out.join("");
}

export function TextWidget({ widget }: Props) {
  const cfg = widget.config ?? {};
  const title = cfg.title;
  // `markdown` ha priorità; fallback a `text` / `subtitle` per retrocompat.
  const source = cfg.markdown ?? cfg.text ?? cfg.subtitle ?? "";

  const html = useMemo(() => renderMarkdown(source), [source]);

  return (
    <Card className="h-full flex flex-col">
      <CardContent className="flex-1 p-4 overflow-auto">
        {title && <h3 className="text-sm font-semibold mb-2">{title}</h3>}
        <div
          className="text-xs text-foreground/80 space-y-2 [&_a]:text-primary [&_a]:underline"
          // La stringa è passata da `renderMarkdown` che escapa l'input
          // utente: è sicuro iniettarla.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </CardContent>
    </Card>
  );
}

export function DividerWidget({ widget }: Props) {
  const cfg = widget.config ?? {};
  const label = cfg.title;

  if (label) {
    return (
      <div className="h-full flex items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">
          {label}
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>
    );
  }

  return (
    <div className="h-full flex items-center">
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
