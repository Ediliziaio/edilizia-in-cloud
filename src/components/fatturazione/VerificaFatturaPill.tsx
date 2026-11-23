/** Verificata, da verificare o da rettificare: si sceglie in ogni senso e non tocca la contabilità. */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatoPill } from "@/components/orders/TabellaCommessa";
import { supabase } from "@/integrations/supabase/client";
import { messaggioSalvataggio } from "@/lib/fatturazione/salvataggioFattura";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function VerificaFatturaPill({ id, numero, verificata, puoCambiare, avviso = false, altreAzioni, daRettificare = false, motivoRettifica }: {
  id: string; numero: string | null; verificata: boolean; puoCambiare: boolean; daRettificare?: boolean; motivoRettifica?: string | null; /** Verificata, ma con qualcosa che non torna. */ avviso?: boolean; altreAzioni?: Array<{ testo: string; fai: () => void }>;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const [chiediMotivo, setChiediMotivo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const aggiorna = () => { for (const k of ["fatture-ricevute", "commessa-fatture-fornitori", "fattura-ricevuta-riepilogo"]) void queryClient.invalidateQueries({ queryKey: [k] }); };
  const rettifica = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fattura_segna_rettifica", { p_fattura_id: id, p_motivo: motivo });
      if (error) throw error;
      if ((data as { fattura_id?: string } | null)?.fattura_id !== id) throw new Error(t("Il server non ha confermato il salvataggio della rettifica. Aggiorna e riprova."));
      return Number((data as { riba_aperte?: number } | null)?.riba_aperte ?? 0);
    },
    onSuccess: (riba) => {
      toast.success(t("Fattura {numero} da rettificare", { numero: numero ?? "" }), riba > 0
        ? { description: t("Ha {riba} RiBa aperte: se la contesti, va bloccata in banca prima dell'addebito. Lo stato si segna da Tesoreria.", { riba }), duration: 12000 }
        : undefined);
      setChiediMotivo(false); setMotivo(""); aggiorna();
    },
    onError: (e) => toast.error(t("Non salvato"), { description: messaggioSalvataggio(e) }),
  });
  const segna = useMutation({
    mutationFn: async (valore: boolean) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fattura_segna_verifica", { p_fattura_id: id, p_verificata: valore });
      if (error) throw error;
      if (data?.fattura_id !== id || data?.verificata !== valore) throw new Error(t("Il server non ha confermato il cambio di verifica. Aggiorna e riprova."));
    },
    onSuccess: (_d, valore) => {
      toast.success(valore ? t("Fattura {numero} verificata", { numero: numero ?? "" }) : t("Fattura {numero} da verificare", { numero: numero ?? "" }));
      for (const k of ["fatture-ricevute", "commessa-fatture-fornitori", "fattura-ricevuta-riepilogo"]) void queryClient.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => toast.error(t("Verifica non salvata"), { description: messaggioSalvataggio(e) }),
  });
  const tono = daRettificare ? "rosso" : verificata && !avviso ? "verde" : "ambra";
  const testo = daRettificare ? "Da rettificare" : verificata ? "Verificata" : "Da verificare";
  const titolo = daRettificare && motivoRettifica ? motivoRettifica : undefined;
  if (!puoCambiare) return <span title={titolo}><StatoPill tono={tono}>{testo}</StatoPill></span>;
  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger disabled={segna.isPending || rettifica.isPending} title={titolo} aria-label={`Cambia la verifica della fattura ${numero ?? ""}`}>
        <StatoPill tono={tono}>{testo}<ChevronDown className="ml-1 inline h-3 w-3" aria-hidden="true" /></StatoPill>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem disabled={verificata} onSelect={() => segna.mutate(true)}>{t("Verificata")}</DropdownMenuItem>
        <DropdownMenuItem disabled={!verificata && !daRettificare} onSelect={() => segna.mutate(false)}>{t("Da verificare")}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { setMotivo(motivoRettifica ?? ""); setChiediMotivo(true); }}>{t("Da rettificare…")}</DropdownMenuItem>
        {altreAzioni?.map((a) => <DropdownMenuItem key={a.testo} onSelect={a.fai}>{a.testo}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
    {segna.isError && <span role="alert" className="block max-w-sm text-xs text-destructive">{messaggioSalvataggio(segna.error)}</span>}
    <Dialog open={chiediMotivo} onOpenChange={setChiediMotivo}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Fattura {numero} da rettificare", { numero: numero ?? "" })}</DialogTitle>
          <DialogDescription>{t("La fattura è sbagliata e serve un intervento del fornitore, di solito una nota di credito. Non cambia i conti.")}</DialogDescription>
        </DialogHeader>
        <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={1000} rows={3} autoFocus aria-label={t("Cosa va rettificato")} placeholder={t("Cosa non torna: importo, merce, IVA…")} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setChiediMotivo(false)}>{t("Annulla")}</Button>
          <Button disabled={!motivo.trim() || rettifica.isPending} onClick={() => rettifica.mutate()}>{t("Salva")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
