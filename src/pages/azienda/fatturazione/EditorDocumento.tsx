import { useEffect, useRef } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import {
  useDocumentoFiscale,
  useCreateDocumento,
  useEmittiDocumento,
  useDeleteDocumento,
} from "@/hooks/useDocumentiFiscali";
import { useEditorState } from "./editor/useEditorState";
import { EditorTopBar } from "./editor/EditorTopBar";
import { EditorClienteSection } from "./editor/EditorClienteSection";
import { EditorRigheSection } from "./editor/EditorRigheSection";
import { EditorTotaliSection } from "./editor/EditorTotaliSection";
import { EditorPagamentoSection } from "./editor/EditorPagamentoSection";
import { EditorNoteSection } from "./editor/EditorNoteSection";
import { EditorPreviewPanel } from "./editor/EditorPreviewPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
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

  if (isCreate || isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!state._initialized) {
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
      />

      <div className="flex flex-1 min-h-0">
        {/* Left panel: form */}
        <ScrollArea className="w-1/2 border-r">
          <div className="p-4 space-y-6">
            <Tabs defaultValue="cliente" className="w-full">
              <TabsList className="w-full grid grid-cols-4 h-8">
                <TabsTrigger value="cliente" className="text-xs">Cliente</TabsTrigger>
                <TabsTrigger value="righe" className="text-xs">Righe</TabsTrigger>
                <TabsTrigger value="pagamento" className="text-xs">Pagamento</TabsTrigger>
                <TabsTrigger value="note" className="text-xs">Note</TabsTrigger>
              </TabsList>

              <TabsContent value="cliente" className="mt-4">
                <EditorClienteSection state={state} dispatch={dispatch} disabled={!isBozza} />
              </TabsContent>

              <TabsContent value="righe" className="mt-4 space-y-4">
                <EditorRigheSection state={state} dispatch={dispatch} disabled={!isBozza} />
                <EditorTotaliSection state={state} dispatch={dispatch} disabled={!isBozza} />
              </TabsContent>

              <TabsContent value="pagamento" className="mt-4">
                <EditorPagamentoSection state={state} dispatch={dispatch} disabled={!isBozza} />
              </TabsContent>

              <TabsContent value="note" className="mt-4">
                <EditorNoteSection state={state} dispatch={dispatch} disabled={!isBozza} />
              </TabsContent>
            </Tabs>
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
