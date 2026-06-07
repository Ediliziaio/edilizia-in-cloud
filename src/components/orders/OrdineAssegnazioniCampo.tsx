/**
 * Componente per la gestione delle assegnazioni operai/subappaltatori a un ordine.
 * Usato nel tab "Campo" di OrderDetail.tsx.
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { toast } from "sonner";
import { HardHat, UserPlus, Trash2, Crown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface Props { orderId: string; companyId: string; }

export function OrdineAssegnazioniCampo({ orderId, companyId }: Props) {
  const qc = useQueryClient();
  const { role } = useAuth();
  const canEdit = role === "company_admin" || role === "company_staff" || role === "super_admin";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [formUserId, setFormUserId] = useState("");
  const [formRoleType] = useState<"employee" | "subcontractor">("employee"); // sempre "employee": lo switch subappaltatore non è ancora implementato in questa UI
  const [formDataInizio, setFormDataInizio] = useState("");
  const [formDataFine, setFormDataFine] = useState("");
  const [formCapocantiere, setFormCapocantiere] = useState(false);
  const [formNote, setFormNote] = useState("");

  // Assegnazioni esistenti
  const { data: assegnazioni = [], isLoading } = useQuery({
    queryKey: ["order-campo-assignments", orderId],
    queryFn: async () => {
      const { data } = await supabase
        .from("order_campo_assignments")
        .select("*, profile:profiles(id, first_name, last_name, email)")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
    enabled: !!orderId,
  });

  // FIX: useCompanyStaffUsers — esclude customer/referrer
  const { data: rawFieldUsers = [] } = useCompanyStaffUsers(
    dialogOpen ? companyId : null
  );
  const utentiCampo = useMemo(
    () =>
      rawFieldUsers.map((p) => ({
        user_id: p.id,
        role: "employee",
        profile: {
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          email: null as string | null,
        },
      })),
    [rawFieldUsers]
  );

  const assegnaMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("order_campo_assignments")
        .insert({
          company_id: companyId,
          order_id: orderId,
          user_id: formUserId,
          role_type: formRoleType,
          data_inizio: formDataInizio || null,
          data_fine_prevista: formDataFine || null,
          is_capocantiere: formCapocantiere,
          note: formNote || null,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Operaio assegnato al cantiere");
      qc.invalidateQueries({ queryKey: ["order-campo-assignments", orderId] });
      setDialogOpen(false);
      setFormUserId(""); setFormDataInizio(""); setFormDataFine("");
      setFormCapocantiere(false); setFormNote("");
    },
    onError: (e: any) => toast.error(e.message ?? "Errore assegnazione"),
  });

  const rimuoviMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("order_campo_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assegnazione rimossa");
      qc.invalidateQueries({ queryKey: ["order-campo-assignments", orderId] });
    },
    onError: () => toast.error("Errore rimozione assegnazione"),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <HardHat className="h-4 w-4" />
            Operai e Subappaltatori Assegnati
          </CardTitle>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
              <UserPlus className="h-3 w-3 mr-1" /> Assegna
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="animate-spin h-5 w-5" /></div>
        ) : assegnazioni.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun operaio assegnato a questo cantiere</p>
        ) : (
          <div className="space-y-2">
            {assegnazioni.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between p-3 bg-muted/40 rounded-lg border">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                    {a.profile?.first_name?.[0]}{a.profile?.last_name?.[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {a.profile?.first_name} {a.profile?.last_name}
                      {a.is_capocantiere && (
                        <Crown className="inline h-3 w-3 ml-1 text-amber-500" />
                      )}
                    </p>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px] py-0">
                        {a.role_type === "employee" ? "Operaio" : "Subappaltatore"}
                      </Badge>
                      {a.data_inizio && (
                        <span className="text-[10px] text-muted-foreground">
                          Dal {a.data_inizio}{a.data_fine_prevista ? ` al ${a.data_fine_prevista}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {canEdit && (
                  <Button
                    size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                    onClick={() => rimuoviMutation.mutate(a.id)}
                    disabled={rimuoviMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Dialog assegnazione */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assegna al cantiere</DialogTitle>
            <DialogDescription>
              L&apos;utente assegnato vedrà questo cantiere nell&apos;app campo su{" "}
              <a href="https://lavori.ediliziaincloud.com" target="_blank" rel="noreferrer" className="underline">
                lavori.ediliziaincloud.com
              </a>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Utente</Label>
              <Select value={formUserId} onValueChange={setFormUserId}>
                <SelectTrigger><SelectValue placeholder="Seleziona operaio o subappaltatore" /></SelectTrigger>
                <SelectContent>
                  {utentiCampo.map((u: any) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.profile?.first_name} {u.profile?.last_name}
                      <span className="ml-2 text-muted-foreground text-xs">
                        ({u.role === "employee" ? "Operaio" : "Sub"})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data inizio</Label>
                <Input type="date" value={formDataInizio} onChange={e => setFormDataInizio(e.target.value)} />
              </div>
              <div>
                <Label>Data fine prevista</Label>
                <Input type="date" value={formDataFine} onChange={e => setFormDataFine(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formCapocantiere} onCheckedChange={setFormCapocantiere} />
              <Label>Capocantiere (vede rapportini di tutti)</Label>
            </div>
            <div>
              <Label>Note (opzionale)</Label>
              <Input
                value={formNote}
                onChange={e => setFormNote(e.target.value)}
                placeholder="Es: Responsabile posa serramenti"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button
              onClick={() => assegnaMutation.mutate()}
              disabled={!formUserId || assegnaMutation.isPending}
            >
              {assegnaMutation.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : "Assegna"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
