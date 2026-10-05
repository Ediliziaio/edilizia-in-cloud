/**
 * Coerenza della configurazione pergola.
 *
 * Il form tiene separati tipologia, interruttore «addossata», copertura, stato
 * della copertura, montanti e materiale, ognuno col suo default. Chi cambia solo
 * la tipologia (il caso normale) si porta dietro gli altri default e il prompt
 * diceva due cose opposte: «bioclimatica autoportante» con «Wall-mounted: yes»,
 * «telo retraibile» con copertura a lamelle inclinate di 45°, vetro con
 * «louvers tilted about 45 degrees», 2 montanti per una struttura che ne
 * descrive quattro agli angoli. Qui la regola unica, usata dai due costruttori
 * del prompt (quello della edge e quello condiviso) e dalla scelta delle foto:
 *
 *  - la tipologia dice addossata/autoportante (tutte e dieci lo hanno nel nome):
 *    vince sull'interruttore;
 *  - bioclimatica/telo/vetro dicono la copertura: vince sulla tendina, tranne
 *    nell'operazione «solo copertura», dove la copertura nuova È la scelta;
 *  - lo stato segue la copertura (inclinazioni solo per le lamelle, raccolto e
 *    disteso solo per il telo, le coperture fisse sono chiuse);
 *  - una pergola autoportante sta su almeno 4 montanti;
 *  - una tipologia «legno» non è di alluminio o acciaio (default del form).
 *
 * Su una configurazione già coerente non cambia niente: stesso oggetto, stesso prompt.
 */
import type {
  ConfigurazionePergole,
  MaterialeStrutturaPergola,
  StatoCoperturaPergola,
  TipoCoperturaPergola,
  TipoPergola,
} from "./types.ts";

/** La copertura che la tipologia porta nel nome; null se la tipologia non la decide (legno, generiche). */
export function coperturaDellaTipologia(tipo: string | null | undefined): TipoCoperturaPergola | null {
  const t = tipo ?? "";
  if (t.startsWith("bioclimatica")) return "lamelle_orientabili";
  if (t.startsWith("telo")) return "telo_retraibile";
  if (t.startsWith("vetro")) return "vetro";
  return null;
}

/** Addossata (true) o autoportante (false) secondo il nome della tipologia; null se non lo dice. */
export function montaggioDellaTipologia(tipo: string | null | undefined): boolean | null {
  const t = tipo ?? "";
  if (t === "addossata" || t.endsWith("_addossata")) return true;
  if (t === "autoportante" || t.endsWith("_autoportante")) return false;
  return null;
}

/** La pergola è attaccata alla facciata? La tipologia vince sull'interruttore del form. */
export function pergolaAddossata(tipo: string | null | undefined, interruttore: boolean | null | undefined): boolean {
  return montaggioDellaTipologia(tipo) ?? interruttore === true;
}

/** La copertura che il render deve mostrare. */
export function coperturaEffettiva(
  operazione: string | null | undefined,
  tipoStruttura: string | null | undefined,
  tipoCopertura: string | null | undefined,
): TipoCoperturaPergola | null {
  const scelta = (tipoCopertura || null) as TipoCoperturaPergola | null;
  if (operazione === "change_cover_only") return scelta ?? coperturaDellaTipologia(tipoStruttura);
  return coperturaDellaTipologia(tipoStruttura) ?? scelta;
}

/** Coperture senza parti mobili: l'unico stato sensato è chiuso. */
export const COPERTURE_FISSE = new Set<string>(["vetro", "policarbonato", "copertura_opaca_tecnica", "listelli_legno"]);

/** Gli stati che una copertura può avere (per il form e per i test). */
export function statiPerCopertura(copertura: string | null | undefined): StatoCoperturaPergola[] {
  if (copertura === "lamelle_orientabili") return ["chiusa", "semi_aperta", "aperta", "lamelle_15", "lamelle_30", "lamelle_45", "lamelle_90"];
  if (copertura === "telo_retraibile") return ["chiusa", "semi_aperta", "aperta", "telo_raccolto", "telo_disteso"];
  if (copertura && COPERTURE_FISSE.has(copertura)) return ["chiusa"];
  return ["chiusa", "semi_aperta", "aperta", "lamelle_15", "lamelle_30", "lamelle_45", "lamelle_90", "telo_raccolto", "telo_disteso"];
}

/** Lo stato coerente con la copertura: uno stato valido resta com'è, uno impossibile diventa il più vicino possibile. */
export function statoCoperturaCoerente(
  copertura: string | null | undefined,
  stato: StatoCoperturaPergola,
): StatoCoperturaPergola {
  if (statiPerCopertura(copertura).includes(stato)) return stato;
  if (copertura && COPERTURE_FISSE.has(copertura)) return "chiusa";
  if (copertura === "telo_retraibile") {
    if (stato === "lamelle_90") return "telo_raccolto";
    if (stato === "lamelle_15") return "telo_disteso";
    return "semi_aperta";
  }
  if (copertura === "lamelle_orientabili") return stato === "telo_raccolto" ? "lamelle_90" : "chiusa";
  return stato;
}

/**
 * L'ancoraggio a terra quando il form non lo sceglie: dalla zona. Prima il default
 * del form salvava «pavimento» e la zona giardino non lo cambiava mai.
 */
