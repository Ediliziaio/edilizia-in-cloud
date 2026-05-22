/**
 * AdAccountSelector — selector Business Manager / Ad Account / Page.
 *
 * Mostra solo quando l'azienda ha più di 1 asset di un tipo.
 * Persiste la scelta in localStorage per (companyId, type).
 */
import { useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Building2, CreditCard, FileText } from "lucide-react";
import type { MetaAsset } from "@/types/integrations";

interface Props {
  /** Business managers disponibili */
  businesses: MetaAsset[];
  /** Ad accounts disponibili */
  adAccounts: MetaAsset[];
  /** Facebook pages disponibili */
  pages: MetaAsset[];
  companyId: string | undefined;
  selectedBusinessId?: string;
  selectedAdAccountId?: string;
  selectedPageId?: string;
  onChange: (selected: {
    business_id?: string;
    ad_account_id?: string;
    page_id?: string;
  }) => void;
}

const STORAGE_KEY = "eic_ads_selector_";

export function AdAccountSelector({
  businesses,
  adAccounts,
  pages,
  companyId,
  selectedBusinessId,
  selectedAdAccountId,
  selectedPageId,
  onChange,
}: Props) {
  // Restore selezione da localStorage
  useEffect(() => {
    if (!companyId) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY + companyId);
      if (raw) {
        const stored = JSON.parse(raw) as {
          business_id?: string;
          ad_account_id?: string;
          page_id?: string;
        };
        if (stored.business_id || stored.ad_account_id || stored.page_id) {
          onChange(stored);
        }
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // Auto-seleziona se c'è UN solo asset di un tipo
  useEffect(() => {
    const next: { business_id?: string; ad_account_id?: string; page_id?: string } = {
      business_id: selectedBusinessId,
      ad_account_id: selectedAdAccountId,
      page_id: selectedPageId,
    };
    let changed = false;
    if (!next.business_id && businesses.length === 1) {
      next.business_id = businesses[0].id;
      changed = true;
    }
    if (!next.ad_account_id && adAccounts.length === 1) {
      next.ad_account_id = adAccounts[0].id;
      changed = true;
    }
    if (!next.page_id && pages.length === 1) {
      next.page_id = pages[0].id;
      changed = true;
    }
    if (changed) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businesses.length, adAccounts.length, pages.length]);

  // Persisti scelta
  useEffect(() => {
    if (!companyId) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY + companyId,
        JSON.stringify({
          business_id: selectedBusinessId,
          ad_account_id: selectedAdAccountId,
          page_id: selectedPageId,
        }),
      );
    } catch {
      // ignore
    }
  }, [companyId, selectedBusinessId, selectedAdAccountId, selectedPageId]);

  // Se zero asset, non mostrare nulla
  if (businesses.length === 0 && adAccounts.length === 0 && pages.length === 0) {
    return null;
  }

  // Se UN SOLO asset di OGNI tipo, niente UI (auto-selezionato)
  if (businesses.length <= 1 && adAccounts.length <= 1 && pages.length <= 1) {
    return null;
  }

  const handleChange = (key: "business_id" | "ad_account_id" | "page_id", value: string) => {
    onChange({
      business_id: selectedBusinessId,
      ad_account_id: selectedAdAccountId,
      page_id: selectedPageId,
      [key]: value,
    });
  };

  return (
    <div className="rounded-xl border bg-white p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Account di pubblicazione
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        {businesses.length > 1 && (
          <div>
            <Label className="mb-1 flex items-center gap-1 text-xs text-slate-600">
              <Building2 className="h-3 w-3" />
              Business Manager
            </Label>
            <Select
              value={selectedBusinessId ?? ""}
              onValueChange={(v) => handleChange("business_id", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Scegli BM..." />
              </SelectTrigger>
              <SelectContent>
                {businesses.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.asset_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {adAccounts.length > 1 && (
          <div>
            <Label className="mb-1 flex items-center gap-1 text-xs text-slate-600">
              <CreditCard className="h-3 w-3" />
              Ad Account
            </Label>
            <Select
              value={selectedAdAccountId ?? ""}
              onValueChange={(v) => handleChange("ad_account_id", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Scegli account..." />
              </SelectTrigger>
              <SelectContent>
                {adAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.asset_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {pages.length > 1 && (
          <div>
            <Label className="mb-1 flex items-center gap-1 text-xs text-slate-600">
              <FileText className="h-3 w-3" />
              Pagina Facebook
            </Label>
            <Select
              value={selectedPageId ?? ""}
              onValueChange={(v) => handleChange("page_id", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Scegli pagina..." />
              </SelectTrigger>
              <SelectContent>
                {pages.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.asset_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}
