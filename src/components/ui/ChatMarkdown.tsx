/**
 * ChatMarkdown — renderer markdown leggero per i messaggi di chat AI.
 *
 * Niente dipendenze esterne (no react-markdown). Gestisce gli elementi
 * che le risposte AI usano davvero:
 *   - Heading ### / ## / # → h3/h2/h1 (semantica + tipografia chat)
 *   - **bold** / __bold__
 *   - *italic* / _italic_
 *   - `inline code` e blocchi ```code```
 *   - Liste numerate "1. " e bullet "- " / "* "
 *   - [link](url)
 *   - --- → divider
 *   - Tabelle markdown semplici (| col1 | col2 |)
 *   - Marker citation [S1] / [S2+] → chip blu (per MP-03)
 *
 * Le righe rimangono in flusso compatto adatto al bubble chat.
 * Sicurezza: no innerHTML grezzo. Solo React nodes.
 */
import React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface ChatMarkdownSource {
  id: string;          // "S1", "S2"
  scope?: "universal" | "company";
  area?: string;
  source_type?: string;
  title: string;
  similarity: number;  // 0..1
  snippet?: string;    // primi 500 char
}

interface Props {
  content: string;
  className?: string;
  /** Sources RAG: i marker [S1], [S2]... diventano chip con tooltip popolato. */
  sources?: ChatMarkdownSource[];
}

// Context per passare le sources ai render inline (evita prop drilling)
const SourcesCtx = React.createContext<ChatMarkdownSource[] | undefined>(undefined);

