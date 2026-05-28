import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import {
  DoorOpen,
  Home,
  Bath,
  Hammer,
  Umbrella,
  Square,
  Flame,
  Snowflake,
  Building,
  Check,
  Lock,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useVertical, type Vertical } from "@/hooks/useVertical";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
 * Preventivatore Verticalizzato Serramentisti — FASE 1.3
 *
 * Onboarding di scelta vertical aziendale. Griglia 3x3 di card.
 * FASE 1: solo "serramentista" e "generico" sono effettivamente selezionabili;
 * le altre 7 mostrano badge "Prossimamente" e sono disabilitate.
 *
 * On submit: update companies.vertical + onboarding_vertical_completed=true,
 * refresh auth context, redirect a /azienda (dashboard).
 */

// Mappa icona → componente lucide. Centralizzata qui per evitare una dep runtime
// dentro useVertical (che deve restare pure).
const ICON_MAP: Record<string, LucideIcon> = {
  DoorOpen,
  Home,
  Bath,
  Hammer,
  Umbrella,
  Square,
  Flame,
  Snowflake,
  Building,
};

export default function OnboardingVertical() {
  const navigate = useNavigate();
  const { effectiveCompany, refreshAuth } = useAuth();
  const { order, meta } = useVertical();
  const [selected, setSelected] = useState<Vertical | null>(null);
  // FASE 3.4 — dopo save di 'serramentista' proponiamo l'installazione catalogo.
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [savedVertical, setSavedVertical] = useState<Vertical | null>(null);

  const companyId = effectiveCompany?.id ?? null;

  const saveVertical = useMutation({
    mutationFn: async (vertical: Vertical) => {
      if (!companyId) {
        throw new Error("Azienda non identificata");
      }
      const { error } = await supabase
        .from("companies")
        .update({
          vertical,
          onboarding_vertical_completed: true,
        })
        .eq("id", companyId);
      if (error) throw new Error(error.message);
      return vertical;
    },
    onSuccess: async (vertical) => {
      toast.success("Settore salvato");
      await refreshAuth();
      // Se serramentista, mostra dialog per installazione catalogo esempio.
      // Altrimenti vai subito in dashboard.
      if (vertical === "serramentista") {
        setSavedVertical(vertical);
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

  // FASE 3.4 — installazione template catalogo serramenti
  const installCatalog = useMutation({
    mutationFn: async () => {
      if (!companyId || !savedVertical) {
        throw new Error("Dati azienda mancanti");
      }
      const { data, error } = await supabase.functions.invoke<{
        ok?: boolean;
        categorie_create?: number;
        famiglie_create?: number;
        assi_create?: number;
        valori_create?: number;
        error?: string;
      }>("installa-template-vertical", {
        body: { company_id: companyId, vertical: savedVertical },
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
    () => selected !== null && meta[selected].enabled && !saveVertical.isPending,
    [selected, meta, saveVertical.isPending],
  );

  return (
    <div className="min-h-screen bg-muted/30 py-6 sm:py-10 px-3 sm:px-4">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 sm:mb-8 text-center">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Quale è il tuo settore?</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-2">
            Scegli il settore principale della tua azienda. Potrai raffinare in seguito dalle impostazioni.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {order.map((v) => {
            const m = meta[v];
            const Icon = ICON_MAP[m.icon] ?? Building;
            const isSelected = selected === v;
            const isLocked = !m.enabled;
            return (
              <Card
                key={v}
                role="button"
                aria-pressed={isSelected}
                aria-disabled={isLocked}
                aria-label={`${m.label}${isLocked ? " (prossimamente)" : ""}`}
                tabIndex={isLocked ? -1 : 0}
                onClick={() => {
                  if (!isLocked) setSelected(v);
                }}
                onKeyDown={(e) => {
                  if (isLocked) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(v);
                  }
                }}
                className={cn(
                  "transition-all border-2 cursor-pointer relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                  isSelected && "border-primary ring-2 ring-primary/20 shadow-md",
                  !isSelected && !isLocked && "hover:border-primary/50 hover:shadow-sm",
                  isLocked && "opacity-60 cursor-not-allowed pointer-events-none",
                )}
              >
                {isLocked && (
                  <Badge variant="secondary" className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 gap-1 text-[10px] sm:text-xs">
                    <Lock className="h-3 w-3" aria-hidden="true" />
                    Prossimamente
                  </Badge>
                )}
                {isSelected && !isLocked && (
                  <Badge className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 gap-1 bg-primary text-primary-foreground text-[10px] sm:text-xs">
                    <Check className="h-3 w-3" aria-hidden="true" />
                    Selezionato
                  </Badge>
                )}
                <CardHeader className="space-y-2 sm:space-y-3 p-4 sm:p-6">
                  <div className={cn(
                    "inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                    isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                  )}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-base sm:text-lg">{m.label}</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">{m.description}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0" />
              </Card>
            );
          })}
        </div>

        <footer className="mt-6 sm:mt-8 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3">
          <Button
            variant="ghost"
            onClick={() => {
              setSelected("generico");
              saveVertical.mutate("generico");
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

      {/* FASE 3.4 — Dialog post-save: proposta installazione catalogo serramenti */}
      <Dialog
        open={installDialogOpen}
        onOpenChange={(open) => {
          // Non chiudibile durante l'installazione in corso
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
