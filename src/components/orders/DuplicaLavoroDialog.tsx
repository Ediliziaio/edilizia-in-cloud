import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { Copy, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type TipoCopia = "commessa" | "rst";
interface RiepilogoCopia { totale?: number | null; numero: string; materiali: number; voci: number; fasi: number; sottofasi: number; impronta: string; id?: string }
export function DuplicaLavoroDialog({ tipo, sourceId, open, onOpenChange, onDuplicato }: {
  tipo: TipoCopia; sourceId: string; open: boolean; onOpenChange: (v: boolean) => void; onDuplicato: (id: string) => void;
}) {
  const t = useT();
  const [mantieniCliente, setMantieniCliente] = useState(false);
  const [riepilogo, setRiepilogo] = useState<RiepilogoCopia | null>(null);
  const [errore, setErrore] = useState("");
  const [caricamento, setCaricamento] = useState(false);
  const [salvataggio, setSalvataggio] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [aggiornare, setAggiornare] = useState(false);
  const [revisione, setRevisione] = useState(0);
  const etichetta = tipo === "commessa" ? "commessa" : "preventivo";
  useEffect(() => {
    if (!open) return;
    setRequestId(crypto.randomUUID());
    setMantieniCliente(false);
  }, [open, sourceId]);
  useEffect(() => {
    if (!open) return;
    let attivo = true;
    setCaricamento(true); setRiepilogo(null); setErrore(""); setAggiornare(false);
    void supabase.rpc("duplica_lavoro_atomic" as never, {
      p_tipo: tipo, p_source_id: sourceId, p_mantieni_cliente: mantieniCliente, p_anteprima: true,
    } as never).then(({ data, error }) => {
      if (!attivo) return;
      if (error || !data) setErrore(error?.message ?? t("Riepilogo non disponibile."));
      else setRiepilogo(data as unknown as RiepilogoCopia);
      setCaricamento(false);
    }, () => { if (attivo) { setErrore(t("Connessione non disponibile. Chiudi e riprova.")); setCaricamento(false); } });
    return () => { attivo = false; };
  }, [open, sourceId, tipo, mantieniCliente, revisione]);
  const duplica = async () => {
    if (!riepilogo || !requestId) return;
    setSalvataggio(true); setErrore("");
    try {
      const { data, error } = await supabase.rpc("duplica_lavoro_atomic" as never, {
        p_tipo: tipo, p_source_id: sourceId, p_mantieni_cliente: mantieniCliente,
        p_anteprima: false, p_impronta: riepilogo.impronta, p_request_id: requestId,
      } as never);
      if (error) { setAggiornare(["PT409", "40001"].includes(error.code ?? "")); throw new Error(error.message); }
      const risultato = data as unknown as RiepilogoCopia;
      if (!risultato?.id) throw new Error(t("Duplicazione non confermata. Riprova."));
      toast.success(tipo === "commessa" ? t("Commessa duplicata") : t("Preventivo duplicato"), { description: t("La copia è pronta da modificare. L’originale resta invariato.") });
      onOpenChange(false); onDuplicato(risultato.id);
    } catch (e) { setErrore(e instanceof Error ? e.message : t("Duplicazione non riuscita.")); }
    finally { setSalvataggio(false); }
  };
  return <Dialog open={open} onOpenChange={(v) => { if (!salvataggio) onOpenChange(v); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>{tipo === "commessa" ? t("Duplica commessa") : t("Duplica preventivo")}</DialogTitle>
        <DialogDescription>{t("Riparti dai lavori già organizzati. La copia sarà indipendente dall’originale.")}</DialogDescription></DialogHeader>
      <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
        <Checkbox disabled={salvataggio} checked={mantieniCliente} onCheckedChange={(v) => setMantieniCliente(v === true)} aria-label={t("Mantieni cliente e indirizzo")} />
        <span><span className="font-medium">{t("Mantieni cliente e indirizzo")}</span><span className="mt-1 block text-xs text-muted-foreground">{t("Lascia spento per preparare il lavoro per un nuovo cliente.")}</span></span>
      </label>
      {caricamento ? <p role="status" className="flex gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />{t("Controllo cosa verrà copiato…")}</p> : riepilogo && <div className="space-y-3 text-sm">
        <p className="font-medium">{t("Da {numero}", { numero: riepilogo.numero || t(etichetta) })}</p>
        {riepilogo.totale != null && <p className="text-sm">{t("Contratto invariato ·")} <strong>{formatCurrency(riepilogo.totale)}</strong> {t("IVA inclusa")}</p>}
        <div className="rounded-lg bg-muted p-3"><p className="font-semibold">{t("Nella copia")}</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>{tipo === "commessa" ? t("Materiali da approvvigionare: {n}", { n: riepilogo.materiali }) : t("{n} voci di computo con prezzi e descrizioni", { n: riepilogo.voci })}</li>
            <li>{tipo === "rst" && riepilogo.fasi === 0 ? t("Lavorazioni organizzate dai capitoli del computo") : t("{fasi} fasi e {sottofasi} sottofasi pianificate", { fasi: riepilogo.fasi, sottofasi: riepilogo.sottofasi })}</li>
            <li>{t("Condizioni economiche e prezzi di vendita")}</li>
          </ul>
        </div>
        <p className="text-xs text-muted-foreground">{t("Avanzamento da zero. Non si copiano ore lavorate, costi effettivi, incassi, foto di cantiere, assegnazioni o vecchie scadenze.")}</p>
        <p className="text-xs text-muted-foreground">{tipo === "rst" ? t("La copia riparte in bozza e potrai convertirla in una nuova commessa.") : t("I materiali ripartono da ordinare; nessun prelievo dal magazzino e nessun ordine al fornitore.")}</p>
      </div>}
      {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
      {aggiornare && <Button variant="outline" onClick={() => setRevisione(v => v + 1)}>{t("Aggiorna riepilogo")}</Button>}
      <DialogFooter><Button variant="outline" disabled={salvataggio} onClick={() => onOpenChange(false)}>{t("Annulla")}</Button>
        <Button disabled={caricamento || salvataggio || !riepilogo || aggiornare} onClick={() => { void duplica(); }}>
          {salvataggio ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
          {salvataggio ? t("Creazione copia…") : t("Crea copia e apri")}
        </Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
