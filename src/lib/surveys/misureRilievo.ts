/**
 * Dal rilievo alle righe della commessa (piano articoli su misura, fase 4).
 *
 * Qui solo logica pura: quali componenti escono da un elemento del sopralluogo, in che
 * unità, a quale riga somigliano. La scrittura sta in `sopralluogo_applica_misure`.
 *
 * Le unità si leggono dal modello fotografato col sopralluogo
 * (`template_schema_snapshot`): lo stesso campo può essere in cm in un modello e in mm
 * in un altro. Le misure di una riga sono sempre in millimetri; le quantità nella loro unità.
 */
import { isVisible } from "@/components/surveys/engine/evalConditions";
import type { FieldDefinition, TemplateSchema } from "@/types/surveys";

export type FormaMisura = "LxH" | "LxPxH" | "mq" | "ml" | "m" | "pz";
export type TipoMisura = "foro" | "telaio" | "finita";
export type AsseMisura = "larghezza_mm" | "altezza_mm" | "profondita_mm" | "quantita";
export type Misure = Partial<Record<AsseMisura, number>>;

type Valori = Record<string, unknown>;

export interface ElementoRilievo {
  id: string;
  element_type: string;
  element_label?: string | null;
  values: Valori | null;
  quantity?: number | null;
  /** Nome dell'ambiente: fa da riferimento se l'elemento non ha un'etichetta. */
  area_name?: string | null;
}

export interface ComponenteRilevato {
  elementoId: string;
  elementType: string;
  componente: string;
  etichetta: string;
  forma: FormaMisura;
  misure: Misure;
  unita: string | null;
  misuraTipo: TipoMisura | null;
  quantita: number;
  riferimento: string | null;
}

const FATTORE_MM: Record<string, number> = { mm: 1, cm: 10, m: 1000 };

const COMPONENTE_DEL_PREFISSO: Record<string, string> = {
  tap_: "tapparella",
  zan_: "zanzariera",
  per_: "persiana",
  cas_: "cassonetto",
  dav_: "davanzale",
  doccia_: "doccia",
  vasca_: "vasca",
  mobile_: "mobile",
  specchio_: "specchio",
  scaldasalviette_: "scaldasalviette",
};

/** Non sono il pezzo principale: un lavabo col mobile resta comunque un lavabo da ordinare. */
const PREFISSI_ACCESSORI = new Set(["mobile_", "specchio_", "scaldasalviette_"]);

/** Non si ordinano: servono a capire il cantiere, o sono totali di controllo. */
const NON_DA_ORDINARE = /spessore|mazzetta|cilindro|riduzione|larghezza_telaio|_totali$/;

