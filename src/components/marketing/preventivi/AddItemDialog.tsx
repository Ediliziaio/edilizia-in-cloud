import { useMemo, useState } from "react";
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
}

export function AddItemDialog(props: AddItemDialogProps) {
  const [area, setArea] = useState(TUTTE_LE_AREE);
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
  const [keepAdding, setKeepAdding] = useState(true);
  const [addedCount, setAddedCount] = useState(0);
  const [lastAdded, setLastAdded] = useState("");
  const [selezionati, setSelezionati] = useState<CatalogItem[]>([]);
  const [modificaMultipla, setModificaMultipla] = useState(false);
  const [inserimentoDaConfermare, setInserimentoDaConfermare] = useState<{
    avvisi: string[];
    righe: QuoteItemPro[];
    conferma: () => void;
  } | null>(null);
  function verificaInserimento(righe: QuoteItemPro[], conferma: () => void) {
    const avvisi = avvisiDoppieVoci(righe, existingItems);
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
  function conferma(nome: string) {
    if (!keepAdding) {
      chiudi();
      return;
    }
    setLastAdded(nome);
    setAddedCount((c) => c + 1);
    setItem(null);
  }
  function aggiungi(configured: ConfiguredItem[], next: number) {
    verificaInserimento(
      configured.map((c) => c.quote_item),
      () => {
        onAddItems(configured, next);
        conferma(item?.nome ?? "Prodotto");
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
          <div className="shrink-0 border-b bg-muted/20 px-4 py-2 sm:px-6">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Area di lavoro
              </p>
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
            <nav
              aria-label="Aree di lavoro"
              className="hidden max-h-28 flex-wrap gap-2 overflow-y-auto sm:flex"
            >
              {scelteArea.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  aria-pressed={areaEffettiva === a.id}
                  aria-label={`${a.nome}: ${conteggiArea(a)}`}
                  disabled={
                    !organizzazioneDisponibile && a.id !== TUTTE_LE_AREE
                  }
                  onClick={() => setArea(a.id)}
                  className={cn(
                    "rounded-lg border bg-background px-3 py-1.5 text-left text-xs transition hover:border-primary/50 disabled:opacity-50",
                    areaEffettiva === a.id &&
                      "border-primary bg-primary/10 text-primary",
                  )}
                >
                  <span className="block font-semibold leading-4">
                    {a.nome}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-4 opacity-75">
                    {conteggiArea(a)}
                  </span>
                </button>
              ))}
            </nav>
            <select
              aria-label="Area di lavoro"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm sm:hidden"
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
            {categorie.isError || macros.isError ? (
              <p role="alert" className="mt-2 text-xs text-amber-800">
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
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                {areaEffettiva === VOCI_COMUNI
                  ? "Voci generiche o con area ancora da assegnare nel listino."
                  : areaEffettiva !== TUTTE_LE_AREE && includiComuni && comuni
                    ? `${titoloArea} + ${comuni.prodotti} prodotti e ${comuni.servizi} servizi comuni / senza area.`
                    : "Scegli un’area, poi una categoria prodotto o una lavorazione."}
              </p>
            )}
          </div>
        )}
        {!item && !modificaMultipla && !inserimentoDaConfermare && (
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
            className="flex shrink-0 gap-1 border-b bg-muted/20 px-4 pt-2"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "prodotti"}
              tabIndex={tab === "prodotti" ? 0 : -1}
              onClick={() => setTab("prodotti")}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium max-sm:gap-1 max-sm:px-2 max-sm:text-xs",
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
                    "flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium max-sm:gap-1 max-sm:px-2 max-sm:text-xs",
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
        )}
        {lastAdded && !inserimentoDaConfermare && (
          <p
            role="status"
            className="mx-4 mt-3 flex shrink-0 items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          >
            <Check className="h-4 w-4 shrink-0" />
            {lastAdded} aggiunto · {addedCount}{" "}
            {addedCount === 1 ? "voce inserita" : "voci inserite"}
          </p>
        )}
        <div
          className={cn(
            "min-h-0 flex-1 p-4",
            item ? "overflow-y-auto" : "overflow-hidden",
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
                  onSelectItem={(prodotto, contesto) => {
                    setItem(prodotto);
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
                        conferma(t.nome);
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
                        setLastAdded(`${configurate.length} prodotti`);
                        setAddedCount((c) => c + configurate.length);
                      },
                    );
                  }}
                />
              </div>
            )}
            {item && !modificaMultipla && (
              <div
                className={cn(
                  "mx-auto",
                  prodottoSemplice(item) &&
                    "grid max-w-4xl gap-6 md:grid-cols-[minmax(0,1fr)_240px]",
                )}
              >
                <div>
                  <ProductConfigurator
                    key={`${item.source}-${item.id}`}
                    item={item}
                    tariffe={tariffe}
                    currentSortOrder={currentSortOrder}
                    onBack={() => setItem(null)}
                    onAddItems={aggiungi}
                    confirmLabel={
                      keepAdding
                        ? "Aggiungi e scegli un altro"
                        : "Aggiungi al preventivo"
                    }
                  />
                  <label className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={keepAdding}
                      onChange={(e) => setKeepAdding(e.target.checked)}
                      className="accent-orange-500"
                    />
                    Aggiungi altri prodotti dopo questo
                  </label>
                </div>
                {prodottoSemplice(item) && (
                  <aside className="hidden rounded-xl border bg-muted/20 p-5 md:block">
                    <h3 className="text-sm font-semibold">
                      Vuoi inserire più prodotti?
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      Torna al catalogo, spunta i prodotti e modifica quantità e
                      prezzi in un’unica tabella.
                    </p>
                    <Button
                      variant="outline"
                      className="mt-4 w-full"
                      onClick={() => {
                        if (!selectedIds.has(`${item.source}:${item.id}`))
                          seleziona(item);
                        setItem(null);
                      }}
                    >
                      Seleziona questo e altri
                    </Button>
                  </aside>
                )}
              </div>
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
              variant={addedCount ? "default" : "outline"}
              className="ml-auto"
              onClick={chiudi}
            >
              {addedCount
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
