/**
 * «Affida le voci alle ditte» (10/11/2026, lotto 4 di docs/piano-subappalto-computo-listino.md).
 *
 * Dal computo della commessa si sceglie chi fa cosa: fasi intere, sottofasi o singole voci, anche
 * divise per quantità (300 mq a Rossi, 120 a Bianchi: la voce resta una). Il prezzo lo propone il
 * listino della ditta (poi il costo aziendale, poi a mano); venduto e margine si vedono qui, solo a
 * chi ha il permesso sui costi, mai nel contratto. Si scrive solo con le funzioni del database
 * (affida_voci, affidamento_modifica, affidamento_togli), che controllano quantità e permessi.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/formatters";
import { parseAssignmentAmount } from "@/lib/orders/assignmentAmounts";
import {
  chiaveAffidamenti, perDitta, riepilogoChiFaCosa, statoVoce, type AffidamentoChiFaCosa, type VoceChiFaCosa,
} from "@/lib/subappaltatori/affidamentiCommessa";
import { OfficeSelect } from "./OfficeSelect";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const ORIGINE: Record<AffidamentoChiFaCosa["origine_prezzo"], string> = {
  listino_ditta: "listino della ditta", costo_aziendale: "costo nostro, non della ditta", manuale: "a mano",
};
const qt = (n: number) => n.toLocaleString(intlCampo(), { maximumFractionDigits: 3 });

/** Gli affidamenti di una commessa: la stessa cache per la finestra e per i contratti delle ditte. */
export function useAffidamentiCommessa(orderId: string) {
  return useQuery({
    queryKey: chiaveAffidamenti(orderId),
    queryFn: async (): Promise<AffidamentoChiFaCosa[]> => {
      const { data, error } = await db.from("subappalto_affidamenti")
        .select("id, voce_id, subappaltatore_id, quantita, prezzo_unitario, origine_prezzo, comprende, stato, contratto_id")
        .eq("order_id", orderId).limit(5000);
      if (error) throw error;
      return ((data ?? []) as AffidamentoChiFaCosa[]).map((a) => ({ ...a, quantita: Number(a.quantita), prezzo_unitario: a.prezzo_unitario == null ? null : Number(a.prezzo_unitario) }));
    },
  });
}

