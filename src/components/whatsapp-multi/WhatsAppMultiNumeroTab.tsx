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
    // Tre in riga già da 768: una sotto l'altra erano tre card a tutta larghezza.
    <div className="grid gap-3 md:grid-cols-3">
      {LINE_ORDER.map((groupKey) => {
        const group = PURPOSE_GROUPS[groupKey];
        const configured = group.purposes.filter((p) => (byPurpose[p] ?? []).length > 0);
        const missing = group.purposes.filter((p) => (byPurpose[p] ?? []).length === 0);
        const primaryPurpose = group.purposes[0];
        const PrimaryIcon = PURPOSE_ICONS[primaryPurpose];
        return (
          // A 1024 le tre card sono larghe ~240px: la descrizione stava in una
          // colonna di 70px accanto all'icona (una parola per riga) e il bottone
          // «Collega …» usciva dalla card. Ora icona e titolo in riga, la
          // descrizione sotto a tutta larghezza, il bottone tronca il testo.
          <section key={groupKey} className="flex flex-col rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <div className="shrink-0 rounded-lg bg-primary/10 p-1.5 text-primary">
                  <PrimaryIcon className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">{group.label}</h3>
              </div>
              <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-bold tabular-nums text-muted-foreground">
                {configured.length}/{group.purposes.length}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{group.description}</p>
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
            {/* In fondo alla card, così i tre bottoni stanno alla stessa altezza. */}
            {missing.length > 0 && (
              <div className="mt-auto pt-4">
                <Button
                  className="w-full min-w-0"
                  variant="outline"
                  size="sm"
                  onClick={() => onConnect(missing[0])}
                  title={`Collega ${PURPOSE_LABELS[missing[0]]}`}
                >
                  <Plus className="mr-2 h-4 w-4 shrink-0" />
                  <span className="truncate">Collega {PURPOSE_LABELS[missing[0]]}</span>
                </Button>
              </div>
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
      <div className="space-y-6 p-4 md:p-0">
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
      <div className="space-y-6 p-4 md:p-0">
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
    // Da 768 niente margine proprio: lo dà l'hub (prima si sommava a quello
    // della card che conteneva la pagina).
    <div className="space-y-6 p-4 md:p-0">
      <WhatsAppStatsBar />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Era un titolo grande come quello della pagina, su due righe a 1024,
            più una frase: basta un'etichetta di sezione accanto al bottone. */}
        <h2 className="text-base font-semibold">Canali aziendali</h2>
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

      {/* Senza numeri niente riquadro «Nessun numero collegato» con un altro
          bottone: le tre card qui sopra dicono già 0/2 e hanno «Collega …». */}
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
