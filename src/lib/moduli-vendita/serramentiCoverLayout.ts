/** Versioned opt-in: saved company templates without a marker keep their layout. */
export type SerramentiCoverLayout = "editoriale-v1" | "classico";

export function serramentiCoverLayout(blocks: unknown): SerramentiCoverLayout {
  return blocks && typeof blocks === "object" &&
    "copertina_layout" in blocks && blocks.copertina_layout === "editoriale-v1"
    ? "editoriale-v1" : "classico";
}

/** Change only the composition, never images, texts or company data. */
export function withSerramentiCoverLayout<T extends Record<string, unknown>>(
  blocks: T | null | undefined, layout: SerramentiCoverLayout,
): T & { copertina_layout: SerramentiCoverLayout } {
  return { ...blocks, copertina_layout: layout } as T & { copertina_layout: SerramentiCoverLayout };
}
