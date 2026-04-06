/**
 * Lista documenti per un singolo operaio con stato scadenza a semaforo.
 * Usato sia nel pannello admin (per singolo operaio) sia nell'area campo/tecnico.
 */
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Plus, Download, Trash2, FileText, Loader2, AlertTriangle, ShieldCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDocumentiOperaio, useEliminaDocumento, getSignedUrl,
} from "@/hooks/useDocumentiOperaio";
import { DocumentoScadenzaForm } from "./DocumentoScadenzaForm";
import { statoColor, statoLabel, giorniAllaScadenza } from "@/types/documenti";
import type { DocumentoOperaio, StatoScadenza } from "@/types/documenti";

// ── Icona stato ───────────────────────────────────────────────────────────────
function StatoIcon({ stato }: { stato: StatoScadenza }) {
  switch (stato) {
    case "scaduto":      return <AlertTriangle className="h-3.5 w-3.5 text-red-600" />;
    case "in_scadenza":  return <Clock className="h-3.5 w-3.5 text-amber-600" />;
    case "valido":       return <ShieldCheck className="h-3.5 w-3.5 text-green-600" />;
    case "senza_scadenza": return <FileText className="h-3.5 w-3.5 text-slate-400" />;
  }
}

// ── Riga documento ────────────────────────────────────────────────────────────
function DocumentoRow({
  doc,
  canDelete,
  onDelete,
}: {
  doc: DocumentoOperaio;
  canDelete: boolean;
  onDelete: (id: string, filePath: string) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const giorni = giorniAllaScadenza(doc.data_scadenza);

  const handleDownload = async () => {
    setDownloading(true);
    const url = await getSignedUrl(doc.file_path);
    if (url) window.open(url, "_blank");
    setDownloading(false);
  };

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/20 transition-colors">
      <FileText className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium truncate">{doc.tipo?.nome ?? "Documento"}</p>
          <Badge
            variant="outline"
            className={`text-[10px] py-0 px-1.5 flex items-center gap-1 ${statoColor(doc.stato)}`}
          >
            <StatoIcon stato={doc.stato} />
            {statoLabel(doc.stato)}
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground truncate mt-0.5">{doc.nome_file}</p>

        <div className="flex items-center gap-3 mt-1">
          {doc.data_scadenza && (
            <span className="text-xs text-muted-foreground">
              Scade: {format(parseISO(doc.data_scadenza), "d MMM yyyy", { locale: it })}
              {giorni !== null && giorni >= 0 && (
                <span className={`ml-1 font-medium ${giorni <= 30 ? "text-amber-600" : "text-muted-foreground"}`}>
                  ({giorni === 0 ? "oggi" : `tra ${giorni}gg`})
                </span>
              )}
              {giorni !== null && giorni < 0 && (
                <span className="ml-1 font-medium text-red-600">
                  (scaduto {Math.abs(giorni)}gg fa)
                </span>
              )}
            </span>
          )}
          {doc.data_emissione && (
            <span className="text-xs text-muted-foreground">
              Emesso: {format(parseISO(doc.data_emissione), "d MMM yyyy", { locale: it })}
            </span>
          )}
        </div>

        {doc.note && (
          <p className="text-xs text-muted-foreground mt-1 italic">{doc.note}</p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleDownload} disabled={downloading}>
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        </Button>

        {canDelete && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Elimina documento</AlertDialogTitle>
                <AlertDialogDescription>
                  Eliminerai definitivamente "{doc.nome_file}". L'operazione non è reversibile.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700"
                  onClick={() => onDelete(doc.id, doc.file_path)}
                >
                  Elimina
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}

// ── Componente principale ──────────────────────────────────────────────────────
interface DocumentiOperaioTabProps {
  operaioId: string;
  canUpload?: boolean;
  canDelete?: boolean;
  compact?: boolean;
}

export function DocumentiOperaioTab({
  operaioId,
  canUpload = true,
  canDelete = true,
  compact = false,
}: DocumentiOperaioTabProps) {
  const { data: documenti = [], isLoading } = useDocumentiOperaio(operaioId);
  const elimina = useEliminaDocumento(operaioId);
  const [showForm, setShowForm] = useState(false);

  const scaduti     = documenti.filter(d => d.stato === "scaduto");
  const in_scadenza = documenti.filter(d => d.stato === "in_scadenza");
  const validi      = documenti.filter(d => d.stato === "valido" || d.stato === "senza_scadenza");

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      {!compact && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">Documenti operaio</p>
            {scaduti.length > 0 && (
              <Badge variant="outline" className="border-red-300 text-red-600 bg-red-50 text-[10px]">
                {scaduti.length} scadutt{scaduti.length > 1 ? "i" : "o"}
              </Badge>
            )}
            {in_scadenza.length > 0 && (
              <Badge variant="outline" className="border-amber-300 text-amber-600 bg-amber-50 text-[10px]">
                {in_scadenza.length} in scadenza
              </Badge>
            )}
          </div>
          {canUpload && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Carica
            </Button>
          )}
        </div>
      )}

      {/* Lista */}
      {documenti.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Nessun documento</p>
          <p className="text-xs text-muted-foreground mt-1">
            Carica patente, visita medica, corsi sicurezza e altri documenti
          </p>
          {canUpload && (
            <Button size="sm" className="mt-3" onClick={() => setShowForm(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Aggiungi documento
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Sezione scaduti */}
          {scaduti.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide px-1">
                Scaduti ({scaduti.length})
              </p>
              {scaduti.map(d => (
                <DocumentoRow
                  key={d.id} doc={d} canDelete={canDelete}
                  onDelete={(id, path) => elimina.mutate({ id, filePath: path })}
                />
              ))}
            </div>
          )}

          {/* Sezione in scadenza */}
          {in_scadenza.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide px-1">
                In scadenza ({in_scadenza.length})
              </p>
              {in_scadenza.map(d => (
                <DocumentoRow
                  key={d.id} doc={d} canDelete={canDelete}
                  onDelete={(id, path) => elimina.mutate({ id, filePath: path })}
                />
              ))}
            </div>
          )}

          {/* Sezione validi */}
          {validi.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-green-600 uppercase tracking-wide px-1">
                Validi ({validi.length})
              </p>
              {validi.map(d => (
                <DocumentoRow
                  key={d.id} doc={d} canDelete={canDelete}
                  onDelete={(id, path) => elimina.mutate({ id, filePath: path })}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upload button compatto */}
      {compact && canUpload && documenti.length > 0 && (
        <Button size="sm" variant="outline" className="w-full" onClick={() => setShowForm(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Aggiungi documento
        </Button>
      )}

      {/* Form upload */}
      {showForm && (
        <DocumentoScadenzaForm
          operaioId={operaioId}
          open={showForm}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
