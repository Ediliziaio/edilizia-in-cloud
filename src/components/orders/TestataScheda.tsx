/**
 * Testata unica delle schede di /azienda/ordini (piano 25/11/2026, docs/piano-testate-schede-commesse.md).
 *
 * Il modello è la testata di Commesse: titolo a sinistra (text-xl, niente sottotitolo da computer),
 * comandi a destra, tutti alti 32px. Prima ogni scheda aveva la sua: titolo da 24px con la frase
 * sotto, bottoni da 36 o 40px, «Nuovo» in cinque colori (anche blu), «Esporta» in cinque posti.
 *
 * - `azioni`: comandi secondari (outline, h-8) — usare BOTTONE_SECONDARIO.
 * - `altre`: voci del menu «⋯» (esportazioni, stampe, importazioni, impostazioni).
 * - `nuovo`: l'unica azione in evidenza, sempre arancio sfumato.
 * Da telefono e tablet le pillole della sezione dicono già il nome: il titolo resta per i lettori
 * di schermo. Le schede che mettono «+»/«⋯» nelle pillole (useSlotAzioniSezione) nascondono qui i
 * propri comandi sotto i 1024px con `className` sui bottoni o passando `azioni` già filtrate.
 */
import { Fragment, isValidElement, type ElementType, type ReactNode } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** Bottone secondario della testata e della barra: outline, 32px, testo 12px. */
export const BOTTONE_SECONDARIO = "h-8 gap-1.5 px-2.5 text-xs [&_svg]:h-3.5 [&_svg]:w-3.5";

/** Barra dei filtri, uguale in tutte le schede (25/11/2026): la ricerca ha sempre 288px (prima si
 *  allargava fino in fondo in alcune schede e si fermava a 320 o 224 in altre), la tendina dello stato
 *  180px. Da telefono la ricerca prende la riga. */
export const RICERCA_BARRA = "relative w-72 max-w-full shrink-0 max-sm:w-auto max-sm:min-w-0 max-sm:flex-1 max-sm:shrink";
export const TENDINA_STATO_BARRA = "h-8 w-[180px] max-w-full shrink-0 text-xs";

/** Il «Nuovo» di tutte le schede: lo stesso di «Nuova Commessa». */
export const BOTTONE_NUOVO = "h-8 gap-1 px-3 text-xs font-semibold bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white shadow-sm shadow-orange-500/20 hover:from-orange-600 hover:to-amber-500 hover:shadow-md hover:shadow-orange-500/25";

export interface VoceAltre {
  etichetta: string;
  icona?: ElementType;
  onSelect: () => void;
  disabled?: boolean;
  /** Titoletto che apre un gruppo nel menu (es. «Esporta»). */
  gruppo?: string;
}

type DatiNuovo = { etichetta: string; onClick: () => void; disabled?: boolean; title?: string };
const sonoDatiNuovo = (n: unknown): n is DatiNuovo => typeof n === "object" && n !== null && !isValidElement(n) && "etichetta" in n;

export function TestataScheda({ titolo, azioni, altre, nuovo, className, comandiNellePillole }: {
  titolo: ReactNode;
  azioni?: ReactNode;
  altre?: VoceAltre[];
  /** L'azione in evidenza: i dati per il bottone standard, oppure un bottone già fatto (con BOTTONE_NUOVO)
   *  quando apre una finestra propria, come «Scrivi rapportini». */
  nuovo?: DatiNuovo | ReactNode;
  className?: string;
  /** La scheda mette già «+»/«⋯» nelle pillole sotto i 1024px: qui i comandi solo da computer. */
  comandiNellePillole?: boolean;
}) {
  const t = useT();
  const voci = (altre ?? []).filter(Boolean);
  return (
    <div className={cn("testata-pagina flex flex-wrap items-center justify-between gap-x-4 gap-y-2", className)}>
      <h1 className="min-w-0 text-xl font-bold leading-tight tracking-tight text-slate-900 max-lg:sr-only">{titolo}</h1>
      <div className={cn("flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1.5 max-sm:w-full max-sm:justify-start", comandiNellePillole && "max-lg:hidden")}>
        {azioni}
        {voci.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8" aria-label={t("Altre azioni")}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {voci.map((v, i) => {
                const Icona = v.icona;
                const nuovoGruppo = v.gruppo && v.gruppo !== voci[i - 1]?.gruppo;
                return (
                  <Fragment key={`${v.gruppo ?? ""}-${v.etichetta}`}>
                    {nuovoGruppo && i > 0 && <DropdownMenuSeparator />}
                    {nuovoGruppo && <DropdownMenuLabel className="text-xs text-muted-foreground">{v.gruppo}</DropdownMenuLabel>}
                    <DropdownMenuItem disabled={v.disabled} onSelect={v.onSelect}>
                      {Icona && <Icona className="mr-2 h-4 w-4" />}{v.etichetta}
                    </DropdownMenuItem>
                  </Fragment>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {sonoDatiNuovo(nuovo) ? (
          <Button size="sm" className={BOTTONE_NUOVO} disabled={nuovo.disabled} title={nuovo.title} onClick={nuovo.onClick}>
            <Plus className="h-3.5 w-3.5" />{nuovo.etichetta}
          </Button>
        ) : (nuovo as ReactNode)}
      </div>
    </div>
  );
}
