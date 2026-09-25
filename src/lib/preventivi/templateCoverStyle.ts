/** Choosing a style is never an implicit upload, deletion or replacement of media. */
export function coverStyleOnly<T extends object>(patch: T): T {
  const result = { ...patch };
  for (const key of ["pdf_cover_image_url", "cover_image_url"]) delete (result as Record<string, unknown>)[key];
  return result;
}

export function detectCoverStyle<T extends object>(form: T, presets: readonly { id: string; patch: object }[]): string | null {
  return presets.find(preset => Object.entries(coverStyleOnly(preset.patch)).every(([key, expected]) => {
    const actual = (form as Record<string, unknown>)[key];
    return expected == null && actual == null || expected === actual;
  }))?.id ?? null;
}
