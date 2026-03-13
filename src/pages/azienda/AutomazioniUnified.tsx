import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, LayoutTemplate } from "lucide-react";
import { AutomationFlowsList } from "@/components/marketing/automations/AutomationFlowsList";
import { AutomazioniTemplateGallery } from "@/components/automazioni/AutomazioniTemplateGallery";

type CategoriaFiltro = "tutte" | "crm" | "marketing" | "cantieri" | "task" | "generale" | "notifiche" | "preventivi" | "fatturazione" | "assistenza" | "ordini" | "magazzino" | "hr";

const CATEGORIE: { value: CategoriaFiltro; label: string; emoji: string }[] = [
  { value: "tutte", label: "Tutte le categorie", emoji: "⚡" },
  { value: "crm", label: "CRM & Vendite", emoji: "👥" },
  { value: "marketing", label: "Marketing", emoji: "📣" },
  { value: "preventivi", label: "Preventivi", emoji: "📋" },
  { value: "fatturazione", label: "Fatturazione", emoji: "💰" },
  { value: "ordini", label: "Ordini", emoji: "📦" },
  { value: "cantieri", label: "Cantieri", emoji: "🏗️" },
  { value: "assistenza", label: "Assistenza", emoji: "🎧" },
  { value: "magazzino", label: "Magazzino", emoji: "🏭" },
  { value: "hr", label: "HR", emoji: "🧑‍💼" },
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

      {/* Filters row: Search + Category dropdown + Template toggle */}
      <div className="flex items-center gap-3">
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

        <Select
          value={categoriaAttiva}
          onValueChange={(v) => setCategoriaAttiva(v as CategoriaFiltro)}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIE.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                <span className="flex items-center gap-2">
                  <span>{cat.emoji}</span>
                  <span>{cat.label}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />

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

      {/* Content */}
      {vistaTemplates ? (
        <AutomazioniTemplateGallery
          categoriaFiltro={categoriaAttiva === "tutte" ? null : categoriaAttiva}
        />
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
