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
import { useState, useEffect, useMemo } from "react";
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
import type { AxisSelection } from "@/types/articleFamily";
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

// ─── Component principale ──────────────────────────────────────────────────

export function ListinoPickerDialog({
  open, onOpenChange, onSelect, tipo = "principale", preferenzeAssi, partenza,
  testoConferma = "Aggiungi al preventivo",
}: Props) {
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

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const isSearching = debounced.trim().length >= 2;

  useEffect(() => {
    if (!open) {
      setStep("tipologia");
      setSearch(""); setDebounced("");
      setTipologiaChiave(null); setLineaChiave(null); setRiga(null);
      setLarghezza(""); setAltezza(""); setQuantita("1");
      setAxisSelection({});
      setVociScelte({});
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
  const proposte = useMemo(() => tipologieProposte(area), [area]);
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
  const familyWithAxes = riga?.famiglia ?? null;
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
    () => assiDaScegliere((familyWithAxes?.axes ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)),
    [familyWithAxes],
  );

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
  // Misure e pezzi come le colonne del preventivo: millimetri e pezzi interi.
  // Un decimale faceva fallire l'aggiunta con un errore generico.
  const larghezzaMm = misuraDaTesto(larghezza);
  const altezzaMm = misuraDaTesto(altezza);
  const pezzi = quantitaDaTesto(quantita);
  const numeriNonValidi = larghezzaMm === undefined || altezzaMm === undefined || pezzi === undefined;

  const calcolo = useMemo(() => {
    if (!selectedFamily) return null;
    const l = larghezzaMm ?? null;
    const h = altezzaMm ?? null;
    const q = pezzi ?? 1;

    // 1. Prezzo BASE prodotto via la strategia consolidata
    //    `calcolaPrezzoProdotto` (filter "quadrante che contiene le misure",
    //    cella contenente piu' piccola). Resta source of truth per griglia/mq/pz.
    const calc = calcolaPrezzoProdotto(selectedFamily, l, h, q, griglia, {
      supplierProductLineId: selectedSupplierProductLineId,
      supplierLines: supplierLineMap,
    });

    // 2. Maggiorazioni assi (Variabili Prodotto) applicate SOPRA il prezzo base.
    const prezzoProdotto = familyWithAxes
      ? applyMaggiorazioniAssi(calc.prezzo, axisSelection, familyWithAxes.axes, l, h, q, selectedFamily.modalita_prezzo_base)
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
  }, [selectedFamily, familyWithAxes, axisSelection, larghezzaMm, altezzaMm, pezzi, griglia, selectedSupplierProductLineId, supplierLineMap, tariffePrezzi]);

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
    setAxisSelection(iniziale.valori);
    setVociScelte(iniziale.voci);
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
          setAxisSelection({ ...partenza.valori });
          setVociScelte({ ...(partenza.voci ?? {}) });
        }
      }
    }
  }

  const handleConferma = () => {
    if (!selectedFamily || !calcolo) return;
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
      valori_assi: { ...axisSelection },
      scelte_assi: { ...vociScelte },
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
    : "Inserisci le misure: il prezzo è calcolato automaticamente";
  const percorso = vista === "risultati"
    ? `Ricerca nell'area ${nomeArea}`
    : [nomeArea, tipologia?.nome, piuLinee ? linea?.nome : null, vista === "misure" ? selectedFamily?.nome : null]
      .filter(Boolean)
      .join(" › ");
  const testoVuoto = area
    ? `Le tipologie dell'area ${nomeArea} non sono collegate al preventivatore: cerca il prodotto per nome, oppure collegale da Impostazioni → Listino prodotti.`
    : "Nel listino non c'è ancora niente da proporre nei preventivi serramenti: servono prodotti dell'area Serramenti accesi e proposti nei preventivi (Impostazioni → Listino prodotti).";
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
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {proposte.map((t) => {
                  const foto = fotoDellaTipologia(t);
                  return (
                    <button
                      key={t.chiave}
                      type="button"
                      onClick={() => scegliTipologia(t)}
                      className="text-left rounded-lg border-2 border-slate-200 hover:border-orange-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-orange-400 transition group overflow-hidden bg-white flex flex-col"
                    >
                      <div className="relative aspect-[16/9] sm:aspect-[4/3] bg-slate-50 border-b border-slate-100 flex items-center justify-center">
                        {foto ? (
                          <img loading="lazy" src={foto} alt={t.nome} className="absolute inset-0 w-full h-full object-contain p-2" />
                        ) : (
                          <Layers className="h-10 w-10 text-slate-300" />
                        )}
                      </div>
                      <div className="flex-1 p-3 flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate group-hover:text-orange-700 transition-colors">{t.nome}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {t.articoli} {t.articoli === 1 ? "prodotto" : "prodotti"}
                            {t.linee.length > 1 ? ` · ${t.linee.length} linee` : ""}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-orange-600 mt-0.5 shrink-0 transition-colors" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {!caricamento && daCompletare.length > 0 && <DaCompletare elenco={daCompletare} />}
          </div>
        )}

        {/* ─── LINEE ──────────────────────────────────────────────────────── */}
        {vista === "linea" && tipologia && (
          <div className="max-h-[62dvh] overflow-y-auto sm:max-h-[55vh]">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {tipologia.linee.map((l) => {
                const trovata = trovaSchedaLinea(schedeLinea, tipologia.macrocategoriaId, l.nome);
                const scheda = schedaVuota(trovata) ? null : trovata;
                const foto = scheda?.immagine_url ?? l.righe.find((r) => r.famiglia.immagine_url)?.famiglia.immagine_url ?? null;
                const dati = scheda ? datiTecniciScheda(scheda).map((d) => d.breve).join(" · ") : "";
                const prodotti = new Set(l.righe.map((r) => r.famiglia.id)).size;
                return (
                  <button
                    key={l.chiave}
                    type="button"
                    onClick={() => scegliLinea(l)}
                    className="text-left rounded-lg border-2 border-slate-200 hover:border-orange-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-orange-400 transition group overflow-hidden bg-white flex flex-col"
                  >
                    <div className="relative aspect-[16/9] sm:aspect-[4/3] bg-slate-50 border-b border-slate-100 flex items-center justify-center">
                      {foto ? (
                        <img loading="lazy" src={foto} alt={l.nome} className="absolute inset-0 w-full h-full object-contain p-2" />
                      ) : (
                        <Layers className="h-10 w-10 text-slate-300" />
                      )}
                    </div>
                    <div className="flex-1 p-3 flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 group-hover:text-orange-700 transition-colors">{l.nome}</p>
                        {dati && <p className="text-[11px] text-muted-foreground mt-0.5">{dati}</p>}
                        <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
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
                      <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-orange-600 mt-0.5 shrink-0 transition-colors" />
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
          <div className="space-y-3">
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

            {/* Variabili Prodotto (axes): la linea parte già scelta, gli altri
                assi come nell'ultima posizione o dai valori di serie. */}
            {axes.length > 0 && (
              <Card className="border-slate-200 bg-white p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-700 font-semibold mb-2">
                  Variabili Prodotto
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {axes.map((axis) => {
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
                            setAxisSelection((prev) => ({ ...prev, [axis.codice]: valueId }));
                            setVociScelte((prev) => scelteDopo(prev, axis.codice, voce));
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
            {calcolo && !calcolo.fuoriRange && (
              <Card className="border-orange-300 bg-orange-50/50 p-4">
                <p className="text-[11px] uppercase tracking-wide text-orange-600 font-semibold mb-2 flex items-center gap-1">
                  <Calculator className="h-3.5 w-3.5" /> Calcolo prezzo
                </p>
                <div className="space-y-1 text-xs">
                  {calcolo.note && (
                    <p className="text-[10px] text-muted-foreground italic">{calcolo.note}</p>
                  )}
                  {calcolo.extra_assi !== 0 && (
                    <p className="text-[10px] text-blue-800">
                      Variabili prodotto: <span className="font-semibold">
                        {calcolo.extra_assi > 0 ? "+" : ""}€ {calcolo.extra_assi.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                      </span>
                    </p>
                  )}
                  <div className="border-t border-orange-300 pt-2 mt-2 flex justify-between items-center">
                    <span className="font-bold text-orange-900">Totale posizione</span>
                    <span className="text-xl font-bold text-orange-600 tabular-nums">
                      € {calcolo.totale.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-right">
                    Prezzo unitario: € {calcolo.unitario.toLocaleString("it-IT", { minimumFractionDigits: 2 })} × {calcolo.quantita} pz
                  </p>
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
                  || axes.some((a) => a.obbligatorio && !axisSelection[a.codice])
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
      {f.immagine_url ? (
        <img loading="lazy" src={f.immagine_url} alt={f.nome} className="w-full h-32 object-contain bg-slate-50" />
      ) : (
        <div className="w-full h-14 sm:h-32 flex items-center justify-center bg-slate-50 text-slate-300">
          <Package className="h-6 w-6 sm:h-10 sm:w-10" />
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
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Nel listino, ma non ancora nei preventivi
      </p>
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
