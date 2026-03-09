import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Gem, Palette, MessageSquare, History, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { Company } from "@/types/auth";

interface CompanyAddonsSectionProps {
  company: Company;
}

export function CompanyAddonsSection({ company }: CompanyAddonsSectionProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activateDialog, setActivateDialog] = useState(false);
  const [deactivateDialog, setDeactivateDialog] = useState(false);
  const [historyDialog, setHistoryDialog] = useState(false);
  const [price, setPrice] = useState(String(company.white_label_monthly_price ?? 49));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [priceEditing, setPriceEditing] = useState(false);

  const { data: logs } = useQuery({
    queryKey: ["addon-logs", company.id, "white_label"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_addons_log" as never)
        .select("*")
        .eq("company_id", company.id)
        .eq("addon_key", "white_label")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: historyDialog,
  });

  const handleActivate = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("companies")
        .update({
          white_label_enabled: true,
          white_label_enabled_at: new Date().toISOString(),
          white_label_enabled_by: user.id,
          white_label_monthly_price: parseFloat(price) || 0,
        } as never)
        .eq("id", company.id);
      if (error) throw error;

      await supabase.from("company_addons_log" as never).insert({
        company_id: company.id,
        addon_key: "white_label",
        action: "enabled",
        performed_by: user.id,
        performed_by_email: user.email,
        new_value: { price: parseFloat(price), notes },
        notes,
      } as never);

      toast.success(`White Label attivato per ${company.name}`);
      queryClient.invalidateQueries({ queryKey: ["company-detail", company.id] });
      setActivateDialog(false);
      setNotes("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("companies")
        .update({ white_label_enabled: false } as never)
        .eq("id", company.id);
      if (error) throw error;

      await supabase.from("company_addons_log" as never).insert({
        company_id: company.id,
        addon_key: "white_label",
        action: "disabled",
        performed_by: user.id,
        performed_by_email: user.email,
        old_value: { price: company.white_label_monthly_price },
      } as never);

      toast.success(`White Label disattivato per ${company.name}`);
      queryClient.invalidateQueries({ queryKey: ["company-detail", company.id] });
      setDeactivateDialog(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePriceBlur = async () => {
    setPriceEditing(false);
    const newPrice = parseFloat(price) || 0;
    if (newPrice === (company.white_label_monthly_price ?? 0)) return;
    try {
      const { error } = await supabase
        .from("companies")
        .update({ white_label_monthly_price: newPrice } as never)
        .eq("id", company.id);
      if (error) throw error;

      await supabase.from("company_addons_log" as never).insert({
        company_id: company.id,
        addon_key: "white_label",
        action: "price_changed",
        performed_by: user?.id,
        performed_by_email: user?.email,
        old_value: { price: company.white_label_monthly_price },
        new_value: { price: newPrice },
      } as never);

      toast.success("Prezzo aggiornato");
      queryClient.invalidateQueries({ queryKey: ["company-detail", company.id] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gem className="h-5 w-5 text-amber-500" />
            Addon a Pagamento
          </CardTitle>
          <CardDescription>Funzionalità premium attivabili manualmente per questa azienda</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* White Label */}
          <div className="rounded-xl border p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Palette className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">White Label</span>
                    {company.white_label_enabled && (
                      <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200">ATTIVO</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Personalizzazione completa del brand: logo, colori, nome piattaforma, favicon.
                  </p>
                </div>
              </div>
              <Switch
                checked={company.white_label_enabled}
                onCheckedChange={(checked) => {
                  if (checked) setActivateDialog(true);
                  else setDeactivateDialog(true);
                }}
              />
            </div>

            {company.white_label_enabled && (
              <>
                <Separator />
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Label className="text-muted-foreground">Prezzo mensile:</Label>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">€</span>
                      <Input
                        type="number"
                        step="0.01"
                        value={price}
                        onChange={(e) => { setPrice(e.target.value); setPriceEditing(true); }}
                        onBlur={handlePriceBlur}
                        className="w-24 h-8"
                      />
                    </div>
                  </div>
                  <Separator orientation="vertical" className="h-6" />
                  <span className="text-muted-foreground">
                    Attivo dal {company.white_label_enabled_at
                      ? format(new Date(company.white_label_enabled_at), "dd/MM/yyyy", { locale: it })
                      : "—"}
                  </span>
                </div>
                <Button variant="ghost" size="sm" className="gap-2" onClick={() => setHistoryDialog(true)}>
                  <History className="h-4 w-4" /> Storico attivazioni
                </Button>
              </>
            )}

            {!company.white_label_enabled && (
              <Button variant="ghost" size="sm" className="gap-2" onClick={() => setHistoryDialog(true)}>
                <History className="h-4 w-4" /> Storico attivazioni
              </Button>
            )}
          </div>

          {/* Messaging Beta placeholder */}
          <div className="rounded-xl border p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Messaggistica Beta</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300">BETA</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Accesso anticipato alla messaggistica interna.</p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground italic">Gestito via Feature Flags</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activate Dialog */}
      <Dialog open={activateDialog} onOpenChange={setActivateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attivare White Label per {company.name}?</DialogTitle>
            <DialogDescription>L'azienda potrà personalizzare colori, nome piattaforma, favicon e sfondo login.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Prezzo mensile (€)</Label>
              <Input
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="49.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Note interne</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder='Es. "Pagamento ricevuto"'
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivateDialog(false)}>Annulla</Button>
            <Button onClick={handleActivate} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              ✓ Attiva White Label
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Dialog */}
      <Dialog open={deactivateDialog} onOpenChange={setDeactivateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disattivare White Label per {company.name}?</DialogTitle>
            <DialogDescription>
              L'azienda perderà le personalizzazioni di branding. Il logo personalizzato rimarrà salvato.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateDialog(false)}>Annulla</Button>
            <Button variant="destructive" onClick={handleDeactivate} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Disattiva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyDialog} onOpenChange={setHistoryDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Storico White Label — {company.name}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-4 pr-4">
              {logs && logs.length > 0 ? (
                logs.map((log: any) => (
                  <div key={log.id} className="flex gap-3">
                    <div className={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${
                      log.action === "enabled" ? "bg-emerald-500" : log.action === "disabled" ? "bg-red-400" : "bg-amber-400"
                    }`} />
                    <div className="text-sm space-y-0.5">
                      <p className="font-medium">
                        {log.action === "enabled" ? "ATTIVATO" : log.action === "disabled" ? "DISATTIVATO" : "PREZZO MODIFICATO"}
                      </p>
                      <p className="text-muted-foreground">
                        {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: it })}
                        {" — "}{log.performed_by_email || "—"}
                      </p>
                      {log.new_value?.price != null && (
                        <p className="text-muted-foreground">Prezzo: €{log.new_value.price}/mese</p>
                      )}
                      {log.notes && <p className="text-muted-foreground italic">"{log.notes}"</p>}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nessuna attività registrata.</p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
