import { useMemo, useState } from "react";
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

export interface AddItemDialogProps {
  open: boolean;
  onClose: () => void;
  tariffe: TariffaPro[];
  initialTab?: "prodotti" | "servizi";
  currentSortOrder: number;
  onAddItems: (items: ConfiguredItem[], nextSortOrder: number) => void;
  onAddTariffa?: (tariffa: TariffaPro, quantita: number) => void;
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
    onAddItems(configured, next);
    conferma(item?.nome ?? "Prodotto");
  }
  const attive = serviziNellArea.filter(
    (t) => t.attivo !== false && t.attiva !== false,
  ).length;
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) chiudi();
      }}
    >
      <DialogContent className="flex h-[94vh] max-h-[96vh] max-w-6xl flex-col gap-0 overflow-hidden p-0 max-sm:h-[94dvh]">
        <DialogHeader className="shrink-0 border-b px-5 py-3 pr-12 sm:px-6">
          <DialogTitle>
            {item ? item.nome : "Aggiungi al preventivo"}
          </DialogTitle>
          <DialogDescription>
            {item
              ? `${contestoProdotto ? contestoProdotto + " · " : ""}Configura misure, varianti e posa prima di aggiungere.`
              : "Scegli un’area, cerca una voce e controlla l’importo."}
          </DialogDescription>
        </DialogHeader>
        {!item && (
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
        {!item && (
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
              const prossimo =
                e.key === "Home"
                  ? "prodotti"
                  : e.key === "End"
                    ? "servizi"
                    : tab === "prodotti"
                      ? "servizi"
                      : "prodotti";
              setTab(prossimo);
              const pulsanti =
                e.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                );
              const pulsante = pulsanti.item(prossimo === "prodotti" ? 0 : 1);
              pulsante?.focus();
            }}
            className="flex shrink-0 gap-1 border-b bg-muted/20 px-4 pt-2"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "prodotti"}
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
            {onAddTariffa && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === "servizi"}
                onClick={() => setTab("servizi")}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium max-sm:gap-1 max-sm:px-2 max-sm:text-xs",
                  tab === "servizi"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground",
                )}
              >
                <Wrench className="h-4 w-4" />
                Manodopera e servizi
                <span className="rounded-full bg-muted px-2 text-xs tabular-nums">
                  {attive}
                </span>
              </button>
            )}
          </div>
        )}
        {lastAdded && (
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
          {open && (
            <div hidden={!!item || tab !== "prodotti"} className="h-full">
              <ProductPicker
                prodotti={prodottiNellArea}
                ambito={ambito}
                nomeArea={titoloArea}
                onSelectItem={(prodotto, contesto) => {
                  setItem(prodotto);
                  setContestoProdotto(contesto ?? "");
                }}
                attivo={!item && tab === "prodotti"}
              />
            </div>
          )}
          {open && onAddTariffa && (
            <div hidden={!!item || tab !== "servizi"} className="h-full">
              <TariffePicker
                attivo={!item && tab === "servizi"}
                tariffe={serviziNellArea}
                ambito={ambito}
                nomeArea={titoloArea}
                quantitaIniziale={quantitaInizialeTariffa}
                prezzoUnitario={prezzoUnitarioTariffa}
                onPick={(t, q) => {
                  onAddTariffa(t, q);
                  conferma(t.nome);
                }}
              />
            </div>
          )}
          {item && (
            <>
              <ProductConfigurator
                key={`${item.source}-${item.id}`}
                item={item}
                tariffe={tariffe}
                currentSortOrder={currentSortOrder}
                onBack={() => setItem(null)}
                onAddItems={aggiungi}
                confirmLabel={
                  keepAdding ? "Aggiungi e continua" : "Aggiungi e chiudi"
                }
              />
              <label className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={keepAdding}
                  onChange={(e) => setKeepAdding(e.target.checked)}
                  className="accent-orange-500"
                />
                Continua ad aggiungere prodotti
              </label>
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t bg-background px-4 py-3 sm:px-6">
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
              Riga libera
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
            {addedCount ? "Fatto, torna al preventivo" : "Torna al preventivo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
export default AddItemDialog;
