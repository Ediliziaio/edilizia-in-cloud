/**
 * Tabella degli impianti — la vista "elenco" della manutenzione, gemella della
 * tabella dell'assistenza. Riga cliccabile → scheda impianto.
 *
 * Su telefono le righe sono compatte come le assistenze: un pallino per lo
 * stato, titolo dell'impianto, cliente e scadenza in piccolo, e a destra lo
 * stato in una parola. Da tablet in su torna la griglia con l'intestazione.
 */
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Calendar, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { STATO_MANUT_META, etichettaScadenza, type StatoManutenzione } from "@/lib/manutenzione/statoManutenzione";
import type { ImpiantoStato } from "@/components/manutenzione/ManutenzionePipeline";

// Colori del pallino / dell'etichetta a destra, per stato (come le assistenze).
const DOT: Record<StatoManutenzione, string> = {
  scaduta: "bg-red-500",
  in_scadenza: "bg-amber-500",
  in_regola: "bg-emerald-500",
  senza_piano: "bg-slate-300",
};
const TESTO: Record<StatoManutenzione, string> = {
  scaduta: "text-red-600",
  in_scadenza: "text-amber-600",
  in_regola: "text-emerald-600",
  senza_piano: "text-slate-500",
};

function garanziaBadge(date: string | null) {
  if (!date) return null;
  const giorni = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (giorni < 0) return <Badge className="bg-red-100 text-red-700 text-[10px]">Garanzia scaduta</Badge>;
  if (giorni < 90) return <Badge className="bg-yellow-100 text-yellow-800 text-[10px]">Garanzia {giorni}gg</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Garanzia ok</Badge>;
}

export function ImpiantiTable({ impianti, onOpen }: { impianti: ImpiantoStato[]; onOpen: (id: string) => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {/* Intestazione: solo da tablet in su, come la tabella dell'assistenza. */}
      <div className="hidden grid-cols-[1.6fr_1.2fr_1.1fr_0.9fr] gap-2 border-b bg-slate-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
        <span>Impianto · Cliente</span>
        <span>Prossima manutenzione</span>
        <span>Stato</span>
        <span>Garanzia</span>
      </div>
      <ul className="divide-y">
        {impianti.map((im) => {
          const meta = STATO_MANUT_META[im.stato];
          const cliente = [im.customer?.first_name, im.customer?.last_name].filter(Boolean).join(" ") || "—";
          return (
            <li key={im.id}>
              {/* Mobile: riga compatta come l'assistenza. */}
              <button
                type="button"
                onClick={() => onOpen(im.id)}
                className="tap-compact flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/50 active:bg-muted sm:hidden"
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[im.stato])} title={meta.label} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold capitalize leading-tight">
                    {im.tipo_impianto.replace("_", " ")}
                    {im.marca && <span className="ml-1 font-normal text-muted-foreground">{im.marca}{im.modello ? ` ${im.modello}` : ""}</span>}
                  </p>
                  <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="truncate">{cliente}</span>
                    {im.prossimaScadenza && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="shrink-0">{etichettaScadenza(im.prossimaScadenza)}</span>
                      </>
                    )}
                  </div>
                </div>
                <span className={cn("max-w-[5rem] shrink-0 text-right text-[11px] font-medium leading-tight", TESTO[im.stato])}>
                  {meta.label}
                </span>
              </button>

              {/* Tablet/desktop: griglia allineata all'intestazione. */}
              <button
                type="button"
                onClick={() => onOpen(im.id)}
                className="hidden w-full grid-cols-[1.6fr_1.2fr_1.1fr_0.9fr] items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-50 sm:grid"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold capitalize">
                    {im.tipo_impianto.replace("_", " ")}
                    {im.marca && <span className="ml-1 font-normal text-muted-foreground">{im.marca}{im.modello ? ` ${im.modello}` : ""}</span>}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <User className="h-3 w-3 shrink-0" />{cliente}
                    {im.contrattoNome && <span className="truncate">· {im.contrattoNome}</span>}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground">
                  {im.prossimaScadenza ? (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />{format(new Date(im.prossimaScadenza), "d MMM yyyy", { locale: it })}
                    </span>
                  ) : "—"}
                </div>
                <div>
                  <Badge className={cn("text-[10px]", meta.badge)}>{meta.label}</Badge>
                </div>
                <div>{garanziaBadge(im.garanzia_scadenza)}</div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
