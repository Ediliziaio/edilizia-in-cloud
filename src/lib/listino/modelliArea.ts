/**
 * Modelli di area del listino (25/09/2026).
 *
 * Un modello è la fotografia di un'area del listino di un'azienda — tipologie,
 * linee, prodotti con foto e schede, varianti — che si installa in un'altra
 * azienda come copia sua. Florin: «entra un'azienda che fa fotovoltaico e usa
 * gli stessi prodotti di un'altra: io ho già tutto impostato».
 *
 * Il lavoro vero sta nel database (20280925160000_modelli_area_listino.sql:
 * listino_modello_crea / _aggiorna / _installa, listino_modelli_disponibili).
 * Qui ci sono le regole che usano le pagine: cosa si può mettere in un
 * modello, come si chiama, e come si racconta quello che succede.
 */
import { nomeArea } from "@/lib/listino/areeStandard";
import type { AreaListino, TipologiaListino } from "@/lib/listino/lineeListino";

/** Il riassunto che il database calcola a ogni fotografia (listino_modello_riepilogo). */
export interface RiepilogoModello {
  tipologie?: number;
  linee?: number;
  schede_linea?: number;
  prodotti?: number;
  con_foto?: number;
  con_scheda?: number;
  varianti?: number;
  celle_griglia?: number;
  fotovoltaico?: boolean;
  nomi_tipologie?: string[];
  copertina?: string | null;
}

/** Una riga di listino_modelli_area senza il contenuto (pesante): la vede solo il super admin. */
export interface ModelloArea {
  id: string;
  nome: string;
  descrizione: string | null;
  area: string;
  immagine_url: string | null;
  pubblicato: boolean;
  con_prezzi_vendita: boolean;
  origine_company_id: string | null;
  origine_nome: string | null;
  riepilogo: RiepilogoModello | null;
  fotografato_il: string;
  updated_at: string;
}

/** Quello che un'azienda vede di un modello pubblicato (listino_modelli_disponibili). */
export interface ModelloDisponibile {
  id: string;
  nome: string;
  descrizione: string | null;
  area: string;
  immagine_url: string | null;
  con_prezzi_vendita: boolean;
  riepilogo: RiepilogoModello | null;
  fotografato_il: string;
  installato_il: string | null;
}

/** Il resoconto di listino_modello_installa. */
export interface EsitoInstallazione {
  modello: string;
  area: string;
  tipologie_nuove: number;
  tipologie_gia_presenti: number;
  linee_nuove: number;
  schede_linea: number;
  prodotti_nuovi: number;
  prodotti_gia_presenti: number;
  varianti: number;
  celle_griglia: number;
  documenti: number;
  con_prezzi: boolean;
  /** Dal 06/10/2026: varianti dei prodotti nuovi che hanno preso la maggiorazione che l'azienda aveva già. */
  maggiorazioni_copiate?: number;
  copia_maggiorazioni?: boolean;
  /** I nomi di linea richiesti, ripuliti e in ordine: servono al database per riconoscere una richiesta uguale. */
  modelli_richiesti?: string[];
}

/** Quello che listino_modello_anteprima racconta prima di installare (non scrive niente). */
export interface AnteprimaInstallazione {
  modello: string;
  prodotti_nuovi: number;
  prodotti_gia_presenti: number;
  /** Varianti dei prodotti nuovi dove l'azienda ha già una maggiorazione diversa da quella del modello. */
  maggiorazioni_copiabili: number;
  /** Su quali assi (Colore, Telaio…), con quante varianti. */
  assi: Array<{ asse: string; varianti: number }>;
  /** Quando lo stesso modello è stato aggiunto da meno di un minuto, se è successo. */
  installazione_recente: string | null;
}

function quanti(n: number, singolare: string, plurale: string): string {
  return `${n} ${n === 1 ? singolare : plurale}`;
}

/** «Colore, Telaio e Tipologia Vetro». */
export function elencoItaliano(voci: ReadonlyArray<string>): string {
  if (voci.length <= 1) return voci[0] ?? "";
  return `${voci.slice(0, -1).join(", ")} e ${voci[voci.length - 1]}`;
}

/** C'è qualcosa da copiare? Se sì l'azienda deve scegliere prima di installare. */
export function haMaggiorazioniDaCopiare(a: AnteprimaInstallazione | null | undefined): boolean {
  return Number(a?.maggiorazioni_copiabili ?? 0) > 0;
}

/** L'avviso prima di installare, quando l'azienda ha già maggiorazioni sulle stesse varianti dei prodotti nuovi. */
export function testoMaggiorazioni(a: AnteprimaInstallazione): { titolo: string; dettaglio: string; sePiuttosto: string } {
  const assi = elencoItaliano(a.assi.map((x) => x.asse));
  return {
    titolo: "Hai già maggiorazioni sulle stesse scelte",
    dettaglio: `Nei tuoi prodotti ci sono già maggiorazioni su ${assi}. ${quanti(
      Number(a.maggiorazioni_copiabili),
      "variante dei prodotti nuovi arriva",
      "varianti dei prodotti nuovi arrivano",
    )} senza la tua.`,
    sePiuttosto:
      "Se non le copi, scegliere quelle varianti in un preventivo non aggiunge nulla al prezzo. Se le copi, ogni variante prende la maggiorazione che usi già più spesso per la stessa scelta: poi le puoi cambiare.",
  };
}

/** Che cosa è andato storto in listino_modello_installa, quando il database lo dice con un «hint». */
export type ErroreInstallazione = "recente" | "in_corso" | "scelta_maggiorazioni" | "altro";

