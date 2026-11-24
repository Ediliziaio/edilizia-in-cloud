import { lazy, Suspense, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UniformSelect } from "@/components/ui/uniform-select";
import { computoLetto, useComputiCommessa, useVociComputo } from "@/hooks/useComputoCommessa";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { cercaNellOperazione } from "@/lib/orders/generali/registroOperazione";
import { parseDecimalITStrict } from "@/lib/parseDecimalIT";
import { AmbitoOperazione } from "./AmbitoOperazione";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const OrderComputoTab = lazy(() => import("@/components/computo/commessa/OrderComputoTab"));
type Ripartizione = Record<string, { assegnato: number; destinazioni: Record<string, { quantita: number; computo_id: string }> }>;
const formato = new Intl.NumberFormat("it", { maximumFractionDigits: 4 });
const righePerPagina = 25;

export function RipartizioneComputoOperazione({ riepilogo, edifici, chiudi, genera }: {
  riepilogo: RiepilogoGenerale; edifici: ReadonlyMap<string, string>; chiudi: () => void; genera: (id: string, computoId?: string) => void;
}) {
  const t = useT();
  const { generale, figlie } = riepilogo;
  const companyId = useEffectiveCompanyId();
  const permessi = usePermissions();
  const qc = useQueryClient();
  const [computo, setComputo] = useState("");
  const [dest, setDest] = useState(generale.id);
  const [edificio, setEdificio] = useState("");
  const [cerca, setCerca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [modifiche, setModifiche] = useState<Record<string, string>>({});
  const [originale, setOriginale] = useState(false);
  const [confermaCambio, setConfermaCambio] = useState<null | (() => void)>(null);
  const computi = useComputiCommessa(generale.id, companyId);
  const letti = (computi.data ?? []).filter(c => computoLetto(c) && c.stato !== "archiviato"
    && (!c.variante_di || c.stato === "contrattuale") && !c.ripartizione_origine_id);
  const scelto = letti.find(c => c.id === computo) ?? letti[0];
  const voci = useVociComputo(scelto?.id, !!scelto);
  const quote = useQuery({
    queryKey: ["computo-ripartizione", companyId, generale.id, scelto?.id],
    enabled: !!scelto && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("computo_ripartizione_elenco" as never, { p_generale: generale.id, p_computo: scelto!.id } as never);
      if (error) throw error;
      return data as unknown as Ripartizione;
    },
  });
  const destinazioni = edificio ? figlie.filter(f => edifici.get(f.id) === edificio) : figlie;
  const nomiDestinazioni = new Map(figlie.map(f => [f.id, [f.codice, f.nome].filter(Boolean).join(" · ")]));
  nomiDestinazioni.set(generale.id, t("Parti comuni"));
  const nomiEdifici = [...new Set(edifici.values())].sort((a, b) => a.localeCompare(b, "it", { numeric: true }));
  const vociRipartibili = useMemo(() => (voci.data ?? []).filter(v => Number(v.quantita) > 0 && !v.is_detrazione
    && v.is_included !== false && v.quadro_voce !== "somme_a_disposizione"), [voci.data]);
  const righe = vociRipartibili.filter(v => cercaNellOperazione(cerca, [v.codice_voce, v.codice_tariffa, v.codice_prezzario, v.descrizione_breve, v.super_categoria, v.categoria, v.sotto_categoria]));
  const mappaVoci = new Map(vociRipartibili.map(v => [v.id, v]));
  const daSalvare = Object.entries(modifiche).map(([id, q]) => [id, parseDecimalITStrict(q)] as const);
  const erroreQuota = daSalvare.some(([id, q]) => {
    const voce = mappaVoci.get(id);
    const r = quote.data?.[id];
    const max = Math.round((Number(voce?.quantita ?? 0) - Number(r?.assegnato ?? 0) + Number(r?.destinazioni[dest]?.quantita ?? 0)) * 10000) / 10000;
    return !Number.isFinite(q) || q < 0 || q > max || Math.abs(q * 10000 - Math.round(q * 10000)) > 0.00001
      || (!!voce?.a_corpo && q !== 0 && q !== Number(voce.quantita));
  });
  const salva = useMutation({
    mutationFn: async () => {
      if (!scelto || !daSalvare.length || erroreQuota || daSalvare.length > 500) throw new Error("Controlla quantità e destinazione.");
      const { data, error } = await supabase.rpc("computo_ripartizione_salva" as never, {
        p_generale: generale.id, p_computo: scelto.id, p_destinazione: dest, p_quote: Object.fromEntries(daSalvare),
      } as never);
      if (error) throw error;
      if (typeof data !== "string") throw new Error("Salvataggio non confermato. Aggiorna la ripartizione.");
      return data;
    },
    onSuccess: async (id) => {
      setModifiche({});
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["computo-ripartizione", companyId, generale.id, scelto?.id] }),
        qc.invalidateQueries({ queryKey: ["computo-commessa", generale.id] }),
        qc.invalidateQueries({ queryKey: ["computo-commessa", dest] }),
        qc.invalidateQueries({ queryKey: ["computo-commessa-voci", id] }),
      ]);
    },
  });
  const cambiaConferma = (azione: () => void) => {
    if (salva.isPending) return;
    if (daSalvare.length) { setConfermaCambio(() => azione); return; }
    salva.reset();
    azione();
  };
  const pronto = !!scelto && !!quote.data && !!voci.data;
  const erroreSalvataggio = salva.error && "message" in salva.error ? salva.error.message : null;
  const computoDestinazione = Object.values(quote.data ?? {}).find(r => r.destinazioni[dest])?.destinazioni[dest]?.computo_id;
  return <Dialog open onOpenChange={open => { if (!open) cambiaConferma(chiudi); }}>
    <DialogContent className="max-h-[92dvh] max-w-5xl gap-3 overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{t("Ripartisci il computo")}</DialogTitle>
        <DialogDescription>{t("Assegna le quantità della generale alle parti comuni o alle unità. Ogni quota conserva il riferimento alla voce originale.")}</DialogDescription>
      </DialogHeader>
      {computi.isPending ? <p role="status" className="text-sm">{t("Carico i computi…")}</p>
        : computi.isError || quote.isError || voci.isError ? <p role="status" className="text-sm">{t("Ripartizione non disponibile.")}{" "}
          <Button size="sm" variant="link" onClick={() => void (computi.isError ? computi.refetch() : quote.isError ? quote.refetch() : voci.refetch())}>{t("Riprova")}</Button></p>
        : !scelto ? <p className="rounded-md border p-3 text-sm text-muted-foreground">{t("Carica e completa la lettura di un computo nella commessa generale.")}</p>
        : <>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-medium">{t("Computo originale")}
              <UniformSelect className="h-8 max-w-[min(22rem,76vw)]" value={scelto.id} disabled={salva.isPending}
                onChange={e => { const id = e.target.value; cambiaConferma(() => { setComputo(id); setPagina(1); }); }}>
                {letti.map(c => <option key={c.id} value={c.id}>{c.titolo || c.file_name}</option>)}
              </UniformSelect>
            </label>
            {nomiEdifici.length > 0 && <UniformSelect className="h-8" aria-label={t("Filtra destinazioni per edificio")} value={edificio} disabled={salva.isPending}
              onChange={e => {
                const nuovo = e.target.value;
                if (nuovo && dest !== generale.id && edifici.get(dest) !== nuovo) {
                  cambiaConferma(() => { setEdificio(nuovo); setDest(generale.id); });
                } else setEdificio(nuovo);
              }}>
              <option value="">{t("Tutti gli edifici")}</option>
              {nomiEdifici.map(nome => <option key={nome} value={nome}>{nome}</option>)}
            </UniformSelect>}
            <AmbitoOperazione fissi={[{ id: generale.id, nome: t("Parti comuni · generale"), codice: generale.codice }]}
              figlie={destinazioni} etichetta={t("Destinazione della quota")} valore={dest} onChange={id => cambiaConferma(() => setDest(id))} />
            <Button size="sm" variant="outline" className="h-8" onClick={() => setOriginale(true)}>{t("Apri originale")}</Button>
          </div>
          {!pronto ? <p role="status" className="text-sm">{t("Carico quantità e quote…")}</p> : <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Input type="search" value={cerca} onChange={e => { setCerca(e.target.value); setPagina(1); }}
                aria-label={t("Cerca voce del computo")} placeholder={t("Cerca voce, codice o capitolo…")} className="h-8 max-w-72 text-sm" />
              <span className="text-xs text-muted-foreground">{t(righe.length === 1 ? "{n} voce ripartibile" : "{n} voci ripartibili", { n: righe.length })}</span>
            </div>
            {righe.length ? <div className="overflow-x-auto rounded-md border">
              <table aria-label={t("Quote del computo")} className="w-full min-w-[36rem] text-left text-xs">
                <thead className="bg-muted/50 text-muted-foreground"><tr>
                  <th scope="col" className="px-2 py-2">{t("Voce originale")}</th>
                  <th scope="col" className="px-2 py-2 text-right">{t("Totale")}</th>
                  <th scope="col" className="px-2 py-2 text-right">{t("Assegnato")}</th>
                  <th scope="col" className="px-2 py-2 text-right">{t("Residuo")}</th>
                  <th scope="col" className="px-2 py-2">{t("Quota nella destinazione")}</th>
                </tr></thead>
                <tbody className="divide-y">{righe.slice((pagina - 1) * righePerPagina, pagina * righePerPagina).map(v => {
                  const r = quote.data?.[v.id];
                  const assegnato = Number(r?.assegnato ?? 0);
                  const attuale = Number(r?.destinazioni[dest]?.quantita ?? 0);
                  const residuo = Math.max(0, Number(v.quantita) - assegnato);
                  const ripartite = Object.entries(r?.destinazioni ?? {});
                  return <tr key={v.id}>
                    <th scope="row" className="px-2 py-1.5 font-medium">
                      {(v.codice_voce || v.codice_tariffa) && <span className="mr-1 font-mono text-muted-foreground">{v.codice_voce || v.codice_tariffa}</span>}
                      {v.descrizione_breve}
                      <span className="ml-1 text-muted-foreground">{[v.super_categoria, v.categoria, v.sotto_categoria].filter(Boolean).join(" / ")}</span>
                    </th>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{formato.format(Number(v.quantita))} {v.unita_misura}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {ripartite.length ? <Popover>
                        <PopoverTrigger asChild>
                          <Button size="sm" variant="link" className="h-auto px-0 text-xs tabular-nums"
                            aria-label={t("Vedi destinazioni di {voce}", { voce: String(v.descrizione_breve ?? "") })}>{formato.format(assegnato)}</Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-64 max-w-[80vw] p-2">
                          <ul className="max-h-48 divide-y overflow-auto text-xs">{ripartite.map(([id, quota]) => <li key={id} className="flex justify-between gap-2 py-1.5">
                            <span>{nomiDestinazioni.get(id) ?? t("Commessa")}</span>
                            <span className="shrink-0 tabular-nums">{formato.format(quota.quantita)} {v.unita_misura}</span>
                          </li>)}</ul>
                        </PopoverContent>
                      </Popover> : formato.format(assegnato)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-medium tabular-nums">{formato.format(residuo)}</td>
                    <td className="px-2 py-1.5">
                      <Input inputMode="decimal" disabled={salva.isPending} className="h-7 w-24 text-xs md:text-xs"
                        aria-label={t("Quota di {voce}", { voce: String(v.descrizione_breve ?? "") })}
                        value={modifiche[v.id] ?? (attuale ? String(attuale).replace(".", ",") : "")} placeholder="0"
                        onChange={e => { const valore = e.target.value; setModifiche(s => ({ ...s, [v.id]: valore || "0" })); }} />
                    </td>
                  </tr>;
                })}</tbody>
              </table>
            </div> : <p className="rounded-md border p-3 text-sm text-muted-foreground">{t("Nessuna voce ripartibile per la ricerca attuale.")}</p>}
            {righe.length > righePerPagina && <nav aria-label={t("Pagine delle quote")} className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t("Pagina {pagina} di {pagine}", { pagina, pagine: Math.ceil(righe.length / righePerPagina) })}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={pagina === 1} onClick={() => setPagina(p => p - 1)}>{t("Indietro")}</Button>
                <Button variant="outline" size="sm" disabled={pagina * righePerPagina >= righe.length} onClick={() => setPagina(p => p + 1)}>{t("Avanti")}</Button>
              </div>
            </nav>}
          </>}
        </>}
      {erroreQuota && <p role="alert" className="text-sm text-destructive">{t("Controlla i residui e usa al massimo quattro decimali. Assegna le voci a corpo per intero.")}</p>}
      {erroreSalvataggio && <p role="alert" className="text-sm text-destructive">{erroreSalvataggio}</p>}
      {salva.isSuccess && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{t("Quote salvate.")}</p>}
      <DialogFooter>
        <Button variant="outline" disabled={salva.isPending} onClick={() => cambiaConferma(chiudi)}>{t("Chiudi")}</Button>
        {computoDestinazione && <Button variant="outline" disabled={salva.isPending || !!daSalvare.length} onClick={() => {
          chiudi();
          genera(dest, computoDestinazione);
        }}>{t("Genera dalla quota")}</Button>}
        <Button disabled={!pronto || salva.isPending || erroreQuota || !daSalvare.length || daSalvare.length > 500}
          onClick={() => salva.mutate()}>{salva.isPending ? t("Salvo…") : daSalvare.length ? t("Salva quote ({n})", { n: daSalvare.length }) : t("Salva quote")}</Button>
      </DialogFooter>
    </DialogContent>
    {originale && scelto && companyId && <Dialog open onOpenChange={setOriginale}>
      <DialogContent className="max-h-[92dvh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Computo originale")}</DialogTitle>
          <DialogDescription>{scelto.titolo || scelto.file_name}</DialogDescription>
        </DialogHeader>
        <Suspense fallback={<p className="text-sm">{t("Carico il computo…")}</p>}>
          <OrderComputoTab orderId={generale.id} companyId={companyId} orderLabel={generale.codice}
            canEdit={false} canViewAmounts={permessi.canViewOrderAmounts} computoInizialeId={scelto.id} soloEsistenti />
        </Suspense>
      </DialogContent>
    </Dialog>}
    {confermaCambio && <Dialog open onOpenChange={open => { if (!open) setConfermaCambio(null); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("Quote da salvare")}</DialogTitle>
          <DialogDescription>{t("Vuoi lasciare questa vista e scartare le modifiche non salvate?")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfermaCambio(null)}>{t("Torna alle quote")}</Button>
          <Button onClick={() => { setModifiche({}); setConfermaCambio(null); salva.reset(); confermaCambio(); }}>{t("Scarta modifiche")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>}
  </Dialog>;
}
