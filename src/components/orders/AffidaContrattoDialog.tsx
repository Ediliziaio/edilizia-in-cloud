/**
 * «Affida e manda il contratto» (11/11/2026): voci, ditta, quantità e prezzi in una tabella, e un pulsante.
 *
 * - I prezzi li propone il database (listino della ditta, poi costo aziendale) prima di salvare: quello che
 *   si vede è quello che va nel contratto. Si cambiano scrivendo nella riga.
 * - Le voci non collegate al listino le cerca l'AI da sola mentre si sceglie; ogni proposta chiede un «Sì» nella
 *   riga (provato sulle voci vere: anche quelle «sicure» del modello sbagliavano), poi si usa e si ricorda.
 * - «Crea il contratto»: collega le voci, le affida, crea il contratto in bozza (o aggiunge al suo in bozza).
 *   «Crea e manda in firma» porta al contratto con l'invio già aperto: chi firma e l'email si confermano lì.
 * Le funzioni di sempre (Chi fa cosa, Lavori e prezzi, Collega al listino) restano per i casi particolari.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Pencil, Search, Send, Sparkles } from "lucide-react";
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
import { chiaveDescrizione, unitaPerListino } from "@/lib/subappaltatori/abbinamentoListino";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { contoTabella, destinoContratto, elencoUnito, prezzoDalVenduto, righeContratto, type RigaTabella } from "@/lib/subappaltatori/affidaEContratto";
import { useAffidamentiCommessa } from "./AffidaVociDialog";
import { chiaveVociPreviste, useVociPrevisteFasi } from "@/hooks/useVociPrevisteFasi";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
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
  // Il testo della riga nel contratto, se lo si vuole diverso da quello della voce (11/11/2026).
  const [testi, setTesti] = useState<Record<string, string>>({});
  const [inScrittura, setInScrittura] = useState<string | null>(null);
  // Un prezzo per molte righe: uguale per tutte, o il nostro venduto meno una percentuale.
  const [prezzoUnico, setPrezzoUnico] = useState("");
  const [sconto, setSconto] = useState("");
  // Il listino della ditta impara (11/11/2026): i prezzi scritti a mano restano per la prossima volta.
  const { canEditSettingsPricing } = usePermissions();
  const telefono = useIsMobile();
  const [ricorda, setRicorda] = useState(true);
  const [ai, setAi] = useState<ProposteAi>({});
  const chieste = useRef<Set<string>>(new Set());
  const [aiInCorso, setAiInCorso] = useState(0);

  const lista = useMemo(() => affidamenti.data ?? [], [affidamenti.data]);
  const residua = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of voci) m.set(v.id, statoVoce({ ...v, importo: v.importo, costo_materiali: v.costo_materiali }, lista).residua);
    return m;
  }, [voci, lista]);
  // Revisione dell'11/11/2026: una quota in bozza della stessa ditta (da «Chi fa cosa» o da un tentativo non finito)
  // fa parte della riga. Prima affida_voci la sommava alla quantità scritta e il contratto riportava il doppio.
  const proprieBozza = useMemo(() => new Map(lista.filter((a) => a.subappaltatore_id === ditta && a.stato === "bozza" && !a.contratto_id).map((a) => [a.voce_id, a])), [lista, ditta]);
  const residuaRiga = (id: string) => (residua.get(id) ?? 0) + (proprieBozza.get(id)?.quantita ?? 0);
  const libere = useMemo(() => voci.filter((v) => (residua.get(v.id) ?? 0) + (proprieBozza.get(v.id)?.quantita ?? 0) > 0.0005), [voci, residua, proprieBozza]);
  const gruppi = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return [...fasi].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((f) => ({
      fase: f,
      voci: libere.filter((v) => v.phase_id === f.id && (!q || v.descrizione.toLowerCase().includes(q) || f.name.toLowerCase().includes(q))),
    })).filter((g) => g.voci.length > 0);
  }, [fasi, libere, cerca]);

  // Il nome della voce di listino proposta: per dire «Sì» bisogna vedere a cosa.
  const idProposti = [...new Set(Object.values(ai).map((a) => a.tariffaId))].sort();
  const nomiProposti = useQuery({
    queryKey: ["listino-nomi", companyId, idProposti.join(",")],
    enabled: idProposti.length > 0,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await db.from("tariffe_aziendali").select("id, nome").eq("company_id", companyId).in("id", idProposti);
      if (error) throw error;
      return new Map(((data ?? []) as Array<{ id: string; nome: string }>).map((t) => [t.id, t.nome]));
    },
  });
  const tariffaUsata = (id: string) => {
    const a = ai[id];
    // Prova sulle voci vere (11/11/2026): anche le proposte «sicure» del modello erano a volte sbagliate
    // (una porta tagliafuoco presa per «Posa porta interna»). Nessuna si usa senza il «Sì» di chi affida.
    return a?.confermata ? a.tariffaId : null;
  };
  // Solo le voci ancora libere: una voce affidata nel frattempo non resta scelta e invisibile (bloccava i pulsanti).
  const sceltiOrdinati = useMemo(() => libere.filter((v) => scelte.has(v.id)), [libere, scelte]);
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

  const quantitaDi = (v: VoceAffidabile) => (quantita[v.id] != null ? parseAssignmentAmount(quantita[v.id], 3) : residuaRiga(v.id));
  // Il prezzo si legge al centesimo («1.250» = 1.250 €); con più decimali si legge lo stesso, e la riga lo segnala.
  const leggiPrezzo = (t: string) => (t.trim() ? parseAssignmentAmount(t, 2) ?? parseAssignmentAmount(t, 4) : null);
  // Quello proposto dal listino si arrotonda al centesimo, come fa il database sulle quote.
  const proposto = (id: string) => { const p = proposti.data?.get(id)?.prezzo; return p == null ? null : Math.round(p * 100) / 100; };
  const prezzoDi = (id: string) => (prezzi[id] != null ? leggiPrezzo(prezzi[id]) : proposto(id));
  const righe: RigaTabella[] = sceltiOrdinati.map((v) => ({ voceId: v.id, quantita: quantitaDi(v), prezzo: prezzoDi(v.id), descrizione: testi[v.id] ?? null }));
  /** Scrive il prezzo nelle righe scelte: solo in quelle senza prezzo, o in tutte. */
  const applicaPrezzi = (calcola: (v: VoceAffidabile) => number | null, tutte: boolean) => {
    const nuovi: Record<string, string> = {};
    let fatte = 0;
    for (const v of sceltiOrdinati) {
      if (!tutte && prezzoDi(v.id) != null && (prezzoDi(v.id) ?? 0) > 0) continue;
      const p = calcola(v);
      if (p == null || !(p > 0)) continue;
      nuovi[v.id] = casella(p);
      fatte++;
    }
    setPrezzi((s) => ({ ...s, ...nuovi }));
    toast.success(fatte ? `Prezzo scritto in ${fatte} ${fatte === 1 ? "riga" : "righe"}.` : "Nessuna riga da cambiare.");
  };
  const conto = contoTabella(righe, voci, residuaRiga, comprende);
  const erroreDi = (id: string) => conto.errori.find((e) => e.voceId === id)?.motivo;
  // Un prezzo ancora da scrivere non è un errore: lo diventa solo se resta vuoto. In rosso le cose sbagliate.
  const daScrivere = conto.errori.filter((e) => e.motivo === "Prezzo mancante").length;

  const cambiaScelta = (ids: string[], si: boolean) => setScelte((s) => {
    const n = new Set(s);
    for (const id of ids) { if (si) n.add(id); else n.delete(id); }
    return n;
  });

  const contrattoAttuale = ditta ? contrattoDellaDitta(ditta, contratti, schede) : null;

  /** I prezzi scritti a mano (o presi dal costo nostro) nel listino della ditta; le voci senza listino ci entrano. */
  const ricordaNelListino = async (): Promise<number> => {
    const daRicordare = sceltiOrdinati.filter((v) => {
      const p = prezzoDi(v.id);
      const prop = proposti.data?.get(v.id);
      return p != null && p > 0 && !(prop?.origine === "listino_ditta" && proposto(v.id) === p);
    });
    if (!daRicordare.length) return 0;
    const righePrezzo: Array<{ tariffa_id: string; costo: number }> = [];
    // Una voce che il listino ha già (stesso nome e unità) non si crea due volte: né in questo giro né nei successivi.
    const giaFatte = new Map<string, string>();
    for (const v of daRicordare) {
      let tariffa = v.tariffa_id ?? tariffaUsata(v.id);
      if (!tariffa) {
        const u = unitaPerListino(v.unita);
        if (!u) continue;
        const nome = v.descrizione.trim().slice(0, 500);
        const chiave = `${nome.toLowerCase()}|${u.unita}`;
        tariffa = giaFatte.get(chiave) ?? null;
        if (!tariffa) {
          const { data: esiste, error: errE } = await db.from("tariffe_aziendali").select("id").eq("company_id", companyId)
            .ilike("nome", nome.replace(/[%_\\]/g, (c: string) => `\\${c}`)).eq("unita", u.unita).is("subappaltatore_id", null).is("external_team_id", null).limit(1);
          if (errE) throw errE;
          tariffa = (esiste?.[0]?.id as string | undefined) ?? null;
        }
      }
      if (!tariffa) {
        const u = unitaPerListino(v.unita)!;
        const venduto = v.quantita > 0 && v.importo ? Math.round((v.importo / v.quantita) * 10000) / 10000 : null;
        const { data, error } = await db.from("tariffe_aziendali").insert({
          company_id: companyId, tipo: "altro", nome: v.descrizione.trim().slice(0, 500), ...u,
          codice: v.origine_codice?.trim() || null, prezzo_vendita: venduto, prezzo_costo: 0, fonte: "Dalla commessa, affidando alle ditte",
        }).select("id").single();
        if (error) throw error;
        tariffa = data.id as string;
      }
      giaFatte.set(`${v.descrizione.trim().slice(0, 500).toLowerCase()}|${unitaPerListino(v.unita)?.unita ?? ""}`, tariffa);
      if (!v.tariffa_id) {
        const { error: e2 } = await db.rpc("voci_abbina_listino", { p_order: orderId, p_abbinamenti: [{ voce_id: v.id, tariffa_id: tariffa, chiave: chiaveDescrizione(v.descrizione) }], p_ricorda: true });
        if (e2) throw e2;
      }
      righePrezzo.push({ tariffa_id: tariffa, costo: prezzoDi(v.id)! });
    }
    if (!righePrezzo.length) return 0;
    const { error } = await db.rpc("listino_ditta_salva", { p_subappaltatore: ditta, p_valido_dal: oggi(), p_righe: righePrezzo });
    if (error) throw error;
    return righePrezzo.length;
  };

  const crea = useMutation({
    mutationFn: async (inFirma: boolean) => {
      if (!ditta) throw new Error("Scegli la ditta.");
      if (!righe.length) throw new Error("Scegli almeno una voce.");
      if (conto.errori.length) throw new Error(`${conto.errori.length === 1 ? "Una riga" : `${conto.errori.length} righe`} da sistemare: ${conto.errori[0].motivo.toLowerCase()}.`);
      // Prima si guarda il contratto della ditta: se è firmato o in firma ci si ferma prima di toccare qualcosa.
      let inFirmaOra = false;
      if (contrattoAttuale && !contrattoAttuale.firmato_il) {
        const { data, error } = await db.rpc("contratto_in_firma", { p_contratto: contrattoAttuale.id });
        if (error) throw new Error("Non riesco a sapere se il contratto della ditta è in firma: riprova tra poco.");
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
      // 2. Le quote, con la quantità della tabella: quelle già in bozza della ditta si portano a quella quantità,
      // le altre si creano (affida_voci sommerebbe, e il contratto riporterebbe più di quanto scritto).
      for (const r of righe.filter((x) => proprieBozza.has(x.voceId))) {
        const { error } = await db.rpc("affidamento_modifica", { p_id: proprieBozza.get(r.voceId)!.id, p_quantita: r.quantita, p_comprende: comprende });
        if (error) throw error;
      }
      const nuove = righe.filter((x) => !proprieBozza.has(x.voceId));
      if (nuove.length) {
        const { error: errAff } = await db.rpc("affida_voci", {
          p_order: orderId, p_subappaltatore: ditta, p_comprende: comprende,
          p_voci: nuove.map((r) => ({ voce_id: r.voceId, quantita: r.quantita })),
        });
        if (errAff) throw errAff;
      }
      const { data: quote, error: errQ } = await db.from("subappalto_affidamenti")
        .select("id, voce_id, subappaltatore_id, quantita, prezzo_unitario, origine_prezzo, comprende, stato, contratto_id")
        .eq("order_id", orderId).eq("subappaltatore_id", ditta).eq("stato", "bozza");
      if (errQ) throw errQ;
      const elenco = righeContratto(fasi, voci, ((quote ?? []) as AffidamentoPerContratto[]).map((a) => ({ ...a, quantita: Number(a.quantita) })), ditta, righe);
      if (!elenco.length) throw new Error("Le voci affidate non si ritrovano: ricarica la pagina e riprova.");

      // 2b. I prezzi scritti a mano entrano nel listino della ditta: la prossima volta arrivano da soli.
      // Non blocca il contratto: se non riesce lo si dice e basta.
      let imparati = 0;
      if (ricorda && canEditSettingsPricing && comprende === "posa") {
        try { imparati = await ricordaNelListino(); } catch { toast.warning("Il contratto si crea, ma i prezzi non sono entrati nel listino della ditta."); }
      }
      // 3. Il contratto: nuovo, o le righe in coda a quello in bozza. I prezzi della tabella vanno sulle quote dal database.
      if (destino.tipo === "aggiungi") {
        // L'elenco si rilegge adesso: qualcuno può averlo cambiato da «Lavori e prezzi» dopo l'apertura del popup.
        const { data: ora, error: errOra } = await db.from("contratti_subappalto").select("elenco_lavori").eq("id", destino.id).single();
        if (errOra) throw errOra;
        const unito = elencoUnito(ora?.elenco_lavori, elenco);
        const { data: toccati, error } = await db.from("contratti_subappalto")
          .update({ elenco_lavori: unito.elenco, importo_contrattuale: unito.importo })
          .eq("id", destino.id).eq("stato", "bozza").is("firmato_il", null).select("id");
        if (error) throw error;
        if (!toccati?.length) throw new Error("Il contratto è cambiato nel frattempo: ricarica la pagina e riprova. Le voci restano affidate alla ditta in bozza.");
        return { contrattoId: destino.id, schedaId: contrattoAttuale!.subappaltatore_id, inFirma, nuovo: false, imparati };
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
      const [{ data: ord, error: errO }, { data: esistenti, error: errN }] = await Promise.all([
        db.from("orders").select("order_code").eq("id", orderId).maybeSingle(),
        db.from("contratti_subappalto").select("numero_contratto").eq("order_id", orderId).eq("company_id", companyId),
      ]);
      if (errO || errN) throw new Error("Non riesco a leggere i contratti della commessa per il numero: riprova.");
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
      return { contrattoId: creato.id as string, schedaId: schedaId!, inFirma, nuovo: true, imparati };
    },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: chiaveAffidamenti(orderId) });
      if (r.imparati) toast.success(`${r.imparati} ${r.imparati === 1 ? "prezzo è entrato" : "prezzi sono entrati"} nel listino della ditta: la prossima volta arrivano da soli.`);
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

        {ditta && sceltiOrdinati.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs">
            <span className="font-medium">Prezzo per più righe:</span>
            <Input aria-label="Prezzo uguale per le righe" inputMode="decimal" placeholder="€" value={prezzoUnico} onChange={(e) => setPrezzoUnico(e.target.value)} className="h-7 w-20 text-right" />
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={!(parseAssignmentAmount(prezzoUnico, 2) ?? 0)}
              onClick={() => applicaPrezzi(() => parseAssignmentAmount(prezzoUnico, 2), false)}>a quelle senza prezzo</Button>
            <span className="text-muted-foreground">oppure il nostro venduto meno</span>
            <Input aria-label="Percentuale da togliere al venduto" inputMode="decimal" placeholder="%" value={sconto} onChange={(e) => setSconto(e.target.value)} className="h-7 w-16 text-right" />
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={parseAssignmentAmount(sconto, 2) == null || !sconto.trim()}
              onClick={() => applicaPrezzi((v) => prezzoDalVenduto(v, parseAssignmentAmount(sconto, 2) ?? -1), false)}>a quelle senza prezzo</Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={parseAssignmentAmount(sconto, 2) == null || !sconto.trim()}
              title="Sostituisce anche i prezzi già scritti o presi dal listino"
              onClick={() => applicaPrezzi((v) => prezzoDalVenduto(v, parseAssignmentAmount(sconto, 2) ?? -1), true)}>a tutte</Button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto rounded-md border">
          {affidamenti.isLoading ? <p className="p-3 text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" />Caricamento…</p> : (
            telefono ? (
              // Sul telefono una voce è una scheda di due righe: cosa e quanto resta, poi quantità, prezzo e importo.
              <ul className="divide-y text-sm">
                {gruppi.map(({ fase, voci: vf }) => {
                  const ids = vf.map((v) => v.id);
                  return [
                    <li key={fase.id} className="flex items-center gap-2 bg-muted/40 px-2 py-1.5 text-xs font-medium">
                      <Checkbox checked={ids.every((id) => scelte.has(id))} aria-label={`Scegli tutte le voci di ${fase.name}`} onCheckedChange={(c) => cambiaScelta(ids, c === true)} />
                      <span className="min-w-0 flex-1 truncate">{fase.name}</span><span className="font-normal text-muted-foreground">{vf.length}</span>
                    </li>,
                    ...vf.map((v) => {
                      const si = scelte.has(v.id);
                      const p = proposti.data?.get(v.id);
                      const a = ai[v.id];
                      const errore = si ? erroreDi(v.id) : undefined;
                      const grave = !!errore && errore !== "Prezzo mancante";
                      const q = quantitaDi(v) ?? 0;
                      const pr = prezzoDi(v.id) ?? 0;
                      return (
                        <li key={v.id} className={`space-y-1.5 px-2 py-2 ${grave ? "bg-red-50" : ""}`}>
                          <div className="flex items-start gap-2">
                            <Checkbox className="mt-0.5" checked={si} aria-label={`Scegli ${v.descrizione}`} onCheckedChange={(c) => cambiaScelta([v.id], c === true)} />
                            <p className="line-clamp-2 min-w-0 flex-1">{testi[v.id] ?? v.descrizione}</p>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{qt(residuaRiga(v.id))} {v.unita ?? ""}</span>
                          </div>
                          {si && (
                            <div className="flex items-center gap-2 pl-6">
                              <Input aria-label={`Quantità di ${v.descrizione}`} inputMode="decimal" className="h-9 w-20 text-right tabular-nums"
                                value={quantita[v.id] ?? casella(residuaRiga(v.id), 3)} onChange={(e) => setQuantita((x) => ({ ...x, [v.id]: e.target.value }))} />
                              <span className="text-xs text-muted-foreground">×</span>
                              <Input aria-label={`Prezzo di ${v.descrizione}`} inputMode="decimal" className="h-9 w-24 text-right tabular-nums" placeholder={ditta ? "€" : "ditta?"}
                                disabled={!ditta} value={prezzi[v.id] ?? casella(p?.prezzo)} onChange={(e) => setPrezzi((x) => ({ ...x, [v.id]: e.target.value }))} />
                              <span className="ml-auto text-right tabular-nums">{formatCurrency(Math.round(q * pr * 100) / 100)}</span>
                            </div>
                          )}
                          {si && (errore || (!v.tariffa_id && a && !a.confermata)) && (
                            <div className="pl-6 text-[11px]">
                              {errore && <span className={grave ? "text-red-800" : "text-amber-800"}>{grave ? errore : "prezzo da scrivere"}</span>}
                              {!v.tariffa_id && a && !a.confermata && (
                                <button type="button" className="mt-1 block max-w-full truncate rounded border border-violet-300 bg-violet-50 px-1.5 py-0.5 text-left text-violet-900"
                                  onClick={() => setAi((x) => ({ ...x, [v.id]: { ...a, confermata: true } }))}>è «{nomiProposti.data?.get(a.tariffaId) ?? "…"}»? Sì</button>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    }),
                  ];
                })}
                {gruppi.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">Nessuna voce libera.</li>}
              </ul>
            ) : (
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
                          <td className="max-w-0 px-1 py-1">
                            {si && inScrittura === v.id ? (
                              <Input autoFocus aria-label={`Testo nel contratto per ${v.descrizione}`} className="h-8" value={testi[v.id] ?? v.descrizione}
                                onChange={(e) => setTesti((t) => ({ ...t, [v.id]: e.target.value }))} onBlur={() => setInScrittura(null)}
                                onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setInScrittura(null); }} />
                            ) : (
                              <div className="flex min-w-0 items-center gap-1">
                                <p className={`truncate ${testi[v.id] ? "text-blue-900" : ""}`} title={testi[v.id] ? `Nel contratto: ${testi[v.id]}\nNella commessa: ${v.descrizione}` : v.descrizione}>{testi[v.id] ?? v.descrizione}</p>
                                {si && <button type="button" className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Cambia il testo nel contratto di ${v.descrizione}`} title="Cambia il testo di questa riga nel contratto" onClick={() => setInScrittura(v.id)}><Pencil className="h-3 w-3" /></button>}
                              </div>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-1 py-1 text-right text-xs tabular-nums text-muted-foreground">{qt(residuaRiga(v.id))} {v.unita ?? ""}</td>
                          <td className="px-1 py-1">
                            {si && <Input aria-label={`Quantità di ${v.descrizione}`} inputMode="decimal" className="h-8 text-right tabular-nums"
                              value={quantita[v.id] ?? casella(residuaRiga(v.id), 3)} onChange={(e) => setQuantita((s) => ({ ...s, [v.id]: e.target.value }))} />}
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
                              a.confermata
                                ? <Badge variant="outline" className="ml-1 h-4 border-violet-300 bg-violet-50 px-1 text-[10px] font-normal text-violet-900" title={nomiProposti.data?.get(a.tariffaId) ?? undefined}>listino</Badge>
                                : <button type="button" className="mt-0.5 block max-w-full truncate rounded border border-violet-300 bg-violet-50 px-1 text-left text-[10px] text-violet-900" title={`Nel listino: ${a.perche || "proposta da verificare"}`}
                                    onClick={() => setAi((x) => ({ ...x, [v.id]: { ...a, confermata: true } }))}>è «{nomiProposti.data?.get(a.tariffaId) ?? "…"}»{a.certezza === "media" ? " (dubbio)" : ""}? Sì</button>
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
            )
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-sm">
          <span>{righe.length} {righe.length === 1 ? "voce" : "voci"}{nomeDitta ? ` a ${nomeDitta}` : ""}</span>
          <span>Alla ditta <strong className="tabular-nums">{formatCurrency(conto.costo)}</strong> + IVA in reverse charge</span>
          {daScrivere > 0
            ? <span className="text-amber-800">{daScrivere === 1 ? "1 prezzo da scrivere" : `${daScrivere} prezzi da scrivere`}</span>
            : conto.venduto > 0 && <span className={conto.margine < 0 ? "text-destructive" : "text-muted-foreground"}>Margine {formatCurrency(conto.margine)}{conto.marginePct != null ? ` (${conto.marginePct.toLocaleString("it-IT")}%)` : ""}</span>}
          {(() => {
            const daDire = sceltiOrdinati.filter((v) => !v.tariffa_id && ai[v.id] && !ai[v.id].confermata).map((v) => v.id);
            return daDire.length > 1 && (
              <button type="button" className="rounded border border-violet-300 bg-violet-50 px-2 py-0.5 text-xs text-violet-900"
                onClick={() => setAi((x) => ({ ...x, ...Object.fromEntries(daDire.map((id) => [id, { ...x[id], confermata: true }])) }))}>
                Sì a tutte le {daDire.length} voci di listino proposte
              </button>
            );
          })()}
          {canEditSettingsPricing && ditta && comprende === "posa" && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="I prezzi scritti a mano entrano nel listino della ditta: la prossima volta arrivano da soli">
              <Checkbox checked={ricorda} onCheckedChange={(c) => setRicorda(c === true)} aria-label="Ricorda i prezzi nel listino della ditta" />
              ricorda i prezzi nel listino della ditta
            </label>
          )}
          {(aiInCorso > 0 || proposti.isFetching) && <span className="text-xs text-muted-foreground"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />{aiInCorso > 0 ? <><Sparkles className="mr-0.5 inline h-3 w-3" />cerco nel listino {aiInCorso} voci</> : "calcolo i prezzi"}</span>}
          <span className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
            <Button variant="ghost" className="max-sm:hidden" disabled={occupato} onClick={onChiudi}>Chiudi</Button>
            <Button variant="outline" className="max-sm:flex-1" disabled={occupato || !ditta || !righe.length || conto.errori.length > 0 || aiInCorso > 0 || !!contrattoAttuale?.firmato_il} onClick={() => crea.mutate(false)}>
              {crea.isPending && crea.variables === false && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{contrattoAttuale && !contrattoAttuale.firmato_il ? (telefono ? "Aggiungi" : "Aggiungi al contratto") : (telefono ? "Crea" : "Crea il contratto")}
            </Button>
            <Button className="max-sm:flex-1" disabled={occupato || !ditta || !righe.length || conto.errori.length > 0 || aiInCorso > 0 || !!contrattoAttuale?.firmato_il} onClick={() => crea.mutate(true)}>
              {crea.isPending && crea.variables === true ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}{telefono ? "Manda in firma" : contrattoAttuale && !contrattoAttuale.firmato_il ? "Aggiungi e manda in firma" : "Crea e manda in firma"}
            </Button>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Lo stesso popup aperto da «Altre azioni» in cima alla commessa (11/11/2026): legge da sé fasi, voci,
 * contratti e schede delle ditte, che nel pannello «Ditte e contratti» arrivano già caricati.
 */
export function AffidaContrattoDaCommessa({ orderId, companyId, onChiudi }: { orderId: string; companyId: string; onChiudi: () => void }) {
  const qc = useQueryClient();
  const voci = useVociPrevisteFasi(orderId, true);
  const dati = useQuery({
    queryKey: ["affida-contratto-commessa", companyId, orderId],
    queryFn: async () => {
      const [fasi, contratti, schede] = await Promise.all([
        db.from("order_work_phases").select("id, name, position, start_date, end_date").eq("order_id", orderId).eq("company_id", companyId).order("position"),
        db.from("contratti_subappalto").select("id, subappaltatore_id, stato, firmato_il, elenco_lavori").eq("order_id", orderId).eq("company_id", companyId),
        db.from("subappaltatori_sicurezza").select("id, campo_subappaltatore_id, order_id, created_at").eq("company_id", companyId).not("campo_subappaltatore_id", "is", null),
      ]);
      for (const r of [fasi, contratti, schede]) if (r.error) throw r.error;
      return { fasi: fasi.data ?? [], contratti: contratti.data ?? [], schede: schede.data ?? [] };
    },
  });
  const errore = dati.isError || voci.isError;
  useEffect(() => {
    if (!errore) return;
    toast.error("Non riesco a leggere fasi e voci della commessa.");
    onChiudi();
  }, [errore, onChiudi]);
  if (errore) return null;
  if (!dati.data || !voci.data) {
    return (
      <Dialog open onOpenChange={(o) => !o && onChiudi()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Affida e manda il contratto</DialogTitle><DialogDescription>Carico fasi e voci della commessa…</DialogDescription></DialogHeader>
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <AffidaContrattoDialog orderId={orderId} companyId={companyId} fasi={dati.data.fasi} voci={voci.data as VoceAffidabile[]}
      contratti={dati.data.contratti} schede={dati.data.schede} onChiudi={onChiudi}
      onFatto={() => {
        void qc.invalidateQueries({ queryKey: ["affida-contratto-commessa", companyId, orderId] });
        void qc.invalidateQueries({ queryKey: ["ditte-contratti-commessa", companyId, orderId] });
        void qc.invalidateQueries({ queryKey: chiaveAffidamenti(orderId) });
        void qc.invalidateQueries({ queryKey: chiaveVociPreviste(companyId, orderId) });
        refreshWorkQueries(qc, orderId, companyId);
      }} />
  );
}
