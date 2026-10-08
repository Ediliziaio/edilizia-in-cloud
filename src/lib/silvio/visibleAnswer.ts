export { visibleAiAnswer, publicAiAnswer, SILVIO_MISSING_PUBLIC_ANSWER } from "../../../supabase/functions/_shared/visibleAiAnswer";

/** Presentation only: close unfinished emphasis, and wait before rendering partial code/charts. */
export function readableStreamingMarkdown(content: string): string {
  const fences = [...content.matchAll(/^```[^\n]*$/gm)];
  const visible = fences.length % 2 ? content.slice(0, fences[fences.length - 1].index).trimEnd() : content;
  return visible.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part, index) => {
    if (index % 2) return part;
    return part.split("\n").map(line => {
      const bold = line.match(/(?<!\\)\*\*/g)?.length ?? 0;
      if (bold % 2 === 0) return line;
      return line.endsWith("**") ? line.slice(0, -2) : line + "**";
    }).join("\n");
  }).join("");
}
