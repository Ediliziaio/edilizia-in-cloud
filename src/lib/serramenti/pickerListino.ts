/**
 * Cosa propone «Aggiungi dal listino» nel preventivatore serramenti.
 *
 * Lo stesso listino della pagina Listino (area → tipologia → linea →
 * prodotti), ma della sola area Serramenti: un inverter o un modulo del
 * fotovoltaico non compare mai, né fra le schede né cercando. Cosa si vede lo
 * decide il listino:
 *  - la tipologia accesa e del tipo giusto (prodotto principale o accessorio);
 *  - fra le schede, se è collegata al preventivatore o non ha collegamenti:
 *    una tipologia collegata altrove si trova solo cercando;
 *  - dentro, i prodotti accesi e proposti nei preventivi.
 *
 * Senza React: la usa ListinoPickerDialog.
 */
import type { ListinoFamily } from "@/lib/serramenti/api";
import { applyMaggiorazioniAssi, calcolaPrezzoProdotto } from "@/lib/serramenti/pricing";
import {
  costruisciListino,
  filtraListino,
  type AreaListino,
  type CategoriaListino,
  type LineaListino,
  type MacroListino,
  type RigaListino,
  type TipologiaListino,
} from "@/lib/listino/lineeListino";
import { FILTRI_LISTINO_VUOTI, rigaPassa } from "@/lib/listino/filtriListino";
import { vociDi } from "@/lib/listino/scelteVariante";
import type { FamilyWithAxes } from "@/types/articleFamily";

export type TipoProposta = "principale" | "accessorio";

/** L'area del listino che arriva al preventivatore serramenti. */
const AREA_SERRAMENTI = "serramenti";

const tipoDella = (t: TipologiaListino): TipoProposta => (t.categoriaTipo === "accessorio" ? "accessorio" : "principale");

/**
 * L'area come la vede il preventivatore: le tipologie accese del tipo giusto e,
 * dentro, i soli prodotti accesi e proposti nei preventivi. Null se non resta niente.
 */
export function areaDelPreventivatore(
  famiglie: FamilyWithAxes[],
  macrocategorie: MacroListino[],
  categorie: CategoriaListino[],
  tipo: TipoProposta,
  area: string = AREA_SERRAMENTI,
): AreaListino | null {
  const [trovata] = filtraListino(
    costruisciListino(famiglie, macrocategorie, categorie).filter((a) => a.chiave === area),
    (r) => r.famiglia.attivo !== false && r.famiglia.mostra_preventivo !== false,
  );
  if (!trovata) return null;
  const tipologie = trovata.tipologie.filter((t) => t.attiva && tipoDella(t) === tipo);
  if (tipologie.length === 0) return null;
  return { ...trovata, tipologie, articoli: tipologie.reduce((n, t) => n + t.articoli, 0) };
}

/** Le schede da proporre: tipologie collegate al preventivatore o senza collegamenti. */
export function tipologieProposte(area: AreaListino | null): TipologiaListino[] {
  return (area?.tipologie ?? []).filter((t) => t.collegamento !== "nessuno");
}

export interface RisultatoRicerca {
  tipologia: TipologiaListino;
  linea: LineaListino;
  riga: RigaListino;
}

/** Cerca per nome, codice, descrizione o linea in tutta l'area, anche fra le tipologie non proposte. */
export function cercaNellArea(area: AreaListino | null, testo: string): RisultatoRicerca[] {
  if (!area || testo.trim().length < 2) return [];
  const [trovata] = filtraListino([area], (r) => rigaPassa(r, testo, FILTRI_LISTINO_VUOTI));
  return (trovata?.tipologie ?? []).flatMap((tipologia) =>
    tipologia.linee.flatMap((linea) => linea.righe.map((riga) => ({ tipologia, linea, riga }))),
  );
}

/** Gli assi da far scegliere: con almeno un valore acceso. Un asse tutto spento bloccherebbe l'articolo. */
export function assiDaScegliere<A extends { values: ReadonlyArray<{ attivo?: boolean | null }> }>(assi: readonly A[]): A[] {
  return assi.filter((a) => a.values.some((v) => v.attivo !== false));
}

/** La scelta di partenza degli assi per una riga: la sua linea, se viene dall'asse Linea. */
export function preselezioneRiga(riga: RigaListino): Record<string, string> {
  return riga.linea && riga.asseCodice ? { [riga.asseCodice]: riga.linea.id } : {};
}