export function ancoraggioDallaZona(zona: string | null | undefined): NonNullable<ConfigurazionePergole["installazione"]["ancoraggio_a_terra"]> {
  if (zona === "giardino_relax") return "prato_con_plinti";
  if (zona === "bordo_piscina") return "bordo_piscina";
  if (zona === "terrazzo") return "terrazzo";
  return "pavimento";
}

/** Montanti: l'autoportante ne ha almeno 4 (il default del form è 2, pensato per l'addossata). */
export function numeroMontanti(addossata: boolean, numero: number | null | undefined): number {
  const n = numero === 2 || numero === 4 || numero === 6 ? numero : addossata ? 2 : 4;
  return addossata ? n : Math.max(4, n);
}

/** Una tipologia «legno» con alluminio o acciaio (il default del form) si legge in legno lamellare. */
export function materialeCoerente(tipo: string | null | undefined, materiale: MaterialeStrutturaPergola): MaterialeStrutturaPergola {
  if ((tipo ?? "").startsWith("legno") && (materiale === "alluminio" || materiale === "acciaio")) return "legno_lamellare";
  return materiale;
}

/**
 * La tipologia da descrivere nel prompt: quella scelta, oppure la sua forma
 * generica (addossata/autoportante) quando la copertura nuova non è quella che
 * la tipologia porta nel nome (solo copertura: lamelle → telo).
 */
export function tipologiaDescritta(tipo: TipoPergola, copertura: string | null | undefined, addossata: boolean): TipoPergola {
  const implicita = coperturaDellaTipologia(tipo);
  if (implicita && copertura && implicita !== copertura) return addossata ? "addossata" : "autoportante";
  return tipo;
}

/** La stessa tipologia col montaggio chiesto («bioclimatica_addossata» ↔ «bioclimatica_autoportante»). Per l'interruttore del form. */
export function tipologiaConMontaggio(tipo: TipoPergola, addossata: boolean): TipoPergola {
  const montaggio = addossata ? "addossata" : "autoportante";
  if (tipo === "addossata" || tipo === "autoportante") return montaggio;
  return tipo.replace(/_(addossata|autoportante)$/, `_${montaggio}`) as TipoPergola;
}

/**
 * La tipologia che va d'accordo con una copertura scelta nel form: se la
 * tipologia porta un'altra copertura nel nome (bioclimatica → lamelle) si passa
 * alla famiglia della copertura, o alla forma generica. Legno e generiche
 * accettano qualunque copertura. Così la tendina non «torna indietro» da sola.
 */
export function tipologiaPerCopertura(tipo: TipoPergola, copertura: TipoCoperturaPergola, addossata: boolean): TipoPergola {
  const implicita = coperturaDellaTipologia(tipo);
  if (!implicita || implicita === copertura) return tipo;
  const montaggio = addossata ? "addossata" : "autoportante";
  const famiglia = copertura === "lamelle_orientabili" ? "bioclimatica" : copertura === "telo_retraibile" ? "telo" : copertura === "vetro" ? "vetro" : null;
  return (famiglia ? `${famiglia}_${montaggio}` : montaggio) as TipoPergola;
}

/**
 * La configurazione coerente. Restituisce lo stesso oggetto se è già coerente
 * (le sessioni salvate coerenti producono lo stesso prompt di prima).
 */
export function normalizzaConfigPergola(config: ConfigurazionePergole): ConfigurazionePergole {
  const installazione = config.installazione ?? ({} as ConfigurazionePergole["installazione"]);
  const struttura = config.struttura ?? ({} as ConfigurazionePergole["struttura"]);
  const copertura = config.copertura ?? ({} as ConfigurazionePergole["copertura"]);

  const addossata = pergolaAddossata(struttura.tipo, installazione.addossata_si_no);
  const montanti = installazione.numero_montanti === undefined ? undefined : numeroMontanti(addossata, installazione.numero_montanti);
  const coperturaTipo = coperturaEffettiva(config.operazione, struttura.tipo, copertura.tipo);
  const stato = copertura.stato ? statoCoperturaCoerente(coperturaTipo, copertura.stato) : copertura.stato;
  const materiale = struttura.materiale ? materialeCoerente(struttura.tipo, struttura.materiale) : struttura.materiale;

  const cambiaInstallazione = (installazione.addossata_si_no !== undefined && installazione.addossata_si_no !== addossata) ||
    montanti !== installazione.numero_montanti;
  const cambiaCopertura = (coperturaTipo ?? copertura.tipo) !== copertura.tipo || stato !== copertura.stato;
  const cambiaStruttura = materiale !== struttura.materiale;
  if (!cambiaInstallazione && !cambiaCopertura && !cambiaStruttura) return config;

  return {
    ...config,
    ...(cambiaInstallazione && config.installazione
      ? { installazione: { ...installazione, addossata_si_no: addossata, ...(montanti === undefined ? {} : { numero_montanti: montanti as 2 | 4 | 6 }) } }
      : {}),
    ...(cambiaCopertura && config.copertura
      ? { copertura: { ...copertura, tipo: (coperturaTipo ?? copertura.tipo) as TipoCoperturaPergola, stato } }
      : {}),
    ...(cambiaStruttura && config.struttura ? { struttura: { ...struttura, materiale } } : {}),
  };
}
