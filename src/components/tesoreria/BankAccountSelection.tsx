import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { BANKING_QUERY_KEYS } from "@/lib/banking/queryKeys";
import { toast } from "sonner";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

type Account = {
  id: string;
  account_name: string | null;
  iban: string | null;
  connection_id: string | null;
};
type Selection = {
  limit: number;
  automatic: boolean;
  selected: string[];
  accounts: Account[];
  banks: Record<string, string>;
};
export default function BankAccountSelection({
  companyId,
  onChanged,
}: {
  companyId: string;
  onChanged?: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const { userRoles } = useAuth();
  const { canEditSettingsIntegrations, canViewBankBalances } = usePermissions();
  const admin = userRoles?.includes("super_admin");
  const manage = canEditSettingsIntegrations && canViewBankBalances;
  const [draft, setDraft] = useState<{ company: string; ids: string[] } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [limit, setLimit] = useState("");
  const query = useQuery({
    queryKey: ["bank-account-selection", companyId],
    queryFn: async (): Promise<Selection | null> => {
      const settings = (await supabase
        .from("bank_sync_settings" as never)
        .select("account_limit,automatic_sync")
        .eq("company_id", companyId)
        .maybeSingle()) as unknown as {
        data: { account_limit: number; automatic_sync: boolean } | null;
        error: { message: string } | null;
      };
      if (settings.error) throw settings.error;
      if (!settings.data) return null;
      const [a, c, b] = await Promise.all([
        supabase
          .from("bank_accounts_operativi")
          .select("id,account_name,iban,connection_id")
          .eq("company_id", companyId)
          .order("created_at"),
        supabase
          .from("bank_account_choices" as never)
          .select("account_id")
          .eq("company_id", companyId),
        supabase
          .from("bank_connections")
          .select("id,institution_name")
          .eq("company_id", companyId)
          .eq("provider_slug", "distyra")
          .eq("status", "linked"),
      ]);
      for (const r of [a, c, b]) if (r.error) throw r.error;
      const banks = Object.fromEntries(
        (b.data ?? []).map((x) => [x.id, x.institution_name ?? "Banca"]),
      );
      const s = settings.data as {
        account_limit: number;
        automatic_sync: boolean;
      };
      return {
        limit: s.account_limit,
        automatic: s.automatic_sync,
        selected: ((c.data ?? []) as { account_id: string }[])
          .map((x) => x.account_id)
          .filter((id) =>
            (a.data ?? []).some(
              (x) => x.id === id && x.connection_id && banks[x.connection_id],
            ),
          ),
        accounts: ((a.data ?? []) as Account[]).filter(
          (x) => !!x.connection_id && !!banks[x.connection_id],
        ),
        banks,
      };
    },
  });
  const invalidate = () => {
    [...BANKING_QUERY_KEYS, "bank-account-selection", "bank-sync-runs"].forEach(
      (k) => void qc.invalidateQueries({ queryKey: [k] }),
    );
    setDraft(null);
    onChanged?.();
  };
  const runs = useQuery({
    queryKey: ["bank-sync-runs", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_sync_runs" as never)
        .select("status,error_message,slot,finished_at")
        .eq("company_id", companyId)
        .order("slot", { ascending: false })
        .limit(2);
      if (error) throw error;
      return (data ?? []) as {
        status: string;
        error_message: string | null;
        slot: string;
        finished_at: string | null;
      }[];
    },
  });
  const [search, setSearch] = useState("");
  const [showAvailable, setShowAvailable] = useState(false);
  const data = query.data;
  const ids = draft?.company === companyId ? draft.ids : (data?.selected ?? []);
  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase.rpc(
        "bank_select_accounts" as never,
        { p_company: companyId, p_accounts: ids } as never,
      );
      if (error) throw error;
      toast.success(t("Scelta dei conti salvata"));
      invalidate();
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : ((e as { message?: string }).message ?? t("Scelta non salvata")),
      );
    } finally {
      setSaving(false);
    }
  }
  async function saveLimit() {
    setSaving(true);
    try {
      const n = Number(limit);
      if (!limit.trim() || !Number.isInteger(n) || n < 0 || n > 100)
        throw new Error(t("Inserisci un limite intero fra 0 e 100"));
      const { error } = await supabase.rpc(
        "bank_set_account_limit" as never,
        { p_company: companyId, p_limit: n } as never,
      );
      if (error) throw error;
      toast.success(t("Limite aggiornato"));
      setLimit("");
      invalidate();
    } catch (e) {
      toast.error((e as { message?: string }).message ?? t("Limite non salvato"));
    } finally {
      setSaving(false);
    }
  }
  if (query.isLoading)
    return (
      <p className="text-sm text-muted-foreground">
        {t("Caricamento conti disponibili…")}
      </p>
    );
  if (query.error)
    return (
      <div role="alert" className="text-sm text-destructive">
        {t("Impossibile leggere la scelta dei conti.")}{" "}
        <Button variant="link" onClick={() => void query.refetch()}>
          {t("Riprova")}
        </Button>
      </div>
    );
  if (!data) return null;
  return (
    <section
      className="rounded-lg border bg-muted/20 p-4 space-y-3"
      aria-label={t("Scelta dei conti bancari")}
    >
      <div className="flex justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            {t("Conti collegati")}{" "}
            <span className="tabular-nums">
              {data.selected.length}/{data.limit}
            </span>
          </h3>
          <p className="text-xs text-muted-foreground">{t("{n} disponibili dalle banche autorizzate. Scegli quali utilizzare in Tesoreria.", { n: data.accounts.length })}</p>
        </div>
      </div>
      {data.automatic && (
        <p className="text-xs">
          {t("Aggiornamento automatico alle 7:00 e alle 18:00 · ora italiana.")}
        </p>
      )}
      {runs.error && (
        <p role="alert" className="text-xs text-destructive">
          {t("Esiti automatici non disponibili.")}
        </p>
      )}
      {runs.data?.map((r, i) => (
        <p key={i} className="text-xs text-muted-foreground">
          {t("Aggiornamento del {data}:", { data: new Date(r.slot).toLocaleString(intlCampo(), { timeZone: "Europe/Rome" }) })}{" "}
          {r.status === "completed"
            ? t("Completato")
            : r.status === "failed"
              ? r.error_message
              : r.status === "running"
                ? t("In corso")
                : t("In attesa")}
        </p>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={t("Cerca conto disponibile")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Cerca banca, nome conto o ultime cifre IBAN…")}
          className="min-w-48 flex-1"
        />
        {data.selected.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAvailable((v) => !v)}
          >
            {showAvailable
              ? t("Solo conti scelti")
              : t("Mostra disponibili ({n})", { n: data.accounts.length - data.selected.length })}
          </Button>
        )}
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={t("Conti utilizzati")}
        aria-valuemin={0}
        aria-valuemax={data.limit || 1}
        aria-valuenow={data.selected.length}
      >
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{
            width: `${data.limit ? Math.min(100, (data.selected.length / data.limit) * 100) : 0}%`,
          }}
        />
      </div>
      <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
        {data.accounts
          .filter(
            (a) =>
              (showAvailable ||
                !data.selected.length ||
                ids.includes(a.id) ||
                !!search.trim()) &&
              [data.banks[a.connection_id!], a.account_name, a.iban].some((v) =>
                v?.toLowerCase().includes(search.trim().toLowerCase()),
              ),
          )
          .map((a) => {
            const checked = ids.includes(a.id);
            const disabled =
              saving || !manage || (!checked && ids.length >= data.limit);
            return (
              <label
                key={a.id}
                className={`flex gap-3 items-center border rounded-lg p-3 text-sm ${data.selected.includes(a.id) ? "border-emerald-200 bg-emerald-50/40" : "bg-background"} ${disabled && !checked ? "opacity-60" : ""}`}
              >
                <Checkbox
                  aria-label={`Seleziona conto ${a.iban?.slice(-4) ?? a.account_name ?? a.id}`}
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(v) =>
                    setDraft({
                      company: companyId,
                      ids: v ? [...ids, a.id] : ids.filter((i) => i !== a.id),
                    })
                  }
                />
                <span className="min-w-0">
                  <strong className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 shrink-0 rounded-full ${data.selected.includes(a.id) ? "bg-emerald-500" : checked ? "bg-amber-500" : "bg-slate-300"}`}
                    />
                    {data.banks[a.connection_id!]}
                  </strong>
                  {a.account_name ?? t("Conto corrente")} ·{" "}
                  {a.iban ? `•••• ${a.iban.slice(-4)}` : t("IBAN non disponibile")}
                  <span className="block text-xs text-muted-foreground">
                    {data.selected.includes(a.id)
                      ? t("Collegato in Tesoreria")
                      : checked
                        ? t("Selezionato · da confermare")
                        : t("Disponibile · non importato")}
                  </span>
                </span>
              </label>
            );
          })}
      </div>
      {manage && (
        <div className="flex items-center flex-wrap gap-3">
          <Button
            onClick={() => void save()}
            disabled={saving || !draft || draft.company !== companyId}
          >{t("Conferma {n}/{limit} conti", { n: ids.length, limit: String(data.limit ?? "") })}</Button>
          <p className="text-xs text-muted-foreground">{t("Per collegare più di {limit} conti, richiedi lo sblocco al superadmin.", { limit: String(data.limit ?? "") })}</p>
        </div>
      )}
      {admin && (
        <div className="flex items-center gap-2 border-t pt-3">
          <label htmlFor="bank-account-limit" className="text-xs">
            {t("Limite conti · solo superadmin")}
          </label>
          <Input
            id="bank-account-limit"
            type="number"
            min="0"
            max="100"
            value={limit}
            placeholder={String(data.limit)}
            onChange={(e) => setLimit(e.target.value)}
            className="w-20"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void saveLimit()}
            disabled={saving || !limit}
          >
            {t("Aggiorna limite")}
          </Button>
        </div>
      )}
    </section>
  );
}
