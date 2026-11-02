import { useEffect, useMemo, useRef, useState } from "react";
import type { QuoteItemPro } from "@/types/quoteItem";
import { avvisiDoppieVoci } from "@/lib/preventivi/avvisiInserimento";
import { unitaTariffa } from "@/lib/listino/costoTariffa";
import { Check, Plus, Package, Wrench } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProductPicker } from "./ProductPicker";
import { TariffePicker } from "./TariffePickerDialog";
import { ProductConfigurator } from "./configurators/ProductConfigurator";
import { BatchProductConfigurator } from "./configurators/BatchProductConfigurator";
import type { DopoAggiunta } from "./configurators/LayoutConfigurazione";
import { formatCurrency } from "@/lib/formatters";
import { voceDaProdotto, type VoceAggiunta } from "@/lib/preventivi/riepilogoAggiunte";
import type { TariffaPro } from "@/hooks/usePreventivoCosti";
import type { CatalogItem, ConfiguredItem } from "@/types/catalogItem";
import { useCatalogItems } from "@/hooks/useCatalogItems";
import { useCatalogCategories } from "@/hooks/useCatalogCategories";
import { useCatalogAree } from "@/hooks/useCatalogAree";
import {
  areeTariffa,
  chiaveProdotto,
  classificaProdottiPerArea,
  nellAreaCatalogo,
  riepilogoAreeCatalogo,
  TUTTE_LE_AREE,
  VOCI_COMUNI,
} from "@/lib/preventivi/areeCatalogoPreventivo";
import { nomeArea } from "@/lib/listino/areeStandard";
import {
  manodoperaSeparata,
  prodottoSemplice,
} from "@/lib/preventivi/configurazioneSemplice";

export interface AddItemDialogProps {
  open: boolean;
  onClose: () => void;
  tariffe: TariffaPro[];
  initialTab?: "prodotti" | "manodopera" | "servizi";
  currentSortOrder: number;
  existingItems?: QuoteItemPro[];
  onAddItems: (items: ConfiguredItem[], nextSortOrder: number) => void;
  onAddTariffa?: (
    tariffa: TariffaPro,
    quantita: number,
    prezzoVendita?: number,
  ) => void;
  quantitaInizialeTariffa?: (tariffa: TariffaPro) => number;
  prezzoUnitarioTariffa?: (tariffa: TariffaPro) => number;
  onAddFreeLine?: () => void;
  onAddDiscount?: () => void;
  onAddSubtotal?: () => void;
  /** L'area del tipo di lavoro del preventivo, se si riconosce. */
  areaSuggerita?: string | null;
}

const CHIAVE_ULTIMA_AREA = "eic.preventivo.ultimaArea";

function ultimaAreaUsata(): string | null {
  try {
    return localStorage.getItem(CHIAVE_ULTIMA_AREA);
  } catch {
    return null;
  }
}

export function AddItemDialog(props: AddItemDialogProps) {
  // Si apre sull'area del lavoro; se non è indicata, sull'ultima usata. La scelta a mano vince.
  const [sceltaArea, setSceltaArea] = useState<string | null>(null);
  const [ultimaArea] = useState(ultimaAreaUsata);
  useEffect(() => setSceltaArea(null), [props.areaSuggerita]);
  const area =
    sceltaArea ?? props.areaSuggerita ?? ultimaArea ?? TUTTE_LE_AREE;
  function setArea(nuova: string) {
    setSceltaArea(nuova);
    try {
      localStorage.setItem(CHIAVE_ULTIMA_AREA, nuova);
    } catch {
      // Senza memoria del browser si riparte semplicemente da tutte le aree.
    }
  }
  const [includiComuni, setIncludiComuni] = useState(true);
  return (
    <AddItemContent
      key={JSON.stringify([props.open, props.initialTab])}
      {...props}
      area={area}
      setArea={setArea}
      includiComuni={includiComuni}
      setIncludiComuni={setIncludiComuni}
    />
  );
}

