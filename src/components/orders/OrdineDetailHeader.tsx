import { useNavigate } from "react-router-dom";
import { BookOpen, ChevronRight, Copy, FileDown, HardHat, Loader2, Pencil, TrendingUp, Trash2, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuotePrimaryButton } from "@/components/marketing/preventivi/ui/builderUI";
import { format } from "date-fns";
import { it } from "date-fns/locale";

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
  onNuovoSAL: () => void;
  onElimina: () => void;
  onDownloadPDF?: () => void;
  isGeneratingPDF?: boolean;
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
  onNuovoSAL,
  onElimina,
  onDownloadPDF,
  isGeneratingPDF = false,
}: OrdineDetailHeaderProps) {
  const isAppaltatoreLavoro = orderType === "appaltatore_lavoro";
  const navigate = useNavigate();
  return (
    <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-slate-400 mb-3 flex-wrap">
        <span
          className="cursor-pointer hover:text-orange-500 font-medium"
          onClick={() => navigate("/azienda/ordini")}
        >
          Ordini
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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {descrizione || "Ordine senza descrizione"}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Creato il{" "}
              {(() => { try { return format(new Date(dataCreazione), "dd MMM yyyy", { locale: it }); } catch { return "—"; } })()} ·{" "}
              <span className="font-medium text-slate-700">{nomeCliente}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/azienda/ordini/${ordineId}/diario`)}
            className="text-xs text-orange-600 border-orange-200 hover:bg-orange-50 hover:text-orange-700"
          >
            <BookOpen className="h-3.5 w-3.5 mr-1" />
            Diario Ordine
          </Button>
          {onDownloadPDF && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDownloadPDF}
              disabled={isGeneratingPDF}
              className="text-xs"
            >
              {isGeneratingPDF ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <FileDown className="h-3.5 w-3.5 mr-1" />
              )}
              Scarica PDF
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onDuplica}
            className="text-xs"
          >
            <Copy className="h-3.5 w-3.5 mr-1" />
            Duplica
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onModifica}
            className="text-xs"
          >
            <Pencil className="h-3.5 w-3.5 mr-1" />
            Modifica
          </Button>
          <QuotePrimaryButton
            size="sm"
            onClick={onNuovoSAL}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            + SAL
          </QuotePrimaryButton>
          <Button
            variant="outline"
            size="sm"
            onClick={onElimina}
            className="text-xs text-red-600 border-red-200 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
