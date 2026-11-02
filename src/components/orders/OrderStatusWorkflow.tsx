import { Link } from "react-router-dom";
import { Check, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { statusVisits } from "@/lib/orders/statusHistory";
import { statoProposto, type AvanzamentoLavorazioni } from "@/lib/orders/statoCommessa";
import type { OrderStatus } from "@/lib/orderUtils";

interface VoceStorico { id: string; status_id: string; changed_at: string; status?: { name?: string | null } | null }

interface Props {
  orderId: string;
  statuses: OrderStatus[];
  currentStatusId: string | null;
  statusHistory?: VoceStorico[];
  canEdit: boolean;
  onStatusChange?: (statusId: string) => void;
  workProgress?: AvanzamentoLavorazioni;
  /** Chi ha fatto l'ultimo cambio, se si è potuto leggere. */
  ultimoAutore?: string | null;
  formatoData: (iso: string) => string;
}

const CAMBI_NEL_MENU = 5;

/**
 * Lo stato della commessa nel suo riquadro: si legge il nome, un clic sul nome lo
 * cambia. Sotto, a che fase è arrivata. Chi l'ha cambiato e quando stanno nel menu.
 */
export function OrderStatusWorkflow({ orderId, statuses, currentStatusId, statusHistory = [], canEdit, onStatusChange, workProgress, ultimoAutore, formatoData }: Props) {
  const cambia = canEdit ? onStatusChange : undefined;
  const proposto = cambia ? statoProposto(statuses, currentStatusId, workProgress) : null;
  const ordinati = [...statuses].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const percorso = ordinati.filter((s) => !s.is_support_phase);
  const attuale = ordinati.find((s) => s.id === currentStatusId);
  const posizione = percorso.findIndex((s) => s.id === currentStatusId);
  const colore = attuale?.color || "#64748b";
  const visite = statusVisits(statusHistory);
  const nome = attuale?.name ?? "Stato non impostato";

  const etichetta = (
    <>
      <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colore }} />
      <span className="min-w-0 break-words text-left">{nome}</span>
    </>
  );

  return (
    <div className="mt-2">
      {cambia ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Stato commessa: ${nome}. Cambia stato`}
            title="Cambia stato"
            className="-mx-1 flex max-w-full items-start gap-2 rounded px-1 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:text-base"
          >
            {etichetta}
            <ChevronDown className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[min(70vh,30rem)] w-72 overflow-y-auto">
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">Cambia stato</DropdownMenuLabel>
            {ordinati.map((s) => {
              const corrente = s.id === currentStatusId;
              const data = visite.get(s.id)?.toLocaleDateString("it-IT");
              return (
                <DropdownMenuItem key={s.id} disabled={corrente} onSelect={() => cambia(s.id)} className="gap-2 text-xs">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color || "#64748b" }} aria-hidden="true" />
                  <span className={corrente ? "min-w-0 flex-1 font-semibold" : "min-w-0 flex-1"}>{s.name}{corrente ? " (attuale)" : ""}</span>
                  {data && <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground"><Check className="h-3 w-3 text-emerald-600" aria-hidden="true" />{data}</span>}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">Ultimi cambi</DropdownMenuLabel>
            {statusHistory.length === 0
              ? <p className="px-2 pb-1 text-xs text-muted-foreground">Nessun cambio registrato</p>
              : statusHistory.slice(0, CAMBI_NEL_MENU).map((v, i) => (
                <p key={v.id} className="px-2 pb-1 text-xs text-muted-foreground">
                  {formatoData(v.changed_at)} · {v.status?.name ?? "Stato eliminato"}{i === 0 && ultimoAutore ? ` · ${ultimoAutore}` : ""}
                </p>
              ))}
            <DropdownMenuItem asChild className="text-xs font-medium text-primary">
              <Link to={`/azienda/ordini/${orderId}/diario`}>Registro attività: chi ha fatto cosa</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <p className="flex items-start gap-2 text-sm font-semibold text-slate-900 sm:text-base">{etichetta}</p>
      )}
      {posizione >= 0 && (
        <>
          <p className="mt-1 text-xs text-muted-foreground">Fase {posizione + 1} di {percorso.length}</p>
          <span role="progressbar" aria-label="Fase della commessa" aria-valuenow={posizione + 1} aria-valuemin={1} aria-valuemax={percorso.length} className="mt-2 block h-1 overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full rounded-full" style={{ width: `${((posizione + 1) / percorso.length) * 100}%`, backgroundColor: colore }} />
          </span>
        </>
      )}
      {proposto && (
        <button type="button" onClick={() => cambia?.(proposto.id)} className="mt-2 text-left text-xs font-medium text-primary underline-offset-2 hover:underline">
          Lavorazioni finite: passa a «{proposto.name}»
        </button>
      )}
    </div>
  );
}
