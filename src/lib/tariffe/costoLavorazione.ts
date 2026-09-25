/** Analisi del costo per UNA unità della tariffa, mai dell'intero cantiere. */
export type ModalitaCostoLavorazione = "manuale" | "interna" | "subappalto";
export interface RisorsaLavorazione {
  id: string;
  nome: string;
  dipendente_id?: string;
  operatori: number | null;
  ore: number | null;
  costo_orario: number | null;
}
export interface CostoLavorazione {
  versione: 1;
  modalita: ModalitaCostoLavorazione;
  subappalto: number | null;
  risorse: RisorsaLavorazione[];
  altri_costi_interni: number | null;
  /** Snapshot: rileva modifiche del costo da importazioni o analisi prezzi. */
  costo_applicato?: number;
}
export const MODALITA_COSTO_LABEL = { manuale: "Costo diretto", interna: "Squadra interna", subappalto: "Subappalto" };
export function oggettoCampi(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function numeroCosto(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value.trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const valido = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
const arrotonda = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function leggiCostoLavorazione(campi: unknown): CostoLavorazione {
  const c = oggettoCampi(oggettoCampi(campi)._costo_lavorazione);
  return {
    versione: 1,
    modalita: c.versione === 1 && (c.modalita === "interna" || c.modalita === "subappalto") ? c.modalita : "manuale",
    subappalto: valido(c.subappalto) ? c.subappalto : null,
    altri_costi_interni: valido(c.altri_costi_interni) ? c.altri_costi_interni : null,
    costo_applicato: valido(c.costo_applicato) ? c.costo_applicato : undefined,
    risorse: Array.isArray(c.risorse) ? c.risorse.map((value, index) => {
      const r = oggettoCampi(value);
      return { id: typeof r.id === "string" ? r.id : String(index), nome: typeof r.nome === "string" ? r.nome : "Operatore",
        ...(typeof r.dipendente_id === "string" ? { dipendente_id: r.dipendente_id } : {}),
        operatori: valido(r.operatori) ? r.operatori : null, ore: valido(r.ore) ? r.ore : null,
        costo_orario: valido(r.costo_orario) ? r.costo_orario : null };
    }) : [],
  };
}
export function costoLavorazioneModificato(c: CostoLavorazione, costoAttuale: number) {
  return c.modalita !== "manuale" && c.costo_applicato != null && Math.abs(c.costo_applicato - costoAttuale) > 0.005;
}
export function calcolaCostoLavorazione(c: CostoLavorazione, manuale: number | null) {
  const risorseValide = c.risorse.length > 0 && c.risorse.every(r =>
    valido(r.operatori) && r.operatori >= 1 && Number.isInteger(r.operatori)
    && valido(r.ore) && r.ore > 0 && valido(r.costo_orario));
  const internoGrezzo = risorseValide ? c.risorse.reduce((tot, r) => tot + r.operatori! * r.ore! * r.costo_orario!, 0) + (c.altri_costi_interni ?? 0) : null;
  const interno = internoGrezzo != null && Number.isFinite(internoGrezzo) && valido(c.altri_costi_interni ?? 0) ? arrotonda(internoGrezzo) : null;
  const subappalto = valido(c.subappalto) ? arrotonda(c.subappalto) : null;
  const applicato = c.modalita === "interna" ? interno : c.modalita === "subappalto" ? subappalto : valido(manuale) ? arrotonda(manuale) : null;
  return { interno, subappalto, applicato, oreUomo: risorseValide ? c.risorse.reduce((tot, r) => tot + r.operatori! * r.ore!, 0) : null };
}

export const GRUPPI_LAVORAZIONE = [
  { id: "preparazione", nome: "Rilievi e preparazione" },
  { id: "demolizioni", nome: "Rimozioni e demolizioni" },
  { id: "opere_edili", nome: "Opere edili e sottofondi" },
  { id: "posa", nome: "Posa e installazione" },
  { id: "impianti", nome: "Collegamenti e impianti" },
  { id: "finiture", nome: "Finiture e ripristini" },
  { id: "collaudo", nome: "Verifiche e collaudo" },
  { id: "manutenzione", nome: "Manutenzione e riparazioni" },
  { id: "logistica", nome: "Trasporti e smaltimenti" },
  { id: "noli", nome: "Noli e ponteggi" },
  { id: "servizi", nome: "Progettazione e pratiche" },
  { id: "altro", nome: "Altre lavorazioni" },
] as const;
export type GruppoLavorazione = typeof GRUPPI_LAVORAZIONE[number]["id"];
export function gruppoLavorazione(t: { nome: string; tipo: string; custom_field_values?: unknown }): GruppoLavorazione {
  const salvato = oggettoCampi(t.custom_field_values)._gruppo_lavorazione;
  if (GRUPPI_LAVORAZIONE.some(g => g.id === salvato)) return salvato as GruppoLavorazione;
  const n = t.nome.toLocaleLowerCase("it");
  if (["trasporto", "tiro_piano", "smaltimento"].includes(t.tipo) || /trasport|smaltiment|conferiment|movimentaz/.test(n)) return "logistica";
  if (["nolo", "ponteggio"].includes(t.tipo)) return "noli";
  if (["pratica", "progettazione"].includes(t.tipo)) return "servizi";
  if (/demol|rimozion|smontagg/.test(n)) return "demolizioni";
  if (/manutenz|riparaz|pulizia|lavaggio/.test(n)) return "manutenzione";
  if (/collaud|verific|prova |prove |avviamento/.test(n)) return "collaudo";
  if (/massetto|sottofondo|muratur|tramezz|scav|rasatur/.test(n)) return "opere_edili";
  if (["lattoneria", "sigillatura", "contorno"].includes(t.tipo) || /tintegg|vernici|finitur|ripristin|stuccat|levigatur|resina|sigill/.test(n)) return "finiture";
  if (/collegament|cablagg|configuraz|impiant|tubaz|scarich|circuit/.test(n)) return "impianti";
  if (t.tipo === "sopralluogo" || /riliev|protezione|preparaz|allestiment/.test(n)) return "preparazione";
  if (["posa", "falso_telaio"].includes(t.tipo) || /posa|installaz|montagg/.test(n)) return "posa";
  return "altro";
}

export function campiConCostoLavorazione(campi: unknown, config: CostoLavorazione, costo: number, gruppo: GruppoLavorazione) {
  return { ...oggettoCampi(campi), _gruppo_lavorazione: gruppo, _costo_lavorazione: { ...config, costo_applicato: costo } };
}