export function numeroMisura(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", ".").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

const quattroDecimali = (n: number) => Math.round(n * 10000) / 10000;

function maiuscola(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

function campiVisibili(schema: TemplateSchema | null | undefined, tipo: string, valori: Valori): FieldDefinition[] {
  const def = schema?.element_types?.find((t) => t.key === tipo);
  if (!def) return [];
  const piatti = (campi: FieldDefinition[]): FieldDefinition[] =>
    campi.flatMap((c) => {
      if (!isVisible(c.show_if, valori)) return [];
      if (c.type === "compound_boolean") return valori[c.key] ? piatti(c.nested_fields ?? []) : [];
      return [c];
    });
  return def.sections.filter((s) => isVisible(s.show_if, valori)).flatMap((s) => piatti(s.fields ?? []));
}

function unitaDiRipiego(chiave: string): string {
  if (chiave.endsWith("_mm")) return "mm";
  if (chiave.endsWith("_foro")) return "cm";
  return "mm";
}

interface Gruppo {
  prefisso: string;
  foro: boolean;
  campi: Partial<Record<"L" | "H" | "P" | "lunghezza", { valore: number; unit: string }>>;
}

function assegnaAlGruppo(gruppi: Map<string, Gruppo>, chiave: string, valore: number, unit: string | undefined): boolean {
  const senzaSuffisso = chiave.replace(/_(foro|mm)$/, "");
  const trovato = senzaSuffisso.match(/^(.*_)?(larghezza|altezza|profondita|lunghezza|sporgenza)$/);
  if (!trovato) return false;
  const prefisso = trovato[1] ?? "";
  const nome = trovato[2];
  const gruppo = gruppi.get(prefisso) ?? { prefisso, foro: false, campi: {} };
  if (chiave.endsWith("_foro")) gruppo.foro = true;
  const u = unit ?? unitaDiRipiego(chiave);
  const asse = nome === "larghezza" ? "L" : nome === "altezza" ? "H" : nome === "lunghezza" ? "lunghezza" : "P";
  gruppo.campi[asse] = { valore, unit: u };
  gruppi.set(prefisso, gruppo);
  return true;
}

function inMillimetri(c: { valore: number; unit: string } | undefined): number | undefined {
  if (!c) return undefined;
  const fattore = FATTORE_MM[c.unit];
  return fattore ? Math.round(c.valore * fattore * 100) / 100 : undefined;
}

/**
 * Le parti da ordinare di un elemento rilevato: un infisso può dare anche tapparella,
 * zanzariera, persiana e cassonetto, un bagno pavimento e rivestimento. Ognuna è una riga.
 */
export function componentiDelRilievo(
  elemento: ElementoRilievo,
  schema: TemplateSchema | null | undefined,
): ComponenteRilevato[] {
  const valori = elemento.values ?? {};
  const base = elemento.element_type.replace(/_standalone$/, "");
  const def = schema?.element_types?.find((t) => t.key === elemento.element_type);
  const nomeTipo = def?.label ?? maiuscola(base);
  const riferimento = elemento.element_label?.trim() || elemento.area_name?.trim() || null;
  const pezzi = Math.max(Number(elemento.quantity) || 1, 1);
  const comuni = { elementoId: elemento.id, elementType: elemento.element_type, riferimento, quantita: pezzi };

  // Sopralluoghi vecchi senza modello: si guardano le chiavi, come si è sempre fatto.
  const campi: Array<{ key: string; unit?: string; label?: string }> = def
    ? campiVisibili(schema, elemento.element_type, valori)
    : Object.keys(valori).filter((k) => numeroMisura(valori[k]) != null).map((key) => ({ key }));
  const dimensioni = def ? (campi as FieldDefinition[]).filter((c) => c.type === "dimension") : campi;

  const gruppi = new Map<string, Gruppo>();
  const usciti: ComponenteRilevato[] = [];

  for (const campo of dimensioni) {
    if (NON_DA_ORDINARE.test(campo.key)) continue;
    const valore = numeroMisura(valori[campo.key]);
    if (valore == null) continue;
    if (campo.key === "lunghezza_lineare") {
      usciti.push({ ...comuni, componente: base, etichetta: `${nomeTipo} · ${campo.label ?? "Lunghezza"}`, forma: "ml", unita: "ml", misuraTipo: null, misure: { quantita: quattroDecimali(campo.unit === "cm" ? valore / 100 : valore) } });
      continue;
    }
    if (campo.unit === "mq" || campo.unit === "ml" || campo.unit === "m") {
      const nome = campo.key.replace(/(^|_)(mq|ml)(_|$)/, "$1").replace(/^_|_$/g, "") || base;
      usciti.push({ ...comuni, componente: nome, etichetta: nome === base ? nomeTipo : `${nomeTipo} · ${campo.label ?? maiuscola(nome)}`, forma: campo.unit as FormaMisura, unita: campo.unit, misuraTipo: null, misure: { quantita: quattroDecimali(valore) } });
      continue;
    }
    assegnaAlGruppo(gruppi, campo.key, valore, campo.unit);
  }

  const dimensionali: Array<ComponenteRilevato & { prefisso: string }> = [];
  for (const g of gruppi.values()) {
    // Davanzale: lunghezza × sporgenza. Vasca: larghezza × lunghezza.
    const L = g.campi.L ?? g.campi.lunghezza;
    const P = g.campi.P ?? (g.campi.L ? g.campi.lunghezza : undefined);
    const H = g.campi.H;
    const lMm = inMillimetri(L);
    if (lMm == null || (H == null && P == null)) continue;
    const misure: Misure = { larghezza_mm: lMm };
    const hMm = inMillimetri(H);
    const pMm = inMillimetri(P);
    if (hMm != null) misure.altezza_mm = hMm;
    if (pMm != null) misure.profondita_mm = pMm;
    const componente = COMPONENTE_DEL_PREFISSO[g.prefisso] ?? (g.prefisso ? g.prefisso.replace(/_$/, "") : base);
    dimensionali.push({
      ...comuni,
      prefisso: g.prefisso,
      componente,
      etichetta: g.prefisso ? `${nomeTipo} · ${maiuscola(componente)}` : nomeTipo,
      forma: pMm != null ? "LxPxH" : "LxH",
      misure,
      unita: null,
      misuraTipo: g.foro ? "foro" : "finita",
    });
  }

  const risultato: ComponenteRilevato[] = [
    ...dimensionali.map(({ prefisso: _p, ...c }) => c),
    ...usciti,
  ];
  const soloAccessori = dimensionali.length > 0 && dimensionali.every((c) => PREFISSI_ACCESSORI.has(c.prefisso)) && usciti.length === 0;
  if (risultato.length === 0 || soloAccessori) {
    const riga = (schema?.output_mapping as { estimate_lines?: Record<string, { unit?: string }> } | undefined)?.estimate_lines?.[elemento.element_type];
    if (riga?.unit === "pz" && (risultato.length > 0 || def?.allow_quantity !== false)) {
      risultato.unshift({ ...comuni, componente: base, etichetta: nomeTipo, forma: "pz", unita: "pz", misuraTipo: null, misure: { quantita: pezzi } });
    }
  }
  return risultato;
}

// ── Abbinamento ─────────────────────────────────────────────────────────────

export interface RigaMisure {
  id: string;
  name: string;
  riferimento?: string | null;
  componente?: string | null;
  quantity?: number | null;
  unita_misura?: string | null;
  measure_status?: "da_rilevare" | "rilevato" | "confermato" | null;
  misure_preventivo?: Record<string, number> | null;
  misure_rilevate?: Record<string, number> | null;
  survey_id?: string | null;
  survey_element_id?: string | null;
}

export type StatoProposta = "collegata" | "proposta" | "secondo_rilievo" | "nuova";

export interface Differenza {
  asse: AsseMisura;
  prima: number | null;
  dopo: number | null;
  delta: number | null;
}

export interface PropostaAbbinamento {
  componente: ComponenteRilevato;
  rigaId: string | null;
  stato: StatoProposta;
  motivo: string;
  differenze: Differenza[];
}

const normalizza = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Il valore di un asse: nei dati esistono sia `larghezza` sia `larghezza_mm`, e `mq` per le quantità. */
export function valoreAsse(m: Record<string, number> | null | undefined, asse: AsseMisura): number | null {
  if (!m) return null;
  const v = m[asse] ?? m[asse.replace(/_mm$/, "")] ?? (asse === "quantita" ? m.mq ?? m.ml : undefined);
  return v == null ? null : Number(v);
}

const NOMI_DEL_COMPONENTE: Record<string, RegExp> = {
  infisso: /finestr|infiss|serrament|portafinestr/,
  tapparella: /tapparell/,
  zanzariera: /zanzarier/,
  persiana: /persian/,
  cassonetto: /cassonett/,
};

function punteggio(riga: RigaMisure, c: ComponenteRilevato, toll: number): number | null {
  const compRiga = normalizza(riga.componente);
  if (compRiga && compRiga !== c.componente) return null;
  let p = 0;
  if (compRiga) p += 3;
  else if (NOMI_DEL_COMPONENTE[c.componente]?.test(normalizza(riga.name)) || normalizza(riga.name).includes(c.componente)) p += 2;
  const rifRiga = normalizza(riga.riferimento);
  const rifComp = normalizza(c.riferimento);
  if (rifRiga && rifComp) {
    if (rifRiga === rifComp) p += 5;
    else if (rifRiga.includes(rifComp) || rifComp.includes(rifRiga)) p += 3;
  }
  const prov = riga.misure_preventivo;
  const l = valoreAsse(prov, "larghezza_mm");
  const h = valoreAsse(prov, "altezza_mm");
  if (c.misure.larghezza_mm != null && l != null && h != null && c.misure.altezza_mm != null) {
    const scarto = Math.max(Math.abs(c.misure.larghezza_mm - l), Math.abs(c.misure.altezza_mm - h));
    p += scarto <= toll ? 4 : scarto <= toll * 3 ? 1 : -2;
  }
  const q = valoreAsse(prov, "quantita") ?? (riga.unita_misura === c.unita ? Number(riga.quantity) || null : null);
  if (c.misure.quantita != null && q != null) {
    p += Math.abs(c.misure.quantita - q) <= q * 0.1 ? 2 : 0;
  }
  return p;
}

export function differenzeMisure(prima: Record<string, number> | null | undefined, dopo: Misure): Differenza[] {
  const assi: AsseMisura[] = ["larghezza_mm", "altezza_mm", "profondita_mm", "quantita"];
  return assi.flatMap((asse) => {
    const a = valoreAsse(prima, asse);
    const b = dopo[asse] ?? null;
    if (a == null && b == null) return [];
    return [{ asse, prima: a, dopo: b, delta: a != null && b != null ? quattroDecimali(b - a) : null }];
  });
}

/**
 * Propone una riga per ogni componente: per riferimento e misure vicine. È una proposta:
 * la conferma una persona. Ogni riga si usa una volta sola.
 */
export function proponiAbbinamenti(
  righe: RigaMisure[],
  componenti: ComponenteRilevato[],
  surveyId: string,
  tolleranzaMm = 50,
): PropostaAbbinamento[] {
  const usate = new Set<string>();
  const esito = new Map<ComponenteRilevato, PropostaAbbinamento>();

  for (const c of componenti) {
    const riga = righe.find((r) => r.survey_element_id === c.elementoId && normalizza(r.componente) === c.componente);
    if (riga) {
      usate.add(riga.id);
      esito.set(c, { componente: c, rigaId: riga.id, stato: "collegata", motivo: "Già collegata a questo rilievo", differenze: differenzeMisure(riga.misure_rilevate, c.misure) });
    }
  }

  const coppie = componenti
    .filter((c) => !esito.has(c))
    .flatMap((c) =>
      righe
        .filter((r) => !usate.has(r.id) && !(r.survey_id === surveyId && r.survey_element_id))
        .map((r) => ({ c, r, p: punteggio(r, c, tolleranzaMm) }))
        .filter((x): x is { c: ComponenteRilevato; r: RigaMisure; p: number } => x.p != null && x.p >= 3),
    )
    .sort((a, b) => b.p - a.p);

  for (const { c, r, p } of coppie) {
    if (esito.has(c) || usate.has(r.id)) continue;
    usate.add(r.id);
    const secondo = !!r.survey_id && r.survey_id !== surveyId && !!r.misure_rilevate;
    esito.set(c, {
      componente: c,
      rigaId: r.id,
      stato: secondo ? "secondo_rilievo" : "proposta",
      motivo: normalizza(r.riferimento) && normalizza(r.riferimento) === normalizza(c.riferimento)
        ? `Stesso riferimento «${r.riferimento}»`
        : p >= 4 ? "Misure vicine" : "Stesso tipo di articolo",
      differenze: differenzeMisure(secondo ? r.misure_rilevate : r.misure_preventivo, c.misure),
    });
  }

  return componenti.map((c) =>
    esito.get(c) ?? { componente: c, rigaId: null, stato: "nuova" as const, motivo: "Nessuna riga simile", differenze: [] },
  );
}

// ── Scarto e testi ──────────────────────────────────────────────────────────

type Scarto = Record<string, { prev: number | null; def: number | null; delta: number | null }>;

export function scartoDellaRiga(
  scarto: Scarto | null | undefined,
  sogliaMm: number,
): { massimoMm: number; oltreSoglia: boolean; deltaQuantita: number | null } {
  const voci = Object.entries(scarto ?? {});
  const massimoMm = voci
    .filter(([k, v]) => k.endsWith("_mm") && v?.delta != null)
    .reduce((max, [, v]) => Math.max(max, Math.abs(Number(v.delta))), 0);
  const q = scarto?.quantita?.delta;
  const deltaQuantita = q == null ? null : Number(q);
  return {
    massimoMm,
    deltaQuantita,
    oltreSoglia: massimoMm > sogliaMm || (deltaQuantita != null && Math.abs(deltaQuantita) >= 0.01),
  };
}

const fmt = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 2 });

