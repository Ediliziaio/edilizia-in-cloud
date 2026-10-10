// MP04 + MP-FINAL — Tab principale WhatsApp multi-numero.
// Una riga di riepilogo + i numeri raggruppati per scopo (con i numeri che mancano come riquadri tratteggiati
// «Collega…») + ConnectNumberWizard 3-step.
// 09/10/2026: via i tre riquadri «linee» (ripetevano i gruppi qui sotto, che hanno già «Collega»): per primo si vede il
// primo numero.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, Plus, MessageSquare, HeadphonesIcon, Target, Megaphone, Bell, RefreshCw } from "lucide-react";
import {
  PURPOSE_DESCRIPTIONS,
  PURPOSE_GROUPS,
  PURPOSE_LABELS,
  PURPOSE_ORDER,
  PURPOSE_AUTONOMY,
  useWhatsAppNumbersByPurpose,
  type WAPurpose,
  type WAPurposeGroup,
} from "@/hooks/whatsapp/useWhatsAppNumbers";
import { WhatsAppNumberCard } from "./WhatsAppNumberCard";
import { ConnectNumberWizard } from "./ConnectNumberWizard";
import { WhatsAppStatsBar } from "./WhatsAppStatsBar";
import { useWhatsAppBase } from "@/pages/azienda/whatsapp/useWhatsAppBase";

const PURPOSE_ICONS: Record<WAPurpose, typeof MessageSquare> = {
  bot_operativo: MessageSquare,
  assistenza: HeadphonesIcon,
  lead: Target,
  marketing: Megaphone,
  notifiche: Bell,
};

const LINE_ORDER: WAPurposeGroup[] = [
  "commerciale_marketing",
  "operativo_cantieri",
  "amministrazione_assistenza",
];

export function WhatsAppMultiNumeroTab() {
  const navigate = useNavigate();
  const { base: waBase } = useWhatsAppBase();
  const { byPurpose, isLoading, isError, error, refetch, isFetching } = useWhatsAppNumbersByPurpose();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardPurpose, setWizardPurpose] = useState<WAPurpose | null>(null);

  const configuredPurposes = PURPOSE_ORDER.filter(
    (p) => (byPurpose[p] ?? []).length > 0,
  );

  const openWizard = (purpose: WAPurpose | null) => {
    setWizardPurpose(purpose);
    setWizardOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 md:p-0">
        <div className="flex items-center justify-center rounded-xl border bg-card py-12" aria-live="polite">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Caricamento numeri WhatsApp</span>
        </div>
        <ConnectNumberWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          initialPurpose={wizardPurpose ?? undefined}
        />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6 p-4 md:p-0">
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-destructive" />
          <h2 className="font-semibold">Numeri WhatsApp non caricati</h2>
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
        <ConnectNumberWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          initialPurpose={wizardPurpose ?? undefined}
        />
      </div>
    );
  }

  const hasAvailablePurposes = configuredPurposes.length < PURPOSE_ORDER.length;

  return (
    // Da 768 niente margine proprio: lo dà l'hub (prima si sommava a quello
    // della card che conteneva la pagina).
    <div className="space-y-6 p-4 md:p-0">
      <WhatsAppStatsBar />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Un'etichetta di sezione accanto al bottone. */}
        <h2 className="text-base font-semibold">I tuoi numeri</h2>
        <Button
          onClick={() => openWizard(null)}
          disabled={!hasAvailablePurposes}
          aria-label="Collega nuovo numero WhatsApp"
        >
          <Plus className="mr-2 h-4 w-4" />
          {hasAvailablePurposes ? "Collega nuovo numero" : "Tutti i tipi di numero sono collegati"}
        </Button>
      </div>

      {/* Anche senza nessun numero si vedono i riquadri tratteggiati «Collega…»: sono il punto di partenza. */}
      <div className="space-y-6">
        {LINE_ORDER.map((groupKey) => {
          const group = PURPOSE_GROUPS[groupKey];
          const numbers = group.purposes.flatMap((p) => byPurpose[p] ?? []);
          const missing = group.purposes.filter((p) => (byPurpose[p] ?? []).length === 0);
          if (numbers.length === 0 && missing.length === 0) return null;
          const Icon = PURPOSE_ICONS[group.purposes[0]];
          return (
            <section key={groupKey}>
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    <Icon className="h-4 w-4" />
                    {group.label}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">{group.description}</p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {numbers.map((n) => (
                  <WhatsAppNumberCard
                    key={n.id}
                    number={n}
                    onOpenSettings={(id) => navigate(`${waBase}/numeri/${id}`)}
                  />
                ))}
                {missing.map((p) => {
                  const MissingIcon = PURPOSE_ICONS[p];
                  return (
                  <button
                    key={p}
                    onClick={() => openWizard(p)}
                    className="rounded-lg border-2 border-dashed border-muted-foreground/20 p-4 text-left hover:border-primary hover:bg-primary/5 transition-colors"
                    aria-label={`Collega numero ${PURPOSE_LABELS[p]}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <MissingIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{PURPOSE_LABELS[p]}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{PURPOSE_DESCRIPTIONS[p]}</p>
                    <p className="mt-2 text-[11px] font-semibold text-primary">{PURPOSE_AUTONOMY[p]}</p>
                  </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <ConnectNumberWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        initialPurpose={wizardPurpose ?? undefined}
      />
    </div>
  );
}
