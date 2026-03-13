import { useEffect, useRef, useMemo } from "react";
import { useParams, useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { Loader2, AlertTriangle } from "lucide-react";
import {
  useDocumentoFiscale,
  useCreateDocumento,
  useEmittiDocumento,
  useDeleteDocumento,
} from "@/hooks/useDocumentiFiscali";
import { useEditorState } from "./editor/useEditorState";
import { validateDocumento } from "@/lib/fatturazione/calcoli";
import { EditorTopBar } from "./editor/EditorTopBar";
import { EditorClienteSection } from "./editor/EditorClienteSection";
import { EditorDatiDocumento } from "./editor/EditorDatiDocumento";
import { EditorRigheSection } from "./editor/EditorRigheSection";
import { EditorTotaliSection } from "./editor/EditorTotaliSection";
import { EditorPagamentoSection } from "./editor/EditorPagamentoSection";
import { EditorNoteSection } from "./editor/EditorNoteSection";
import { EditorPreviewPanel } from "./editor/EditorPreviewPanel";
import { EditorDDTSection } from "./editor/EditorDDTSection";
import { EditorOrdineSection } from "./editor/EditorOrdineSection";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TipoDocumento, DocumentoFiscale } from "@/types/fatturazione";

export default function EditorDocumento() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isCreate = !id;
  const createdRef = useRef(false);

  const location = useLocation();
  const prefilled = (location.state as { prefilled?: Partial<DocumentoFiscale> } | null)?.prefilled;
  const tipoParam = (searchParams.get("tipo") ?? "fattura") as TipoDocumento;
  const createMutation = useCreateDocumento();
  const { data: loadedDoc, isLoading } = useDocumentoFiscale(id);
  const emittiMutation = useEmittiDocumento();
  const deleteMutation = useDeleteDocumento();

  // Auto-create on mount for /nuovo
  useEffect(() => {
    if (isCreate && !createdRef.current) {
      createdRef.current = true;
      createMutation.mutate(
        { tipo: tipoParam, ...prefilled },
        {
          onSuccess: (doc) => {
            navigate(`/azienda/documenti/${doc.id}`, { replace: true });
          },
        }
      );
    }
  }, [isCreate, tipoParam, createMutation, navigate]);

  const { state, dispatch, isSaving, lastSaved } = useEditorState(loadedDoc);
  const isBozza = state.stato === "bozza";

  const validationErrors = useMemo(
    () => validateDocumento(state),
    [state]
  );
  const criticalErrorCount = validationErrors.filter((e) => e.severity === "error").length;

  if (isCreate || isLoading || !state._initialized) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <EditorTopBar
        state={state}
        isSaving={isSaving}
        lastSaved={lastSaved}
        onEmetti={() => state.id && emittiMutation.mutate(state.id)}
        onDelete={() => {
          if (state.id && confirm("Eliminare questa bozza?")) {
            deleteMutation.mutate(state.id, {
              onSuccess: () => navigate("/azienda/documenti"),
            });
          }
        }}
        onFieldChange={(field, value) => dispatch({ type: "SET_FIELD", field, value })}
        validationErrorCount={criticalErrorCount}
      />

      <div className="flex flex-1 min-h-0">
        {/* Left panel: continuous scroll form */}
        <ScrollArea className="w-1/2 border-r">
          <div className="p-4 space-y-4 pb-8">
            {/* NC banner */}
            {state.tipo === "nota_credito" && state.documento_correlato_id && (
              <div className="flex items-start gap-3 p-3 rounded-md bg-amber-50 border border-amber-200 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-amber-800">
                    Nota di Credito
                  </p>
                  <p className="text-amber-700 text-xs mt-0.5">
                    {state.note_documento}
                  </p>
                  <div className="mt-2">
                    <Select
                      value={(state as any)._motivo_nc ?? ""}
                      onValueChange={(v) => dispatch({ type: "SET_FIELD", field: "_motivo_nc" as any, value: v })}
                      disabled={!isBozza}
                    >
                      <SelectTrigger className="h-8 w-48">
                        <SelectValue placeholder="Motivo storno" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="reso">Reso</SelectItem>
                        <SelectItem value="annullamento">Annullamento</SelectItem>
                        <SelectItem value="errore">Errore</SelectItem>
                        <SelectItem value="sconto_postvendita">Sconto post-vendita</SelectItem>
                        <SelectItem value="altro">Altro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            <EditorClienteSection state={state} dispatch={dispatch} disabled={!isBozza} />
            <EditorDatiDocumento state={state} dispatch={dispatch} disabled={!isBozza} />

            {/* DDT-specific sections */}
            {state.tipo === "ddt" && (
              <EditorDDTSection state={state} dispatch={dispatch} disabled={!isBozza} />
            )}

            <EditorRigheSection state={state} dispatch={dispatch} disabled={!isBozza} />
            <EditorTotaliSection state={state} dispatch={dispatch} disabled={!isBozza} />
            <EditorPagamentoSection state={state} dispatch={dispatch} disabled={!isBozza} />
            <EditorNoteSection state={state} dispatch={dispatch} disabled={!isBozza} />
          </div>
        </ScrollArea>

        {/* Right panel: preview */}
        <div className="w-1/2">
          <EditorPreviewPanel state={state} />
        </div>
      </div>
    </div>
  );
}
