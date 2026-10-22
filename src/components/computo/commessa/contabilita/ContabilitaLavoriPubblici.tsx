/**
 * Contabilità dei lavori pubblici della commessa, sul computo contrattuale:
 * Elenco prezzi · Libretto · Registro · SAL · Varianti (D.Lgs. 36/2023, all. II.14).
 * Vede chi vede la commessa, scrive chi la modifica (lo garantisce anche la RLS).
 */
import { useState } from "react";
import { toast } from "sonner";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { VoceComputo } from "@/lib/computo/alberoComputo";
import { elencoPrezzi, registroContabilita, vociContratto } from "@/lib/computo/contabilitaLavori";
import type { ComputoCommessa } from "@/hooks/useComputoCommessa";
import { useImpostazioniContabilita, useLibretto } from "@/hooks/useContabilitaLavori";
import { comeRegistrazioni, euro, intestazioneDa, quant, type PropsScheda, type SchedaContabilita } from "./comune";
import SchedaLibretto from "./SchedaLibretto";
import SchedaSal from "./SchedaSal";
import SchedaVarianti from "./SchedaVarianti";

function ElencoPrezzi({ computo, contratto, impostazioni, orderLabel, canViewAmounts }: PropsScheda) {
  const [filtro, setFiltro] = useState("");
  const [stampa, setStampa] = useState(false);
  const righe = elencoPrezzi(contratto, computo.ribasso_percentuale);
  const f = filtro.trim().toLowerCase();
  const visibili = f ? righe.filter(r => `${r.numero} ${r.tariffa} ${r.descrizione}`.toLowerCase().includes(f)) : righe;
  if (!canViewAmounts) return <p className="text-sm text-slate-600">Gli importi della commessa non sono visibili con i tuoi permessi.</p>;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-base">Elenco prezzi contrattuale <span className="text-sm font-normal text-slate-500">· {righe.length} prezzi · ribasso {(computo.ribasso_percentuale ?? 0).toLocaleString("it-IT", { maximumFractionDigits: 4 })}%</span></CardTitle>
        <Button type="button" size="sm" variant="outline" disabled={stampa} onClick={async () => {
          setStampa(true);
          try { const { stampaElencoPrezzi } = await import("@/lib/computo/stampeContabilita"); await stampaElencoPrezzi(righe, intestazioneDa(computo, impostazioni, orderLabel)); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Stampa non riuscita."); } finally { setStampa(false); }
        }}>{stampa ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileDown className="mr-1 h-4 w-4" />}PDF</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        <Input type="search" value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Cerca per numero, tariffa o descrizione" aria-label="Cerca nell'elenco prezzi" className="sm:w-96" />
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-600">
              <tr><th className="px-2 py-1.5">N.</th><th className="px-2 py-1.5">Tariffa</th><th className="px-2 py-1.5">Descrizione</th><th className="px-2 py-1.5">U.M.</th>
                <th className="px-2 py-1.5 text-right">Prezzo</th><th className="px-2 py-1.5 text-right">Ribassato</th></tr>
            </thead>
            <tbody className="divide-y">
              {visibili.map(r => (
                <tr key={`${r.numero}-${r.tariffa}-${r.prezzo}`}>
                  <td className="px-2 py-1 font-semibold tabular-nums">{r.numero}</td>
                  <td className="whitespace-nowrap px-2 py-1 font-mono text-xs">{r.tariffa}</td>
                  <td className="min-w-[16rem] px-2 py-1"><span className="line-clamp-2" title={r.descrizione}>{r.descrizione}</span>
                    {r.nuovo_prezzo && <Badge variant="outline" className="mr-1">NP</Badge>}{r.is_sicurezza && <Badge variant="outline" className="border-emerald-300 text-emerald-800">Sicurezza · non ribassato</Badge>}</td>
                  <td className="px-2 py-1">{r.unita_misura}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{euro(r.prezzo)}</td>
                  <td className="px-2 py-1 text-right font-medium tabular-nums">{euro(r.prezzo_ribassato)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Registro({ computo, contratto, impostazioni, orderLabel, orderId, canViewAmounts }: PropsScheda) {
  const { data: libretto = [] } = useLibretto(orderId);
  const [finoAl, setFinoAl] = useState("");
  const [stampa, setStampa] = useState(false);
  const reg = registroContabilita(contratto, comeRegistrazioni(libretto), {
    ribasso_percentuale: computo.ribasso_percentuale, sicurezza_modo: impostazioni.sicurezza_modo, fino_al: finoAl || null,
  });
  if (!canViewAmounts) return <p className="text-sm text-slate-600">Gli importi della commessa non sono visibili con i tuoi permessi.</p>;
  const eseguite = reg.righe.filter(r => r.quantita !== 0);
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-base">Registro di contabilità</CardTitle>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1"><Label htmlFor="registro-fino" className="text-xs">Lavori a tutto il</Label>
            <Input id="registro-fino" type="date" value={finoAl} onChange={e => setFinoAl(e.target.value)} className="h-8 w-40" /></div>
          <Button type="button" size="sm" variant="outline" disabled={stampa} onClick={async () => {
            setStampa(true);
            try { const { stampaRegistro } = await import("@/lib/computo/stampeContabilita"); await stampaRegistro(reg, finoAl || null, intestazioneDa(computo, impostazioni, orderLabel)); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Stampa non riuscita."); } finally { setStampa(false); }
          }}>{stampa ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileDown className="mr-1 h-4 w-4" />}PDF</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {eseguite.length === 0 ? <p className="text-sm text-slate-600">Nessuna quantità registrata nel libretto{finoAl ? " fino a quella data" : ""}.</p> : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-600">
                <tr><th className="px-2 py-1.5">N.</th><th className="px-2 py-1.5">Descrizione</th><th className="px-2 py-1.5 text-right">Contratto</th>
                  <th className="px-2 py-1.5 text-right">Registrata</th><th className="px-2 py-1.5 text-right">%</th><th className="px-2 py-1.5 text-right">Prezzo</th><th className="px-2 py-1.5 text-right">Importo</th></tr>
              </thead>
              <tbody className="divide-y">
                {eseguite.map(r => (
                  <tr key={r.radice} className={r.quantita > r.quantita_contratto ? "bg-amber-50" : undefined}>
                    <td className="px-2 py-1 font-semibold tabular-nums">{r.numero}</td>
                    <td className="min-w-[14rem] px-2 py-1"><span className="line-clamp-1" title={r.descrizione}>{r.descrizione}</span>
                      {r.is_sicurezza && <Badge variant="outline" className="border-emerald-300 text-emerald-800">Sicurezza</Badge>}</td>
                    <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">{quant(r.quantita_contratto)} {r.unita_misura}</td>
                    <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">{quant(r.quantita)} {r.unita_misura}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{r.percentuale_eseguita.toLocaleString("it-IT")}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{euro(r.prezzo)}</td>
                    <td className="px-2 py-1 text-right font-medium tabular-nums">{euro(r.importo_lordo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <dl className="divide-y rounded-lg border text-sm">
          {([
            ["Lavori ai prezzi di contratto (sicurezza esclusa)", euro(reg.lavori_lordo)],
            [`Ribasso d'asta ${reg.ribasso_percentuale.toLocaleString("it-IT", { maximumFractionDigits: 4 })}%`, `− ${euro(reg.ribasso)}`],
            ["Lavori al netto del ribasso", euro(reg.lavori_netti)],
            [`Oneri della sicurezza ${reg.sicurezza_modo === "a_misura" ? "a misura" : "in proporzione ai lavori"}`, euro(reg.sicurezza)],
          ] as const).map(([e, v]) => <div key={e} className="flex justify-between gap-3 px-3 py-1.5"><dt>{e}</dt><dd className="tabular-nums">{v}</dd></div>)}
          <div className="flex justify-between gap-3 bg-slate-50 px-3 py-1.5 font-semibold"><dt>Importo dei lavori eseguiti</dt><dd className="tabular-nums">{euro(reg.totale)}</dd></div>
        </dl>
      </CardContent>
    </Card>
  );
}

export default function ContabilitaLavoriPubblici({ scheda, computo, computi, voci, orderId, companyId, canEdit, canViewAmounts, orderLabel }: {
  scheda: SchedaContabilita; computo: ComputoCommessa; computi: ComputoCommessa[]; voci: VoceComputo[];
  orderId: string; companyId: string; canEdit: boolean; canViewAmounts: boolean; orderLabel?: string | null;
}) {
  const { data: impostazioni, isLoading } = useImpostazioniContabilita(orderId);
  if (computo.stato !== "contrattuale") {
    return <p className="rounded-lg border bg-slate-50 p-4 text-sm text-slate-700">La contabilità dei lavori parte dal computo <strong>contrattuale</strong>: verificalo e rendilo contrattuale nella scheda «Computo». Le somme a disposizione dell'amministrazione restano fuori.</p>;
  }
  if (isLoading || !impostazioni) return <div className="flex items-center gap-2 p-4 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Carico la contabilità…</div>;
  const props: PropsScheda = { computo, voci, contratto: vociContratto(voci), orderId, companyId, canEdit, canViewAmounts, orderLabel, impostazioni };
  switch (scheda) {
    case "elenco": return <ElencoPrezzi {...props} />;
    case "libretto": return <SchedaLibretto {...props} />;
    case "registro": return <Registro {...props} />;
    case "sal": return <SchedaSal {...props} />;
    case "varianti": return <SchedaVarianti {...props} computi={computi} />;
  }
}
