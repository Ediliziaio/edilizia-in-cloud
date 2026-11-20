import type { SectionDestinationDocument } from "@/components/preventivi/pdf/sectionDestinations";

/** Destinazione nativa PDF: la posizione rimane valida anche dopo riordini e rigenerazioni. */
export async function resolvePdfDestination(document: SectionDestinationDocument, id: string): Promise<{ page: number; top: number | null } | null> {
  try {
    const destination = await document.getDestination?.(id);
    if (!Array.isArray(destination) || !destination.length) return null;
    const ref = destination[0];
    const index = typeof ref === "number" ? ref
      : ref && typeof ref === "object" && "num" in ref && "gen" in ref && document.getPageIndex
        ? await document.getPageIndex(ref as { num: number; gen: number }) : -1;
    if (!Number.isInteger(index) || index < 0 || index >= document.numPages) return null;
    const kind = destination[1] as { name?: string } | null;
    return { page: index + 1, top: kind?.name === "XYZ" && typeof destination[3] === "number" && Number.isFinite(destination[3]) ? destination[3] : null };
  } catch { return null; }
}
