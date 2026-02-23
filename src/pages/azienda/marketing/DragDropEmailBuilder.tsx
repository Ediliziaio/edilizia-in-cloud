import { useState, useCallback, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { BuilderBlock, createBlock, type BlockType, type ColumnLayout } from "@/components/email-builder/builderTypes";
import { generateEmailHtml } from "@/components/email-builder/builderHtmlGenerator";
import { BuilderSidebar } from "@/components/email-builder/BuilderSidebar";
import { BuilderCanvas } from "@/components/email-builder/BuilderCanvas";
import { BuilderPropertiesPanel } from "@/components/email-builder/BuilderPropertiesPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Save, Eye, Send, Pencil, Check, Monitor, Tablet, Smartphone, Loader2 } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

const PREVIEW_WIDTHS = {
  desktop: "600px",
  tablet: "480px",
  mobile: "320px",
};

export default function DragDropEmailBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [blocks, setBlocks] = useState<BuilderBlock[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [previewMode, setPreviewMode] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadDone = useRef(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["campaign-builder", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_campaigns")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (campaign && !initialLoadDone.current) {
      setName(campaign.name);
      const jsonContent = campaign.json_content as unknown as BuilderBlock[] | null;
      if (jsonContent && Array.isArray(jsonContent) && jsonContent.length > 0) {
        setBlocks(jsonContent);
      }
      initialLoadDone.current = true;
    }
  }, [campaign]);

  const saveMut = useMutation({
    mutationFn: async (payload: { name?: string; html_content?: string; json_content?: Json }) => {
      const { error } = await supabase
        .from("email_campaigns")
        .update(payload)
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      setAutoSaveStatus("saved");
      qc.invalidateQueries({ queryKey: ["email-campaigns"] });
    },
    onError: (e: any) => {
      setAutoSaveStatus("unsaved");
      toast.error("Errore salvataggio: " + e.message);
    },
  });

  const triggerAutoSave = useCallback((newBlocks: BuilderBlock[], newName?: string) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setAutoSaveStatus("unsaved");
    autoSaveTimer.current = setTimeout(() => {
      setAutoSaveStatus("saving");
      const html = generateEmailHtml(newBlocks);
      saveMut.mutate({
        html_content: html,
        json_content: newBlocks as unknown as Json,
        name: newName ?? name,
      });
    }, 2000);
  }, [name, saveMut]);

  const handleManualSave = () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setAutoSaveStatus("saving");
    const html = generateEmailHtml(blocks);
    saveMut.mutate({ html_content: html, json_content: blocks as unknown as Json, name });
  };

  const updateBlocks = (newBlocks: BuilderBlock[]) => {
    setBlocks(newBlocks);
    triggerAutoSave(newBlocks);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;

    // Dragging from sidebar (new element)
    const activeData = active.data?.current;
    if (activeData && activeData.type) {
      const blockType = activeData.type as BlockType;
      const newBlock = createBlock(blockType);
      if (blockType === "columns" && activeData.layout) {
        (newBlock.props as any).layout = activeData.layout as ColumnLayout;
        const colCount = (activeData.layout as string) === "1" ? 1 : (activeData.layout as string).split("-").length;
        newBlock.children = Array.from({ length: colCount }, (): BuilderBlock[] => []);
      }
      const overIndex = blocks.findIndex((b) => b.id === over.id);
      const newBlocks = [...blocks];
      if (overIndex >= 0) {
        newBlocks.splice(overIndex, 0, newBlock);
      } else {
        newBlocks.push(newBlock);
      }
      updateBlocks(newBlocks);
      setSelectedBlockId(newBlock.id);
      return;
    }

    // Reordering existing blocks
    if (active.id !== over.id) {
      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over.id);
      if (oldIndex >= 0 && newIndex >= 0) {
        updateBlocks(arrayMove(blocks, oldIndex, newIndex));
      }
    }
  };

  const handleDuplicateBlock = (blockId: string) => {
    const idx = blocks.findIndex((b) => b.id === blockId);
    if (idx < 0) return;
    const original = blocks[idx];
    const dup: BuilderBlock = {
      ...original,
      id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      props: { ...original.props },
      children: original.children?.map((col) => col.map((child) => ({ ...child, id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, props: { ...child.props } }))),
    };
    const newBlocks = [...blocks];
    newBlocks.splice(idx + 1, 0, dup);
    updateBlocks(newBlocks);
    setSelectedBlockId(dup.id);
  };

  const handleDeleteBlock = (blockId: string) => {
    updateBlocks(blocks.filter((b) => b.id !== blockId));
    if (selectedBlockId === blockId) setSelectedBlockId(null);
  };

  const handleMoveBlock = (blockId: string, direction: "up" | "down") => {
    const idx = blocks.findIndex((b) => b.id === blockId);
    if (idx < 0) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= blocks.length) return;
    updateBlocks(arrayMove(blocks, idx, newIdx));
  };

  const handleUpdateBlockProps = (blockId: string, partial: Record<string, any>) => {
    const newBlocks = blocks.map((b) =>
      b.id === blockId ? { ...b, props: { ...b.props, ...partial } } : b
    );
    updateBlocks(newBlocks);
  };

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId) || null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-muted-foreground">Campagna non trovata</p>
        <Button onClick={() => navigate("/azienda/marketing/email")}>Torna alla lista</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-muted/30">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-background border-b shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/azienda/marketing/email")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Indietro
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <span className="text-xs text-muted-foreground">
            {autoSaveStatus === "saved" && "✓ Salvato"}
            {autoSaveStatus === "saving" && "Salvataggio..."}
            {autoSaveStatus === "unsaved" && "● Modifiche non salvate"}
          </span>
        </div>

        {/* Editable name */}
        <div className="flex items-center gap-2">
          {editingName ? (
            <div className="flex items-center gap-1">
              <Input
                className="h-8 w-64 text-center font-medium"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { setEditingName(false); handleManualSave(); } }}
                autoFocus
              />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingName(false); handleManualSave(); }}>
                <Check className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <button className="flex items-center gap-1 text-sm font-medium hover:text-primary transition-colors" onClick={() => setEditingName(true)}>
              {name}
              <Pencil className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Responsive preview toggles */}
          <div className="flex items-center border rounded-md">
            {([
              { mode: "desktop" as const, icon: Monitor },
              { mode: "tablet" as const, icon: Tablet },
              { mode: "mobile" as const, icon: Smartphone },
            ]).map(({ mode, icon: Icon }) => (
              <Button
                key={mode}
                variant={previewMode === mode ? "default" : "ghost"}
                size="icon"
                className="h-8 w-8 rounded-none first:rounded-l-md last:rounded-r-md"
                onClick={() => setPreviewMode(mode)}
              >
                <Icon className="h-4 w-4" />
              </Button>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            <Eye className="h-4 w-4 mr-1" /> Anteprima
          </Button>
          <Button variant="outline" size="sm" onClick={handleManualSave} disabled={saveMut.isPending}>
            <Save className="h-4 w-4 mr-1" /> Salva
          </Button>
          <Button size="sm" onClick={() => { handleManualSave(); navigate(`/azienda/marketing/email/campagna/${id}/impostazioni`); }}>
            <Send className="h-4 w-4 mr-1" /> Invia
          </Button>
        </div>
      </div>

      {/* Builder body */}
      <div className="flex flex-1 overflow-hidden">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <BuilderSidebar />
          <BuilderCanvas
            blocks={blocks}
            selectedBlockId={selectedBlockId}
            onSelectBlock={setSelectedBlockId}
            onDuplicateBlock={handleDuplicateBlock}
            onDeleteBlock={handleDeleteBlock}
            onMoveBlock={handleMoveBlock}
            previewWidth={PREVIEW_WIDTHS[previewMode]}
          />
          <DragOverlay>
            {activeDragId ? (
              <div className="bg-primary/10 border-2 border-primary border-dashed rounded-md px-4 py-2 text-xs font-medium text-primary">
                Rilascia sul canvas
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        <BuilderPropertiesPanel block={selectedBlock} onUpdate={handleUpdateBlockProps} />
      </div>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Anteprima email</DialogTitle>
          </DialogHeader>
          <iframe
            srcDoc={generateEmailHtml(blocks)}
            className="w-full h-[70vh] border rounded-md"
            title="Anteprima email"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
