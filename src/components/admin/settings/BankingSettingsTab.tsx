import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Landmark, ShieldCheck, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import GoCardlessConfigCard from "./banking/GoCardlessConfigCard";
import CompanyTesoreriaCard from "./banking/CompanyTesoreriaCard";

/** Chiavi settings lette in questa tab. Si legge solo "key" per i secret (non il valore). */
const SECRET_KEYS = [
  "bank_gocardless_secret_id",
  "bank_gocardless_secret_key",
] as const;
const NON_SECRET_KEYS = ["bank_gocardless_enabled"] as const;

/**
 * FIX: prima usava useState+useEffect+Promise senza error handling e niente cache.
 * Ora react-query con staleTime → invalidation precisa da GoCardlessConfigCard.
 */
function useBankingSettings() {
  return useQuery({
    queryKey: ["admin", "banking-settings"],
    queryFn: async () => {
      // SECURITY: secret letti come "esistenza" (solo key), non prendiamo il valore
      // plaintext in state/cache; i non-secret con value.
      const [secretRes, nonSecretRes] = await Promise.all([
        supabase
          .from("platform_settings")
          .select("key")
          .in("key", SECRET_KEYS as unknown as string[]),
        supabase
          .from("platform_settings")
          .select("key, value")
          .in("key", NON_SECRET_KEYS as unknown as string[]),
      ]);

      if (secretRes.error) throw new Error(secretRes.error.message);
      if (nonSecretRes.error) throw new Error(nonSecretRes.error.message);

      const existingSecrets = new Set(secretRes.data?.map((r) => r.key) ?? []);
      const nonSecretMap = new Map(
        (nonSecretRes.data ?? []).map((r) => [r.key, r.value]),
      );

      return {
        hasExistingId: existingSecrets.has("bank_gocardless_secret_id"),
        hasExistingKey: existingSecrets.has("bank_gocardless_secret_key"),
        enabled: nonSecretMap.get("bank_gocardless_enabled") === "true",
      };
    },
    staleTime: 30 * 1000,
  });
}

function BankingKPIs({
  hasExistingId, hasExistingKey, enabled,
}: {
  hasExistingId: boolean;
  hasExistingKey: boolean;
  enabled: boolean;
}) {
  const isConfigured = hasExistingId && hasExistingKey;

  const cards = [
    {
      icon: Landmark,
      label: "GoCardless",
      value: isConfigured ? "Configurato" : "Non configurato",
      subtitle: isConfigured ? "credenziali presenti" : "credenziali mancanti",
      accent: isConfigured
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
        : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    },
    {
      icon: ShieldCheck,
      label: "Modulo Tesoreria",
      value: enabled ? "Abilitato" : "Disabilitato",
      subtitle: enabled ? "disponibile aziende" : "disattivato globalmente",
      accent: enabled
        ? "bg-primary/10 text-primary"
        : "bg-muted text-muted-foreground",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="p-4 flex items-start gap-3">
            <div className={cn("rounded-lg p-2 shrink-0", c.accent)}>
              <c.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide truncate">
                {c.label}
              </p>
              <p className="text-xl font-bold leading-tight mt-0.5 truncate">
                {c.value}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {c.subtitle}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function BankingSettingsTab() {
  const { data, isLoading, error, refetch } = useBankingSettings();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </div>
        <Skeleton className="h-96 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Impossibile caricare le impostazioni banking:{" "}
          {error instanceof Error ? error.message : "errore sconosciuto"}
        </AlertDescription>
      </Alert>
    );
  }

  const {
    hasExistingId = false,
    hasExistingKey = false,
    enabled = false,
  } = data ?? {};

  return (
    <div className="space-y-6">
      <BankingKPIs
        hasExistingId={hasExistingId}
        hasExistingKey={hasExistingKey}
        enabled={enabled}
      />

      <GoCardlessConfigCard
        hasExistingId={hasExistingId}
        hasExistingKey={hasExistingKey}
        enabled={enabled}
        onSaved={() => void refetch()}
      />

      <CompanyTesoreriaCard />
    </div>
  );
}

// Re-export dell'icona Building2 per compat (alcuni import esterni potrebbero esistere)
export { Building2 };
