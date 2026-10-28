export type TipoPersonaQualifica = "hr" | "esterno";
export interface DatiQualifica {
  tipologia: "formazione" | "abilitazione" | "addestramento" | "qualifica";
  titolo: string;
  ambito: string;
  ente: string;
  validita_dal: string;
  validita_al: string;
  motivazione_senza_scadenza: string;
  limitazioni: string;
  riferimento: string;
  conferma_lettura: boolean;
}
export interface FonteQualifica {
  foto?: {
    id: string;
    impronta: string;
    titolo: string | null;
    categoria: string;
    data_rilascio: string | null;
    data_scadenza: string | null;
    file_name: string;
    persona: { id: string; tipo: TipoPersonaQualifica };
  };
  bucket?: string;
  path?: string;
  id?: string;
  non_disponibile?: boolean;
}
export interface QualificaAddetto {
  id: string;
  famiglia_id: string;
  versione: number;
  precedente_id: string | null;
  stato: "riesaminata" | "revocata";
  dati: DatiQualifica;
  motivo: string;
  fonte_id: string;
  fonte_impronta: string;
  fonte_corrente: boolean;
  registrato_da: string;
  registrato_il: string;
}
export interface QuadroQualifiche {
  company_id: string;
  persona: {
    id: string;
    tipo: TipoPersonaQualifica;
    nome: string;
    cognome: string;
    attivo: boolean;
  };
  puo_classificare: boolean;
  fonti: FonteQualifica[];
  registrazioni: QualificaAddetto[];
}
export function qualificaVuota(): DatiQualifica {
  return {
    tipologia: "formazione",
    titolo: "",
    ambito: "",
    ente: "",
    validita_dal: "",
    validita_al: "",
    motivazione_senza_scadenza: "",
    limitazioni: "",
    riferimento: "",
    conferma_lettura: false,
  };
}
const dataValida = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v + "T12:00:00Z")) &&
  new Date(v + "T12:00:00Z").toISOString().slice(0, 10) === v;
export function erroreQualifica(d: DatiQualifica): string | null {
  if (
    !["formazione", "abilitazione", "addestramento", "qualifica"].includes(
      d.tipologia,
    ) ||
    !d.titolo.trim() ||
    d.titolo.length > 180 ||
    !d.ambito.trim() ||
    d.ambito.length > 2000 ||
    !d.ente.trim() ||
    d.ente.length > 300
  )
    return "Indica titolo, ambito e soggetto/ente che attesta la formazione o qualifica.";
  if (
    [d.limitazioni, d.riferimento, d.motivazione_senza_scadenza].some(
      (x) => x.length > 2000,
    )
  )
    return "Riduci i testi a 2000 caratteri.";
  if (
    !dataValida(d.validita_dal) ||
    (d.validita_al &&
      (!dataValida(d.validita_al) || d.validita_al < d.validita_dal))
  )
    return "Indica un periodo valido.";
  if (
    (!d.validita_al && !d.motivazione_senza_scadenza.trim()) ||
    (d.validita_al && d.motivazione_senza_scadenza.trim())
  )
    return "Indica la scadenza oppure la motivazione documentata della sua assenza.";
  if (!d.conferma_lettura)
    return "Apri l’originale e conferma la lettura e la classificazione.";
  return null;
}
export function ultimeQualifiche(righe: readonly QualificaAddetto[]) {
  const map = new Map<string, QualificaAddetto>();
  for (const r of righe) {
    const p = map.get(r.famiglia_id);
    if (!p || r.versione > p.versione) map.set(r.famiglia_id, r);
  }
  return [...map.values()];
}
/** Only documentary period coverage, never suitability or permission to enter a site. */
export function statoQualifica(
  r: QualificaAddetto,
  dal: string,
  al = dal,
): string {
  if (r.stato === "revocata") return "Revocata";
  if (!r.fonte_corrente)
    return "Originale cambiato o non disponibile: da riesaminare";
  if (!dataValida(dal) || !dataValida(al) || al < dal)
    return "Periodo da definire";
  if (r.dati.validita_dal > dal) return "Decorrenza successiva al periodo";
  if (r.dati.validita_al && r.dati.validita_al < dal)
    return "Scaduta prima del periodo";
  if (r.dati.validita_al && r.dati.validita_al < al)
    return "Scade durante il periodo";
  return "Date compatibili con il periodo: pertinenza da verificare";
}
