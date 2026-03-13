import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, LayoutTemplate } from "lucide-react";
import { AutomationFlowsList } from "@/components/marketing/automations/AutomationFlowsList";
import { AutomazioniTemplateGallery } from "@/components/automazioni/AutomazioniTemplateGallery";
import type { AutomationRule } from "@/hooks/useAutomazioni";
import { AutomazioneFormDrawer } from "@/components/automazioni/AutomazioneFormDrawer";

type CategoriaFiltro = "tutte" | "crm" | "marketing" | "cantieri" | "task" | "generale" | "notifiche";

const CATEGORIE: { value: CategoriaFiltro; label: string; emoji: string }[] = [
  { value: "tutte", label: "Tutte", emoji: "⚡" },
  { value: "crm", label: "CRM & Vendite", emoji: "👥" },
  { value: "marketing", label: "Marketing", emoji: "📣" },
  { value: "cantieri", label: "Cantieri", emoji: "🏗️" },
  { value: "task", label: "Task", emoji: "✅" },
  { value: "notifiche", label: "Notifiche", emoji: "🔔" },
  { value: "generale", label: "Generale", emoji: "⚙️" },
];

export default function AutomazioniUnified() {
  const navigate = useNavigate();
  const [categoriaAttiva, setCategoriaAttiva] = useState<CategoriaFiltro>("tutte");
  const [searchQuery, setSearchQuery] = useState("");
  const [vistaTemplates, setVistaTemplates] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [folderId, setFolderId] = useState<string | null>(null);

  // Template gallery state
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Automazioni</h1>
          <p className="text-muted-foreground text-sm">
            Crea e gestisci automazioni visuali per ogni area della tua azienda.
          </p>
        </div>
        <Button onClick={() => navigate("/azienda/marketing/automazioni/nuova")}>
          <Plus className="w-4 h-4 mr-1.5" />
          Crea Automazione
        </Button>
      </div>

      {/* Category filter pills + view toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {CATEGORIE.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategoriaAttiva(cat.value)}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                whitespace-nowrap transition-all
                ${categoriaAttiva === cat.value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted"
                }
              `}
            >
              <span>{cat.emoji}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        <button
          onClick={() => setVistaTemplates(!vistaTemplates)}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors flex-shrink-0
            ${vistaTemplates
              ? "border-primary text-primary bg-primary/10"
              : "border-border text-muted-foreground hover:bg-muted"
            }
          `}
        >
          <LayoutTemplate className="w-4 h-4" />
          Template
        </button>
      </div>

      {/* Search bar */}
      {!vistaTemplates && (
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Cerca automazione..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      {/* Content */}
      {vistaTemplates ? (
        <>
          <AutomazioniTemplateGallery
            categoria={categoriaAttiva === "tutte" ? "tutte" : categoriaAttiva}
            onCustomizza={(template) => {
              setEditingRule(template);
              setShowForm(true);
            }}
          />
          {showForm && (
            <AutomazioneFormDrawer
              rule={editingRule}
              onClose={() => { setShowForm(false); setEditingRule(null); }}
            />
          )}
        </>
      ) : (
        <AutomationFlowsList
          statusFilter={statusFilter}
          searchQuery={searchQuery}
          folderId={folderId}
          onNavigateFolder={setFolderId}
          categoryFilter={categoriaAttiva === "tutte" ? null : categoriaAttiva}
        />
      )}
    </div>
  );
}
