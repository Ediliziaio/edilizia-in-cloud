/**
 * Tabella degli impianti — la vista "elenco" della manutenzione, gemella della
 * tabella dell'assistenza.
 *
 * Desktop: stessa tabella dell'assistenza — selezione, Tipo, Cliente · Impianto,
 * Priorità, Prossima manutenzione, Stato, Tecnico assegnato, e la freccia per
 * aprire. Priorità e tecnico non esistono sull'impianto: la priorità è l'urgenza
 * dedotta dallo stato, il tecnico è quello del piano.
 * Mobile: righe compatte come le assistenze (pallino, titolo, cliente, stato).
 */
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Calendar, User, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STATO_MANUT_META, etichettaScadenza, type StatoManutenzione } from "@/lib/manutenzione/statoManutenzione";
import type { ImpiantoStato, PrioritaManutenzione } from "@/components/manutenzione/ManutenzionePipeline";

// Colori del pallino / dell'etichetta a destra su mobile, per stato.
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
const PRIORITA_META: Record<Exclude<PrioritaManutenzione, null>, { label: string; badge: string }> = {
  alta: { label: "Alta", badge: "bg-red-100 text-red-700 border-red-200" },
  media: { label: "Media", badge: "bg-amber-100 text-amber-700 border-amber-200" },
  bassa: { label: "Bassa", badge: "bg-emerald-100 text-emerald-700 border-emerald-200" },
};

function tipoLabel(tipo: string) {
  return tipo.replace(/_/g, " ");
}

function garanziaBadge(date: string | null) {
  if (!date) return null;
  const giorni = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (giorni < 0) return <Badge className="bg-red-100 text-red-700 text-[10px]">Garanzia scaduta</Badge>;
  if (giorni < 90) return <Badge className="bg-yellow-100 text-yellow-800 text-[10px]">Garanzia {giorni}gg</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Garanzia ok</Badge>;
}

function ScadenzaCella({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-muted-foreground">—</span>;
  const scaduta = new Date(iso).getTime() < Date.now();
  const testo = format(new Date(iso), "d MMM yyyy", { locale: it });
  if (scaduta) {
    return <Badge className="bg-red-100 text-red-700">Scaduta {format(new Date(iso), "dd/MM/yy")}</Badge>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
      <Calendar className="h-3.5 w-3.5" />{testo}
    </span>
  );
}

export function ImpiantiTable({
  impianti, onOpen, selezionati, onToggle, onToggleTutti, tutteSelezionate,
}: {
  impianti: ImpiantoStato[];
  onOpen: (id: string) => void;
  selezionati?: Set<string>;
  onToggle?: (id: string) => void;
  onToggleTutti?: () => void;
  tutteSelezionate?: boolean;
}) {
  const selezionabile = !!onToggle;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {/* Mobile: righe compatte come l'assistenza. */}
      <ul className="divide-y sm:hidden">
        {impianti.map((im) => {
          const meta = STATO_MANUT_META[im.stato];
          const cliente = [im.customer?.first_name, im.customer?.last_name].filter(Boolean).join(" ") || "—";
          return (
            <li key={im.id}>
              <button
                type="button"
                onClick={() => onOpen(im.id)}
                className="tap-compact flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/50 active:bg-muted"
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[im.stato])} title={meta.label} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold capitalize leading-tight">
                    {tipoLabel(im.tipo_impianto)}
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
            </li>
          );
        })}
      </ul>

      {/* Tablet/desktop: stessa tabella dell'assistenza. */}
      <div className="hidden sm:block">
        <Table className="[&_td]:px-2.5 [&_th]:px-2.5 2xl:[&_td]:px-4 2xl:[&_th]:px-4">
          <TableHeader>
            <TableRow>
              {selezionabile && (
                <TableHead className="w-10">
                  <Checkbox checked={!!tutteSelezionate} onCheckedChange={onToggleTutti} aria-label="Seleziona tutti gli impianti" />
                </TableHead>
              )}
              <TableHead className="w-32">Tipo</TableHead>
              <TableHead className="min-w-[200px]">Cliente · Impianto</TableHead>
              <TableHead>Priorità</TableHead>
              <TableHead className="hidden xl:table-cell">Prossima manutenzione</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead className="hidden xl:table-cell">Assegnato</TableHead>
              <TableHead className="hidden 2xl:table-cell">Garanzia</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {impianti.map((im) => {
              const meta = STATO_MANUT_META[im.stato];
              const cliente = [im.customer?.first_name, im.customer?.last_name].filter(Boolean).join(" ") || "—";
              const sel = !!selezionati?.has(im.id);
              return (
                <TableRow key={im.id} className={cn(im.stato === "scaduta" && "bg-red-50/50 dark:bg-red-950/10")}>
                  {selezionabile && (
                    <TableCell>
                      <Checkbox checked={sel} onCheckedChange={() => onToggle?.(im.id)} aria-label={`Seleziona ${tipoLabel(im.tipo_impianto)}`} />
                    </TableCell>
                  )}
                  <TableCell>
                    <Badge variant="outline" className="max-w-[7.5rem] justify-start truncate capitalize">{tipoLabel(im.tipo_impianto)}</Badge>
                  </TableCell>
                  <TableCell className="min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="line-clamp-1 font-medium">{cliente}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[im.marca, im.modello].filter(Boolean).join(" ") || tipoLabel(im.tipo_impianto)}
                          {im.contrattoNome && <span> · {im.contrattoNome}</span>}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {im.priorita ? (
                      <Badge variant="outline" className={cn("font-medium", PRIORITA_META[im.priorita].badge)}>{PRIORITA_META[im.priorita].label}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell"><ScadenzaCella iso={im.prossimaScadenza} /></TableCell>
                  <TableCell>
                    <Badge className={cn(meta.badge)}>{meta.label}</Badge>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-sm">
                    {im.tecnicoNome ? (
                      <span className="inline-flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />{im.tecnicoNome}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Non assegnato</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden 2xl:table-cell">{garanziaBadge(im.garanzia_scadenza) ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => onOpen(im.id)} aria-label="Apri impianto">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
