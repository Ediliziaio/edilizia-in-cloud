import { UniformSelect } from "@/components/ui/uniform-select";
/**
 * I materiali che il computo propone, da confermare (17/11/2026). «Genera dal computo» crea le
 * lavorazioni e PROPONE i materiali (materiali_proponi): qui si spuntano quelli da comprare e
 * «Inserisci negli articoli» li mette nelle loro fasi (materiali_proposti_conferma). Quelli
 * scartati non tornano quando si rigenera. Nella pagina una riga sola col bottone; la scelta si fa
 * in un popup diviso per fasi (come il Fabbisogno), che si apre anche da solo dopo «Genera dal computo».
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSearch, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { chiaviMateriali } from "@/hooks/useMaterialiPerFase";
import { nomeBreve } from "@/lib/acquisti/fabbisogno";
import { quantitaLeggibile } from "@/lib/distinta/statoMateriale";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import type { OrigineRiga } from "@/lib/distinta/generaDistinta";
import { verificaDaOrigini } from "@/lib/distinta/verificaAcquisto";
import { messaggioErrore } from "@/lib/messaggioErrore";

export type ChiFa = "interna" | "subappalto_fornitura_posa" | "subappalto_posa";
const CHI_FA: ChiFa[] = ["interna", "subappalto_fornitura_posa", "subappalto_posa"];
const ETICHETTA_CHI: Record<ChiFa, string> = { interna: "Noi", subappalto_fornitura_posa: "Ditta chiavi in mano", subappalto_posa: "Ditta solo posa" };
const SPIEGA_CHI: Record<ChiFa, string> = {
  interna: "i nostri operai; i materiali li compriamo noi",
  subappalto_fornitura_posa: "fornitura e posa della ditta: niente acquisti",
  subappalto_posa: "la manodopera è della ditta, i materiali li compriamo noi",
};
const numeroItaliano = (v: string): number | null => {
  const t = v.trim().replace(/[€\s]/g, "").replace(/\./g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export interface MaterialeProposto {
  id: string;
  chiave: string;
  phase_id: string | null;
  descrizione: string;
  specifiche: string | null;
  quantita: number;
  unita_misura: string | null;
  supplier_id: string | null;
  fornitore: string | null;
  consigliata: boolean;
  origine: string;
  origini?: OrigineRiga[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (f: string, a: Record<string, unknown>) => (supabase as any).rpc(f, a) as Promise<{ data: unknown; error: { message: string } | null }>;

export const chiaveProposti = (orderId: string) => ["materiali-proposti", orderId] as const;

export function useMaterialiProposti(orderId: string, abilitato: boolean) {
  return useQuery({
    queryKey: chiaveProposti(orderId),
    enabled: abilitato && !!orderId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await rpc("materiali_proposti_elenco", { p_order: orderId });
      if (error) throw error;
      return ((data ?? []) as MaterialeProposto[]).map((m) => ({ ...m, quantita: Number(m.quantita ?? 0) }));
    },
  });
}

export function MaterialiDaConfermare({ orderId, fasi, faseIniziale, aperto, onAperto }: {
  orderId: string;
  fasi: { id: string | null; nome: string }[];
  faseIniziale?: string | null;
  aperto: boolean;
  onAperto: (a: boolean) => void;
}) {
  const t = useT();
  const proposti = useMaterialiProposti(orderId, true);
  const qc = useQueryClient();
  // Le spunte scelte a mano; senza, vale «consigliata» (le proposte dell'AI da controllare partono spente).
  const [spunte, setSpunte] = useState<Record<string, boolean>>({});
  const [faseScelta, setFaseScelta] = useState(faseIniziale === null ? "_senza" : faseIniziale ?? null);
  // Chi fa ogni fase (17/11/2026): con la ditta chiavi in mano la fase non ha materiali da comprare, ha il
  // costo previsto della ditta. Parte da quello che la fase ha già salvato, altrimenti «noi».
  const [chiScelto, setChiScelto] = useState<Record<string, ChiFa>>({});
  const [ditte, setDitte] = useState<Record<string, { subappaltatore: string; costo: string }>>({});
  const esecuzioni = useQuery({
    queryKey: ["fasi-esecuzione", orderId],
    enabled: aperto,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("order_work_phases").select("id, esecuzione").eq("order_id", orderId);
      if (error) throw error;
      return new Map(((data ?? []) as { id: string; esecuzione: string | null }[]).map((f) => [f.id, f.esecuzione]));
    },
  });
  const subappaltatori = useQuery({
    queryKey: ["subappaltatori-attivi", orderId],
    enabled: aperto,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data: o } = await db.from("orders").select("company_id").eq("id", orderId).maybeSingle();
      const { data, error } = await db.from("subappaltatori").select("id, ragione_sociale").eq("company_id", o?.company_id).eq("is_active", true).order("ragione_sociale");
      if (error) throw error;
      return (data ?? []) as { id: string; ragione_sociale: string }[];
    },
  });
  const chiDi = (k: string): ChiFa => chiScelto[k] ?? (CHI_FA.includes(esecuzioni.data?.get(k) as ChiFa) ? esecuzioni.data!.get(k) as ChiFa : "interna");
  const chiaviInMano = (k: string) => k !== "_senza" && chiDi(k) === "subappalto_fornitura_posa";
  const righe = useMemo(() => proposti.data ?? [], [proposti.data]);
  const spuntato = (m: MaterialeProposto) => spunte[m.id] ?? m.consigliata;
  const faseDi = (m: MaterialeProposto) => (m.phase_id && fasi.some((f) => f.id === m.phase_id) ? m.phase_id : "_senza");

  const perFase = useMemo(() => {
    const ordine = new Map(fasi.map((f, i) => [f.id ?? "_senza", i]));
    const m = new Map<string, MaterialeProposto[]>();
    for (const r of righe) {
      const k = r.phase_id && ordine.has(r.phase_id) ? r.phase_id : "_senza";
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()]
      .map(([k, rr]) => [k, [...rr].sort((a, b) => nomeBreve(a.descrizione).titolo.localeCompare(nomeBreve(b.descrizione).titolo, "it"))] as const)
      .sort(([a], [b]) => (ordine.get(a) ?? 999) - (ordine.get(b) ?? 999));
  }, [righe, fasi]);
  const nomeFase = (k: string) => (k === "_senza" ? t("Senza fase") : fasi.find((f) => f.id === k)?.nome ?? t("Fase"));
  const attiva = perFase.find(([k]) => k === faseScelta) ?? perFase[0];
  // Le fasi chiavi in mano non comprano niente: i loro materiali non si inseriscono.
  const scelti = righe.filter((m) => spuntato(m) && !chiaviInMano(faseDi(m)));
  const altri = righe.filter((m) => !spuntato(m) && !chiaviInMano(faseDi(m)));
  const fasiDitta = perFase.filter(([k]) => chiaviInMano(k));

  const aggiorna = () => {
    void qc.invalidateQueries({ queryKey: chiaveProposti(orderId) });
    void qc.invalidateQueries({ queryKey: chiaviMateriali.commessa(orderId) });
    void qc.invalidateQueries({ queryKey: ["fabbisogno-materiali"] });
    void qc.invalidateQueries({ queryKey: ["order-items"] });
    void qc.invalidateQueries({ queryKey: ["generale-materiali-operazione"] });
    setSpunte({});
  };
  const conferma = useMutation({
    mutationFn: async (ids: string[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      // 1. Chi fa ogni fase, dove è cambiato.
      for (const [k] of perFase) {
        if (k === "_senza" || !chiScelto[k] || chiScelto[k] === esecuzioni.data?.get(k)) continue;
        const { data: fatte, error } = await db.from("order_work_phases").update({ esecuzione: chiScelto[k] }).eq("id", k).select("id");
        if (error) throw error;
        if (!fatte?.length) throw new Error(t("non hai il permesso di modificare le fasi della commessa"));
      }
      // 2. Le fasi chiavi in mano: la ditta col suo costo previsto (la stessa funzione di «Assegna ditta»),
      //    e i materiali proposti scartati col motivo, così rigenerando non tornano.
      let ditteAssegnate = 0;
      for (const [k, rr] of fasiDitta) {
        const d = ditte[k];
        if (d?.subappaltatore) {
          const costo = numeroItaliano(d.costo) ?? 0;
          const { error } = await db.rpc("commessa_assegna_subappaltatore", {
            p_order_id: orderId, p_subappaltatore_id: d.subappaltatore, p_phase_id: k, p_cost_preventivo: costo, p_cost_consuntivo: 0,
            p_notes: "Fase chiavi in mano: fornitura e posa della ditta",
          });
          // Già assegnata a questa fase: va bene così, il costo si corregge da «Ditte e contratti».
          if (error && !/già assegnata/i.test(error.message)) throw error;
          ditteAssegnate += 1;
        }
        const { error } = await rpc("materiali_proposti_scarta", { p_order: orderId, p_ids: rr.map((m) => m.id), p_motivo: "Fase chiavi in mano: i materiali li fornisce la ditta" });
        if (error) throw error;
      }
      // 3. I materiali delle fasi nostre o in solo posa.
      let inserite = 0;
      if (ids.length) {
        const { data, error } = await rpc("materiali_proposti_conferma", { p_order: orderId, p_ids: ids });
        if (error) throw error;
        inserite = (data as { inserite: number }).inserite;
      }
      return { inserite, fasiDitta: fasiDitta.length, ditteAssegnate };
    },
    onSuccess: (d) => {
      toast.success(t(d.inserite === 1 ? "{n} materiale inserito negli articoli" : "{n} materiali inseriti negli articoli", { n: d.inserite }), {
        description: [d.fasiDitta ? t(d.fasiDitta === 1 ? "{n} fase va alla ditta chiavi in mano, senza acquisti" : "{n} fasi vanno alla ditta chiavi in mano, senza acquisti", { n: d.fasiDitta }) : null,
          d.ditteAssegnate ? t(d.ditteAssegnate === 1 ? "{n} ditta assegnata col costo previsto" : "{n} ditte assegnate col costo previsto", { n: d.ditteAssegnate }) : null].filter(Boolean).join(" · ")
          || t("Li trovi nelle loro fasi. Il piano acquisti mantiene in verifica le quantità e le specifiche incomplete."),
      });
      aggiorna();
      void qc.invalidateQueries({ queryKey: ["fasi-esecuzione", orderId] });
      void qc.invalidateQueries({ queryKey: ["order-work-phases"] });
      void qc.invalidateQueries({ queryKey: ["assignment-companies"] });
      setChiScelto({});
      onAperto(false);
    },
    onError: (e) => toast.error(t("Materiali non inseriti"), { description: messaggioErrore(e) }),
  });
  const scarta = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await rpc("materiali_proposti_scarta", { p_order: orderId, p_ids: ids });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: (n) => {
      toast.success(t(n === 1 ? "{n} proposta scartata" : "{n} proposte scartate", { n }), { description: t("Rigenerando dal computo non tornano.") });
      aggiorna();
    },
    onError: (e) => toast.error(t("Proposte non scartate"), { description: messaggioErrore(e) }),
  });

  if (!righe.length) return null;
  const occupato = conferma.isPending || scarta.isPending;
  const tutti = scelti.length === righe.length;
  const cambiaGruppo = (rr: readonly MaterialeProposto[], si: boolean) => setSpunte((s) => ({ ...s, ...Object.fromEntries(rr.map((m) => [m.id, si])) }));

  return (
    <>
      {/* Nella pagina: una riga sola. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950/40">
        <FileSearch className="h-4 w-4 text-amber-800 dark:text-amber-200" aria-hidden />
        <span className="font-semibold text-amber-900 dark:text-amber-100">{t(righe.length === 1 ? "Dal computo: {n} proposta da inserire" : "Dal computo: {n} proposte da inserire", { n: righe.length })}</span>
        <span className="text-xs text-amber-800 dark:text-amber-200">{t(perFase.length === 1 ? "in {n} fase" : "in {n} fasi", { n: perFase.length })}</span>
        <Button size="sm" className="ml-auto h-8 text-xs" onClick={() => onAperto(true)}>{t("Scegli e inserisci")}</Button>
      </div>

      <Dialog open={aperto} onOpenChange={onAperto}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileSearch className="h-5 w-5" aria-hidden /> {t("Materiali dal computo")}</DialogTitle>
            <DialogDescription>
              {t("Spunta, fase per fase, quelli da comprare: con «Inserisci» entrano negli articoli, nelle loro fasi.")}
            </DialogDescription>
          </DialogHeader>

          {righe.some((m) => !m.consigliata) && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              {t("Le proposte AI contengono quantità e rese stimate; anche le altre righe da completare partono senza spunta. Inserirle negli articoli conserva i dati da verificare: restano escluse dagli acquisti finché quantità, rese e specifiche non sono verificate.")}
            </p>
          )}

          <div className="grid gap-3 rounded-lg border sm:grid-cols-[14rem_minmax(0,1fr)]">
            <nav aria-label={t("Fasi")} className="flex gap-1 overflow-x-auto border-b p-2 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r">
              {perFase.map(([k, rr]) => {
                const sel = k === attiva?.[0];
                const n = rr.filter(spuntato).length;
                return (
                  <button key={k} type="button" onClick={() => setFaseScelta(k)} aria-current={sel ? "true" : undefined}
                    className={cn("w-48 shrink-0 rounded-md px-2.5 py-2 text-left text-sm transition-colors sm:w-full", sel ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted")}>
                    <span className={cn("block font-medium", sel && "text-primary")}>{nomeFase(k)}</span>
                    {chiaviInMano(k) ? (
                      <span className="block text-[11px] text-primary">{t("Ditta chiavi in mano · niente da comprare")}</span>
                    ) : (
                      <span className={cn("block text-[11px]", n === rr.length ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300")}>
                        {t("{n} su {totale} da inserire", { n, totale: rr.length })}{chiDi(k) === "subappalto_posa" ? ` · ${t("ditta solo posa")}` : ""}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {attiva && (
              <section aria-label={t("Materiali proposti: {fase}", { fase: nomeFase(attiva[0]) })} className="min-w-0 space-y-2 p-3 sm:pl-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold">{nomeFase(attiva[0])}</h3>
                  <span className="text-xs text-muted-foreground">{t("{n} materiali", { n: attiva[1].length })}</span>
                  {!chiaviInMano(attiva[0]) && (
                    <Button size="sm" variant="outline" className="ml-auto h-7 text-xs"
                      onClick={() => cambiaGruppo(attiva[1], !attiva[1].every(spuntato))}>
                      {attiva[1].every(spuntato) ? t("Togli la fase") : t("Seleziona la fase")}
                    </Button>
                  )}
                </div>
                {attiva[0] !== "_senza" && (
                  <div role="radiogroup" aria-label={t("Chi fa la fase {fase}", { fase: nomeFase(attiva[0]) })} className="flex flex-wrap items-center gap-1.5 rounded-md bg-muted/40 px-2 py-1.5 text-xs">
                    <span className="mr-1 font-medium">{t("Chi la fa")}</span>
                    {CHI_FA.map((c) => (
                      <button key={c} type="button" role="radio" aria-checked={chiDi(attiva[0]) === c}
                        onClick={() => setChiScelto((p) => ({ ...p, [attiva[0]]: c }))}
                        className={cn("rounded-md border px-2.5 py-1 transition-colors", chiDi(attiva[0]) === c ? "border-primary/40 bg-primary/10 font-medium text-primary" : "bg-background hover:bg-muted")}>
                        {t(ETICHETTA_CHI[c])}
                      </button>
                    ))}
                    <span className="text-muted-foreground">{t(SPIEGA_CHI[chiDi(attiva[0])])}</span>
                  </div>
                )}
                {chiaviInMano(attiva[0]) ? (
                  <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                    <p>{t("Niente da comprare: i {n} materiali li porta la ditta. Al loro posto, il costo previsto della ditta; la sua fattura e i pagamenti si legano a questa fase.", { n: attiva[1].length })}</p>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
                      <label className="space-y-1 text-xs"><span className="text-muted-foreground">{t("Ditta")}</span>
                        <UniformSelect className="h-9 w-full rounded-md border bg-background px-2 text-sm" aria-label={t("Ditta della fase {fase}", { fase: nomeFase(attiva[0]) })}
                          value={ditte[attiva[0]]?.subappaltatore ?? ""}
                          onChange={(e) => setDitte((p) => ({ ...p, [attiva[0]]: { costo: p[attiva[0]]?.costo ?? "", subappaltatore: e.target.value } }))}>
                          <option value="">{t("Scegli dopo, da «Ditte e contratti»")}</option>
                          {(subappaltatori.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.ragione_sociale}</option>)}
                        </UniformSelect>
                      </label>
                      <label className="space-y-1 text-xs"><span className="text-muted-foreground">{t("Costo previsto €")}</span>
                        <Input inputMode="decimal" placeholder={t("come da suo preventivo")} aria-label={t("Costo previsto della ditta per {fase}", { fase: nomeFase(attiva[0]) })}
                          value={ditte[attiva[0]]?.costo ?? ""} disabled={!ditte[attiva[0]]?.subappaltatore}
                          onChange={(e) => setDitte((p) => ({ ...p, [attiva[0]]: { subappaltatore: p[attiva[0]]?.subappaltatore ?? "", costo: e.target.value } }))} />
                      </label>
                    </div>
                  </div>
                ) : (
                <ul className="divide-y rounded-md border">
                  {attiva[1].map((m) => {
                    const { titolo, accorciato } = nomeBreve(m.descrizione);
                    const q = quantitaLeggibile(m.quantita, m.unita_misura);
                    return (
                      <li key={m.id}>
                        <label className={cn("grid cursor-pointer grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40", !spuntato(m) && "text-muted-foreground")}>
                          <Checkbox checked={spuntato(m)} onCheckedChange={(v) => setSpunte((s) => ({ ...s, [m.id]: v === true }))} aria-label={t("Seleziona {nome}", { nome: titolo })} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium" title={accorciato ? m.descrizione : undefined}>{titolo}</span>
                            {m.specifiche && (
                              <span className="block text-[11px] text-muted-foreground">{m.specifiche}</span>
                            )}
                            {(m.fornitore || !m.consigliata) && (
                              <span className="block truncate text-[11px] text-muted-foreground">
                                {[!m.consigliata ? t("proposta da controllare") : null, m.fornitore].filter(Boolean).join(" · ")}
                              </span>
                            )}
                            {verificaDaOrigini(m.origini)?.stato === "da_verificare" && <span className="block text-[11px] text-amber-800">{verificaDaOrigini(m.origini)!.motivi.join(" ")}</span>}
                          </span>
                          <span className="whitespace-nowrap text-right text-xs tabular-nums">{q.numero} {q.unita}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                )}
              </section>
            )}
          </div>

          {/* La barra delle azioni resta in fondo alla finestra mentre si scorre. */}
          <div className="sticky -bottom-6 -mx-6 -mb-6 flex flex-wrap items-center gap-2 border-t bg-background px-6 py-2.5">
            <span className="text-sm text-muted-foreground">{t("{n} su {totale} selezionati", { n: scelti.length, totale: righe.length })}</span>
            <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={occupato}
              onClick={() => setSpunte(Object.fromEntries(righe.map((m) => [m.id, !tutti])))}>
              {tutti ? t("Togli tutti") : t("Seleziona tutti")}
            </Button>
            {altri.length > 0 && (
              <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" disabled={occupato}
                onClick={() => scarta.mutate(altri.map((m) => m.id))} title={t("Non si comprano: rigenerando dal computo non tornano")}>
                {altri.length === 1 ? t("Scarta quello non spuntato") : t("Scarta i {n} non spuntati", { n: altri.length })}
              </Button>
            )}
            <Button size="sm" className="ml-auto h-8" disabled={occupato || (scelti.length === 0 && fasiDitta.length === 0)} onClick={() => conferma.mutate(scelti.map((m) => m.id))}>
              {conferma.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />}
              {[scelti.length || !fasiDitta.length ? t("Inserisci {n} negli articoli", { n: scelti.length }) : t("Conferma"),
                fasiDitta.length ? t(fasiDitta.length === 1 ? "{n} fase alla ditta" : "{n} fasi alla ditta", { n: fasiDitta.length }) : null].filter(Boolean).join(" · ")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
