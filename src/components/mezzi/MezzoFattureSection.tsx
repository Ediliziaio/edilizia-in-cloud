/**
 * Le fatture dei fornitori su un mezzo: carburante, officina, leasing. Vale l'importo del legame, cioè le
 * righe che citano il mezzo, non il totale della fattura. Il totale qui sta a parte da tagliandi e scadenze:
 * un bollo può essere sia un documento sia una fattura, e sommarli conterebbe la spesa due volte.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Link as LinkIcon, Search, X } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { tutteLePagine } from "@/lib/fatturazione/registroVendite";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const RipartoCarburanteDialog = lazy(() => import("./RipartoCarburanteDialog"));
const RiepilogoFatturaRicevuta = lazy(() => import("@/components/fatturazione/RiepilogoFatturaRicevuta").then(m => ({ default: m.RiepilogoFatturaRicevuta })));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const errore = (e: unknown) => toast.error("Non riuscito", { description: e instanceof Error ? e.message : String(e) });

interface Riga {
  id: string; fattura_ricevuta_id: string; importo: number | null; confermata: boolean; origine: string;
  fatture_ricevute: { numero_fattura: string; data_fattura: string; cedente_ragione_sociale: string; totale_documento: number | null } | null;
}

export function totaleConfermato(righe: ReadonlyArray<Pick<Riga, "importo" | "confermata">>): number {
  return Math.round(righe.reduce((s, r) => s + (r.confermata ? Number(r.importo ?? 0) : 0), 0) * 100) / 100;
}

/** Le proposte nate dalla targa e non ancora guardate: quante e quanto valgono (fuori dal costo del mezzo). */
export function totaleDaConfermare(righe: ReadonlyArray<Pick<Riga, "importo" | "confermata">>): { quante: number; importo: number } {
  const aperte = righe.filter((r) => !r.confermata);
  return { quante: aperte.length, importo: Math.round(aperte.reduce((s, r) => s + Number(r.importo ?? 0), 0) * 100) / 100 };
}

