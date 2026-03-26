import { ArrowLeft, Check, Clock, Loader2, Send, Trash2, MoreHorizontal, Copy, Download, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatRelativeTime } from "@/lib/formatters";
import type { EditorState } from "./useEditorState";
import type { TipoDocumento, StatoDocumento } from "@/types/fatturazione";

const TIPO_LABELS: Record<TipoDocumento, string> = {
  fattura: "Fattura",
  fattura_pa: "Fattura PA",
  nota_credito: "Nota di Credito",
  nota_debito: "Nota di Debito",
  autofattura: "Autofattura",
  fattura_riepilogativa: "Fatt. Riepilogativa",
  proforma: "Proforma",
  preventivo: "Preventivo",
  ddt: "DDT",
};

const STATO_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  bozza: { label: "Bozza", variant: "secondary" },
  emessa: { label: "Emessa", variant: "default" },
  inviata_sdi: { label: "Inviata SDI", variant: "default" },
  consegnata: { label: "Consegnata", variant: "default" },
  accettata: { label: "Accettata", variant: "default" },
  rifiutata: { label: "Rifiutata", variant: "destructive" },
  scaduta: { label: "Scaduta", variant: "destructive" },
  pagata: { label: "Pagata", variant: "default" },
  parzialmente_pagata: { label: "Parz. Pagata", variant: "outline" },
  stornata: { label: "Stornata", variant: "secondary" },
  annullata: { label: "Annullata", variant: "secondary" },
};

interface Props {
  state: EditorState;
  isSaving: boolean;
  lastSaved: Date | null;
  onEmetti: () => void;
  onDelete: () => void;
  onFieldChange: (field: string, value: unknown) => void;
  validationErrorCount?: number;
}

export function EditorTopBar({ state, isSaving, lastSaved, onEmetti, onDelete, validationErrorCount }: Props) {
  const navigate = useNavigate();
  const tipo = state.tipo as TipoDocumento;
  const isBozza = state.stato === "bozza";
  const statoConfig = STATO_CONFIG[(state.stato as StatoDocumento) ?? "bozza"] ?? STATO_CONFIG.bozza;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-card shrink-0 h-14">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 hidden md:inline-flex"
        onClick={() => navigate("/azienda/documenti")}
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <Badge variant="outline" className="font-semibold text-xs uppercase tracking-wide">
        {TIPO_LABELS[tipo] ?? tipo}
      </Badge>

      {state.numero && (
        <span className="font-mono text-sm font-medium bg-primary/10 text-primary px-2 py-0.5 rounded">
          {state.numero}
        </span>
      )}

      <Badge variant={statoConfig.variant} className="text-xs">
        {statoConfig.label}
      </Badge>

      <div className="ml-auto flex items-center gap-2">
        {/* Autosave indicator */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {isSaving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Salvataggio...</span>
            </>
          ) : lastSaved ? (
            <>
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Salvata {formatRelativeTime(lastSaved)}</span>
            </>
          ) : (
            <>
              <Clock className="h-3 w-3" />
              <span>Non salvata</span>
            </>
          )}
        </div>

        {/* More menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Copy className="h-3.5 w-3.5 mr-2" />
              Duplica
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Download className="h-3.5 w-3.5 mr-2" />
              Scarica PDF
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Eye className="h-3.5 w-3.5 mr-2" />
              Anteprima fullscreen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {isBozza && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive h-8"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Elimina
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" className="h-8" disabled={(validationErrorCount ?? 0) > 0}>
                  <Send className="h-3.5 w-3.5 mr-1" />
                  Emetti
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Emetti documento</AlertDialogTitle>
                  <AlertDialogDescription>
                    Emetti {TIPO_LABELS[tipo] ?? tipo} N° {state.numero}?
                    Questa azione non può essere annullata.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction onClick={onEmetti}>
                    Emetti documento
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
    </div>
  );
}
