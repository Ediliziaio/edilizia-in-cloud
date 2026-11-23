export const LUCI_RENDER_LOCALE = ["giorno", "diffusa", "sera"] as const;
export const QUALITA_RENDER_LOCALE = ["rapida", "alta"] as const;

export type LuceRenderLocale = typeof LUCI_RENDER_LOCALE[number];
export type QualitaRenderLocale = typeof QUALITA_RENDER_LOCALE[number];

export const RISOLUZIONE_RENDER_LOCALE: Record<QualitaRenderLocale, number> = { rapida: 1200, alta: 2048 };

export function dimensioniRenderLocale(proporzioni: number, qualita: QualitaRenderLocale) {
  const rapporto = Math.min(2.7, Math.max(.42, proporzioni));
  const lato = RISOLUZIONE_RENDER_LOCALE[qualita];
  return rapporto >= 1 ? { larghezza: lato, altezza: Math.round(lato / rapporto) }
    : { larghezza: Math.round(lato * rapporto), altezza: lato };
}