export function tipoErroreInstallazione(e: unknown): ErroreInstallazione {
  const hint = typeof e === "object" && e !== null && "hint" in e ? (e as { hint?: unknown }).hint : null;
  switch (hint) {
    case "installazione_recente":
      return "recente";
    case "installazione_in_corso":
      return "in_corso";
    case "maggiorazioni_da_scegliere":
      return "scelta_maggiorazioni";
    default:
      return "altro";
  }
}

/** Il messaggio del database, già in italiano; se manca, una frase generica. */
export function messaggioErroreInstallazione(e: unknown): string {
  const m = typeof e === "object" && e !== null && "message" in e ? (e as { message?: unknown }).message : null;
  return typeof m === "string" && m.trim() ? m : "Non è andata a buon fine. Riprova fra poco.";
}

/** «6 tipologie · 34 prodotti · 34 con foto · 12 con scheda tecnica». */
export function testoContenuto(r: RiepilogoModello | null | undefined): string {
  if (!r) return "";
  const parti = [
    quanti(Number(r.tipologie ?? 0), "tipologia", "tipologie"),
    quanti(Number(r.prodotti ?? 0), "prodotto", "prodotti"),
  ];
  const foto = Number(r.con_foto ?? 0);
  if (foto > 0) parti.push(`${foto} con foto`);
  const schede = Number(r.con_scheda ?? 0);
  if (schede > 0) parti.push(`${schede} con scheda tecnica`);
  const varianti = Number(r.varianti ?? 0);
  if (varianti > 0) parti.push(quanti(varianti, "variante", "varianti"));
  return parti.join(" · ");
}

/** Cosa succede ai prezzi, detto a chi installa. */
export function testoPrezzi(conPrezzi: boolean): string {
  return conPrezzi
    ? "Arrivano con i prezzi di vendita del modello: puoi cambiarli quando vuoi."
    : "Arrivano senza prezzi: restano fuori dai preventivi finché non metti i tuoi.";
}

/** Quello che l'azienda si trova nel listino dopo l'installazione. */
export function testoEsito(e: EsitoInstallazione): { titolo: string; dettaglio: string } {
  const titolo =
    e.prodotti_nuovi > 0
      ? `${quanti(e.prodotti_nuovi, "prodotto aggiunto", "prodotti aggiunti")} dal modello «${e.modello}»`
      : `Nessun prodotto nuovo: il listino ha già tutto il modello «${e.modello}»`;
  const parti: string[] = [];
  if (e.tipologie_nuove > 0) parti.push(quanti(e.tipologie_nuove, "tipologia nuova", "tipologie nuove"));
  if (e.tipologie_gia_presenti > 0) {
    parti.push(quanti(e.tipologie_gia_presenti, "tipologia che c'era già", "tipologie che c'erano già"));
  }
  if (e.prodotti_gia_presenti > 0) {
    parti.push(`${quanti(e.prodotti_gia_presenti, "prodotto già presente", "prodotti già presenti")}, lasciati com'erano`);
  }
  const copiate = Number(e.maggiorazioni_copiate ?? 0);
  const dettaglio = [
    parti.join(", "),
    copiate > 0 ? `${quanti(copiate, "maggiorazione copiata", "maggiorazioni copiate")} dal tuo listino` : "",
    e.prodotti_nuovi > 0 ? testoPrezzi(e.con_prezzi) : "",
  ]
    .filter(Boolean)
    .join(". ");
  return { titolo, dettaglio: dettaglio ? `${dettaglio}${dettaglio.endsWith(".") ? "" : "."}` : "" };
}

/**
 * Le tipologie di un'area che possono entrare in un modello: solo quelle vere
 * (macrocategorie) con almeno un prodotto. Le «senza tipologia» e le cartelle
 * senza tipologia restano fuori: il modello copia tipologie intere.
 */
export function tipologieModellabili(area: AreaListino): TipologiaListino[] {
  return area.tipologie.filter((t) => t.fonte === "macrocategoria" && !!t.macrocategoriaId && t.articoli > 0);
}

/** Le aree di un'azienda da cui si può fare un modello, con le tipologie buone in cima. */
export function areeModellabili(aree: AreaListino[]): AreaListino[] {
  return aree.filter((a) => tipologieModellabili(a).length > 0);
}

/** Il nome proposto per un modello nuovo: quello dell'area; se c'è già, con un numero. */
export function nomeModelloProposto(areaChiave: string, esistenti: ReadonlyArray<string>): string {
  const base = nomeArea(areaChiave);
  const presi = new Set(esistenti.map((n) => n.trim().toLowerCase()));
  if (!presi.has(base.toLowerCase())) return base;
  for (let i = 2; ; i += 1) {
    const candidato = `${base} ${i}`;
    if (!presi.has(candidato.toLowerCase())) return candidato;
  }
}

/** Filtra i modelli per la ricerca e per l'area scelta. */
export function filtraModelli<T extends { nome: string; descrizione: string | null; area: string }>(
  modelli: ReadonlyArray<T>,
  cerca: string,
  area: string | null,
): T[] {
  const testo = cerca.trim().toLowerCase();
  return modelli.filter(
    (m) =>
      (!area || m.area === area) &&
      (!testo ||
        m.nome.toLowerCase().includes(testo) ||
        (m.descrizione ?? "").toLowerCase().includes(testo) ||
        nomeArea(m.area).toLowerCase().includes(testo)),
  );
}
