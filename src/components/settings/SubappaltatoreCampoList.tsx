/**
 * Lista dei subappaltatori con gestione account campo.
 * Permette di collegare/revocare l'accesso all'area campo.
 * Usato nel tab "Subappaltatori campo" di SettingsPeople.tsx.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Building2, Link2, Link2Off, Loader2, HardHat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

export function SubappaltatoreCampoList() {
  const { effectiveCompany } = useAuth();
  const companyId = (effectiveCompany as any)?.id ?? "";
  const qc = useQueryClient();

  const [collegaDialogId, setCollegaDialogId] = useState<string | null>(null);
  const [collegaEmail, setCollegaEmail] = useState("");

  const { data: subappaltatori = [], isLoading } = useQuery({
    queryKey: ["sub-campo-list", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("subappaltatori")
        .select("id, ragione_sociale, responsabile, user_id, user_email")
        .eq("company_id", companyId)
        .order("ragione_sociale");
      return data ?? [];
    },
    enabled: !!companyId,
  });

  const collegaMutation = useMutation({
    mutationFn: async ({ subId, email }: { subId: string; email: string }) => {
      // Cerca profilo esistente
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (profile?.id) {
        // Collega direttamente
        const { error } = await supabase
          .from("subappaltatori")
          .update({ user_id: profile.id, user_email: email })
          .eq("id", subId);
        if (error) throw error;
      } else {
        // Aggiorna solo l'email (l'utente dovrà essere invitato separatamente)
        const { error } = await supabase
          .from("subappaltatori")
          .update({ user_email: email })
          .eq("id", subId);
        if (error) throw error;
        toast.info("Email salvata. Crea l'utente con questa email e ruolo Subappaltatore per completare il collegamento.");
      }
    },
    onSuccess: () => {
      toast.success("Account campo collegato");
      qc.invalidateQueries({ queryKey: ["sub-campo-list", companyId] });
      setCollegaDialogId(null);
      setCollegaEmail("");
    },
    onError: (e: any) => toast.error(e.message ?? "Errore collegamento"),
  });

  const revocaMutation = useMutation({
    mutationFn: async (subId: string) => {
      const { error } = await supabase
        .from("subappaltatori")
        .update({ user_id: null, user_email: null })
        .eq("id", subId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Accesso campo revocato");
      qc.invalidateQueries({ queryKey: ["sub-campo-list", companyId] });
    },
    onError: () => toast.error("Errore revoca accesso"),
  });

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="animate-spin h-6 w-6" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Banner informativo */}
      <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        <HardHat className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
        <div>
          <p className="font-medium">Area Campo Subappaltatori</p>
          <p className="text-amber-700 text-xs mt-0.5">
            Collega un account email a ogni subappaltatore per dargli accesso a{" "}
            <a href="https://lavori.ediliziaincloud.com" target="_blank" rel="noreferrer" className="underline font-medium">
              lavori.ediliziaincloud.com
            </a>
          </p>
        </div>
      </div>

      {subappaltatori.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nessun subappaltatore registrato</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {subappaltatori.map((sub: any) => (
            <Card key={sub.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-slate-500" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{sub.ragione_sociale}</p>
                      {sub.responsabile && (
                        <p className="text-xs text-muted-foreground">{sub.responsabile}</p>
                      )}
                      <div className="mt-1">
                        {sub.user_id ? (
                          <Badge className="text-[10px] bg-green-100 text-green-800 border-green-200">
                            <Link2 className="h-2.5 w-2.5 mr-1" />App attiva — {sub.user_email}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            <Link2Off className="h-2.5 w-2.5 mr-1" />Nessun accesso campo
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {sub.user_id ? (
                      <Button
                        size="sm" variant="outline"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => revocaMutation.mutate(sub.id)}
                        disabled={revocaMutation.isPending}
                      >
                        <Link2Off className="h-3 w-3 mr-1" />Revoca
                      </Button>
                    ) : (
                      <Button
                        size="sm" variant="outline"
                        onClick={() => { setCollegaDialogId(sub.id); setCollegaEmail(sub.user_email ?? ""); }}
                      >
                        <Link2 className="h-3 w-3 mr-1" />Collega account
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog collegamento account */}
      <Dialog open={!!collegaDialogId} onOpenChange={() => { setCollegaDialogId(null); setCollegaEmail(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Collega account campo</DialogTitle>
            <DialogDescription>
              Inserisci l&apos;email del subappaltatore. Se l&apos;utente esiste già verrà collegato automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={collegaEmail}
              onChange={e => setCollegaEmail(e.target.value)}
              placeholder="email@subappaltatore.it"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCollegaDialogId(null)}>Annulla</Button>
            <Button
              onClick={() => collegaMutation.mutate({ subId: collegaDialogId!, email: collegaEmail })}
              disabled={!collegaEmail || collegaMutation.isPending}
            >
              {collegaMutation.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : "Collega"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