export function AffidaVociDialog({ orderId, companyId, voci, fasi, onChiudi, onCambio, dittaFissa, onAffidate }: {
  orderId: string; companyId: string;
  voci: VoceChiFaCosa[]; fasi: Array<{ id: string; name: string; position?: number | null }>;
  onChiudi: () => void; onCambio: () => void;
  dittaFissa?: { id: string; nome: string };
  onAffidate?: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const affidamenti = useAffidamentiCommessa(orderId);
  const ditte = useQuery({
    queryKey: ["subappaltatori-per-affidare", companyId],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Array<{ id: string; ragione_sociale: string; is_active: boolean | null }>> => {
      const { data, error } = await db.from("subappaltatori").select("id, ragione_sociale, is_active").eq("company_id", companyId).order("ragione_sociale").limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const lista = useMemo(() => affidamenti.data ?? [], [affidamenti.data]);
  const nome = (id: string) => ditte.data?.find((d) => d.id === id)?.ragione_sociale ?? t("Ditta");
  const riepilogo = useMemo(() => riepilogoChiFaCosa(voci, lista), [voci, lista]);
  const ditteRiep = useMemo(() => perDitta(voci, lista), [voci, lista]);

  const [cerca, setCerca] = useState("");
  const [soloSenza, setSoloSenza] = useState(false);
  const [scelte, setScelte] = useState<Set<string>>(new Set());
  const [ditta, setDitta] = useState(dittaFissa?.id ?? "");
  const [comprende, setComprende] = useState<"posa" | "fornitura_e_posa">("posa");
  const [quantita, setQuantita] = useState("");
  const [inModifica, setInModifica] = useState<{ id: string; quantita: string; prezzo: string; comprende: AffidamentoChiFaCosa["comprende"] } | null>(null);

  const gruppi = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return [...fasi].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((f) => ({
      fase: f,
      voci: voci.filter((v) => v.phase_id === f.id)
        .filter((v) => !q || v.descrizione.toLowerCase().includes(q) || f.name.toLowerCase().includes(q))
        .filter((v) => !soloSenza || !statoVoce(v, lista).piena),
    })).filter((g) => g.voci.length > 0);
  }, [fasi, voci, cerca, soloSenza, lista]);

  const cambiaScelta = (ids: string[], si: boolean) => setScelte((s) => {
    const n = new Set(s);
    for (const id of ids) { if (si) n.add(id); else n.delete(id); }
    return n;
  });
  const sceltePiene = [...scelte].filter((id) => { const v = voci.find((x) => x.id === id); return v && statoVoce(v, lista).piena; });
  const quantitaUnica = scelte.size === 1 && quantita.trim() ? parseAssignmentAmount(quantita, 3) : null;

  const aggiorna = () => { void qc.invalidateQueries({ queryKey: chiaveAffidamenti(orderId) }); onCambio(); };

  const affida = useMutation({
    mutationFn: async () => {
      if (!ditta) throw new Error(t("Scegli la ditta."));
      if (scelte.size === 1 && quantita.trim() && (quantitaUnica == null || quantitaUnica <= 0)) throw new Error(t("La quantità non si legge."));
      const righe = [...scelte].map((voce_id) => (scelte.size === 1 && quantitaUnica ? { voce_id, quantita: quantitaUnica } : { voce_id }));
      const { data, error } = await db.rpc("affida_voci", { p_order: orderId, p_subappaltatore: ditta, p_voci: righe, p_comprende: comprende });
      if (error) throw error;
      return data as { affidate: number; gia_piene: number };
    },
    onSuccess: (r) => {
      toast.success(`${t(r.affidate === 1 ? "{n} voce affidata a {ditta}" : "{n} voci affidate a {ditta}", { n: r.affidate, ditta: nome(ditta) })}${r.gia_piene ? ` · ${t(r.gia_piene === 1 ? "{n} aveva già tutta la quantità affidata" : "{n} avevano già tutta la quantità affidata", { n: r.gia_piene })}` : ""}.`);
      setScelte(new Set()); setQuantita(""); aggiorna();
      if (r.affidate > 0) onAffidate?.();
    },
    onError: (e: Error) => toast.error(e.message || t("Affidamento non riuscito.")),
  });

  const modifica = useMutation({
    mutationFn: async () => {
      if (!inModifica) return;
      const q = parseAssignmentAmount(inModifica.quantita, 3);
      if (q == null || q <= 0) throw new Error(t("La quantità non si legge."));
      const vuoto = !inModifica.prezzo.trim();
      const p = vuoto ? null : parseAssignmentAmount(inModifica.prezzo, 4);
      if (!vuoto && p == null) throw new Error(t("Il prezzo non si legge."));
      // Il contratto è al centesimo: 12,345 qui e 12,35 nel contratto davano due totali diversi.
      if (p != null && Math.abs(Math.round(p * 100) - p * 100) > 1e-6) throw new Error(t("Il prezzo va al centesimo (es. 12,35, non 12,345)."));
      const { error } = await db.rpc("affidamento_modifica", {
        p_id: inModifica.id, p_quantita: q, p_prezzo: p, p_comprende: inModifica.comprende, p_togli_prezzo: vuoto,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("Quota aggiornata.")); setInModifica(null); aggiorna(); },
    onError: (e: Error) => toast.error(e.message || t("Quota non aggiornata.")),
  });

  const togli = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await db.rpc("affidamento_togli", { p_ids: ids });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("Quota tolta: la voce torna senza ditta.")); setInModifica(null); aggiorna(); },
    onError: (e: Error) => toast.error(e.message || t("Quota non tolta.")),
  });

  const occupato = affida.isPending || modifica.isPending || togli.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && !occupato && onChiudi()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{dittaFissa ? t("Nuove voci per {ditta}", { ditta: dittaFissa.nome }) : t("Affida le voci alle ditte")}</DialogTitle>
          <DialogDescription>
            {t("Scegli le voci (o una fase intera), poi la ditta. Il prezzo lo propone il listino della ditta; una voce si può dividere fra più ditte per quantità, mai oltre il totale.")}
          </DialogDescription>
        </DialogHeader>

        {affidamenti.isLoading || ditte.isLoading ? (
          <p className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" />{t("Caricamento…")}</p>
        ) : affidamenti.isError || ditte.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {t("Non riesco a leggere affidamenti o ditte.")}{" "}
            <button type="button" className="underline" onClick={() => { void affidamenti.refetch(); void ditte.refetch(); }}>{t("Riprova")}</button>
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <Riquadro titolo={t("Venduto")} valore={formatCurrency(riepilogo.venduto)} />
              <Riquadro titolo={t("Alle ditte ({n})", { n: riepilogo.ditte })} valore={formatCurrency(riepilogo.costoDitte)}
                nota={riepilogo.quoteSenzaPrezzo ? t("{n} senza prezzo", { n: riepilogo.quoteSenzaPrezzo }) : riepilogo.materialiNostri ? t("+ materiali nostri {importo}", { importo: formatCurrency(riepilogo.materialiNostri) }) : undefined} />
              <Riquadro titolo={t("Margine sull'affidato")} valore={formatCurrency(riepilogo.margine)}
                nota={riepilogo.quoteSenzaPrezzo ? t(riepilogo.quoteSenzaPrezzo === 1 ? "provvisorio: {n} quota senza prezzo" : "provvisorio: {n} quote senza prezzo", { n: riepilogo.quoteSenzaPrezzo }) : riepilogo.marginePct != null ? `${riepilogo.marginePct.toLocaleString(intlCampo())}%` : undefined} rosso={riepilogo.margine < 0} />
              <Riquadro titolo={t("Senza ditta")} valore={formatCurrency(riepilogo.vendutoSenzaDitta)} nota={t(riepilogo.vociSenzaDitta === 1 ? "{n} voce su {totale}" : "{n} voci su {totale}", { n: riepilogo.vociSenzaDitta, totale: riepilogo.voci })} />
            </div>

            {ditteRiep.size > 0 && (
              <ul className="flex flex-wrap gap-1.5 text-xs" aria-label={t("Ditte con voci affidate")}>
                {[...ditteRiep.entries()].map(([id, r]) => (
                  <li key={id} className="rounded-md border px-2 py-1">
                    <span className="font-medium">{nome(id)}</span> · {t(r.voci === 1 ? "{n} voce" : "{n} voci", { n: r.voci })} · {formatCurrency(r.costo)}
                    {r.venduto > 0 && <span className="text-muted-foreground"> {t("su {importo}", { importo: formatCurrency(r.venduto) })}</span>}
                    {r.aContratto > 0 && <span className="text-muted-foreground"> · {t("{n} a contratto", { n: r.aContratto })}</span>}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[12rem] flex-1">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder={t("Cerca voce o fase")} className="h-9 pl-8" aria-label={t("Cerca voce o fase")} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={soloSenza} onCheckedChange={setSoloSenza} aria-label={t("Solo le voci senza ditta")} />{t("Solo senza ditta")}
              </label>
            </div>

            <div className="divide-y rounded-md border">
              {gruppi.map(({ fase, voci: vf }) => {
                const libere = vf.filter((v) => !statoVoce(v, lista).piena).map((v) => v.id);
                const tutte = libere.length > 0 && libere.every((id) => scelte.has(id));
                return (
                  <section key={fase.id} aria-label={fase.name}>
                    <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5">
                      <Checkbox checked={tutte} disabled={!libere.length} aria-label={t("Scegli tutte le voci libere di {fase}", { fase: fase.name })}
                        onCheckedChange={(c) => cambiaScelta(libere, c === true)} />
                      <span className="text-sm font-medium">{fase.name}</span>
                      <span className="text-xs text-muted-foreground">{t(vf.length === 1 ? "{n} voce" : "{n} voci", { n: vf.length })}{libere.length < vf.length ? ` · ${t(vf.length - libere.length === 1 ? "{n} già affidata" : "{n} già affidate", { n: vf.length - libere.length })}` : ""}</span>
                    </div>
                    <ul className="divide-y">
                      {vf.map((v) => {
                        const s = statoVoce(v, lista);
                        return (
                          <li key={v.id} className="px-3 py-1.5">
                            {/* Una voce, una riga (11/11/2026): nome, quantità e venduto, chi la fa. */}
                            <div className="flex items-start gap-2">
                              <Checkbox className="mt-[3px]" checked={scelte.has(v.id)} disabled={s.piena} aria-label={t("Scegli {voce}", { voce: v.descrizione })}
                                onCheckedChange={(c) => cambiaScelta([v.id], c === true)} />
                              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                                <p className="min-w-[10rem] flex-1 truncate text-sm" title={v.descrizione}>{v.descrizione}</p>
                                <p className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                  {qt(Number(v.quantita))} {v.unita ?? ""} · {t("venduto {importo}", { importo: formatCurrency(Number(v.importo) || 0) })}
                                  {!s.piena && s.affidata > 0 && <> · <span className="text-amber-800">{t("restano {quantita}", { quantita: `${qt(s.residua)} ${v.unita ?? ""}` })}</span></>}
                                  {s.margine != null && <> · {t("margine")} <span className={s.margine < 0 ? "text-destructive" : ""}>{formatCurrency(s.margine)}</span></>}
                                </p>
                                {s.oltre > 0.0005 && <p className="w-full text-[11px] font-medium text-red-700">{t("Affidati {quantita} più della voce: da rivedere (togli una quota, o variante del contratto)", { quantita: `${qt(s.oltre)} ${v.unita ?? ""}` })}</p>}
                                <div className="flex shrink-0 flex-wrap gap-1">
                                  {s.quote.length === 0 && <Badge variant="outline" className="h-5 px-1.5 text-[11px] font-normal">{t("Senza ditta")}</Badge>}
                                  {s.quote.map((a) => (
                                    <button key={a.id} type="button" disabled={a.stato === "a_contratto" || occupato}
                                      className="rounded-md border bg-background px-1.5 py-0.5 text-left text-[11px] hover:bg-muted disabled:opacity-80"
                                      title={a.stato === "a_contratto" ? t("In un contratto: si cambia con una variante") : t("Prezzo: {origine}", { origine: t(ORIGINE[a.origine_prezzo]) })}
                                      aria-label={t("Quota di {ditta} su {voce}", { ditta: nome(a.subappaltatore_id), voce: v.descrizione })}
                                      onClick={() => setInModifica({ id: a.id, quantita: String(a.quantita).replace(".", ","), prezzo: a.prezzo_unitario == null ? "" : String(a.prezzo_unitario).replace(".", ","), comprende: a.comprende })}>
                                      <span className="font-medium">{nome(a.subappaltatore_id)}</span> · {qt(a.quantita)} {v.unita ?? ""} × {a.prezzo_unitario == null ? <span className="text-destructive">{t("prezzo da scrivere")}</span> : formatCurrency(a.prezzo_unitario)}
                                      {a.comprende === "posa" ? ` · ${t("solo posa")}` : ""}{a.stato === "a_contratto" ? ` · ${t("a contratto")}` : ""}
                                    </button>
                                  ))}
                                </div>
                                {inModifica && s.quote.some((a) => a.id === inModifica.id) && (
                                  <div className="flex w-full flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-2">
                                    <label className="text-xs">{t("Quantità")}
                                      <Input value={inModifica.quantita} onChange={(e) => setInModifica({ ...inModifica, quantita: e.target.value })} inputMode="decimal" className="h-8 w-24 text-right" />
                                    </label>
                                    <label className="text-xs">{t("Prezzo")}
                                      <Input value={inModifica.prezzo} onChange={(e) => setInModifica({ ...inModifica, prezzo: e.target.value })} inputMode="decimal" placeholder="—" className="h-8 w-24 text-right" />
                                    </label>
                                    <OfficeSelect label={t("Cosa comprende il prezzo")} className="h-8 w-40" value={inModifica.comprende}
                                      onValueChange={(c) => setInModifica({ ...inModifica, comprende: c as AffidamentoChiFaCosa["comprende"] })}
                                      options={[{ value: "posa", label: t("Solo posa") }, { value: "fornitura_e_posa", label: t("Fornitura e posa") }]} />
                                    <Button size="sm" disabled={occupato} onClick={() => modifica.mutate()}>{modifica.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{t("Salva")}</Button>
                                    <Button size="sm" variant="ghost" disabled={occupato} onClick={() => togli.mutate([inModifica.id])}><X className="mr-1 h-3.5 w-3.5" />{t("Togli")}</Button>
                                    <Button size="sm" variant="ghost" disabled={occupato} onClick={() => setInModifica(null)}>{t("Annulla")}</Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
              {gruppi.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">{voci.length ? t("Nessuna voce con questi filtri.") : t("La commessa non ha voci: si affidano le voci del computo o del preventivo.")}</p>}
            </div>

            {scelte.size > 0 && (
              <div className="sticky bottom-0 flex flex-wrap items-end gap-2 rounded-md border bg-background p-2 shadow-sm">
                <span className="text-sm">{t(scelte.size === 1 ? "{n} voce scelta" : "{n} voci scelte", { n: scelte.size })}{sceltePiene.length ? ` (${t("{n} già piene", { n: sceltePiene.length })})` : ""}</span>
                {dittaFissa ? <p className="flex-1 text-sm font-medium">{dittaFissa.nome}</p> : <OfficeSelect label={t("Ditta")} className="h-9 min-w-[14rem] flex-1" value={ditta} onValueChange={setDitta} placeholder={t("Scegli la ditta")}
                  options={(ditte.data ?? []).filter((d) => d.is_active !== false).map((d) => ({ value: d.id, label: d.ragione_sociale }))} />}
                <OfficeSelect label={t("Cosa comprende il prezzo")} className="h-9 w-44" value={comprende} onValueChange={(c) => setComprende(c as typeof comprende)}
                  options={[{ value: "posa", label: t("Solo posa") }, { value: "fornitura_e_posa", label: t("Fornitura e posa") }]} />
                {scelte.size === 1 && (
                  <Input value={quantita} onChange={(e) => setQuantita(e.target.value)} inputMode="decimal" placeholder={t("Quantità: tutto il resto")}
                    aria-label={t("Quantità da affidare (vuoto = tutto il resto)")} className="h-9 w-44" />
                )}
                <Button size="sm" variant="ghost" disabled={occupato} onClick={() => setScelte(new Set())}>{t("Annulla")}</Button>
                <Button size="sm" disabled={!ditta || occupato} onClick={() => affida.mutate()}>
                  {affida.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{t("Affida")}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Riquadro({ titolo, valore, nota, rosso }: { titolo: string; valore: string; nota?: string; rosso?: boolean }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{titolo}</p>
      <p className={`text-sm font-semibold tabular-nums ${rosso ? "text-destructive" : ""}`}>{valore}</p>
      {nota && <p className="text-[11px] text-muted-foreground">{nota}</p>}
    </div>
  );
}
