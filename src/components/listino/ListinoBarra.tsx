/**
 * La barra del listino, su una riga: cerca, filtri, vista e le azioni.
 *
 * I filtri stanno in un menu perché si usano di rado e occupavano una fascia
 * intera sopra i prodotti (la pagina deve far vedere il listino, non le sue
 * intestazioni).
 */
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, FolderTree, LayoutGrid, Plus, Rows3, Search, SlidersHorizontal, Trash, Upload, X } from "lucide-react";
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
import {
  FILTRI_LISTINO_VUOTI,
  MODALITA_PREZZO,
  filtriAttivi,
  type FiltriListino,
} from "@/lib/listino/filtriListino";

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
  azioniImporta?: AzioneImporta[];
  onNuovoProdotto?: () => void;
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
  azioniImporta,
  onNuovoProdotto,
}: ListinoBarraProps) {
  const quantiFiltri = filtriAttivi(filtri);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-auto sm:min-w-[220px] sm:max-w-sm sm:flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={cerca}
          onChange={(e) => onCerca(e.target.value)}
          placeholder="Cerca in tutto il listino…"
          className="h-9 pl-9 pr-8"
          aria-label="Cerca in tutto il listino"
        />
        {cerca && (
          <button
            type="button"
            onClick={() => onCerca("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Svuota la ricerca"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-1.5">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Filtri
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
            etichetta="Come si calcola il prezzo"
            valore={filtri.modalita}
            onValore={(v) => onFiltri({ ...filtri, modalita: v as FiltriListino["modalita"] })}
            opzioni={[["all", "Tutte"], ...Object.entries(MODALITA_PREZZO)]}
          />
          <FiltroSelect
            id="filtro-margine"
            etichetta="Margine"
            valore={filtri.margine}
            onValore={(v) => onFiltri({ ...filtri, margine: v as FiltriListino["margine"] })}
            opzioni={[
              ["all", "Tutti"],
              ["ok", "Margine sopra il 15%"],
              ["low", "Margine basso o negativo"],
              ["missing", "Costo mancante"],
            ]}
          />
          <FiltroSelect
            id="filtro-stato"
            etichetta="Stato"
            valore={filtri.stato}
            onValore={(v) => onFiltri({ ...filtri, stato: v as FiltriListino["stato"] })}
            opzioni={[
              ["all", "Tutti"],
              ["attivi", "Solo attivi"],
              ["disattivi", "Solo disattivati"],
            ]}
          />
          <FiltroSelect
            id="filtro-preventivo"
            etichetta="Nei preventivi"
            valore={filtri.preventivo}
            onValore={(v) => onFiltri({ ...filtri, preventivo: v as FiltriListino["preventivo"] })}
            opzioni={[
              ["all", "Tutti"],
              ["mostrati", "Proposti nei preventivi"],
              ["nascosti", "Nascosti dai preventivi"],
            ]}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            disabled={quantiFiltri === 0}
            onClick={() => onFiltri(FILTRI_LISTINO_VUOTI)}
          >
            Azzera i filtri
          </Button>
        </PopoverContent>
      </Popover>

      {/* Altezza libera: da telefono i bottoni diventano 44 px (index.css) e un
          contenitore fisso a 36 li faceva uscire dal bordo. */}
      <div className="inline-flex items-center rounded-md border border-input bg-background p-0.5" role="group" aria-label="Vista">
        {(
          [
            ["cards", LayoutGrid, "Schede"],
            ["table", Rows3, "Tabella"],
          ] as const
        ).map(([valore, Icona, etichetta]) => (
          <Button
            key={valore}
            type="button"
            variant={vista === valore ? "secondary" : "ghost"}
            size="sm"
            className="h-8 px-2.5"
            onClick={() => onVista(valore)}
            aria-pressed={vista === valore}
            aria-label={`Vista ${etichetta.toLowerCase()}`}
            title={etichetta}
          >
            <Icona className="h-4 w-4" aria-hidden="true" />
          </Button>
        ))}
      </div>

      {isAdmin && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {onTipologie && (
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={onTipologie} aria-label="Tipologie e linee">
              <FolderTree className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Tipologie</span>
            </Button>
          )}
          {azioniImporta && azioniImporta.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5" aria-label="Importa">
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Importa</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {azioniImporta.map(({ etichetta, descrizione, icona: Icona, onClick, href }) => {
                  const contenuto = (
                    <>
                      <Icona className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="flex flex-col">
                        <span>{etichetta}</span>
                        {descrizione && <span className="text-[11px] text-muted-foreground">{descrizione}</span>}
                      </span>
                    </>
                  );
                  return href ? (
                    <DropdownMenuItem key={etichetta} asChild>
                      <Link to={href} className="cursor-pointer">
                        {contenuto}
                      </Link>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem key={etichetta} onClick={onClick}>
                      {contenuto}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {onCestino && (
            <Button
              variant="outline"
              size="icon"
              className="relative h-9 w-9"
              onClick={onCestino}
              aria-label={`Cestino (${cestino} articoli)`}
              title={cestino > 0 ? `Cestino (${cestino})` : "Cestino"}
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
              className="h-9 gap-1.5 bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-sm hover:from-orange-600 hover:to-amber-500"
              onClick={onNuovoProdotto}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nuovo<span className="hidden sm:inline"> prodotto</span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function FiltroSelect({
  id,
  etichetta,
  valore,
  onValore,
  opzioni,
}: {
  id: string;
  etichetta: string;
  valore: string;
  onValore: (valore: string) => void;
  opzioni: Array<[string, string]>;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {etichetta}
      </Label>
      <Select value={valore} onValueChange={onValore}>
        <SelectTrigger id={id} className={cn("h-9", valore !== "all" && "border-primary/60")}>
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
    </div>
  );
}
