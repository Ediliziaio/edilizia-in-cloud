/**
 * MemoryTab — silvio_persona_memory CRUD per le 21 personas C-suite
 * Include sub-component MemoryCard.
 * Estratto da SilvioAdminHub.tsx (refactor monolite → sub-component).
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Brain, Pencil, Plus, Save, Trash2, XCircle } from "lucide-react";

interface PersonaOption {
  persona_key: string;
  display_name: string;
  emoji: string;
}

interface PersonaMemory {
  id: string;
  persona_key: string;
  memory_type: "fact" | "preference" | "decision" | "pattern" | "avoid";
  content: string;
  source: string | null;
  confidence: number | null;
  enabled: boolean;
  hits_count: number;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

const MEMORY_TYPE_BADGE: Record<PersonaMemory["memory_type"], string> = {
  fact: "bg-sky-100 text-sky-700",
  preference: "bg-violet-100 text-violet-700",
  decision: "bg-amber-100 text-amber-700",
  pattern: "bg-emerald-100 text-emerald-700",
  avoid: "bg-rose-100 text-rose-700",
};
const MEMORY_TYPE_LABEL: Record<PersonaMemory["memory_type"], string> = {
  fact: "📌 Fatto",
  preference: "💭 Preferenza",
  decision: "🎯 Decisione",
  pattern: "✅ Pattern",
  avoid: "❌ Evita",
};

export function MemoryTab() {
  const queryClient = useQueryClient();
  const [selectedPersona, setSelectedPersona] = useState<string>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newType, setNewType] = useState<PersonaMemory["memory_type"]>("fact");
  const [newContent, setNewContent] = useState("");
  const [newPersonaKey, setNewPersonaKey] = useState<string>("");

  const personasQuery = useQuery({
    queryKey: ["silvio-personas-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_admin_personas")
        .select("persona_key, display_name, emoji")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PersonaOption[];
    },
  });

  const memoryQuery = useQuery({
    queryKey: ["silvio-persona-memory", selectedPersona],
    queryFn: async () => {
      let q = supabase
        .from("silvio_persona_memory")
        .select("*")
        .order("hits_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (selectedPersona !== "all") q = q.eq("persona_key", selectedPersona);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PersonaMemory[];
    },
  });

  // Totale ESATTO (head count): la lista è cappata a 200 e "N memorie"
  // sul campione mentiva oltre quella soglia.
  const totalQuery = useQuery({
    queryKey: ["silvio-persona-memory-count", selectedPersona],
    queryFn: async () => {
      let q = supabase
        .from("silvio_persona_memory")
        .select("id", { count: "exact", head: true });
      if (selectedPersona !== "all") q = q.eq("persona_key", selectedPersona);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!newPersonaKey || !newContent.trim())
        throw new Error("Compila tutti i campi");
      const { error } = await supabase.from("silvio_persona_memory").insert({
        persona_key: newPersonaKey,
        memory_type: newType,
        content: newContent.trim(),
        source: "florin_explicit",
        confidence: 1.0,
        enabled: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Memoria aggiunta");
      setNewContent("");
      setShowAddForm(false);
      queryClient.invalidateQueries({ queryKey: ["silvio-persona-memory"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("silvio_persona_memory")
        .update({ enabled })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["silvio-persona-memory"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { error } = await supabase
        .from("silvio_persona_memory")
        .update({ content, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Memoria aggiornata");
      queryClient.invalidateQueries({ queryKey: ["silvio-persona-memory"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("silvio_persona_memory")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Memoria eliminata");
      queryClient.invalidateQueries({ queryKey: ["silvio-persona-memory"] });
    },
  });

  const personas = personasQuery.data ?? [];
  const memories = memoryQuery.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Select value={selectedPersona} onValueChange={setSelectedPersona}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Filtra persona" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le personas</SelectItem>
              {personas.map((p) => (
                <SelectItem key={p.persona_key} value={p.persona_key}>
                  {p.emoji} {p.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {totalQuery.data ?? memories.length} memorie{(totalQuery.data ?? 0) > 200 ? " (prime 200 mostrate)" : ""}
          </span>
        </div>
        <Button
          size="sm"
          onClick={() => setShowAddForm((v) => !v)}
          className="bg-orange-600 hover:bg-orange-700"
        >
          <Plus className="h-4 w-4 mr-1" />
          Nuova memoria
        </Button>
      </div>

      {showAddForm && (
        <Card className="border-orange-200">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Persona
                </label>
                <Select value={newPersonaKey} onValueChange={setNewPersonaKey}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona persona…" />
                  </SelectTrigger>
                  <SelectContent>
                    {personas.map((p) => (
                      <SelectItem key={p.persona_key} value={p.persona_key}>
                        {p.emoji} {p.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Tipo
                </label>
                <Select
                  value={newType}
                  onValueChange={(v) =>
                    setNewType(v as PersonaMemory["memory_type"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fact">📌 Fatto</SelectItem>
                    <SelectItem value="preference">💭 Preferenza</SelectItem>
                    <SelectItem value="decision">🎯 Decisione</SelectItem>
                    <SelectItem value="pattern">✅ Pattern vincente</SelectItem>
                    <SelectItem value="avoid">❌ Da evitare</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Contenuto
              </label>
              <Textarea
                placeholder="Es: ARPU Pro = €127/mese. Lead industriali rispondono meglio a linguaggio tecnico."
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowAddForm(false);
                  setNewContent("");
                }}
              >
                Annulla
              </Button>
              <Button
                size="sm"
                onClick={() => addMutation.mutate()}
                disabled={
                  addMutation.isPending || !newPersonaKey || !newContent.trim()
                }
                className="bg-orange-600 hover:bg-orange-700"
              >
                <Save className="h-4 w-4 mr-1" />
                Salva
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {memoryQuery.isLoading ? (
        <Skeleton className="h-40" />
      ) : memories.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            <Brain className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            Nessuna memoria. Aggiungi la prima per arricchire le risposte di
            Silvio.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {memories.map((m) => (
            <MemoryCard
              key={m.id}
              memory={m}
              personas={personas}
              onToggle={(enabled) =>
                toggleMutation.mutate({ id: m.id, enabled })
              }
              onUpdate={(content) =>
                updateMutation.mutate({ id: m.id, content })
              }
              onDelete={() => deleteMutation.mutate(m.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MemoryCard({
  memory,
  personas,
  onToggle,
  onUpdate,
  onDelete,
}: {
  memory: PersonaMemory;
  personas: PersonaOption[];
  onToggle: (enabled: boolean) => void;
  onUpdate: (content: string) => void;
  onDelete: () => void;
}) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memory.content);
  const persona = personas.find((p) => p.persona_key === memory.persona_key);

  return (
    <Card className={memory.enabled ? "" : "opacity-60"}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px]">
                {persona
                  ? `${persona.emoji} ${persona.display_name}`
                  : memory.persona_key}
              </Badge>
              <Badge
                variant="outline"
                className={`text-[10px] ${MEMORY_TYPE_BADGE[memory.memory_type]}`}
              >
                {MEMORY_TYPE_LABEL[memory.memory_type]}
              </Badge>
              {memory.source && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  src: {memory.source}
                </span>
              )}
              {memory.hits_count > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  · {memory.hits_count} usi
                </span>
              )}
            </div>
            {editing ? (
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className="text-sm"
              />
            ) : (
              <p className="text-sm whitespace-pre-wrap break-words">
                {memory.content}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <div className="flex items-center gap-1">
              <Switch
                checked={memory.enabled}
                onCheckedChange={onToggle}
                aria-label="Attiva memoria"
              />
              {editing ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => {
                      onUpdate(draft);
                      setEditing(false);
                    }}
                    title="Salva"
                  >
                    <Save className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => {
                      setDraft(memory.content);
                      setEditing(false);
                    }}
                    title="Annulla"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => setEditing(true)}
                    title="Modifica"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700"
                    onClick={async () => {
                      if (await confirm({ title: "Eliminare questa memoria?", confirmLabel: "Elimina", variant: "destructive" })) onDelete();
                    }}
                    title="Elimina"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

