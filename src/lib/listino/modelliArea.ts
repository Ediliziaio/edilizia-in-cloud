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
}

function quanti(n: number, singolare: string, plurale: string): string {
  return `${n} ${n === 1 ? singolare : plurale}`;
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
  const dettaglio = [parti.join(", "), e.prodotti_nuovi > 0 ? testoPrezzi(e.con_prezzi) : ""]
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
