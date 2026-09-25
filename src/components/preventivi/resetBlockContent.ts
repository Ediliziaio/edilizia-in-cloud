const fields = {
  texts: new Set(["occhiello", "titolo", "intro", "voci", "escluse"]),
  images: new Set(["foto", "senzaFoto"]),
};

/** Reset only the requested fields, resolving from the adopted module defaults. */
export function resetBlockContent(saved: Record<string, unknown>, key: string, scope: keyof typeof fields): Record<string, unknown> {
  const block = saved[key];
  if (!block || typeof block !== "object" || Array.isArray(block)) return saved;
  const kept = Object.fromEntries(Object.entries(block).filter(([field]) => !fields[scope].has(field)));
  const next = { ...saved };
  if (Object.keys(kept).length) next[key] = kept;
  else delete next[key];
  return next;
}
