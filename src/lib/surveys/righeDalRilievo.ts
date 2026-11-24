/**
 * Dal rilievo alle righe di un preventivo o di un computo.
 * Piano: docs/piano-sopralluoghi-vendita-tecnico.md, lotto 4.
 *
 * Ogni modello di serie dice già come un elemento diventa una riga (`output_mapping.estimate_lines`:
 * «Infisso {tipologia} {larghezza_foro}x{altezza_foro} cm»), ma fino al 24/11/2026 non lo leggeva
 * nessuno. Qui si legge: descrizione, unità e quantità. Il prezzo no: lo mette chi fa il preventivo,
 * o il listino in un passo successivo.
 */
import type { EstimateLineMapping, FieldDefinition, TemplateSchema } from "@/types/surveys";

export interface ElementoRilievo {
  id: string;
  area_id: string;
  element_type: string;
  element_label: string | null;
  position: number;
  values: Record<string, unknown>;
  quantity: number;
}

export interface RigaRilievo {
  elementoId: string;
  ambiente: string;
  descrizione: string;
  unita: string;
  quantita: number;
  /** Quantità non letta dal rilievo (manca la misura): va controllata prima di usarla. */
  daVerificare: boolean;
}

/** Tutti i campi di un tipo di elemento, annidati compresi, per chiave. */
function campiDelTipo(schema: TemplateSchema | null | undefined, tipo: string): Map<string, FieldDefinition> {
  const mappa = new Map<string, FieldDefinition>();
  const def = schema?.element_types?.find((t) => t.key === tipo);
  const visita = (campi: FieldDefinition[] | undefined) => {
    for (const c of campi ?? []) {
      mappa.set(c.key, c);
      visita(c.nested_fields);
    }
  };
  for (const s of def?.sections ?? []) visita(s.fields);
  return mappa;
}

/** Il valore come lo leggerebbe una persona: l'etichetta dell'opzione, non il codice. */
export function valoreLeggibile(valore: unknown, campo?: FieldDefinition): string {
  if (valore === null || valore === undefined || valore === "") return "";
  if (Array.isArray(valore)) return valore.map((v) => valoreLeggibile(v, campo)).filter(Boolean).join(", ");
  if (typeof valore === "boolean") return valore ? "sì" : "";
  if (typeof valore === "object") return "";
  const testo = String(valore).trim();
  const opzione = campo?.options?.find((o) => o.value === testo);
  // Le etichette dei modelli hanno emoji («🪟 Due ante simmetriche»): nel documento no.
  return (opzione?.label ?? testo).replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").trim();
}

/**
 * I complementi rilevati dentro l'infisso (modello Infissi: «Cosa rilevo») sono forniture a sé:
 * nel preventivo ogni complemento spuntato è una riga, con le sue misure.
 */
const COMPLEMENTI_INFISSO: Record<string, string> = {
  tapparella: "Tapparella {tap_materiale} {tap_larghezza}x{tap_altezza} cm — {tap_tipo_motore}",
  cassonetto: "Cassonetto {cas_tipo} {cas_larghezza}x{cas_altezza}x{cas_profondita} cm",
  zanzariera: "Zanzariera {zan_tipo} {zan_larghezza}x{zan_altezza} cm",
  persiana: "Persiana {per_tipo} {per_materiale} {per_larghezza}x{per_altezza} cm — {per_n_ante} ante",
  davanzale: "Davanzale {dav_materiale} {dav_lunghezza} cm",
};

/**
 * Riempie «{campo}» coi valori; i segnaposto vuoti spariscono senza lasciare «x cm» o «— —».
 */
export function riempiDescrizione(
  modello: string,
  valori: Record<string, unknown>,
  campi: Map<string, FieldDefinition> = new Map(),
): string {
  const VUOTO = "\u2205";
  const pieno = modello.replace(/\{([a-z0-9_]+)\}/gi, (_m, chiave: string) =>
    valoreLeggibile(valori[chiave], campi.get(chiave)) || VUOTO);
  const num = "\\d+(?:[.,]\\d+)?";
  // «120x140 cm» resta; con una misura sola resta il numero; senza misure sparisce tutto.
  const misure = new RegExp(`(${num}|${VUOTO})x(${num}|${VUOTO})(?:x(${num}|${VUOTO}))?(\\s*(?:cm|mm))?`, "g");
  const senzaMisure = pieno.replace(misure, (intero, a: string, b: string, c: string | undefined) => {
    const pieni = [a, b, c].filter((x) => x !== undefined && x !== VUOTO);
    if (pieni.length === (c === undefined ? 2 : 3)) return intero;
    return pieni.join(" ");
  });
  // Un tratto «— telaio ∅» fatto solo di parole d'aggancio e valori vuoti si toglie intero.
  const tratti = senzaMisure.split(/\s+[—-]\s+/).filter((t) => {
    if (!t.includes(VUOTO)) return true;
    const resto = t.replaceAll(VUOTO, "").trim();
    return resto !== "" && !/^[a-zà-ù\s]+$/.test(resto);
  });
  return tratti.map((t) => t.replaceAll(VUOTO, "").replace(/\s+/g, " ").trim()).filter(Boolean).join(" — ").trim();
}

const numero = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** Per mq e ml: un campo che è già la superficie o la lunghezza. */
function misuraDaiValori(valori: Record<string, unknown>, unita: string): number | null {
  const chiavi = Object.keys(valori);
  const cerca = unita === "mq"
    ? /(^|_)(mq|superficie|area)($|_)/i
    : unita === "ml" ? /(^|_)(ml|metri_lineari|lunghezza_m)($|_)/i : null;
  if (!cerca) return null;
  for (const k of chiavi) {
    const n = numero(valori[k]);
    if (cerca.test(k) && n !== null && n > 0) return n;
  }
  return null;
}

