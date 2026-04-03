import { useNavigate } from "react-router-dom";
import { ChevronRight, Copy, FileDown, Loader2, Pencil, TrendingUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface OrdineDetailHeaderProps {
  ordineId: string;
  orderCode: string;
  descrizione: string;
  dataCreazione: string;
  nomeCliente: string;
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
  onDuplica,
  onModifica,
  onNuovoSAL,
  onElimina,
  onDownloadPDF,
  isGeneratingPDF = false,
}: OrdineDetailHeaderProps) {
  const navigate = useNavigate();
  return (
    <div className="bg-white border-b border-gray-100 px-6 py-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-gray-400 mb-2">
        <span
          className="cursor-pointer hover:text-gray-600"
          onClick={() => navigate("/azienda/ordini")}
        >
          Ordini
        </span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-gray-600">{orderCode}</span>
      </div>
      {/* Title row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-medium text-gray-900">
            {descrizione || "Ordine senza descrizione"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Creato il{" "}
            {format(new Date(dataCreazione), "dd MMM yyyy", { locale: it })} ·{" "}
            {nomeCliente}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
          <Button
            size="sm"
            onClick={onNuovoSAL}
            className="text-xs bg-orange-500 hover:bg-orange-600 text-white border-0"
          >
            <TrendingUp className="h-3.5 w-3.5 mr-1" />+ SAL
          </Button>
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
