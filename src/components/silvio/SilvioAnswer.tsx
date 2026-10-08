import { ChatMarkdown, type ChatMarkdownSource } from "@/components/ui/ChatMarkdown";
import { SilvioCopyAnswer } from "./SilvioCopyAnswer";
import { publicAiAnswer, readableStreamingMarkdown, visibleAiAnswer } from "@/lib/silvio/visibleAnswer";
import { PixelDotsLoader } from "@/components/ui/ai-agent-response";

/** Preserve the complete answer and its caveats without a separate sources panel. */
export function SilvioAnswer({ content, sources, className, streaming = false }: {
  content: string;
  sources?: ChatMarkdownSource[];
  className?: string;
  streaming?: boolean;
}) {
  const answer = streaming ? visibleAiAnswer(content, { streaming: true }) : content.trim() ? publicAiAnswer(content) : "";
  const references = (Array.isArray(sources) ? sources : []).filter((s, i, all) =>
    s && typeof s.id === "string" && typeof s.title === "string" && s.title.trim() && all.findIndex(t => t?.id === s.id) === i);
  return <div className="min-w-0 break-words [overflow-wrap:anywhere] text-sm leading-6 text-slate-700">
    <ChatMarkdown content={streaming ? readableStreamingMarkdown(answer) : answer} sources={references} className={className} mobileCards />
    {streaming && <div role="status" aria-live="polite" aria-atomic="true" className="mt-1 flex items-center gap-2 text-xs text-slate-500">
      <PixelDotsLoader className="text-orange-500" />
      <span className="silvio-thinking-shimmer">{answer ? "Silvio sta scrivendo…" : "Silvio sta preparando la risposta…"}</span>
    </div>}
    {!streaming && <SilvioCopyAnswer key={answer} content={answer} />}
  </div>;
}
