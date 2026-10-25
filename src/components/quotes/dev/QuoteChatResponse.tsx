import { Fragment, memo, type ReactNode } from "react";

// Presentation only: no HTML, links, images, embedded jobs or network effects.
// Keep the original message untouched in memory and in subsequent AI context.
const fieldLabel = /^(Voce \d+|Fonte|Codice ufficiale|Unità originale|Prezzo originale di listino|Prezzo nella bozza|Descrizione originale(?: \(estratto\))?):\s*/;
const bullet = /^\s*[-*•]\s+(.+)$/;
const numbered = /^\s*(\d{1,3})[.)]\s+(.+)$/;
const heading = /^#{1,6}\s+(.+?)\s*#*$/;

function inline(text: string): ReactNode[] {
  // Delimiters are handled without recursive parsing/backtracking. Unclosed
  // markup stays readable; catalogue codes and underscores are not rewritten.
  const out: ReactNode[] = []; let plain = ""; let i = 0;
  const flush = () => { if (plain) { out.push(plain); plain = ""; } };
  while (i < text.length) {
    if (text[i] === "\\" && /[\\*_`]/.test(text[i + 1] ?? "")) { plain += text[i + 1]; i += 2; continue; }
    const marker = text[i] === "`" ? "`" : text.startsWith("**", i) ? "**" : text.startsWith("__", i) && (i === 0 || /\s/.test(text[i - 1])) ? "__" : null;
    if (marker) {
      const end = text.indexOf(marker, i + marker.length);
      if (end > i + marker.length) {
        flush(); const value = text.slice(i + marker.length, end);
        out.push(marker === "`" ? <code key={i}>{value}</code> : <strong key={i}>{value}</strong>);
        i = end + marker.length; continue;
      }
    }
    plain += text[i++];
  }
  flush(); return out;
}

function line(text: string): ReactNode {
  const label = fieldLabel.exec(text);
  if (!label) return inline(text);
  return <><strong>{label[0].trimEnd()}</strong>{" "}{label[1] === "Codice ufficiale" ? <code>{text.slice(label[0].length)}</code> : inline(text.slice(label[0].length))}</>;
}

function blocks(content: string): ReactNode[] {
  const lines = content.replace(/\r\n?/g, "\n").split("\n"); const out: ReactNode[] = [];
  let paragraph: string[] = []; let i = 0;
  const flush = () => {
    if (!paragraph.length) return;
    out.push(<p key={`p-${i}`}>{paragraph.map((text, n) => <Fragment key={n}>{n > 0 && <br />}{line(text)}</Fragment>)}</p>); paragraph = [];
  };
  while (i < lines.length) {
    const text = lines[i]; const trimmed = text.trim();
    if (!trimmed) { flush(); i++; continue; }
    if (trimmed.startsWith("```")) {
      flush(); const code: string[] = []; const key = i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
      if (i < lines.length) i++;
      out.push(<pre key={`code-${key}`}><code>{code.join("\n")}</code></pre>); continue;
    }
    const title = heading.exec(trimmed);
    if (title) { flush(); out.push(<h4 key={`h-${i}`}>{inline(title[1])}</h4>); i++; continue; }
    const ordered = numbered.exec(text); const item = bullet.exec(text);
    if (ordered || item) {
      flush(); const key = i; const items: ReactNode[] = [];
      while (i < lines.length) {
        const match = ordered ? numbered.exec(lines[i]) : bullet.exec(lines[i]);
        if (!match) break;
        items.push(<li key={i} value={ordered ? Number(match[1]) : undefined}>{line(match[ordered ? 2 : 1])}</li>); i++;
      }
      out.push(ordered ? <ol key={`ol-${key}`} start={Number(ordered[1])}>{items}</ol> : <ul key={`ul-${key}`}>{items}</ul>); continue;
    }
    // Existing plain-text reference messages gain readable labels too.
    if (fieldLabel.test(text)) { flush(); out.push(<p key={`field-${i}`}>{line(text)}</p>); i++; continue; }
    paragraph.push(text); i++;
  }
  flush(); return out;
}

export const QuoteChatResponse = memo(function QuoteChatResponse({ content }: { content: string }) {
  // Unexpectedly large legacy text remains complete and inert, without parsing.
  return <div className="quote-chat-response">{content.length > 20000 ? <p className="quote-chat-plain">{content}</p> : blocks(content)}</div>;
});
