/**
 * La barra del listino, su una riga: cerca, filtri, vista e le azioni.
 *
 * I filtri stanno in un menu perché si usano di rado e occupavano una fascia
 * intera sopra i prodotti (la pagina deve far vedere il listino, non le sue
 * intestazioni).
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, FolderTree, Layers, Wand2, LayoutGrid, Plus, Rows3, Search, Settings2, SlidersHorizontal, Trash, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { BOTTONE_SECONDARIO } from "@/components/orders/TestataScheda";
import {
  FILTRI_LISTINO_INIZIALI,
  MODALITA_PREZZO,
  SOGLIA_MARGINE_LISTINO,
  filtriAttivi,
  type FiltriListino,
} from "@/lib/listino/filtriListino";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export interface AzioneImporta {
  etichetta: string;
  descrizione?: string;
  icona: LucideIcon;
  onClick?: () => void;
  href?: string;
}

export type VistaListino = "cards" | "table";

export interface ListinoBarraProps {
  cerca: string;
  onCerca: (valore: string) => void;
  filtri: FiltriListino;
  onFiltri: (filtri: FiltriListino) => void;
  vista: VistaListino;
  onVista: (vista: VistaListino) => void;
  isAdmin: boolean;
  cestino?: number;
  onCestino?: () => void;
  onTipologie?: () => void;
  /** Apre «Assegna i disegni dai nomi» (solo aziende con serramenti). */
  onDisegni?: () => void;
  /** Apre «Modelli di infissi»: scrivi i modelli e nascono tutte le tipologie col disegno. */
  onModelli?: () => void;
  /** Quello che porta dati nel listino: foglio Excel, PDF del fornitore. */
  azioniImporta?: AzioneImporta[];
  /** Quello che organizza il listino senza importare niente: modelli pronti, serie di profilo, prezzi delle linee. */
  azioniImposta?: AzioneImporta[];
  onNuovoProdotto?: () => void;
  /** «Come funziona», in fondo a destra: lo vede anche chi può solo consultare. */
  guida?: ReactNode;
}

