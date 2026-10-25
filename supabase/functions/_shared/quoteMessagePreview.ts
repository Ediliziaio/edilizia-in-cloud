/** Decode ONLY the top-level message string. Never expose raw JSON, reasoning,
 * nested document text, searches or incomplete tool arguments as a reply. */
export function quoteMessagePreview(raw: string): string | null {
  if (raw.length > 120_000 || !raw.trimStart().startsWith('{')) return null;
  let depth = 0;
  const string = (start: number): { text: string; end: number; closed: boolean } | null => {
    let text = '';
    for (let i = start + 1; i < raw.length; i++) {
      const c = raw[i];
      if (c === '"') return { text, end: i + 1, closed: true };
      if (c.charCodeAt(0) < 32) return null;
      if (c !== '\\') { text += c; continue; }
      const next = raw[++i]; if (next === undefined) break;
      if (next === 'u') {
        const hex = raw.slice(i + 1, i + 5); if (hex.length < 4) break;
        if (!/^[a-f\d]{4}$/i.test(hex)) return null;
        text += String.fromCharCode(parseInt(hex, 16)); i += 4;
      } else {
        const escapes: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (!(next in escapes)) return null; text += escapes[next];
      }
    }
    // A Unicode pair may be split between provider events.
    return { text: text.replace(/[\uD800-\uDBFF]$/, ''), end: raw.length, closed: false };
  };
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
    else if (c === '"') {
      const key = string(i); if (!key?.closed) return null;
      let next = key.end; while (/\s/.test(raw[next] ?? '') && next < raw.length) next++;
      if (depth === 1 && key.text === 'message' && raw[next] === ':') {
        next++; while (/\s/.test(raw[next] ?? '') && next < raw.length) next++;
        if (raw[next] !== '"') return null;
        const value = string(next); return value && value.text.length <= 3000 ? value.text : null;
      }
      i = key.end - 1;
    }
    if (depth < 0) return null;
  }
  return null;
}