export function ChatMarkdown({ content, className, sources }: Props) {
  if (!content) return null;
  return (
    <SourcesCtx.Provider value={sources}>
      <div className={className}>{renderBlocks(content)}</div>
    </SourcesCtx.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Block-level
// ─────────────────────────────────────────────────────────────────────────
function renderBlocks(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  const flushPara = (paraLines: string[]) => {
    if (paraLines.length === 0) return;
    out.push(
      <p key={`p-${key++}`} className="my-1 leading-relaxed">
        {renderInline(paraLines.join(" "))}
      </p>,
    );
  };

  let para: string[] = [];

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Code fence
    if (/^```/.test(trimmed)) {
      flushPara(para); para = [];
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      out.push(
        <pre key={`code-${key++}`} className="my-2 px-3 py-2 bg-slate-900 text-slate-100 rounded-md text-[11px] overflow-x-auto whitespace-pre-wrap">
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // Divider
    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      flushPara(para); para = [];
      out.push(<hr key={`hr-${key++}`} className="my-2 border-slate-200" />);
      i++; continue;
    }

    // Heading
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(trimmed);
    if (heading) {
      flushPara(para); para = [];
      const level = heading[1].length;
      const txt = heading[2];
      const cls =
        level === 1 ? "text-base font-bold text-slate-900 mt-3 mb-1" :
        level === 2 ? "text-sm font-bold text-slate-900 mt-2.5 mb-1" :
        level === 3 ? "text-sm font-semibold text-slate-800 mt-2 mb-0.5" :
        "text-xs font-semibold text-slate-700 mt-1.5";
      const Tag = (`h${Math.min(level, 6)}`) as keyof JSX.IntrinsicElements;
      out.push(<Tag key={`h-${key++}`} className={cls}>{renderInline(txt)}</Tag>);
      i++; continue;
    }

    // Tabella markdown semplice (header + separator + body)
    if (line.includes("|") && i + 1 < lines.length && /^[\s|:-]+$/.test(lines[i + 1].trim()) && lines[i + 1].includes("|")) {
      flushPara(para); para = [];
      const headerCells = parseTableRow(line);
      const bodyRows: string[][] = [];
      i += 2; // skip header + separator
      while (i < lines.length && lines[i].includes("|") && lines[i].trim().length > 0) {
        bodyRows.push(parseTableRow(lines[i]));
        i++;
      }
      out.push(
        <div key={`tbl-${key++}`} className="my-2 overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                {headerCells.map((c, idx) => (
                  <th key={idx} className="px-2 py-1 border border-slate-300 bg-slate-100 font-semibold text-left">
                    {renderInline(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((c, ci) => (
                    <td key={ci} className="px-2 py-1 border border-slate-200">
                      {renderInline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Lista bullet o numerata
    const isBullet = /^\s*[-*]\s+/.test(line);
    const isNumbered = /^\s*\d+\.\s+/.test(line);
    if (isBullet || isNumbered) {
      flushPara(para); para = [];
      const items: string[] = [];
      const ordered = isNumbered;
      while (i < lines.length) {
        const l = lines[i];
        const m = ordered ? /^\s*\d+\.\s+(.+)$/.exec(l) : /^\s*[-*]\s+(.+)$/.exec(l);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      const ListTag = ordered ? "ol" : "ul";
      out.push(
        React.createElement(
          ListTag,
          {
            key: `list-${key++}`,
            className: ordered
              ? "my-1 ml-5 list-decimal space-y-0.5"
              : "my-1 ml-5 list-disc space-y-0.5",
          },
          items.map((it, idx) => (
            <li key={idx} className="leading-relaxed">{renderInline(it)}</li>
          )),
        ),
      );
      continue;
    }

    // Riga vuota → flush
    if (trimmed === "") {
      flushPara(para); para = [];
      i++; continue;
    }

    // Default: linea normale → accumula nel paragrafo
    para.push(line);
    i++;
  }
  flushPara(para);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Inline-level
// ─────────────────────────────────────────────────────────────────────────
const INLINE_RE = /(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(`[^`\n]+`)|(\[[^\]\n]+\]\([^)\n]+\))|(\[S\d+\+?\])/g;

function renderInline(text: string): React.ReactNode[] {
  if (!text) return [];
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) {
      out.push(text.slice(last, m.index));
    }
    const tok = m[0];
    if (/^\*\*.+\*\*$/.test(tok) || /^__.+__$/.test(tok)) {
      out.push(<strong key={`b-${key++}`} className="font-semibold text-slate-900">{tok.slice(2, -2)}</strong>);
    } else if (/^\*[^*]+\*$/.test(tok) || /^_[^_]+_$/.test(tok)) {
      out.push(<em key={`i-${key++}`}>{tok.slice(1, -1)}</em>);
    } else if (/^`[^`]+`$/.test(tok)) {
      out.push(<code key={`c-${key++}`} className="px-1 py-0.5 bg-slate-100 rounded text-[12px] font-mono text-slate-800">{tok.slice(1, -1)}</code>);
    } else if (/^\[.+\]\(.+\)$/.test(tok)) {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
      if (lm) {
        out.push(
          <a key={`a-${key++}`} href={lm[2]} target="_blank" rel="noopener noreferrer" className="underline text-orange-600 hover:text-orange-700">
            {lm[1]}
          </a>,
        );
      } else {
        out.push(tok);
      }
    } else if (/^\[S\d+\+?\]$/.test(tok)) {
      // Citation marker MP-03 — chip cliccabile con Tooltip popolato dalle sources
      const id = tok.slice(1, -1).replace(/\+$/, "");
      out.push(<CitationChip key={`s-${key++}`} id={id} />);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\||\|$/g, "");
  return trimmed.split("|").map((c) => c.trim());
}

// ─────────────────────────────────────────────────────────────────────────
// CitationChip: marker [S1] cliccabile con Tooltip che mostra snippet+sim.
// Quando le sources NON sono fornite, fallback a chip statico stile-only.
// ─────────────────────────────────────────────────────────────────────────
function CitationChip({ id }: { id: string }) {
  const sources = React.useContext(SourcesCtx);
  const src = sources?.find((s) => s.id === id);

  if (!src) {
    // Stile passivo: mostra solo il marker
    return (
      <span className="inline-flex items-center px-1.5 py-0 mx-0.5 rounded text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200">
        {id}
      </span>
    );
  }

  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-center px-1.5 py-0 mx-0.5 rounded text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-help"
          tabIndex={0}
        >
          {id}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-sm bg-white text-slate-800 border-slate-200 shadow-xl p-2.5">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-slate-900">{src.title}</p>
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <span className="px-1 py-0.5 rounded bg-slate-100">
              {src.scope === "universal" ? `KB · ${src.area ?? "?"}` : `Azienda · ${src.source_type ?? "?"}`}
            </span>
            <span className="font-mono">sim {src.similarity.toFixed(2)}</span>
          </div>
          {src.snippet && (
            <p className="text-[11px] leading-snug text-slate-700 mt-1.5 whitespace-pre-wrap">
              {src.snippet.slice(0, 320)}
              {src.snippet.length > 320 ? "…" : ""}
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
