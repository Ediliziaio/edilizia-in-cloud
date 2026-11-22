import type { DisegnoCommercialeFv } from "./fvDisegnoCommerciale.ts";

export type ConfermaMisureFv = {
  firma: string;
  fonte: "sopralluogo" | "rilievo";
  data: string;
};

export function dataMisuraValida(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
}

export function leggiConfermaMisure(v: unknown): ConfermaMisureFv | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  return typeof r.firma === "string" && /^m1-[a-f0-9]{8}$/.test(r.firma) &&
      (r.fonte === "sopralluogo" || r.fonte === "rilievo") && dataMisuraValida(r.data)
    ? { firma: r.firma, fonte: r.fonte, data: r.data }
    : null;
}

/** Invalidazione locale, non una firma digitale: foto, nomi e posa non cambiano le misure. */
export function improntaMisureFv(p: DisegnoCommercialeFv): string {
  const testo = JSON.stringify([
    p.falde.map(f => [f.id, f.punti]),
    p.mappa?.origine,
    p.mappa?.falde.map(f => [f.id, f.punti, f.inclinazione, f.azimut, f.dislivelloGronda ?? 0]),
    p.schema3d?.altezza ?? null,
    p.schema3d?.pendenza ?? null,
  ]);
  let hash = 2166136261;
  for (let i = 0; i < testo.length; i++) hash = Math.imul(hash ^ testo.charCodeAt(i), 16777619);
  return `m1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function statoMisureFv(p: DisegnoCommercialeFv) {
  const conferma = leggiConfermaMisure(p.confermaMisure);
  const confermata = !!conferma && conferma.firma === improntaMisureFv(p);
  const pendenzeSolar = p.mappa?.falde.length && p.mappa.falde.every(f => !!f.misuraSolar);
  return {
    confermata,
    conferma: confermata ? conferma : null,
    daRiconfermare: !!conferma && !confermata,
    pendenze: pendenzeSolar ? "Stimate da Google Solar" : p.mappa?.falde.some(f => f.inclinazioneStimata)
      ? "Ipotizzate, da verificare" : "Indicate dall’operatore",
    altezza: p.schema3d?.altezza ?? null,
    testo: confermata
      ? `Misure confrontate dall’operatore con ${conferma!.fonte === "sopralluogo" ? "il sopralluogo" : "il rilievo"} del ${conferma!.data}.`
      : conferma ? "Il disegno o le quote sono cambiati: confronta nuovamente le misure con il rilievo."
      : "Misure indicative dalla mappa e dalle quote inserite; confronto con il rilievo non registrato.",
  };
}
