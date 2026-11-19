import { AzioniLavorazioni } from "./AzioniLavorazioni";
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
import { lazy, Suspense, type ComponentProps, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Loader2, Pencil, Plus, Search, Send, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prezzoSubappalto } from "@/lib/subappaltatori/prezzoDalComputo";
import { giorniPrevisti, type AmbitoLavoro } from "@/lib/orders/previsionaleLavoro";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/formatters";
import { parseAssignmentAmount } from "@/lib/orders/assignmentAmounts";
import { contrattoDellaDitta, periodoFasi, schedeSicurezzaDitta, type AffidamentoPerContratto, type SchedaSicurezza, type SottofaseLavoro, type VoceLavoro } from "@/lib/orders/ditteLavori";
import { chiaveAffidamenti, statoVoce } from "@/lib/subappaltatori/affidamentiCommessa";
import { chiaveDescrizione, unitaPerListino } from "@/lib/subappaltatori/abbinamentoListino";
import { useDatiAffidaContratto } from "@/hooks/useDatiAffidaContratto";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { contoTabella, destinoContratto, elencoUnito, prezzoDalVenduto, rigaContrattoACorpo, righeContratto, type RigaTabella } from "@/lib/subappaltatori/affidaEContratto";
import { useAffidamentiCommessa } from "./AffidaVociDialog";
import { chiaveVociPreviste, useVociPrevisteFasi } from "@/hooks/useVociPrevisteFasi";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import { MacrofasiSubappalto } from "@/components/subappaltatori/MacrofasiSubappalto";
import { totaleElencoLavori, type RigaElencoLavori } from "@/lib/subappaltatori/contrattoSubappaltoHtml";
import { OfficeSelect } from "./OfficeSelect";
import { ComputoSubappaltoAnteprima, type AnteprimaSubappalto } from "./ComputoSubappaltoAnteprima";
import type { RichiestaDaLavorazioni } from "@/lib/subappaltatori/richiesteDaLavorazioni";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type VoceAffidabile = VoceLavoro & { importo: number | null; costo_materiali: number };
interface ContrattoCommessa { importo_contrattuale?: number; oneri_sicurezza?: number; id: string; subappaltatore_id: string; stato: string; firmato_il: string | null; elenco_lavori: unknown; data_inizio?: string | null; data_fine_prevista?: string | null }

const ListinoDitta = lazy(() => import("@/components/subappaltatori/ListinoDitta")
  .then((modulo) => ({ default: modulo.ListinoDitta })));
const qt = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 3 });
const casella = (n: number | null | undefined, decimali = 2) => (n == null ? "" : String(Math.round(n * 10 ** decimali) / 10 ** decimali).replace(".", ","));
const oggi = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());

type ProposteAi = Record<string, { tariffaId: string; certezza: "alta" | "media"; perche: string; confermata?: boolean }>;

const ALTRI_LAVORI = "altri-lavori";
type DittaContratto = { id: string; nome: string; schedaId?: string; fasiIntere?: string[] };
export interface ComputoDaLavorazioni {
  voci: string[];
  ambiti: AmbitoLavoro[];
  aCorpo?: AmbitoLavoro[];
  soloRichiesta?: boolean;
  offerta?: RichiestaDaLavorazioni;
  richiesta?: RichiestaDaLavorazioni;
}

type LavoroACorpo = { id: string; faseId: string; sottofaseId?: string; descrizione: string; importo?: string };

function SoloContenutoComputo({ children }: ComponentProps<typeof MacrofasiSubappalto>) {
  return <>{children}</>;
}

