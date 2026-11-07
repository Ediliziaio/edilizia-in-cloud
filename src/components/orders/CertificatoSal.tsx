/** Il certificato di pagamento di un SAL: si legge sulla scheda, lo cambia chi modifica la commessa. */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import {
  certificatoProposto,
  leggiImportoItaliano as valore,
  lordoCertificato,
  nettoCertificato,
  type SalCertificato,
} from "@/lib/orders/salCertificato";

const CAMPI = [
  ["lavori_contrattuali", "Lavori contrattuali eseguiti"],
  ["varianti", "Varianti ed extra eseguiti"],
  ["ritenuta_pct", "Ritenuta di garanzia %"],
  ["ritenuta", "Ritenuta (totale a oggi)"],
  ["recupero_anticipazione", "Recupero anticipazione (totale a oggi)"],
  ["altre_detrazioni", "Altre detrazioni (totale a oggi)"],
  ["acconti_precedenti", "Acconti precedenti"],
] as const;
type Campo = (typeof CAMPI)[number][0];
type Bozza = Record<Campo, string> & { nota: string };

const inBozza = (c: SalCertificato): Bozza => ({
  ...(Object.fromEntries(CAMPI.map(([k]) => [k, String(c[k] ?? 0)])) as Record<Campo, string>),
  nota: c.altre_detrazioni_nota ?? "",
});

interface Props {
  salId: string;
  orderId: string;
  companyId: string;
  numero: number;
  cumulativo: number;
  certificato: SalCertificato | null;
  precedente: SalCertificato | null;
  /** Cumulativo dell'ultimo SAL emesso prima di questo: serve se quel SAL non ha certificato. */
  giaMaturato: number;
  puoModificare: boolean;
  /** Perché non si può più cambiare (rata fatturata o incassata, certificato dopo): si mostra al posto del pulsante. */
  bloccato?: string | null;
}

export function CertificatoSal({ salId, orderId, companyId, numero, cumulativo, certificato, precedente, giaMaturato, puoModificare, bloccato }: Props) {
  const queryClient = useQueryClient();
  const [bozza, setBozza] = useState<Bozza | null>(null);

  const numeri = bozza
    ? {
        lavori_contrattuali: valore(bozza.lavori_contrattuali),
        varianti: valore(bozza.varianti),
        ritenuta_pct: valore(bozza.ritenuta_pct),
        ritenuta: valore(bozza.ritenuta),
        recupero_anticipazione: valore(bozza.recupero_anticipazione),
        altre_detrazioni: valore(bozza.altre_detrazioni),
        acconti_precedenti: valore(bozza.acconti_precedenti),
      }
    : null;
  const validi = !!numeri && Object.values(numeri).every((n) => Number.isFinite(n) && n >= 0) && numeri.ritenuta_pct <= 100;
  const netto = validi && numeri ? nettoCertificato(numeri) : null;

  const salva = useMutation({
    mutationFn: async () => {
      if (!numeri || netto === null) throw new Error("Controlla gli importi del certificato.");
      const { error } = await (supabase as never as { from: (t: string) => { upsert: (r: unknown) => Promise<{ error: { message: string } | null }> } })
        .from("sal_certificati")
        .upsert({ sal_id: salId, order_id: orderId, company_id: companyId, ...numeri, altre_detrazioni_nota: bozza?.nota.trim() || null, netto });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Certificato salvato");
      setBozza(null);
      void queryClient.invalidateQueries({ queryKey: ["sal-records", orderId, companyId] });
      void queryClient.invalidateQueries({ queryKey: ["order-sal-for-invoice", orderId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Certificato non salvato"),
  });

  const apri = () => setBozza(inBozza(certificato ?? certificatoProposto(cumulativo, precedente, giaMaturato)));

  return (
    <div className="mt-2">
      {certificato ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border bg-muted/30 p-2 text-xs sm:grid-cols-4">
          <div><dt className="text-muted-foreground">Lavori + varianti</dt><dd className="font-medium tabular-nums">{formatCurrency(lordoCertificato(certificato))}</dd></div>
          <div><dt className="text-muted-foreground">Ritenuta {Number(certificato.ritenuta_pct)}%</dt><dd className="font-medium tabular-nums">{formatCurrency(certificato.ritenuta)}</dd></div>
          {Number(certificato.recupero_anticipazione) > 0 && <div><dt className="text-muted-foreground">Recupero anticipazione</dt><dd className="font-medium tabular-nums">{formatCurrency(certificato.recupero_anticipazione)}</dd></div>}
          {Number(certificato.altre_detrazioni) > 0 && <div title={certificato.altre_detrazioni_nota ?? undefined}><dt className="text-muted-foreground">Altre detrazioni</dt><dd className="font-medium tabular-nums">{formatCurrency(certificato.altre_detrazioni)}</dd></div>}
          <div><dt className="text-muted-foreground">Acconti precedenti</dt><dd className="font-medium tabular-nums">{formatCurrency(certificato.acconti_precedenti)}</dd></div>
          <div><dt className="text-muted-foreground">Netto certificato</dt><dd className="font-semibold tabular-nums">{formatCurrency(certificato.netto)}</dd></div>
          {puoModificare && !bloccato && <div className="col-span-full"><Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={apri}>Modifica certificato</Button></div>}
          {puoModificare && bloccato && <p className="col-span-full text-[11px] text-muted-foreground">{bloccato}</p>}
        </dl>
      ) : puoModificare ? (
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={apri}>Aggiungi certificato di pagamento</Button>
      ) : null}

      <Dialog open={!!bozza} onOpenChange={(aperto) => { if (!aperto) setBozza(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>Certificato di pagamento, SAL n. {numero}</DialogTitle></DialogHeader>
          {bozza && (
            <div className="grid gap-3 sm:grid-cols-2">
              {CAMPI.map(([campo, etichetta]) => (
                <div key={campo} className="space-y-1">
                  <Label htmlFor={`cert-${campo}`}>{etichetta}</Label>
                  <Input id={`cert-${campo}`} inputMode="decimal" value={bozza[campo]} onChange={(e) => setBozza({ ...bozza, [campo]: e.target.value })} />
                </div>
              ))}
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="cert-nota">Motivo delle altre detrazioni</Label>
                <Input id="cert-nota" value={bozza.nota} onChange={(e) => setBozza({ ...bozza, nota: e.target.value })} />
              </div>
              <p className="text-sm font-medium sm:col-span-2">Netto del certificato: {netto === null ? "controlla gli importi" : formatCurrency(netto)}</p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBozza(null)}>Annulla</Button>
            <Button type="button" disabled={!validi || salva.isPending} onClick={() => salva.mutate()}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
