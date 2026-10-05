/**
 * Cosa cambia ogni operazione del render piscina: UNA tabella per il prompt
 * (edge e libreria condivisa) e per le foto di riferimento.
 *
 * Perché esiste: il form tiene sempre un valore per ogni campo (accesso «gradini
 * d'angolo», coping «travertino», area «prato raccordato»…) anche quando
 * l'operazione non li tocca. «Solo bordo» finiva così per dire al modello
 * «aggiungi gradini d'angolo» e descriveva la tipologia di default come se
 * andasse costruita. Un elemento fuori ambito si CONSERVA com'è nella foto:
 * niente testo che lo descriva come obiettivo, niente foto che lo mostri (una
 * foto di un elemento che resta com'è spinge il modello a cambiarlo).
 *
 * Operazione assente o sconosciuta = nuova piscina: è il default dell'edge
 * (`text(config.operazione, "add_new_pool")`) e del suo `switch`.
 */
import type { TipoOperazionePiscina } from "./types.ts";

export type ElementoPiscina =
  /** La vasca: tipologia, forma, dimensioni, sistema di bordo, quota, rivestimento esterno, posizione. */
  | "vasca"
  /** Rivestimento interno (fondo e pareti). */
  | "rivestimento"
  | "colore_acqua"
  | "coping"
  | "area_perimetrale"
  | "accesso"
  | "accessori"
  | "illuminazione"
  | "arredo"
  /** Cosa va al posto della piscina tolta (solo rimozione). */
  | "ripristino";

const PISCINA_INTERA: readonly ElementoPiscina[] = [
  "vasca",
  "rivestimento",
  "colore_acqua",
  "coping",
  "area_perimetrale",
  "accesso",
  "accessori",
  "illuminazione",
  "arredo",
];

export const ELEMENTI_PER_OPERAZIONE: Record<TipoOperazionePiscina, readonly ElementoPiscina[]> = {
  add_new_pool: PISCINA_INTERA,
  replace_existing_pool: PISCINA_INTERA,
  // Si toglie la piscina e si ripristina il terreno: nessun elemento della vasca.
  remove_existing_pool: ["ripristino"],
  recolor_waterlook_or_liner_only: ["rivestimento", "colore_acqua"],
  change_coping_only: ["coping"],
  add_access_system: ["accesso"],
  // Le luci sono una caratteristica come le altre: il form le offre nello stesso gruppo.
  add_pool_features: ["accessori", "illuminazione"],
};

/** Gli elementi che l'operazione cambia (assente o sconosciuta = nuova piscina). */
export function elementiCheCambiano(operazione: string | null | undefined): readonly ElementoPiscina[] {
  return operazione && Object.prototype.hasOwnProperty.call(ELEMENTI_PER_OPERAZIONE, operazione)
    ? ELEMENTI_PER_OPERAZIONE[operazione as TipoOperazionePiscina]
    : PISCINA_INTERA;
}

export function cambiaElemento(operazione: string | null | undefined, elemento: ElementoPiscina): boolean {
  return elementiCheCambiano(operazione).includes(elemento);
}

/** Nuova piscina o sostituzione: tutto cambia, il prompt resta quello di sempre. */
export function cambiaTuttaLaPiscina(operazione: string | null | undefined): boolean {
  return cambiaElemento(operazione, "vasca");
}

/** Campo del config → elemento che lo usa. I campi non elencati valgono sempre (note, liste del cliente). */
const CAMPI: Record<string, Record<string, ElementoPiscina>> = {
  piscina: {
    tipo: "vasca",
    forma: "vasca",
    dimensione_apparente: "vasca",
    sistema_bordo: "vasca",
    lunghezza_m: "vasca",
    larghezza_m: "vasca",
    colore_acqua: "colore_acqua",
  },
  finiture: {
    rivestimento_interno: "rivestimento",
    coping: "coping",
    fuga_bordo: "coping",
    area_perimetrale: "area_perimetrale",
    rivestimento_esterno: "vasca",
    superficie_ripristino: "ripristino",
  },
  comfort: {
    accesso: "accesso",
    accessori: "accessori",
    illuminazione: "illuminazione",
    arredo: "arredo",
  },
  // L'inserimento descrive dove costruire una vasca nuova; posizione e note tecniche
  // («non toccare l'ulivo») valgono anche quando si lavora su una piscina che c'è già.
  inserimento: {
    zona: "vasca",
    footprint_apparente: "vasca",
    larghezza_apparente: "vasca",
    lunghezza_apparente: "vasca",
    profondita_apparente: "vasca",
    quota_bordo: "vasca",
    rapporto_con_casa: "vasca",
    rapporto_con_prato: "vasca",
    rapporto_con_deck: "vasca",
  },
};

/**
 * Il config come lo deve leggere chi riscrive il prompt in prosa (il rewriter
 * dell'edge «riformula ogni valore» di piscina, finiture e comfort): senza i campi
 * degli elementi che l'operazione non cambia. Nuova piscina o sostituzione: lo stesso
 * oggetto, identico (stesso input al rewriter di prima).
 */
export function configPerAmbito(config: Record<string, unknown>): Record<string, unknown> {
  const operazione = typeof config.operazione === "string" ? config.operazione : null;
  if (cambiaTuttaLaPiscina(operazione)) return config;
  const elementi = elementiCheCambiano(operazione);
  const out: Record<string, unknown> = {};
  for (const [chiave, valore] of Object.entries(config)) {
    const campi = CAMPI[chiave];
    if (!campi || !valore || typeof valore !== "object" || Array.isArray(valore)) {
      out[chiave] = valore;
      continue;
    }
    const sezione: Record<string, unknown> = {};
    for (const [campo, v] of Object.entries(valore as Record<string, unknown>)) {
      const elemento = campi[campo];
      if (!elemento || elementi.includes(elemento)) sezione[campo] = v;
    }
    if (Object.keys(sezione).length > 0) out[chiave] = sezione;
  }
  return out;
}
