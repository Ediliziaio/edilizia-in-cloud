/**
 * Idee pronte per il render della stanza: un clic imposta stile, intensità, materiali e una
 * richiesta scritta. Si parte da qui e si ritocca il resto nel modulo. Tipo di stanza, foto del
 * catalogo e ciò che l'utente ha scritto prima restano suoi.
 */
import type { ConfigurazioneStanza, TipoStanza } from "./types";

export interface IdeaPronta {
  id: string;
  nome: string;
  /** Una riga per il cliente: cosa si vedrà. */
  descrizione: string;
  /** Tre colori per l'anteprima della scheda. */
  tavolozza: [string, string, string];
  /** Stanze per cui l'idea ha senso (vuoto: tutte). */
  stanze?: TipoStanza[];
  applica: (c: ConfigurazioneStanza) => Partial<ConfigurazioneStanza>;
  /** La richiesta a parole che finisce nel prompt. */
  richiesta: string;
}

const spento = <T extends { attivo: boolean }>(x: T): T => ({ ...x, attivo: false });

export const IDEE_PRONTE: IdeaPronta[] = [
  {
    id: "scandinavo_caldo",
    nome: "Scandinavo caldo",
    descrizione: "Rovere chiaro, bianco caldo, tessuti naturali, tanta luce",
    tavolozza: ["#F4EFE6", "#C9A97C", "#7D8B74"],
    richiesta: "Atmosfera scandinava calda e accogliente: legno di rovere chiaro, pareti bianco caldo, tessili in lino e lana, piante verdi, luce naturale abbondante.",
    applica: (c) => ({
      stile_target: "scandinavo",
      intensita: "medio",
      verniciatura: { ...c.verniciatura, attivo: true, colore_hex: "#F4EFE6", colore_nome: "bianco caldo", finitura: "opaco", applica_a: "tutte" },
      pavimento: { ...c.pavimento, attivo: true, tipo: "parquet_legno", colore_hex: "#C9A97C", essenza_legno: "rovere_naturale", finitura: "opaco", pattern: "dritto" },
      arredo: { ...c.arredo, attivo: true, materiale: "legno_chiaro", colore_principale_hex: "#C9A97C", intensita_cambio: "stile_mantenendo_layout" },
      illuminazione: { ...c.illuminazione, attivo: true, tipo: "lampade_sospensione", temperatura: "calda_2700k", intensita_luce: "normale" },
      tende: { ...c.tende, attivo: true, tipo: "tende_lino", colore_hex: "#EDE6DA", colore_nome: "lino naturale" },
    }),
  },
  {
    id: "japandi",
    nome: "Japandi",
    descrizione: "Legno, toni sabbia, linee basse e pulite, niente in più",
    tavolozza: ["#E7DFD3", "#8C6E52", "#3B3A36"],
    richiesta: "Stile japandi: arredi bassi dalle linee pulite, legno naturale e toni sabbia, pochi oggetti scelti, ceramiche artigianali, luce morbida e indiretta.",
    applica: (c) => ({
      stile_target: "giapponese",
      intensita: "medio",
      verniciatura: { ...c.verniciatura, attivo: true, colore_hex: "#E7DFD3", colore_nome: "sabbia", finitura: "opaco", applica_a: "tutte" },
      pavimento: { ...c.pavimento, attivo: true, tipo: "parquet_legno", colore_hex: "#A68463", essenza_legno: "rovere_naturale", finitura: "opaco" },
      arredo: { ...c.arredo, attivo: true, materiale: "legno_chiaro", colore_principale_hex: "#8C6E52", intensita_cambio: "stile_mantenendo_layout" },
      illuminazione: { ...c.illuminazione, attivo: true, tipo: "led_strip_perimetrale", temperatura: "calda_2700k", intensita_luce: "soffusa" },
      spazi_dettagli: { ...(c.spazi_dettagli ?? { attivo: false }), attivo: true, layout_strategy: "declutter" },
    }),
  },
  {
    id: "industriale",
    nome: "Industriale",
    descrizione: "Cemento, metallo nero, mattone a vista, luci a sospensione",
    tavolozza: ["#9A9A96", "#2B2B2B", "#A0522D"],
    richiesta: "Loft industriale: pavimento effetto cemento, dettagli in metallo nero, una parete in mattone a vista, lampade a sospensione in metallo, pelle invecchiata.",
    applica: (c) => ({
      stile_target: "industriale",
      intensita: "radicale",
      pavimento: { ...c.pavimento, attivo: true, tipo: "gres_porcellanato", effetto_visivo: "cemento", colore_hex: "#9A9A96", formato_piastrella: "120x120", finitura: "opaco" },
      rivestimento_pareti: { ...c.rivestimento_pareti, attivo: true, tipo: "mattone_vista", applica_a: "parete_principale" },
      arredo: { ...c.arredo, attivo: true, materiale: "metallo", colore_principale_hex: "#2B2B2B", intensita_cambio: "arredo_completo" },
      illuminazione: { ...c.illuminazione, attivo: true, tipo: "lampade_sospensione", temperatura: "calda_2700k", intensita_luce: "normale" },
    }),
  },
  {
    id: "lusso_contemporaneo",
    nome: "Lusso contemporaneo",
    descrizione: "Marmo, ottone, velluto, luce d'atmosfera",
    tavolozza: ["#EDEAE4", "#B08D57", "#1F2A36"],
    richiesta: "Lusso contemporaneo: marmo chiaro venato, finiture in ottone spazzolato, velluti blu notte, boiserie, luce d'atmosfera con controsoffitto e led nascosti.",
    applica: (c) => ({
      stile_target: "luxe_contemporaneo",
      intensita: "radicale",
      pavimento: { ...c.pavimento, attivo: true, tipo: "gres_porcellanato", effetto_visivo: "marmo", colore_hex: "#EDEAE4", formato_piastrella: "120x120", finitura: "lucido" },
      rivestimento_pareti: { ...c.rivestimento_pareti, attivo: true, tipo: "boiserie_legno", applica_a: "parete_principale", colore_hex: "#EDEAE4" },
      arredo: { ...c.arredo, attivo: true, materiale: "tessuto", colore_principale_hex: "#1F2A36", intensita_cambio: "arredo_completo" },
      soffitto: { ...c.soffitto, attivo: true, tipo: "controsoffitto_cartongesso", colore_hex: "#FFFFFF" },
      illuminazione: { ...c.illuminazione, attivo: true, tipo: "misto", temperatura: "calda_2700k", intensita_luce: "soffusa" },
      tende: { ...c.tende, attivo: true, tipo: "tende_velluto", colore_hex: "#1F2A36", colore_nome: "blu notte" },
    }),
  },
  {
    id: "rustico_moderno",
    nome: "Rustico moderno",
    descrizione: "Travi a vista, legno vissuto, pietra, colori della terra",
    tavolozza: ["#E9E1D4", "#7A5A3A", "#9C9486"],
    richiesta: "Rustico moderno: travi in legno a vista, legno vissuto e pietra naturale, colori della terra, arredi semplici e contemporanei, luce calda.",
    applica: (c) => ({
      stile_target: "rustico",
      intensita: "medio",
      soffitto: { ...c.soffitto, attivo: true, tipo: "travi_legno", colore_hex: "#FFFFFF", colore_travi: "noce" },
      pavimento: { ...c.pavimento, attivo: true, tipo: "parquet_legno", colore_hex: "#7A5A3A", essenza_legno: "noce", finitura: "opaco" },
      rivestimento_pareti: { ...c.rivestimento_pareti, attivo: true, tipo: "pietra_naturale", applica_a: "parete_principale" },
      arredo: { ...c.arredo, attivo: true, materiale: "legno_scuro", colore_principale_hex: "#7A5A3A", intensita_cambio: "stile_mantenendo_layout" },
      illuminazione: { ...c.illuminazione, attivo: true, tipo: "misto", temperatura: "calda_2700k", intensita_luce: "normale" },
    }),
  },
  {
    id: "mediterraneo",
    nome: "Mediterraneo",
    descrizione: "Calce bianca, cotto, blu e verde oliva",
    tavolozza: ["#FBF8F2", "#C46A3B", "#2F5D8A"],
    richiesta: "Casa mediterranea: pareti in calce bianca, pavimento in cotto o cementine, accenti blu e verde oliva, fibre naturali, ceramiche dipinte, luce solare.",
    applica: (c) => ({
      stile_target: "mediterraneo",
      intensita: "medio",
      verniciatura: { ...c.verniciatura, attivo: true, colore_hex: "#FBF8F2", colore_nome: "calce bianca", finitura: "opaco", applica_a: "tutte" },
      pavimento: { ...c.pavimento, attivo: true, tipo: "cotto", colore_hex: "#C46A3B", finitura: "opaco" },
      arredo: { ...c.arredo, attivo: true, materiale: "legno_chiaro", colore_principale_hex: "#2F5D8A", intensita_cambio: "stile_mantenendo_layout" },
      tende: { ...c.tende, attivo: true, tipo: "tende_lino", colore_hex: "#FBF8F2", colore_nome: "bianco" },
    }),
  },
  {
    id: "minimal_bianco",
    nome: "Minimal total white",
    descrizione: "Bianco, grigio chiaro, superfici continue, zero disordine",
    tavolozza: ["#FFFFFF", "#D9D9D6", "#6B6B6B"],
    richiesta: "Minimalismo: superfici bianche continue, pavimento in resina grigio chiaro, mobili senza maniglie, nessun oggetto superfluo, luce uniforme da faretti incassati.",
    applica: (c) => ({
      stile_target: "minimalista",
      intensita: "radicale",
      verniciatura: { ...c.verniciatura, attivo: true, colore_hex: "#FFFFFF", colore_nome: "bianco", finitura: "opaco", applica_a: "tutte" },
      pavimento: { ...c.pavimento, attivo: true, tipo: "resina", colore_hex: "#D9D9D6", finitura: "satinato" },
      illuminazione: { ...c.illuminazione, attivo: true, tipo: "faretti_incassati", temperatura: "neutra_3000k", intensita_luce: "normale" },
      spazi_dettagli: { ...(c.spazi_dettagli ?? { attivo: false }), attivo: true, layout_strategy: "declutter" },
      ...(c.tipo_stanza === "cucina" ? { restyling_cucina: { ...(c.restyling_cucina ?? { attivo: false }), attivo: true, materiale_frontali: "laccato" as const, colore_frontali_hex: "#FFFFFF", maniglie: "senza_maniglia" as const } } : {}),
    }),
  },
  {
    id: "bagno_spa",
    nome: "Bagno spa",
    descrizione: "Pietra, legno teak, doccia a filo, luce calda",
    tavolozza: ["#D8D2C8", "#8A6A4A", "#4A5A52"],
    stanze: ["bagno"],
    richiesta: "Bagno in stile spa: grandi lastre effetto pietra, doccia a filo pavimento con vetro, mobile sospeso in legno teak, specchio retroilluminato, piante, luce calda e soffusa.",
    applica: (c) => ({
      stile_target: "moderno",
      intensita: "radicale",
      pavimento: { ...c.pavimento, attivo: true, tipo: "gres_porcellanato", effetto_visivo: "pietra", colore_hex: "#D8D2C8", formato_piastrella: "120x120", finitura: "opaco" },
      arredo: { ...c.arredo, attivo: true, materiale: "legno_scuro", colore_principale_hex: "#8A6A4A", intensita_cambio: "arredo_completo" },
      illuminazione: { ...c.illuminazione, attivo: true, tipo: "led_strip_perimetrale", temperatura: "calda_2700k", intensita_luce: "soffusa" },
    }),
  },
  {
    id: "rinfresca",
    nome: "Solo una rinfrescata",
    descrizione: "Pareti e luci nuove, tutto il resto com'è",
    tavolozza: ["#F2F0EB", "#E0D7C6", "#B8B2A6"],
    richiesta: "Intervento leggero: ridipingere le pareti in un bianco caldo e migliorare la luce; lasciare arredi, pavimento e disposizione esattamente come sono.",
    applica: (c) => ({
      intensita: "leggero",
      verniciatura: { ...c.verniciatura, attivo: true, colore_hex: "#F2F0EB", colore_nome: "bianco caldo", finitura: "opaco", applica_a: "tutte" },
      illuminazione: { ...c.illuminazione, attivo: true, tipo: "misto", temperatura: "calda_2700k", intensita_luce: "normale" },
      pavimento: spento(c.pavimento),
      arredo: spento(c.arredo),
    }),
  },
];

