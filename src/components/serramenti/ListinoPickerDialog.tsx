/**
 * ListinoPickerDialog — «Aggiungi dal listino» nel preventivatore serramenti.
 *
 * Lo stesso listino della pagina Listino, nella sola area Serramenti:
 *  1. Tipologia (Serramenti, Persiane e scuri, Tapparelle…) con foto e numero
 *     di prodotti: tutte, anche per un ordine di sole zanzariere. Quelle con
 *     prodotti nel listino ma nessuno proposto nei preventivi si vedono spente,
 *     col motivo e il link al listino
 *  2. Linea (PVC Salamander 76, PVC Aluplast Ideal 5000) con la sua scheda;
 *     si salta se la tipologia ne ha una sola
 *  3. Prodotto, col prezzo nella linea scelta
 *  4. Misure, variabili e prezzo: la linea già scelta, le altre variabili come
 *     nell'ultima posizione del preventivo (configurazione rapida)
 *
 * Dal box di una finestra si apre già sulla tipologia del complemento (le
 * tapparelle), con le misure della finestra e, se c'è, il prodotto già scelto:
 * vedi `partenza`.
 *
 * La ricerca guarda nome, codice, descrizione e linea, ma solo nell'area: un
 * inverter del fotovoltaico non compare mai in un preventivo serramenti. Cosa
 * compare lo decide il listino (pickerListino.ts).
 *
 * La posa configurata sulla famiglia è inglobata nel totale ma NON esposta al
 * commerciale (UX policy).
 */
import { MisureForma, chiedeMisureForma, type MisureFormaValori } from "@/components/serramenti/MisureForma";
import { AnteprimaDisegnoFamiglia, MiniaturaDisegnoFamiglia } from "@/components/serramenti/AnteprimaDisegnoFamiglia";
import { type DisegnoConfig, configDaFamiglia, disegnoDaConfig, haDisegno, misureTipiche } from "@/lib/serramenti/disegnoDaFamiglia";
import { controllaMisure } from "@/lib/serramenti/limitiSerramento";
import { useState, useEffect, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { conAssiVisibili, normalizzaSelezione } from "@/lib/serramenti/assiCondizionati";
import type { SrQuoteModelId } from "@/lib/serramenti/quoteModel";
import { modelCatalogTypes, suggestedModelTypes } from "@/lib/serramenti/modelCatalog";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Loader2, Search, Package, ArrowLeft, Ruler, Calculator, ChevronRight,
  Layers, AlertCircle, ExternalLink,
} from "lucide-react";
import { useListinoGriglia, useTariffeManodopera } from "@/lib/serramenti/queries";
import { useFamilies } from "@/hooks/useFamilies";
import { useListinoMacrocategorie } from "@/hooks/useListinoMacrocategorie";
import type { AxisSelection, FamilyWithAxes } from "@/types/articleFamily";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DynamicFieldsRenderer } from "@/components/listino/DynamicFieldsRenderer";
import { useSupplierProductLines } from "@/features/serramenti-listini/hooks/useSupplierProductLines";
import type { SupplierProductLine } from "@/features/serramenti-listini/types";
import { useSchedeLinea } from "@/hooks/useSchedeLinea";
import { useListinoCategorie } from "@/hooks/useListinoCategorie";
import { datiTecniciScheda, lineaDellaRiga, schedaVuota, trovaSchedaLinea } from "@/lib/listino/schedeLinea";
import type { LineaListino, RigaListino, TipologiaListino } from "@/lib/listino/lineeListino";
import {
  areaDelPreventivatore,
  assiDaScegliere,
  cercaNellArea,
  coloriIniziali,
  comeListinoFamily,
  indirizzoNelListino,
  motivoDaCompletare,
  prezzoIndicativo,
  selezioneIniziale,
  tipologieDaCompletare,
  tipologieProposte,
  type PreferenzaAsse,
  type TipologiaDaCompletare,
} from "@/lib/serramenti/pickerListino";
import { SchedaLineaCompatta } from "./SchedaLineaCompatta";
import { SceltaVariante } from "./SceltaVariante";
import { scelteDopo } from "@/lib/listino/scelteVariante";
import { SceltaColoriDentroFuori } from "./SceltaColoriDentroFuori";
import { CHIAVE_CATALOGO_COLORI, leggiCatalogoColori, guidaPrezzoColori, testiColoriCatalogo, verificaColori } from "@/lib/serramenti/catalogoColori";
import { leggiColori, snapshotColori } from "@/lib/serramenti/coloriDentroFuori";
import {
  CODICE_ASSE_COLORE, MISURA_DI_CONFRONTO_MM, PREZZO_DI_CONFRONTO, cambiaLato, scriviLato, type ColoriDentroFuori,
} from "@/lib/serramenti/coloriDentroFuori";
import { misuraDaTesto, quantitaDaTesto } from "@/lib/serramenti/righePreventivo";
import {
  applyMaggiorazioniAssi,
  calcolaPrezzoProdotto,
  calcolaPosaInclusa,
  listinoSenzaPrezzoDiVendita,
} from "@/lib/serramenti/pricing";

export interface ListinoPickResult {
  family_id: string;
  family_nome: string;
  larghezza_mm: number | null;
  altezza_mm: number | null;
  quantita: number;
  prezzo_unitario: number | null;
  prezzo_prodotto: number | null;
  prezzo_posa: number | null;
  griglia_id?: string | null;
  supplier_catalog_id?: string | null;
  supplier_product_line_id?: string | null;
  note?: string | null;
  /** Snapshot scelte sugli ASSI (variabili prodotto) della family.
   *  Mappa { axis_codice -> axis_value_id }. Se l'azienda modifica le
   *  maggiorazioni dopo, il preventivo gia' inviato non cambia. */
  valori_assi: Record<string, string>;
  /** La voce scelta dentro ogni valore: il colore vero di «Colore Standard».
   *  Mappa { axis_codice -> voce }; il prezzo resta quello del valore. */
  scelte_assi?: Record<string, string>;
  /** Colore interno ed esterno scelti nelle due tendine al posto di «Colore» (sempre scritti, anche se uguali);
   *  null nei complementi e nei prodotti senza la variabile «Colore». `valori_assi.colore` è il più caro dei due. */
  colore_interno?: string | null;
  colore_esterno?: string | null;
  /** Il disegno automatico congelato (null se l'articolo non ne ha). */
  disegno_config?: DisegnoConfig | null;
  /** Snapshot modalita_prezzo_base del listino al momento del pick: dice se
   *  misure e pezzi contano nel prezzo (a m², a griglia) o no (a pezzo). */
  modalita_prezzo: "pz" | "mq" | "griglia" | "misura_libera" | null;
}

/** Da dove si apre il listino per il complemento di una finestra. */
export interface PartenzaPicker {
  /** La tipologia (chiave) da cui partire: le tapparelle. Null: dalle tipologie. */
  tipologia: string | null;
  /** Il prodotto già scelto: si apre sulle sue misure, con le sue varianti. */
  familyId?: string | null;
  valori?: Record<string, string>;
  voci?: Record<string, string>;
  larghezza_mm?: number | null;
  altezza_mm?: number | null;
  quantita?: number | null;
  /** Per chi è, sotto il titolo: «Per la finestra 3 · 1200 × 1400 mm». */
  contesto?: string;
}

