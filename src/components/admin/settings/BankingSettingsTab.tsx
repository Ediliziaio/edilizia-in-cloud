import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import GoCardlessConfigCard from "./banking/GoCardlessConfigCard";
import CompanyTesoreriaCard from "./banking/CompanyTesoreriaCard";

export default function BankingSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [hasExistingId, setHasExistingId] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    const { data } = await supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", ["bank_gocardless_secret_id", "bank_gocardless_secret_key", "bank_gocardless_enabled"]);

    for (const row of data || []) {
      if (row.key === "bank_gocardless_secret_id" && row.value) setHasExistingId(true);
      if (row.key === "bank_gocardless_secret_key" && row.value) setHasExistingKey(true);
      if (row.key === "bank_gocardless_enabled") setEnabled(row.value === "true");
    }
    setLoading(false);
  }

  if (loading) return <Skeleton className="h-64 w-full rounded-lg" />;

  return (
    <div className="space-y-6">
      <GoCardlessConfigCard
        hasExistingId={hasExistingId}
        hasExistingKey={hasExistingKey}
        enabled={enabled}
        onSaved={loadSettings}
      />
      <CompanyTesoreriaCard />
    </div>
  );
}