/** Il prodotto del listino come lo leggono i calcoli del preventivatore. */
export function comeListinoFamily(f: FamilyWithAxes): ListinoFamily {
  const altro = f as unknown as { posa_linked?: boolean | null };
  return {
    id: f.id,
    nome: f.nome,
    descrizione: f.descrizione ?? null,
    immagine_url: f.immagine_url ?? null,
    vertical: f.vertical ?? null,
    prezzo_base_vendita: f.prezzo_base_vendita ?? null,
    vat_rate: f.vat_rate ?? null,
    modalita_prezzo_base: f.modalita_prezzo_base ?? null,
    macrocategoria_id: f.macrocategoria_id ?? null,
    categoria_id: f.categoria_id ?? null,
    custom_field_values: f.custom_field_values ?? {},
    manodopera_modalita: f.manodopera_modalita ?? null,
    posa_tariffa_default_id: f.posa_tariffa_default_id ?? null,
    posa_quantita_default: f.posa_quantita_default ?? null,
    posa_linked: altro.posa_linked ?? null,
    manodopera_unita: f.manodopera_unita ?? null,
    manodopera_costo_acquisto: f.manodopera_costo_acquisto ?? null,
    manodopera_prezzo_vendita: f.manodopera_prezzo_vendita ?? null,
    prezzo_base_mode: f.prezzo_base_mode ?? null,
    prezzo_base_acquisto: f.prezzo_base_acquisto ?? null,
    sconto_fornitore_1: f.sconto_fornitore_1 ?? null,
    sconto_fornitore_2: f.sconto_fornitore_2 ?? null,
    markup_tipo: f.markup_tipo ?? null,
    markup_valore: f.markup_valore ?? null,
  };
}

/**
 * Il prezzo da mostrare sulla scheda del prodotto, con lo stesso motore del
 * preventivatore e la sola linea della riga: al metro quadro per chi si vende a
 * m², al pezzo per gli altri. Null per le griglie (senza misure non c'è) o a zero.
 */
export function prezzoIndicativo(riga: RigaListino): { prezzo: number; alMetroQuadro: boolean } | null {
  const famiglia = comeListinoFamily(riga.famiglia);
  const modalita = famiglia.modalita_prezzo_base ?? "pz";
  if (modalita === "griglia") return null;
  const alMetroQuadro = modalita === "mq";
  const misura = alMetroQuadro ? 1000 : null;
  const base = calcolaPrezzoProdotto(famiglia, misura, misura, 1, []).prezzo;
  const prezzo = applyMaggiorazioniAssi(
    base,
    preselezioneRiga(riga),
    (riga.famiglia.axes ?? []) as Parameters<typeof applyMaggiorazioniAssi>[2],
    misura,
    misura,
    1,
  );
  return prezzo > 0 ? { prezzo, alMetroQuadro } : null;
}

/** Una scelta presa da un'altra riga del preventivo, per codice ed etichetta del valore. */
export interface PreferenzaAsse {
  valore: string;
  label: string;
  scelta: string | null;
}

/**
 * Le scelte di una posizione del preventivo (linea, colore, vetro…) per codice
 * ed etichetta del valore: valgono anche su un prodotto diverso con le stesse
 * varianti. È la configurazione rapida: la finestra dopo parte uguale.
 */
export function preferenzeDaRiga(
  riga: { family_id?: string | null; valori_assi?: unknown; scelte_assi?: unknown } | null | undefined,
  famiglie: readonly FamilyWithAxes[],
): Record<string, PreferenzaAsse> {
  const famiglia = riga?.family_id ? famiglie.find((f) => f.id === riga.family_id) : undefined;
  if (!famiglia) return {};
  const valori = (riga?.valori_assi ?? {}) as Record<string, string>;
  const scelte = (riga?.scelte_assi ?? {}) as Record<string, string>;
  const preferenze: Record<string, PreferenzaAsse> = {};
  for (const asse of famiglia.axes ?? []) {
    const valore = asse.values.find((v) => v.id === valori[asse.codice]);
    if (valore) preferenze[asse.codice] = { valore: valore.valore, label: valore.label, scelta: scelte[asse.codice] ?? null };
  }
  return preferenze;
}

/** Il valore acceso che corrisponde alla preferenza: stesso codice, altrimenti stessa etichetta. */
export function valoreRipreso<V extends { valore: string; label: string; attivo?: boolean | null }>(
  valori: readonly V[],
  preferenza: PreferenzaAsse | undefined,
): V | undefined {
  if (!preferenza) return undefined;
  const accesi = valori.filter((v) => v.attivo);
  const etichetta = preferenza.label.trim().toLowerCase();
  return accesi.find((v) => v.valore === preferenza.valore)
    ?? accesi.find((v) => v.label.trim().toLowerCase() === etichetta);
}

/**
 * Da dove partono le variabili del prodotto scelto: la linea della scheda da cui
 * si arriva, poi le scelte dell'ultima posizione, poi i valori di serie. La voce
 * dentro il valore (il colore di una fascia) si riprende se è nel suo elenco.
 */
export function selezioneIniziale(
  riga: RigaListino,
  preferenze: Record<string, PreferenzaAsse> = {},
): { valori: Record<string, string>; voci: Record<string, string> } {
  const valori = preselezioneRiga(riga);
  const voci: Record<string, string> = {};
  for (const asse of riga.famiglia.axes ?? []) {
    if (valori[asse.codice]) continue;
    const ripreso = valoreRipreso(asse.values, preferenze[asse.codice]);
    const scelto = ripreso ?? asse.values.find((v) => v.is_default && v.attivo);
    if (!scelto) continue;
    valori[asse.codice] = scelto.id;
    const voce = ripreso ? preferenze[asse.codice]?.scelta : null;
    if (voce && vociDi(scelto).includes(voce)) voci[asse.codice] = voce;
  }
  return { valori, voci };
}
