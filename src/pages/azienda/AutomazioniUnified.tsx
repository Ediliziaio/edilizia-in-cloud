import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMarketingRoutePrefix } from "@/hooks/useMarketingRoutePrefix";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreateFolderDialog } from "@/components/email-marketing/CreateFolderDialog";
import {
  Plus, Search, LayoutTemplate, FolderPlus, Sparkles,
  Users, Megaphone, ClipboardList, Coins, Package, HardHat,
  Headphones, Warehouse, UserCog, CheckSquare, Bell, Settings, Zap,
} from "lucide-react";
import { AutomationFlowsList } from "@/components/marketing/automations/AutomationFlowsList";
import { AutomationOverviewStats } from "@/components/marketing/automations/AutomationOverviewStats";
import { AutomazioniTemplateGallery } from "@/components/automazioni/AutomazioniTemplateGallery";
import type { ReactNode } from "react";

type CategoriaFiltro = "tutte" | "crm" | "marketing" | "cantieri" | "task" | "generale" | "notifiche" | "preventivi" | "fatturazione" | "assistenza" | "ordini" | "magazzino" | "hr";

const CATEGORIE: { value: CategoriaFiltro; label: string; icon: ReactNode }[] = [
  { value: "tutte", label: "Tutte le categorie", icon: <Zap className="h-4 w-4" /> },
  { value: "crm", label: "CRM & Vendite", icon: <Users className="h-4 w-4" /> },
  { value: "marketing", label: "Marketing", icon: <Megaphone className="h-4 w-4" /> },
  { value: "preventivi", label: "Preventivi", icon: <ClipboardList className="h-4 w-4" /> },
  { value: "fatturazione", label: "Fatturazione", icon: <Coins className="h-4 w-4" /> },
  { value: "ordini", label: "Ordini", icon: <Package className="h-4 w-4" /> },
  { value: "cantieri", label: "Cantieri", icon: <HardHat className="h-4 w-4" /> },
  { value: "assistenza", label: "Assistenza", icon: <Headphones className="h-4 w-4" /> },
  { value: "magazzino", label: "Magazzino", icon: <Warehouse className="h-4 w-4" /> },
  { value: "hr", label: "HR", icon: <UserCog className="h-4 w-4" /> },
  { value: "task", label: "Task", icon: <CheckSquare className="h-4 w-4" /> },
  { value: "notifiche", label: "Notifiche", icon: <Bell className="h-4 w-4" /> },
  { value: "generale", label: "Generale", icon: <Settings className="h-4 w-4" /> },
];

export default function AutomazioniUnified() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const routePrefix = useMarketingRoutePrefix();
  const [categoriaAttiva, setCategoriaAttiva] = useState<CategoriaFiltro>("tutte");
  const [searchQuery, setSearchQuery] = useState("");
  const [vistaTemplates, setVistaTemplates] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      const safeName = name.trim().slice(0, 100);
      if (!safeName) throw new Error("Il nome della cartella non può essere vuoto.");
      const { error } = await supabase.from("automation_folders").insert({
        company_id: effectiveCompany!.id,
        name: safeName,
        parent_id: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-folders-all"] });
      toast({ title: "Cartella creata" });
      setFolderDialogOpen(false);
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Elenco Flusso di lavoro</h1>
          <p className="text-muted-foreground text-sm">
            Crea e gestisci automazioni visuali per ogni area della tua azienda.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setFolderDialogOpen(true)}>
            <FolderPlus className="w-4 h-4 mr-1.5" />
            Crea Cartella
          </Button>
          <Button variant="outline" onClick={() => navigate(`${routePrefix}/automazioni/nuova`)}>
            <Sparkles className="w-4 h-4 mr-1.5" />
            Crea tramite AI
          </Button>
          <Button onClick={() => navigate(`${routePrefix}/automazioni/nuova`)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Crea Flusso di lavoro
          </Button>
        </div>
      </div>

      {/* KPI globali — non reagiscono ai filtri (come pattern ordini).
          La card "Attivi" filtra a status=published; "Errori 24h" sarebbe un
          deeplink al primo flusso con errori — per ora toggle visivo. */}
      {effectiveCompany?.id && !vistaTemplates && (
        <AutomationOverviewStats companyId={effectiveCompany.id} />
      )}

      {/* Filters row */}
      <div className="flex items-center gap-3">
        {!vistaTemplates && (
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cerca flusso di lavoro..."
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
                  {cat.icon}
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
          searchQuery={searchQuery}
          categoryFilter={categoriaAttiva === "tutte" ? null : categoriaAttiva}
        />
      )}

      <CreateFolderDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        onConfirm={(name) => createFolderMutation.mutate(name)}
        isPending={createFolderMutation.isPending}
      />
    </div>
  );
}
