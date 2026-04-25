// MP04 + MP-FINAL — Tab principale WhatsApp multi-numero.
// Empty state + grouping per purpose + StatsBar + ConnectNumberWizard 3-step.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, Plus, MessageSquare, HeadphonesIcon, Target, Megaphone, Bell, RefreshCw } from "lucide-react";
import {
  PURPOSE_LABELS,
  useWhatsAppNumbersByPurpose,
  type WAPurpose,
} from "@/hooks/whatsapp/useWhatsAppNumbers";
import { WhatsAppNumberCard } from "./WhatsAppNumberCard";
import { ConnectNumberWizard } from "./ConnectNumberWizard";
import { WhatsAppStatsBar } from "./WhatsAppStatsBar";

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
  const navigate = useNavigate();
  const { byPurpose, isLoading, isError, error, refetch, isFetching } = useWhatsAppNumbersByPurpose();
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

  if (isError) {
    return (
      <div className="p-4 md:p-6">
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-destructive" />
          <h3 className="font-semibold">Numeri WhatsApp non caricati</h3>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
            {(error as Error)?.message || "Non riesco a leggere la configurazione WhatsApp in questo momento."}
          </p>
          <Button className="mt-4" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Riprova
          </Button>
        </div>
      </div>
    );
  }

  const hasNumbers = configuredPurposes.length > 0;
  const hasAvailablePurposes = configuredPurposes.length < PURPOSE_ORDER.length;

  const openWizard = (purpose: WAPurpose | null) => {
    setWizardPurpose(purpose);
    setWizardOpen(true);
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <WhatsAppStatsBar />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">WhatsApp Business — Multi Numero</h2>
          <p className="text-sm text-muted-foreground">
            Gestisci fino a 5 numeri WhatsApp distinti, uno per ogni scopo operativo.
          </p>
        </div>
        <Button
          onClick={() => openWizard(null)}
          disabled={!hasAvailablePurposes}
          aria-label="Collega nuovo numero WhatsApp"
        >
          <Plus className="mr-2 h-4 w-4" />
          {hasAvailablePurposes ? "Collega nuovo numero" : "Limite 5/5 raggiunto"}
        </Button>
      </div>

      {!hasNumbers && (
        <div className="rounded-lg border-2 border-dashed border-muted-foreground/20 py-12 text-center">
          <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <h3 className="mt-4 text-lg font-semibold">Nessun numero collegato</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Collega il primo numero WhatsApp per iniziare. Potrai poi aggiungerne altri con scopi diversi.
          </p>
          <Button className="mt-6" onClick={() => openWizard(null)} disabled={!hasAvailablePurposes}>
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
                    <WhatsAppNumberCard
                      key={n.id}
                      number={n}
                      onOpenSettings={(id) => navigate(`/azienda/whatsapp/numeri/${id}`)}
                    />
                  ))}
                </div>
              </section>
            );
          })}

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
                      onClick={() => openWizard(p)}
                      className="rounded-lg border-2 border-dashed border-muted-foreground/20 p-4 text-left hover:border-primary hover:bg-primary/5 transition-colors"
                      aria-label={`Collega numero ${PURPOSE_LABELS[p]}`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{PURPOSE_LABELS[p]}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Clicca per collegare</p>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      <ConnectNumberWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        initialPurpose={wizardPurpose ?? undefined}
      />
    </div>
  );
}
