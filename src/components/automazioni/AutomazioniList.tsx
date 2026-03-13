import { useAutomazioni, useToggleAutomazione, useDeleteAutomazione, type AutomationRule } from "@/hooks/useAutomazioni";
import { AutomazioneCard } from "./AutomazioneCard";
import { AutomazioniEmptyState } from "./AutomazioniEmptyState";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  categoria: string;
  onEdit: (rule: AutomationRule) => void;
}

const CATEGORIA_LABEL: Record<string, string> = {
  task: "✅ Task",
  marketing: "📢 Marketing",
  crm: "💼 CRM",
  cantieri: "🏗️ Cantieri",
  notifiche: "🔔 Notifiche",
  generale: "🔧 Generali",
};

export function AutomazioniList({ categoria, onEdit }: Props) {
  const { data: rules, isLoading } = useAutomazioni(categoria as any);
  const toggle = useToggleAutomazione();
  const deleteRule = useDeleteAutomazione();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-48 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!rules?.length) {
    return <AutomazioniEmptyState categoria={categoria} />;
  }

  const grouped = categoria === "tutte"
    ? rules.reduce((acc, r) => {
        if (!acc[r.categoria]) acc[r.categoria] = [];
        acc[r.categoria].push(r);
        return acc;
      }, {} as Record<string, AutomationRule[]>)
    : { [categoria]: rules };

  return (
    <div className="space-y-8">
      {Object.entries(grouped).map(([cat, catRules]) => (
        <div key={cat}>
          {categoria === "tutte" && (
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              {CATEGORIA_LABEL[cat] ?? cat}
            </h2>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {catRules.map(rule => (
              <AutomazioneCard
                key={rule.id}
                rule={rule}
                onEdit={() => onEdit(rule)}
                onToggle={(attiva) => toggle.mutate({ id: rule.id, attiva })}
                onDelete={() => {
                  if (confirm(`Eliminare "${rule.nome}"?`)) deleteRule.mutate(rule.id);
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
