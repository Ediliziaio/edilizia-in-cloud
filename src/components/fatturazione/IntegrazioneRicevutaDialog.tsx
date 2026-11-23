import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentOperativo as DialogContent } from "@/components/orders/generali/design/ContestoOperativo";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  datiIntegrazione, tipoProposto, TIPI_INTEGRAZIONE,
  type RicevutaDaIntegrare, type TipoIntegrazione,
} from "@/lib/fatturazione/integrazioneRicevuta";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** Il tipo e l'aliquota li conferma una persona: sono scelte fiscali. */
export function IntegrazioneRicevutaDialog({ fattura, onClose }: { fattura: RicevutaDaIntegrare | null; onClose: () => void }) {
  const tr = useT();
  const navigate = useNavigate();
  const [tipo, setTipo] = useState<TipoIntegrazione>("reverse_charge_interno");
  const [aliquota, setAliquota] = useState("22");

  useEffect(() => {
    if (!fattura) return;
    setTipo(tipoProposto(fattura));
    setAliquota(String(fattura.aliquota_reverse_charge ?? 22));
  }, [fattura]);

  const { data: esistente } = useQuery({
    queryKey: ["integrazione-ricevuta", fattura?.id],
    enabled: !!fattura,
    queryFn: async () => {
      const { data, error } = await supabase.from("documenti_fiscali" as never)
        .select("id, numero, stato").eq("fattura_ricevuta_id", fattura!.id)
        .is("deleted_at", null).neq("stato", "annullata").maybeSingle();
      if (error) throw error;
      return data as { id: string; numero: string; stato: string } | null;
    },
  });

  const crea = () => {
    if (!fattura) return;
    navigate(`/azienda/documenti/nuovo?tipo=${tipo}`, { state: { prefilled: datiIntegrazione(fattura, Number(aliquota)) } });
    onClose();
  };

  return (
    <Dialog open={!!fattura} onOpenChange={(o) => !o && onClose()}>
      <DialogContent struttura="scorrevole" ampiezza="modulo" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tr("Integrazione della fattura")}</DialogTitle>
          <DialogDescription>{tr("{fornitore} · n. {numero}. Si crea una bozza da controllare prima dell'invio allo SDI.", { fornitore: String(fattura?.cedente_ragione_sociale ?? ""), numero: String(fattura?.numero_fattura ?? "") })}</DialogDescription>
        </DialogHeader>
        {esistente ? (
          <p className="text-sm">
            {tr("Esiste già:")} <Link className="underline" to={`/azienda/documenti/${esistente.id}`} onClick={onClose}>{esistente.numero}</Link>.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tipo-integrazione">{tr("Tipo")}</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoIntegrazione)}>
                <SelectTrigger id="tipo-integrazione"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPI_INTEGRAZIONE.map((t) => <SelectItem key={t.tipo} value={t.tipo}>{t.etichetta}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aliquota-integrazione">{tr("Aliquota IVA da integrare")}</Label>
              <Select value={aliquota} onValueChange={setAliquota}>
                <SelectTrigger id="aliquota-integrazione"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["22", "10", "5", "4"].map((a) => <SelectItem key={a} value={a}>{a}%</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tr("Chiudi")}</Button>
          {!esistente && <Button onClick={crea}>{tr("Crea bozza")}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