interface Props {
  modelId?: SrQuoteModelId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: ListinoPickResult) => void;
  /** Da dove si apre: la composizione (davanti le finestre) o i complementi di una
   *  finestra (davanti tapparelle, zanzariere…). Le tipologie sono le stesse. */
  tipo?: "principale" | "accessorio";
  /** Le scelte dell'ultima posizione del preventivo: il prodotto scelto riparte da lì. */
  preferenzeAssi?: Record<string, PreferenzaAsse>;
  /** Aperto dal box di una finestra: tipologia, misure e prodotto da cui partire. */
  partenza?: PartenzaPicker | null;
  /** Il bottone che conferma: «Aggiungi alla finestra», «Cambia modello». */
  testoConferma?: string;
}

const MODALITA_LABEL: Record<string, string> = {
  pz: "a pezzo", mq: "a m²", misura_libera: "a corpo", griglia: "da griglia misure",
};

const PERCENTUALE = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });
const EURO = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 });

type Step = "tipologia" | "linea" | "prodotto" | "misure";

/** La foto della tipologia, o quella del primo prodotto che ne ha una. */
function fotoDellaTipologia(t: TipologiaListino): string | null {
  return t.immagineUrl ?? t.linee.flatMap((l) => l.righe).find((r) => r.famiglia.immagine_url)?.famiglia.immagine_url ?? null;
}

/** Il primo prodotto con il disegno automatico: la sua miniatura sta al posto della foto che manca. */
function primoConDisegno(righe: RigaListino[]): FamilyWithAxes | null {
  return righe.find((r) => haDisegno(r.famiglia))?.famiglia ?? null;
}

/** Tipologie e linee: 2 colonne da telefono, 3 da tablet in su; schede basse, la scelta sta tutta nello schermo. */
const GRIGLIA_SCHEDE = "grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3";
/** Una scheda di tipologia o di linea: tessera in alto da telefono, a sinistra da tablet; ≥ 44 px di bersaglio, focus da tastiera chiaro. */
const SCHEDA_BASSA =
  "group flex min-h-[64px] flex-col overflow-hidden rounded-lg border-2 border-slate-200 bg-white text-left transition " +
  "hover:border-orange-400 hover:bg-orange-50/40 hover:shadow-md " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-1 sm:flex-row sm:items-center";

/**
 * La tessera di una scheda (tipologia, linea): la foto se c'è; altrimenti il disegno automatico del primo prodotto che
 * ce l'ha; altrimenti un'icona piccola. Una tessera di 56 px, non un riquadro alto come la scheda: prima, senza foto,
 * restava un quadrato grigio vuoto di 200 px e le scelte non stavano nello schermo.
 */
function Tessera({ foto, disegnoDi }: { foto: string | null; disegnoDi: FamilyWithAxes | null }) {
  return (
    <div
      aria-hidden="true"
      data-miniatura={foto ? "foto" : disegnoDi ? "disegno" : "icona"}
      className="flex h-14 w-full shrink-0 items-center justify-center overflow-hidden border-b border-slate-100 bg-slate-50 sm:w-14 sm:border-b-0 sm:border-r"
    >
      {foto ? (
        <img loading="lazy" src={foto} alt="" className="h-full w-full object-contain p-1" />
      ) : disegnoDi ? (
        <div className="h-full w-full bg-white p-1">
          <MiniaturaDisegnoFamiglia family={disegnoDi} className="h-full w-full" />
        </div>
      ) : (
        <Layers className="h-5 w-5 text-slate-300" />
      )}
    </div>
  );
}

// ─── Component principale ──────────────────────────────────────────────────

