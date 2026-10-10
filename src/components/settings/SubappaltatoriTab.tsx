/**
 * Tab Subappaltatori:
 *  – rimando alle Squadre (Impostazioni → Calendari lavori, dal 08/09/2026)
 *  – Account app cantiere dei subappaltatori (tabella subappaltatori) con
 *    collegamento a un account
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Building2, ArrowRight,
  Link2, Link2Off, Loader2, HardHat,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { userErrorMessage } from "@/lib/userErrorMessage";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Link } from "react-router-dom";

export function SubappaltatoriTab({ soloLettura = false }: { soloLettura?: boolean } = {}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  // ── Subappaltatori campo ────────────────────────────────────────────
  const { data: subCampo = [], isLoading: loadingSub, isError: elencoFallito, refetch: rileggi } = useQuery({
    queryKey: ["sub-campo-list", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subappaltatori")
        .select("id, ragione_sociale, responsabile, user_id, user_email")
        .eq("company_id", companyId!)
        .order("ragione_sociale");
      // Prima l'errore veniva ignorato e comparivano «Nessuna anagrafica»: un
      // elenco che non si è caricato sembrava un elenco vuoto.
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
  });

  // ── Campo access ────────────────────────────────────────────────────
  const [collegaDialogId, setCollegaDialogId] = useState<string | null>(null);
  const [collegaEmail, setCollegaEmail] = useState("");

  const collegaMutation = useMutation({
    mutationFn: async ({ subId, email }: { subId: string; email: string }) => {
      // Le email degli account sono minuscole: «Mario@…» non trovava nessuno.
      const indirizzo = email.trim().toLowerCase();
      const { data: profile } = await supabase
        .from("profiles").select("id").eq("email", indirizzo).maybeSingle();
      if (profile?.id) {
        const { error } = await supabase.from("subappaltatori")
          .update({ user_id: profile.id, user_email: indirizzo }).eq("id", subId);
        if (error) throw error;
        return { collegato: true };
      }
      const { error } = await supabase.from("subappaltatori")
        .update({ user_email: indirizzo }).eq("id", subId);
      if (error) throw error;
      return { collegato: false };
    },
    onSuccess: ({ collegato }) => {
      if (collegato) {
        toast.success("Accesso all'app cantiere collegato");
      } else {
        // Il toast di successo diceva «collegato» anche quando c'era solo l'email.
        toast.info("Ho salvato l'email, ma non c'è ancora un account con questo indirizzo. Crea l'utente con ruolo Subappaltatore per completare il collegamento.");
      }
      queryClient.invalidateQueries({ queryKey: ["sub-campo-list", companyId] });
      setCollegaDialogId(null);
      setCollegaEmail("");
    },
    onError: (e: unknown) =>
      toast.error(userErrorMessage(e, "Non sono riuscito a collegare l'accesso. Riprova tra un attimo.")),
  });

  const revocaMutation = useMutation({
    mutationFn: async (subId: string) => {
      const { error } = await supabase.from("subappaltatori")
        .update({ user_id: null, user_email: null }).eq("id", subId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Accesso all'app cantiere tolto");
      queryClient.invalidateQueries({ queryKey: ["sub-campo-list", companyId] });
    },
    onError: (e: unknown) =>
      toast.error(userErrorMessage(e, "Non sono riuscito a togliere l'accesso. Riprova tra un attimo.")),
  });

  const chiediRevoca = async (sub: { id: string; ragione_sociale: string }) => {
    const ok = await confirm({
      title: `Togliere l'accesso all'app cantiere a ${sub.ragione_sociale}?`,
      description: "Non potrà più entrare finché non lo ricolleghi.",
      confirmLabel: "Togli l'accesso",
      variant: "destructive",
    });
    if (ok) revocaMutation.mutate(sub.id);
  };

  return (
    <div className="space-y-6">
      {/* ── Squadre: vivono in Calendari lavori ─────────────────────── */}
      {/* 08/09/2026: il CRUD delle squadre è passato in Impostazioni →
          Calendari lavori, dove la squadra ha anche tipo, colore, accesso e
          calendario Google. Qui resta il rimando, così c'è un posto solo. */}
      <Card>
        <CardHeader>
          <h2 className="flex items-center gap-2 text-base font-semibold leading-none tracking-tight">
            <Building2 className="h-5 w-5 shrink-0" aria-hidden="true" />
            Squadre di posa
          </h2>
          <CardDescription>
            Le squadre — interne o esterne, con il loro colore e il loro calendario Google — si gestiscono in un
            posto solo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="gap-2">
            <Link to="/azienda/impostazioni/calendari-lavori?tab=squadre">
              Vai a Calendari lavori → Squadre <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* ── Accesso all'app cantiere ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2 className="flex items-center gap-2 text-base font-semibold leading-none tracking-tight">
            <HardHat className="h-5 w-5" aria-hidden="true" />
            Account app cantiere
          </h2>
          <CardDescription>
            Collega un account a ogni subappaltatore per dargli accesso all'app cantiere. Le anagrafiche create dal modulo Subappaltatori compaiono qui.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loadingSub ? (
            <div role="status" className="flex justify-center py-4">
              <Loader2 className="animate-spin h-5 w-5" aria-hidden="true" />
              <span className="sr-only">Caricamento dei subappaltatori…</span>
            </div>
          ) : elencoFallito ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">
              <span>Non riesco a leggere i subappaltatori. Controlla la connessione e riprova.</span>
              <Button size="sm" variant="outline" onClick={() => void rileggi()}>Riprova</Button>
            </div>
          ) : subCampo.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <HardHat className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
              <p className="text-sm font-medium">Nessun subappaltatore in anagrafica</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Crea un subappaltatore dalla sezione operativa: poi potrai dargli l'accesso all'app cantiere da qui.
              </p>
            </div>
          ) : (
            /* v8.6.73 — Card stack su mobile: prima icon+info+button erano in
                flex-row forzato → su 375px il badge "App attiva — email" si
                sovrapponeva al bottone Revoca/Collega. */
            subCampo.map((sub: { id: string; ragione_sociale: string; responsabile: string | null; user_id: string | null; user_email: string | null }) => (
                <div key={sub.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                      <Building2 className="h-4 w-4 text-slate-500" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{sub.ragione_sociale}</p>
                      {sub.responsabile && <p className="text-xs text-muted-foreground truncate">{sub.responsabile}</p>}
                      {sub.user_id ? (
                        <Badge className="mt-1 text-[10px] bg-green-100 text-green-800 border-green-200 max-w-full">
                          <Link2 className="h-2.5 w-2.5 mr-1 shrink-0" aria-hidden="true" />
                          <span className="truncate">App attiva — {sub.user_email}</span>
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="mt-1 text-[10px] text-muted-foreground">
                          <Link2Off className="h-2.5 w-2.5 mr-1" aria-hidden="true" />Nessun accesso
                        </Badge>
                      )}
                    </div>
                  </div>
                  {sub.user_id ? (
                    <Button size="sm" variant="outline"
                      className="text-destructive border-destructive/30 hover:bg-destructive/10 w-full sm:w-auto shrink-0"
                      aria-label={`Togli l'accesso all'app cantiere a ${sub.ragione_sociale}`}
                      onClick={() => void chiediRevoca(sub)}
                      disabled={soloLettura || revocaMutation.isPending}>
                      <Link2Off className="h-3 w-3 mr-1" aria-hidden="true" />Togli l'accesso
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline"
                      className="w-full sm:w-auto shrink-0"
                      aria-label={`Collega un account a ${sub.ragione_sociale}`}
                      disabled={soloLettura}
                      onClick={() => { setCollegaDialogId(sub.id); setCollegaEmail(sub.user_email ?? ""); }}>
                      <Link2 className="h-3 w-3 mr-1" aria-hidden="true" />Collega
                    </Button>
                  )}
                </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ── Dialogs ──────────────────────────────────────────────────── */}
      <Dialog open={!!collegaDialogId} onOpenChange={() => { setCollegaDialogId(null); setCollegaEmail(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Collega un account all'app cantiere</DialogTitle>
            <DialogDescription>
              Scrivi l&apos;email del subappaltatore. Se ha già un account, viene collegato subito.
            </DialogDescription>
          </DialogHeader>
          <form
            id="collega-subappaltatore"
            onSubmit={(e) => {
              e.preventDefault();
              if (collegaDialogId && collegaEmail.trim()) {
                collegaMutation.mutate({ subId: collegaDialogId, email: collegaEmail });
              }
            }}
          >
            <Label htmlFor="collega-email">Email</Label>
            <Input id="collega-email" type="email" value={collegaEmail}
              onChange={e => setCollegaEmail(e.target.value)} placeholder="email@subappaltatore.it" />
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCollegaDialogId(null)}>Annulla</Button>
            <Button type="submit" form="collega-subappaltatore"
              disabled={!collegaEmail.trim() || collegaMutation.isPending}>
              {collegaMutation.isPending
                ? <Loader2 className="animate-spin h-4 w-4" aria-label="Collegamento in corso" />
                : "Collega"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
