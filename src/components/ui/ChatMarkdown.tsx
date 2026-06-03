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
 *   - Marker citation [S1] / [S2+] → riferimento statico discreto (per MP-03)
 *
 * Le righe rimangono in flusso compatto adatto al bubble chat.
 * Sicurezza: no innerHTML grezzo. Solo React nodes.
 */
import React from "react";

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
  /** Sources RAG mantenute per compatibilita' dati, senza tooltip in chat. */
  sources?: ChatMarkdownSource[];
}

// Grafico/infografica in chat: lazy → recharts entra nel bundle solo se servono.
const SilvioChartBlock = React.lazy(() => import("@/components/silvio/SilvioChartBlock"));
const SilvioInfographicBlock = React.lazy(() => import("@/components/silvio/SilvioInfographicBlock"));

/** InfographicFence — rende un blocco ```infografica``` come card KPI brandizzata. */
function InfographicFence({ raw }: { raw: string }) {
  let spec: unknown = null;
  try { spec = JSON.parse(raw); } catch { spec = null; }
  if (!spec || typeof spec !== "object") {
    return (
      <pre className="my-2 px-3 py-2 bg-slate-900 text-slate-100 rounded-md text-[11px] overflow-x-auto whitespace-pre-wrap">
        <code>{raw}</code>
      </pre>
    );
  }
  return (
    <React.Suspense fallback={<div className="my-3 h-[120px] rounded-xl border border-slate-200 bg-slate-50 animate-pulse" />}>
      <SilvioInfographicBlock spec={spec as React.ComponentProps<typeof SilvioInfographicBlock>["spec"]} />
    </React.Suspense>
  );
}

/**
 * ChartFence — rende un blocco ```chart``` come grafico. Se il JSON non è
 * valido, ricade su un code-block (mostra comunque i dati, niente crash).
 */
function ChartFence({ raw }: { raw: string }) {
  let spec: unknown = null;
  try { spec = JSON.parse(raw); } catch { spec = null; }
  if (!spec || typeof spec !== "object") {
    return (
      <pre className="my-2 px-3 py-2 bg-slate-900 text-slate-100 rounded-md text-[11px] overflow-x-auto whitespace-pre-wrap">
        <code>{raw}</code>
      </pre>
    );
  }
  return (
    <React.Suspense fallback={<div className="my-3 h-[240px] rounded-lg border border-slate-200 bg-slate-50 animate-pulse" />}>
      <SilvioChartBlock spec={spec as React.ComponentProps<typeof SilvioChartBlock>["spec"]} />
    </React.Suspense>
  );
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

    // Code fence (con lingua: ```chart / ```grafico → grafico, altrimenti code)
    if (/^```/.test(trimmed)) {
      flushPara(para); para = [];
      const lang = trimmed.slice(3).trim().toLowerCase();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      const raw = codeLines.join("\n");
      if (lang === "chart" || lang === "grafico") {
        out.push(<ChartFence key={`chart-${key++}`} raw={raw} />);
      } else if (lang === "infografica" || lang === "infographic") {
        out.push(<InfographicFence key={`info-${key++}`} raw={raw} />);
      } else {
        out.push(
          <pre key={`code-${key++}`} className="my-2 px-3 py-2 bg-slate-900 text-slate-100 rounded-md text-[11px] overflow-x-auto whitespace-pre-wrap">
            <code>{raw}</code>
          </pre>,
        );
      }
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
      // Citation marker MP-03: riferimento statico, senza popup fonte in chat.
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
// CitationChip: marker [S1] statico e minimale.
// Le sources restano nel payload ma non aprono piu' riquadri hover nella chat.
// ─────────────────────────────────────────────────────────────────────────
function CitationChip({ id }: { id: string }) {
  return (
    <span
      className="inline-flex items-center px-1.5 py-0 mx-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-500 border border-slate-200 align-baseline"
      aria-label={`Fonte ${id}`}
    >
      {id}
    </span>
  );
}