export const NOME_ASSE: Record<AsseMisura, string> = {
  larghezza_mm: "Larghezza",
  altezza_mm: "Altezza",
  profondita_mm: "Profondità",
  quantita: "Quantità",
};

/** «1200 × 1400 mm», «1200 × 800 × 2500 mm», «12,5 mq». */
export function misureInTesto(m: Record<string, number> | null | undefined, unita?: string | null): string {
  if (!m) return "—";
  const q = valoreAsse(m, "quantita");
  const l = valoreAsse(m, "larghezza_mm");
  if (l == null && q != null) return `${fmt(q)} ${unita ?? ""}`.trim();
  const assi = (["larghezza_mm", "profondita_mm", "altezza_mm"] as const)
    .map((a) => valoreAsse(m, a))
    .filter((v): v is number => v != null);
  return assi.length ? `${assi.map(fmt).join(" × ")} mm` : "—";
}

export const NOME_TIPO_MISURA: Record<TipoMisura, string> = {
  foro: "misura foro",
  telaio: "misura telaio",
  finita: "misura finita",
};

// ── Elenco del tecnico ──────────────────────────────────────────────────────

export interface CampoPosizione {
  asse: AsseMisura;
  /** Chiave del campo nel modello: il valore finisce anche nel rilievo. */
  chiave: string;
  etichetta: string;
  unita: string;
}

