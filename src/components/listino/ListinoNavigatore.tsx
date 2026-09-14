/**
 * Il listino come si naviga: area → tipologia → linea → prodotti.
 *
 * In alto il cappello delle aree (Serramenti, Fotovoltaico…), che dice anche a
 * quale preventivatore arrivano i prodotti. A sinistra le tipologie dell'area,
 * con in fondo quelle standard che mancano. Al centro le linee della tipologia
 * scelta e i prodotti della linea, ciascuno col prezzo di quella linea.
 *
 * Componente di sola presentazione: dati e azioni arrivano da fuori, così la
 * stessa pagina gira con i dati veri (FamilyCatalog) e con quelli d'esempio
 * (/dev/listino).
 */
import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  AppWindow,
  Bath,
  Copy,
  CopyPlus,
  Eye,
  EyeOff,
  FileText,
  FolderSymlink,
  ImagePlus,
  Layers3,
  Link2,
  Link2Off,
  MoreVertical,
  Package,
  PackageOpen,
  Palette,
  Percent,
  Plus,
  Power,
  PowerOff,
  Sun,
  Trash2,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { FamilyWithAxes } from "@/types/articleFamily";
import type { TipologiaStandard } from "@/lib/listino/areeStandard";
import { formattaMaggiorazione } from "@/lib/listino/maggiorazione";
import { statoMargine } from "@/lib/listino/filtriListino";
import { datiTecniciScheda, schedaVuota, type SchedaLinea } from "@/lib/listino/schedeLinea";
import { eLineaBaseDeiModelli, haLineeDaAsse, prodottiSenzaLinee, riepilogoVarianti } from "@/lib/listino/organizzaListino";
import {
  economiaRiga,
  lineaDiRiferimento,
  risolviSelezione,
  type AreaListino,
  type EconomiaRiga,
  type LineaListino,
  type RigaListino,
  type SelezioneListino,
  type TipologiaListino,
} from "@/lib/listino/lineeListino";
import type { VistaListino } from "./ListinoBarra";

const EURO = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

const ICONE_AREA: Record<string, LucideIcon> = {
  serramenti: AppWindow,
  fotovoltaico: Sun,
  bagni: Bath,
  generale: Package,
};

export interface AzioniProdotto {
  onApri: (famiglia: FamilyWithAxes) => void;
  onDuplica?: (famiglia: FamilyWithAxes) => void;
  onSposta?: (famiglia: FamilyWithAxes) => void;
  onElimina?: (famiglia: FamilyWithAxes) => void;
  onAttivo?: (famiglia: FamilyWithAxes) => void;
  onPreventivo?: (famiglia: FamilyWithAxes) => void;
}

export interface ListinoNavigatoreProps {
  aree: AreaListino[];
  selezione: SelezioneListino;
  onSelezione: (selezione: SelezioneListino) => void;
  vista: VistaListino;
  /** Ricerca o filtri attivi: si vedono i risultati raggruppati invece della navigazione. */
  cercando: boolean;
  isAdmin: boolean;
  azioni: AzioniProdotto;
  inAttesa?: Set<string>;
  onAzzera?: () => void;
  onCreaTipologia?: (area: AreaListino, standard: TipologiaStandard) => void;
  onCreaTutteStandard?: (area: AreaListino) => void;
  /** «+ Area»: un'area standard che l'azienda non ha ancora. */
  onNuovaArea?: () => void;
  /** «+ Tipologia» in un'area: standard, su misura o copia di una che c'è. */
  onNuovaTipologia?: (area: AreaListino) => void;
  onCopiaTipologia?: (area: AreaListino, tipologia: TipologiaListino) => void;
  /** Toglie la tipologia dai preventivi o ce la rimette (attivo della macrocategoria). */
  onAttivaTipologia?: (area: AreaListino, tipologia: TipologiaListino) => void;
  /** Dà le linee della tipologia ai prodotti che non le hanno. */
  onAllineaLinee?: (area: AreaListino, tipologia: TipologiaListino) => void;
  onNuovaLinea?: (area: AreaListino, tipologia: TipologiaListino) => void;
  onNuovoProdotto?: (area: AreaListino | null, tipologia: TipologiaListino | null, linea: LineaListino | null) => void;
  onPrezziLinee?: (tipologia: TipologiaListino) => void;
  /** Colori e varianti uguali in tutti i prodotti della tipologia. */
  onVariantiTipologia?: (tipologia: TipologiaListino) => void;
  onCollega?: (area: AreaListino, tipologia: TipologiaListino) => void;
  /** Mette fra gli accessori della finestra una tipologia che lo standard vuole accessorio (tapparelle, zanzariere). */
  onAccessorio?: (area: AreaListino, tipologia: TipologiaListino) => void;
  /** La scheda di una linea (foto, descrizione, dati tecnici), se c'è. */
  schedaDi?: (tipologia: TipologiaListino, linea: LineaListino) => SchedaLinea | null;
  onSchedaLinea?: (area: AreaListino, tipologia: TipologiaListino, linea: LineaListino) => void;
}

