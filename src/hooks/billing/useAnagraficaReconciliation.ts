import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────

interface AnagraficaForRecon {
  id: string;
  ragione_sociale: string | null;
  partita_iva: string | null;
  codice_fiscale: string | null;
  email: string | null;
  cliente_id: string | null;
  sync_from_cliente: boolean;
  last_synced_at: string | null;
  cliente: {
    id: string;
    first_name: string | null;
    last_name: string;
    email: string;
    phone: string | null;
    fiscal_code: string | null;
  } | null;
}

interface ProfileForMatch {
  id: string;
  first_name: string | null;
  last_name: string;
  email: string;
  phone: string | null;
  fiscal_code: string | null;
}

export interface SuggestedMatch {
  anagrafica: { id: string; ragione_sociale: string | null; partita_iva: string | null; codice_fiscale: string | null };
  suggestedClient: ProfileForMatch;
  matchType: "exact_cf" | "name_similarity";
  confidence: number;
}

// ─── Hooks ────────────────────────────────────────────────────

export function useAnagraficheWithReconciliation(companyId: string | null) {
  return useQuery({
    queryKey: ["anagrafiche-reconciliation", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("anagrafiche_native" as never)
        .select(`
          id, ragione_sociale, partita_iva, codice_fiscale, email,
          cliente_id, sync_from_cliente, last_synced_at
        `)
        .eq("company_id", companyId!)
        .order("ragione_sociale");

      if (error) throw error;

      // Fetch linked profiles separately to avoid join issues with "as never"
      const rows = (data ?? []) as unknown as AnagraficaForRecon[];
      const linkedIds = rows.filter((r) => r.cliente_id).map((r) => r.cliente_id!);

      const profilesMap: Record<string, ProfileForMatch> = {};
      if (linkedIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, email, phone, fiscal_code")
          .in("id", linkedIds);
        for (const p of (profiles ?? []) as unknown as ProfileForMatch[]) {
          profilesMap[p.id] = p;
        }
      }

      return rows.map((r) => ({
        ...r,
        cliente: r.cliente_id ? profilesMap[r.cliente_id] ?? null : null,
      }));
    },
  });
}

export function useSuggestedMatches(companyId: string | null) {
  return useQuery({
    queryKey: ["anagrafica-suggested-matches", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Unlinked anagrafiche
      const { data: unlinked, error: e1 } = await supabase
        .from("anagrafiche_native" as never)
        .select("id, ragione_sociale, partita_iva, codice_fiscale")
        .eq("company_id", companyId!)
        .is("cliente_id", null);
      if (e1) throw e1;

      // All profiles (clienti cantieri) for this company
      const { data: profiles, error: e2 } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone, fiscal_code")
        .eq("company_id", companyId!);
      if (e2) throw e2;

      const suggestions: SuggestedMatch[] = [];
      const castUnlinked = (unlinked ?? []) as unknown as Array<{
        id: string; ragione_sociale: string | null; partita_iva: string | null; codice_fiscale: string | null;
      }>;
      const castProfiles = (profiles ?? []) as unknown as ProfileForMatch[];

      for (const ana of castUnlinked) {
        let bestMatch: SuggestedMatch | null = null;

        for (const prof of castProfiles) {
          // Exact fiscal code match
          if (
            ana.codice_fiscale && prof.fiscal_code &&
            ana.codice_fiscale.toUpperCase().replace(/\s/g, "") === prof.fiscal_code.toUpperCase().replace(/\s/g, "")
          ) {
            bestMatch = { anagrafica: ana, suggestedClient: prof, matchType: "exact_cf", confidence: 100 };
            break;
          }

          // Name similarity
          const profName = `${prof.first_name ?? ""} ${prof.last_name}`.trim();
          const sim = nameSimilarity(ana.ragione_sociale ?? "", profName);
          if (sim >= 0.75) {
            const candidate: SuggestedMatch = {
              anagrafica: ana,
              suggestedClient: prof,
              matchType: "name_similarity",
              confidence: Math.round(sim * 100),
            };
            if (!bestMatch || candidate.confidence > bestMatch.confidence) {
              bestMatch = candidate;
            }
          }
        }

        if (bestMatch) suggestions.push(bestMatch);
      }

      return suggestions.sort((a, b) => b.confidence - a.confidence);
    },
  });
}

export function useLinkAnagraficaToCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      anagraficaId,
      clienteId,
      syncFromCliente = false,
      companyId,
      performedBy,
    }: {
      anagraficaId: string;
      clienteId: string;
      syncFromCliente?: boolean;
      companyId: string;
      performedBy?: string;
    }) => {
      const { error } = await supabase
        .from("anagrafiche_native" as never)
        .update({
          cliente_id: clienteId,
          sync_from_cliente: syncFromCliente,
          last_synced_at: syncFromCliente ? new Date().toISOString() : null,
        } as never)
        .eq("id", anagraficaId);
      if (error) throw error;

      // If sync is active, pull data from profile now
      if (syncFromCliente) {
        await syncAnagraficaFromProfile(anagraficaId, clienteId);
      }

      // Audit log
      await supabase.from("anagrafica_reconciliation_log" as never).insert({
        company_id: companyId,
        anagrafica_id: anagraficaId,
        cliente_id: clienteId,
        action: "linked",
        performed_by: performedBy ?? null,
      } as never);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["anagrafiche-reconciliation"] });
      qc.invalidateQueries({ queryKey: ["anagrafica-suggested-matches"] });
      qc.invalidateQueries({ queryKey: ["anagrafiche-native"] });
    },
  });
}

export function useUnlinkAnagraficaFromCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      anagraficaId,
      companyId,
      performedBy,
    }: {
      anagraficaId: string;
      companyId: string;
      performedBy?: string;
    }) => {
      const { error } = await supabase
        .from("anagrafiche_native" as never)
        .update({ cliente_id: null, sync_from_cliente: false } as never)
        .eq("id", anagraficaId);
      if (error) throw error;

      await supabase.from("anagrafica_reconciliation_log" as never).insert({
        company_id: companyId,
        anagrafica_id: anagraficaId,
        cliente_id: null,
        action: "unlinked",
        performed_by: performedBy ?? null,
      } as never);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["anagrafiche-reconciliation"] });
      qc.invalidateQueries({ queryKey: ["anagrafica-suggested-matches"] });
      qc.invalidateQueries({ queryKey: ["anagrafiche-native"] });
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────

async function syncAnagraficaFromProfile(anagraficaId: string, profileId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, email, phone, fiscal_code, address")
    .eq("id", profileId)
    .single();

  if (!profile) return;

  const p = profile as unknown as {
    first_name: string | null; last_name: string; email: string;
    phone: string | null; fiscal_code: string | null; address: string | null;
  };

  await supabase
    .from("anagrafiche_native" as never)
    .update({
      ragione_sociale: `${p.first_name ?? ""} ${p.last_name}`.trim(),
      codice_fiscale: p.fiscal_code,
      email: p.email,
      telefono: p.phone,
      indirizzo_via: p.address,
      last_synced_at: new Date().toISOString(),
    } as never)
    .eq("id", anagraficaId);
}

function nameSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/\b(srl|spa|snc|sas|srls|ss|di|e|&)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  // Bigram similarity
  const bigrams = (s: string) => new Set(Array.from({ length: s.length - 1 }, (_, i) => s.slice(i, i + 2)));
  const ba = bigrams(na);
  const bb = bigrams(nb);
  if (ba.size === 0 || bb.size === 0) return 0;
  const intersection = [...ba].filter((x) => bb.has(x)).length;
  return (2 * intersection) / (ba.size + bb.size);
}
