/**
 * «Crea il preventivo» dal prima e dopo: i lavori della pianta diventano righe di un preventivo
 * nuovo in bozza, stanza per stanza. Prima si vedono e si correggono i prezzi (quelli della pianta
 * sono di mercato) e l'IVA; poi il preventivo nasce con gli stessi passi del QuoteBuilder e la
 * pianta resta collegata.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { aggiornaDatiPlanimetria } from "@/lib/planimetrie/archivio";
import type { RiepilogoLavori } from "@/lib/planimetrie/primaEDopo";
import { itemsPreventivo, righeDaLavori, totaleRighe, type RigaProposta } from "@/lib/planimetrie/preventivoDaPianta";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
import { messaggioErrore } from "@/lib/messaggioErrore";

interface Props {
  aperto: boolean;
  onChiudi: () => void;
  lavori: RiepilogoLavori;
  titolo: string;
  planimetriaId: string;
  /** Il cliente della pianta, se c'è: il preventivo nasce già suo. */
  contactId?: string | null;
}

const euro = (v: number) => v.toLocaleString(intlCampo(), { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

export function PreventivoDaPiantaDialog({ aperto, onChiudi, lavori, titolo, planimetriaId, contactId }: Props) {
  const tr = useT();
  const { effectiveCompany, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const iniziali = useMemo(() => righeDaLavori(lavori), [lavori]);
  const [righe, setRighe] = useState<RigaProposta[]>(iniziali);
  const [iva, setIva] = useState("10");
  const [nome, setNome] = useState(`Lavori — ${titolo}`);
  const [inCorso, setInCorso] = useState(false);
  useEffect(() => { if (aperto) { setRighe(iniziali); setNome(`Lavori — ${titolo}`); } }, [aperto, iniziali, titolo]);

  const cambia = (chiave: string, campi: Partial<RigaProposta>) => setRighe((rs) => rs.map((r) => (r.chiave === chiave ? { ...r, ...campi } : r)));
  const imponibile = totaleRighe(righe);

  const crea = async () => {
    const companyId = effectiveCompany?.id;
    if (!companyId || !user?.id) return;
    const items = itemsPreventivo(righe, Number(iva));
    if (!items.length) { toast.error(tr("Nessuna riga da mettere nel preventivo.")); return; }
    setInCorso(true);
    try {
      const { data: numero } = await supabase.rpc("generate_quote_number", { p_company_id: companyId });
      const sb = supabase as unknown as { from: (t: string) => { insert: (r: unknown) => { select: (c: string) => { single: () => Promise<{ data: { id: string } | null; error: unknown }> } } } };
      const { data: q, error } = await sb.from("quotes").insert({
        company_id: companyId,
        quote_number: (numero as string | null) || `OFF-${new Date().getFullYear()}-001`,
        status: "bozza",
        title: nome.trim() || `Lavori — ${titolo}`,
        contact_id: contactId ?? null,
        created_by: user.id,
      }).select("id").single();
      if (error || !q) throw new Error(tr("Il preventivo non si è creato: controlla di poter creare preventivi."));
      const { error: errRighe } = await supabase.rpc("save_quote_items_atomic", { p_quote_id: q.id, p_company_id: companyId, p_items: items as never });
      if (errRighe) throw new Error(tr("Le righe non si sono salvate: apri il preventivo e riprova."));
      // la pianta resta collegata al preventivo (se non lo era già a un altro)
      await aggiornaDatiPlanimetria(planimetriaId, { quoteId: q.id }).catch((): void => undefined);
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast.success(tr("Preventivo creato dalla pianta"), { description: tr("{n} righe, {imponibile} + IVA.", { n: items.length, imponibile: euro(imponibile) }) });
      onChiudi();
      navigate(`/azienda/marketing/preventivi/${q.id}`);
    } catch (e) {
      toast.error(tr("Preventivo non creato"), { description: messaggioErrore(e) });
    } finally {
      setInCorso(false);
    }
  };

  return (
    <Dialog open={aperto} onOpenChange={(v) => { if (!v && !inCorso) onChiudi(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{tr("Crea il preventivo dalla pianta")}</DialogTitle>
          <DialogDescription>{tr("Una riga per ogni lavoro, stanza per stanza. I prezzi sono di mercato: correggili con i tuoi prima di creare il preventivo (poi restano modificabili).")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <div className="space-y-1">
            <Label htmlFor="prev-nome" className="text-xs">{tr("Titolo")}</Label>
            <Input id="prev-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">IVA</Label>
            <Select value={iva} onValueChange={setIva}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">{tr("10% (ristrutturazione)")}</SelectItem>
                <SelectItem value="22">22%</SelectItem>
                <SelectItem value="4">{tr("4% (prima casa, nuova costruzione)")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="max-h-[50vh] overflow-y-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted text-muted-foreground">
              <tr><th className="p-2" /><th className="p-2 text-left">{tr("Lavoro")}</th><th className="p-2 text-right">{tr("Quantità")}</th><th className="p-2 text-right">{tr("Prezzo")}</th><th className="p-2 text-right">{tr("Importo")}</th></tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.chiave} className={`border-t ${r.inclusa ? "" : "opacity-50"}`}>
                  <td className="p-2"><Checkbox checked={r.inclusa} onCheckedChange={(v) => cambia(r.chiave, { inclusa: !!v })} aria-label={tr("Nel preventivo")} /></td>
                  <td className="p-2"><span className="font-medium">{r.stanza}</span> — {r.nome}</td>
                  <td className="whitespace-nowrap p-2 text-right tabular-nums">{r.quantita.toLocaleString(intlCampo())} {r.unita}</td>
                  <td className="p-2 text-right">
                    <Input className="ml-auto h-7 w-24 text-right text-xs" inputMode="decimal" key={`${r.chiave}-${r.prezzo}`} defaultValue={r.prezzo ? String(r.prezzo).replace(".", ",") : ""} placeholder="0"
                      onBlur={(e) => { const v = Number(e.target.value.replace(/\./g, "").replace(",", ".")); if (Number.isFinite(v) && v !== r.prezzo) cambia(r.chiave, { prezzo: v, inclusa: v > 0 || r.inclusa }); }} />
                  </td>
                  <td className="whitespace-nowrap p-2 text-right tabular-nums">{euro(r.quantita * r.prezzo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-right text-sm">{tr("Imponibile")} <span className="font-semibold">{euro(imponibile)}</span> · IVA {iva}% {euro(imponibile * Number(iva) / 100)} · <span className="font-semibold">{tr("Totale {valore}", { valore: euro(imponibile * (1 + Number(iva) / 100)) })}</span></p>
        <DialogFooter>
          <Button variant="outline" onClick={onChiudi} disabled={inCorso}>{tr("Annulla")}</Button>
          <Button onClick={crea} disabled={inCorso || imponibile <= 0}>{inCorso && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{tr("Crea il preventivo")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
