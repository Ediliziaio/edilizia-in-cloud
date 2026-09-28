/**
 * Tabella degli impianti — la vista "elenco" della manutenzione, gemella della
 * tabella dell'assistenza. Riga cliccabile → scheda impianto. Su telefono le
 * righe diventano schede impilate.
 */
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Calendar, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { STATO_MANUT_META } from "@/lib/manutenzione/statoManutenzione";
import type { ImpiantoStato } from "@/components/manutenzione/ManutenzionePipeline";

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
              <button
                type="button"
                onClick={() => onOpen(im.id)}
                className="grid w-full grid-cols-1 gap-1.5 px-4 py-3 text-left transition-colors hover:bg-slate-50 sm:grid-cols-[1.6fr_1.2fr_1.1fr_0.9fr] sm:items-center sm:gap-2"
              >
                {/* Impianto + cliente */}
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
                {/* Prossima manutenzione */}
                <div className="text-xs text-muted-foreground">
                  {im.prossimaScadenza ? (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />{format(new Date(im.prossimaScadenza), "d MMM yyyy", { locale: it })}
                    </span>
                  ) : "—"}
                </div>
                {/* Stato manutenzione */}
                <div>
                  <Badge className={cn("text-[10px]", meta.badge)}>{meta.label}</Badge>
                </div>
                {/* Garanzia */}
                <div>{garanziaBadge(im.garanzia_scadenza)}</div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
