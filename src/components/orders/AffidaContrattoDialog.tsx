/**
 * «Affida e manda il contratto» (11/11/2026): voci, ditta, quantità e prezzi in una tabella, e un pulsante.
 *
 * - I prezzi li propone il database (listino della ditta, poi costo aziendale) prima di salvare: quello che
 *   si vede è quello che va nel contratto. Si cambiano scrivendo nella riga.
 * - Le voci non collegate al listino le cerca l'AI da sola mentre si sceglie: una proposta sicura si usa
 *   (e si ricorda per le commesse dopo), una da verificare chiede un «Sì» nella riga.
 * - «Crea il contratto»: collega le voci, le affida, crea il contratto in bozza (o aggiunge al suo in bozza).
 *   «Crea e manda in firma» porta al contratto con l'invio già aperto: chi firma e l'email si confermano lì.
 * Le funzioni di sempre (Chi fa cosa, Lavori e prezzi, Collega al listino) restano per i casi particolari.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Search, Send, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/formatters";
import { parseAssignmentAmount } from "@/lib/orders/assignmentAmounts";
import { contrattoDellaDitta, periodoFasi, schedeSicurezzaDitta, type AffidamentoPerContratto, type SchedaSicurezza, type VoceLavoro } from "@/lib/orders/ditteLavori";
import { chiaveAffidamenti, statoVoce } from "@/lib/subappaltatori/affidamentiCommessa";
import { chiaveDescrizione } from "@/lib/subappaltatori/abbinamentoListino";
import { contoTabella, destinoContratto, elencoUnito, righeContratto, type RigaTabella } from "@/lib/subappaltatori/affidaEContratto";
import { useAffidamentiCommessa } from "./AffidaVociDialog";
import { OfficeSelect } from "./OfficeSelect";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type VoceAffidabile = VoceLavoro & { importo: number | null; costo_materiali: number };
interface ContrattoCommessa { id: string; subappaltatore_id: string; stato: string; firmato_il: string | null; elenco_lavori: unknown }

const ORIGINE: Record<string, string> = { listino_ditta: "listino ditta", costo_aziendale: "costo nostro", manuale: "da scrivere" };
const qt = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 3 });
const casella = (n: number | null | undefined, decimali = 2) => (n == null ? "" : String(Math.round(n * 10 ** decimali) / 10 ** decimali).replace(".", ","));
const oggi = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());

type ProposteAi = Record<string, { tariffaId: string; certezza: "alta" | "media"; perche: string; confermata?: boolean }>;

export function AffidaContrattoDialog({ orderId, companyId, fasi, voci, contratti, schede, onChiudi, onFatto }: {
  orderId: string; companyId: string;
  fasi: Array<{ id: string; name: string; position?: number | null; start_date?: string | null; end_date?: string | null }>;
  voci: VoceAffidabile[]; contratti: ContrattoCommessa[]; schede: SchedaSicurezza[];
  onChiudi: () => void; onFatto: () => void;
}) {
  const qc = useQueryClient();
  const vai = useNavigate();
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

  const [ditta, setDitta] = useState("");
  const [comprende, setComprende] = useState<"posa" | "fornitura_e_posa">("posa");
  const [cerca, setCerca] = useState("");
  const [scelte, setScelte] = useState<Set<string>>(new Set());
  const [quantita, setQuantita] = useState<Record<string, string>>({});
  const [prezzi, setPrezzi] = useState<Record<string, string>>({});
  const [ai, setAi] = useState<ProposteAi>({});
  const chieste = useRef<Set<string>>(new Set());
  const [aiInCorso, setAiInCorso] = useState(0);

  const lista = useMemo(() => affidamenti.data ?? [], [affidamenti.data]);
  const residua = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of voci) m.set(v.id, statoVoce({ ...v, importo: v.importo, costo_materiali: v.costo_materiali }, lista).residua);
    return m;
  }, [voci, lista]);
  const libere = useMemo(() => voci.filter((v) => (residua.get(v.id) ?? 0) > 0.0005), [voci, residua]);
  const gruppi = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return [...fasi].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((f) => ({
      fase: f,
      voci: libere.filter((v) => v.phase_id === f.id && (!q || v.descrizione.toLowerCase().includes(q) || f.name.toLowerCase().includes(q))),
    })).filter((g) => g.voci.length > 0);
  }, [fasi, libere, cerca]);

  const tariffaUsata = (id: string) => {
    const a = ai[id];
    return a && (a.certezza === "alta" || a.confermata) ? a.tariffaId : null;
  };
  const sceltiOrdinati = useMemo(() => voci.filter((v) => scelte.has(v.id)), [voci, scelte]);
  const chiavePrezzi = sceltiOrdinati.map((v) => `${v.id}:${tariffaUsata(v.id) ?? ""}`).join(",");
  const proposti = useQuery({
    queryKey: ["affidamento-prezzi-proposti", orderId, ditta, chiavePrezzi],
    enabled: !!ditta && sceltiOrdinati.length > 0,
    queryFn: async (): Promise<Map<string, { prezzo: number | null; origine: string }>> => {
      const { data, error } = await db.rpc("affidamento_prezzi_proposti", {
        p_order: orderId, p_subappaltatore: ditta,
        p_voci: sceltiOrdinati.map((v) => ({ voce_id: v.id, ...(tariffaUsata(v.id) ? { tariffa_id: tariffaUsata(v.id) } : {}) })),
      });
      if (error) throw error;
      return new Map(((data ?? []) as Array<{ voce_id: string; prezzo: number | null; origine: string }>).map((r) => [r.voce_id, { prezzo: r.prezzo == null ? null : Number(r.prezzo), origine: r.origine }]));
    },
  });

  // L'AI cerca nel listino le voci scelte che non ci sono collegate: da sola, a gruppi di 40, una volta per voce.
  useEffect(() => {
    const da = sceltiOrdinati.filter((v) => !v.tariffa_id && !chieste.current.has(v.id)).map((v) => v.id);
    if (!da.length) return;
    const t = setTimeout(() => {
      for (const id of da) chieste.current.add(id);
      for (let i = 0; i < da.length; i += 40) {
        const pezzo = da.slice(i, i + 40);
        setAiInCorso((n) => n + pezzo.length);
        void supabase.functions.invoke("listino-abbina-ai", { body: { order_id: orderId, voce_ids: pezzo } })
          .then(({ data, error }) => {
            if (error) { for (const id of pezzo) chieste.current.delete(id); return; }
            const elenco = (data?.proposte ?? []) as Array<{ voce_id: string; tariffa_id: string; certezza: "alta" | "media"; perche: string }>;
            setAi((a) => ({ ...a, ...Object.fromEntries(elenco.map((x) => [x.voce_id, { tariffaId: x.tariffa_id, certezza: x.certezza, perche: x.perche }])) }));
          })
          .finally(() => setAiInCorso((n) => n - pezzo.length));
      }
    }, 700);
    return () => clearTimeout(t);
  }, [sceltiOrdinati, orderId]);

  const quantitaDi = (v: VoceAffidabile) => (quantita[v.id] != null ? parseAssignmentAmount(quantita[v.id], 3) : residua.get(v.id) ?? 0);
  const prezzoDi = (id: string) => (prezzi[id] != null ? (prezzi[id].trim() ? parseAssignmentAmount(prezzi[id], 4) : null) : proposti.data?.get(id)?.prezzo ?? null);
  const righe: RigaTabella[] = sceltiOrdinati.map((v) => ({ voceId: v.id, quantita: quantitaDi(v), prezzo: prezzoDi(v.id) }));
  const conto = contoTabella(righe, voci, (id) => residua.get(id) ?? 0, comprende);
  const erroreDi = (id: string) => conto.errori.find((e) => e.voceId === id)?.motivo;
  // Un prezzo ancora da scrivere non è un errore: lo diventa solo se resta vuoto. In rosso le cose sbagliate.
  const daScrivere = conto.errori.filter((e) => e.motivo === "Prezzo mancante").length;

  const cambiaScelta = (ids: string[], si: boolean) => setScelte((s) => {
    const n = new Set(s);
    for (const id of ids) { if (si) n.add(id); else n.delete(id); }
    return n;
  });

  const contrattoAttuale = ditta ? contrattoDellaDitta(ditta, contratti, schede) : null;

  const crea = useMutation({
    mutationFn: async (inFirma: boolean) => {
      if (!ditta) throw new Error("Scegli la ditta.");
      if (!righe.length) throw new Error("Scegli almeno una voce.");
      if (conto.errori.length) throw new Error(`${conto.errori.length === 1 ? "Una riga" : `${conto.errori.length} righe`} da sistemare: ${conto.errori[0].motivo.toLowerCase()}.`);
      // Prima si guarda il contratto della ditta: se è firmato o in firma ci si ferma prima di toccare qualcosa.
      let inFirmaOra = false;
      if (contrattoAttuale && !contrattoAttuale.firmato_il) {
        const { data } = await db.rpc("contratto_in_firma", { p_contratto: contrattoAttuale.id });
        inFirmaOra = data === true;
      }
      const destino = destinoContratto(contrattoAttuale, inFirmaOra);
      if (destino.tipo === "blocca") throw new Error(destino.messaggio);

      // 1. Le voci che l'AI ha collegato al listino: si collegano e si ricordano.
      const collegamenti = sceltiOrdinati.filter((v) => !v.tariffa_id && tariffaUsata(v.id))
        .map((v) => ({ voce_id: v.id, tariffa_id: tariffaUsata(v.id), chiave: chiaveDescrizione(v.descrizione) }));
      if (collegamenti.length) {
        const { error } = await db.rpc("voci_abbina_listino", { p_order: orderId, p_abbinamenti: collegamenti, p_ricorda: true });
        if (error) throw error;
      }
      // 2. Le quote, con la quantità della tabella.
      const { error: errAff } = await db.rpc("affida_voci", {
        p_order: orderId, p_subappaltatore: ditta, p_comprende: comprende,
        p_voci: righe.map((r) => ({ voce_id: r.voceId, quantita: r.quantita })),
      });
      if (errAff) throw errAff;
      const { data: quote, error: errQ } = await db.from("subappalto_affidamenti")
        .select("id, voce_id, subappaltatore_id, quantita, prezzo_unitario, origine_prezzo, comprende, stato, contratto_id")
        .eq("order_id", orderId).eq("subappaltatore_id", ditta).eq("stato", "bozza");
      if (errQ) throw errQ;
      const elenco = righeContratto(fasi, voci, ((quote ?? []) as AffidamentoPerContratto[]).map((a) => ({ ...a, quantita: Number(a.quantita) })), ditta, righe);
      if (!elenco.length) throw new Error("Le voci affidate non si ritrovano: ricarica la pagina e riprova.");

      // 3. Il contratto: nuovo, o le righe in coda a quello in bozza. I prezzi della tabella vanno sulle quote dal database.
      if (destino.tipo === "aggiungi") {
        const unito = elencoUnito(contrattoAttuale!.elenco_lavori, elenco);
        const { data: toccati, error } = await db.from("contratti_subappalto")
          .update({ elenco_lavori: unito.elenco, importo_contrattuale: unito.importo })
          .eq("id", destino.id).eq("stato", "bozza").is("firmato_il", null).select("id");
        if (error) throw error;
        if (!toccati?.length) throw new Error("Il contratto è cambiato nel frattempo: ricarica la pagina e riprova.");
        return { contrattoId: destino.id, schedaId: contrattoAttuale!.subappaltatore_id, inFirma, nuovo: false };
      }
      const proprie = schedeSicurezzaDitta(ditta, schede, orderId);
      let schedaId = proprie[0]?.id ?? null;
      let schedaCreata: string | null = null;
      if (!schedaId) {
        const { data: campo, error } = await db.from("subappaltatori").select("ragione_sociale, piva, indirizzo, email, telefono, responsabile").eq("id", ditta).maybeSingle();
        if (error) throw error;
        const { data: nuova, error: errS } = await db.from("subappaltatori_sicurezza").insert({
          company_id: companyId, campo_subappaltatore_id: ditta, ragione_sociale: campo?.ragione_sociale ?? "Ditta", piva: campo?.piva ?? null,
          indirizzo: campo?.indirizzo ?? null, email: campo?.email ?? null, telefono: campo?.telefono ?? null, responsabile: campo?.responsabile ?? null,
        }).select("id").single();
        if (errS) throw errS;
        schedaId = schedaCreata = nuova.id as string;
      }
      const [{ data: ord }, { data: esistenti }] = await Promise.all([
        db.from("orders").select("order_code").eq("id", orderId).maybeSingle(),
        db.from("contratti_subappalto").select("numero_contratto").eq("order_id", orderId).eq("company_id", companyId),
      ]);
      const usati = ((esistenti ?? []) as Array<{ numero_contratto: string | null }>).map((c) => Number(/\/S(\d+)$/.exec(c.numero_contratto ?? "")?.[1] ?? 0));
      const faseIds = [...new Set(sceltiOrdinati.map((v) => v.phase_id))];
      const periodo = periodoFasi(fasi, faseIds);
      const { data: creato, error: errC } = await db.from("contratti_subappalto").insert({
        company_id: companyId, order_id: orderId, subappaltatore_id: schedaId,
        numero_contratto: ord?.order_code ? `${ord.order_code}/S${String(Math.max(0, ...usati) + 1).padStart(2, "0")}` : null,
        descrizione_lavori: `Lavorazioni delle fasi: ${fasi.filter((f) => faseIds.includes(f.id)).map((f) => f.name).join(", ")}.`,
        importo_contrattuale: elencoUnito([], elenco).importo, elenco_lavori: elenco,
        data_inizio: periodo.dal, data_fine_prevista: periodo.al,
        stato: "bozza", ritenuta_garanzia_pct: 5, durata_garanzia_mesi: 12, oneri_sicurezza: 0, data_stipula: oggi(),
      }).select("id").single();
      if (errC) {
        if (schedaCreata) await db.from("subappaltatori_sicurezza").delete().eq("id", schedaCreata).eq("company_id", companyId);
        throw new Error(`${errC.message} Le voci restano affidate alla ditta in bozza: le trovi in «Chi fa cosa».`);
      }
      return { contrattoId: creato.id as string, schedaId: schedaId!, inFirma, nuovo: true };
    },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: chiaveAffidamenti(orderId) });
      onFatto();
      if (r.inFirma) {
        toast.success(r.nuovo ? "Contratto creato: controlla chi firma e invia." : "Voci aggiunte al contratto: controlla chi firma e invia.");
        vai(`/azienda/subappaltatori/${r.schedaId}?tab=contratto&contratto=${r.contrattoId}&invia=1`);
        return;
      }
      toast.success(r.nuovo ? "Contratto creato in bozza." : "Voci aggiunte al contratto in bozza.");
      onChiudi();
    },
    onError: (e: Error) => { void qc.invalidateQueries({ queryKey: chiaveAffidamenti(orderId) }); toast.error(e.message || "Contratto non creato."); },
  });

  const nomeDitta = ditte.data?.find((d) => d.id === ditta)?.ragione_sociale;
  const occupato = crea.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && !occupato && onChiudi()}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-3 sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Affida e manda il contratto</DialogTitle>
          <DialogDescription>Scegli le voci e la ditta: quantità e prezzi si scrivono qui. Il prezzo è quello del listino della ditta, altrimenti il costo nostro.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <OfficeSelect label="Ditta" className="h-9 min-w-[16rem] flex-1" value={ditta} onValueChange={(d) => { setDitta(d); setPrezzi({}); }} placeholder="Scegli la ditta"
            options={(ditte.data ?? []).filter((d) => d.is_active !== false).map((d) => ({ value: d.id, label: d.ragione_sociale }))} />
          <OfficeSelect label="Cosa comprende il prezzo" className="h-9 w-44" value={comprende} onValueChange={(c) => setComprende(c as typeof comprende)}
            options={[{ value: "posa", label: "Solo posa" }, { value: "fornitura_e_posa", label: "Fornitura e posa" }]} />
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca voce o fase" className="h-9 pl-8" aria-label="Cerca voce o fase" />
          </div>
        </div>
        {contrattoAttuale && !contrattoAttuale.firmato_il && <p className="text-xs text-muted-foreground">La ditta ha già un contratto in bozza su questa commessa: le voci scelte si aggiungono a quello.</p>}
        {contrattoAttuale?.firmato_il && <p role="alert" className="text-xs text-amber-800">La ditta ha già un contratto firmato su questa commessa: le voci in più vanno con «Variante sulle voci».</p>}

        <div className="min-h-0 flex-1 overflow-auto rounded-md border">
          {affidamenti.isLoading ? <p className="p-3 text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" />Caricamento…</p> : (
            <table className="w-full min-w-[820px] text-sm">
              <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="w-8 px-2 py-1.5" />
                  <th className="px-1 py-1.5 text-left font-medium">Voce</th>
                  <th className="w-24 px-1 py-1.5 text-right font-medium">Libera</th>
                  <th className="w-28 px-1 py-1.5 text-right font-medium">Quantità</th>
                  <th className="w-28 px-1 py-1.5 text-right font-medium">Prezzo €</th>
                  <th className="w-36 px-1 py-1.5 text-left font-medium">Da dove</th>
                  <th className="w-28 px-2 py-1.5 text-right font-medium">Importo</th>
                </tr>
              </thead>
              <tbody>
                {gruppi.map(({ fase, voci: vf }) => {
                  const ids = vf.map((v) => v.id);
                  const tutte = ids.every((id) => scelte.has(id));
                  return [
                    <tr key={fase.id} className="border-t bg-muted/40">
                      <td className="px-2 py-1"><Checkbox checked={tutte} aria-label={`Scegli tutte le voci di ${fase.name}`} onCheckedChange={(c) => cambiaScelta(ids, c === true)} /></td>
                      <td colSpan={6} className="px-1 py-1 text-xs font-medium">{fase.name} <span className="font-normal text-muted-foreground">· {vf.length} {vf.length === 1 ? "voce libera" : "voci libere"}</span></td>
                    </tr>,
                    ...vf.map((v) => {
                      const si = scelte.has(v.id);
                      const p = proposti.data?.get(v.id);
                      const a = ai[v.id];
                      const errore = si ? erroreDi(v.id) : undefined;
                      const grave = !!errore && errore !== "Prezzo mancante";
                      const q = quantitaDi(v) ?? 0;
                      const pr = prezzoDi(v.id) ?? 0;
                      return (
                        <tr key={v.id} className={`border-t align-middle ${grave ? "bg-red-50" : ""}`}>
                          <td className="px-2 py-1"><Checkbox checked={si} aria-label={`Scegli ${v.descrizione}`} onCheckedChange={(c) => cambiaScelta([v.id], c === true)} /></td>
                          <td className="max-w-0 px-1 py-1"><p className="truncate" title={v.descrizione}>{v.descrizione}</p></td>
                          <td className="whitespace-nowrap px-1 py-1 text-right text-xs tabular-nums text-muted-foreground">{qt(residua.get(v.id) ?? 0)} {v.unita ?? ""}</td>
                          <td className="px-1 py-1">
                            {si && <Input aria-label={`Quantità di ${v.descrizione}`} inputMode="decimal" className="h-8 text-right tabular-nums"
                              value={quantita[v.id] ?? casella(residua.get(v.id), 3)} onChange={(e) => setQuantita((s) => ({ ...s, [v.id]: e.target.value }))} />}
                          </td>
                          <td className="px-1 py-1">
                            {si && <Input aria-label={`Prezzo di ${v.descrizione}`} inputMode="decimal" className="h-8 text-right tabular-nums" placeholder={ditta ? "—" : "ditta?"}
                              disabled={!ditta} value={prezzi[v.id] ?? casella(p?.prezzo)} onChange={(e) => setPrezzi((s) => ({ ...s, [v.id]: e.target.value }))} />}
                          </td>
                          <td className="px-1 py-1 text-[11px] leading-tight">
                            {si && (errore ? <span className={grave ? "text-red-800" : "text-amber-800"}>{grave ? errore : "da scrivere"}</span>
                              : prezzi[v.id] != null ? <span className="text-muted-foreground">a mano</span>
                              : p ? <span className={p.origine === "manuale" ? "text-amber-800" : "text-muted-foreground"}>{ORIGINE[p.origine] ?? p.origine}</span> : null)}
                            {si && !v.tariffa_id && a && (
                              a.certezza === "alta" || a.confermata
                                ? <Badge variant="outline" className="ml-1 h-4 border-violet-300 bg-violet-50 px-1 text-[10px] font-normal text-violet-900" title={a.perche || undefined}>AI</Badge>
                                : <button type="button" className="ml-1 rounded border border-violet-300 bg-violet-50 px-1 text-[10px] text-violet-900" title={a.perche || "Proposta da verificare"}
                                    onClick={() => setAi((x) => ({ ...x, [v.id]: { ...a, confermata: true } }))}>AI: è questa? Sì</button>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">{si ? formatCurrency(Math.round(q * pr * 100) / 100) : ""}</td>
                        </tr>
                      );
                    }),
                  ];
                })}
                {gruppi.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-sm text-muted-foreground">{voci.length ? "Nessuna voce libera con questi filtri: tutte hanno già una ditta." : "La commessa non ha voci: si affidano le voci del computo o del preventivo."}</td></tr>}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-sm">
          <span>{righe.length} {righe.length === 1 ? "voce" : "voci"}{nomeDitta ? ` a ${nomeDitta}` : ""}</span>
          <span>Alla ditta <strong className="tabular-nums">{formatCurrency(conto.costo)}</strong> + IVA in reverse charge</span>
          {daScrivere > 0
            ? <span className="text-amber-800">{daScrivere === 1 ? "1 prezzo da scrivere" : `${daScrivere} prezzi da scrivere`}</span>
            : conto.venduto > 0 && <span className={conto.margine < 0 ? "text-destructive" : "text-muted-foreground"}>Margine {formatCurrency(conto.margine)}{conto.marginePct != null ? ` (${conto.marginePct.toLocaleString("it-IT")}%)` : ""}</span>}
          {(aiInCorso > 0 || proposti.isFetching) && <span className="text-xs text-muted-foreground"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />{aiInCorso > 0 ? <><Sparkles className="mr-0.5 inline h-3 w-3" />cerco nel listino {aiInCorso} voci</> : "calcolo i prezzi"}</span>}
          <span className="ml-auto flex gap-2">
            <Button variant="ghost" disabled={occupato} onClick={onChiudi}>Chiudi</Button>
            <Button variant="outline" disabled={occupato || !ditta || !righe.length || conto.errori.length > 0 || aiInCorso > 0 || !!contrattoAttuale?.firmato_il} onClick={() => crea.mutate(false)}>
              {crea.isPending && crea.variables === false && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{contrattoAttuale && !contrattoAttuale.firmato_il ? "Aggiungi al contratto" : "Crea il contratto"}
            </Button>
            <Button disabled={occupato || !ditta || !righe.length || conto.errori.length > 0 || aiInCorso > 0 || !!contrattoAttuale?.firmato_il} onClick={() => crea.mutate(true)}>
              {crea.isPending && crea.variables === true ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}{contrattoAttuale && !contrattoAttuale.firmato_il ? "Aggiungi e manda in firma" : "Crea e manda in firma"}
            </Button>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

