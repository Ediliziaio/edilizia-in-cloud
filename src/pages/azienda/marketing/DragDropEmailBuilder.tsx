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
import { ArrowLeft, Save, Eye, Send, Pencil, Check, Monitor, Tablet, Smartphone, Loader2, Undo2, Redo2 } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

const PREVIEW_WIDTHS = {
  desktop: "600px",
  tablet: "480px",
  mobile: "320px",
};

const MAX_HISTORY = 50;

export default function DragDropEmailBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [blocks, setBlocks] = useState<BuilderBlock[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedChildBlock, setSelectedChildBlock] = useState<BuilderBlock | null>(null);
  const [name, setName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [previewMode, setPreviewMode] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadDone = useRef(false);

  // Undo/Redo stacks
  const [undoStack, setUndoStack] = useState<BuilderBlock[][]>([]);
  const [redoStack, setRedoStack] = useState<BuilderBlock[][]>([]);
  const isUndoRedoAction = useRef(false);

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

  const updateBlocks = useCallback((newBlocks: BuilderBlock[]) => {
    if (!isUndoRedoAction.current) {
      setUndoStack((prev) => [...prev.slice(-(MAX_HISTORY - 1)), blocks]);
      setRedoStack([]);
    }
    isUndoRedoAction.current = false;
    setBlocks(newBlocks);
    triggerAutoSave(newBlocks);
  }, [blocks, triggerAutoSave]);

  // Undo/Redo handlers
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((s) => [...s, blocks]);
    isUndoRedoAction.current = true;
    setBlocks(prev);
    triggerAutoSave(prev);
  }, [undoStack, blocks, triggerAutoSave]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((s) => [...s, blocks]);
    isUndoRedoAction.current = true;
    setBlocks(next);
    triggerAutoSave(next);
  }, [redoStack, blocks, triggerAutoSave]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((isMod && e.key === "y") || (isMod && e.shiftKey && e.key === "z")) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo, handleRedo]);

  // Child block handlers for columns
  const handleAddChildBlock = useCallback((parentId: string, colIndex: number, childType: BlockType) => {
    const newBlocks = blocks.map((b) => {
      if (b.id !== parentId) return b;
      const children = b.children ? b.children.map((col) => [...col]) : [];
      const newChild = createBlock(childType);
      if (children[colIndex]) {
        children[colIndex].push(newChild);
      }
      return { ...b, children };
    });
    updateBlocks(newBlocks);
  }, [blocks, updateBlocks]);

  const handleDeleteChildBlock = useCallback((parentId: string, colIndex: number, childId: string) => {
    const newBlocks = blocks.map((b) => {
      if (b.id !== parentId) return b;
      const children = b.children ? b.children.map((col, ci) =>
        ci === colIndex ? col.filter((c) => c.id !== childId) : [...col]
      ) : [];
      return { ...b, children };
    });
    updateBlocks(newBlocks);
    if (selectedChildBlock?.id === childId) setSelectedChildBlock(null);
  }, [blocks, updateBlocks, selectedChildBlock]);

  const handleUpdateChildBlockProps = useCallback((blockId: string, partial: Record<string, any>) => {
    // Find which parent contains this child and update
    const newBlocks = blocks.map((b) => {
      if (!b.children) return b;
      const newChildren = b.children.map((col) =>
        col.map((child) =>
          child.id === blockId ? { ...child, props: { ...child.props, ...partial } } : child
        )
      );
      return { ...b, children: newChildren };
    });
    updateBlocks(newBlocks);
    // Update the selectedChildBlock reference
    setSelectedChildBlock((prev) => prev && prev.id === blockId ? { ...prev, props: { ...prev.props, ...partial } } : prev);
  }, [blocks, updateBlocks]);

  const handleSelectChildBlock = useCallback((child: BuilderBlock) => {
    setSelectedBlockId(null);
    setSelectedChildBlock(child);
  }, []);

  const handleSelectBlock = useCallback((id: string | null) => {
    setSelectedBlockId(id);
    setSelectedChildBlock(null);
  }, []);

  const handleInlineEdit = useCallback((blockId: string, partial: Record<string, any>) => {
    // Check if it's a root block
    const isRoot = blocks.some((b) => b.id === blockId);
    if (isRoot) {
      const newBlocks = blocks.map((b) => b.id !== blockId ? b : { ...b, props: { ...b.props, ...partial } });
      updateBlocks(newBlocks);
      return;
    }
    // Otherwise it's a child block inside columns
    handleUpdateChildBlockProps(blockId, partial);
  }, [blocks, updateBlocks, handleUpdateChildBlockProps]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;

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
      handleSelectBlock(newBlock.id);
      return;
    }

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
    handleSelectBlock(dup.id);
  };

  const handleDeleteBlock = (blockId: string) => {
    updateBlocks(blocks.filter((b) => b.id !== blockId));
    if (selectedBlockId === blockId) handleSelectBlock(null);
  };

  const handleMoveBlock = (blockId: string, direction: "up" | "down") => {
    const idx = blocks.findIndex((b) => b.id === blockId);
    if (idx < 0) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= blocks.length) return;
    updateBlocks(arrayMove(blocks, idx, newIdx));
  };

  const handleUpdateBlockProps = (blockId: string, partial: Record<string, any>) => {
    const newBlocks = blocks.map((b) => {
      if (b.id !== blockId) return b;
      const updated = { ...b, props: { ...b.props, ...partial } };
      // Sync children array when column layout changes
      if (b.type === "columns" && partial.layout && partial.layout !== (b.props as any).layout) {
        const newColCount = partial.layout === "1" ? 1 : (partial.layout as string).split("-").length;
        const oldChildren = b.children || [];
        const newChildren: BuilderBlock[][] = [];
        for (let i = 0; i < newColCount; i++) {
          newChildren.push(oldChildren[i] ? [...oldChildren[i]] : []);
        }
        // Move orphaned children from removed columns into the last column
        for (let i = newColCount; i < oldChildren.length; i++) {
          if (oldChildren[i]?.length) {
            newChildren[newColCount - 1].push(...oldChildren[i]);
          }
        }
        updated.children = newChildren;
      }
      return updated;
    });
    updateBlocks(newBlocks);
  };

  // Resolve selected block: either root or child
  const resolvedSelectedBlock = selectedChildBlock
    ? (() => {
        // Find fresh child from blocks state
        for (const b of blocks) {
          if (!b.children) continue;
          for (const col of b.children) {
            const found = col.find((c) => c.id === selectedChildBlock.id);
            if (found) return found;
          }
        }
        return selectedChildBlock;
      })()
    : blocks.find((b) => b.id === selectedBlockId) || null;

  const handleResolvedUpdate = selectedChildBlock
    ? handleUpdateChildBlockProps
    : handleUpdateBlockProps;

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
          {/* Undo/Redo buttons */}
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={undoStack.length === 0} onClick={handleUndo} title="Annulla (Ctrl+Z)">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={redoStack.length === 0} onClick={handleRedo} title="Ripristina (Ctrl+Y)">
            <Redo2 className="h-4 w-4" />
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
            onSelectBlock={handleSelectBlock}
            onDuplicateBlock={handleDuplicateBlock}
            onDeleteBlock={handleDeleteBlock}
            onMoveBlock={handleMoveBlock}
            previewWidth={PREVIEW_WIDTHS[previewMode]}
            onAddChildBlock={handleAddChildBlock}
            onDeleteChildBlock={handleDeleteChildBlock}
            onSelectChildBlock={handleSelectChildBlock}
            selectedChildBlockId={selectedChildBlock?.id || null}
            onInlineEdit={handleInlineEdit}
          />
          <DragOverlay>
            {activeDragId ? (
              <div className="bg-primary/10 border-2 border-primary border-dashed rounded-md px-4 py-2 text-xs font-medium text-primary">
                Rilascia sul canvas
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        <BuilderPropertiesPanel block={resolvedSelectedBlock} onUpdate={handleResolvedUpdate} />
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
