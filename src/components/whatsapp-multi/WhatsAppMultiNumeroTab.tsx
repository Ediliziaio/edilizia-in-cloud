// MP04 + MP-FINAL — Tab principale WhatsApp multi-numero.
// Empty state + grouping per purpose + StatsBar + ConnectNumberWizard 3-step.

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
  type WANumber,
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

type ByPurposeMap = Record<WAPurpose, WANumber[]>;

function WhatsAppLinesOverview({
  byPurpose,
  onConnect,
}: {
  byPurpose: ByPurposeMap;
  onConnect: (purpose: WAPurpose) => void;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {LINE_ORDER.map((groupKey) => {
        const group = PURPOSE_GROUPS[groupKey];
        const configured = group.purposes.filter((p) => (byPurpose[p] ?? []).length > 0);
        const missing = group.purposes.filter((p) => (byPurpose[p] ?? []).length === 0);
        const primaryPurpose = group.purposes[0];
        const PrimaryIcon = PURPOSE_ICONS[primaryPurpose];
        return (
          <section key={groupKey} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <PrimaryIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-foreground">{group.label}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{group.description}</p>
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">
                {configured.length}/{group.purposes.length}
              </span>
            </div>
            <div className="mt-3 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
              <b className="text-foreground">{group.recommendedNumber}</b> · {group.mode}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {group.purposes.map((p) => (
                <span
                  key={p}
                  className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                    (byPurpose[p] ?? []).length > 0
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {PURPOSE_LABELS[p]}
                </span>
              ))}
            </div>
            {missing.length > 0 && (
              <Button className="mt-4 w-full" variant="outline" size="sm" onClick={() => onConnect(missing[0])}>
                <Plus className="mr-2 h-4 w-4" />
                Collega {PURPOSE_LABELS[missing[0]]}
              </Button>
            )}
          </section>
        );
      })}
    </div>
  );
}

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
      <div className="space-y-6 p-4 md:p-6">
        <WhatsAppLinesOverview byPurpose={byPurpose} onConnect={openWizard} />
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
      <div className="space-y-6 p-4 md:p-6">
        <WhatsAppLinesOverview byPurpose={byPurpose} onConnect={openWizard} />
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
        <ConnectNumberWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          initialPurpose={wizardPurpose ?? undefined}
        />
      </div>
    );
  }

  const hasNumbers = configuredPurposes.length > 0;
  const hasAvailablePurposes = configuredPurposes.length < PURPOSE_ORDER.length;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <WhatsAppStatsBar />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">WhatsApp Business — 3 canali aziendali</h2>
          <p className="text-sm text-muted-foreground">
            Commerciale, cantieri e amministrazione lavorano separati, ma Silvio collega tutto a CRM, commesse e documenti.
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

      <WhatsAppLinesOverview byPurpose={byPurpose} onConnect={openWizard} />

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
      )}

      <ConnectNumberWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        initialPurpose={wizardPurpose ?? undefined}
      />
    </div>
  );
}