export function ListinoNavigatore(props: ListinoNavigatoreProps) {
  const { aree, selezione, onSelezione, cercando, isAdmin } = props;
  const { area, tipologia, linea } = useMemo(() => risolviSelezione(aree, selezione), [aree, selezione]);

  if (aree.length === 0) {
    return cercando ? (
      <StatoVuoto
        titolo="Nessun prodotto trovato"
        testo="Nessun prodotto del listino corrisponde a ricerca e filtri."
        azione={props.onAzzera ? { etichetta: "Azzera ricerca e filtri", onClick: props.onAzzera } : undefined}
      />
    ) : (
      <StatoVuoto
        titolo="Il listino è vuoto"
        testo="Parti da un'area con le sue tipologie standard, oppure crea il primo prodotto: tipologia e area decidono in quale preventivatore comparirà."
        azione={
          isAdmin && props.onNuovaArea
            ? { etichetta: "Aggiungi un'area", onClick: props.onNuovaArea }
            : isAdmin && props.onNuovoProdotto
              ? { etichetta: "Nuovo prodotto", onClick: () => props.onNuovoProdotto?.(null, null, null) }
              : undefined
        }
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <CappelloAree
        aree={aree}
        attiva={area}
        cercando={cercando}
        onScegli={(chiave) => onSelezione({ area: chiave })}
        onNuovaArea={isAdmin ? props.onNuovaArea : undefined}
      />

      {area && cercando ? (
        <div className="space-y-6 p-3 sm:p-4">
          {area.tipologie.map((t) => (
            <RisultatiTipologia key={t.chiave} tipologia={t} {...props} largo />
          ))}
        </div>
      ) : area ? (
        <div className="flex flex-col lg:flex-row">
          <ColonnaTipologie
            area={area}
            attiva={tipologia}
            isAdmin={isAdmin}
            onScegli={(chiave) => onSelezione({ area: area.chiave, tipologia: chiave })}
            onCreaTipologia={props.onCreaTipologia}
            onCreaTutteStandard={props.onCreaTutteStandard}
            onNuovaTipologia={props.onNuovaTipologia}
          />
          <div className="min-w-0 flex-1 p-3 sm:p-4">
            {tipologia ? (
              <ContenutoTipologia area={area} tipologia={tipologia} linea={linea} {...props} />
            ) : (
              <StatoVuoto titolo="Nessuna tipologia" testo="Aggiungi una tipologia con «+ Tipologia», sotto l'elenco delle tipologie." />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CappelloAree({
  aree,
  attiva,
  cercando,
  onScegli,
  onNuovaArea,
}: {
  aree: AreaListino[];
  attiva: AreaListino | null;
  cercando: boolean;
  onScegli: (chiave: string) => void;
  onNuovaArea?: () => void;
}) {
  const preventivatore = attiva?.standard?.preventivatore;
  // Le tipologie dell'area che non arrivano al suo preventivatore: prima la
  // riga diceva «Collegata» anche quando qualcuna non lo era.
  const nonCollegate = attiva
    ? attiva.tipologie.filter((t) => t.fonte === "macrocategoria" && t.collegamento === "nessuno").length
    : 0;
  return (
    <div className="border-b bg-muted/30">
      <div className="flex items-center gap-2 pr-2">
      <div role="tablist" aria-label="Aree del listino" className="flex min-w-0 flex-1 overflow-x-auto px-2">
        {aree.map((a) => {
          const Icona = ICONE_AREA[a.chiave] ?? Layers3;
          const selezionata = a.chiave === attiva?.chiave;
          return (
            <button
              key={a.chiave}
              type="button"
              role="tab"
              aria-selected={selezionata}
              onClick={() => onScegli(a.chiave)}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-2.5 border-b-2 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selezionata
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg",
                  selezionata ? "bg-primary text-primary-foreground" : "bg-background ring-1 ring-border",
                )}
              >
                <Icona className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="leading-tight">
                <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Area</span>
                <span className="block text-sm font-semibold">{a.nome}</span>
              </span>
              <span className="rounded-full bg-background px-2 py-0.5 text-xs tabular-nums ring-1 ring-border">
                {a.articoli}
              </span>
            </button>
          );
        })}
      </div>
      {onNuovaArea && !cercando && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1 border-dashed text-muted-foreground hover:text-foreground"
          onClick={onNuovaArea}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Area
        </Button>
      )}
      </div>
      {attiva && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t bg-background/60 px-4 py-1.5 text-xs text-muted-foreground">
          <span>
            {cercando ? "Risultati: " : ""}
            {attiva.tipologie.length} {attiva.tipologie.length === 1 ? "tipologia" : "tipologie"} · {attiva.articoli}{" "}
            {attiva.articoli === 1 ? "prodotto" : "prodotti"}
          </span>
          {preventivatore ? (
            nonCollegate > 0 ? (
              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                <Link2Off className="h-3.5 w-3.5" aria-hidden="true" />
                {nonCollegate === 1 ? "1 tipologia non arriva" : `${nonCollegate} tipologie non arrivano`} al{" "}
                {preventivatore.toLowerCase()}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                Collegata al {preventivatore.toLowerCase()}
              </span>
            )
          ) : null}
        </p>
      )}
    </div>
  );
}

function ColonnaTipologie({
  area,
  attiva,
  isAdmin,
  onScegli,
  onCreaTipologia,
  onCreaTutteStandard,
  onNuovaTipologia,
}: {
  area: AreaListino;
  attiva: TipologiaListino | null;
  isAdmin: boolean;
  onScegli: (chiave: string) => void;
  onCreaTipologia?: (area: AreaListino, standard: TipologiaStandard) => void;
  onCreaTutteStandard?: (area: AreaListino) => void;
  onNuovaTipologia?: (area: AreaListino) => void;
}) {
  const puoiCreare = isAdmin && !!onCreaTipologia && area.mancanti.length > 0;
  return (
    <nav
      aria-label={`Tipologie dell'area ${area.nome}`}
      className="border-b p-2 lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r"
    >
      <p className="hidden px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground lg:block">
        Tipologie
      </p>
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {area.tipologie.map((t) => {
          const selezionata = t.chiave === attiva?.chiave;
          return (
            <li key={t.chiave} className="shrink-0">
              <button
                type="button"
                onClick={() => onScegli(t.chiave)}
                aria-current={selezionata ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selezionata ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-muted",
                  t.articoli === 0 && !selezionata && "text-muted-foreground",
                )}
              >
                <span className="truncate">{t.nome}</span>
                {t.collegamento === "nessuno" && (
                  <Link2Off className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="Non compare nei preventivi" />
                )}
                {!t.attiva && (
                  <PowerOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Tolta dai preventivi" />
                )}
                <span className="ml-auto pl-2 text-xs tabular-nums text-muted-foreground">{t.articoli}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {isAdmin && onNuovaTipologia && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 h-8 w-full justify-start gap-1.5 px-2.5 text-primary"
          onClick={() => onNuovaTipologia(area)}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Tipologia
        </Button>
      )}
      {puoiCreare && (
        <div className="mt-2 hidden border-t pt-2 lg:block">
          <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Standard da aggiungere
          </p>
          <ul>
            {area.mancanti.map((s) => (
              <li key={s.nome}>
                <button
                  type="button"
                  onClick={() => onCreaTipologia?.(area, s)}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{s.nome}</span>
                </button>
              </li>
            ))}
          </ul>
          {area.mancanti.length > 1 && onCreaTutteStandard && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 h-8 w-full justify-start px-2.5 text-xs text-primary"
              onClick={() => onCreaTutteStandard(area)}
            >
              Aggiungile tutte ({area.mancanti.length})
            </Button>
          )}
        </div>
      )}
    </nav>
  );
}

function ContenutoTipologia({
  area,
  tipologia,
  linea,
  onSelezione,
  isAdmin,
  vista,
  azioni,
  inAttesa,
  onNuovaLinea,
  onNuovoProdotto,
  onPrezziLinee,
  onVariantiTipologia,
  onCollega,
  onAccessorio,
  onCopiaTipologia,
  onAttivaTipologia,
  onAllineaLinee,
  schedaDi,
  onSchedaLinea,
}: ListinoNavigatoreProps & { area: AreaListino; tipologia: TipologiaListino; linea: LineaListino | null }) {
  // Una linea sola che non è una linea (i prodotti senza linea) non merita una linguetta.
  const linguette = tipologia.linee.length === 1 && tipologia.linee[0].fonte === "altri" ? [] : tipologia.linee;
  const puoiAggiungereLinea = isAdmin && !!onNuovaLinea && tipologia.fonte === "macrocategoria";
  const riferimento = lineaDiRiferimento(tipologia);
  const lineaContenitore = linea?.fonte === "categoria" ? linea : null;
  const senzaLinee = prodottiSenzaLinee(tipologia);
  // Colori e varianti si possono anche aggiungere (maniglia, soglia). Nel fotovoltaico no: lì si
  // aggiungono prodotto per prodotto, e il menu serve solo se le varianti ci sono già.
  const conVarianti =
    !!onVariantiTipologia &&
    (area.chiave === "fotovoltaico" ? riepilogoVarianti(tipologia).assi.length > 0 : tipologia.articoli > 0);
  // La scheda della linea la leggono il preventivatore e il PDF dei serramenti.
  const lineaConScheda =
    area.chiave === "serramenti" && linea && linea.fonte !== "altri" && (schedaDi || onSchedaLinea) ? linea : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-lg font-semibold leading-tight">{tipologia.nome}</h3>
        <span className="text-sm tabular-nums text-muted-foreground">
          {tipologia.articoli} {tipologia.articoli === 1 ? "prodotto" : "prodotti"}
        </span>
        <Collegamento
          area={area}
          tipologia={tipologia}
          isAdmin={isAdmin}
          onCollega={onCollega}
          onAccessorio={onAccessorio}
        />
        {!tipologia.attiva && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            <PowerOff className="h-3 w-3" aria-hidden="true" />
            Tolta dai preventivi
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {isAdmin && onNuovoProdotto && tipologia.fonte !== "senza" && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => onNuovoProdotto(area, tipologia, lineaContenitore)}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Prodotto in {lineaContenitore?.nome ?? tipologia.nome}
            </Button>
          )}
          {isAdmin && tipologia.fonte === "macrocategoria" && (
            <MenuTipologia
              tipologia={tipologia}
              senzaLinee={senzaLinee}
              onVarianti={onVariantiTipologia && conVarianti ? () => onVariantiTipologia(tipologia) : undefined}
              onPrezzi={onPrezziLinee && haLineeDaAsse(tipologia) ? () => onPrezziLinee(tipologia) : undefined}
              onAllinea={onAllineaLinee && senzaLinee > 0 ? () => onAllineaLinee(area, tipologia) : undefined}
              onCopia={
                onCopiaTipologia && area.chiave !== "fotovoltaico" ? () => onCopiaTipologia(area, tipologia) : undefined
              }
              onAttiva={onAttivaTipologia ? () => onAttivaTipologia(area, tipologia) : undefined}
            />
          )}
        </div>
      </div>

      {(linguette.length > 0 || puoiAggiungereLinea) && (
        <div role="tablist" aria-label={`Linee di ${tipologia.nome}`} className="flex flex-wrap items-center gap-1.5">
          {linguette.map((l) => {
            const selezionata = l.chiave === linea?.chiave;
            const scostamento = l.fonte === "asse" && !l.base ? formattaMaggiorazione("percentuale", l.scostamentoPct) : "";
            return (
              <button
                key={l.chiave}
                type="button"
                role="tab"
                aria-selected={selezionata}
                onClick={() => onSelezione({ area: area.chiave, tipologia: tipologia.chiave, linea: l.chiave })}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selezionata
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background hover:border-primary/50 hover:bg-muted",
                  l.fonte === "altri" && !selezionata && "border-dashed",
                )}
              >
                <span className="max-w-[16rem] truncate">{l.nome}</span>
                {scostamento && (
                  <span
                    className={cn(
                      "rounded px-1 text-[11px] font-semibold tabular-nums",
                      selezionata ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {scostamento}
                  </span>
                )}
                <span className={cn("text-xs tabular-nums", selezionata ? "opacity-80" : "text-muted-foreground")}>
                  {l.righe.length}
                </span>
              </button>
            );
          })}
          {puoiAggiungereLinea && (
            <button
              type="button"
              onClick={() => onNuovaLinea?.(area, tipologia)}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed px-3 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Linea
            </button>
          )}
        </div>
      )}

      {linea?.fonte === "asse" && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>
            Stessi modelli in ogni linea
            {riferimento && !linea.base && linea.scostamentoPct != null
              ? `: prezzi di ${riferimento.nome} ${formattaMaggiorazione("percentuale", linea.scostamentoPct)}.`
              : linea.base && riferimento
                ? ": questa è la linea di riferimento dei prezzi."
                : "."}
          </span>
          {isAdmin && onPrezziLinee && (
            <button type="button" className="font-medium text-primary hover:underline" onClick={() => onPrezziLinee(tipologia)}>
              Cambia i prezzi delle linee
            </button>
          )}
        </p>
      )}

      {senzaLinee > 0 && linea && (linea.fonte === "altri" || eLineaBaseDeiModelli(linea.nome)) && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <span>
            {senzaLinee === 1 ? "Un prodotto non ha" : `${senzaLinee} prodotti non hanno`} le linee di {tipologia.nome}: nel
            preventivo non si sceglie la linea e resta il prezzo base.
          </span>
          {isAdmin && onAllineaLinee && (
            <button
              type="button"
              className="font-medium underline-offset-2 hover:underline"
              onClick={() => onAllineaLinee(area, tipologia)}
            >
              Dagli le linee
            </button>
          )}
        </p>
      )}

      {lineaConScheda && (
        <RigaSchedaLinea
          linea={lineaConScheda}
          scheda={schedaDi?.(tipologia, lineaConScheda) ?? null}
          isAdmin={isAdmin}
          onApri={onSchedaLinea ? () => onSchedaLinea(area, tipologia, lineaConScheda) : undefined}
        />
      )}

      {linea && linea.righe.length > 0 ? (
        <Prodotti righe={linea.righe} vista={vista} isAdmin={isAdmin} azioni={azioni} inAttesa={inAttesa} />
      ) : (
        <StatoVuoto
          compatto
          titolo={tipologia.articoli === 0 ? `Nessun prodotto in ${tipologia.nome}` : "Nessun prodotto in questa linea"}
          testo={
            tipologia.articoli === 0
              ? "Crea il primo prodotto di questa tipologia, oppure spostaci quelli che hai già."
              : "Crea un prodotto in questa linea, oppure spostaci quelli che hai già."
          }
          azione={
            isAdmin && onNuovoProdotto
              ? {
                  etichetta: "Nuovo prodotto",
                  onClick: () => onNuovoProdotto(area, tipologia, lineaContenitore),
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

/** La scheda della linea sotto le linguette: una riga sola, così i prodotti restano in vista. */
function RigaSchedaLinea({
  linea,
  scheda,
  isAdmin,
  onApri,
}: {
  linea: LineaListino;
  scheda: SchedaLinea | null;
  isAdmin: boolean;
  onApri?: () => void;
}) {
  const puoiModificare = isAdmin && !!onApri;
  if (!scheda || schedaVuota(scheda)) {
    if (!puoiModificare) return null;
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed px-3 py-2">
        <ImagePlus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="min-w-0 flex-1 basis-64 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Scheda di {linea.nome}</span>: foto, descrizione e dati
          tecnici, scritti una volta per tutti i prodotti della linea. Compare nel preventivatore e nel PDF.
        </p>
        <Button variant="outline" size="sm" className="h-8" onClick={onApri}>
          Compila la scheda
        </Button>
      </div>
    );
  }
  const dati = datiTecniciScheda(scheda);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 p-2 sm:flex-nowrap">
      <div className="relative h-14 w-[4.5rem] shrink-0 overflow-hidden rounded-md border bg-white">
        {scheda.immagine_url ? (
          <img
            src={scheda.immagine_url}
            alt={`Profilo ${linea.nome}`}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-contain p-1"
          />
        ) : (
          <ImagePlus
            className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-slate-300"
            aria-hidden="true"
          />
        )}
      </div>
      <div className="min-w-0 flex-1 basis-48">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
          <span className="font-medium">Scheda di {linea.nome}</span>
          {dati.length > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground">{dati.map((d) => d.breve).join(" · ")}</span>
          )}
        </p>
        {scheda.descrizione && (
          <p className="line-clamp-1 text-xs text-muted-foreground" title={scheda.descrizione}>
            {scheda.descrizione}
          </p>
        )}
      </div>
      {scheda.scheda_tecnica_url && (
        <a
          href={scheda.scheda_tecnica_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          Scheda del produttore
        </a>
      )}
      {puoiModificare && (
        <Button variant="ghost" size="sm" className="h-8 shrink-0" onClick={onApri}>
          Modifica
        </Button>
      )}
    </div>
  );
}

function RisultatiTipologia({
  tipologia,
  vista,
  isAdmin,
  azioni,
  inAttesa,
  largo,
}: ListinoNavigatoreProps & { tipologia: TipologiaListino; largo?: boolean }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-baseline gap-2 text-base font-semibold">
        {tipologia.nome}
        <span className="text-xs font-normal tabular-nums text-muted-foreground">{tipologia.articoli}</span>
      </h3>
      {tipologia.linee.map((l) => (
        <div key={l.chiave} className="space-y-2">
          {tipologia.linee.length > 1 && (
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{l.nome}</p>
          )}
          <Prodotti righe={l.righe} vista={vista} isAdmin={isAdmin} azioni={azioni} inAttesa={inAttesa} largo={largo} />
        </div>
      ))}
    </section>
  );
}

function Prodotti({
  righe,
  vista,
  isAdmin,
  azioni,
  inAttesa,
  largo = false,
}: {
  righe: RigaListino[];
  vista: VistaListino;
  isAdmin: boolean;
  azioni: AzioniProdotto;
  inAttesa?: Set<string>;
  /** Senza la colonna delle tipologie c'è posto per una colonna di schede in più. */
  largo?: boolean;
}) {
  if (vista === "table") {
    return <TabellaProdotti righe={righe} isAdmin={isAdmin} azioni={azioni} inAttesa={inAttesa} />;
  }
  return (
    <ul
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4",
        largo ? "lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7" : "xl:grid-cols-5 2xl:grid-cols-6",
      )}
    >
      {righe.map((r) => (
        <li key={r.chiave}>
          <SchedaProdotto riga={r} isAdmin={isAdmin} azioni={azioni} />
        </li>
      ))}
    </ul>
  );
}

function SchedaProdotto({ riga, isAdmin, azioni }: { riga: RigaListino; isAdmin: boolean; azioni: AzioniProdotto }) {
  const f = riga.famiglia;
  const economia = economiaRiga(riga);
  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-lg border bg-card transition-shadow focus-within:ring-2 focus-within:ring-ring",
        isAdmin && "hover:border-primary/50 hover:shadow-sm",
        !f.attivo && "border-dashed opacity-60",
      )}
    >
      <div className="relative aspect-[4/3] shrink-0 border-b bg-white">
        {f.immagine_url ? (
          <img src={f.immagine_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain p-2" />
        ) : (
          <Package className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-slate-300" aria-hidden="true" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        {isAdmin ? (
          <button
            type="button"
            onClick={() => azioni.onApri(f)}
            className="text-left text-sm font-medium leading-snug after:absolute after:inset-0 focus-visible:outline-none"
            title={f.nome}
          >
            <span className="line-clamp-2">{f.nome}</span>
          </button>
        ) : (
          <p className="line-clamp-2 text-sm font-medium leading-snug" title={f.nome}>
            {f.nome}
          </p>
        )}
        <Segnali famiglia={f} />
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <Prezzo economia={economia} />
          <Margine economia={economia} />
        </div>
      </div>
      {isAdmin && (
        <div className="absolute right-1.5 top-1.5 z-10 md:opacity-0 md:transition-opacity md:group-focus-within:opacity-100 md:group-hover:opacity-100">
          <MenuProdotto famiglia={f} azioni={azioni} className="bg-background/90 shadow-sm ring-1 ring-border" />
        </div>
      )}
    </article>
  );
}