export function AffidaContrattoDialog({ orderId, companyId, fasi, sottofasi = [], voci, contratti, schede, dittaFissa, partenza, incorporato, suRichiesta, offerte, onCaricaOfferta, onOccupato, onChiudi, onFatto, onContrattoSalvato }: {
  orderId: string; companyId: string;
  fasi: Array<{ id: string; name: string; position?: number | null; start_date?: string | null; end_date?: string | null }>;
  sottofasi?: SottofaseLavoro[];
  voci: VoceAffidabile[]; contratti: ContrattoCommessa[]; schede: SchedaSicurezza[];
  dittaFissa?: DittaContratto;
  partenza?: ComputoDaLavorazioni;
  incorporato?: boolean;
  suRichiesta?: (richiesta: RichiestaDaLavorazioni) => Promise<void>;
  offerte?: readonly RichiestaDaLavorazioni[];
  onCaricaOfferta?: (offerta: RichiestaDaLavorazioni) => void;
  onOccupato?: (si: boolean) => void;
  onChiudi: () => void; onFatto: () => void;
  onContrattoSalvato?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const vai = useNavigate();
  const { effectiveCompany: azienda } = useAuth();
  const affidamenti = useAffidamentiCommessa(orderId);
  const ditte = useQuery({
    queryKey: ["subappaltatori-per-affidare", companyId],
    staleTime: 5 * 60_000,
    enabled: !dittaFissa,
    queryFn: async (): Promise<Array<{ id: string; ragione_sociale: string; is_active: boolean | null }>> => {
      const { data, error } = await db.from("subappaltatori").select("id, ragione_sociale, is_active").eq("company_id", companyId).order("ragione_sociale").limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const offerta = partenza?.offerta;
  const computoOrigine = offerta ?? partenza?.richiesta;
  const righeOrigine = computoOrigine?.righe.filter((r) => !offerta || offerta.offerta?.prezzi[r.id] != null) ?? [];
  const righeMisurate = righeOrigine.filter((r) => r.ambito.startsWith("v:"));
  const [ditta, setDitta] = useState(dittaFissa?.id ?? "");
  const [comprendeScelto, setComprende] = useState<"posa" | "fornitura_e_posa" | null>(null);
  const comprende = comprendeScelto ?? righeOrigine[0]?.comprende ?? "posa";
  const [cerca, setCerca] = useState("");
  const [mostraListino, setMostraListino] = useState(false);
  const [scadenza, setScadenza] = useState("");
  const [istruzioni, setIstruzioni] = useState("");
  const [scelteManuali, setScelte] = useState<Set<string> | null>(null);
  const operazione = useRef(false);
  const [faseAttiva, setFaseAttiva] = useState("");
  const [dalPrevisto, setDalPrevisto] = useState(computoOrigine?.periodo.dal ?? (partenza?.ambiti.length === 1 && partenza.ambiti[0].al ? partenza.ambiti[0].dal ?? "" : ""));
  const [alPrevisto, setAlPrevisto] = useState(computoOrigine?.periodo.al ?? (partenza?.ambiti.length === 1 && partenza.ambiti[0].dal ? partenza.ambiti[0].al ?? "" : ""));
  const [periodoModificato, setPeriodoModificato] = useState(false);
  const periodoEsplicito = periodoModificato && !!dalPrevisto && !!alPrevisto;
  const periodoValido = !(dalPrevisto || alPrevisto) || (giorniPrevisti(dalPrevisto, alPrevisto, () => true) ?? 0) > 0;
  const soloRichiesta = !!partenza?.soloRichiesta;
  const [extra, setExtra] = useState<LavoroACorpo[]>(() => computoOrigine
    ? righeOrigine.filter((r) => !r.ambito.startsWith("v:")).map((r) => ({
      id: r.id, faseId: r.faseId ?? ALTRI_LAVORI, sottofaseId: r.sottofaseId, descrizione: r.descrizione,
    }))
    : (partenza?.aCorpo ?? []).map((a) => ({ id: a.id, faseId: a.faseId ?? ALTRI_LAVORI, sottofaseId: a.sottofaseId ?? undefined, descrizione: a.nome, importo: "" })));
  const [anteprima, setAnteprima] = useState<
    { tipo: "richiesta"; dati: RichiestaDaLavorazioni } |
    { tipo: "contratto"; dati: AnteprimaSubappalto; firma: boolean; firmaDati: string }
  >();
  const [oneriTesto, setOneri] = useState("");
  const [quantita, setQuantita] = useState<Record<string, string>>(() => Object.fromEntries(righeMisurate.map((r) => [r.ambito.slice(2), casella(r.quantita, 3)])));
  const [prezzi, setPrezzi] = useState<Record<string, string>>({});
  // Il testo della riga nel contratto, se lo si vuole diverso da quello della voce (11/11/2026).
  const [testi, setTesti] = useState<Record<string, string>>(() => Object.fromEntries(righeMisurate.map((r) => [r.ambito.slice(2), r.descrizione])));
  const [inScrittura, setInScrittura] = useState<string | null>(null);
  // Un prezzo per molte righe: uguale per tutte, o il nostro venduto meno una percentuale.
  const [prezzoUnico, setPrezzoUnico] = useState("");
  const [sconto, setSconto] = useState("");
  // Il listino della ditta impara (11/11/2026): i prezzi scritti a mano restano per la prossima volta.
  const { canEditSettingsPricing, canViewOrderAmounts, canViewMargins } = usePermissions();
  const telefono = useIsMobile();
  const [ricorda, setRicorda] = useState(false);
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
  const scelteAutomatiche = useMemo(() => {
    if (partenza) return new Set(partenza.voci);
    const vociConQuote = new Set(lista.map((a) => a.voce_id));
    const fasiConQuote = new Set(voci.filter((v) => vociConQuote.has(v.id)).map((v) => v.phase_id));
    const fasiIntere = new Set(dittaFissa?.fasiIntere?.filter((fase) => !fasiConQuote.has(fase)));
    return new Set([...proprieBozza.keys(), ...libere.filter((v) => fasiIntere.has(v.phase_id)).map((v) => v.id)]);
  }, [dittaFissa?.fasiIntere, libere, lista, proprieBozza, voci, partenza]);
  const scelte = scelteManuali ?? scelteAutomatiche;
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
    enabled: !soloRichiesta && !!ditta && sceltiOrdinati.length > 0,
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
    if (soloRichiesta) return;
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
  }, [sceltiOrdinati, orderId, soloRichiesta]);

  const fasiVisibili = faseAttiva ? gruppi.filter(({ fase }) => fase.id === faseAttiva) : gruppi;
  const prezzoACorpo = (voce: LavoroACorpo) => {
    if (voce.importo != null) return parseAssignmentAmount(voce.importo, 2);
    const r = offerta?.righe.find((riga) => riga.id === voce.id);
    if (!r || r.faseId !== (voce.faseId === ALTRI_LAVORI ? undefined : voce.faseId) || r.sottofaseId !== voce.sottofaseId
      || voce.descrizione.trim() !== r.descrizione.trim() || (comprendeScelto && comprendeScelto !== (r.comprende ?? "posa"))) return null;
    return offerta?.offerta?.prezzi[voce.id] ?? null;
  };
  const extraElenco: RigaElencoLavori[] = extra.map((voce) => {
    const fase = fasi.find((fase) => fase.id === voce.faseId);
    const riga = rigaContrattoACorpo(fase, voce.descrizione, prezzoACorpo(voce) ?? 0);
    const sottofase = sottofasi.find((s) => s.id === voce.sottofaseId && s.phase_id === fase?.id);
    return { ...riga, comprende: comprendeScelto ?? righeOrigine.find((r) => r.id === voce.id)?.comprende ?? comprende, ...(fase ? { allinea_costo_previsto: true } : {}),
      ...(sottofase ? { sottofase_id: sottofase.id, sottofase: sottofase.name } : {}) };
  });
  const extraValidi = extraElenco.every(voce => voce.descrizione && voce.prezzo > 0);
  const sicurezza = oneriTesto.trim() ? parseAssignmentAmount(oneriTesto, 2) : 0;
  const importoACorpo = totaleElencoLavori(extraElenco);
  const quantitaDi = (v: VoceAffidabile) => (quantita[v.id] != null ? parseAssignmentAmount(quantita[v.id], 3) : proprieBozza.get(v.id)?.quantita ?? residuaRiga(v.id));
  // Il prezzo si legge al centesimo («1.250» = 1.250 €); con più decimali si legge lo stesso, e la riga lo segnala.
  const leggiPrezzo = (t: string) => (t.trim() ? parseAssignmentAmount(t, 2) ?? parseAssignmentAmount(t, 4) : null);
  // Quello proposto dal listino si arrotonda al centesimo, come fa il database sulle quote.
  const proposto = (id: string) => { const p = proprieBozza.get(id)?.prezzo_unitario ?? proposti.data?.get(id)?.prezzo; return p == null ? null : Math.round(p * 100) / 100; };
  const comprendeDi = (id: string) => comprendeScelto
    ?? righeMisurate.find((r) => r.ambito === `v:${id}`)?.comprende ?? proprieBozza.get(id)?.comprende ?? comprende;
  const parametroPrezzo = (v: VoceAffidabile) => {
    const r = righeMisurate.find((riga) => riga.ambito === `v:${v.id}`);
    const prezzoOfferto = r ? offerta?.offerta?.prezzi[r.id] : undefined;
    const salvata = proprieBozza.get(v.id);
    return prezzoSubappalto({
      manuale: prezzi[v.id] == null ? undefined : leggiPrezzo(prezzi[v.id]),
      offerta: r && prezzoOfferto != null ? { prezzo: prezzoOfferto, quantita: r.quantita, comprende: r.comprende ?? "posa" } : undefined,
      quantita: r && (testi[v.id] ?? r.descrizione).trim() !== r.descrizione.trim() ? null : quantitaDi(v), comprende: comprendeDi(v.id), proposta: proposti.data?.get(v.id),
      salvato: salvata ? { prezzo: salvata.prezzo_unitario, origine: salvata.origine_prezzo, comprende: salvata.comprende } : undefined,
      esigiPrezzoDitta: !!partenza,
    });
  };
  const prezziPerVoce = new Map(sceltiOrdinati.map((v) => [v.id, parametroPrezzo(v)]));
  const prezzoDi = (id: string) => prezziPerVoce.get(id)?.valore ?? null;
  const righe: RigaTabella[] = sceltiOrdinati.map((v) => ({ voceId: v.id, quantita: quantitaDi(v), prezzo: prezzoDi(v.id),
    descrizione: testi[v.id] ?? null, comprende: comprendeDi(v.id) }));
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
  const righeStima = righe.map((riga) => ({ ...riga, prezzo: proposto(riga.voceId) }));
  const stimaCompleta = righeStima.length > 0 && righeStima.every((riga) => (riga.prezzo ?? 0) > 0);
  const stima = stimaCompleta ? contoTabella(righeStima, voci, residuaRiga, comprende).costo : null;
  const erroreDi = (id: string) => conto.errori.find((e) => e.voceId === id)?.motivo;
  // Un prezzo ancora da scrivere non è un errore: lo diventa solo se resta vuoto. In rosso le cose sbagliate.
  const daScrivere = conto.errori.filter((e) => e.motivo === "Prezzo mancante").length;

  const cambiaScelta = (ids: string[], si: boolean) => setScelte((s) => {
    const n = new Set(s ?? scelteAutomatiche);
    for (const id of ids) { if (si) n.add(id); else n.delete(id); }
    return n;
  });

  const contrattoAttuale = ditta ? contrattoDellaDitta(ditta, contratti, schede) : null;

  /** I prezzi scritti a mano (o presi dal costo nostro) nel listino della ditta; le voci senza listino ci entrano. */
  const ricordaNelListino = async (): Promise<number> => {
    const daRicordare = sceltiOrdinati.filter((v) => {
      const p = prezzoDi(v.id);
      const prop = proposti.data?.get(v.id);
      return (comprendeScelto ?? proprieBozza.get(v.id)?.comprende ?? comprende) === "posa" && p != null && p > 0 && !(prop?.origine === "listino_ditta" && proposto(v.id) === p);
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
      if (!periodoValido) throw new Error("Controlla le date previste.");
      if (!righe.length && !extraElenco.length) throw new Error("Scegli una voce o aggiungi un lavoro a corpo.");
      if (!extraValidi || sicurezza == null) throw new Error("Controlla lavori a corpo e oneri di sicurezza.");
      if (!affidamenti.isSuccess) throw new Error("Gli affidamenti della commessa non sono ancora disponibili.");
      if (conto.errori.length) throw new Error(`${conto.errori.length === 1 ? "Una riga" : `${conto.errori.length} righe`} da sistemare: ${conto.errori[0].motivo.toLowerCase()}.`);
      // Prima si guarda il contratto della ditta: se è firmato o in firma ci si ferma prima di toccare qualcosa.
      let inFirmaOra = false;
      if (contrattoAttuale && !contrattoAttuale.firmato_il) {
        const { data, error } = await db.rpc("contratto_in_firma", { p_contratto: contrattoAttuale.id });
        if (error) throw new Error("Non riesco a sapere se il contratto della ditta è in firma: riprova tra poco.");
        inFirmaOra = data === true;
      }
      if (anteprima?.tipo === "contratto") {
        const { data: correnti, error } = await db.from("contratti_subappalto")
          .select("id, subappaltatore_id, stato, firmato_il, elenco_lavori, importo_contrattuale, oneri_sicurezza, data_inizio, data_fine_prevista")
          .eq("order_id", orderId).eq("company_id", companyId);
        if (error) throw error;
        if (JSON.stringify(contrattoDellaDitta(ditta, correnti ?? [], schede)) !== JSON.stringify(contrattoAttuale)) {
          void qc.invalidateQueries({ queryKey: ["affida-contratto-commessa", companyId, orderId] });
          throw new Error("Il contratto della ditta è cambiato. Aggiorna il computo prima di confermare.");
        }
      }
      const destino = destinoContratto(contrattoAttuale, inFirmaOra);
      if (destino.tipo === "blocca") throw new Error(destino.messaggio);

      // Una bozza storica con importo a corpo e senza elenco ha bisogno prima della sua voce di base.
      if (destino.tipo === "aggiungi" && contrattoAttuale?.importo_contrattuale != null
        && Math.abs(contrattoAttuale.importo_contrattuale - elencoUnito(contrattoAttuale.elenco_lavori, []).importo) > 0.005) {
        throw new Error("Prima completa l’elenco lavori della bozza esistente in «Lavori e prezzi».");
      }

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
        const { error } = await db.rpc("affidamento_modifica", { p_id: proprieBozza.get(r.voceId)!.id, p_quantita: r.quantita, p_comprende: r.comprende ?? comprende });
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
      let elenco = extraElenco;
      if (righe.length) {
        const { data: quote, error: errQ } = await db.from("subappalto_affidamenti")
          .select("id, voce_id, subappaltatore_id, quantita, prezzo_unitario, origine_prezzo, comprende, stato, contratto_id")
          .eq("order_id", orderId).eq("subappaltatore_id", ditta).eq("stato", "bozza");
        if (errQ) throw errQ;
        const collegate = righeContratto(fasi, voci, ((quote ?? []) as AffidamentoPerContratto[]).map((a) => ({ ...a, quantita: Number(a.quantita) })), ditta, righe, sottofasi);
        const richieste = new Map(righe.map(riga => [riga.voceId, riga.quantita]));
        if (collegate.length !== righe.length || collegate.some(riga =>
          Math.abs(riga.quantita - (richieste.get(riga.voce_id ?? "") ?? 0)) > 0.0005))
          throw new Error("Le voci affidate sono cambiate: ricarica la pagina e riprova.");
        elenco = [...collegate, ...extraElenco];
      }

      // 2b. I prezzi scritti a mano entrano nel listino della ditta: la prossima volta arrivano da soli.
      // Non blocca il contratto: se non riesce lo si dice e basta.
      let imparati = 0;
      if (ricorda && canEditSettingsPricing && comprende === "posa") {
        try { imparati = await ricordaNelListino(); } catch { toast.warning("Il contratto si crea, ma i prezzi non sono entrati nel listino della ditta."); }
      }
      // 3. Il contratto: nuovo, o le righe in coda a quello in bozza. I prezzi della tabella vanno sulle quote dal database.
      if (destino.tipo === "aggiungi") {
        // L'elenco si rilegge adesso: qualcuno può averlo cambiato da «Lavori e prezzi» dopo l'apertura del popup.
        const { data: ora, error: errOra } = await db.from("contratti_subappalto").select("elenco_lavori, importo_contrattuale").eq("id", destino.id).single();
        if (errOra) throw errOra;
        if (Math.abs(Number(ora.importo_contrattuale) - elencoUnito(ora.elenco_lavori, []).importo) > 0.005)
          throw new Error("Importo della bozza cambiato. Controlla «Lavori e prezzi» e riprova.");
        const unito = elencoUnito(ora.elenco_lavori, elenco);
        const aggiornamento = db.from("contratti_subappalto")
          .update({ elenco_lavori: unito.elenco, importo_contrattuale: unito.importo,
            ...(periodoEsplicito ? { data_inizio: dalPrevisto, data_fine_prevista: alPrevisto } : {}) })
          .eq("id", destino.id).eq("stato", "bozza").is("firmato_il", null).eq("importo_contrattuale", ora.importo_contrattuale);
        const { data: toccati, error } = await (ora.elenco_lavori == null
          ? aggiornamento.is("elenco_lavori", null)
          : aggiornamento.eq("elenco_lavori", JSON.stringify(ora.elenco_lavori))).select("id");
        if (error) throw error;
        if (!toccati?.length) throw new Error("Il contratto è cambiato nel frattempo: ricarica la pagina e riprova. Le voci restano affidate alla ditta in bozza.");
        return { contrattoId: destino.id, schedaId: contrattoAttuale!.subappaltatore_id, inFirma, nuovo: false, imparati };
      }
      const proprie = schedeSicurezzaDitta(ditta, schede, orderId);
      let schedaId = dittaFissa?.schedaId ?? proprie[0]?.id ?? null;
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
      const faseIds = [...new Set(elenco.flatMap((voce) => voce.fase_id ? [voce.fase_id] : []))];
      const periodo = dalPrevisto && alPrevisto ? { dal: dalPrevisto, al: alPrevisto } : periodoFasi(fasi, faseIds);
      const { data: creato, error: errC } = await db.from("contratti_subappalto").insert({
        company_id: companyId, order_id: orderId, subappaltatore_id: schedaId,
        numero_contratto: ord?.order_code ? `${ord.order_code}/S${String(Math.max(0, ...usati) + 1).padStart(2, "0")}` : null,
        descrizione_lavori: [...new Set(elenco.map((voce) => voce.fase))].join(", "),
        importo_contrattuale: elencoUnito([], elenco).importo, elenco_lavori: elenco,
        data_inizio: periodo.dal, data_fine_prevista: periodo.al,
        stato: "bozza", ritenuta_garanzia_pct: 5, durata_garanzia_mesi: 12, oneri_sicurezza: sicurezza, data_stipula: oggi(),
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
        if (computoOrigine) onContrattoSalvato?.(r.contrattoId);
        vai(`/azienda/subappaltatori/${r.schedaId}?tab=contratto&contratto=${r.contrattoId}&invia=1`);
        return;
      }
      toast.success(r.nuovo ? "Contratto creato in bozza." : "Voci aggiunte al contratto in bozza.");
      onChiudi();
      onContrattoSalvato?.(r.contrattoId);
    },
    onError: (e: Error) => { void qc.invalidateQueries({ queryKey: chiaveAffidamenti(orderId) }); toast.error(e.message || "Contratto non creato."); },
  });

  const nomeDitta = dittaFissa?.nome ?? ditte.data?.find((d) => d.id === ditta)?.ragione_sociale;
  const nomiSottofasi = new Map(sottofasi.map((sottofase) => [sottofase.id, sottofase.name]));
  const richiestaValida = periodoValido && (!scadenza || scadenza >= oggi()) && !!nomeDitta && affidamenti.isSuccess && !!(righe.length || extraElenco.length)
    && conto.errori.every(({ motivo }) => motivo !== "Quantità mancante" && motivo !== "Oltre la quantità libera")
    && extraElenco.every((riga) => riga.descrizione);
  const datiComputo = useMutation({
    mutationFn: async (azione: "richiesta" | "contratto" | "firma") => {
      if (!nomeDitta) throw new Error("Scegli la ditta.");
      if (azione === "richiesta" && !richiestaValida) throw new Error("Controlla lavorazioni e quantità da quotare.");
      const [{ data: ordine, error }, { data: contatti, error: erroreDitta }] = await Promise.all([
        db.from("orders").select("order_code, work_address").eq("id", orderId).eq("company_id", companyId).single(),
        azione === "richiesta" ? db.from("subappaltatori").select("indirizzo,piva,email").eq("id", ditta).eq("company_id", companyId).single()
          : { data: null, error: null },
      ]);
      if (error || erroreDitta) throw error ?? erroreDitta;
      const periodo = dalPrevisto && alPrevisto ? { dal: dalPrevisto, al: alPrevisto }
        : periodoFasi(fasi, [...new Set([...sceltiOrdinati.map((v) => v.phase_id), ...extra.map((r) => r.faseId)])]);
      const base = { commessa: ordine.order_code as string | null, ditta: nomeDitta, periodo };
      if (azione !== "richiesta") {
        const nuove = righe.map((r, indice) => ({
          fase: fasi.find((f) => f.id === sceltiOrdinati[indice].phase_id)?.name ?? "Altri lavori",
          sottofase: nomiSottofasi.get(sceltiOrdinati[indice].subphase_id ?? ""),
          descrizione: r.descrizione?.trim() || sceltiOrdinati[indice].descrizione,
          quantita: r.quantita ?? 0, unita: sceltiOrdinati[indice].unita, comprende: r.comprende,
          prezzo: r.prezzo ?? 0, importo: Math.round((r.quantita ?? 0) * (r.prezzo ?? 0) * 100) / 100,
        }));
        const computo = elencoUnito(contrattoAttuale?.elenco_lavori, [...nuove, ...extraElenco]);
        setAnteprima({ tipo: "contratto", firma: azione === "firma", firmaDati: firmaDati(),
          dati: { ...base, righe: computo.elenco,
            periodo: contrattoAttuale && !periodoEsplicito ? { dal: contrattoAttuale.data_inizio ?? null, al: contrattoAttuale.data_fine_prevista ?? null } : periodo,
            contratto: { imponibile: computo.importo, oneri } } });
        return;
      }
      const dati: RichiestaDaLavorazioni = {
        ...base, id: crypto.randomUUID(), dittaId: ditta, creataIl: new Date().toISOString(),
        luogo: ordine.work_address, scadenza: scadenza || null, istruzioni: istruzioni.trim() || null,
        destinatario: contatti ? { indirizzo: contatti.indirizzo, partitaIva: contatti.piva, email: contatti.email } : undefined,
        righe: [
          ...sceltiOrdinati.map((voce, indice) => ({
            id: voce.id, ambito: `v:${voce.id}`, faseId: voce.phase_id, sottofaseId: voce.subphase_id ?? undefined,
            fase: fasi.find((fase) => fase.id === voce.phase_id)?.name ?? "Altri lavori",
            sottofase: nomiSottofasi.get(voce.subphase_id ?? ""),
            descrizione: testi[voce.id]?.trim() || voce.descrizione, quantita: righe[indice].quantita ?? 0,
            unita: voce.unita, comprende: righe[indice].comprende,
          })),
          ...extraElenco.map(({ fase, sottofase, descrizione, quantita, unita, comprende }, indice) => {
            const voce = extra[indice];
            return { id: voce.id, ambito: voce.sottofaseId ? `s:${voce.sottofaseId}` : voce.faseId,
              faseId: voce.faseId === ALTRI_LAVORI ? undefined : voce.faseId, sottofaseId: voce.sottofaseId,
              fase, sottofase, descrizione, quantita, unita, comprende };
          }),
        ],
      };
      setAnteprima({ tipo: "richiesta", dati });
    },
    onError: (e: Error) => toast.error(e.message || "Non riesco a preparare il computo. Riprova."),
  });
  const scarica = useMutation({
    mutationFn: async (dati: RichiestaDaLavorazioni) => {
      const { scaricaComputoRichiesta } = await import("@/lib/subappaltatori/richiestaOffertaPdf");
      if (!azienda || azienda.id !== companyId) throw new Error("Azienda non disponibile.");
      await scaricaComputoRichiesta(dati, azienda);
    },
    onError: () => toast.error("Non riesco a scaricare il computo. Riprova."),
  });
  const salvaRichiesta = useMutation({
    mutationFn: async (dati: RichiestaDaLavorazioni) => suRichiesta?.(dati),
    onError: (e: Error) => toast.error(e.message || "Non riesco a salvare la richiesta nella commessa."),
  });
  const occupato = crea.isPending || datiComputo.isPending || scarica.isPending || salvaRichiesta.isPending;
  const conteggio = righe.length + extra.length;
  const oneri = contrattoAttuale ? Number(contrattoAttuale.oneri_sicurezza) || 0 : sicurezza ?? 0;
  const firmaDati = () => JSON.stringify([ditta, righe, extraElenco, contrattoAttuale, oneri, dalPrevisto, alPrevisto]);
  useEffect(() => { onOccupato?.(occupato); return () => onOccupato?.(false); }, [occupato, onOccupato]);
  const nonSalvabile = !periodoValido || occupato || !ditta || !conteggio || !affidamenti.isSuccess || !extraValidi
    || sicurezza == null || conto.errori.length > 0 || !!contrattoAttuale?.firmato_il;
  const cambiaDitta = (id: string) => {
    setDitta(id);
    setScelte(null);
    setPrezzi({});
    setQuantita({});
    setTesti({});
    setComprende(null);
    if (!soloRichiesta && !partenza?.aCorpo?.length) setExtra([]);
    setOneri("");
  };
  const aggiungiACorpo = () => {
    const fasiScelte = [...new Set(sceltiOrdinati.map((voce) => voce.phase_id))];
    const ambito = partenza?.ambiti.length === 1 ? partenza.ambiti[0] : undefined;
    const macrofase = faseAttiva || (fasiScelte.length === 1 ? fasiScelte[0] : "") || ambito?.faseId || (fasi.length === 1 ? fasi[0].id : ALTRI_LAVORI);
    setExtra((lavori) => [...lavori, {
      id: crypto.randomUUID(), faseId: macrofase,
      sottofaseId: ambito?.faseId === macrofase ? ambito.sottofaseId ?? undefined : undefined,
      descrizione: ambito?.faseId === macrofase ? ambito.nome : "", importo: "",
    }]);
  };
  const cambiaExtra = (id: string, patch: Partial<LavoroACorpo>) =>
    setExtra(lista => lista.map(voce => voce.id === id ? { ...voce, ...patch } : voce));

  const avviaAzione = (azione: () => Promise<unknown>) => {
    if (operazione.current) return;
    operazione.current = true;
    void azione().catch(() => { /* Esito mostrato dalla mutazione. */ }).finally(() => { operazione.current = false; });
  };

  const NavigazioneComputo = incorporato ? SoloContenutoComputo : MacrofasiSubappalto;
  const contenuto = anteprima ? (
    <div className="min-h-0 space-y-3 overflow-y-auto">
      {!incorporato && <DialogHeader><DialogTitle>Anteprima computo</DialogTitle><DialogDescription>Controlla il documento destinato alla ditta.</DialogDescription></DialogHeader>}
      <ComputoSubappaltoAnteprima dati={anteprima.dati} richiesta={anteprima.tipo === "richiesta" ? anteprima.dati : undefined} />
      {anteprima.tipo === "contratto" && anteprima.firmaDati !== firmaDati() &&
        <p role="alert" className="text-sm text-amber-800">Il computo è cambiato. Torna alle voci e rivedi l’anteprima.</p>}
      <AzioniLavorazioni><div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={occupato} onClick={() => setAnteprima(undefined)}>Torna alle voci</Button>
        {anteprima.tipo === "richiesta" ? <>
          <Button variant="outline" disabled={occupato} onClick={() => avviaAzione(() => scarica.mutateAsync(anteprima.dati))}><Download className="mr-1 h-4 w-4" />Scarica PDF</Button>
          {suRichiesta && <Button disabled={occupato} onClick={() => avviaAzione(() => salvaRichiesta.mutateAsync(anteprima.dati))}>
            {salvaRichiesta.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salva richiesta
          </Button>}
        </> : <Button disabled={nonSalvabile || anteprima.firmaDati !== firmaDati()} onClick={() => avviaAzione(() => crea.mutateAsync(anteprima.firma))}>
          {crea.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {anteprima.firma ? "Conferma e apri la firma" : "Salva bozza contratto"}
        </Button>}
      </div></AzioniLavorazioni>
    </div>
  ) : (
    <>
        {mostraListino && nomeDitta && <Dialog open onOpenChange={(o) => !o && setMostraListino(false)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
            <DialogHeader><DialogTitle>Listino della ditta</DialogTitle><DialogDescription>Prezzi associati alle voci del listino.</DialogDescription></DialogHeader>
            <Suspense fallback={<p role="status">Carico il listino…</p>}><ListinoDitta companyId={companyId} anagraficaId={ditta} nomeDitta={nomeDitta} consultazione /></Suspense>
          </DialogContent>
        </Dialog>}
        {!incorporato && <DialogHeader>
          <DialogTitle>{dittaFissa ? "Nuovo contratto di subappalto" : "Prezzi e contratto di subappalto"}</DialogTitle>
          <DialogDescription>Scegli le voci da quotare. Confermando i prezzi aggiorni il costo previsto e prepari il computo del contratto.</DialogDescription>
        </DialogHeader>}

        <div className="flex flex-wrap items-center gap-2">
          {dittaFissa ? <p className="px-1 text-sm font-medium">{dittaFissa.nome}</p> : <OfficeSelect label="Ditta" className="h-9 min-w-[12rem] flex-1" value={ditta} onValueChange={cambiaDitta} placeholder="Scegli la ditta"
            options={(ditte.data ?? []).filter((d) => d.is_active !== false).map((d) => ({ value: d.id, label: d.ragione_sociale }))} />}
          <OfficeSelect label="Cosa comprende il prezzo" className="h-9 w-44" value={comprendeScelto ?? (partenza ? comprende : "")} placeholder="Cosa comprende" onValueChange={(c) => setComprende(c as typeof comprende)}
            options={[{ value: "posa", label: "Solo posa" }, { value: "fornitura_e_posa", label: "Fornitura e posa" }]} />
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca voce o fase" className="h-9 pl-8" aria-label="Cerca voce o fase" />
          </div>
        </div>
        {incorporato && <OfficeSelect label="Fase del computo" className="h-8 max-w-xs" value={faseAttiva} onValueChange={setFaseAttiva}
          options={[{ value: "", label: "Tutte le fasi del computo" }, ...fasi.map((f) => ({ value: f.id, label: f.name }))]} />}
        {partenza && <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
          <label className="space-y-1 text-sm">Inizio previsto<Input type="date" value={dalPrevisto} disabled={occupato}
            onChange={(e) => { setPeriodoModificato(true); setDalPrevisto(e.target.value); }} /></label>
          <label className="space-y-1 text-sm">Fine prevista<Input type="date" value={alPrevisto} min={dalPrevisto || undefined} disabled={occupato}
            onChange={(e) => { setPeriodoModificato(true); setAlPrevisto(e.target.value); }} /></label>
          <p className="text-xs text-muted-foreground">{soloRichiesta ? "Il periodo compare nel computo per la ditta." : contrattoAttuale && periodoEsplicito ? "Salvando aggiorni anche il periodo della bozza." : "Il periodo indicato compare nella richiesta d’offerta e nella nuova bozza."}</p>
          {!periodoValido && <p role="alert" className="text-sm text-destructive">Indica entrambe le date in ordine cronologico.</p>}
        </div>}
        {partenza && ditta && scelteManuali === null && scelte.size > sceltiOrdinati.length && affidamenti.isSuccess && (
          <p role="status" className="text-xs text-amber-800">{scelte.size - sceltiOrdinati.length} voci selezionate senza quantità disponibile.</p>
        )}
        {!soloRichiesta && contrattoAttuale && !contrattoAttuale.firmato_il && <p className="text-xs text-muted-foreground">La ditta ha già un contratto in bozza su questa commessa: le voci scelte si aggiungono a quello.</p>}
        {!soloRichiesta && contrattoAttuale?.firmato_il && <p role="alert" className="text-xs text-amber-800">La ditta ha già un contratto firmato su questa commessa: le voci in più vanno con «Variante sulle voci».</p>}

        {!soloRichiesta && partenza && ditta && <section className="space-y-2 rounded-lg border bg-slate-50 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold">Prezzi del computo</h4>
            <Button type="button" variant="outline" size="sm" onClick={() => setMostraListino(true)}>Vedi listino ditta</Button>
          </div>
          {offerta ? <p>Computo dall’offerta del {offerta.offerta?.data.split("-").reverse().join("/")}{offerta.offerta?.riferimento ? ` · ${offerta.offerta.riferimento}` : ""}.</p>
            : <p className="text-muted-foreground">{computoOrigine ? "Voci e quantità riprese dalla richiesta. " : ""}Le voci di sola posa collegate al listino si precompilano. Per le altre inserisci il prezzo concordato o carica un’offerta.</p>}
          {computoOrigine?.istruzioni && <p className="whitespace-pre-wrap text-muted-foreground">Istruzioni della richiesta · {computoOrigine.istruzioni}</p>}
          {proposti.isError && <p role="alert" className="text-amber-900">Prezzi del listino non disponibili. <Button variant="link" onClick={() => void proposti.refetch()}>Riprova</Button></p>}
          {!offerta && offerte?.some((r) => r.dittaId === ditta) && <div className="flex flex-wrap gap-2" aria-label="Offerte della ditta">
            {offerte.filter((r) => r.dittaId === ditta).map((r) => <Button key={r.id} size="sm" variant="outline" onClick={() => onCaricaOfferta?.(r)}>
              Usa offerta {r.offerta?.riferimento || r.offerta?.data.split("-").reverse().join("/")}
            </Button>)}
          </div>}
        </section>}
        {soloRichiesta && <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
          <label className="space-y-1 text-sm">Risposta entro<Input type="date" value={scadenza} min={oggi()} onChange={(e) => setScadenza(e.target.value)} /></label>
          <label className="min-w-[14rem] flex-1 space-y-1 text-sm">Istruzioni alla ditta<Textarea rows={2} maxLength={3000} value={istruzioni}
            onChange={(e) => setIstruzioni(e.target.value)} placeholder="Es. accesso al cantiere, protezioni e smaltimento da includere" /></label>
          {scadenza && scadenza < oggi() && <p role="alert" className="basis-full text-sm text-destructive">Indica una data di risposta da oggi in poi.</p>}
        </div>}
        {!soloRichiesta && ditta && sceltiOrdinati.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs">
            <span className="font-medium">Prezzo per più righe:</span>
            <Input aria-label="Prezzo uguale per le righe" inputMode="decimal" placeholder="€" value={prezzoUnico} onChange={(e) => setPrezzoUnico(e.target.value)} className="h-7 w-20 text-right" />
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={!(parseAssignmentAmount(prezzoUnico, 2) ?? 0)}
              onClick={() => applicaPrezzi(() => parseAssignmentAmount(prezzoUnico, 2), false)}>a quelle senza prezzo</Button>
            {canViewOrderAmounts && <>
            <span className="text-muted-foreground">oppure il nostro venduto meno</span>
            <Input aria-label="Percentuale da togliere al venduto" inputMode="decimal" placeholder="%" value={sconto} onChange={(e) => setSconto(e.target.value)} className="h-7 w-16 text-right" />
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={parseAssignmentAmount(sconto, 2) == null || !sconto.trim()}
              onClick={() => applicaPrezzi((v) => prezzoDalVenduto(v, parseAssignmentAmount(sconto, 2) ?? -1), false)}>a quelle senza prezzo</Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={parseAssignmentAmount(sconto, 2) == null || !sconto.trim()}
              title="Sostituisce anche i prezzi già scritti o presi dal listino"
              onClick={() => applicaPrezzi((v) => prezzoDalVenduto(v, parseAssignmentAmount(sconto, 2) ?? -1), true)}>a tutte</Button></>}
          </div>
        )}
        {affidamenti.isError && <p role="alert" className="text-sm text-destructive">Affidamenti non disponibili. <Button variant="link" onClick={() => void affidamenti.refetch()}>Riprova</Button></p>}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavigazioneComputo attiva={faseAttiva} onSeleziona={setFaseAttiva} fasi={[
            ...fasi.map(fase => ({ id: fase.id, nome: fase.name, voci: (gruppi.find(g => g.fase.id === fase.id)?.voci.length ?? 0) + extra.filter(voce => voce.faseId === fase.id).length })),
            ...(extra.some(voce => voce.faseId === ALTRI_LAVORI) ? [{ id: ALTRI_LAVORI, nome: "Altri lavori", voci: extra.filter(voce => voce.faseId === ALTRI_LAVORI).length }] : []),
          ]}>
          <div className="overflow-x-auto rounded-md border">
          {affidamenti.isLoading ? <p className="p-3 text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" />Caricamento…</p> : (
            telefono ? (
              // Sul telefono una voce è una scheda di due righe: cosa e quanto resta, poi quantità, prezzo e importo.
              <ul className="divide-y text-sm">
                {fasiVisibili.map(({ fase, voci: vf }) => {
                  const ids = vf.map((v) => v.id);
                  return [
                    <li key={fase.id} className="flex items-center gap-2 bg-muted/40 px-2 py-1.5 text-xs font-medium">
                      <Checkbox checked={ids.every((id) => scelte.has(id))} aria-label={`Scegli tutte le voci di ${fase.name}`} onCheckedChange={(c) => cambiaScelta(ids, c === true)} />
                      <span className="min-w-0 flex-1 truncate">{fase.name}</span><span className="font-normal text-muted-foreground">{vf.length}</span>
                    </li>,
                    ...vf.map((v) => {
                      const si = scelte.has(v.id);
                      const a = ai[v.id];
                      const erroreRiga = si ? erroreDi(v.id) : undefined;
                      const errore = soloRichiesta && erroreRiga === "Prezzo mancante" ? undefined : erroreRiga;
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
                                value={quantita[v.id] ?? casella(quantitaDi(v), 3)} onChange={(e) => setQuantita((x) => ({ ...x, [v.id]: e.target.value }))} />
                              {!soloRichiesta && <>
                              <span className="text-xs text-muted-foreground">×</span>
                              <Input aria-label={`Prezzo di ${v.descrizione}`} inputMode="decimal" className="h-9 w-24 text-right tabular-nums" placeholder={ditta ? "€" : "ditta?"}
                                disabled={!ditta} value={prezzi[v.id] ?? casella(prezzoDi(v.id))} onChange={(e) => setPrezzi((x) => ({ ...x, [v.id]: e.target.value }))} />
                              <span className="ml-auto text-right tabular-nums">{formatCurrency(Math.round(q * pr * 100) / 100)}</span>
                              </>}
                            </div>
                          )}
                          {si && !grave && q > 0 && <p className="pl-6 text-xs text-muted-foreground">Restano {qt(residuaRiga(v.id) - q)} {v.unita ?? ""}</p>}
                          {v.subphase_id && nomiSottofasi.has(v.subphase_id) && <p className="text-xs text-muted-foreground">{nomiSottofasi.get(v.subphase_id)}</p>}
                          {si && (!soloRichiesta || errore || (!v.tariffa_id && a && !a.confermata)) && (
                            <div className="pl-6 text-[11px]">
                              {(errore || !soloRichiesta) && <span className={errore ? (grave ? "text-red-800" : "text-amber-800") : "text-muted-foreground"}>{grave ? errore : prezziPerVoce.get(v.id)?.fonte}</span>}
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
                {fasiVisibili.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">Nessuna voce libera.</li>}
              </ul>
            ) : (
            <table className={`w-full table-fixed text-sm ${soloRichiesta ? "min-w-[25rem]" : "min-w-[46rem]"}`}>
              <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="w-8 px-2 py-1.5" />
                  <th className="px-1 py-1.5 text-left font-medium">Voce</th>
                  <th className="w-24 px-1 py-1.5 text-right font-medium">Disponibile</th>
                  <th className="w-28 px-1 py-1.5 text-right font-medium">Quantità</th>
                  {!soloRichiesta && <>
                  <th className="w-28 px-1 py-1.5 text-right font-medium">Prezzo concordato</th>
                  <th className="w-36 px-1 py-1.5 text-left font-medium">Da dove</th>
                  <th className="w-28 px-2 py-1.5 text-right font-medium">Importo</th>
                  </>}
                </tr>
              </thead>
              <tbody>
                {fasiVisibili.map(({ fase, voci: vf }) => {
                  const ids = vf.map((v) => v.id);
                  const tutte = ids.every((id) => scelte.has(id));
                  return [
                    <tr key={fase.id} className="border-t bg-muted/40">
                      <td className="px-2 py-1"><Checkbox checked={tutte} aria-label={`Scegli tutte le voci di ${fase.name}`} onCheckedChange={(c) => cambiaScelta(ids, c === true)} /></td>
                      <td colSpan={soloRichiesta ? 3 : 6} className="px-1 py-1 text-xs font-medium">{fase.name} <span className="font-normal text-muted-foreground">· {vf.length} {vf.length === 1 ? "voce libera" : "voci libere"}</span></td>
                    </tr>,
                    ...vf.map((v) => {
                      const si = scelte.has(v.id);
                      const fonte = prezziPerVoce.get(v.id)?.fonte;
                      const a = ai[v.id];
                      const erroreRiga = si ? erroreDi(v.id) : undefined;
                      const errore = soloRichiesta && erroreRiga === "Prezzo mancante" ? undefined : erroreRiga;
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
                            {v.subphase_id && nomiSottofasi.has(v.subphase_id) && <p className="truncate text-xs text-muted-foreground">{nomiSottofasi.get(v.subphase_id)}</p>}
                          </td>
                          <td className="whitespace-nowrap px-1 py-1 text-right text-xs tabular-nums text-muted-foreground">{qt(residuaRiga(v.id))} {v.unita ?? ""}{si && q > 0 && q <= residuaRiga(v.id) && <span className="block">Restano {qt(residuaRiga(v.id) - q)} {v.unita ?? ""}</span>}</td>
                          <td className="px-1 py-1">
                            {si && <Input aria-label={`Quantità di ${v.descrizione}`} inputMode="decimal" className="h-8 text-right tabular-nums"
                              value={quantita[v.id] ?? casella(quantitaDi(v), 3)} onChange={(e) => setQuantita((s) => ({ ...s, [v.id]: e.target.value }))} />}
                          </td>
                          {!soloRichiesta && <>
                          <td className="px-1 py-1">
                            {si && <Input aria-label={`Prezzo di ${v.descrizione}`} inputMode="decimal" className="h-8 text-right tabular-nums" placeholder={ditta ? "—" : "ditta?"}
                              disabled={!ditta} value={prezzi[v.id] ?? casella(prezzoDi(v.id))} onChange={(e) => setPrezzi((s) => ({ ...s, [v.id]: e.target.value }))} />}
                          </td>
                          <td className="px-1 py-1 text-[11px] leading-tight">
                            {si && <span className={errore ? (grave ? "text-red-800" : "text-amber-800") : "text-muted-foreground"}>
                              {grave ? errore : fonte}
                            </span>}
                            {si && !v.tariffa_id && a && (
                              a.confermata
                                ? <Badge variant="outline" className="ml-1 h-4 border-violet-300 bg-violet-50 px-1 text-[10px] font-normal text-violet-900" title={nomiProposti.data?.get(a.tariffaId) ?? undefined}>listino</Badge>
                                : <button type="button" className="mt-0.5 block max-w-full truncate rounded border border-violet-300 bg-violet-50 px-1 text-left text-[10px] text-violet-900" title={`Nel listino: ${a.perche || "proposta da verificare"}`}
                                    onClick={() => setAi((x) => ({ ...x, [v.id]: { ...a, confermata: true } }))}>è «{nomiProposti.data?.get(a.tariffaId) ?? "…"}»{a.certezza === "media" ? " (dubbio)" : ""}? Sì</button>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">{si ? formatCurrency(Math.round(q * pr * 100) / 100) : ""}</td>
                          </>}
                        </tr>
                      );
                    }),
                  ];
                })}
                {fasiVisibili.length === 0 && <tr><td colSpan={soloRichiesta ? 4 : 7} className="px-3 py-4 text-sm text-muted-foreground">{voci.length ? "Nessuna voce disponibile per la selezione corrente." : "La commessa non ha voci: si affidano le voci del computo o del preventivo."}</td></tr>}
              </tbody>
            </table>
            )
          )}
          </div>
          <div className="mt-2 space-y-2">
            {extra.map((voce, indice) => (!faseAttiva || voce.faseId === faseAttiva) && (
              <div key={voce.id} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-[minmax(7rem,1fr)_minmax(10rem,2fr)_7rem_auto]">
                <div className="min-w-0 space-y-1.5">
                  <OfficeSelect label={`Macrofase lavoro a corpo ${indice + 1}`} value={voce.faseId} className="w-full"
                    options={[...fasi.map(fase => ({ value: fase.id, label: fase.name })), { value: ALTRI_LAVORI, label: "Senza macrofase" }]}
                    onValueChange={faseId => { cambiaExtra(voce.id, { faseId, sottofaseId: undefined }); if (faseAttiva) setFaseAttiva(faseId); }} />
                  {sottofasi.some(s => s.phase_id === voce.faseId) && (
                    <OfficeSelect label={`Sottofase lavoro a corpo ${indice + 1}`} value={voce.sottofaseId ?? ""} className="w-full"
                      placeholder="Sottofase facoltativa" options={sottofasi.filter(s => s.phase_id === voce.faseId).map(s => ({ value: s.id, label: s.name }))}
                      onValueChange={sottofaseId => cambiaExtra(voce.id, { sottofaseId })} />
                  )}
                </div>
                <Input value={voce.descrizione} aria-label={`Descrizione lavoro a corpo ${indice + 1}`} placeholder="Descrizione del lavoro"
                  onChange={e => cambiaExtra(voce.id, { descrizione: e.target.value })} />
                {!soloRichiesta && <Input value={voce.importo ?? casella(prezzoACorpo(voce))} aria-label={`Importo a corpo ${indice + 1}`} inputMode="decimal" placeholder="Importo €"
                  onChange={e => cambiaExtra(voce.id, { importo: e.target.value })} />}
                <Button type="button" size="icon" variant="ghost" aria-label={`Togli lavoro a corpo ${indice + 1}`}
                  onClick={() => setExtra(lista => lista.filter(riga => riga.id !== voce.id))}><Trash2 className="size-4" /></Button>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={aggiungiACorpo}>
              <Plus className="mr-1 size-4" /> Aggiungi lavoro a corpo
            </Button>
          </div>
          </NavigazioneComputo>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-sm">
          <span>{conteggio} {conteggio === 1 ? "voce" : "voci"}{nomeDitta ? ` a ${nomeDitta}` : ""}</span>
          {!soloRichiesta && <>
          {canViewOrderAmounts && conto.venduto > 0 && <span>Venduto al cliente <strong className="tabular-nums">{formatCurrency(conto.venduto)}</strong></span>}
          {stima != null && Math.abs(stima - conto.costo - importoACorpo) >= 0.01 && <span>Stima di partenza <strong className="tabular-nums">{formatCurrency(stima)}</strong></span>}
          <span>Costo ditta <strong className="tabular-nums">{formatCurrency(conto.costo + importoACorpo)}</strong> <span className="text-xs text-muted-foreground">netto IVA</span></span>
          {!contrattoAttuale && <label className="flex items-center gap-2 text-xs">Oneri di sicurezza
            <Input className="h-8 w-24 text-right tabular-nums" inputMode="decimal" placeholder="0,00 €"
              value={oneriTesto} onChange={e => setOneri(e.target.value)} aria-invalid={sicurezza == null} />
          </label>}
          {!contrattoAttuale && oneri > 0 && <span>Totale con oneri <strong>{formatCurrency(conto.costo + importoACorpo + oneri)}</strong></span>}
          {daScrivere > 0
            ? <span className="text-amber-800">{daScrivere === 1 ? "1 prezzo da scrivere" : `${daScrivere} prezzi da scrivere`}</span>
            : canViewOrderAmounts && canViewMargins && conto.venduto > 0 && <span className={conto.margine - importoACorpo < 0 ? "text-destructive" : "text-muted-foreground"}>Margine {formatCurrency(conto.margine - importoACorpo)}{conto.marginePct != null && !importoACorpo ? ` (${conto.marginePct.toLocaleString("it-IT")}%)` : ""}</span>}
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
          </>}
          <AzioniLavorazioni><span className="flex w-full flex-wrap justify-end gap-2 sm:ml-auto sm:w-auto">
            <Button variant={soloRichiesta ? "default" : "outline"} disabled={occupato || !richiestaValida} onClick={() => avviaAzione(() => datiComputo.mutateAsync("richiesta"))}>
              {datiComputo.isPending && datiComputo.variables === "richiesta" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />} {soloRichiesta ? "Anteprima richiesta" : "Richiesta d’offerta"}
            </Button>
            {!soloRichiesta && <>
            <Button variant="outline" className="max-sm:flex-1" disabled={nonSalvabile} onClick={() => avviaAzione(() => incorporato ? datiComputo.mutateAsync("contratto") : crea.mutateAsync(false))}>
              {crea.isPending && crea.variables === false && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{contrattoAttuale && !contrattoAttuale.firmato_il ? "Conferma e aggiungi" : "Conferma prezzi e crea bozza"}
            </Button>
            <Button className="max-sm:flex-1" disabled={nonSalvabile} onClick={() => avviaAzione(() => incorporato ? datiComputo.mutateAsync("firma") : crea.mutateAsync(true))}>
              {crea.isPending && crea.variables === true ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}{telefono ? "Manda in firma" : contrattoAttuale && !contrattoAttuale.firmato_il ? "Aggiungi e manda in firma" : "Crea e manda in firma"}
            </Button>
            </>}
          </span></AzioniLavorazioni>
        </div>
    </>
  );
  if (incorporato) return <div className="space-y-3">{contenuto}</div>;
  return (
    <Dialog open onOpenChange={(o) => !o && !occupato && onChiudi()}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-3 sm:max-w-6xl">{contenuto}</DialogContent>
    </Dialog>
  );
}

/**
 * Lo stesso popup aperto da «Altre azioni» in cima alla commessa (11/11/2026): legge da sé fasi, voci,
 * contratti e schede delle ditte, che nel pannello «Ditte e contratti» arrivano già caricati.
 */
export function AffidaContrattoDaCommessa({ orderId, companyId, dittaFissa, partenza, incorporato, suRichiesta, offerte, onCaricaOfferta, onOccupato, onChiudi, onContrattoSalvato }: {
  orderId: string; companyId: string; dittaFissa?: DittaContratto;
  partenza?: ComputoDaLavorazioni; incorporato?: boolean; suRichiesta?: (richiesta: RichiestaDaLavorazioni) => Promise<void>;
  offerte?: readonly RichiestaDaLavorazioni[]; onCaricaOfferta?: (offerta: RichiestaDaLavorazioni) => void;
  onOccupato?: (si: boolean) => void;
  onChiudi: () => void; onContrattoSalvato?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const voci = useVociPrevisteFasi(orderId, true);
  const dati = useDatiAffidaContratto(orderId, companyId);
  const errore = dati.isError || voci.isError;
  useEffect(() => {
    if (!errore || incorporato) return;
    toast.error("Non riesco a leggere fasi e voci della commessa.");
    onChiudi();
  }, [errore, incorporato, onChiudi]);
  if (errore) return incorporato ? <div role="alert" className="space-y-2">
    <p>Non riesco a leggere fasi e voci della commessa.</p>
    <Button size="sm" variant="outline" onClick={() => { void dati.refetch(); void voci.refetch(); }}>Riprova</Button>
  </div> : null;
  if (!dati.data || !voci.data) {
    if (incorporato) return <p role="status" className="text-sm text-muted-foreground">Carico il computo della commessa…</p>;
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
    <AffidaContrattoDialog orderId={orderId} companyId={companyId} fasi={dati.data.fasi} sottofasi={dati.data.sottofasi} voci={voci.data as VoceAffidabile[]}
      contratti={dati.data.contratti} schede={dati.data.schede} dittaFissa={dittaFissa} partenza={partenza} incorporato={incorporato} suRichiesta={suRichiesta} offerte={offerte} onCaricaOfferta={onCaricaOfferta} onOccupato={onOccupato} onChiudi={onChiudi} onContrattoSalvato={onContrattoSalvato}
      onFatto={() => {
        void qc.invalidateQueries({ queryKey: ["affida-contratto-commessa", companyId, orderId] });
        void qc.invalidateQueries({ queryKey: ["ditte-contratti-commessa", companyId, orderId] });
        void qc.invalidateQueries({ queryKey: chiaveAffidamenti(orderId) });
        void qc.invalidateQueries({ queryKey: chiaveVociPreviste(companyId, orderId) });
        refreshWorkQueries(qc, orderId, companyId);
      }} />
  );
}
