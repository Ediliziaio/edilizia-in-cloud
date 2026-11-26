import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
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
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { BOTTONE_NUOVO, BOTTONE_SECONDARIO, RICERCA_BARRA, TENDINA_STATO_BARRA } from "@/components/orders/TestataScheda";

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
  const t = useT();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const routePrefix = useMarketingRoutePrefix();
  const [categoriaAttiva, setCategoriaAttiva] = useState<CategoriaFiltro>("tutte");
  const [searchQuery, setSearchQuery] = useState("");
  const [vistaTemplates, setVistaTemplates] = useState(false);
  const [cercaTemplate, setCercaTemplate] = useState("");
  const [livelloTemplate, setLivelloTemplate] = useState("tutti");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [bulkScheduleWizardOpen, setBulkScheduleWizardOpen] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!effectiveCompany?.id) throw new Error(t("Azienda non disponibile. Riprova dopo il caricamento."));
      const safeName = name.trim().slice(0, 100);
      if (!safeName) throw new Error(t("Il nome della cartella non può essere vuoto."));
      const { error } = await supabase.from("automation_folders").insert({
        company_id: effectiveCompany!.id,
        name: safeName,
        parent_id: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-folders-all"] });
      toast({ title: t("Cartella creata") });
      setFolderDialogOpen(false);
    },
    onError: (err: any) => toast({ title: t("Errore"), description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {/* 09/09/2026 — L'intestazione occupava mezzo schermo: un badge, un
          titolo grande, due righe di descrizione, due chip decorativi e
          QUATTRO bottoni affiancati che andavano a capo. Chi apre questa
          pagina vuole vedere i suoi flussi. Restano il titolo, una riga di
          spiegazione e il tasto che serve davvero; le altre tre azioni stanno
          in un menu, dove non rubano spazio e non vanno mai a capo. */}
      {/* Da tablet i bottoni restano in riga col titolo: la riga dei numeri,
          lunga, li mandava a capo sotto il titolo a 768 e a 1024. */}
      <div className="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap">
        <div className="min-w-0 sm:flex-1">
          <h1 className="text-xl font-semibold tracking-tight max-md:text-lg">{t("Flussi di lavoro")}</h1>
          {/* 19/09/2026 — Sotto il titolo i numeri del motore, al posto della
              fascia di sei riquadri. Solo desktop: su mobile le cinque query di
              conteggio non valgono lo spazio, resta la descrizione. */}
          {/* 25/09/2026 — Telefono: le automazioni si guardano, non si creano né si
              modificano (regola dell'utente). Al posto della descrizione, dove si fanno. */}
          {/* 25/11/2026 — Testata come Commesse: da computer niente frase sotto il titolo
              (resta per i lettori di schermo). */}
          {effectiveCompany?.id && !isMobile ? (
            // I numeri e l'avviso di allarme restano in vista: sono informazioni, non una descrizione.
            <AutomationOverviewStats companyId={effectiveCompany.id} />
          ) : isMobile ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t("si creano e si modificano da computer o tablet")}</p>
          ) : (
            <p className="sr-only">
              {t("Automazioni per CRM, cantieri, preventivi e notifiche.")}
            </p>
          )}
        </div>
        <div className={cn("flex shrink-0 items-center gap-1.5", isMobile && "hidden")}>
          <Button size="sm" className={BOTTONE_NUOVO} onClick={() => navigate(`${routePrefix}/automazioni/nuova`)}>
            <Plus />
            {t("Crea flusso")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 w-8 px-0" aria-label={t("Altre azioni")} disabled={!effectiveCompany?.id}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={() => setAiDialogOpen(true)}>
                <Sparkles className="mr-2 h-4 w-4" />
                {t("Crea con l'assistente")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setBulkScheduleWizardOpen(true)}>
                <CalendarClock className="mr-2 h-4 w-4" />
                {t("Messaggio programmato")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setFolderDialogOpen(true)}>
                <FolderPlus className="mr-2 h-4 w-4" />
                {t("Nuova cartella")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Filters row — vale anche per i template: ricerca, categoria e livello
          stanno in questa riga. Prima la galleria aggiungeva sotto un secondo
          titolo, una frase e un'altra casella di ricerca. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className={cn(RICERCA_BARRA, "max-sm:w-full")}>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={vistaTemplates ? t("Cerca template") : t("Cerca flusso")}
            placeholder={vistaTemplates ? t("Cerca template...") : t("Cerca flusso...")}
            className="h-8 pl-8 text-xs"
            value={vistaTemplates ? cercaTemplate : searchQuery}
            onChange={(e) => (vistaTemplates ? setCercaTemplate : setSearchQuery)(e.target.value)}
          />
        </div>

        <Select
          value={categoriaAttiva}
          onValueChange={(v) => setCategoriaAttiva(v as CategoriaFiltro)}
        >
          <SelectTrigger aria-label={t("Categoria automazioni")} className={cn(TENDINA_STATO_BARRA, "max-md:hidden")}>
            <SelectValue placeholder={t("Categoria")} />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIE.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                <span className="flex items-center gap-2">
                  {cat.icon}
                  <span>{t(cat.label)}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {vistaTemplates && (
          <Select value={livelloTemplate} onValueChange={setLivelloTemplate}>
            <SelectTrigger className="h-8 w-[150px] shrink-0 text-xs max-md:hidden" aria-label={t("Livello")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">{t("Tutti i livelli")}</SelectItem>
              <SelectItem value="base">{t("Base")}</SelectItem>
              <SelectItem value="intermedio">{t("Intermedio")}</SelectItem>
              <SelectItem value="avanzato">{t("Avanzato")}</SelectItem>
            </SelectContent>
          </Select>
        )}

        {(categoriaAttiva !== "tutte" || (vistaTemplates ? cercaTemplate.trim() || livelloTemplate !== "tutti" : searchQuery.trim())) && (
          <Button variant="ghost" size="sm" className={BOTTONE_SECONDARIO} onClick={() => { setCategoriaAttiva("tutte"); setSearchQuery(""); setCercaTemplate(""); setLivelloTemplate("tutti"); }}>{t("Azzera filtri")}</Button>
        )}
        <div className="flex-1" />

        <button
          onClick={() => setVistaTemplates(!vistaTemplates)}
          className={`
            flex h-8 items-center gap-1.5 px-2.5 rounded-md text-xs border transition-colors flex-shrink-0 max-md:hidden
            ${vistaTemplates
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-muted"
            }
          `}
        >
          <LayoutTemplate className="h-3.5 w-3.5" />
          {t("Template")}
        </button>
      </div>

      {/* Content — i modelli servono a creare: sul telefono resta l'elenco */}
      {vistaTemplates && !isMobile ? (
        <AutomazioniTemplateGallery
          categoriaFiltro={categoriaAttiva === "tutte" ? null : categoriaAttiva}
          cerca={cercaTemplate}
          livello={livelloTemplate === "tutti" ? null : livelloTemplate}
        />
      ) : (
        <AutomationFlowsList
          searchQuery={searchQuery}
          categoryFilter={categoriaAttiva === "tutte" ? null : categoriaAttiva}
          onResetFilters={() => { setCategoriaAttiva("tutte"); setSearchQuery(""); }}
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