export function ListinoBarra({
  cerca,
  onCerca,
  filtri,
  onFiltri,
  vista,
  onVista,
  isAdmin,
  cestino = 0,
  onCestino,
  onTipologie,
  onDisegni,
  onModelli,
  azioniImporta,
  azioniImposta,
  onNuovoProdotto,
  guida,
}: ListinoBarraProps) {
  const t = useT();
  const quantiFiltri = filtriAttivi(filtri);

  return (
    // Da computer su una riga sola (25/11/2026): a 1600px le azioni andavano a
    // capo (barra di 78px). Comandi da 32px come nelle testate, la ricerca si
    // stringe per fare posto (non sotto i 180px).
    <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
      <div className="relative w-full sm:w-auto sm:min-w-[180px] sm:max-w-sm sm:flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={cerca}
          onChange={(e) => onCerca(e.target.value)}
          placeholder={t("Cerca in tutto il listino…")}
          className="h-8 pl-9 pr-8 text-xs"
          aria-label={t("Cerca in tutto il listino")}
        />
        {cerca && (
          <button
            type="button"
            onClick={() => onCerca("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label={t("Svuota la ricerca")}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn(BOTTONE_SECONDARIO, "shrink-0")}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            {t("Filtri")}
            {quantiFiltri > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-primary-foreground tabular-nums">
                {quantiFiltri}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 space-y-3">
          <FiltroSelect
            id="filtro-modalita"
            etichetta={t("Come si calcola il prezzo")}
            valore={filtri.modalita}
            onValore={(v) => onFiltri({ ...filtri, modalita: v as FiltriListino["modalita"] })}
            opzioni={[["all", t("Tutte")], ...Object.entries(MODALITA_PREZZO)]}
          />
          <FiltroSelect
            id="filtro-margine"
            etichetta={t("Margine")}
            valore={filtri.margine}
            onValore={(v) => onFiltri({ ...filtri, margine: v as FiltriListino["margine"] })}
            opzioni={[
              ["all", t("Tutti")],
              ["ok", t("Margine sopra il {soglia_margine_listino}%", { soglia_margine_listino: SOGLIA_MARGINE_LISTINO })],
              ["low", t("Margine basso o negativo")],
              ["missing", t("Costo mancante")],
            ]}
            nota={t("La soglia del {soglia_margine_listino}% è fissa in questa pagina: non è il «Margine minimo» di Prezzo e margini.", { soglia_margine_listino: SOGLIA_MARGINE_LISTINO })}
          />
          <FiltroSelect
            id="filtro-foto"
            etichetta={t("Foto")}
            valore={filtri.foto}
            onValore={(v) => onFiltri({ ...filtri, foto: v as FiltriListino["foto"] })}
            opzioni={[
              ["all", t("Tutte")],
              ["senza", t("Senza foto")],
              ["con", t("Con foto")],
            ]}
            nota={t("Un disegno fatto dal sistema (serramenti) conta come foto.")}
          />
          <FiltroSelect
            id="filtro-stato"
            etichetta={t("Stato")}
            valore={filtri.stato}
            onValore={(v) => onFiltri({ ...filtri, stato: v as FiltriListino["stato"] })}
            opzioni={[
              ["all", t("Tutti")],
              ["attivi", t("Solo attivi")],
              ["disattivi", t("Solo disattivati")],
            ]}
          />
          <FiltroSelect
            id="filtro-preventivo"
            etichetta={t("Nei preventivi")}
            valore={filtri.preventivo}
            onValore={(v) => onFiltri({ ...filtri, preventivo: v as FiltriListino["preventivo"] })}
            opzioni={[
              ["all", t("Tutti")],
              ["mostrati", t("Proposti nei preventivi")],
              ["nascosti", t("Nascosti dai preventivi")],
            ]}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            disabled={quantiFiltri === 0}
            onClick={() => onFiltri(FILTRI_LISTINO_INIZIALI)}
          >
            {t("Azzera i filtri")}
          </Button>
        </PopoverContent>
      </Popover>

      {/* Altezza libera: da telefono i bottoni diventano 44 px (index.css) e un
          contenitore fisso a 36 li faceva uscire dal bordo. */}
      <div className="inline-flex shrink-0 items-center rounded-md border border-input bg-background p-0.5 max-md:hidden" role="group" aria-label={t("Vista")}>
        {(
          [
            ["cards", LayoutGrid, t("Schede")],
            ["table", Rows3, t("Tabella")],
          ] as const
        ).map(([valore, Icona, etichetta]) => (
          <Button
            key={valore}
            type="button"
            variant={vista === valore ? "secondary" : "ghost"}
            size="sm"
            className="h-[26px] px-2"
            onClick={() => onVista(valore)}
            aria-pressed={vista === valore}
            aria-label={t("Vista {nome}", { nome: etichetta.toLowerCase() })}
            title={etichetta}
          >
            <Icona className="h-4 w-4" aria-hidden="true" />
          </Button>
        ))}
      </div>

      {/* Da telefono solo «Nuovo»: tipologie, modelli, import e cestino sono da scrivania. */}
      <div className="ml-auto flex flex-wrap items-center gap-2 xl:shrink-0 xl:flex-nowrap max-md:[&>*:not(.bg-gradient-to-br)]:hidden">
        {isAdmin && (
          <>
            {onTipologie && (
              <Button variant="outline" size="sm" className={BOTTONE_SECONDARIO} onClick={onTipologie} aria-label={t("Tipologie e linee")}>
                <FolderTree className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t("Tipologie")}</span>
              </Button>
            )}
            {onModelli && (
              <Button variant="outline" size="sm" className={BOTTONE_SECONDARIO} onClick={onModelli} aria-label={t("Modelli di infissi")}>
                <Layers className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t("Modelli")}</span>
              </Button>
            )}
            {onDisegni && (
              <Button variant="outline" size="sm" className={BOTTONE_SECONDARIO} onClick={onDisegni} aria-label={t("Assegna i disegni")}>
                <Wand2 className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t("Disegni")}</span>
              </Button>
            )}
            {azioniImporta && azioniImporta.length > 0 && (
              <MenuAzioni etichetta={t("Importa")} icona={Upload} azioni={azioniImporta} />
            )}
            {azioniImposta && azioniImposta.length > 0 && (
              <MenuAzioni etichetta={t("Imposta")} icona={Settings2} azioni={azioniImposta} />
            )}
            {onCestino && (
              <Button
                variant="outline"
                size="icon"
                className="relative h-8 w-8"
                onClick={onCestino}
                aria-label={t(cestino === 1 ? "Cestino ({n} prodotto)" : "Cestino ({n} prodotti)", { n: cestino })}
                title={cestino > 0 ? t("Cestino ({cestino})", { cestino }) : t("Cestino")}
              >
                <Trash className="h-4 w-4" aria-hidden="true" />
                {cestino > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 text-[9px] font-bold leading-4 text-destructive-foreground">
                    {cestino}
                  </span>
                )}
              </Button>
            )}
            {onNuovoProdotto && (
              <Button
                size="sm"
                className="h-8 gap-1 px-3 text-xs font-semibold bg-gradient-to-br from-orange-500 to-eic-amber text-white shadow-sm hover:from-orange-600 hover:to-amber-500"
                onClick={onNuovoProdotto}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("Nuovo")}<span className="hidden sm:inline"> {t("prodotto")}</span>
              </Button>
            )}
          </>
        )}
        {guida}
      </div>
    </div>
  );
}

/** Un menu di azioni della barra: ogni voce è un link o un comando, con la sua riga di spiegazione. */
function MenuAzioni({ etichetta, icona: Icona, azioni }: { etichetta: string; icona: LucideIcon; azioni: AzioneImporta[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={BOTTONE_SECONDARIO} aria-label={etichetta}>
          <Icona className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{etichetta}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {azioni.map(({ etichetta: voce, descrizione, icona: IconaVoce, onClick, href }) => {
          const contenuto = (
            <>
              <IconaVoce className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="flex flex-col">
                <span>{voce}</span>
                {descrizione && <span className="text-[11px] text-muted-foreground">{descrizione}</span>}
              </span>
            </>
          );
          return href ? (
            <DropdownMenuItem key={voce} asChild>
              <Link to={href} className="cursor-pointer">
                {contenuto}
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem key={voce} onClick={onClick}>
              {contenuto}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FiltroSelect({
  id,
  etichetta,
  valore,
  onValore,
  opzioni,
  nota,
}: {
  id: string;
  etichetta: string;
  valore: string;
  onValore: (valore: string) => void;
  opzioni: Array<[string, string]>;
  /** Una riga sotto il menu: cosa conta davvero (la soglia, il disegno). */
  nota?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {etichetta}
      </Label>
      <Select value={valore} onValueChange={onValore}>
        <SelectTrigger id={id} aria-describedby={nota ? `${id}-nota` : undefined} className={cn("h-9", valore !== "all" && "border-primary/60")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {opzioni.map(([v, testo]) => (
            <SelectItem key={v} value={v}>
              {testo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {nota && (
        <p id={`${id}-nota`} className="text-[11px] leading-snug text-muted-foreground">
          {nota}
        </p>
      )}
    </div>
  );
}