function TabellaProdotti({
  righe,
  isAdmin,
  azioni,
  inAttesa,
}: {
  righe: RigaListino[];
  isAdmin: boolean;
  azioni: AzioniProdotto;
  inAttesa?: Set<string>;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Prodotto</TableHead>
            <TableHead className="text-right">Prezzo</TableHead>
            <TableHead className="hidden text-right md:table-cell">Costo</TableHead>
            <TableHead className="text-right">Margine</TableHead>
            <TableHead className="hidden w-[72px] text-center sm:table-cell">Attivo</TableHead>
            <TableHead className="hidden w-[96px] text-center sm:table-cell">Preventivi</TableHead>
            {isAdmin && <TableHead className="w-[44px]" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {righe.map((r) => {
            const f = r.famiglia;
            const economia = economiaRiga(r);
            const bloccato = inAttesa?.has(f.id) ?? false;
            // La stessa tipologia sta in ogni linea: accenderla o spegnerla vale per tutte.
            const nota = r.linea ? "Vale per la tipologia in tutte le sue linee" : undefined;
            return (
              <TableRow
                key={r.chiave}
                className={cn(isAdmin && "cursor-pointer", !f.attivo && "opacity-60")}
                onClick={isAdmin ? () => azioni.onApri(f) : undefined}
              >
                <TableCell>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded border bg-white">
                      {f.immagine_url ? (
                        <img src={f.immagine_url} alt="" loading="lazy" className="h-full w-full object-contain p-0.5" />
                      ) : (
                        <Package className="h-4 w-4 text-slate-300" aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="max-w-[22rem] truncate text-sm font-medium" title={f.nome}>
                        {f.nome}
                      </p>
                      <Segnali famiglia={f} />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Prezzo economia={economia} />
                </TableCell>
                <TableCell className="hidden text-right text-sm tabular-nums text-muted-foreground md:table-cell">
                  {economia.acquisto != null ? EURO.format(economia.acquisto) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Margine economia={economia} />
                </TableCell>
                <TableCell className="hidden text-center sm:table-cell" onClick={(e) => e.stopPropagation()} title={nota}>
                  <Switch
                    checked={f.attivo}
                    onCheckedChange={() => azioni.onAttivo?.(f)}
                    disabled={!isAdmin || !azioni.onAttivo || bloccato}
                    aria-label={`Prodotto attivo: ${f.nome}`}
                  />
                </TableCell>
                <TableCell className="hidden text-center sm:table-cell" onClick={(e) => e.stopPropagation()} title={nota}>
                  <Switch
                    checked={f.mostra_preventivo !== false}
                    onCheckedChange={() => azioni.onPreventivo?.(f)}
                    disabled={!isAdmin || !azioni.onPreventivo || bloccato}
                    aria-label={`Proposto nei preventivi: ${f.nome}`}
                  />
                </TableCell>
                {isAdmin && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <MenuProdotto famiglia={f} azioni={azioni} />
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function Prezzo({ economia }: { economia: EconomiaRiga }) {
  if (economia.griglia) return <span className="text-xs text-muted-foreground">Prezzo a griglia L×H</span>;
  if (!economia.vendita) {
    return <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Prezzo da impostare</span>;
  }
  return (
    <span className="whitespace-nowrap text-sm font-semibold tabular-nums">
      {EURO.format(economia.vendita)}
      <span className="ml-0.5 text-xs font-normal text-muted-foreground">/{economia.unita}</span>
    </span>
  );
}

function Margine({ economia }: { economia: EconomiaRiga }) {
  if (economia.griglia || !economia.vendita) return null;
  const stato = statoMargine(economia.marginePct);
  if (stato === "missing") {
    return <span className="whitespace-nowrap text-[11px] text-muted-foreground">Costo mancante</span>;
  }
  const pct = economia.marginePct ?? 0;
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
        pct < 0
          ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
          : stato === "low"
            ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
            : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
      )}
      title="Margine sul prezzo di vendita"
    >
      {Math.round(pct)}%
    </span>
  );
}

function Segnali({ famiglia }: { famiglia: FamilyWithAxes }) {
  const segnali: Array<{ testo: string; icona: LucideIcon; classe: string }> = [];
  if (!famiglia.attivo) segnali.push({ testo: "Disattivato", icona: PowerOff, classe: "text-amber-700 dark:text-amber-400" });
  if (famiglia.mostra_preventivo === false) {
    segnali.push({ testo: "Fuori dai preventivi", icona: EyeOff, classe: "text-muted-foreground" });
  }
  if (famiglia.manodopera_modalita == null) {
    segnali.push({ testo: "Posa da impostare", icona: AlertTriangle, classe: "text-amber-700 dark:text-amber-400" });
  }
  if (segnali.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5">
      {segnali.map(({ testo, icona: Icona, classe }) => (
        <span key={testo} className={cn("inline-flex items-center gap-1 text-[11px]", classe)}>
          <Icona className="h-3 w-3" aria-hidden="true" />
          {testo}
        </span>
      ))}
    </div>
  );
}

function Collegamento({
  area,
  tipologia,
  isAdmin,
  onCollega,
  onAccessorio,
}: {
  area: AreaListino;
  tipologia: TipologiaListino;
  isAdmin: boolean;
  onCollega?: (area: AreaListino, tipologia: TipologiaListino) => void;
  onAccessorio?: (area: AreaListino, tipologia: TipologiaListino) => void;
}) {
  const preventivatore = area.standard?.preventivatore?.toLowerCase();
  const puoiCollegare = isAdmin && !!onCollega && !!preventivatore && tipologia.fonte === "macrocategoria";
  if (tipologia.collegamento === "area") {
    if (!preventivatore) return null;
    // Nel preventivatore serramenti un accessorio si aggiunge alla finestra, un prodotto principale sta da solo.
    const accessorio = tipologia.categoriaTipo === "accessorio";
    const daMettereFraGliAccessori =
      area.chiave === "serramenti" && !accessorio && !!tipologia.standard?.accessorio && isAdmin && !!onAccessorio;
    return (
      <span className="inline-flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
        {accessorio ? `Tra gli accessori del ${preventivatore}` : `Nel ${preventivatore}`}
        {daMettereFraGliAccessori && (
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => onAccessorio?.(area, tipologia)}
          >
            · aggiungila agli accessori della finestra
          </button>
        )}
      </span>
    );
  }
  if (tipologia.collegamento === "tutte") {
    return (
      <span className="inline-flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
        In tutti i preventivatori
        {puoiCollegare && (
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => onCollega?.(area, tipologia)}>
            · solo nel {preventivatore}
          </button>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
      <Link2Off className="h-3.5 w-3.5" aria-hidden="true" />
      Non compare nei preventivi: si trova solo cercando
      {puoiCollegare && (
        <button type="button" className="font-medium text-primary hover:underline" onClick={() => onCollega?.(area, tipologia)}>
          · collega al {preventivatore}
        </button>
      )}
    </span>
  );
}

function MenuProdotto({
  famiglia,
  azioni,
  className,
}: {
  famiglia: FamilyWithAxes;
  azioni: AzioniProdotto;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-7 w-7 rounded-full", className)}
          aria-label={`Azioni per ${famiglia.nome}`}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => azioni.onApri(famiglia)}>
          <Wrench className="mr-2 h-4 w-4" aria-hidden="true" />
          Modifica
        </DropdownMenuItem>
        {azioni.onDuplica && (
          <DropdownMenuItem onClick={() => azioni.onDuplica?.(famiglia)}>
            <CopyPlus className="mr-2 h-4 w-4" aria-hidden="true" />
            Duplica
          </DropdownMenuItem>
        )}
        {azioni.onSposta && (
          <DropdownMenuItem onClick={() => azioni.onSposta?.(famiglia)}>
            <FolderSymlink className="mr-2 h-4 w-4" aria-hidden="true" />
            Sposta in un'altra tipologia
          </DropdownMenuItem>
        )}
        {(azioni.onPreventivo || azioni.onAttivo) && <DropdownMenuSeparator />}
        {azioni.onPreventivo && (
          <DropdownMenuItem onClick={() => azioni.onPreventivo?.(famiglia)}>
            {famiglia.mostra_preventivo !== false ? (
              <EyeOff className="mr-2 h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {famiglia.mostra_preventivo !== false ? "Nascondi dai preventivi" : "Proponi nei preventivi"}
          </DropdownMenuItem>
        )}
        {azioni.onAttivo && (
          <DropdownMenuItem onClick={() => azioni.onAttivo?.(famiglia)}>
            {famiglia.attivo ? (
              <PowerOff className="mr-2 h-4 w-4" aria-hidden="true" />
            ) : (
              <Power className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {famiglia.attivo ? "Disattiva" : "Riattiva"}
          </DropdownMenuItem>
        )}
        {azioni.onElimina && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => azioni.onElimina?.(famiglia)}
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Elimina
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Le azioni sulla tipologia intera: varianti, prezzi e linee, copia, fuori dai preventivi. */
function MenuTipologia({
  tipologia,
  senzaLinee,
  onVarianti,
  onPrezzi,
  onAllinea,
  onCopia,
  onAttiva,
}: {
  tipologia: TipologiaListino;
  senzaLinee: number;
  onVarianti?: () => void;
  onPrezzi?: () => void;
  onAllinea?: () => void;
  onCopia?: () => void;
  onAttiva?: () => void;
}) {
  if (!onVarianti && !onPrezzi && !onAllinea && !onCopia && !onAttiva) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8" aria-label={`Altre azioni su ${tipologia.nome}`}>
          <MoreVertical className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {onVarianti && (
          <DropdownMenuItem onClick={onVarianti}>
            <Palette className="mr-2 h-4 w-4" aria-hidden="true" />
            Colori e varianti
          </DropdownMenuItem>
        )}
        {onPrezzi && (
          <DropdownMenuItem onClick={onPrezzi}>
            <Percent className="mr-2 h-4 w-4" aria-hidden="true" />
            Prezzi delle linee
          </DropdownMenuItem>
        )}
        {onAllinea && (
          <DropdownMenuItem onClick={onAllinea}>
            <Layers3 className="mr-2 h-4 w-4" aria-hidden="true" />
            Dai le linee a {senzaLinee} {senzaLinee === 1 ? "prodotto" : "prodotti"}
          </DropdownMenuItem>
        )}
        {onCopia && (
          <DropdownMenuItem onClick={onCopia}>
            <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
            Copia tipologia
          </DropdownMenuItem>
        )}
        {onAttiva && (
          <>
            {(onVarianti || onPrezzi || onAllinea || onCopia) && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={onAttiva}>
              {tipologia.attiva ? (
                <PowerOff className="mr-2 h-4 w-4" aria-hidden="true" />
              ) : (
                <Power className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {tipologia.attiva ? "Togli dai preventivi" : "Rimetti nei preventivi"}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatoVuoto({
  titolo,
  testo,
  azione,
  compatto = false,
}: {
  titolo: string;
  testo: string;
  azione?: { etichetta: string; onClick: () => void };
  compatto?: boolean;
}) {
  return (
    <div className={cn("rounded-lg border border-dashed text-center", compatto ? "px-4 py-8" : "bg-card px-4 py-14")}>
      <PackageOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <p className="font-medium">{titolo}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{testo}</p>
      {azione && (
        <Button size="sm" className="mt-4" onClick={azione.onClick}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {azione.etichetta}
        </Button>
      )}
    </div>
  );
}