function quantitaElemento(el: ElementoRilievo, mappa: EstimateLineMapping | undefined): { quantita: number; daVerificare: boolean } {
  const pezzi = Math.max(1, Number(el.quantity) || 1);
  const unita = (mappa?.unit ?? "pz").toLowerCase();
  if (mappa?.quantity_field && mappa.quantity_field !== "quantity") {
    const n = numero(el.values[mappa.quantity_field]);
    if (n !== null && n > 0) return { quantita: n, daVerificare: false };
  }
  if (unita === "mq" || unita === "ml") {
    const n = misuraDaiValori(el.values, unita);
    if (n !== null) return { quantita: n * pezzi, daVerificare: false };
    return { quantita: pezzi, daVerificare: true };
  }
  return { quantita: pezzi, daVerificare: false };
}

/**
 * Una riga per elemento, nell'ordine degli ambienti e degli elementi del rilievo.
 * Senza mappatura per quel tipo: la riga c'è lo stesso, col nome dell'elemento.
 */
export function righeDalRilievo({
  schema, ambienti, elementi,
}: {
  schema: TemplateSchema | null | undefined;
  ambienti: Array<{ id: string; name: string; position?: number }>;
  elementi: ElementoRilievo[];
}): RigaRilievo[] {
  const ordineAmbienti = new Map(ambienti.map((a, i) => [a.id, a.position ?? i]));
  const nomeAmbiente = new Map(ambienti.map((a) => [a.id, a.name]));
  const mappature = schema?.output_mapping?.estimate_lines ?? {};
  return [...elementi]
    .sort((a, b) => (ordineAmbienti.get(a.area_id) ?? 0) - (ordineAmbienti.get(b.area_id) ?? 0) || a.position - b.position)
    .flatMap((el) => {
      const mappa = mappature[el.element_type];
      const tipo = schema?.element_types?.find((t) => t.key === el.element_type);
      const base = mappa?.description_template
        ? riempiDescrizione(mappa.description_template, el.values, campiDelTipo(schema, el.element_type))
        : "";
      const nome = el.element_label?.trim() || tipo?.label || el.element_type;
      const descrizione = base && base.length > 3 ? base : nome;
      const { quantita, daVerificare } = quantitaElemento(el, mappa);
      const ambiente = nomeAmbiente.get(el.area_id) ?? "";
      const principale: RigaRilievo = {
        elementoId: el.id,
        ambiente,
        descrizione: el.element_label?.trim() && base ? `${el.element_label.trim()} · ${descrizione}` : descrizione,
        unita: (mappa?.unit ?? "pz").toLowerCase(),
        quantita,
        daVerificare,
      };
      const complementi = el.element_type === "infisso" && Array.isArray(el.values.complementi) ? el.values.complementi as unknown[] : [];
      const campi = campiDelTipo(schema, el.element_type);
      const riferimento = el.element_label?.split("·")[0]?.trim();
      const extra = complementi.flatMap((c): RigaRilievo[] => {
        const modello = COMPLEMENTI_INFISSO[String(c)];
        if (!modello) return [];
        return [{
          elementoId: `${el.id}:${String(c)}`,
          ambiente,
          descrizione: `${riferimento ? `${riferimento} · ` : ""}${riempiDescrizione(modello, el.values, campi)}`,
          unita: "pz",
          quantita: Math.max(1, Number(el.quantity) || 1),
          daVerificare: false,
        }];
      });
      return [principale, ...extra];
    });
}

// ─── Le due uscite ───────────────────────────────────────────────────────────

export interface RigaScelta extends RigaRilievo {
  inclusa: boolean;
  /** Euro, scritto da chi prepara il preventivo. */
  prezzo: number;
}

/** Righe per `save_quote_items_atomic`, come il preventivo dalla planimetria. */
export function itemsPreventivoDalRilievo(righe: RigaScelta[], codice: string, ivaPercento: number) {
  return righe.filter((r) => r.inclusa && r.quantita > 0).map((r, i) => ({
    name: (r.ambiente ? `${r.ambiente} — ${r.descrizione}` : r.descrizione).slice(0, 250),
    description: `Dal sopralluogo ${codice}`,
    quantity: r.quantita,
    unit_price: Math.round((r.prezzo || 0) * 100) / 100,
    vat_rate: ivaPercento,
    unit_of_measure: r.unita,
    item_category: "prodotto" as const,
    item_type: "product",
    tariffa_id: null as string | null,
    prezzo_acquisto: 0,
    sort_order: i,
  }));
}

/** Nel computo i pezzi si scrivono «cad», come nei prezzari. */
export const unitaComputo = (unita: string) => (unita === "pz" ? "cad" : unita);

export interface VoceComputoDalRilievo {
  capitolo: string;
  descrizione: string;
  unita: string;
  quantita: string;
}

/** Una voce per riga, con l'ambiente come capitolo: il computo resta diviso come il rilievo. */
export function vociComputoDalRilievo(righe: RigaScelta[], codice: string): VoceComputoDalRilievo[] {
  return righe.filter((r) => r.inclusa && r.quantita > 0).map((r) => ({
    capitolo: r.ambiente || `Sopralluogo ${codice}`,
    descrizione: r.descrizione,
    unita: unitaComputo(r.unita),
    quantita: String(r.quantita).replace(".", ","),
  }));
}
