/**
 * Tab Subappaltatori:
 *  – rimando alle Squadre (Impostazioni → Calendari lavori, dal 08/09/2026)
 *  – Account app cantiere subappaltatori (subappaltatori table) con collegamento account
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Link } from "react-router-dom";

export function SubappaltatoriTab() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  // ── Subappaltatori campo ────────────────────────────────────────────
  const { data: subCampo = [], isLoading: loadingSub } = useQuery({
    queryKey: ["sub-campo-list", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("subappaltatori")
        .select("id, ragione_sociale, responsabile, user_id, user_email")
        .eq("company_id", companyId!)
        .order("ragione_sociale");
      return data ?? [];
    },
    enabled: !!companyId,
  });

  // ── Campo access ────────────────────────────────────────────────────
  const [collegaDialogId, setCollegaDialogId] = useState<string | null>(null);
  const [collegaEmail, setCollegaEmail] = useState("");

  const collegaMutation = useMutation({
    mutationFn: async ({ subId, email }: { subId: string; email: string }) => {
      const { data: profile } = await supabase
        .from("profiles").select("id").eq("email", email).maybeSingle();
      if (profile?.id) {
        const { error } = await supabase.from("subappaltatori")
          .update({ user_id: profile.id, user_email: email }).eq("id", subId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("subappaltatori")
          .update({ user_email: email }).eq("id", subId);
        if (error) throw error;
        toast.info("Email salvata. Crea l'utente con ruolo Subappaltatore per completare il collegamento.");
      }
    },
    onSuccess: () => {
      toast.success("Account campo collegato");
      queryClient.invalidateQueries({ queryKey: ["sub-campo-list", companyId] });
      setCollegaDialogId(null);
      setCollegaEmail("");
    },
    onError: (e: any) => toast.error(e.message ?? "Errore collegamento"),
  });

  const revocaMutation = useMutation({
    mutationFn: async (subId: string) => {
      const { error } = await supabase.from("subappaltatori")
        .update({ user_id: null, user_email: null }).eq("id", subId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Account app cantiere revocato");
      queryClient.invalidateQueries({ queryKey: ["sub-campo-list", companyId] });
    },
    onError: () => toast.error("Errore revoca accesso"),
  });


  return (
    <div className="space-y-6">
      {/* ── Squadre: vivono in Calendari lavori ─────────────────────── */}
      {/* 08/09/2026: il CRUD delle squadre è passato in Impostazioni →
          Calendari lavori, dove la squadra ha anche tipo, colore, accesso e
          calendario Google. Qui resta il rimando, così c'è un posto solo. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-5 w-5 shrink-0" />
            Squadre di posa
          </CardTitle>
          <CardDescription>
            Le squadre — interne o esterne, con il loro colore e il loro calendario Google — si gestiscono in un
            posto solo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="gap-2">
            <Link to="/azienda/impostazioni/calendari-lavori?tab=squadre">
              Vai a Calendari lavori → Squadre <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* ── Account app cantiere ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HardHat className="h-5 w-5" />
            Account app cantiere
          </CardTitle>
          <CardDescription>
            Collega un account a ogni subappaltatore per dargli accesso all'app cantiere. Le anagrafiche create dal modulo Subappaltatori vengono agganciate qui.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loadingSub ? (
            <div className="flex justify-center py-4"><Loader2 className="animate-spin h-5 w-5" /></div>
          ) : subCampo.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <HardHat className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">Nessuna anagrafica app cantiere collegata</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Crea o collega un subappaltatore dalla sezione operativa per abilitarne poi l'account.
              </p>
            </div>
          ) : (
            /* v8.6.73 — Card stack su mobile: prima icon+info+button erano in
                flex-row forzato → su 375px il badge "App attiva — email" si
                sovrapponeva al bottone Revoca/Collega. */
            subCampo.map((sub: any) => (
                <div key={sub.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                      <Building2 className="h-4 w-4 text-slate-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{sub.ragione_sociale}</p>
                      {sub.responsabile && <p className="text-xs text-muted-foreground truncate">{sub.responsabile}</p>}
                      {sub.user_id ? (
                        <Badge className="mt-1 text-[10px] bg-green-100 text-green-800 border-green-200 max-w-full">
                          <Link2 className="h-2.5 w-2.5 mr-1 shrink-0" />
                          <span className="truncate">App attiva — {sub.user_email}</span>
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="mt-1 text-[10px] text-muted-foreground">
                          <Link2Off className="h-2.5 w-2.5 mr-1" />Nessun accesso
                        </Badge>
                      )}
                    </div>
                  </div>
                  {sub.user_id ? (
                    <Button size="sm" variant="outline"
                      className="text-destructive border-destructive/30 hover:bg-destructive/10 w-full sm:w-auto shrink-0"
                      onClick={() => revocaMutation.mutate(sub.id)}
                      disabled={revocaMutation.isPending}>
                      <Link2Off className="h-3 w-3 mr-1" />Revoca
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline"
                      className="w-full sm:w-auto shrink-0"
                      onClick={() => { setCollegaDialogId(sub.id); setCollegaEmail(sub.user_email ?? ""); }}>
                      <Link2 className="h-3 w-3 mr-1" />Collega
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
            <DialogTitle>Collega account app cantiere</DialogTitle>
            <DialogDescription>
              Inserisci l&apos;email del subappaltatore. Se esiste verrà collegato automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Email</Label>
            <Input type="email" value={collegaEmail}
              onChange={e => setCollegaEmail(e.target.value)} placeholder="email@subappaltatore.it" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCollegaDialogId(null)}>Annulla</Button>
            <Button onClick={() => collegaMutation.mutate({ subId: collegaDialogId!, email: collegaEmail })}
              disabled={!collegaEmail || collegaMutation.isPending}>
              {collegaMutation.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : "Collega"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
