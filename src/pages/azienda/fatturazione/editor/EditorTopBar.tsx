import { ArrowLeft, Check, Clock, Loader2, Send, Trash2, MoreHorizontal, Copy, Download, Eye, AlertCircle, Mail, Printer, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatRelativeTime } from "@/lib/formatters";
import type { EditorState } from "./useEditorState";
import type { TipoDocumento, StatoDocumento } from "@/types/fatturazione";
import type { Company } from "@/types/auth";

const TIPO_LABELS: Record<string, string> = {
  fattura: "Fattura",
  fattura_pa: "Fattura PA",
  nota_credito: "Nota di Credito",
  nota_debito: "Nota di Debito",
  autofattura: "Autofattura",
  fattura_riepilogativa: "Fatt. Riepilogativa",
  proforma: "Proforma",
  preventivo: "Preventivo",
  ddt: "DDT",
  parcella: "Parcella",
  fattura_accompagnatoria: "Fatt. Accompagnatoria",
  integrazione_servizi_estero: "TD17",
  integrazione_beni_ue: "TD18",
  integrazione_beni_extra_ue: "TD19",
  acconto_fattura: "Acconto Fattura (TD02)",
  acconto_parcella: "Acconto Parcella (TD03)",
  reverse_charge_interno: "RC Interno (TD16)",
  autofattura_splafonamento: "Autofattura Splafonamento (TD21)",
  fattura_differita_b: "Fatt. Differita lett.b (TD25)",
  autoconsumo: "Autoconsumo (TD27)",
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

// Tipi documento che possono essere inviati al SDI
const TIPI_SDI = ["fattura", "fattura_pa", "nota_credito", "nota_debito", "autofattura",
  "fattura_riepilogativa", "parcella", "fattura_accompagnatoria",
  "integrazione_servizi_estero", "integrazione_beni_ue", "integrazione_beni_extra_ue",
  "acconto_fattura", "acconto_parcella", "reverse_charge_interno",
  "autofattura_splafonamento", "fattura_differita_b", "autoconsumo"];

const TIPO_TO_TD: Record<string, string> = {
  fattura: "TD01", fattura_pa: "TD01", nota_credito: "TD04", nota_debito: "TD05",
  autofattura: "TD20", fattura_riepilogativa: "TD24", ddt: "TD24",
  fattura_accompagnatoria: "TD24", parcella: "TD06",
  integrazione_servizi_estero: "TD17", integrazione_beni_ue: "TD18", integrazione_beni_extra_ue: "TD19",
  acconto_fattura: "TD02", acconto_parcella: "TD03",
  reverse_charge_interno: "TD16", autofattura_splafonamento: "TD21",
  fattura_differita_b: "TD25", autoconsumo: "TD27",
};

interface ValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

interface Props {
  state: EditorState;
  isSaving: boolean;
  lastSaved: Date | null;
  onEmetti: () => void;
  onDelete: () => void;
  onFieldChange: (field: string, value: unknown) => void;
  validationErrorCount?: number;
  validationErrors?: ValidationError[];
  onPreview?: () => void;
  onBack?: () => void;
  onInviaSDI?: () => void;
  onDownloadPDF?: () => void;
  onSendEmail?: () => void;
  onDuplicate?: () => void;
  onConvertToFattura?: () => void;
  isInviaSDILoading?: boolean;
  isConvertLoading?: boolean;
}

export function EditorTopBar({
  state, isSaving, lastSaved, onEmetti, onDelete, validationErrorCount, validationErrors,
  onPreview, onBack, onInviaSDI, onDownloadPDF, onSendEmail, onDuplicate, onConvertToFattura,
  isInviaSDILoading, isConvertLoading,
}: Props) {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const tipo = state.tipo as TipoDocumento;
  const isBozza = state.stato === "bozza";
  const isEmessa = state.stato === "emessa";
  const canInviaSDI = isEmessa && TIPI_SDI.includes(state.tipo);
  const statoConfig = STATO_CONFIG[(state.stato as StatoDocumento) ?? "bozza"] ?? STATO_CONFIG.bozza;
  const companyLogo = (effectiveCompany as Company | null)?.logo_url;

  return (
    <>
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b bg-card shadow-sm shrink-0">
        {/* Back */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          onClick={() => onBack ? onBack() : navigate("/azienda/documenti")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {/* Company logo */}
        {companyLogo && (
          <img
            src={companyLogo}
            alt="Logo"
            className="h-6 object-contain shrink-0"
          />
        )}

        {/* Doc type + number */}
        <div className="flex items-center gap-2.5 min-w-0">
          <Badge variant="outline" className="font-semibold text-xs uppercase tracking-wide border-primary/30 text-primary">
            {TIPO_LABELS[tipo] ?? tipo}
          </Badge>
          {TIPO_TO_TD[tipo] && (
            <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 h-5 text-muted-foreground">
              {TIPO_TO_TD[tipo]}
            </Badge>
          )}

          {state.numero && (
            <span className="font-mono text-base font-bold text-foreground tracking-tight">
              {state.numero}
            </span>
          )}

          <Badge
            variant={statoConfig.variant}
            className={`text-[11px] font-medium ${
              state.stato === "pagata"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200"
                : ""
            }`}
          >
            {statoConfig.label}
          </Badge>
        </div>

        {/* Center spacer + autosave indicator */}
        <div className="ml-auto flex items-center gap-3">
          {/* Validation error count pill with details popover */}
          {(validationErrorCount ?? 0) > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors cursor-pointer">
                  <AlertCircle className="h-3 w-3" />
                  <span>{validationErrorCount} {validationErrorCount === 1 ? "errore" : "errori"}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" align="end">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Errori di validazione</p>
                <div className="space-y-1.5 max-h-48 overflow-auto">
                  {(validationErrors ?? []).map((e, i) => (
                    <div key={i} className={`flex items-start gap-1.5 text-xs ${e.severity === "error" ? "text-destructive" : "text-amber-600"}`}>
                      <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>{e.message}</span>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Autosave indicator */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {isSaving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="hidden sm:inline">Salvataggio...</span>
              </>
            ) : lastSaved ? (
              <>
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="hidden sm:inline">Salvata {formatRelativeTime(lastSaved)}</span>
              </>
            ) : (
              <>
                <Clock className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Non salvata</span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 border-l pl-3 ml-1">
          {/* Preview button */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={onPreview}
          >
            <Eye className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Anteprima</span>
          </Button>

          {/* Email — always visible */}
          {onSendEmail && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 hidden md:flex"
              onClick={onSendEmail}
            >
              <Mail className="h-3.5 w-3.5" />
              <span>Email</span>
            </Button>
          )}

          {/* Post-emission actions: PDF, Stampa */}
          {!isBozza && onDownloadPDF && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 hidden md:flex"
              onClick={onDownloadPDF}
            >
              <Download className="h-3.5 w-3.5" />
              <span>PDF</span>
            </Button>
          )}

          {/* More menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="h-3.5 w-3.5 mr-2" />
                Duplica
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDownloadPDF}>
                <Download className="h-3.5 w-3.5 mr-2" />
                Scarica PDF
              </DropdownMenuItem>
              {onSendEmail && (
                <DropdownMenuItem onClick={onSendEmail}>
                  <Mail className="h-3.5 w-3.5 mr-2" />
                  Invia per email
                </DropdownMenuItem>
              )}
              {!isBozza && (
                <DropdownMenuItem onClick={() => window.print()}>
                  <Printer className="h-3.5 w-3.5 mr-2" />
                  Stampa
                </DropdownMenuItem>
              )}
              {!isBozza && !["proforma", "preventivo", "ddt"].includes(state.tipo) && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <FileText className="h-3.5 w-3.5 mr-2" />
                    Esporta XML
                  </DropdownMenuItem>
                </>
              )}
              {["proforma", "preventivo"].includes(state.tipo) && state.stato !== "annullata" && onConvertToFattura && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-emerald-600 font-medium"
                    onClick={onConvertToFattura}
                    disabled={isConvertLoading}
                  >
                    <FileText className="h-3.5 w-3.5 mr-2" />
                    {isConvertLoading ? "Conversione..." : "Converti in Fattura"}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {isBozza && (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive/80 h-8 text-xs gap-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">Elimina</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Eliminare questa bozza?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {TIPO_LABELS[tipo] ?? tipo} N° {state.numero} verrà eliminata. Questa azione non può essere annullata.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Elimina bozza
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 shadow-sm"
                    disabled={(validationErrorCount ?? 0) > 0}
                  >
                    <Check className="h-3.5 w-3.5" />
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

          {/* Converti in Fattura — visibile per proforma/preventivo emesse */}
          {!isBozza && ["proforma", "preventivo"].includes(state.tipo) && state.stato !== "annullata" && onConvertToFattura && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  className="h-8 gap-1.5 shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={isConvertLoading}
                >
                  {isConvertLoading
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <FileText className="h-3.5 w-3.5" />
                  }
                  <span className="hidden sm:inline">Converti in Fattura</span>
                  <span className="sm:hidden">Fattura</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Convertire in fattura?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Verrà creata una nuova fattura con gli stessi dati di {TIPO_LABELS[tipo] ?? tipo} N° {state.numero}.
                    Il documento originale verrà segnato come annullato.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction onClick={onConvertToFattura} className="bg-emerald-600 hover:bg-emerald-700">
                    Converti in Fattura
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Bottone Invia a SDI — visibile solo quando emessa e tipo SDI */}
          {canInviaSDI && onInviaSDI && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  className="h-8 gap-1.5 shadow-sm bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={isInviaSDILoading}
                >
                  {isInviaSDILoading
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Send className="h-3.5 w-3.5" />
                  }
                  <span className="hidden sm:inline">Invia a SDI</span>
                  <span className="sm:hidden">SDI</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Conferma invio al Sistema di Interscambio</AlertDialogTitle>
                  <AlertDialogDescription>
                    Stai per inviare {TIPO_LABELS[tipo] ?? tipo} N° {state.numero} al SDI.
                    Una volta inviata, non potrà essere modificata. Confermi?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onInviaSDI}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Firma e invia
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* UX-01: Banner stato fattura elettronica post-emissione */}
      {canInviaSDI && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-900">
              Fattura elettronica: <strong>non firmata e non inviata al SDI</strong>
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Ti consigliamo di inviare il documento il prima possibile. Finché non viene inviata al SDI, non ha valore fiscale.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap shrink-0">
            <Button variant="outline" size="sm" className="h-8 text-xs bg-white border-amber-300 hover:bg-amber-50" onClick={onPreview}>
              <FileText className="h-3.5 w-3.5 mr-1" /> Visualizza XML
            </Button>
            {onDownloadPDF && (
              <Button variant="outline" size="sm" className="h-8 text-xs bg-white border-amber-300 hover:bg-amber-50" onClick={onDownloadPDF}>
                <Download className="h-3.5 w-3.5 mr-1" /> Esporta XML
              </Button>
            )}
            {onInviaSDI && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white gap-1"
                    disabled={isInviaSDILoading}
                  >
                    {isInviaSDILoading
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Send className="h-3.5 w-3.5" />
                    }
                    Firma e invia
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Conferma invio al Sistema di Interscambio</AlertDialogTitle>
                    <AlertDialogDescription>
                      Stai per inviare {TIPO_LABELS[tipo] ?? tipo} N° {state.numero} al SDI.
                      Una volta inviata, non potrà essere modificata. Confermi?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction onClick={onInviaSDI} className="bg-blue-600 hover:bg-blue-700">
                      Firma e invia
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      )}
    </>
  );
}
