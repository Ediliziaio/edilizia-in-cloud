// MP04 — Tab principale WhatsApp multi-numero (sostituisce WhatsAppTabUnified).

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, MessageSquare, HeadphonesIcon, Target, Megaphone, Bell } from "lucide-react";
import {
  PURPOSE_LABELS,
  useWhatsAppNumbersByPurpose,
  type WAPurpose,
} from "@/hooks/whatsapp/useWhatsAppNumbers";
import { WhatsAppNumberCard } from "./WhatsAppNumberCard";
import { PurposeSelector } from "./PurposeSelector";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PURPOSE_ORDER: WAPurpose[] = [
  "bot_operativo",
  "assistenza",
  "lead",
  "marketing",
  "notifiche",
];

const PURPOSE_ICONS: Record<WAPurpose, typeof MessageSquare> = {
  bot_operativo: MessageSquare,
  assistenza: HeadphonesIcon,
  lead: Target,
  marketing: Megaphone,
  notifiche: Bell,
};

export function WhatsAppMultiNumeroTab() {
  const { byPurpose, isLoading } = useWhatsAppNumbersByPurpose();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardPurpose, setWizardPurpose] = useState<WAPurpose | null>(null);

  const configuredPurposes = PURPOSE_ORDER.filter(
    (p) => (byPurpose[p] ?? []).length > 0,
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" aria-live="polite">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="sr-only">Caricamento numeri WhatsApp</span>
      </div>
    );
  }

  const hasNumbers = configuredPurposes.length > 0;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">WhatsApp Business — Multi Numero</h2>
          <p className="text-sm text-muted-foreground">
            Gestisci fino a 5 numeri WhatsApp distinti, uno per ogni scopo operativo.
          </p>
        </div>
        <Button
          onClick={() => {
            setWizardPurpose(null);
            setWizardOpen(true);
          }}
          aria-label="Collega nuovo numero WhatsApp"
        >
          <Plus className="mr-2 h-4 w-4" />
          Collega nuovo numero
        </Button>
      </div>

      {!hasNumbers && (
        <div className="rounded-lg border-2 border-dashed border-muted-foreground/20 py-12 text-center">
          <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <h3 className="mt-4 text-lg font-semibold">Nessun numero collegato</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Collega il primo numero WhatsApp per iniziare. Potrai poi aggiungerne altri con scopi diversi.
          </p>
          <Button
            className="mt-6"
            onClick={() => {
              setWizardPurpose(null);
              setWizardOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Collega primo numero
          </Button>
        </div>
      )}

      {hasNumbers && (
        <div className="space-y-6">
          {PURPOSE_ORDER.map((p) => {
            const numbers = byPurpose[p] ?? [];
            if (numbers.length === 0) return null;
            const Icon = PURPOSE_ICONS[p];
            return (
              <section key={p}>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {PURPOSE_LABELS[p]}
                </h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {numbers.map((n) => (
                    <WhatsAppNumberCard key={n.id} number={n} />
                  ))}
                </div>
              </section>
            );
          })}

          {/* Mostra purpose non ancora configurati come CTA secondari */}
          {PURPOSE_ORDER.filter((p) => (byPurpose[p] ?? []).length === 0).length > 0 && (
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Scopi disponibili
              </h3>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {PURPOSE_ORDER.filter((p) => (byPurpose[p] ?? []).length === 0).map((p) => {
                  const Icon = PURPOSE_ICONS[p];
                  return (
                    <button
                      key={p}
                      onClick={() => {
                        setWizardPurpose(p);
                        setWizardOpen(true);
                      }}
                      className="rounded-lg border-2 border-dashed border-muted-foreground/20 p-4 text-left hover:border-primary hover:bg-primary/5 transition-colors"
                      aria-label={`Collega numero ${PURPOSE_LABELS[p]}`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{PURPOSE_LABELS[p]}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Clicca per collegare
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Collega nuovo numero WhatsApp</DialogTitle>
            <DialogDescription>
              Scegli lo scopo del numero, poi collegalo via Meta Embedded Signup.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">1. Scopo</h4>
              <PurposeSelector
                selected={wizardPurpose}
                onSelect={setWizardPurpose}
                disabledPurposes={configuredPurposes}
              />
            </div>

            {wizardPurpose && (
              <div className="rounded-lg border bg-muted/30 p-4">
                <h4 className="text-sm font-medium mb-2">2. Collega su Meta</h4>
                <p className="text-xs text-muted-foreground mb-3">
                  Verrai rediretto al flusso Meta Embedded Signup per autorizzare l'accesso al numero.
                  Al ritorno il numero sarà configurato con scopo <b>{PURPOSE_LABELS[wizardPurpose]}</b>.
                </p>
                <Button
                  onClick={() => {
                    // In MP04 la logica Meta Embedded Signup esistente in MP1 viene
                    // riutilizzata: passiamo `purpose` come query param al redirect.
                    window.location.href = `/azienda/settings/whatsapp?connect=1&purpose=${wizardPurpose}`;
                  }}
                  disabled={!wizardPurpose}
                >
                  Vai a Meta →
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setWizardOpen(false)}>
              Annulla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