export function ListinoPickerDialog({
  open, onOpenChange, onSelect, tipo = "principale", preferenzeAssi, partenza,
  testoConferma = "Aggiungi al preventivo", modelId,
}: Props) {
  const isMobile = useIsMobile();
  const [showAllTypes, setShowAllTypes] = useState(false);
  const [step, setStep] = useState<Step>("tipologia");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [tipologiaChiave, setTipologiaChiave] = useState<string | null>(null);
  const [lineaChiave, setLineaChiave] = useState<string | null>(null);
  const [riga, setRiga] = useState<RigaListino | null>(null);
  const [larghezza, setLarghezza] = useState<string>("");
  const [altezza, setAltezza] = useState<string>("");
  const [quantita, setQuantita] = useState<string>("1");
  const [selectedSupplierProductLineId, setSelectedSupplierProductLineId] = useState<string | null>(null);
  // Selezione assi (variabili prodotto): mappa axis.codice -> axis_value.id.
  // Parte dalla linea della scheda scelta, poi dalle scelte dell'ultima
  // posizione del preventivo, poi dai valori di serie.
  const [axisSelection, setAxisSelection] = useState<AxisSelection>({});
  // La voce scelta dentro il valore (il colore di una fascia), per asse.
  const [vociScelte, setVociScelte] = useState<Record<string, string>>({});
  // Le misure in più della sagoma (arco, trapezio).
  const [formaExtra, setFormaExtra] = useState<MisureFormaValori>({});
  // Colore interno ed esterno: le due tendine al posto della sola «Colore». Null dove la tendina è una sola.
  const [colori, setColori] = useState<ColoriDentroFuori | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const isSearching = debounced.trim().length >= 2;

  useEffect(() => {
    if (!open) {
      setShowAllTypes(false);
      setStep("tipologia");
      setSearch(""); setDebounced("");
      setTipologiaChiave(null); setLineaChiave(null); setRiga(null);
      setLarghezza(""); setAltezza(""); setQuantita("1"); setFormaExtra({});
      setAxisSelection({});
      setVociScelte({});
      setColori(null);
      setSelectedSupplierProductLineId(null);
    }
  }, [open]);

  // Cercando si vedono i risultati, senza perdere il punto in cui si era.
  const vista: Step | "risultati" = isSearching && step !== "misure" ? "risultati" : step;

  // ─── Listino: la sola area Serramenti ────────────────────────────────────
  const { families, isLoading: loadingFamiglie } = useFamilies();
  const { macrocategorie, isLoading: loadingMacro } = useListinoMacrocategorie();
  const { categorie, isLoading: loadingCategorie } = useListinoCategorie();
  const { indice: schedeLinea } = useSchedeLinea();
  const caricamento = loadingFamiglie || loadingMacro || loadingCategorie;

  const area = useMemo(
    () => areaDelPreventivatore(families, macrocategorie, categorie, tipo),
    [families, macrocategorie, categorie, tipo],
  );
  const allTypes = useMemo(() => tipologieProposte(area), [area]);
  const suggested = useMemo(() => suggestedModelTypes(allTypes, modelId), [allTypes, modelId]);
  const proposte = useMemo(() => modelCatalogTypes(allTypes, modelId, showAllTypes || !!partenza), [allTypes, modelId, showAllTypes, partenza]);
  const daCompletare = useMemo(
    () => tipologieDaCompletare(families, macrocategorie, categorie, area),
    [families, macrocategorie, categorie, area],
  );
  const risultati = useMemo(() => cercaNellArea(area, debounced), [area, debounced]);
  const tipologia = useMemo(
    () => area?.tipologie.find((t) => t.chiave === tipologiaChiave) ?? null,
    [area, tipologiaChiave],
  );
  const linea = useMemo(
    () => tipologia?.linee.find((l) => l.chiave === lineaChiave) ?? (tipologia?.linee.length === 1 ? tipologia.linee[0] : null),
    [tipologia, lineaChiave],
  );
  const piuLinee = (tipologia?.linee.length ?? 0) > 1;

  // Il prodotto scelto arriva dal listino già con le sue variabili: niente
  // secondo caricamento, e «Aggiungi» non parte mai senza le variabili.
  const famigliaRiga = riga?.famiglia ?? null;
  // Solo le varianti che si vedono con le scelte fatte (il monoblocco accende altezza cassonetto, tapparella…).
  const familyWithAxes = useMemo(() => conAssiVisibili(famigliaRiga, axisSelection), [famigliaRiga, axisSelection]);
  const selectedFamily = useMemo(() => (riga ? comeListinoFamily(riga.famiglia) : null), [riga]);

  const { data: griglia = [], isLoading: loadingGriglia } = useListinoGriglia(selectedFamily?.id);
  const { lines: supplierLines = [], isLoading: loadingSupplierLines } = useSupplierProductLines({
    enabled: open && selectedFamily?.modalita_prezzo_base === "griglia",
  });
  const supplierLineMap = useMemo(() => {
    const m = new Map<string, SupplierProductLine>();
    supplierLines.forEach((line) => m.set(line.id, line));
    return m;
  }, [supplierLines]);
  const availableSupplierProductLineIds = useMemo(
    () => Array.from(new Set(griglia.map((g) => g.supplier_product_line_id).filter((v): v is string => !!v))),
    [griglia],
  );
  const availableSupplierLines = useMemo(
    () => availableSupplierProductLineIds
      .map((id) => supplierLineMap.get(id))
      .filter((line): line is SupplierProductLine => !!line),
    [availableSupplierProductLineIds, supplierLineMap],
  );
  // Un asse con tutti i valori spenti non si mostra: bloccherebbe l'articolo per sempre.
  const axes = useMemo(
    // Prima l'apertura (misure → apertura → colore → vetro…), poi gli altri nell'ordine del listino.
    () => assiDaScegliere((familyWithAxes?.axes ?? []).slice().sort((a, b) => Number(b.codice === "apertura") - Number(a.codice === "apertura") || a.sort_order - b.sort_order)),
    [familyWithAxes],
  );
  // Nella composizione «Colore» sono due tendine, interno ed esterno; per i complementi di una finestra (tapparelle,
  // zanzariere) e per i prodotti senza la variabile la tendina resta una sola.
  const asseColore = tipo === "principale" ? axes.find((a) => a.codice === CODICE_ASSE_COLORE) : undefined;
  const catalogoColori = useMemo(() => leggiCatalogoColori(selectedFamily?.custom_field_values), [selectedFamily?.custom_field_values]);
  const catalogoNonValido = selectedFamily?.custom_field_values?.[CHIAVE_CATALOGO_COLORI] != null && !catalogoColori;
  const statoColori = asseColore && colori ? verificaColori(asseColore, colori, catalogoColori) : null;

  // Misure e pezzi come le colonne del preventivo: millimetri e pezzi interi.
  // Un decimale faceva fallire l'aggiunta con un errore generico.
  const larghezzaMm = misuraDaTesto(larghezza);
  const altezzaMm = misuraDaTesto(altezza);
  const pezzi = quantitaDaTesto(quantita);
  const numeriNonValidi = larghezzaMm === undefined || altezzaMm === undefined || pezzi === undefined;

  // Prezzo BASE prodotto via la strategia consolidata `calcolaPrezzoProdotto` (filter "quadrante che contiene le
  // misure", cella contenente piu' piccola). Resta source of truth per griglia/mq/pz. Serve al calcolo e, con
  // due colori, a scegliere la fascia più cara.
  const calcBase = useMemo(
    () => (selectedFamily
      ? calcolaPrezzoProdotto(selectedFamily, larghezzaMm ?? null, altezzaMm ?? null, pezzi ?? 1, griglia, {
          supplierProductLineId: selectedSupplierProductLineId,
          supplierLines: supplierLineMap,
        })
      : null),
    [selectedFamily, larghezzaMm, altezzaMm, pezzi, griglia, selectedSupplierProductLineId, supplierLineMap],
  );

  // Il prezzo segue il colore più caro dei due (a parità l'esterno): è lui la scelta «Colore» del prezzo, del disegno
  // congelato e della riga. Qui la posizione non è ancora aggiunta e si rifà a ogni misura scritta, perché una
  // maggiorazione fissa può superarne una in %; una volta aggiunta, la riga non la rilegge più dai colori.
  const guidaColore = useMemo(() => {
    if (!asseColore || !colori || !familyWithAxes || !calcBase) return null;
    // Senza misure il prezzo base è 0 e le fasce sembrerebbero pari: per trovare la più cara si confronta su un prezzo
    // e su misure di riferimento (con le misure vere si rifà da sé).
    const base = calcBase.prezzo > 0 ? calcBase.prezzo : PREZZO_DI_CONFRONTO;
    return guidaPrezzoColori(asseColore, colori, catalogoColori, (id) => applyMaggiorazioniAssi(
      base, { ...axisSelection, [CODICE_ASSE_COLORE]: id }, familyWithAxes.axes,
      larghezzaMm ?? MISURA_DI_CONFRONTO_MM, altezzaMm ?? MISURA_DI_CONFRONTO_MM, pezzi ?? 1, selectedFamily?.modalita_prezzo_base,
    ));
  }, [asseColore, colori, catalogoColori, familyWithAxes, calcBase, axisSelection, larghezzaMm, altezzaMm, pezzi, selectedFamily?.modalita_prezzo_base]);
  // Le scelte come le leggono prezzo, disegno e riga: con le due tendine «Colore» è quella della guida.
  const selezione = useMemo(() => {
    if (!asseColore) return axisSelection;
    const scelte = { ...axisSelection };
    delete scelte[CODICE_ASSE_COLORE];
    return guidaColore ? { ...scelte, [CODICE_ASSE_COLORE]: guidaColore.valueId } : scelte;
  }, [asseColore, axisSelection, guidaColore]);
  const vociEffettive = useMemo(
    () => (asseColore ? scelteDopo(vociScelte, CODICE_ASSE_COLORE, guidaColore?.voce ?? null) : vociScelte),
    [asseColore, vociScelte, guidaColore],
  );
  const coloriTesti = useMemo(() => (asseColore && colori ? testiColoriCatalogo(asseColore, colori, catalogoColori) : null), [asseColore, colori, catalogoColori]);
  // Il disegno dell'articolo, con le misure scritte (o quelle tipiche) e le scelte fatte.
  const anteprimaDisegno = useMemo(() => {
    if (!familyWithAxes || !haDisegno(familyWithAxes)) return null;
    const tipiche = misureTipiche(familyWithAxes);
    const config = configDaFamiglia(familyWithAxes, { ...selezione, ...(colori ? snapshotColori(colori, coloriTesti ?? undefined) : {}) }, { coloreInterno: coloriTesti?.interno, coloreEsterno: coloriTesti?.esterno, voci: vociEffettive, forma: formaExtra });
    return config ? disegnoDaConfig(config, misuraDaTesto(larghezza) ?? tipiche.larghezzaMm, misuraDaTesto(altezza) ?? tipiche.altezzaMm) : null;
  }, [familyWithAxes, selezione, larghezza, altezza, vociEffettive, formaExtra, coloriTesti, colori]);
  const avvisiDisegno = useMemo(() => anteprimaDisegno?.tipo === "serramento" && larghezzaMm && altezzaMm
    ? controllaMisure(anteprimaDisegno.viste[0].disegno) : [], [anteprimaDisegno, larghezzaMm, altezzaMm]);
  const standardDaPrezzare = selectedFamily?.custom_field_values?.configurazione_standard === true && listinoSenzaPrezzoDiVendita(selectedFamily);

  // La scheda della linea scelta (PVC Salamander 76): foto, dati e testo da
  // leggere al cliente. La linea è il valore dell'asse Linea, o la categoria.
  const schedaLinea = useMemo(() => {
    if (!familyWithAxes) return null;
    const categoria = familyWithAxes.categoria_id
      ? categorie.find((c) => c.id === familyWithAxes.categoria_id)
      : undefined;
    const nomeLinea = lineaDellaRiga({ assi: familyWithAxes.axes, valoriAssi: axisSelection, categoria: categoria?.nome });
    const scheda = trovaSchedaLinea(
      schedeLinea,
      familyWithAxes.macrocategoria_id ?? categoria?.macrocategoria_id ?? null,
      nomeLinea,
    );
    return schedaVuota(scheda) ? null : scheda;
  }, [familyWithAxes, categorie, axisSelection, schedeLinea]);

  const { data: tariffe = [] } = useTariffeManodopera();

  useEffect(() => {
    if (!open || selectedFamily?.modalita_prezzo_base !== "griglia") return;
    if (availableSupplierProductLineIds.length === 1) {
      setSelectedSupplierProductLineId(availableSupplierProductLineIds[0]);
    } else if (
      selectedSupplierProductLineId &&
      !availableSupplierProductLineIds.includes(selectedSupplierProductLineId)
    ) {
      setSelectedSupplierProductLineId(null);
    }
  }, [
    open,
    selectedFamily?.id,
    selectedFamily?.modalita_prezzo_base,
    availableSupplierProductLineIds,
    selectedSupplierProductLineId,
  ]);

  const tariffePrezzi = useMemo(() => {
    const m = new Map<string, number>();
    tariffe.forEach((t) => { if (t.prezzo_vendita != null) m.set(t.id, Number(t.prezzo_vendita)); });
    return m;
  }, [tariffe]);

  // ─── Calcolo prezzo live ────────────────────────────────────────────────
  const calcolo = useMemo(() => {
    if (!selectedFamily || !calcBase) return null;
    const l = larghezzaMm ?? null;
    const h = altezzaMm ?? null;
    const q = pezzi ?? 1;

    // 1. Prezzo BASE prodotto (calcBase, più sopra).
    const calc = calcBase;

    // 2. Maggiorazioni assi (Variabili Prodotto) applicate SOPRA il prezzo base.
    const prezzoProdotto = familyWithAxes
      ? applyMaggiorazioniAssi(calc.prezzo, selezione, familyWithAxes.axes, l, h, q, selectedFamily.modalita_prezzo_base)
      : calc.prezzo;
    const extraAssi = prezzoProdotto - calc.prezzo;

    const prezzoPosa = calcolaPosaInclusa(selectedFamily, q, tariffePrezzi);
    const totale = prezzoProdotto + prezzoPosa;
    const unitario = q > 0 ? totale / q : 0;

    return {
      larghezza: l, altezza: h, quantita: q,
      prezzo_prodotto_base: calc.prezzo,
      prezzo_prodotto: prezzoProdotto,
      prezzo_posa: prezzoPosa,
      extra_assi: extraAssi,
      totale, unitario,
      matchedGrigliaId: calc.matchedGrigliaId,
      supplierCatalogId: calc.supplierCatalogId ?? null,
      supplierProductLineId: calc.supplierProductLineId ?? selectedSupplierProductLineId ?? null,
      note: calc.note,
      requiresSupplierLine: calc.requiresSupplierLine ?? false,
      missingSupplierLinePricing: calc.missingSupplierLinePricing ?? false,
      fuoriRange: calc.fuoriRange ?? false,
      range: calc.range,
    };
  }, [selectedFamily, calcBase, familyWithAxes, selezione, larghezzaMm, altezzaMm, pezzi, selectedSupplierProductLineId, tariffePrezzi]);

  const richiedeMisure = selectedFamily && (
    selectedFamily.modalita_prezzo_base === "mq" ||
    selectedFamily.modalita_prezzo_base === "griglia"
  );

  // ─── Handlers ────────────────────────────────────────────────────────────

  const scegliTipologia = (t: TipologiaListino) => {
    setTipologiaChiave(t.chiave);
    setLineaChiave(t.linee.length === 1 ? t.linee[0].chiave : null);
    setStep(t.linee.length > 1 ? "linea" : "prodotto");
  };

  const scegliLinea = (l: LineaListino) => {
    setLineaChiave(l.chiave);
    setStep("prodotto");
  };

  const scegliRiga = (r: RigaListino, t: TipologiaListino, l: LineaListino) => {
    setTipologiaChiave(t.chiave);
    setLineaChiave(l.chiave);
    setRiga(r);
    // Gli assi sono del prodotto: la linea della scheda scelta, poi le scelte
    // dell'ultima posizione del preventivo, poi i valori di serie.
    const iniziale = selezioneIniziale(r, preferenzeAssi);
    const ordinate = normalizzaSelezione(r.famiglia.axes ?? [], iniziale.valori, iniziale.voci);
    setAxisSelection(ordinate.valori);
    setVociScelte(ordinate.voci);
    // I due colori partono come nell'ultima posizione (o dal valore di serie), uguali dentro e fuori se è così.
    setColori(tipo === "principale" ? coloriIniziali(r.famiglia.axes ?? [], ordinate.valori, ordinate.voci, preferenzeAssi?.[CODICE_ASSE_COLORE]?.lati) : null);
    setSelectedSupplierProductLineId(null);
    setStep("misure");
  };

  const handleBack = () => {
    if (vista === "risultati") {
      setSearch(""); setDebounced("");
      return;
    }
    if (step === "misure") {
      // Da una ricerca si torna ai risultati: il testo cercato è ancora lì.
      setRiga(null);
      setStep("prodotto");
      return;
    }
    if (step === "prodotto" && piuLinee) {
      setLineaChiave(null);
      setStep("linea");
      return;
    }
    setTipologiaChiave(null);
    setLineaChiave(null);
    setStep("tipologia");
  };

  // Aperto dal box di una finestra: si parte dalla tipologia del complemento,
  // con le misure della finestra e, se c'è, dal prodotto già scelto con le sue
  // varianti. Una volta per apertura, poi si naviga come sempre. È stato che
  // dipende dalle props: si sistema durante il render, senza un effetto.
  const [partenzaApplicata, setPartenzaApplicata] = useState<PartenzaPicker | null>(null);
  if (!open && partenzaApplicata) setPartenzaApplicata(null);
  if (open && partenza && area && partenzaApplicata !== partenza) {
    setPartenzaApplicata(partenza);
    if (partenza.larghezza_mm) setLarghezza(String(partenza.larghezza_mm));
    if (partenza.altezza_mm) setAltezza(String(partenza.altezza_mm));
    if (partenza.quantita && partenza.quantita > 0) setQuantita(String(partenza.quantita));
    const t = partenza.tipologia ? area.tipologie.find((x) => x.chiave === partenza.tipologia) : undefined;
    if (t) {
      // Un prodotto in più linee compare una volta per linea: quella delle sue varianti.
      const valori = Object.values(partenza.valori ?? {});
      const candidati = t.linee.flatMap((l) => l.righe.filter((r) => r.famiglia.id === partenza.familyId).map((r) => ({ l, r })));
      const prodotto = candidati.find(({ r }) => !r.linea || valori.includes(r.linea.id)) ?? candidati[0];
      if (!prodotto) {
        scegliTipologia(t);
      } else {
        scegliRiga(prodotto.r, t, prodotto.l);
        if (partenza.valori) {
          const ordinate = normalizzaSelezione(prodotto.r.famiglia.axes ?? [], { ...partenza.valori }, { ...(partenza.voci ?? {}) });
          setAxisSelection(ordinate.valori);
          setVociScelte(ordinate.voci);
          const asse = prodotto.r.famiglia.axes?.find(a => a.codice === CODICE_ASSE_COLORE);
          if (asse) setColori(leggiColori(asse, { valori_assi: ordinate.valori, scelte_assi: ordinate.voci }));
        }
      }
    }
  }

  const handleConferma = () => {
    if (!selectedFamily || !calcolo || statoColori?.blocca || catalogoNonValido) return;
    // Type-guard sulla modalita: il backend è uno dei 4 valori canonici,
    // ma il tipo lato API è generico `string | null` per retrocompat.
    const m = selectedFamily.modalita_prezzo_base;
    const modalita: ListinoPickResult["modalita_prezzo"] =
      m === "pz" || m === "mq" || m === "griglia" || m === "misura_libera"
        ? m
        : null;
    onSelect({
      family_id: selectedFamily.id,
      family_nome: selectedFamily.nome,
      larghezza_mm: calcolo.larghezza,
      altezza_mm: calcolo.altezza,
      quantita: calcolo.quantita,
      prezzo_unitario: calcolo.unitario,
      prezzo_prodotto: calcolo.prezzo_prodotto / calcolo.quantita,
      prezzo_posa: calcolo.prezzo_posa / calcolo.quantita,
      griglia_id: calcolo.matchedGrigliaId,
      supplier_catalog_id: calcolo.supplierCatalogId,
      supplier_product_line_id: calcolo.supplierProductLineId,
      note: calcolo.note,
      // Snapshot scelte assi: salvato sulla riga BOM in modo che modifiche
      // future al listino NON cambino i preventivi gia' inviati.
      valori_assi: { ...selezione, ...(colori ? snapshotColori(colori, coloriTesti ?? undefined) : {}) },
      scelte_assi: { ...vociEffettive },
      // Il disegno si congela con la riga: un listino cambiato dopo non cambia il PDF di questo preventivo.
      disegno_config: configDaFamiglia(familyWithAxes, { ...selezione, ...(colori ? snapshotColori(colori, coloriTesti ?? undefined) : {}) }, { coloreInterno: coloriTesti?.interno, coloreEsterno: coloriTesti?.esterno, voci: vociEffettive, forma: formaExtra }),
      // I due colori si scrivono sempre dalle due tendine, anche se uguali: il PDF e il disegno leggono quelli.
      colore_interno: coloriTesti?.interno ?? null,
      colore_esterno: coloriTesti?.esterno ?? null,
      modalita_prezzo: modalita,
    });
    onOpenChange(false);
  };

  // ─── Testi della testata ─────────────────────────────────────────────────
  const nomeArea = area?.nome ?? "Serramenti";
  const titolo =
    vista === "tipologia" ? (tipo === "accessorio" ? "Complemento della finestra" : `Listino ${nomeArea}`)
    : vista === "linea" ? (tipologia?.nome ?? "Scegli la linea")
    : vista === "prodotto" ? ([tipologia?.nome, piuLinee ? linea?.nome : null].filter(Boolean).join(" · ") || "Scegli il prodotto")
    : vista === "risultati" ? `Ricerca: "${debounced}"`
    : (selectedFamily?.nome ?? "Misure");
  const sottotitolo =
    vista === "tipologia"
      ? (tipo === "accessorio"
        ? "Tapparelle, zanzariere, persiane, cassonetti da legare a una finestra: ne possono prendere le misure"
        : "Scegli la tipologia: finestre, persiane, tapparelle, zanzariere… anche un ordine di sole persiane")
    : vista === "linea" ? "Scegli la linea: la ritrovi già scelta nelle variabili del prodotto"
    : vista === "prodotto" ? "Scegli il prodotto"
    : vista === "risultati" ? `Nome, codice o linea, fra i prodotti dell'area ${nomeArea}`
    : standardDaPrezzare ? "Inserisci le misure. Il prezzo va compilato nel listino o nella riga del preventivo."
    : "Inserisci le misure: il prezzo è calcolato automaticamente";
  const percorso = vista === "risultati"
    ? `Ricerca nell'area ${nomeArea}`
    : [nomeArea, tipologia?.nome, piuLinee ? linea?.nome : null, vista === "misure" ? selectedFamily?.nome : null]
      .filter(Boolean)
      .join(" › ");
  const testoVuoto = area
    ? `Le tipologie dell'area ${nomeArea} non sono collegate al preventivatore: cerca il prodotto per nome, oppure collegale da Impostazioni → Listino.`
    : "Nel listino non c'è ancora niente da proporre nei preventivi serramenti: servono prodotti dell'area Serramenti accesi e proposti nei preventivi (Impostazioni → Listino).";
  const macroScheda = familyWithAxes?.macrocategoria_id ?? tipologia?.macrocategoriaId ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-[calc(100vw-1rem)] overflow-y-auto p-4 sm:max-w-4xl sm:p-6">
        <DialogHeader className="space-y-1.5">
          <DialogTitle className="flex items-center gap-2 text-base">
            {vista !== "tipologia" && (
              <Button size="icon" variant="ghost" onClick={handleBack} className="h-7 w-7 shrink-0" aria-label="Indietro">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            {(vista === "tipologia" || vista === "linea") && <Layers className="h-4 w-4 text-orange-600 shrink-0" />}
            {vista === "prodotto" && <Package className="h-4 w-4 text-orange-600 shrink-0" />}
            {vista === "risultati" && <Search className="h-4 w-4 text-orange-600 shrink-0" />}
            {vista === "misure" && <Ruler className="h-4 w-4 text-orange-600 shrink-0" />}
            <span className="flex-1">{titolo}</span>
          </DialogTitle>
          <DialogDescription className="text-xs">{sottotitolo}</DialogDescription>
          {modelId && step === "tipologia" && !partenza && <div className="space-y-2">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Prodotti per il modello">
              <Button type="button" size="sm" variant={!showAllTypes && suggested.length > 0 ? "default" : "outline"} disabled={suggested.length === 0} aria-pressed={!showAllTypes && suggested.length > 0} onClick={() => { setShowAllTypes(false); setSearch(""); }}>Suggeriti per il modello ({suggested.length})</Button>
              <Button type="button" size="sm" variant={showAllTypes || suggested.length === 0 ? "default" : "outline"} aria-pressed={showAllTypes || suggested.length === 0} onClick={() => setShowAllTypes(true)}>Tutto il listino dell'area</Button>
            </div>
            <p className="text-xs text-muted-foreground">{suggested.length === 0 ? "Nessuna tipologia suggerita associata: puoi scegliere dal listino dell'area o aggiungere una voce manuale nel preventivo." : "Categorie suggerite dal modello. Con «Tutto il listino» o la ricerca trovi anche gli altri prodotti (porte, zanzariere…), senza modificare il listino."}</p>
          </div>}
          {partenza?.contesto && (
            <p className="text-[11px] font-medium text-orange-700">{partenza.contesto}</p>
          )}
          {vista !== "tipologia" && percorso && (
            <div className="text-[10px] text-muted-foreground flex items-center gap-1 flex-wrap pt-0.5">
              <span className="font-semibold uppercase tracking-wide">Percorso:</span>
              <span className="truncate max-w-full">{percorso}</span>
            </div>
          )}
        </DialogHeader>

        {/* Ricerca — in tutti gli step tranne misure, sempre dentro l'area */}
        {vista !== "misure" && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca per nome, codice o linea…"
              className="pl-9 h-10"
            />
            {isSearching && (
              <button
                type="button"
                onClick={() => { setSearch(""); setDebounced(""); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground hover:text-foreground"
              >
                Pulisci
              </button>
            )}
          </div>
        )}

        {/* ─── TIPOLOGIE ──────────────────────────────────────────────────── */}
        {vista === "tipologia" && (
          <div className="max-h-[62dvh] overflow-y-auto sm:max-h-[55vh]">
            {caricamento ? (
              <LoadingState />
            ) : proposte.length === 0 ? (
              <EmptyState icon={<Layers className="h-10 w-10" />} text={testoVuoto} />
            ) : (
              <div className={GRIGLIA_SCHEDE}>
                {proposte.map((t) => (
                  <button key={t.chiave} type="button" onClick={() => scegliTipologia(t)} className={SCHEDA_BASSA}>
                    <Tessera foto={fotoDellaTipologia(t)} disegnoDi={primoConDisegno(t.linee.flatMap((l) => l.righe))} />
                    <div className="flex min-w-0 flex-1 items-center gap-1.5 p-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-semibold leading-tight text-slate-900 transition-colors group-hover:text-orange-700">{t.nome}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t.articoli} {t.articoli === 1 ? "prodotto" : "prodotti"}
                          {t.linee.length > 1 ? ` · ${t.linee.length} linee` : ""}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-orange-600" />
                    </div>
                  </button>
                ))}
              </div>
            )}
            {!caricamento && daCompletare.length > 0 && <DaCompletare elenco={daCompletare} />}
          </div>
        )}

        {/* ─── LINEE ──────────────────────────────────────────────────────── */}
        {vista === "linea" && tipologia && (
          <div className="max-h-[62dvh] overflow-y-auto sm:max-h-[55vh]">
            <div className={GRIGLIA_SCHEDE}>
              {tipologia.linee.map((l) => {
                const trovata = trovaSchedaLinea(schedeLinea, tipologia.macrocategoriaId, l.nome);
                const scheda = schedaVuota(trovata) ? null : trovata;
                const foto = scheda?.immagine_url ?? l.righe.find((r) => r.famiglia.immagine_url)?.famiglia.immagine_url ?? null;
                const dati = scheda ? datiTecniciScheda(scheda).map((d) => d.breve).join(" · ") : "";
                const prodotti = new Set(l.righe.map((r) => r.famiglia.id)).size;
                return (
                  <button key={l.chiave} type="button" onClick={() => scegliLinea(l)} className={SCHEDA_BASSA}>
                    <Tessera foto={foto} disegnoDi={primoConDisegno(l.righe)} />
                    <div className="flex min-w-0 flex-1 items-center gap-1.5 p-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-semibold leading-tight text-slate-900 transition-colors group-hover:text-orange-700">{l.nome}</p>
                        {dati && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{dati}</p>}
                        <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                            {prodotti} {prodotti === 1 ? "prodotto" : "prodotti"}
                          </span>
                          {l.scostamentoPct != null && l.scostamentoPct !== 0 && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
                              {l.scostamentoPct > 0 ? "+" : ""}{PERCENTUALE.format(l.scostamentoPct)}% sul prezzo
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-orange-600" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── PRODOTTI della linea ───────────────────────────────────────── */}
        {vista === "prodotto" && (
          <div className="max-h-[62dvh] overflow-y-auto sm:max-h-[55vh]">
            {!tipologia || !linea || linea.righe.length === 0 ? (
              <EmptyState
                icon={<Package className="h-10 w-10" />}
                text={`Nessun prodotto in "${tipologia?.nome ?? "questa tipologia"}".`}
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {linea.righe.map((r) => (
                  <SchedaProdotto key={r.chiave} riga={r} onClick={() => scegliRiga(r, tipologia, linea)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── RISULTATI della ricerca ────────────────────────────────────── */}
        {vista === "risultati" && (
          <div className="max-h-[62dvh] overflow-y-auto sm:max-h-[55vh]">
            {caricamento ? (
              <LoadingState />
            ) : risultati.length === 0 ? (
              <EmptyState
                icon={<Package className="h-10 w-10" />}
                text={`Nessun prodotto dell'area ${nomeArea} per "${debounced}".`}
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {risultati.map(({ tipologia: t, linea: l, riga: r }) => (
                  <SchedaProdotto
                    key={r.chiave}
                    riga={r}
                    contesto={t.linee.length > 1 ? `${t.nome} · ${l.nome}` : t.nome}
                    onClick={() => scegliRiga(r, t, l)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── STEP MISURE + CALCOLO ─────────────────────────────────── */}
        {vista === "misure" && selectedFamily && (
          <div className={anteprimaDisegno ? "grid gap-4 md:grid-cols-[minmax(0,1fr)_200px]" : ""}>
          <div className="min-w-0 space-y-3">
            <Card className="bg-orange-50/30 border-orange-200 p-3">
              <p className="text-[11px] uppercase tracking-wide text-orange-600 font-semibold mb-1">
                Listino: {MODALITA_LABEL[selectedFamily.modalita_prezzo_base ?? "pz"]}
              </p>
              <p className="text-xs text-orange-900">
                {selectedFamily.modalita_prezzo_base === "pz" && "Prezzo fisso a pezzo. Le misure sono solo descrittive."}
                {selectedFamily.modalita_prezzo_base === "mq" && "Il prezzo si calcola sui m² → larghezza × altezza × prezzo/m²."}
                {selectedFamily.modalita_prezzo_base === "griglia" && "Listino a griglia: viene letto il prezzo della misura ≥ inserita."}
                {selectedFamily.modalita_prezzo_base === "misura_libera" && "Prezzo a corpo, misure solo informative."}
              </p>
            </Card>

            <div className="grid grid-cols-12 gap-3">
              <div className={richiedeMisure ? "col-span-12 sm:col-span-4" : "col-span-12 sm:col-span-6"}>
                <Label className="text-xs">Larghezza (mm)</Label>
                <Input
                  type="number" min={0}
                  value={larghezza}
                  onChange={(e) => setLarghezza(e.target.value)}
                  placeholder="es. 1200"
                  className="h-9"
                />
              </div>
              <div className={richiedeMisure ? "col-span-12 sm:col-span-4" : "col-span-12 sm:col-span-6"}>
                <Label className="text-xs">Altezza (mm)</Label>
                <Input
                  type="number" min={0}
                  value={altezza}
                  onChange={(e) => setAltezza(e.target.value)}
                  placeholder="es. 1400"
                  className="h-9"
                />
              </div>
              <div className="col-span-12 sm:col-span-4">
                <Label className="text-xs">Quantità</Label>
                <Input
                  type="number" min={1}
                  value={quantita}
                  onChange={(e) => setQuantita(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            {selectedFamily.modalita_prezzo_base === "griglia" && availableSupplierProductLineIds.length > 0 && (
              <Card className="border-blue-200 bg-blue-50/50 p-3">
                <Label className="text-xs text-blue-900 font-semibold">Linea prodotto fornitore</Label>
                <p className="text-[11px] text-blue-800 mt-0.5 mb-2">
                  Serve per evitare prezzi mescolati quando la stessa famiglia ha più listini.
                </p>
                {loadingSupplierLines ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Caricamento linee fornitore…
                  </p>
                ) : availableSupplierLines.length === 0 ? (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    Linea fornitore non trovata: aggiorna i listini prima di aggiungere l'articolo.
                  </p>
                ) : (
                  <Select
                    value={selectedSupplierProductLineId ?? ""}
                    onValueChange={(v) => setSelectedSupplierProductLineId(v)}
                    disabled={availableSupplierLines.length === 1}
                  >
                    <SelectTrigger className="h-9 text-xs bg-white">
                      <SelectValue placeholder="Scegli linea prodotto…" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSupplierLines.map((line) => (
                        <SelectItem key={line.id} value={line.id} className="text-xs">
                          {line.nome} · ricarico +{Math.round(Number(line.ricarico_default ?? 0) * 100)}%
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Card>
            )}

            {loadingGriglia && selectedFamily.modalita_prezzo_base === "griglia" && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Caricamento griglia prezzi…
              </p>
            )}

            {/* Scheda tecnica read-only: i campi della tipologia del prodotto
                scelto (anche arrivando da una ricerca). Si nasconde da sé se la
                tipologia non ha schema o se il prodotto non ha valori compilati. */}
            {macroScheda && Object.keys(selectedFamily.custom_field_values ?? {}).length > 0 && (
              <Card className="bg-slate-50 border-slate-200 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-600 font-semibold mb-2">
                  Caratteristiche prodotto
                </p>
                <DynamicFieldsRenderer
                  macroId={macroScheda}
                  values={selectedFamily.custom_field_values ?? {}}
                  mode="display"
                />
              </Card>
            )}

            {/* Range disponibile griglia: SEMPRE visibile in modalita' griglia,
                anche prima di inserire misure. */}
            {selectedFamily.modalita_prezzo_base === "griglia" && calcolo?.range && calcolo.range.minL != null && (
              <p className="text-[11px] text-blue-800 bg-blue-50 border border-blue-200 rounded px-2.5 py-1.5">
                <span className="font-semibold">Misure disponibili:</span> da {calcolo.range.minL}×{calcolo.range.minH} mm a {calcolo.range.maxL}×{calcolo.range.maxH} mm
              </p>
            )}

            {familyWithAxes && chiedeMisureForma(familyWithAxes.disegno_tipologia, familyWithAxes.disegno_definizione) && (
              <MisureForma
                tipologia={familyWithAxes.disegno_tipologia}
                definizione={familyWithAxes.disegno_definizione}
                larghezzaMm={misuraDaTesto(larghezza) ?? misureTipiche(familyWithAxes).larghezzaMm}
                altezzaMm={misuraDaTesto(altezza) ?? misureTipiche(familyWithAxes).altezzaMm}
                valori={formaExtra}
                onChange={setFormaExtra}
              />
            )}
            {avvisiDisegno.length > 0 && <div role="status" className="space-y-1 rounded-md border bg-amber-50 p-2 text-xs text-amber-900">{avvisiDisegno.map((a) => <p key={a.codice}>{a.testo}</p>)}</div>}
            {selectedFamily?.custom_field_values?.configurazione_standard === true && (
              <p className="rounded-md bg-blue-50 p-2 text-xs text-blue-900">Schema standard: verifica gamma, misure ammesse e prezzi con il fornitore. Non è una certificazione di fattibilità.</p>
            )}

            {/* Variabili Prodotto (axes): la linea parte già scelta, gli altri
                assi come nell'ultima posizione o dai valori di serie. */}
            {axes.length > 0 && (
              <Card className="border-slate-200 bg-white p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-700 font-semibold mb-2">
                  Variabili Prodotto
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {axes.map((axis) => {
                    // «Colore» sono due tendine, interno ed esterno: una scelta per lato, il prezzo segue la più cara.
                    if (asseColore && colori && axis.codice === CODICE_ASSE_COLORE) {
                      return (
                        <SceltaColoriDentroFuori
                          key={axis.id}
                          asse={axis}
                          catalogo={catalogoColori}
                          colori={colori}
                          guidaId={guidaColore?.valueId}
                          piuCaraId={guidaColore?.valueId}
                          formato="listino"
                          onChange={(lato, valueId, voce) => setColori((prima) => (prima ? cambiaLato(prima, lato, valueId, voce) : prima))}
                          // «Altro colore (scrivi)…»: il testo resta su quel lato e tiene la fascia del prezzo.
                          onScrivi={(lato, testo) => setColori((prima) => (prima ? scriviLato(prima, lato, testo, guidaColore) : prima))}
                          onElenco={(lato) => setColori((prima) => (prima && guidaColore ? cambiaLato(prima, lato, guidaColore.valueId, guidaColore.voce) : prima))}
                        />
                      );
                    }
                    const currentId = axisSelection[axis.codice];
                    const isMissing = axis.obbligatorio && !currentId;
                    return (
                      <div key={axis.id} className="space-y-1">
                        <Label className={
                          "text-[11px] flex items-center gap-1 " +
                          (isMissing ? "text-rose-700 font-semibold" : "text-slate-700")
                        }>
                          {axis.nome}
                          {axis.obbligatorio && <span className="text-rose-500">*</span>}
                        </Label>
                        <SceltaVariante
                          values={axis.values}
                          valueId={currentId}
                          scelta={vociScelte[axis.codice]}
                          onChange={(valueId, voce) => {
                            // Le varianti che compaiono o spariscono (monoblocco sì/no) mettono in ordine le scelte.
                            const ordinate = normalizzaSelezione(famigliaRiga?.axes ?? [], { ...axisSelection, [axis.codice]: valueId }, scelteDopo(vociScelte, axis.codice, voce));
                            setAxisSelection(ordinate.valori);
                            setVociScelte(ordinate.voci);
                          }}
                          placeholder={isMissing ? "Da scegliere…" : "Seleziona…"}
                          aria-label={axis.nome}
                          className={"h-9 text-xs " + (isMissing ? "border-rose-300" : "")}
                        />
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* La scheda della linea scelta: cosa si sta proponendo al cliente. */}
            {schedaLinea && <SchedaLineaCompatta scheda={schedaLinea} />}

            {/* Riepilogo calcolo — il commerciale vede solo il totale, niente posa esposta */}
            {(statoColori?.blocca || catalogoNonValido) && <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {catalogoNonValido ? "Catalogo colori non valido: correggilo nel listino prima di aggiungere il prodotto." : "Prezzo da quotare: verifica i colori e configura una combinazione disponibile nel listino."}
            </p>}
            {calcolo && !calcolo.fuoriRange && !statoColori?.blocca && !catalogoNonValido && (
              <Card className="border-orange-300 bg-orange-50/50 p-4">
                <p className="text-[11px] uppercase tracking-wide text-orange-600 font-semibold mb-2 flex items-center gap-1">
                  <Calculator className="h-3.5 w-3.5" /> {standardDaPrezzare ? "Prezzo da definire" : "Calcolo prezzo"}
                </p>
                <div className="space-y-1 text-xs">
                  {calcolo.note && (
                    <p className="text-[10px] text-muted-foreground italic">{calcolo.note}</p>
                  )}
                  {calcolo.extra_assi !== 0 && (
                    <p className="text-[10px] text-blue-800">
                      Variabili prodotto: <span className="font-semibold">
                        {calcolo.extra_assi > 0 ? "+" : ""}€ {calcolo.extra_assi.toLocaleString("it-IT", { minimumFractionDigits: 2, useGrouping: true })}
                      </span>
                    </p>
                  )}
                  {standardDaPrezzare ? <p className="text-sm text-orange-900">Aggiungi lo schema e inserisci il prezzo nella riga del preventivo, oppure completa il listino. Questo articolo non ha ancora una tariffa: non è gratuito.</p> : <>
                  <div className="border-t border-orange-300 pt-2 mt-2 flex justify-between items-center">
                    <span className="font-bold text-orange-900">Totale posizione</span>
                    <span className="text-xl font-bold text-orange-600 tabular-nums">
                      € {calcolo.totale.toLocaleString("it-IT", { minimumFractionDigits: 2, useGrouping: true })}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-right">
                    Prezzo unitario: € {calcolo.unitario.toLocaleString("it-IT", { minimumFractionDigits: 2, useGrouping: true })} × {calcolo.quantita} pz
                  </p>
                  </>}
                </div>
              </Card>
            )}

            {/* Stato OUT-OF-RANGE: misure non producibili dal listino. */}
            {calcolo?.fuoriRange && (
              <Card className="border-rose-300 bg-rose-50 p-4">
                <p className="text-sm font-bold text-rose-800 mb-1 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" /> Misura non producibile
                </p>
                <p className="text-xs text-rose-700 leading-relaxed">
                  La misura inserita ({calcolo.larghezza}×{calcolo.altezza} mm) e' fuori dal range disponibile per questo articolo.
                  Modifica le misure entro l'intervallo indicato sopra.
                </p>
              </Card>
            )}

            {(calcolo?.requiresSupplierLine || calcolo?.missingSupplierLinePricing) && (
              <Card className="border-amber-300 bg-amber-50 p-4">
                <p className="text-sm font-bold text-amber-900 mb-1 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" /> Prezzo non ancora determinabile
                </p>
                <p className="text-xs text-amber-800 leading-relaxed">
                  {calcolo.note ?? "Seleziona la linea prodotto fornitore corretta per calcolare il prezzo."}
                </p>
              </Card>
            )}
          </div>
          {/* A destra il disegno, piccolo e fermo: si aggiorna mentre scegli misure e variabili. Da telefono i due
              disegni stanno affiancati sotto le scelte, non uno sopra l'altro. */}
          {anteprimaDisegno && (
            <aside>
              <div className="sticky top-0">
                <AnteprimaDisegnoFamiglia disegno={anteprimaDisegno} altezza="h-40" colonna={!isMobile} compatto />
              </div>
            </aside>
          )}
          </div>
        )}

        <div className="sticky -bottom-4 z-10 -mx-4 mt-1 flex flex-col gap-2 border-t bg-background px-4 pb-4 pt-3 sm:static sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:px-0 sm:pb-0">
          <div className="text-[11px] text-muted-foreground">
            {vista === "misure" && richiedeMisure && (!larghezza || !altezza) && (
              <span>Inserisci larghezza e altezza per calcolare il prezzo.</span>
            )}
            {vista === "misure" && calcolo?.requiresSupplierLine && (
              <span>Scegli la linea prodotto fornitore prima di aggiungere.</span>
            )}
            {vista === "misure" && numeriNonValidi && (
              <span>Misure in millimetri interi e quantità da 1 in su.</span>
            )}
          </div>
          <div className="flex w-full shrink-0 flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">Annulla</Button>
            {vista === "misure" && (
              <Button
                onClick={handleConferma}
                className="w-full bg-orange-500 hover:bg-orange-600 sm:w-auto"
                disabled={
                  numeriNonValidi
                  || statoColori?.blocca === true
                  || catalogoNonValido
                  || avvisiDisegno.some((a) => a.gravita === "errore")
                  || (richiedeMisure && (!larghezza || !altezza))
                  || !calcolo
                  // Un prodotto di listino senza prezzo di vendita resta a 0€
                  // per costruzione (non perché mancano misure valide): chi
                  // lavora così (es. Infissi e Living) scrive il prezzo a
                  // mano nel BOM dopo, non qui. Vedi listinoSenzaPrezzoDiVendita.
                  || (calcolo.totale <= 0 && !listinoSenzaPrezzoDiVendita(selectedFamily))
                  || calcolo.fuoriRange === true
                  || calcolo.requiresSupplierLine === true
                  || calcolo.missingSupplierLinePricing === true
                  || (selectedFamily?.modalita_prezzo_base === "griglia"
                    && availableSupplierProductLineIds.length > 0
                    && availableSupplierLines.length === 0)
                  // Blocca se ci sono assi obbligatori senza scelta.
                  || axes.some((a) => a.obbligatorio && !selezione[a.codice])
                }
              >
                {testoConferma}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

/** Il prodotto nella griglia: foto, nome e prezzo nella linea della riga. */
function SchedaProdotto({ riga, contesto, onClick }: { riga: RigaListino; contesto?: string; onClick: () => void }) {
  const f = riga.famiglia;
  const prezzo = prezzoIndicativo(riga);
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-md border-2 border-slate-200 hover:border-orange-400 hover:bg-orange-50/30 focus:outline-none focus:ring-2 focus:ring-orange-400 transition overflow-hidden group flex flex-col"
    >
      {haDisegno(f) ? (
        <div className="w-full h-24 sm:h-32 bg-white p-1.5">
          <MiniaturaDisegnoFamiglia family={f} className="h-full w-full" />
        </div>
      ) : f.immagine_url ? (
        <img loading="lazy" src={f.immagine_url} alt={f.nome} className="w-full h-32 object-contain bg-slate-50" />
      ) : (
        <div className="flex h-14 w-full items-center justify-center bg-slate-50 text-slate-300">
          <Package className="h-6 w-6" />
        </div>
      )}
      <div className="p-2.5 flex flex-col gap-1 flex-1">
        {contesto && (
          <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-700 line-clamp-1">{contesto}</p>
        )}
        <p className="text-xs font-semibold text-slate-900 line-clamp-2 leading-tight">{f.nome}</p>
        {f.descrizione && (
          <p className="text-[10px] text-muted-foreground line-clamp-2 leading-tight">{f.descrizione}</p>
        )}
        <div className="flex flex-wrap gap-1 mt-auto pt-1 text-[9px]">
          <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">
            {MODALITA_LABEL[f.modalita_prezzo_base ?? "pz"]}
          </span>
          {prezzo && (
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium tabular-nums">
              € {EURO.format(prezzo.prezzo)}{prezzo.alMetroQuadro ? "/m²" : ""}
            </span>
          )}
          {!prezzo && f.custom_field_values?.configurazione_standard === true && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">Prezzo da definire</span>}
        </div>
      </div>
    </button>
  );
}

/**
 * Le tipologie del listino che nel preventivo non si possono ancora usare, col
 * motivo e il listino a portata di mano. Il link apre un'altra scheda: il
 * preventivo resta dov'è.
 */
function DaCompletare({ elenco }: { elenco: TipologiaDaCompletare[] }) {
  return (
    <div className="mt-4 space-y-2">
      <div className="space-y-0.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Nel listino, ma non ancora nei preventivi
        </p>
        <p className="text-[11px] text-muted-foreground">
          Hanno prodotti senza prezzo di vendita: aggiungi i prezzi nel listino per poterle proporre.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
        {elenco.map((d) => (
          <div
            key={d.tipologia.chiave}
            className="flex items-start gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3"
          >
            <Layers className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-600">{d.tipologia.nome}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{motivoDaCompletare(d)}</p>
              <a
                href={indirizzoNelListino(d.tipologia)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-orange-700 hover:underline"
              >
                Completa nel listino <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
      Caricamento…
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="py-10 text-center text-muted-foreground">
      <div className="mx-auto mb-2 opacity-30">{icon}</div>
      <p className="text-sm max-w-md mx-auto">{text}</p>
    </div>
  );
}
