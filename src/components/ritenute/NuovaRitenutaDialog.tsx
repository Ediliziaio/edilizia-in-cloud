import { useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { parseDecimalIT } from '@/lib/parseDecimalIT';
import { refreshFinancialQueries } from '@/lib/orders/financialRefresh';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function NuovaRitenutaDialog({
  open,
  onOpenChange,
  companyId,
  onCreated,
  initialOrderId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string | undefined;
  onCreated: () => void;
  initialOrderId?: string;
}) {
  const t = useT();
  const permissions = usePermissions();
  const qc = useQueryClient();
  const formId = useId();
  const lock=useRef(false);
  const [direzione, setDirezione] = useState<"attiva" | "passiva">("attiva");
  const [orderId, setOrderId] = useState<string>(initialOrderId??"");
  // Una ritenuta passiva vive sul contratto di subappalto oppure, se il
  // contratto non è stato caricato, sulla sola commessa.
  const [contrattoId, setContrattoId] = useState<string>("");
  const [controparte, setControparte] = useState("");
  const [importo, setImporto] = useState("");
  const [percentuale, setPercentuale] = useState("");
  const [svincoloPrevisto, setSvincoloPrevisto] = useState("");
  const [fideiussione, setFideiussione] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: commesse = [] } = useQuery({
    queryKey: ["ritenute-commesse-picker", companyId],
    enabled: !!companyId && open,
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select("id, order_code, description")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if(initialOrderId) query=query.eq("id",initialOrderId);
      const {data,error}=await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: contratti = [] } = useQuery({
    queryKey: ["ritenute-contratti-picker", companyId, initialOrderId],
    enabled: !!companyId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contratti_subappalto")
        .select(
          "id, order_id, numero_contratto, ritenuta_garanzia_pct, sub:subappaltatori_sicurezza!contratti_subappalto_subappaltatore_id_fkey(ragione_sociale), commessa:orders!contratti_subappalto_order_id_fkey(order_code)",
        )
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []).filter(c=>!initialOrderId || c.order_id===initialOrderId) as Array<{
        id: string;
        numero_contratto: string | null;
        ritenuta_garanzia_pct: number | null;
        sub: { ragione_sociale: string | null } | null;
        commessa: { order_code: string | null } | null;
      }>;
    },
  });

  const salva = async () => {
    if (lock.current || saving) return;
    if (!companyId || !permissions.isAdmin || permissions.solaLettura) {
      toast({ title: t("Modifica non autorizzata"), variant: "destructive" });
      return;
    }
    const imp = parseDecimalIT(importo);
    if (!imp || imp <= 0) {
      toast({
        title: t("Importo mancante"),
        description: t("Inserisci l'importo trattenuto."),
        variant: "destructive",
      });
      return;
    }
    if (direzione === "passiva" && !contrattoId && !orderId) {
      toast({
        title: t("Commessa mancante"),
        description:
          t("Scegli il contratto del subappaltatore o, se non c'è, la commessa."),
        variant: "destructive",
      });
      return;
    }
    if (direzione === "passiva" && !contrattoId && !controparte.trim()) {
      toast({
        title: t("Subappaltatore mancante"),
        description: t("Senza contratto serve il nome del subappaltatore."),
        variant: "destructive",
      });
      return;
    }
    if (direzione === "attiva" && !orderId) {
      toast({
        title: t("Commessa mancante"),
        description: t("Una ritenuta attiva vive su una commessa: scegli quale."),
        variant: "destructive",
      });
      return;
    }
    lock.current=true;
    setSaving(true);
    try {
      const { error } = await supabase.from("ritenute_garanzia").insert({
        company_id: companyId,
        direzione,
        // Col contratto, commessa, percentuale, svincolo e subappaltatore li completa il database.
        order_id: direzione === "passiva" && contrattoId ? null : orderId,
        contratto_id:
          direzione === "passiva" && contrattoId ? contrattoId : null,
        controparte: controparte || null,
        importo: imp,
        percentuale_applicata: percentuale.trim()
          ? parseDecimalIT(percentuale)
          : null,
        stato: "trattenuta",
        data_svincolo_prevista: svincoloPrevisto || null,
        fideiussione,
      });
      if (error) throw error;
      toast({ title: t("Ritenuta registrata") });
      refreshFinancialQueries(qc);
      onCreated();
      onOpenChange(false);
      setOrderId(initialOrderId??"");
      setContrattoId("");
      setControparte("");
      setImporto("");
      setSvincoloPrevisto("");
      setFideiussione(false);
    } catch (e) {
      toast({
        title: t("Errore"),
        description: e instanceof Error ? e.message : t("Riprova."),
        variant: "destructive",
      });
    } finally {
      lock.current=false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t("Nuova ritenuta di garanzia")}</DialogTitle>
          <DialogDescription>
            {t("Collega la garanzia alla commessa. Lo svincolo documentato e l’incasso restano operazioni distinte.")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-direzione`}>{t("Direzione")}</Label>
            <Select
              value={direzione}
              onValueChange={(v) => setDirezione(v as "attiva" | "passiva")}
            >
              <SelectTrigger id={`${formId}-direzione`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="attiva">
                  {t("Trattenuta a me (dal committente)")}
                </SelectItem>
                <SelectItem value="passiva">
                  {t("La trattengo io (al subappaltatore)")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {direzione === "passiva" && (
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-contratto`}>{t("Contratto di subappalto")}</Label>
              <Select
                value={contrattoId || "nessuno"}
                onValueChange={(v) => {
                  if (v === "nessuno") {
                    // Nome e percentuale venivano dal contratto appena tolto.
                    setContrattoId("");
                    setControparte("");
                    setPercentuale("");
                    return;
                  }
                  setContrattoId(v);
                  const c = contratti.find((x) => x.id === v);
                  if (c?.sub?.ragione_sociale && !controparte)
                    setControparte(c.sub.ragione_sociale);
                  if (c?.ritenuta_garanzia_pct != null)
                    setPercentuale(
                      String(c.ritenuta_garanzia_pct).replace(".", ","),
                    );
                }}
              >
                <SelectTrigger id={`${formId}-contratto`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nessuno">{t("Senza contratto")}</SelectItem>
                  {contratti.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {[
                        c.sub?.ragione_sociale,
                        c.commessa?.order_code,
                        c.numero_contratto,
                      ]
                        .filter(Boolean)
                        .join(" · ") || t("Contratto")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {(direzione === "attiva" || !contrattoId) && (
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-commessa`}>{t("Commessa")}</Label>
              <Select value={orderId} onValueChange={setOrderId} disabled={!!initialOrderId}>
                <SelectTrigger id={`${formId}-commessa`}>
                  <SelectValue placeholder={t("Scegli la commessa")} />
                </SelectTrigger>
                <SelectContent>
                  {commesse.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.order_code ?? c.id.slice(0, 8)}
                      {c.description ? ` · ${c.description.slice(0, 40)}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-controparte`}>
              {direzione === "attiva" ? t("Committente") : t("Subappaltatore")}
            </Label>
            <Input
              id={`${formId}-controparte`}
              value={controparte}
              onChange={(e) => setControparte(e.target.value)}
              placeholder={t("Nome")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-importo`}>{t("Importo trattenuto (€)")}</Label>
              <Input
                inputMode="decimal"
                id={`${formId}-importo`}
                value={importo}
                onChange={(e) => setImporto(e.target.value)}
                placeholder={t("es. 7.500")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-percentuale`}>{t("% applicata")}</Label>
              <Input
                inputMode="decimal"
                id={`${formId}-percentuale`}
                value={percentuale}
                onChange={(e) => setPercentuale(e.target.value)}
                placeholder="5"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-svincolo`}>{t("Svincolo previsto")}</Label>
            <Input
              type="date"
              id={`${formId}-svincolo`}
              value={svincoloPrevisto}
              onChange={(e) => setSvincoloPrevisto(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              {t("Usa la data prevista dal contratto o dal certificato: non viene confermata automaticamente.")}
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={fideiussione}
              onChange={(e) => setFideiussione(e.target.checked)}
              className="h-4 w-4"
            />
            {t("Sostituita da fideiussione (non registra un incasso)")}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("Annulla")}
          </Button>
          <Button
            onClick={salva}
            disabled={saving}
          >
            {saving ? t("Salvataggio…") : t("Registra")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
