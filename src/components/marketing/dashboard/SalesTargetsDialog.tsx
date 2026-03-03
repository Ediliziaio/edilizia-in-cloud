import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Target, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface TargetRow {
  user_id: string;
  name: string;
  target_revenue: number;
  target_contracts: number;
  target_appointments: number;
}

export function SalesTargetsDialog() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<TargetRow[]>([]);

  const loadData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("company_id", companyId)
        .limit(100);

      const { data: targets } = await supabase
        .from("sales_targets" as any)
        .select("*")
        .eq("company_id", companyId)
        .eq("period_type", "weekly");

      const targetMap = new Map<string, any>();
      (targets || []).forEach((t: any) => targetMap.set(t.user_id, t));

      const result: TargetRow[] = (profiles || []).map(p => {
        const t = targetMap.get(p.id);
        return {
          user_id: p.id,
          name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Utente",
          target_revenue: t?.target_revenue || 0,
          target_contracts: t?.target_contracts || 0,
          target_appointments: t?.target_appointments || 0,
        };
      });

      setRows(result);
    } catch (e) {
      console.error(e);
      toast.error("Errore nel caricamento target");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (open && companyId) {
      loadData();
    }
  }, [open, companyId, loadData]);

  const updateRow = (userId: string, field: keyof TargetRow, value: number) => {
    setRows(prev => prev.map(r => r.user_id === userId ? { ...r, [field]: value } : r));
  };

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      const toUpsert = rows.map(r => ({
        company_id: companyId,
        user_id: r.user_id,
        period_type: "weekly",
        target_revenue: r.target_revenue,
        target_contracts: r.target_contracts,
        target_appointments: r.target_appointments,
        target_calls: 0,
      }));

      if (toUpsert.length > 0) {
        const { error } = await supabase
          .from("sales_targets" as any)
          .upsert(toUpsert as any, { onConflict: "company_id,user_id,period_type" });
        if (error) throw error;
      }

      toast.success("Target salvati con successo");
      queryClient.invalidateQueries({ queryKey: ["marketing-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["sales-targets"] });
      setOpen(false);
    } catch (e: any) {
      console.error(e);
      toast.error("Errore nel salvataggio: " + (e.message || ""));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Target className="h-4 w-4 mr-1.5" />
          Target
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Target Settimanali
          </DialogTitle>
          <DialogDescription>
            Configura gli obiettivi settimanali per ogni commerciale
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_100px_80px_80px] gap-2 text-xs font-medium text-muted-foreground px-1">
              <span>Commerciale</span>
              <span className="text-right">Fatturato €</span>
              <span className="text-right">Contratti</span>
              <span className="text-right">App.</span>
            </div>
            {rows.map(r => (
              <div key={r.user_id} className="grid grid-cols-[1fr_100px_80px_80px] gap-2 items-center">
                <span className="text-sm font-medium truncate">{r.name}</span>
                <Input
                  type="number"
                  min={0}
                  value={r.target_revenue || ""}
                  onChange={e => updateRow(r.user_id, "target_revenue", Number(e.target.value) || 0)}
                  className="h-8 text-sm text-right"
                  placeholder="0"
                />
                <Input
                  type="number"
                  min={0}
                  value={r.target_contracts || ""}
                  onChange={e => updateRow(r.user_id, "target_contracts", Number(e.target.value) || 0)}
                  className="h-8 text-sm text-right"
                  placeholder="0"
                />
                <Input
                  type="number"
                  min={0}
                  value={r.target_appointments || ""}
                  onChange={e => updateRow(r.user_id, "target_appointments", Number(e.target.value) || 0)}
                  className="h-8 text-sm text-right"
                  placeholder="0"
                />
              </div>
            ))}
            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nessun membro del team trovato</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
            Salva Target
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
