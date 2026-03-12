import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import { PreviewFattura } from "@/components/fatturazione/PreviewFattura";
import type { EditorState } from "./useEditorState";

interface Props {
  state: EditorState;
}

export function EditorPreviewPanel({ state }: Props) {
  const { data: azienda } = useAnagraficaAzienda();

  return (
    <div className="h-full overflow-auto bg-muted/30 p-4">
      <PreviewFattura documento={state} azienda={azienda ?? null} scale={0.65} />
    </div>
  );
}