export function MezzoFattureSection({ mezzoId, puoModificare, ripartoCarburante = false }: { mezzoId: string; puoModificare: boolean; ripartoCarburante?: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  const [fatturaId, setFatturaId] = useState<string | null>(null);
  const [fatturaRiparto, setFatturaRiparto] = useState<Riga | null>(null);
  const [quota, setQuota] = useState<Riga | null>(null);
  const [importoQuota, setImportoQuota] = useState("");
  const chiave = ["mezzo-fatture", mezzoId, companyId];
  const { data: righe = [], isLoading, error } = useQuery({
    queryKey: chiave,
    enabled: !!companyId,
    queryFn: async () => {
      const data = await tutteLePagine<Riga>((from, to) => db.from("fattura_ricevuta_mezzi")
        .select("id, fattura_ricevuta_id, importo, confermata, origine, fatture_ricevute(numero_fattura, data_fattura, cedente_ragione_sociale, totale_documento)")
        .eq("mezzo_id", mezzoId).eq("company_id", companyId).order("created_at", { ascending: false }).order("id").range(from, to));
      return ((data ?? []) as Riga[]).sort((a, b) => (b.fatture_ricevute?.data_fattura ?? "").localeCompare(a.fatture_ricevute?.data_fattura ?? ""));
    },
  });
  const aggiorna = (): void => {
    for (const queryKey of [["mezzo-fatture"], ["fattura-collegamenti"], ["fattura-ricevuta-riepilogo"], ["mezzo-costo-orario"], ["mezzi-piano-fonti"]]) void qc.invalidateQueries({ queryKey });
  };
  const salvaQuota = useMutation({
    mutationFn: async () => {
      if (!quota || !companyId || !importoQuota.trim() || !Number.isFinite(Number(importoQuota))) throw new Error(t("Inserisci un importo valido"));
      const { data, error: e } = await db.from("fattura_ricevuta_mezzi").update({ importo: Math.round(Number(importoQuota) * 100) / 100 })
        .eq("id", quota.id).eq("mezzo_id", mezzoId).eq("company_id", companyId).select("id").maybeSingle();
      if (e) throw e;
      if (!data) throw new Error(t("Associazione non disponibile o non modificabile"));
    },
    onSuccess: () => { setQuota(null); aggiorna(); }, onError: errore,
  });
  const conferma = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data: u } = await supabase.auth.getUser();
      const { error: e } = await db.from("fattura_ricevuta_mezzi").update({ confermata: true, confermata_da: u.user?.id ?? null, confermata_at: new Date().toISOString() }).in("id", ids).eq("company_id", companyId).eq("mezzo_id", mezzoId);
      if (e) throw e;
    },
    onSuccess: (_d, ids) => { if (ids.length > 1) toast.success(t("{n} fatture confermate sul mezzo", { n: ids.length })); aggiorna(); }, onError: errore,
  });
  const togli = useMutation({
    mutationFn: async (id: string) => { const { error: e } = await db.from("fattura_ricevuta_mezzi").delete().eq("id", id).eq("company_id", companyId).eq("mezzo_id", mezzoId); if (e) throw e; },
    onSuccess: aggiorna, onError: errore,
  });
  const cerca = useMutation({
    mutationFn: async () => {
      const { data, error: e } = await db.rpc("mezzo_cerca_nelle_fatture", { p_mezzo_id: mezzoId });
      if (e) throw e;
      return Number(data ?? 0);
    },
    onSuccess: (n) => { toast.success(n ? t("Trovate {n} fatture da confermare", { n: String(n ?? "") }) : t("Nessuna fattura nuova con questa targa")); aggiorna(); },
    onError: errore,
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">{t("Carico le fatture…")}</p>;
  if (error) return <p className="text-sm text-destructive">{t("Fatture non disponibili.")}</p>;
  const daConfermare = righe.filter((r) => !r.confermata);
  const sospese = totaleDaConfermare(righe);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-semibold">{formatCurrency(totaleConfermato(righe))}</span> <span className="text-muted-foreground">{t("da fatture confermate, imponibile")}</span>
          {sospese.quante > 0 && <span className="text-amber-700 dark:text-amber-400">{" "}{t("· {importo} da confermare ({quante})", { importo: formatCurrency(sospese.importo), quante: String(sospese.quante ?? "") })}</span>}
        </p>
        {puoModificare && (
          <div className="flex gap-2">
            {daConfermare.length > 0 && <Button size="sm" disabled={conferma.isPending} onClick={() => conferma.mutate(daConfermare.map((r) => r.id))}><Check className="mr-1.5 h-3.5 w-3.5" />{t("Conferma tutte ({n})", { n: daConfermare.length })}</Button>}
            <Button size="sm" variant="outline" disabled={cerca.isPending} onClick={() => cerca.mutate()}><Search className="mr-1.5 h-3.5 w-3.5" />{t("Cerca la targa nelle fatture")}</Button>
          </div>
        )}
      </div>
      {righe.some(r => r.importo == null) && <p role="status" className="text-sm text-amber-700">{t("Totale incompleto: {n} associazioni con importo da attribuire.", { n: righe.filter(r => r.importo == null).length })}</p>}
      {!righe.length && <p className="text-sm text-muted-foreground">{t("Nessuna fattura collegata. Si collegano da sole se la targa è scritta nelle righe, oppure a mano dalla fattura.")}</p>}
      <div className="divide-y rounded-md border">
        {righe.map((r) => {
          const f = r.fatture_ricevute;
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-2 p-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{f?.cedente_ragione_sociale ?? t("Fattura")}</p>
                <p className="text-xs text-muted-foreground">
                  <button type="button" className="inline-flex items-center gap-1 underline-offset-2 hover:underline" onClick={() => setFatturaId(r.fattura_ricevuta_id)} aria-label={t("Apri fattura {numero}", { numero: f?.numero_fattura ?? "" })}><LinkIcon className="h-3 w-3" />{f?.numero_fattura ?? t("Apri fattura")}</button>
                  {f?.data_fattura ? ` · ${formatDateShort(f.data_fattura)}` : ""}
                  {f?.totale_documento != null ? t(" · fattura {totale_documento}", { totale_documento: formatCurrency(f.totale_documento) }) : ""}
                </p>
              </div>
              {!r.confermata && <Badge variant="outline">{t("Da confermare")}</Badge>}
              <span className="font-medium tabular-nums">{r.importo != null ? formatCurrency(r.importo) : "—"}</span>
              {ripartoCarburante && r.confermata && r.importo != null && Number(r.importo) !== 0 && f?.data_fattura &&
                <Button variant="outline" size="sm" onClick={() => setFatturaRiparto(r)}>{t("Riparto carburante")}</Button>}
              {puoModificare && <Button variant="ghost" size="sm" onClick={() => { setQuota(r); setImportoQuota(r.importo == null ? "" : String(r.importo)); }} aria-label={t("Modifica importo fattura {numero}", { numero: f?.numero_fattura ?? "" })}>{t("Importo")}</Button>}
              {puoModificare && !r.confermata && <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t("Conferma")} title={t("Conferma")} onClick={() => conferma.mutate([r.id])}><Check className="h-4 w-4" /></Button>}
              {puoModificare && <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t("Togli")} title={t("Togli")} onClick={() => togli.mutate(r.id)}><X className="h-4 w-4" /></Button>}
            </div>
          );
        })}
      </div>
      {fatturaRiparto?.fatture_ricevute && companyId && <Suspense fallback={<p role="status">{t("Carico il riparto…")}</p>}>
        <RipartoCarburanteDialog key={fatturaRiparto.id} companyId={companyId} mezzoId={mezzoId}
          numero={fatturaRiparto.fatture_ricevute.numero_fattura} dataFattura={fatturaRiparto.fatture_ricevute.data_fattura}
          quota={Number(fatturaRiparto.importo)} onClose={() => setFatturaRiparto(null)}
          onFattura={() => { setFatturaId(fatturaRiparto.fattura_ricevuta_id); setFatturaRiparto(null); }} />
      </Suspense>}
      {fatturaId && <Suspense fallback={<p>{t("Carico il dettaglio della fattura…")}</p>}><RiepilogoFatturaRicevuta companyId={companyId} fatturaId={fatturaId} onClose={() => { setFatturaId(null); aggiorna(); }} /></Suspense>}
      <Dialog open={!!quota} onOpenChange={open => { if (!open && !salvaQuota.isPending) setQuota(null); }}>
        <DialogContent><DialogHeader><DialogTitle>{t("Importo attribuito al mezzo")}</DialogTitle><DialogDescription>{t("Indica solo la quota di questa fattura riferita al mezzo, al netto IVA. Per una nota di credito usa un importo negativo. Il pagamento della fattura resta indipendente.")}</DialogDescription></DialogHeader>
          <Label htmlFor="quota-mezzo">{t("Importo (€)")}</Label><Input id="quota-mezzo" type="number" step="0.01" value={importoQuota} onChange={e => setImportoQuota(e.target.value)} />
          <DialogFooter><Button variant="outline" disabled={salvaQuota.isPending} onClick={() => setQuota(null)}>{t("Annulla")}</Button><Button disabled={salvaQuota.isPending || !importoQuota.trim() || !Number.isFinite(Number(importoQuota))} onClick={() => salvaQuota.mutate()}>{t("Salva importo")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