export function ideePerStanza(tipo: TipoStanza): IdeaPronta[] {
  return IDEE_PRONTE.filter((i) => !i.stanze || i.stanze.includes(tipo));
}

/**
 * Applica l'idea: parte dalla configurazione di prima, ne cambia solo ciò che l'idea decide e mette
 * la richiesta a parole in testa alle note, senza cancellare quello che l'utente aveva scritto.
 */
export function applicaIdea(c: ConfigurazioneStanza, idea: IdeaPronta): ConfigurazioneStanza {
  const scritte = (c.note_libere ?? "")
    .split("\n")
    .filter((riga) => !IDEE_PRONTE.some((i) => i.richiesta === riga.trim()))
    .join("\n")
    .trim();
  return {
    ...c,
    ...idea.applica(c),
    tipo_stanza: c.tipo_stanza,
    catalogo_reference_ids: c.catalogo_reference_ids,
    note_libere: [idea.richiesta, scritte].filter(Boolean).join("\n"),
  };
}

/** Quale idea corrisponde alla configurazione (per evidenziarla), se la richiesta è ancora lì. */
export function ideaAttiva(c: ConfigurazioneStanza): string | null {
  const note = c.note_libere ?? "";
  return IDEE_PRONTE.find((i) => note.split("\n").some((r) => r.trim() === i.richiesta))?.id ?? null;
}
