/** Separate the legacy structured preamble without treating free text as metadata. */
export function anomalyDescription(body: string) {
  const match = /^(?<preamble>(?:(?:Causa precisa|Origine processo|Soggetto da verificare|Azione correttiva):[^\n]*\n)+)Dettaglio:\s?(?<detail>[\s\S]*)$/.exec(body);
  if (!match?.groups) return { detail: body, fields: [] as { label: string; value: string }[], structured: false };
  const fields = match.groups.preamble.trimEnd().split("\n").map(line => {
    const colon = line.indexOf(":");
    return { label: line.slice(0, colon), value: line.slice(colon + 1).trim() };
  });
  return { detail: match.groups.detail, fields, structured: true };
}

export function restoreAnomalyDescription(parsed: ReturnType<typeof anomalyDescription>, detail: string, action: string) {
  if (!parsed.structured) return detail;
  return [...parsed.fields.map(field => `${field.label}: ${field.label === "Azione correttiva" ? action.replace(/[\r\n]+/g, " ").trim() : field.value}`), `Dettaglio: ${detail}`].join("\n");
}
