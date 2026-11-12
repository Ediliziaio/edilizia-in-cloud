import "./commessa-workspace.css";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Banknote, ChevronRight, HardHat, Pencil, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuotePrimaryButton } from "@/components/marketing/preventivi/ui/builderUI";
import { format } from "date-fns";
import { it } from "date-fns/locale";

import { useIsMobile } from "@/hooks/use-mobile";
interface OrdineDetailHeaderProps {
  orderCode: string;
  descrizione: string;
  dataCreazione: string;
  nomeCliente: string;
  referente?: string;
  /** Tipo ordine: 'appaltatore_lavoro' mostra badge dedicato. */
  orderType?: "cliente" | "appaltatore_lavoro" | null;
  onModifica: () => void;
  onRegistraIncasso: () => void;
  /** Le altre voci (registro, PDF, duplica, elimina) stanno in «Altre azioni». */
  canEdit?: boolean;
  /**
   * Telefono (06/10/2026): le icone delle azioni rapide (attività, documenti,
   * altro) nella fila di «Registra incasso», invece di una fila a parte.
   */
  azioniTelefono?: ReactNode;
}

export function OrdineDetailHeader({
  orderCode,
  descrizione,
  dataCreazione,
  nomeCliente,
  referente,
  orderType,
  onModifica,
  onRegistraIncasso,
  canEdit = true,
  azioniTelefono,
}: OrdineDetailHeaderProps) {
  const isMobile = useIsMobile();
  const isAppaltatoreLavoro = orderType === "appaltatore_lavoro";
  const navigate = useNavigate();
  return (
    <header className="commessa-detail-header border-b border-slate-200 bg-white px-3 py-3 sm:px-6">
      {/* Breadcrumb (mobile no: la freccia indietro dell'app c'è già, e il
          codice sta nella riga sotto il titolo) */}
      <div className="hidden sm:flex items-center gap-1 text-xs text-slate-500 mb-2 flex-wrap">
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
      <div className="commessa-heading-row">
        <div className="commessa-heading-copy flex items-start gap-3 min-w-0">
          <div className="commessa-heading-icon hidden sm:flex">
            <ClipboardList className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="commessa-heading-title">
              {descrizione || "Commessa senza descrizione"}
            </h1>
            {/* Da telefono codice e cliente dividono la riga con le icone: una fila in meno. */}
            <div className="mt-0.5 flex items-center gap-2">
              <p className="min-w-0 flex-1 break-words text-xs text-slate-500 sm:text-sm">
                <span className="sm:hidden font-mono font-semibold text-slate-600">{orderCode} · </span>
                <span className="max-sm:hidden">{(() => { try { return format(new Date(dataCreazione), "dd MMM yyyy", { locale: it }); } catch { return "—"; } })()} · </span>
                <span className="font-medium text-slate-700">{nomeCliente}</span>
              </p>
              {isMobile && azioniTelefono && <div className="flex shrink-0 items-center gap-1.5">{azioniTelefono}</div>}
            </div>
            {referente?.trim() && referente.trim() !== nomeCliente.trim() && <p className="mt-1 text-xs text-slate-500">Referente: {referente}</p>}
          </div>
        </div>
        {!isMobile && <div className="commessa-page-actions">
          {/* Primary: Registra incasso — sempre visibile, porta al piano rate */}
          {/* Da telefono no: gli incassi si registrano da Economia. */}
          {!isMobile && (
            <QuotePrimaryButton
              size="sm"
              onClick={onRegistraIncasso}
              className="commessa-primary-action tap-compact whitespace-nowrap"
            >
              <Banknote className="h-3.5 w-3.5" />
              Registra incasso
            </QuotePrimaryButton>
          )}
          {/* Modifica — icona sola su mobile (il CTA incasso prende la larghezza),
              testo su desktop. Visibile solo se canEdit. */}
          {canEdit && !isMobile && (
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
        </div>}
      </div>
    </header>
  );
}
