/**
 * AdAccountPickerDialog — scelta dell'account pubblicitario Meta dell'azienda.
 *
 * Un utente Meta "agenzia" porta in meta_assets decine di ad account di ALTRI
 * clienti: qui il company_admin sceglie QUALE usare per le campagne. La scelta
 * scrive meta_assets.selected (un solo selected per azienda) — le RLS
 * permettono l'update ai soli company_admin/super_admin, quindi il gating UI
 * a monte è una cortesia, non la barriera di sicurezza.
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Megaphone, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { MetaAsset } from "@/types/integrations";
import { cn } from "@/lib/utils";

interface AdAccountPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | undefined;
  /** Tutti gli ad account (selected e non) visibili all'admin. */
  accounts: MetaAsset[];
}

export function AdAccountPickerDialog({ open, onOpenChange, companyId, accounts }: AdAccountPickerDialogProps) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");

  const currentSelectedId = accounts.find((a) => a.selected)?.asset_id ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...accounts].sort((a, b) => {
      // Il selezionato in cima, poi alfabetico
      if (a.selected !== b.selected) return a.selected ? -1 : 1;
      return (a.asset_name || "").localeCompare(b.asset_name || "");
    });
    if (!q) return list;
    return list.filter(
      (a) =>
        (a.asset_name || "").toLowerCase().includes(q) ||
        (a.asset_id || "").toLowerCase().includes(q),
    );
  }, [accounts, query]);

  const selectMutation = useMutation({
    mutationFn: async (assetId: string) => {
      if (!companyId) throw new Error("companyId mancante");
      // Un solo account attivo per azienda: azzera tutti, poi attiva lo scelto.
      const { error: clearErr } = await supabase
        .from("meta_assets")
        .update({ selected: false, updated_at: new Date().toISOString() })
        .eq("company_id", companyId)
        .eq("asset_type", "ad_account");
      if (clearErr) throw clearErr;

      const { error: setErr } = await supabase
        .from("meta_assets")
        .update({ selected: true, updated_at: new Date().toISOString() })
        .eq("company_id", companyId)
        .eq("asset_type", "ad_account")
        .eq("asset_id", assetId);
      if (setErr) throw setErr;

      // Scelto il proprio, gli account degli altri clienti dell'agenzia
      // spariscono da questa azienda. Per cambiarlo: "Collega con Facebook"
      // li reimporta, con la scelta attuale già spuntata.
      const integrationId = accounts.find((a) => a.asset_id === assetId)?.integration_id;
      if (integrationId) {
        try {
          await supabase.functions.invoke("meta-api-proxy", {
            body: { action: "purge-unselected", company_id: companyId, integration_id: integrationId },
          });
        } catch {
          // best-effort: il proxy rifiuta comunque gli account non scelti
        }
      }
    },
    onSuccess: (_data, assetId) => {
      const name = accounts.find((a) => a.asset_id === assetId)?.asset_name ?? assetId;
      toast.success(`Account pubblicitario attivo: ${name}`);
      qc.invalidateQueries({ queryKey: ["ads-manager-beta", "meta-assets"] });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      toast.error("Impossibile cambiare account", {
        description: err instanceof Error ? err.message : "Riprova (serve il ruolo amministratore).",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            Scegli l'account pubblicitario
          </DialogTitle>
          <DialogDescription>
            Le campagne di questa azienda verranno create e monitorate sull'account selezionato.
          </DialogDescription>
        </DialogHeader>

        {accounts.length > 6 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca per nome o ID account…"
              className="pl-9"
              autoFocus
            />
          </div>
        )}

        <div className="border rounded-lg divide-y max-h-[340px] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nessun account corrisponde a “{query}”.
            </p>
          ) : (
            filtered.map((account) => {
              const isActive = account.asset_id === currentSelectedId;
              const meta = account.metadata as { currency?: string | null } | null;
              return (
                <button
                  key={account.id}
                  type="button"
                  disabled={selectMutation.isPending}
                  onClick={() => { if (!isActive) selectMutation.mutate(account.asset_id); }}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                    isActive ? "bg-primary/5" : "hover:bg-muted/50",
                    selectMutation.isPending && "opacity-60",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                      isActive ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30",
                    )}
                  >
                    {isActive && <Check className="h-3 w-3" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{account.asset_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {account.asset_id}
                      {meta?.currency ? ` · ${meta.currency}` : ""}
                    </p>
                  </div>
                  {isActive && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Attivo
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {accounts.length} account disponibili
            {query && ` · ${filtered.length} risultati`}
          </span>
          {selectMutation.isPending && (
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Salvataggio…
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
