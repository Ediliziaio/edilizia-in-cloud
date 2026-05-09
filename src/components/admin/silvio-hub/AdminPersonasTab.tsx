/**
 * AdminPersonasTab — CRUD editor per le 21 personas C-suite admin
 *
 * Tabella: silvio_admin_personas (Beatrice, Marco, Sofia, Tommaso, ...).
 *
 * Permette di editare:
 * - display_name, short_label, emoji, motto
 * - mission, system_prompt_addendum
 * - scope_topics[], forbidden_topics[], example_questions[]
 * - handoff_to[], panel_partners[], debate_opponent
 * - enabled, sort_order, recommended_model
 *
 * Le memorie associate (silvio_persona_memory) si gestiscono nel tab Memory.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Pencil, Save, X, Users, AlertTriangle } from "lucide-react";

interface AdminPersona {
  persona_key: string;
  display_name: string;
  short_label: string | null;
  emoji: string | null;
  mission: string | null;
  scope_topics: string[] | null;
  forbidden_topics: string[] | null;
  system_prompt_addendum: string | null;
  example_questions: string[] | null;
  recommended_model: string | null;
  required_role: string | null;
  enabled: boolean;
  sort_order: number;
  motto: string | null;
  handoff_to: string[] | null;
  panel_partners: string[] | null;
  debate_opponent: string | null;
}

export function AdminPersonasTab() {
  const queryClient = useQueryClient();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<AdminPersona>>({});

  const personasQuery = useQuery({
    queryKey: ["silvio-admin-personas"],
    queryFn: async (): Promise<AdminPersona[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("silvio_admin_personas")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AdminPersona[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (patch: Partial<AdminPersona> & { persona_key: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("silvio_admin_personas")
        .update({
          display_name: patch.display_name,
          short_label: patch.short_label,
          emoji: patch.emoji,
          mission: patch.mission,
          motto: patch.motto,
          system_prompt_addendum: patch.system_prompt_addendum,
          scope_topics: patch.scope_topics,
          forbidden_topics: patch.forbidden_topics,
          example_questions: patch.example_questions,
          handoff_to: patch.handoff_to,
          panel_partners: patch.panel_partners,
          debate_opponent: patch.debate_opponent,
          recommended_model: patch.recommended_model,
          enabled: patch.enabled,
          sort_order: patch.sort_order,
          updated_at: new Date().toISOString(),
        })
        .eq("persona_key", patch.persona_key);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Persona aggiornata");
      queryClient.invalidateQueries({ queryKey: ["silvio-admin-personas"] });
      setEditingKey(null);
      setDraft({});
    },
    onError: (e) => {
      toast.error("Errore salvataggio", {
        description: e instanceof Error ? e.message : String(e),
      });
    },
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: async (params: { key: string; enabled: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("silvio_admin_personas")
        .update({ enabled: params.enabled, updated_at: new Date().toISOString() })
        .eq("persona_key", params.key);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["silvio-admin-personas"] });
    },
  });

  function startEdit(persona: AdminPersona) {
    setEditingKey(persona.persona_key);
    setDraft({ ...persona });
  }

  function cancelEdit() {
    setEditingKey(null);
    setDraft({});
  }

  function saveEdit() {
    if (!editingKey) return;
    saveMutation.mutate({ persona_key: editingKey, ...draft });
  }

  const arrayFromText = (text: string): string[] =>
    text
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

  if (personasQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const personas = personasQuery.data ?? [];

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/10 p-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <strong>Personas C-suite Admin</strong> — usate da Silvio nel chat
          /admin/silvio (Beatrice CFO, Marco CMO, Sofia COO, ecc.). Sono diverse
          dalle <strong>Personas Cliente</strong> (gestite in <a href="/admin/ai-config?tab=personas" className="underline font-medium">AI Config → Personas</a>) che
          servono ai clienti loggati. Le memorie associate (fatti/regole/preferenze)
          si gestiscono nel tab Memoria di questa pagina.
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {personas.length} personas registrate ({personas.filter((p) => p.enabled).length} attive)
        </span>
      </div>

      <div className="space-y-2">
        {personas.map((p) => {
          const isEditing = editingKey === p.persona_key;
          if (!isEditing) {
            return (
              <Card key={p.persona_key} className={!p.enabled ? "opacity-50" : ""}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl shrink-0 mt-0.5">{p.emoji ?? "🤖"}</span>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{p.display_name}</span>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {p.persona_key}
                        </Badge>
                        {p.short_label ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {p.short_label}
                          </Badge>
                        ) : null}
                        {!p.enabled ? (
                          <Badge variant="outline" className="text-[10px] text-rose-600">
                            disabled
                          </Badge>
                        ) : null}
                      </div>
                      {p.motto ? (
                        <p className="text-xs italic text-muted-foreground">"{p.motto}"</p>
                      ) : null}
                      {p.mission ? (
                        <p className="text-xs">{p.mission}</p>
                      ) : null}
                      {p.scope_topics && p.scope_topics.length > 0 ? (
                        <div className="text-[10px] text-muted-foreground">
                          <strong>Scope:</strong> {p.scope_topics.slice(0, 6).join(", ")}
                          {p.scope_topics.length > 6 ? ` +${p.scope_topics.length - 6}` : ""}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch
                        checked={p.enabled}
                        onCheckedChange={(c) =>
                          toggleEnabledMutation.mutate({ key: p.persona_key, enabled: c })
                        }
                      />
                      <Button size="icon" variant="ghost" onClick={() => startEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          }

          // Edit mode
          return (
            <Card key={p.persona_key} className="border-primary">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Modifica: {p.display_name}{" "}
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {p.persona_key}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Display Name</Label>
                    <Input
                      value={draft.display_name ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, display_name: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Short Label</Label>
                    <Input
                      value={draft.short_label ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, short_label: e.target.value }))
                      }
                      placeholder="es. CFO, CMO, COO..."
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Emoji</Label>
                    <Input
                      value={draft.emoji ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, emoji: e.target.value }))}
                      maxLength={4}
                      className="text-center"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Motto (1 riga)</Label>
                  <Input
                    value={draft.motto ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, motto: e.target.value }))}
                    placeholder="Es. 'Cassa prima di tutto'"
                  />
                </div>

                <div>
                  <Label className="text-xs">Mission</Label>
                  <Textarea
                    value={draft.mission ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, mission: e.target.value }))}
                    rows={2}
                    placeholder="Cosa fa questa persona quando Silvio la attiva..."
                  />
                </div>

                <div>
                  <Label className="text-xs">System Prompt Addendum</Label>
                  <Textarea
                    value={draft.system_prompt_addendum ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, system_prompt_addendum: e.target.value }))
                    }
                    rows={6}
                    className="font-mono text-xs"
                    placeholder="Linee guida specifiche aggiunte al system prompt quando questa persona è attiva..."
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Scope Topics (uno per riga)</Label>
                    <Textarea
                      value={(draft.scope_topics ?? []).join("\n")}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          scope_topics: arrayFromText(e.target.value),
                        }))
                      }
                      rows={4}
                      className="text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Forbidden Topics</Label>
                    <Textarea
                      value={(draft.forbidden_topics ?? []).join("\n")}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          forbidden_topics: arrayFromText(e.target.value),
                        }))
                      }
                      rows={4}
                      className="text-xs"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Example Questions (uno per riga)</Label>
                  <Textarea
                    value={(draft.example_questions ?? []).join("\n")}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        example_questions: arrayFromText(e.target.value),
                      }))
                    }
                    rows={3}
                    className="text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Handoff To (persona_keys)</Label>
                    <Input
                      value={(draft.handoff_to ?? []).join(",")}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          handoff_to: arrayFromText(e.target.value),
                        }))
                      }
                      placeholder="marco,sofia"
                      className="font-mono text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Panel Partners</Label>
                    <Input
                      value={(draft.panel_partners ?? []).join(",")}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          panel_partners: arrayFromText(e.target.value),
                        }))
                      }
                      placeholder="beatrice,marco"
                      className="font-mono text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Debate Opponent</Label>
                    <Input
                      value={draft.debate_opponent ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, debate_opponent: e.target.value }))
                      }
                      placeholder="es. tommaso"
                      className="font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Recommended Model</Label>
                    <Input
                      value={draft.recommended_model ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, recommended_model: e.target.value }))
                      }
                      placeholder="anthropic/claude-3-5-sonnet"
                      className="font-mono text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Sort Order</Label>
                    <Input
                      type="number"
                      value={draft.sort_order ?? 0}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, sort_order: parseInt(e.target.value) || 0 }))
                      }
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-5">
                    <Switch
                      checked={draft.enabled ?? true}
                      onCheckedChange={(c) => setDraft((d) => ({ ...d, enabled: c }))}
                    />
                    <Label className="text-xs">Attiva</Label>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button variant="ghost" size="sm" onClick={cancelEdit}>
                    <X className="h-3 w-3 mr-1" />
                    Annulla
                  </Button>
                  <Button size="sm" onClick={saveEdit} disabled={saveMutation.isPending}>
                    <Save className="h-3 w-3 mr-1" />
                    Salva
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