export interface SchedaPosizione {
  elementType: string;
  forma: FormaMisura;
  componente: string;
  campi: CampoPosizione[];
  misuraTipo: TipoMisura;
}

export function formaDellaRiga(riga: RigaMisure & { misura_forma?: FormaMisura | null }): FormaMisura {
  if (riga.misura_forma) return riga.misura_forma;
  const m = { ...(riga.misure_preventivo ?? {}), ...(riga.misure_rilevate ?? {}) };
  if (valoreAsse(m, "larghezza_mm") != null) return valoreAsse(m, "profondita_mm") != null ? "LxPxH" : "LxH";
  const u = (riga.unita_misura ?? "").toLowerCase();
  if (u === "mq" || u === "ml" || u === "m") return u;
  return valoreAsse(m, "quantita") != null ? "mq" : "LxH";
}

/**
 * Che cosa chiedere al tecnico per una posizione, e dove scriverlo nel modello.
 * Se il modello non ha un tipo adatto si usano campi generici in centimetri.
 */
export function schedaDellaPosizione(
  riga: RigaMisure & { misura_forma?: FormaMisura | null; misura_tipo?: TipoMisura | null },
  schema: TemplateSchema | null | undefined,
): SchedaPosizione {
  const forma = formaDellaRiga(riga);
  const tipi = schema?.element_types ?? [];
  const nome = normalizza(riga.name);
  const comp = normalizza(riga.componente);
  const dimensioni = (key: string) =>
    (tipi.find((t) => t.key === key)?.sections ?? [])
      .flatMap((s) => s.fields ?? [])
      .flatMap((f) => [f, ...(f.nested_fields ?? [])])
      .filter((f) => f.type === "dimension" && !NON_DA_ORDINARE.test(f.key));
  const haQuantita = (key: string) => dimensioni(key).some((f) => f.unit === forma);
  const haLati = (key: string) => dimensioni(key).some((f) => /^(larghezza|larghezza_foro)$/.test(f.key));
  const adatto = (key: string) => (forma === "LxH" || forma === "LxPxH" ? haLati(key) : haQuantita(key));

  const perNome = tipi.find((t) => {
    const b = t.key.replace(/_standalone$/, "");
    return adatto(t.key) && (b === comp || NOMI_DEL_COMPONENTE[b]?.test(nome) || nome.includes(b) || nome.includes(normalizza(t.label)));
  });
  const tipo = perNome ?? tipi.find((t) => adatto(t.key)) ?? tipi[0];
  const elementType = tipo?.key ?? "elemento";
  const base = elementType.replace(/_standalone$/, "");
  const componente = riga.componente || base;
  const campiModello = dimensioni(elementType);

  if (forma !== "LxH" && forma !== "LxPxH") {
    const c = campiModello.find((f) => f.unit === forma);
    return {
      elementType, forma, componente, misuraTipo: "finita",
      campi: [{ asse: "quantita", chiave: c?.key ?? "quantita", etichetta: c?.label ?? "Quantità", unita: c?.unit ?? forma }],
    };
  }

  const prendi = (asse: AsseMisura, chiavi: string[], etichetta: string): CampoPosizione => {
    const c = campiModello.find((f) => chiavi.includes(f.key));
    return { asse, chiave: c?.key ?? chiavi[chiavi.length - 1], etichetta: c?.label ?? etichetta, unita: c?.unit ?? "cm" };
  };
  const campi = [
    prendi("larghezza_mm", ["larghezza_foro", "larghezza"], "Larghezza"),
    ...(forma === "LxPxH" ? [prendi("profondita_mm", ["profondita", "lunghezza"], "Profondità")] : []),
    prendi("altezza_mm", ["altezza_foro", "altezza"], "Altezza"),
  ];
  return {
    elementType, forma, componente, campi,
    misuraTipo: riga.misura_tipo ?? (campi[0].chiave.endsWith("_foro") ? "foro" : "finita"),
  };
}

/** Da quello che scrive il tecnico (nell'unità del modello) ai millimetri della riga. */
export function misureDaCampi(campi: CampoPosizione[], scritti: Record<string, string>): Misure | null {
  const out: Misure = {};
  for (const c of campi) {
    const n = numeroMisura(scritti[c.asse]);
    if (n == null) return null;
    const fattore = c.asse === "quantita" ? 1 : FATTORE_MM[c.unita] ?? 1;
    out[c.asse] = c.asse === "quantita" ? quattroDecimali(n) : Math.round(n * fattore * 100) / 100;
  }
  return out;
}

/** Il contrario: una misura salvata, nell'unità del campo, per precompilare. */
export function valoreNelCampo(m: Record<string, number> | null | undefined, c: CampoPosizione): string {
  const v = valoreAsse(m, c.asse);
  if (v == null) return "";
  const fattore = c.asse === "quantita" ? 1 : FATTORE_MM[c.unita] ?? 1;
  return String(Math.round((v / fattore) * 100) / 100);
}
