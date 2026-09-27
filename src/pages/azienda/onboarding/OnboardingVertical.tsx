import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import {
  Bath,
  Construction,
  Building,
  Zap,
  Paintbrush,
  Layers3,
  Sun,
  Blinds,
  Droplets,
  Wrench,
  Package,
  Hammer,
  Home,
  AppWindow,
  DoorOpen,
  Check,
  Lock,
  Clock,
  AlertCircle,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { puoScegliereSettore } from "@/lib/auth/ruoloAzienda";
import { useAllBusinessVerticals } from "@/hooks/useBusinessVertical";
import { useModuliVendita, type ModuloVendutaSlug } from "@/lib/moduli-vendita";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { captureVelocityError } from "@/lib/velocity/sentry";

/**
 * Onboarding di scelta settore (vertical) aziendale.
 *
 * FONTE: catalogo `business_verticals` (useAllBusinessVerticals) — 15 verticali
 * tutti abilitati, ordinati per sort_order. Sostituisce la vecchia lista
 * hardcoded (9 voci, quasi tutte "Prossimamente").
 *
 * On submit scrive DUE campi su companies:
 *  - `vertical_key`  → moderno (FK business_verticals, guida personas/KB/render);
 *  - `vertical`      → legacy mappato, per retro-compat con i consumatori
 *                      `useVertical` (CompanyLayout, tariffe, listino manutenzione).
 * + `onboarding_vertical_completed = true`. Poi refresh auth e redirect.
 */

// Icona business_verticals (stringa lowercase/kebab) → componente lucide.
const ICON_MAP: Record<string, LucideIcon> = {
  bath: Bath,
  construction: Construction,
  building: Building,
  zap: Zap,
  paintbrush: Paintbrush,
  "layers-3": Layers3,
  sun: Sun,
  blinds: Blinds,
  droplets: Droplets,
  wrench: Wrench,
  package: Package,
  hammer: Hammer,
  home: Home,
  window: AppWindow,
  "door-open": DoorOpen,
};

/**
 * Mappa vertical_key (moderno) → vertical legacy (vincolo companies_vertical_check).
 * I key senza un equivalente legacy preciso ricadono su "generico" (default):
 * il modulo moderno (vertical_key) resta corretto, il legacy dà l'esperienza base.
 */
const VERTICAL_KEY_TO_LEGACY: Record<string, string> = {
  serramentisti: "serramentista",
  tettisti: "tetti",
  bagnisti: "bagno",
  ristrutturatori_interni: "ristrutturazione",
  fotovoltaico: "fotovoltaico",
  pergolisti: "tende_da_sole",
  persianisti: "serramentista",
  porte_blindate: "serramentista",
  porte_interne: "serramentista",
  edili_generaliste: "generico",
};
function toLegacyVertical(key: string): string {
  return VERTICAL_KEY_TO_LEGACY[key] ?? "generico";
}

/**
 * Mappa vertical_key → modulo verticale di vendita (lib/moduli-vendita).
 * Serve a mostrare nell'onboarding se il settore scelto ha uno strumento dedicato
 * e in che stato è (incluso nel piano / da attivare / in arrivo) — SENZA attivarlo
 * (i moduli sono add-on a pagamento gated da piano: rispettiamo il paywall).
 * I key senza modulo dedicato (pergole, piscine, giardini, pavimenti…) non mostrano nulla.
 */
const VERTICAL_KEY_TO_MODULE_SLUG: Record<string, ModuloVendutaSlug> = {
  serramentisti: "serramenti",
  persianisti: "serramenti",
  porte_blindate: "serramenti",
  porte_interne: "serramenti",
  fotovoltaico: "fotovoltaico",
  tettisti: "tetti",
  bagnisti: "bagni",
  facciatisti: "ristrutturazione",
};

export default function OnboardingVertical() {
  const navigate = useNavigate();
  const { effectiveCompany, refreshAuth, role, userRoles, isImpersonating } = useAuth();
  // Il settore lo sceglie il titolare o l'amministratore. Chi arriva qui da
  // un link o da una versione vecchia dell'app vede perché non può salvarlo,
  // e il database comunque rifiuterebbe la modifica.
  const puoScegliere = isImpersonating || puoScegliereSettore(role, userRoles);
  const { data: verticals = [], isLoading, isError, isRefetching, refetch } = useAllBusinessVerticals();
  const { moduli } = useModuliVendita();
  const [selected, setSelected] = useState<string | null>(null); // vertical_key
  // Dopo save di un verticale con catalogo pronto (serramenti) proponiamo l'install.
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [savedLegacy, setSavedLegacy] = useState<string | null>(null);

  const companyId = effectiveCompany?.id ?? null;

  // Modulo verticale legato al settore selezionato (se esiste): mostriamo lo
  // stato (incluso nel piano / da attivare / in arrivo) — paywall rispettato,
  // nessuna attivazione automatica.
  const selectedModule = useMemo(() => {
    if (!selected) return null;
    const slug = VERTICAL_KEY_TO_MODULE_SLUG[selected];
    if (!slug) return null;
    return moduli.find((m) => m.modulo.slug === slug) ?? null;
  }, [selected, moduli]);

  const saveVertical = useMutation({
    mutationFn: async (verticalKey: string) => {
      if (!companyId) {
        throw new Error("Azienda non identificata");
      }
      if (!puoScegliere) {
        throw new Error("Il settore lo sceglie il titolare o l'amministratore dell'azienda");
      }
      const legacy = toLegacyVertical(verticalKey);
      const { error } = await supabase
        .from("companies")
        .update({
          vertical_key: verticalKey,
          vertical: legacy,
          onboarding_vertical_completed: true,
        })
        .eq("id", companyId);
      if (error) throw new Error(error.message);
      return { verticalKey, legacy };
    },
    onSuccess: async ({ legacy }) => {
      toast.success("Settore salvato");
      await refreshAuth();
      // Catalogo di esempio disponibile per i serramentisti.
      if (legacy === "serramentista") {
        setSavedLegacy(legacy);
        setInstallDialogOpen(true);
      } else {
        navigate("/azienda", { replace: true });
      }
    },
    onError: (err: Error) => {
      captureVelocityError("onboarding.vertical.save", err, { companyId });
      toast.error("Errore salvataggio settore", { description: err.message });
    },
  });

  // Installazione template catalogo (serramenti) — invariata.
  const installCatalog = useMutation({
    mutationFn: async () => {
      if (!companyId || !savedLegacy) {
        throw new Error("Dati azienda mancanti");
      }
      const { data, error } = await supabase.functions.invoke<{
        ok?: boolean;
        categorie_create?: number;
        famiglie_create?: number;
        error?: string;
      }>("installa-template-vertical", {
        body: { company_id: companyId, vertical: savedLegacy },
      });
      if (error) throw new Error(error.message);
      if (!data || data.ok !== true) {
        throw new Error(data?.error ?? "Installazione non riuscita");
      }
      return data;
    },
    onSuccess: (data) => {
      const cats = data.categorie_create ?? 0;
      const fams = data.famiglie_create ?? 0;
      toast.success("Catalogo installato", {
        description: `${cats} categorie, ${fams} famiglie create.`,
      });
      setInstallDialogOpen(false);
      navigate("/azienda", { replace: true });
    },
    onError: (err: Error) => {
      captureVelocityError("onboarding.vertical.install_catalog", err, { companyId });
      toast.error("Errore installazione catalogo", { description: err.message });
    },
  });

  const canSubmit = useMemo(
    () => puoScegliere && selected !== null && !saveVertical.isPending,
    [puoScegliere, selected, saveVertical.isPending],
  );

  if (!puoScegliere) {
    return (
      <div className="min-h-screen bg-muted/30 py-10 px-4">
        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <CardTitle>Il settore lo sceglie l'amministratore</CardTitle>
            <CardDescription>
              Il settore principale dell'azienda lo imposta il titolare o l'amministratore.
              Tu puoi lavorare normalmente: quando lo avranno scelto, lo vedrai applicato.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/azienda", { replace: true })}>Vai alla tua area</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-6 sm:py-10 px-3 sm:px-4">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 sm:mb-8 text-center">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Quale è il tuo settore?</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-2">
            Scegli il settore principale della tua azienda. Potrai raffinare in seguito dalle impostazioni.
          </p>
        </header>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-[120px] w-full rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <Card className="border-red-200 dark:border-red-900/40">
            <CardContent className="py-12 text-center">
              <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-500/70" aria-hidden="true" />
              <p className="text-sm font-medium mb-1">Impossibile caricare i settori</p>
              <p className="text-xs text-muted-foreground mb-4">
                Si è verificato un errore nel recupero dei settori. Controlla la connessione e riprova.
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
                <Loader2 className={cn("h-3.5 w-3.5", isRefetching && "animate-spin")} aria-hidden="true" /> Riprova
              </Button>
            </CardContent>
          </Card>
        ) : verticals.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Nessun settore disponibile al momento. Riprova più tardi o contatta il supporto.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {verticals.map((v) => {
              const Icon = ICON_MAP[v.icon ?? ""] ?? Building;
              const isSelected = selected === v.vertical_key;
              const color = v.color ?? null;
              return (
                <Card
                  key={v.vertical_key}
                  role="button"
                  aria-pressed={isSelected}
                  aria-label={v.display_name}
                  tabIndex={0}
                  onClick={() => setSelected(v.vertical_key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(v.vertical_key);
                    }
                  }}
                  className={cn(
                    "transition-all border-2 cursor-pointer relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                    isSelected ? "border-primary ring-2 ring-primary/20 shadow-md" : "hover:border-primary/50 hover:shadow-sm",
                  )}
                >
                  {isSelected && (
                    <Badge className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 gap-1 bg-primary text-primary-foreground text-[10px] sm:text-xs">
                      <Check className="h-3 w-3" aria-hidden="true" />
                      Selezionato
                    </Badge>
                  )}
                  <CardHeader className="space-y-2 sm:space-y-3 p-4 sm:p-6">
                    <div
                      className={cn(
                        "inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                        isSelected ? "bg-primary text-primary-foreground" : !color && "bg-muted text-foreground",
                      )}
                      style={!isSelected && color ? { backgroundColor: `${color}1a`, color } : undefined}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <CardTitle className="text-base sm:text-lg">{v.display_name}</CardTitle>
                    {v.description && (
                      <CardDescription className="text-xs sm:text-sm">{v.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0" />
                </Card>
              );
            })}
          </div>
        )}

        {selectedModule && !selectedModule.isLoading && (
          <div
            className={cn(
              "mt-6 rounded-xl border p-4 flex items-start gap-3 text-sm",
              selectedModule.stato === "attivo"
                ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                : selectedModule.stato === "coming_soon"
                  ? "border-blue-200 bg-blue-50/60 dark:border-blue-900/40 dark:bg-blue-950/20"
                  : "border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20",
            )}
          >
            <span className="mt-0.5 shrink-0">
              {selectedModule.stato === "attivo" ? (
                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              ) : selectedModule.stato === "coming_soon" ? (
                <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              ) : (
                <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              )}
            </span>
            <p className="leading-relaxed">
              {selectedModule.stato === "attivo" && (
                <>
                  <strong>Modulo {selectedModule.modulo.nome} incluso nel tuo piano.</strong>{" "}
                  Lo strumento dedicato sarà subito disponibile dopo l'accesso.
                </>
              )}
              {selectedModule.stato === "bloccato" && (
                <>
                  <strong>Questo settore usa il modulo {selectedModule.modulo.nome}</strong> (€
                  {selectedModule.modulo.prezzoMensile}/mese, incluso nei piani Pro ed Enterprise). Potrai
                  attivarlo dalla sezione <em>Moduli</em> dopo l'accesso — il settore resta salvato.
                </>
              )}
              {selectedModule.stato === "coming_soon" && (
                <>
                  <strong>Il modulo {selectedModule.modulo.nome} è in arrivo.</strong> Per ora avrai gli
                  strumenti generali; ti avviseremo al rilascio.
                </>
              )}
            </p>
          </div>
        )}

        <footer className="mt-6 sm:mt-8 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3">
          <Button
            variant="ghost"
            onClick={() => {
              setSelected("edili_generaliste");
              saveVertical.mutate("edili_generaliste");
            }}
            disabled={saveVertical.isPending}
            className="h-10 w-full sm:w-auto"
          >
            Salta per ora
          </Button>
          <Button
            onClick={() => selected && saveVertical.mutate(selected)}
            disabled={!canSubmit}
            className="h-10 w-full sm:w-auto"
          >
            {saveVertical.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                Salvataggio…
              </>
            ) : (
              "Conferma settore"
            )}
          </Button>
        </footer>
      </div>

      {/* Dialog post-save: proposta installazione catalogo serramenti */}
      <Dialog
        open={installDialogOpen}
        onOpenChange={(open) => {
          if (installCatalog.isPending) return;
          setInstallDialogOpen(open);
        }}
      >
        <DialogContent className="w-[96vw] sm:w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Installa il catalogo di esempio</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Vuoi installare il catalogo di esempio serramenti? Troverai 11 categorie e oltre 30 famiglie
              (finestre, porte finestre, scorrevoli, persiane, tapparelle, zanzariere…) già strutturate
              con assi e varianti — <strong>senza prezzi</strong>. Potrai modificarlo liberamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setInstallDialogOpen(false);
                navigate("/azienda", { replace: true });
              }}
              disabled={installCatalog.isPending}
              className="h-10 w-full sm:w-auto"
            >
              Parti da zero
            </Button>
            <Button
              onClick={() => installCatalog.mutate()}
              disabled={installCatalog.isPending}
              className="h-10 w-full sm:w-auto"
            >
              {installCatalog.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  Installazione…
                </>
              ) : (
                "Installa catalogo"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