/** Cataloghi montati durante la configurazione: ricerca, categoria e pagina restano disponibili. */
function AddItemContent({
  open,
  onClose,
  tariffe,
  initialTab = "prodotti",
  currentSortOrder,
  existingItems = [],
  onAddItems,
  onAddTariffa,
  quantitaInizialeTariffa,
  prezzoUnitarioTariffa,
  onAddFreeLine,
  onAddDiscount,
  onAddSubtotal,
  area,
  setArea,
  includiComuni,
  setIncludiComuni,
}: AddItemDialogProps & {
  area: string;
  setArea: (area: string) => void;
  includiComuni: boolean;
  setIncludiComuni: (includi: boolean) => void;
}) {
  const [item, setItem] = useState<CatalogItem | null>(null);
  const [contestoProdotto, setContestoProdotto] = useState("");
  const [tab, setTab] = useState(initialTab);
  const [aggiunte, setAggiunte] = useState<VoceAggiunta[]>([]);
  const [lastAdded, setLastAdded] = useState("");
  const [duplicazioni, setDuplicazioni] = useState(0);
  const [selezionati, setSelezionati] = useState<CatalogItem[]>([]);
  const [modificaMultipla, setModificaMultipla] = useState(false);
  const [inserimentoDaConfermare, setInserimentoDaConfermare] = useState<{
    avvisi: string[];
    righe: QuoteItemPro[];
    conferma: () => void;
  } | null>(null);
  // La manodopera dei pezzi appena aggiunti di questo prodotto: ogni pezzo ha la sua, non è una doppia voce.
  const manodoperaPezziPrecedenti = useRef(new Set<string>());
  function verificaInserimento(righe: QuoteItemPro[], conferma: () => void) {
    const avvisi = avvisiDoppieVoci(
      righe,
      existingItems.filter(
        (r) =>
          !r.client_temp_id ||
          !manodoperaPezziPrecedenti.current.has(r.client_temp_id),
      ),
    );
    if (avvisi.length) setInserimentoDaConfermare({ avvisi, righe, conferma });
    else conferma();
  }
  const selectedIds = new Set(selezionati.map((p) => `${p.source}:${p.id}`));
  function seleziona(prodotto: CatalogItem) {
    setSelezionati((prev) =>
      prev.some((p) => p.id === prodotto.id && p.source === prodotto.source)
        ? prev.filter(
            (p) => p.id !== prodotto.id || p.source !== prodotto.source,
          )
        : [...prev, prodotto],
    );
  }
  const catalogo = useCatalogItems();
  const categorie = useCatalogCategories();
  const macros = useCatalogAree();
  const classificazione = useMemo(
    () =>
      classificaProdottiPerArea(
        catalogo.items,
        categorie.data ?? [],
        macros.data ?? [],
      ),
    [catalogo.items, categorie.data, macros.data],
  );
  const aree = riepilogoAreeCatalogo(catalogo.items, tariffe, classificazione);
  const organizzazioneDisponibile =
    !categorie.isError &&
    !macros.isError &&
    !categorie.isLoading &&
    !macros.isLoading;
  const areaEffettiva =
    organizzazioneDisponibile &&
    (area === TUTTE_LE_AREE || aree.some((a) => a.id === area))
      ? area
      : TUTTE_LE_AREE;
  const prodottiNellArea = catalogo.items.filter((p) =>
    nellAreaCatalogo(
      classificazione.get(chiaveProdotto(p)) ?? [],
      areaEffettiva,
      includiComuni,
    ),
  );
  const serviziNellArea = tariffe.filter((t) =>
    nellAreaCatalogo(areeTariffa(t), areaEffettiva, includiComuni),
  );
  const comuni = aree.find((a) => a.id === VOCI_COMUNI);
  const ambito = JSON.stringify([areaEffettiva, includiComuni]);
  const titoloArea =
    areaEffettiva === TUTTE_LE_AREE
      ? "Tutte le aree"
      : areaEffettiva === VOCI_COMUNI
        ? "Comuni / senza area"
        : nomeArea(areaEffettiva.slice(5));
  const scelteArea = [
    {
      id: TUTTE_LE_AREE,
      nome: "Tutte le aree",
      prodotti: catalogo.items.length,
      servizi: tariffe.filter((t) => t.attivo !== false && t.attiva !== false)
        .length,
    },
    ...aree,
  ];
  const conteggiArea = (a: { prodotti: number; servizi: number }) =>
    `${a.prodotti} ${a.prodotti === 1 ? "prodotto" : "prodotti"} · ${a.servizi} ${a.servizi === 1 ? "servizio" : "servizi"}`;
  function chiudi() {
    onClose();
  }
  function registra(voci: VoceAggiunta[], messaggio: string) {
    setLastAdded(messaggio);
    setAggiunte((prima) => [...prima, ...voci]);
  }
  function aggiungi(
    configured: ConfiguredItem[],
    next: number,
    dopo: DopoAggiunta = "altro",
  ) {
    verificaInserimento(
      configured.map((c) => c.quote_item),
      () => {
        onAddItems(configured, next);
        for (const { quote_item: riga } of configured)
          if (riga.item_type === "service" && riga.client_temp_id)
            manodoperaPezziPrecedenti.current.add(riga.client_temp_id);
        registra([voceDaProdotto(configured)], `${item?.nome ?? "Prodotto"} aggiunto`);
        if (dopo === "chiudi") chiudi();
        else if (dopo === "duplica") setDuplicazioni((n) => n + 1);
        else setItem(null);
      },
    );
  }
  const lavorazioni = serviziNellArea.filter((t) => manodoperaSeparata(t.tipo));
  const servizi = serviziNellArea.filter((t) => !manodoperaSeparata(t.tipo));
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) chiudi();
      }}
    >
      <DialogContent className="flex h-[88dvh] max-h-[92dvh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-3 pr-12 sm:px-6">
          <DialogTitle>
            {inserimentoDaConfermare
              ? "Controlla le possibili doppie voci"
              : modificaMultipla
                ? "Modifica i prodotti selezionati"
                : item
                  ? item.nome
                  : "Aggiungi al preventivo"}
          </DialogTitle>
          <DialogDescription>
            {inserimentoDaConfermare
              ? "Verifica che prodotto e manodopera non siano già conteggiati nel preventivo."
              : modificaMultipla
                ? "Controlla quantità e prezzi cliente, poi aggiungi tutte le righe insieme."
                : item
                  ? prodottoSemplice(item)
                    ? "Imposta quantità e prezzo cliente. I costi restano interni."
                    : `${contestoProdotto ? contestoProdotto + " · " : ""}Configura misure, varianti e posa prima di aggiungere.`
                  : "Scegli un’area, cerca una voce e controlla l’importo."}
          </DialogDescription>
        </DialogHeader>
        {!item && !modificaMultipla && !inserimentoDaConfermare && (
          <div className="flex shrink-0 flex-wrap items-end justify-between gap-x-4 border-b bg-muted/20 px-4 pt-2">
          <div
            role="tablist"
            aria-label="Catalogo del preventivo"
            onKeyDown={(e) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) ||
                !onAddTariffa
              )
                return;
              e.preventDefault();
              const tabs = ["prodotti", "manodopera", "servizi"] as const;
              const prossimo =
                e.key === "Home"
                  ? "prodotti"
                  : e.key === "End"
                    ? "servizi"
                    : tabs[
                        (tabs.indexOf(tab) + (e.key === "ArrowRight" ? 1 : 2)) %
                          3
                      ];
              setTab(prossimo);
              const pulsanti =
                e.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                );
              const pulsante = pulsanti.item(tabs.indexOf(prossimo));
              pulsante?.focus();
            }}
            className="flex gap-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "prodotti"}
              tabIndex={tab === "prodotti" ? 0 : -1}
              onClick={() => setTab("prodotti")}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium max-sm:gap-1 max-sm:px-2 max-sm:text-xs",
                tab === "prodotti"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground",
              )}
            >
              <Package className="h-4 w-4" />
              Prodotti
              <span
                aria-hidden
                className="rounded-full bg-muted px-2 text-xs tabular-nums"
              >
                {catalogo.isLoading ? "…" : prodottiNellArea.length}
              </span>
            </button>
            {onAddTariffa &&
              (["manodopera", "servizi"] as const).map((tipoTab) => (
                <button
                  key={tipoTab}
                  type="button"
                  role="tab"
                  aria-selected={tab === tipoTab}
                  tabIndex={tab === tipoTab ? 0 : -1}
                  onClick={() => setTab(tipoTab)}
                  className={cn(
                    "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium max-sm:gap-1 max-sm:px-2 max-sm:text-xs",
                    tab === tipoTab
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground",
                  )}
                >
                  <Wrench className="h-4 w-4" />
                  {tipoTab === "manodopera" ? "Manodopera" : "Servizi"}
                  <span className="rounded-full bg-muted px-2 text-xs tabular-nums">
                    {
                      (tipoTab === "manodopera" ? lavorazioni : servizi).filter(
                        (t) => t.attivo !== false && t.attiva !== false,
                      ).length
                    }
                  </span>
                </button>
              ))}
          </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-2 max-sm:w-full">
              <select
                aria-label="Area di lavoro"
                className="h-9 w-96 max-w-full rounded-md border bg-background px-3 text-sm max-sm:w-full"
                value={areaEffettiva}
                onChange={(e) => setArea(e.target.value)}
              >
                {scelteArea.map((a) => (
                  <option
                    key={a.id}
                    value={a.id}
                    disabled={
                      !organizzazioneDisponibile && a.id !== TUTTE_LE_AREE
                    }
                  >
                    {a.nome} ({conteggiArea(a)})
                  </option>
                ))}
              </select>
              {areaEffettiva !== TUTTE_LE_AREE &&
                areaEffettiva !== VOCI_COMUNI &&
                comuni && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={includiComuni}
                      onChange={(e) => setIncludiComuni(e.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                    Includi voci comuni
                  </label>
                )}
            </div>
            {(categorie.isError || macros.isError) && (
              <p role="alert" className="w-full pb-2 text-xs text-amber-800">
                Organizzazione per area non disponibile. Il catalogo completo
                resta consultabile.{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    void categorie.refetch();
                    void macros.refetch();
                  }}
                >
                  Riprova aree
                </button>
              </p>
            )}
          </div>
        )}
        {lastAdded && !inserimentoDaConfermare && (
          <div className="mx-4 mt-3 shrink-0 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <p role="status" className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0" />
              {lastAdded} · {aggiunte.length}{" "}
              {aggiunte.length === 1 ? "voce inserita" : "voci inserite"}
            </p>
            <details className="mt-1 pl-6 text-xs">
              <summary className="cursor-pointer font-medium">
                Vedi cosa hai aggiunto
                {aggiunte.every((v) => v.importo > 0) &&
                  ` · ${formatCurrency(aggiunte.reduce((t, v) => t + v.importo, 0))} IVA esclusa`}
              </summary>
              <ul className="mt-1 max-h-28 space-y-0.5 overflow-y-auto">
                {aggiunte.map((voce, indice) => (
                  <li key={indice} className="flex justify-between gap-3">
                    <span className="min-w-0">
                      {voce.nome} · {voce.dettaglio}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {voce.importo > 0
                        ? formatCurrency(voce.importo)
                        : "Prezzo da completare"}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}
        <div
          className={cn(
            "min-h-0 flex-1 p-4",
            item ? "overflow-y-auto md:overflow-hidden" : "overflow-hidden",
          )}
        >
          {inserimentoDaConfermare && (
            <div
              role="alert"
              className="mx-auto max-w-3xl space-y-5 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950"
            >
              <h3 className="font-semibold">
                Queste voci potrebbero essere già conteggiate
              </h3>
              <ul className="list-disc space-y-2 pl-5 text-sm">
                {inserimentoDaConfermare.avvisi.map((avviso) => (
                  <li key={avviso}>{avviso}</li>
                ))}
              </ul>
              <div className="rounded-lg border border-amber-200 bg-white/70 p-3 text-sm">
                <p className="mb-2 font-medium">Stai per aggiungere:</p>
                {inserimentoDaConfermare.righe.map((riga, index) => (
                  <p key={index}>
                    {riga.name} · {riga.quantity} {riga.unit_of_measure}
                  </p>
                ))}
              </div>
              <p className="text-sm">
                Questo inserimento non è stato ancora eseguito. Nessuna riga
                viene unita automaticamente. Se riguarda un altro ambiente o un
                lavoro distinto, puoi aggiungerla comunque.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => setInserimentoDaConfermare(null)}
                >
                  Annulla inserimento
                </Button>
                <Button
                  variant="brand"
                  onClick={() => {
                    const pending = inserimentoDaConfermare;
                    setInserimentoDaConfermare(null);
                    pending.conferma();
                  }}
                >
                  Aggiungi comunque
                </Button>
              </div>
            </div>
          )}
          <div hidden={!!inserimentoDaConfermare} className="h-full">
            {open && (
              <div
                hidden={!!item || modificaMultipla || tab !== "prodotti"}
                className="h-full"
              >
                <ProductPicker
                  prodotti={prodottiNellArea}
                  ambito={ambito}
                  nomeArea={titoloArea}
                  selectedIds={selectedIds}
                  onToggleItem={seleziona}
                  onTutteLeAree={
                    areaEffettiva === TUTTE_LE_AREE
                      ? undefined
                      : () => setArea(TUTTE_LE_AREE)
                  }
                  onSelectItem={(prodotto, contesto) => {
                    setItem(prodotto);
                    setDuplicazioni(0);
                    manodoperaPezziPrecedenti.current.clear();
                    setContestoProdotto(contesto ?? "");
                  }}
                  attivo={!item && !modificaMultipla && tab === "prodotti"}
                />
              </div>
            )}
            {open && onAddTariffa && (
              <div
                hidden={!!item || modificaMultipla || tab === "prodotti"}
                className="h-full"
              >
                <TariffePicker
                  attivo={!item && !modificaMultipla && tab !== "prodotti"}
                  tariffe={tab === "manodopera" ? lavorazioni : servizi}
                  ambito={`${ambito}:${tab}`}
                  nomeArea={titoloArea}
                  onTutteLeAree={
                    areaEffettiva === TUTTE_LE_AREE
                      ? undefined
                      : () => setArea(TUTTE_LE_AREE)
                  }
                  quantitaIniziale={quantitaInizialeTariffa}
                  prezzoUnitario={prezzoUnitarioTariffa}
                  onPick={(t, q, prezzo) => {
                    verificaInserimento(
                      [
                        {
                          item_type: "service",
                          item_category: "posa",
                          name: t.nome,
                          tariffa_id: t.id,
                          quantity: q,
                          unit_of_measure: unitaTariffa(t),
                        } as QuoteItemPro,
                      ],
                      () => {
                        if (prezzo !== undefined) onAddTariffa(t, q, prezzo);
                        else onAddTariffa(t, q);
                        registra(
                          [
                            {
                              nome: t.nome,
                              dettaglio: `${q} ${unitaTariffa(t)}`,
                              importo:
                                q *
                                (prezzo ??
                                  prezzoUnitarioTariffa?.(t) ??
                                  t.prezzo_vendita ??
                                  0),
                            },
                          ],
                          `${t.nome} aggiunto`,
                        );
                      },
                    );
                  }}
                />
              </div>
            )}
            {selezionati.length > 0 && (
              <div hidden={!modificaMultipla} className="h-full">
                <BatchProductConfigurator
                  items={selezionati}
                  currentSortOrder={currentSortOrder}
                  onBack={() => setModificaMultipla(false)}
                  onRemove={(prodotto) => {
                    seleziona(prodotto);
                    if (selezionati.length === 1) setModificaMultipla(false);
                  }}
                  onAddItems={(configurate, next) => {
                    verificaInserimento(
                      configurate.map((c) => c.quote_item),
                      () => {
                        onAddItems(configurate, next);
                        setSelezionati([]);
                        setModificaMultipla(false);
                        registra(
                          configurate.map((c) => voceDaProdotto([c])),
                          configurate.length === 1
                            ? "1 prodotto aggiunto"
                            : `${configurate.length} prodotti aggiunti`,
                        );
                      },
                    );
                  }}
                />
              </div>
            )}
            {item && !modificaMultipla && (
              <ProductConfigurator
                key={`${item.source}-${item.id}`}
                item={item}
                tariffe={tariffe}
                currentSortOrder={currentSortOrder}
                onBack={() => setItem(null)}
                onAddItems={aggiungi}
                inserimentoContinuo
                nuovaMisura={duplicazioni}
              />
            )}
          </div>
        </div>
        {!item && !modificaMultipla && !inserimentoDaConfermare && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t bg-background px-4 py-3 sm:px-6">
            {selezionati.length > 0 && (
              <>
                <span role="status" className="text-sm font-medium">
                  {selezionati.length} prodotti selezionati
                </span>
                <Button
                  variant="brand"
                  onClick={() => setModificaMultipla(true)}
                >
                  Modifica selezionati ({selezionati.length})
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelezionati([])}
                >
                  Svuota selezione
                </Button>
              </>
            )}
            {onAddFreeLine && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onAddFreeLine();
                  chiudi();
                }}
              >
                <Plus className="mr-1 h-4 w-4" />
                Lavorazione libera
              </Button>
            )}
            {onAddDiscount && (
              <Button
                variant="ghost"
                size="sm"
                className="max-sm:hidden"
                onClick={() => {
                  onAddDiscount();
                  chiudi();
                }}
              >
                Sconto
              </Button>
            )}
            {onAddSubtotal && (
              <Button
                variant="ghost"
                size="sm"
                className="max-sm:hidden"
                onClick={() => {
                  onAddSubtotal();
                  chiudi();
                }}
              >
                Subtotale
              </Button>
            )}
            <Button
              variant={aggiunte.length ? "default" : "outline"}
              className="ml-auto"
              onClick={chiudi}
            >
              {aggiunte.length
                ? "Fatto, torna al preventivo"
                : "Torna al preventivo"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
export default AddItemDialog;
