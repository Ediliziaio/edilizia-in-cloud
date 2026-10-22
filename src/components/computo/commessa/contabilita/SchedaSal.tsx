/**
 * Stati d'avanzamento lavori e certificati di pagamento (lavori pubblici), più
 * le impostazioni della contabilità: ritenuta di garanzia, anticipazione, IVA,
 * split payment, sicurezza, direttore dei lavori, RUP, contratto.
 */
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileDown, Loader2, Plus, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { quadroEconomicoCompleto } from "@/lib/computo/quadroEconomico";
import { calcolaSal, certificatoPagamento, numeroDigitato, registroContabilita, type ModoSicurezza } from "@/lib/computo/contabilitaLavori";
import { righeSal } from "@/lib/computo/stampeContabilita";
import {
  caricaVociSal, useApprovaSal, useEliminaSal, useEmettiCertificato, useEmettiSal, useLibretto, useSal, useSalvaImpostazioni,
  type ImpostazioniContabilita, type SalDb,
} from "@/hooks/useContabilitaLavori";
import { comeRegistrazioni, dataIt, euro, intestazioneDa, oggi, type PropsScheda } from "./comune";
import FatturaCertificato from "./FatturaCertificato";

function Impostazioni({ impostazioni, orderId, companyId, canEdit, onChiudi }: { impostazioni: ImpostazioniContabilita; orderId: string; companyId: string; canEdit: boolean; onChiudi: () => void }) {
  const salva = useSalvaImpostazioni(orderId, companyId);
  const [b, setB] = useState({
    ...impostazioni,
    ritenuta: String(impostazioni.ritenuta_percentuale).replace(".", ","),
    anticipazione: String(impostazioni.anticipazione_percentuale).replace(".", ","),
    iva: String(impostazioni.aliquota_iva).replace(".", ","),
  });
  const testo = (k: "direttore_lavori" | "rup" | "impresa" | "contratto_estremi", etichetta: string) => (
    <div className="space-y-1"><Label htmlFor={`lp-${k}`}>{etichetta}</Label>
      <Input id={`lp-${k}`} value={b[k] ?? ""} disabled={!canEdit} onChange={e => setB(x => ({ ...x, [k]: e.target.value }))} className="h-8" /></div>
  );
  const conferma = () => {
    const rit = numeroDigitato(b.ritenuta), ant = numeroDigitato(b.anticipazione), iva = numeroDigitato(b.iva);
    if ([rit, ant, iva].some(n => n == null || Number.isNaN(n) || n < 0 || n > 100)) { toast.error("Percentuali da 0 a 100."); return; }
    salva.mutate({
      ritenuta_percentuale: rit!, anticipazione_percentuale: ant!, aliquota_iva: iva!, split_payment: b.split_payment, sicurezza_modo: b.sicurezza_modo,
      direttore_lavori: b.direttore_lavori?.trim() || null, rup: b.rup?.trim() || null, impresa: b.impresa?.trim() || null,
      contratto_estremi: b.contratto_estremi?.trim() || null, contratto_data: b.contratto_data || null, consegna_lavori: b.consegna_lavori || null,
    }, { onSuccess: () => { toast.success("Impostazioni salvate"); onChiudi(); }, onError: e => toast.error(e.message) });
  };
  return (
    <div className="space-y-3 rounded-lg border bg-slate-50/60 p-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1"><Label htmlFor="lp-ritenuta">Ritenuta di garanzia %</Label>
          <Input id="lp-ritenuta" inputMode="decimal" value={b.ritenuta} disabled={!canEdit} onChange={e => setB(x => ({ ...x, ritenuta: e.target.value }))} className="h-8" /></div>
        <div className="space-y-1"><Label htmlFor="lp-anticipazione">Anticipazione % (da recuperare)</Label>
          <Input id="lp-anticipazione" inputMode="decimal" value={b.anticipazione} disabled={!canEdit} onChange={e => setB(x => ({ ...x, anticipazione: e.target.value }))} className="h-8" /></div>
        <div className="space-y-1"><Label htmlFor="lp-iva">Aliquota IVA %</Label>
          <Input id="lp-iva" inputMode="decimal" value={b.iva} disabled={!canEdit} onChange={e => setB(x => ({ ...x, iva: e.target.value }))} className="h-8" /></div>
        <div className="space-y-1"><Label htmlFor="lp-sicurezza">Oneri della sicurezza</Label>
          <select id="lp-sicurezza" value={b.sicurezza_modo} disabled={!canEdit} onChange={e => setB(x => ({ ...x, sicurezza_modo: e.target.value as ModoSicurezza }))}
            className="h-8 w-full rounded-md border bg-background px-2">
            <option value="proporzionale">In proporzione ai lavori eseguiti</option>
            <option value="a_misura">A misura (voci di sicurezza nel libretto)</option>
          </select></div>
        <label className="flex items-center gap-2 pt-5"><Switch checked={b.split_payment} disabled={!canEdit} onCheckedChange={v => setB(x => ({ ...x, split_payment: v }))} />Scissione dei pagamenti (split payment)</label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {testo("impresa", "Impresa")}{testo("direttore_lavori", "Direttore dei lavori")}{testo("rup", "Responsabile unico del progetto")}
        {testo("contratto_estremi", "Contratto (rep. n.)")}
        <div className="space-y-1"><Label htmlFor="lp-contratto-data">Data del contratto</Label>
          <Input id="lp-contratto-data" type="date" value={b.contratto_data ?? ""} disabled={!canEdit} onChange={e => setB(x => ({ ...x, contratto_data: e.target.value }))} className="h-8" /></div>
        <div className="space-y-1"><Label htmlFor="lp-consegna">Consegna dei lavori</Label>
          <Input id="lp-consegna" type="date" value={b.consegna_lavori ?? ""} disabled={!canEdit} onChange={e => setB(x => ({ ...x, consegna_lavori: e.target.value }))} className="h-8" /></div>
      </div>
      <p className="text-xs text-slate-500">Valori proposti: ritenuta 0,50% (svincolata al collaudo), IVA 10%, split payment. Verificali con il contratto e la stazione appaltante: i SAL già emessi conservano i valori con cui sono stati calcolati.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onChiudi}>Chiudi</Button>
        {canEdit && <Button type="button" onClick={conferma} disabled={salva.isPending}>Salva</Button>}
      </div>
    </div>
  );
}

