import { useEffect, useRef, useMemo } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TipoDocumento } from "@/types/fatturazione";

export default function EditorDocumento() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isCreate = !id;
  const createdRef = useRef(false);

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
        { tipo: tipoParam },
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
            <EditorClienteSection state={state} dispatch={dispatch} disabled={!isBozza} />
            <EditorDatiDocumento state={state} dispatch={dispatch} disabled={!isBozza} />
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
