import { ChatMarkdown, type ChatMarkdownSource } from "@/components/ui/ChatMarkdown";
import { SilvioCopyAnswer } from "./SilvioCopyAnswer";

/** Preserve the complete answer and its caveats; supporting sources are optional disclosure. */
export function SilvioAnswer({ content, sources, className }: {
  content: string;
  sources?: ChatMarkdownSource[];
  className?: string;
}) {
  const references = (Array.isArray(sources) ? sources : []).filter((s, i, all) =>
    s && typeof s.id === "string" && typeof s.title === "string" && s.title.trim() && all.findIndex(t => t?.id === s.id) === i);
  return <div className="min-w-0 break-words [overflow-wrap:anywhere]">
    <ChatMarkdown content={content} sources={references} className={className} />
    {references.length > 0 && <details className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-600">
      <summary className="min-h-8 cursor-pointer py-1.5 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500">
        Fonti disponibili ({references.length})
      </summary>
      <ul className="mt-1 space-y-2">
        {references.map(source => <li key={source.id} className="rounded-lg bg-slate-50 p-2">
          <span className="font-medium text-slate-700">{source.id} · {source.title}</span>
          {typeof source.snippet === "string" && source.snippet && <p className="mt-1 whitespace-pre-wrap leading-relaxed">{source.snippet}</p>}
        </li>)}
      </ul>
    </details>}
    <SilvioCopyAnswer key={content} content={content} />
  </div>;
}
