/**
 * Il fabbisogno dei materiali per l'ufficio acquisti: cosa ordinare e entro
 * quando. Le righe vengono da materiali_riconciliazione_azienda (solo fasi
 * validate dal tecnico, migrazioni 20281222150000 e 20281222200000):
 * «entro quando» = data in cui serve (o inizio della fase) meno i giorni di
 * consegna del fornitore.
 */

export interface RigaFabbisogno {
  order_item_id: string;
  order_id: string;
  commessa: string | null;
  phase_id: string | null;
  fase: string | null;
  name: string;
  unita_misura: string | null;
  supplier_id: string | null;
  fornitore: string | null;
  previsto: number;
  ordinato: number;
  in_bozza: number;
  ricevuto: number;
  residuo: number;
  eccedenza: number;
  unita_diversa: boolean;
  stato: string;
  data_serve: string | null;
  /** La data scritta a mano; senza, il materiale segue l'inizio della fase (data_serve). */
  data_scritta?: string | null;
  giorni_consegna: number | null;
  ordina_entro: string | null;
}

export type Urgenza = "ritardo" | "settimana" | "mese" | "dopo" | "senza_data" | "da_verificare";

export const ETICHETTA_URGENZA: Record<Urgenza, string> = {
  ritardo: "In ritardo",
  settimana: "Entro 7 giorni",
  mese: "Entro 30 giorni",
  dopo: "Più avanti",
  senza_data: "Senza data",
  da_verificare: "Da verificare",
};

export const ORDINE_URGENZA: Urgenza[] = ["ritardo", "settimana", "mese", "dopo", "senza_data", "da_verificare"];

const giorno = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/** Giorni da oggi a «entro quando»: negativo = in ritardo. */
export function giorniAlLimite(ordinaEntro: string | null, oggi: string): number | null {
  if (!ordinaEntro) return null;
  return Math.round((giorno(ordinaEntro) - giorno(oggi)) / 86_400_000);
}

/**
 * Una riga senza niente da ordinare ma con un'incongruenza (ordinato più del
 * previsto, unità diverse dall'ordine) va fra «da verificare»: non è urgente,
 * ma qualcuno deve guardarla.
 */
export function urgenza(r: RigaFabbisogno, oggi: string): Urgenza {
  const daOrdinare = r.residuo > 0 && !["consegnato", "installato"].includes(r.stato);
  if (!daOrdinare) return "da_verificare";
  const g = giorniAlLimite(r.ordina_entro, oggi);
  if (g == null) return "senza_data";
  if (g < 0) return "ritardo";
  if (g <= 7) return "settimana";
  if (g <= 30) return "mese";
  return "dopo";
}

export function raggruppaPerUrgenza(righe: RigaFabbisogno[], oggi: string): Array<{ urgenza: Urgenza; righe: RigaFabbisogno[] }> {
  const gruppi = new Map<Urgenza, RigaFabbisogno[]>();
  for (const r of righe) {
    const u = urgenza(r, oggi);
    gruppi.set(u, [...(gruppi.get(u) ?? []), r]);
  }
  return ORDINE_URGENZA.filter((u) => gruppi.has(u)).map((u) => ({
    urgenza: u,
    righe: [...gruppi.get(u)!].sort((a, b) =>
      (a.ordina_entro ?? "9999").localeCompare(b.ordina_entro ?? "9999")
      || (a.commessa ?? "").localeCompare(b.commessa ?? "")
      || a.name.localeCompare(b.name)),
  }));
}

/** «fra 3 giorni», «oggi», «da 4 giorni»: per la colonna «entro quando». */
export function testoLimite(ordinaEntro: string | null, oggi: string): string {
  const g = giorniAlLimite(ordinaEntro, oggi);
  if (g == null) return "senza data: manca l'inizio della fase";
  if (g === 0) return "oggi";
  if (g === 1) return "domani";
  if (g === -1) return "da ieri";
  return g > 0 ? `fra ${g} giorni` : `da ${-g} giorni`;
}

/** Il collegamento ai materiali della commessa, sulla fase giusta. */
export function linkMateriali(r: Pick<RigaFabbisogno, "order_id" | "phase_id">): string {
  return `/azienda/ordini/${r.order_id}?tab=articoli&vista_materiali=articoli${r.phase_id ? `&fase=${r.phase_id}` : ""}`;
}
