import { useNavigate } from "react-router-dom";
import { Banknote, BookOpen, ChevronRight, Copy, FileDown, HardHat, Loader2, MoreVertical, Pencil, Trash2, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuotePrimaryButton } from "@/components/marketing/preventivi/ui/builderUI";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { it } from "date-fns/locale";

import { useIsMobile } from "@/hooks/use-mobile";
interface OrdineDetailHeaderProps {
  ordineId: string;
  orderCode: string;
  descrizione: string;
  dataCreazione: string;
  nomeCliente: string;
  /** Tipo ordine: 'appaltatore_lavoro' mostra badge dedicato. */
  orderType?: "cliente" | "appaltatore_lavoro" | null;
  onDuplica: () => void;
  onModifica: () => void;
  onRegistraIncasso: () => void;
  onElimina: () => void;
  onDownloadPDF?: () => void;
  isGeneratingPDF?: boolean;
  /**
   * 2026-05-27 (UX audit fix): permessi opzionali per nascondere le voci
   * distruttive quando l'utente non ha il diritto. Backward-compat: se
   * undefined, tutto è visibile (comportamento legacy admin).
   */
  canEdit?: boolean;
  canDelete?: boolean;
}

export function OrdineDetailHeader({
  ordineId,
  orderCode,
  descrizione,
  dataCreazione,
  nomeCliente,
  orderType,
  onDuplica,
  onModifica,
  onRegistraIncasso,
  onElimina,
  onDownloadPDF,
  isGeneratingPDF = false,
  canEdit = true,
  canDelete = true,
}: OrdineDetailHeaderProps) {
  const isMobile = useIsMobile();
  const isAppaltatoreLavoro = orderType === "appaltatore_lavoro";
  const navigate = useNavigate();
  return (
    <div className="bg-white border-b border-slate-200 px-3 sm:px-6 py-3 sm:py-5 max-sm:py-2.5">
      {/* Breadcrumb (mobile no: la freccia indietro dell'app c'è già, e il
          codice sta nella riga sotto il titolo) */}
      <div className="hidden sm:flex items-center gap-1 text-xs text-slate-400 mb-2 sm:mb-3 flex-wrap">
        <span
          className="cursor-pointer hover:text-orange-500 font-medium"
          onClick={() => navigate("/azienda/ordini")}
        >
          Commesse
        </span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-mono bg-slate-100 text-slate-800 font-semibold px-2 py-0.5 rounded text-[11px]">
          {orderCode}
        </span>
        {isAppaltatoreLavoro && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
            <HardHat className="h-2.5 w-2.5" />
            Lavoro per appaltatore
          </span>
        )}
      </div>
      {/* Title row */}
      <div className="flex items-start justify-between gap-3 sm:gap-4 flex-col sm:flex-row sm:flex-wrap max-sm:gap-2">
        <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 w-full sm:w-auto">
          <div className="hidden sm:flex h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
            <ClipboardList className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-2xl font-bold text-slate-900 tracking-tight leading-tight line-clamp-2 sm:line-clamp-none">
              {descrizione || "Commessa senza descrizione"}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5 truncate">
              <span className="sm:hidden font-mono font-semibold text-slate-600">{orderCode} · </span>
              {(() => { try { return format(new Date(dataCreazione), "dd MMM yyyy", { locale: it }); } catch { return "—"; } })()} ·{" "}
              <span className="font-medium text-slate-700">{nomeCliente}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap justify-end w-full sm:w-auto">
          {/* Primary: Registra incasso — sempre visibile, porta al piano rate */}
          <QuotePrimaryButton
            size="sm"
            onClick={onRegistraIncasso}
            className="tap-compact flex-1 sm:flex-none whitespace-nowrap max-sm:h-9"
          >
            <Banknote className="h-3.5 w-3.5" />
            Registra incasso
          </QuotePrimaryButton>
          {/* Modifica — icona sola su mobile (il CTA incasso prende la larghezza),
              testo su desktop. Visibile solo se canEdit. */}
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={onModifica}
              className="tap-compact text-xs shrink-0 w-9 px-0 sm:w-auto sm:px-3 max-sm:h-9"
              aria-label="Modifica commessa"
            >
              <Pencil className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Modifica</span>
            </Button>
          )}
          {/* Azioni secondarie nel menu ⋮, anche da tablet: prima sul desktop
              erano quattro bottoni in fila (Diario, Scarica PDF, Duplica,
              Elimina) accanto a «Registra incasso» e «Modifica». */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="tap-compact h-9 w-9"
                aria-label="Altre azioni commessa"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => navigate(`/azienda/ordini/${ordineId}/diario`)}>
                <BookOpen className="h-4 w-4 mr-2 text-orange-600" />
                Diario Commessa
              </DropdownMenuItem>
              {/* Niente export su telefono. */}
              {/* Niente export su telefono. */}
              {!isMobile && !isMobile && onDownloadPDF && (
                <DropdownMenuItem onClick={onDownloadPDF} disabled={isGeneratingPDF}>
                  {isGeneratingPDF ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
                  Scarica PDF
                </DropdownMenuItem>
              )}
              {canEdit && (
                <DropdownMenuItem onClick={onDuplica}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplica
                </DropdownMenuItem>
              )}
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onElimina} className="text-red-600 focus:text-red-700">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Elimina
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
