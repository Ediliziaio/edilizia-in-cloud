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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Search, LayoutTemplate, FolderPlus, Sparkles,
  Users, Megaphone, ClipboardList, Coins, Package, HardHat,
  Headphones, Warehouse, UserCog, CheckSquare, Bell, Settings, Zap, MoreHorizontal,
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
    <div className="space-y-4">
      {/* 09/09/2026 — L'intestazione occupava mezzo schermo: un badge, un
          titolo grande, due righe di descrizione, due chip decorativi e
          QUATTRO bottoni affiancati che andavano a capo. Chi apre questa
          pagina vuole vedere i suoi flussi. Restano il titolo, una riga di
          spiegazione e il tasto che serve davvero; le altre tre azioni stanno
          in un menu, dove non rubano spazio e non vanno mai a capo. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Flussi di lavoro</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Automazioni per CRM, cantieri, preventivi e notifiche.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" onClick={() => navigate(`${routePrefix}/automazioni/nuova`)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Crea flusso
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="px-2" aria-label="Altre azioni" disabled={!effectiveCompany?.id}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={() => setAiDialogOpen(true)}>
                <Sparkles className="mr-2 h-4 w-4" />
                Crea con l'assistente
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setBulkScheduleWizardOpen(true)}>
                <CalendarClock className="mr-2 h-4 w-4" />
                Messaggio programmato
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setFolderDialogOpen(true)}>
                <FolderPlus className="mr-2 h-4 w-4" />
                Nuova cartella
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {!vistaTemplates && (
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cerca flusso..."
              className="h-9 pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}

        <Select
          value={categoriaAttiva}
          onValueChange={(v) => setCategoriaAttiva(v as CategoriaFiltro)}
        >
          <SelectTrigger className="h-9 w-full sm:w-[190px]">
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
            flex h-9 items-center gap-1.5 px-3 rounded-lg text-sm border transition-colors flex-shrink-0
            ${vistaTemplates
              ? "border-primary/30 bg-primary/10 text-primary"
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