export default function SchedaSal({ computo, voci, contratto, orderId, companyId, canEdit, canViewAmounts, impostazioni, orderLabel }: PropsScheda) {
  const confirm = useConfirm();
  const { data: libretto = [] } = useLibretto(orderId);
  const { data, isLoading } = useSal(orderId);
  const emetti = useEmettiSal(orderId);
  const approva = useApprovaSal(orderId);
  const elimina = useEliminaSal(orderId);
  const certifica = useEmettiCertificato(orderId, companyId);
  const [impAperte, setImpAperte] = useState(false);
  const [nuovo, setNuovo] = useState<{ data: string; aTutto: string; note: string } | null>(null);
  const [stampa, setStampa] = useState<string | null>(null);
  if (!canViewAmounts) return <p className="text-sm text-slate-600">Gli importi della commessa non sono visibili con i tuoi permessi.</p>;

  const sal = data?.sal ?? [];
  const certificati = data?.certificati ?? [];
  const ultimo = sal[sal.length - 1];
  const precedentiImporto = sal.reduce((s, x) => s + x.importo_sal, 0);
  const importoContrattuale = quadroEconomicoCompleto(voci, computo.ribasso_percentuale).quadro.importo_contrattuale;
  const intestazione = intestazioneDa(computo, impostazioni, orderLabel);
  const registrazioni = comeRegistrazioni(libretto);

  // Anteprima del nuovo SAL.
  const opz = { ribasso_percentuale: computo.ribasso_percentuale, sicurezza_modo: impostazioni.sicurezza_modo };
  const reg = nuovo ? registroContabilita(contratto, registrazioni, { ...opz, fino_al: nuovo.aTutto }) : null;
  const regPrima = nuovo && ultimo ? registroContabilita(contratto, registrazioni, { ...opz, fino_al: ultimo.lavori_a_tutto }) : null;
  const calcolo = reg ? calcolaSal(reg, { importo_contrattuale: importoContrattuale, ritenuta_percentuale: impostazioni.ritenuta_percentuale,
    anticipazione_percentuale: impostazioni.anticipazione_percentuale, sal_precedenti: precedentiImporto }) : null;
  const nonFirmate = nuovo ? libretto.filter(r => !r.sal_id && r.data <= nuovo.aTutto && !r.firmato_at).length : 0;

  const emettiSal = () => {
    if (!nuovo || !reg || !calcolo) return;
    if (ultimo && nuovo.aTutto <= ultimo.lavori_a_tutto) { toast.error(`La data deve essere successiva al ${dataIt(ultimo.lavori_a_tutto)} (SAL n. ${ultimo.numero}).`); return; }
    const precedenti = new Map((regPrima?.righe ?? []).map(r => [r.radice, r.quantita]));
    emetti.mutate({ calcolo, dati: { data: nuovo.data, lavori_a_tutto: nuovo.aTutto, sicurezza_modo: impostazioni.sicurezza_modo, note: nuovo.note.trim() || null },
      righe: reg.righe, precedenti }, {
      onSuccess: () => { toast.success("SAL emesso in bozza: controllalo e approvalo"); setNuovo(null); },
      onError: e => toast.error(e.message),
    });
  };

  const stampaSal = async (s: SalDb) => {
    setStampa(s.id);
    try {
      const { stampaSal: pdf } = await import("@/lib/computo/stampeContabilita");
      await pdf(s, await caricaVociSal(s.id), intestazione);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Stampa non riuscita."); } finally { setStampa(null); }
  };
  const emettiCertificato = async (s: SalDb) => {
    const c = certificatoPagamento(s.importo_sal, impostazioni.aliquota_iva, impostazioni.split_payment);
    if (!(await confirm({ title: `Emettere il certificato di pagamento del SAL n. ${s.numero}?`,
      description: `Imponibile ${euro(c.imponibile)}, IVA ${c.aliquota_iva.toLocaleString("it-IT")}% ${euro(c.iva)}${c.split_payment ? " (versata dall'ente: split payment)" : ""}. Una volta emesso non si modifica.`,
      confirmLabel: "Emetti" }))) return;
    certifica.mutate({ sal_id: s.id, data: oggi(), imponibile: c.imponibile, aliquota_iva: c.aliquota_iva, iva: c.iva, totale: c.totale,
      split_payment: c.split_payment, da_pagare_impresa: c.da_pagare_impresa, note: null }, {
      onSuccess: () => toast.success("Certificato emesso"), onError: e => toast.error(e.message),
    });
  };
  const stampaCertificato = async (s: SalDb) => {
    const c = certificati.find(x => x.sal_id === s.id);
    if (!c) return;
    setStampa(c.id);
    try {
      const { stampaCertificato: pdf } = await import("@/lib/computo/stampeContabilita");
      await pdf({ ...c, salNumero: s.numero, lavoriATutto: s.lavori_a_tutto }, s, intestazione);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Stampa non riuscita."); } finally { setStampa(null); }
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-base">Stati d'avanzamento lavori</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setImpAperte(a => !a)}><Settings2 className="mr-1 h-4 w-4" />Impostazioni</Button>
            {canEdit && !nuovo && (!ultimo || ultimo.stato === "approvato") && (
              <Button type="button" size="sm" onClick={() => setNuovo({ data: oggi(), aTutto: oggi(), note: "" })}><Plus className="mr-1 h-4 w-4" />Nuovo SAL</Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-slate-600">
            Ritenuta {impostazioni.ritenuta_percentuale.toLocaleString("it-IT")}% · anticipazione {impostazioni.anticipazione_percentuale.toLocaleString("it-IT")}% · IVA {impostazioni.aliquota_iva.toLocaleString("it-IT")}%{impostazioni.split_payment ? " in split payment" : ""} · sicurezza {impostazioni.sicurezza_modo === "a_misura" ? "a misura" : "in proporzione"} · importo contrattuale {euro(importoContrattuale)}
          </p>
          {impAperte && <Impostazioni key={JSON.stringify(impostazioni)} impostazioni={impostazioni} orderId={orderId} companyId={companyId} canEdit={canEdit} onChiudi={() => setImpAperte(false)} />}

          {nuovo && calcolo && (
            <div className="space-y-3 rounded-lg border bg-slate-50/60 p-3 text-sm">
              <p className="font-medium">SAL n. {(ultimo?.numero ?? 0) + 1}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="space-y-1"><Label htmlFor="sal-a-tutto">Lavori a tutto il</Label>
                  <Input id="sal-a-tutto" type="date" value={nuovo.aTutto} onChange={e => setNuovo(n => n && { ...n, aTutto: e.target.value })} className="h-8" /></div>
                <div className="space-y-1"><Label htmlFor="sal-data">Data del SAL</Label>
                  <Input id="sal-data" type="date" value={nuovo.data} onChange={e => setNuovo(n => n && { ...n, data: e.target.value })} className="h-8" /></div>
                <div className="space-y-1"><Label htmlFor="sal-note">Note</Label>
                  <Input id="sal-note" value={nuovo.note} onChange={e => setNuovo(n => n && { ...n, note: e.target.value })} className="h-8" /></div>
              </div>
              <dl className="divide-y rounded-lg border bg-background">
                {righeSal(calcolo, impostazioni.sicurezza_modo, Number(computo.ribasso_percentuale) || 0).map(([e, v, forte]) => (
                  <div key={e} className={`flex justify-between gap-3 px-3 py-1.5 ${forte ? "bg-slate-50 font-semibold" : ""}`}><dt>{e}</dt><dd className="shrink-0 tabular-nums">{v} €</dd></div>
                ))}
              </dl>
              {nonFirmate > 0 && <p className="text-xs text-amber-800">{nonFirmate} registrazioni del libretto fino a quella data non sono ancora firmate dal direttore dei lavori.</p>}
              <p className="text-xs text-slate-500">Emettendo il SAL le registrazioni del libretto fino alla data entrano nel SAL e non si modificano più (si liberano solo eliminando la bozza).</p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setNuovo(null)}>Annulla</Button>
                <Button type="button" onClick={emettiSal} disabled={emetti.isPending || calcolo.totale_a_oggi <= 0}>{emetti.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Emetti in bozza</Button>
              </div>
            </div>
          )}

          {isLoading ? <div className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Carico i SAL…</div>
            : sal.length === 0 ? <p className="text-sm text-slate-600">Nessun SAL. Il SAL prende le quantità dal libretto delle misure fino alla data scelta.</p> : (
            <ul className="divide-y rounded-lg border text-sm">
              {[...sal].reverse().map(s => {
                const cert = certificati.find(c => c.sal_id === s.id);
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="font-medium">SAL n. {s.numero} · lavori a tutto il {dataIt(s.lavori_a_tutto)}
                        {s.stato === "approvato" ? <Badge variant="outline" className="ml-2 border-emerald-300 text-emerald-800"><CheckCircle2 className="mr-1 h-3 w-3" />Approvato {dataIt(s.approvato_at)}</Badge>
                          : <Badge variant="outline" className="ml-2">Bozza</Badge>}</p>
                      <p className="text-xs text-slate-600 tabular-nums">Lavori a oggi {euro(s.totale_a_oggi)} · ritenuta {euro(s.ritenuta)}{s.recupero_anticipazione ? ` · anticipazione recuperata ${euro(s.recupero_anticipazione)}` : ""} · precedenti {euro(s.sal_precedenti)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold tabular-nums">{euro(s.importo_sal)}</span>
                      <Button type="button" size="sm" variant="outline" className="h-7" disabled={stampa === s.id} onClick={() => stampaSal(s)}><FileDown className="mr-1 h-3.5 w-3.5" />SAL</Button>
                      {canEdit && s.stato === "bozza" && <>
                        <Button type="button" size="sm" className="h-7" disabled={approva.isPending} onClick={async () => {
                          if (await confirm({ title: `Approvare il SAL n. ${s.numero}?`, description: "Il SAL approvato (firmato) non si modifica né si cancella più.", confirmLabel: "Approva" })) {
                            approva.mutate(s.id, { onSuccess: () => toast.success("SAL approvato"), onError: e => toast.error(e.message) });
                          }
                        }}>Approva</Button>
                        {s.id === ultimo?.id && <Button type="button" size="sm" variant="ghost" className="h-7 text-rose-700" onClick={async () => {
                          if (await confirm({ title: `Eliminare la bozza del SAL n. ${s.numero}?`, description: "Le registrazioni del libretto tornano libere.", confirmLabel: "Elimina", variant: "destructive" })) {
                            elimina.mutate(s.id, { onError: e => toast.error(e.message) });
                          }
                        }}>Elimina</Button>}
                      </>}
                      {s.stato === "approvato" && (cert
                        ? <>
                          <Button type="button" size="sm" variant="outline" className="h-7" disabled={stampa === cert.id} onClick={() => stampaCertificato(s)}><FileDown className="mr-1 h-3.5 w-3.5" />Certificato n. {cert.numero}</Button>
                          <FatturaCertificato certificato={cert} sal={s} computo={computo} orderId={orderId} companyId={companyId} canEdit={canEdit} />
                        </>
                        : canEdit && <Button type="button" size="sm" variant="outline" className="h-7" disabled={certifica.isPending} onClick={() => emettiCertificato(s)}>Emetti certificato di pagamento</Button>)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
