import type { Fonte, Movimento } from "@/lib/orders/generali/investitoriConti";
import type {
  InputPiano,
  RigaReale,
  VocePiano,
} from "@/lib/orders/generali/pianoConti";

/** Caso sintetico locale; nessuna lettura o scrittura del database aziendale. */
export function inputSimulazione(): InputPiano {
  const voce = (
    id: string,
    categoria: VocePiano["categoria"],
    importo: number,
    mese: string,
    durataMesi = 1,
  ): VocePiano => ({
    id,
    tipo: id === "vendite" ? "ricavo" : "costo",
    categoria,
    descrizione: id,
    importo,
    mese,
    durataMesi,
    figliaId: null,
    categorieCosto: [],
    aFinire: null,
    nota: null,
    ordine: 0,
    origineId: null,
  });
  const reale = (id: string, importo: number, data: string): RigaReale => ({
    id: `reale-${id}`,
    fonte: id === "vendite" ? "fattura" : "spesa",
    rifId: null,
    orderId: "simulazione-generale",
    data,
    tipo: id === "vendite" ? "ricavo" : "costo",
    chiave: id,
    categoria: null,
    descrizione: id,
    importo,
    voceId: id,
  });
  return {
    oggi: "2026-11-11",
    generaleId: "simulazione-generale",
    figlie: [],
    voci: [
      voce("vendite", "vendite", 3_200_000, "2027-09", 6),
      voce("terreno", "terreno", 600_000, "2026-01"),
      voce("costruzione", "costruzione", 1_650_000, "2026-11", 12),
      voce("oneri", "oneri", 150_000, "2026-11", 6),
      voce("commerciali", "commercializzazione", 70_000, "2026-11", 12),
      voce("finanziari", "finanziari", 80_000, "2026-11", 16),
      voce("imprevisti", "imprevisti", 50_000, "2026-11", 12),
    ],
    righe: [
      reale("vendite", 800_000, "2026-09-15"),
      reale("terreno", 600_000, "2026-01-15"),
      reale("costruzione", 400_000, "2026-10-15"),
      reale("oneri", 60_000, "2026-10-15"),
      reale("commerciali", 20_000, "2026-10-15"),
      reale("finanziari", 10_000, "2026-10-15"),
      reale("imprevisti", 10_000, "2026-10-15"),
    ],
    incassi: [
      { fatturaId: "reale-vendite", data: "2026-09-20", importo: 600_000 },
    ],
  };
}

export const fonteSimulazione = (p: Partial<Fonte> = {}): Fonte => ({
  id: "capitale",
  tipo: "capitale",
  nome: "Investitore simulato",
  soggetto: "societa",
  clienteId: null,
  email: null,
  impegno: 2_500_000,
  quotaUtilePct: null,
  tassoPct: null,
  dataInizio: "2026-01-01",
  scadenza: "2029-12-31",
  nota: null,
  ordine: 0,
  ...p,
});

export const movimentoSimulazione = (
  p: Partial<Movimento> = {},
): Movimento => ({
  id: "versamento",
  fonteId: "capitale",
  tipo: "versamento",
  data: "2026-01-01",
  importo: 500_000,
  nota: null,
  ...p,
});
