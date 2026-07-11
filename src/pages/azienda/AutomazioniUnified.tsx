import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
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
  Headphones, Warehouse, UserCog, CheckSquare, Bell, Settings, Zap, Workflow, ShieldCheck,
} from "lucide-react";
import { AutomationFlowsList } from "@/components/marketing/automations/AutomationFlowsList";
import { AutomationOverviewStats } from "@/components/marketing/automations/AutomationOverviewStats";
import { AutomazioniTemplateGallery } from "@/components/automazioni/AutomazioniTemplateGallery";
import { BulkScheduleWizard } from "@/components/automazioni/BulkScheduleWizard";
import { CreaAutomazioneAIDialog } from "@/components/automazioni/CreaAutomazioneAIDialog";
import { CalendarClock } from "lucide-react";
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
  const isMobile = useIsMobile();
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const routePrefix = useMarketingRoutePrefix();
  const [categoriaAttiva, setCategoriaAttiva] = useState<CategoriaFiltro>("tutte");
  const [searchQuery, setSearchQuery] = useState("");
  const [vistaTemplates, setVistaTemplates] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [bulkScheduleWizardOpen, setBulkScheduleWizardOpen] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!effectiveCompany?.id) throw new Error("Azienda non disponibile. Riprova dopo il caricamento.");
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
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
              <Workflow className="h-3.5 w-3.5" />
              Automazioni operative
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-950">Flussi di lavoro</h1>
              <p className="max-w-2xl text-sm text-slate-600">
                Crea, organizza e controlla automazioni operative per CRM, cantieri, preventivi, notifiche e comunicazioni. Le sequenze pipeline restano nella sezione Marketing dedicata.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 border">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Pubblicazione con controlli anti errore
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 border">
                <Sparkles className="h-3.5 w-3.5 text-orange-500" />
                Template e assistente guidato
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="border-slate-200 bg-white/80 hover:bg-white" onClick={() => setFolderDialogOpen(true)} disabled={!effectiveCompany?.id}>
              <FolderPlus className="w-4 h-4 mr-1.5" />
              Crea Cartella
            </Button>
            <Button variant="outline" className="border-orange-200 bg-white/80 text-orange-700 hover:bg-orange-50" onClick={() => setAiDialogOpen(true)} disabled={!effectiveCompany?.id}>
              <Sparkles className="w-4 h-4 mr-1.5" />
              Crea tramite AI
            </Button>
            <Button variant="outline" className="border-violet-200 bg-white/80 text-violet-700 hover:bg-violet-50" onClick={() => setBulkScheduleWizardOpen(true)} disabled={!effectiveCompany?.id}>
              <CalendarClock className="w-4 h-4 mr-1.5" />
              Messaggio programmato
            </Button>
            <Button className="bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-200 hover:from-orange-600 hover:to-amber-600" onClick={() => navigate(`${routePrefix}/automazioni/nuova`)}>
              <Plus className="w-4 h-4 mr-1.5" />
              Crea Flusso
            </Button>
          </div>
        </div>
      </div>

      {/* KPI globali — non reagiscono ai filtri (come pattern ordini).
          La card "Attivi" filtra a status=published; "Errori 24h" sarebbe un
          deeplink al primo flusso con errori — per ora toggle visivo. */}
      {/* 6 KPI-vetrina + 7 count query: solo desktop. Su mobile vai dritto
          all'elenco flussi (operativo). */}
      {effectiveCompany?.id && !vistaTemplates && !isMobile && (
        <AutomationOverviewStats companyId={effectiveCompany.id} />
      )}

      {/* Filters row */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
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
              ? "border-orange-200 bg-orange-50 text-orange-700"
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

      <BulkScheduleWizard
        open={bulkScheduleWizardOpen}
        onClose={() => setBulkScheduleWizardOpen(false)}
      />

      <CreaAutomazioneAIDialog
        open={aiDialogOpen}
        onOpenChange={setAiDialogOpen}
      />
    </div>
  );
}
