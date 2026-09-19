import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Zap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useAuth } from "@/contexts/AuthContext";
import { useMarketingRoutePrefix } from "@/hooks/useMarketingRoutePrefix";
import {
  FLOW_TEMPLATES,
  TEMPLATE_CATEGORIES,
  TEMPLATES_BY_CATEGORY,
  DIFFICULTY_LABELS,
  type FlowTemplate,
} from "@/lib/flow-templates";

interface Props {
  categoriaFiltro?: string | null;
}

export function AutomazioniTemplateGallery({ categoriaFiltro }: Props) {
  const navigate = useNavigate();
  const routePrefix = useMarketingRoutePrefix();
  const companyId = useEffectiveCompanyId();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [cerca, setCerca] = useState("");
  const [difficoltaFiltro, setDifficoltaFiltro] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  // Filter templates
  const baseList = categoriaFiltro && categoriaFiltro !== "tutte"
    ? (TEMPLATES_BY_CATEGORY[categoriaFiltro] ?? [])
    : FLOW_TEMPLATES;

  const filtered = baseList.filter(t => {
    if (difficoltaFiltro && t.difficolta !== difficoltaFiltro) return false;
    if (!cerca) return true;
    const q = cerca.toLowerCase();
    return t.nome.toLowerCase().includes(q) || t.descrizione.toLowerCase().includes(q);
  });

  // Group by category for display
  const showCategories = !categoriaFiltro || categoriaFiltro === "tutte";
  const groups: { label: string; emoji: string; templates: FlowTemplate[] }[] = showCategories
    ? TEMPLATE_CATEGORIES
        .map(cat => ({
          label: cat.label,
          emoji: cat.emoji,
          templates: filtered.filter(t => t.categoria === cat.value),
        }))
        .filter(g => g.templates.length > 0)
    : [{ label: '', emoji: '', templates: filtered }];

  // publish=true → "Attiva subito": il flusso nasce già PUBLISHED e operativo
  // (solo per template prontoAllUso, completi senza campi da scegliere).
  const handleUseTemplate = async (template: FlowTemplate, publish = false) => {
    if (!companyId || !user?.id) {
      toast.error("Devi essere autenticato per usare un template");
      return;
    }

    setActivatingId(template.id);
    // Tracciato fuori dal try: se gli insert di nodi/connessioni falliscono
    // DOPO la creazione del flow, il catch lo ripulisce — prima restava una
    // bozza fantasma vuota ("0 trigger · 0 step") nella lista.
    let createdFlowId: string | null = null;
    try {
      // 1. Create flow
      const { data: flow, error: flowErr } = await supabase
        .from("automation_flows")
        .insert({
          name: template.nome,
          company_id: companyId,
          status: publish ? "published" : "draft",
          description: template.descrizione,
          created_by: user.id,
          // Prima la categoria del template non veniva salvata → tutti i
          // flussi finivano in "Generale" e il filtro categoria non li trovava.
          category: template.categoria || "generale",
          config_json: { template_id: template.id, template_icona: template.icona },
        } as never)
        .select("id")
        .single();

      if (flowErr || !flow) throw flowErr ?? new Error("Impossibile creare il flow");

      const flowId = (flow as any).id as string;
      createdFlowId = flowId;

      // 2. Insert nodes
      const nodeInserts = template.nodes.map(n => ({
        id: crypto.randomUUID(),
        flow_id: flowId,
        company_id: companyId,
        node_type: n.nodeType,
        position_x: n.posX,
        position_y: n.posY,
        config_json: n.configJson,
        label: n.label,
      }));

      // Build id mapping (template node id → real uuid)
      const idMap: Record<string, string> = {};
      template.nodes.forEach((n, i) => {
        idMap[n.id] = nodeInserts[i].id;
      });

      const { error: nodesErr } = await supabase
        .from("automation_nodes")
        .insert(nodeInserts as never[]);
      if (nodesErr) throw nodesErr;

      // 3. Insert connections
      if (template.connections.length > 0) {
        const connInserts = template.connections.map(c => ({
          id: crypto.randomUUID(),
          flow_id: flowId,
          company_id: companyId,
          from_node_id: idMap[c.fromId],
          to_node_id: idMap[c.toId],
          label: c.label ?? null,
        }));

        const { error: connErr } = await supabase
          .from("automation_connections")
          .insert(connInserts as never[]);
        if (connErr) throw connErr;
      }

      // Senza invalidation, tornando alla lista il nuovo flusso non appariva
      // per tutto lo staleTime (5 min) e i KPI restavano al conteggio vecchio.
      void queryClient.invalidateQueries({ queryKey: ["automation-flows"] });
      void queryClient.invalidateQueries({ queryKey: ["automation-overview-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["automation-node-summaries"] });
      void queryClient.invalidateQueries({ queryKey: ["automation-enrollment-counts"] });

      if (publish) {
        toast.success(`"${template.nome}" ATTIVA e già operativa`, {
          description: "Il flusso è pubblicato: scatterà al prossimo evento. Puoi personalizzarlo nel builder.",
        });
      } else {
        toast.success(`Template "${template.nome}" creato! Apro il builder...`);
      }
      navigate(`${routePrefix}/automazioni/${flowId}`);
    } catch (err: any) {
      console.error("Errore attivazione template:", err);
      // Rollback best-effort della bozza orfana (nodi/connessioni inclusi).
      if (createdFlowId) {
        try {
          // Creazione a metà: si toglie davvero (nodi e collegamenti vanno
          // via a cascata). Una DELETE semplice ora finirebbe nel cestino.
          await supabase.rpc("automazione_elimina_definitivamente", { p_flow_id: createdFlowId });
        } catch {
          /* best-effort: se anche il cleanup fallisce, resta la bozza ma l'utente è avvisato dall'errore */
        }
      }
      toast.error("Errore nella creazione dell'automazione");
    } finally {
      setActivatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filtri */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Template Automazioni</h2>
          <p className="text-sm text-muted-foreground">
            {FLOW_TEMPLATES.length} template pronti all'uso — attiva in un click.
          </p>
          {/* Difficulty pills */}
          <div className="flex gap-1.5">
            {(["base", "intermedio", "avanzato"] as const).map(d => (
              <button
                key={d}
                onClick={() => setDifficoltaFiltro(difficoltaFiltro === d ? null : d)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  difficoltaFiltro === d
                    ? DIFFICULTY_LABELS[d].color
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {DIFFICULTY_LABELS[d].label}
              </button>
            ))}
          </div>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Cerca template..."
            className="pl-9"
            value={cerca}
            onChange={e => setCerca(e.target.value)}
          />
        </div>
      </div>

      {/* Grouped grid */}
      {groups.map(group => (
        <div key={group.label || 'flat'} className="space-y-3">
          {group.label && (
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <span>{group.emoji}</span> {group.label}
              <span className="text-muted-foreground font-normal">({group.templates.length})</span>
            </h3>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {group.templates.map(template => {
              const isActivating = activatingId === template.id;
              const diff = DIFFICULTY_LABELS[template.difficolta];
              const nodeCount = template.nodes.length;

              return (
                <div
                  key={template.id}
                  className="bg-card rounded-xl border border-border p-4 flex flex-col gap-3 hover:shadow-md transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-xl flex-shrink-0">
                      {template.icona}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-foreground text-sm leading-snug">
                        {template.nome}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {template.descrizione}
                      </div>
                    </div>
                  </div>

                  <div className="bg-primary/5 rounded-lg px-3 py-2 text-xs text-primary">
                    <span className="font-medium">Trigger:</span> {template.triggerTipo.replace(/_/g, ' ')}
                    <br />
                    <span className="font-medium">Step:</span> {nodeCount} nodi · {template.connections.length} connessioni
                  </div>

                  <div className="flex items-center justify-between mt-auto">
                    <div className="flex gap-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        {TEMPLATE_CATEGORIES.find(c => c.value === template.categoria)?.emoji ?? '⚡'}{' '}
                        {template.categoria}
                      </Badge>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${diff.color}`}>
                        {diff.label}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      {template.prontoAllUso && (
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => handleUseTemplate(template, true)}
                          disabled={isActivating}
                          title="Completo così com'è: lo pubblica subito, operativo dal prossimo evento"
                        >
                          {isActivating ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <><Zap className="w-3.5 h-3.5 mr-1" />Attiva subito</>
                          )}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={template.prontoAllUso ? "outline" : "default"}
                        className="h-7 text-xs"
                        onClick={() => handleUseTemplate(template)}
                        disabled={isActivating}
                      >
                        {isActivating ? (
                          <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Creazione...</>
                        ) : (
                          <>{!template.prontoAllUso && <Zap className="w-3.5 h-3.5 mr-1" />}Personalizza</>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Nessun template trovato{cerca ? ` per "${cerca}"` : ""}.
        </div>
      )}
    </div>
  );
}
