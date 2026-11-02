/**
 * Chi proporre su una commessa (2/11/2026): la parte che non dipende dal modello.
 *
 * Il modello vede solo ruolo in scheda e carico, mai il nome: la prova su Demo 2 ha scelto un
 * capocantiere perché «il nome indica esperienza». Il reparto (`area`: cantiere, amministrazione,
 * commerciale) non è una zona, quindi serve solo a escludere chi non lavora in cantiere.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Riga = Record<string, any>;

const STATI_NON_PROPONIBILI = new Set(["overload", "impegnato", "assente"]);
const RUOLI_FUORI_CANTIERE = new Set(["staff_interno", "impiegato", "subappaltatore"]);
/** Parole che dicono cose che i dati non contengono. */
const MOTIVO_SENZA_DATI = /esperien|espert|brav|capac|competen|affidabil|nome|area|zona|vicin/i;

export function operaiDaProporre(righe: readonly Riga[]): Riga[] {
  return righe.filter((r) =>
    !STATI_NON_PROPONIBILI.has(r.stato_carico)
    && !RUOLI_FUORI_CANTIERE.has(String(r.role_type ?? "").toLowerCase())
    && (r.area == null || r.area === "cantiere"));
}

export function operaiPerIlModello(righe: readonly Riga[]) {
  return righe.map((r) => ({
    employee_id: r.employee_id, ruolo_in_scheda: r.role_type ?? null, stato_carico: r.stato_carico,
    ore_ultimi_30_giorni: r.ore_30gg ?? 0, utilizzo_pct: r.utilizzo_pct ?? null,
  }));
}

const haRuoloDaCapo = (r: Riga) => /capo/i.test(String(r.role_type ?? ""));

function motivoDaiDati(r: Riga): string {
  const ruolo = r.role_type ? `Ruolo ${r.role_type}` : "Ruolo non indicato in scheda";
  if (r.stato_carico === "ore_mancanti") return `${ruolo}, carico non misurabile: mancano le ore contrattuali in scheda`;
  return `${ruolo}, carico ${r.stato_carico}: ${Number(r.ore_30gg) || 0} ore nell'ultimo mese`;
}

export function suggerimentiVerificati(proposte: readonly Riga[], disponibili: readonly Riga[]) {
  const perId = new Map(disponibili.map((r) => [r.employee_id, r]));
  const avvisi: string[] = [];
  const suggerimenti = proposte.flatMap((s) => {
    const r = perId.get(s.employee_id);
    if (!r) return [];
    let ruolo = s.ruolo_proposto;
    if (ruolo === "capocantiere" && !haRuoloDaCapo(r)) {
      ruolo = "operaio_principale";
      avvisi.push(`${r.nome} non è indicato come capocantiere o capo in scheda: scegli tu chi guida il cantiere.`);
    }
    const motivo = String(s.motivazione ?? "").trim();
    return [{ ...s, nome: r.nome, ruolo_proposto: ruolo, motivazione: motivo && !MOTIVO_SENZA_DATI.test(motivo) ? motivo : motivoDaiDati(r) }];
  });
  return { suggerimenti, avvisi };
}

/** Il periodo in cui la persona dev'essere libera: mai prima di oggi. `senzaFine`: si può guardare un giorno solo. */
export function periodoDaControllare(ordine: { work_start_date?: string | null; work_end_date?: string | null; expected_date?: string | null }, oggi: string) {
  const dal = ordine.work_start_date && ordine.work_start_date > oggi ? ordine.work_start_date : oggi;
  const fine = ordine.work_end_date ?? ordine.expected_date ?? null;
  const al = fine && fine >= dal ? fine : dal;
  return { dal, al, senzaFine: !fine || fine < dal };
}
