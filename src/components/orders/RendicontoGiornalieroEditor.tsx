/**
 * Editor del rendiconto giornaliero (27/11/2026): data, lavori del giorno, righe per categoria coi prezzi.
 * Stessa veste del rapportino dell'ufficio (RapportiniUfficio): stessa finestra, stessi blocchi titolati,
 * stessa riga «nome + valore»; in più le colonne del prezzo e dell'importo.
 * Il prezzo lo decide il database: dopo ogni salvataggio si rilegge. Chi scrive un prezzo a mano lo segna
 * (prezzo_a_mano) e il listino non lo riscrive più. Conferma rifiuta le righe senza prezzo.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, Plus, RefreshCw, Save, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OfficeSelect } from "@/components/orders/OfficeSelect";
import { Blocco } from "@/components/orders/BloccoTitolato";
import { supabase } from "@/integrations/supabase/client";
import { useOrderWorkPhases } from "@/hooks/useOrderWorkPhases";
import { useMezzi } from "@/hooks/useMezzi";
import { PulsantePdfRendiconto } from "@/components/orders/PulsantePdfRendiconto";
import { CercaVoceRendiconto } from "@/components/orders/CercaVoceRendiconto";
import { AvanzamentoDelGiorno } from "@/components/orders/AvanzamentoDelGiorno";
import { leggiLavorazioniDelGiorno } from "@/lib/rendiconti/avanzamentoDelGiorno";
import { siMisuraSulComputo } from "@/lib/orders/modalitaLavoro";
import { avvisoUnita } from "@/components/orders/CercaNelListino";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { leggiDestinatarioRapporto } from "@/lib/documentiOperativi/destinatarioRapporto";
import { formatCurrency } from "@/lib/formatters";
import { messaggioErrore } from "@/lib/messaggioErrore";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import type { VoceListino } from "@/lib/campo/prezzoVoceRapportino";
import {
  CAMPI_VIAGGIO_RENDICONTO, CATEGORIE, ETICHETTA_FONTE, annullaRendiconto, campiDaPredefinita, vociPredefinite, chiaveRiga, confermaRendiconto, elencoRendiconti, importoRiga, leggiRendiconto,
  puoCopiare, rendicontoCopia, rendicontoDelGiorno, riapriRendiconto, salvaPrezzoPerCommittente, salvaRendiconto, senzaPrezzo,
  mezzoCollegaVoce, vociSuggeriteMezzo, leggiIvaRendiconto, salvaIvaRendiconto, totaleConIva,
  type CategoriaRiga, type RigaRendiconto, type StatoRendiconto, type ViaggioRendiconto, type VoceListinoCommittente,
} from "@/lib/rendiconti/rendicontiGiornalieri";

const oggi = () => new Date().toLocaleDateString("en-CA");

/** Campo numero che si scrive con la virgola: tiene il testo, comunica il numero quando è valido. */
function Numero({ valore, onCambia, etichetta, className, disabled }: {
  valore: number | null; onCambia: (n: number) => void; etichetta: string; className?: string; disabled?: boolean;
}) {
  const [testo, setTesto] = useState(valore == null ? "" : String(valore).replace(".", ","));
  // Il valore cambia da fuori (rilettura dal database): il testo lo segue, salvo che dica già lo stesso numero.
  const [precedente, setPrecedente] = useState(valore);
  if (valore !== precedente) {
    setPrecedente(valore);
    if (valore != null && Number(testo.replace(",", ".")) !== valore) setTesto(String(valore).replace(".", ","));
  }
  return (
    <Input aria-label={etichetta} inputMode="decimal" disabled={disabled} className={className} value={testo}
      onChange={(e) => {
        setTesto(e.target.value);
        const n = Number(e.target.value.replace(",", "."));
        if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= 0) onCambia(n);
      }} />
  );
}

/** La riga di un viaggio appena aggiunto: prezzo da scrivere, i campi del viaggio pronti. */
function rigaViaggioNuova(descrizione: string): RigaRendiconto {
  return {
    chiave: chiaveRiga(), categoria: "trasporto", descrizione, unita: "viaggio", quantita: 1,
    prezzo_unitario: null, prezzo_a_mano: false, prezzo_fonte: null, listino_voce_id: null,
    appalto_tariffa_id: null, employee_id: null, subappaltatore_id: null, mezzo_id: null, fase_id: null,
    da_rapportino_id: null, maggiorazione_pct: 0, note: null,
    voce_computo_id: null, extra_contratto: false, viaggio: {},
  };
}

interface Props {
  orderId: string;
  /** null: rendiconto nuovo. */
  rendicontoId: string | null;
  puoModificare: boolean;
  /** «Rendiconto trasporti»: il foglio nasce con un viaggio già pronto da compilare. */
  partiDaTrasporti?: boolean;
  onClose: () => void;
}

export function RendicontoGiornalieroEditor({ orderId, rendicontoId, puoModificare, partiDaTrasporti = false, onClose }: Props) {
  const tr = useT();
  const qc = useQueryClient();
  const [id, setId] = useState<string | null>(rendicontoId);
  const [stato, setStato] = useState<StatoRendiconto>("bozza");
  const [numero, setNumero] = useState<number | null>(null);
  const [data, setData] = useState(oggi());
  const [lavori, setLavori] = useState("");
  const [note, setNote] = useState("");
  const [righe, setRighe] = useState<RigaRendiconto[]>([]);
  // Il giorno è dentro un rendiconto del periodo: sigillato solo se quel periodo è già uscito.
  // In bozza si corregge ancora, e il totale del periodo si rifà (28/11/2026).
  const [salSigillato, setSalSigillato] = useState(false);
  const [salInBozza, setSalInBozza] = useState(false);
  const [aggiungendo, setAggiungendo] = useState<CategoriaRiga | null>(null);
  const [rapportiniNuovi, setRapportiniNuovi] = useState(0);

  const permessi = usePermissions();
  const puoSalvarePrezzo = (permessi.isAdmin || permessi.canEditCustomers) && permessi.canViewOrderAmounts;
  const [conStraord, setConStraord] = useState<Set<string>>(new Set());
  // La riga «mezzo» senza prezzo per cui stiamo cercando la voce di listino (28/11/2026).
  const [mezzoDaCollegare, setMezzoDaCollegare] = useState<string | null>(null);
  const [copiando, setCopiando] = useState(false);
  const [origineCopia, setOrigineCopia] = useState("");
  const sezione = useRef<HTMLElement>(null);
  const { employees } = useOrderWorkPhases(orderId);
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  // Le ditte della commessa in testa, poi le altre dell'azienda: al committente si
  // rendiconta anche la ditta chiamata per un giorno, che nessuno ha assegnato al
  // cantiere. Stessi due gruppi dei mezzi nel rapportino dell'ufficio (27/11/2026).
  const ditte = useQuery({
    queryKey: ["rendiconto-giornaliero-ditte", companyId, orderId],
    enabled: !!companyId,
    queryFn: async () => {
      const cliente = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
      const [assegnate, tutte] = await Promise.all([
        cliente.from("order_external_teams").select("team:external_teams(name, subappaltatore_id)").eq("order_id", orderId),
        cliente.from("subappaltatori").select("id, ragione_sociale").eq("company_id", companyId).eq("is_active", true).order("ragione_sociale"),
      ]);
      if (assegnate.error) throw assegnate.error;
      if (tutte.error) throw tutte.error;
      const qui = new Set(
        ((assegnate.data ?? []) as Array<{ team: { name: string; subappaltatore_id: string | null } | null }>)
          .map((r) => r.team?.subappaltatore_id).filter((x): x is string => !!x),
      );
      return ((tutte.data ?? []) as Array<{ id: string; ragione_sociale: string }>)
        .map((d) => ({ id: d.id, nome: d.ragione_sociale, qui: qui.has(d.id) }))
        .sort((a, b) => Number(b.qui) - Number(a.qui) || a.nome.localeCompare(b.nome));
    },
  });
  const committente = useQuery({
    queryKey: ["rendiconto-giornaliero-committente", companyId, orderId],
    enabled: !!companyId && puoSalvarePrezzo,
    queryFn: async () => (await leggiDestinatarioRapporto(companyId!, orderId)).nome,
  });
  const elenco = useQuery({
    queryKey: ["rendiconti-giornalieri", orderId],
    enabled: copiando,
    queryFn: () => elencoRendiconti(orderId),
  });
  // Come si misura la commessa (28/11/2026): se si misura sul computo compare «Avanzamento del
  // giorno» e ogni voce a prezzo deve dire se è del computo o un extra — lo impone il database.
  const commessa = useQuery({
    queryKey: ["rendiconto-giornaliero-modalita", orderId],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("modalita_lavoro").eq("id", orderId).maybeSingle();
      if (error) throw error;
      return (data as { modalita_lavoro?: string | null } | null)?.modalita_lavoro ?? "semplice";
    },
  });
  const sulComputo = siMisuraSulComputo(commessa.data);
  const lavorazioniComputo = useQuery({
    queryKey: ["avanzamento-del-giorno-voci", orderId],
    enabled: sulComputo,
    queryFn: () => leggiLavorazioniDelGiorno(orderId, "rendiconto", null),
  });
  const { data: mezzi = [] } = useMezzi();
  // Voce, unità e prezzo delle righe aggiunte a mano: una lettura per apertura, rifatta se cambia il giorno.
  const predefinite = useQuery({
    queryKey: ["rendiconto-giornaliero-predefinite", orderId, data],
    enabled: !!data,
    queryFn: () => vociPredefinite(orderId, data),
  });

  const caricato = useRef<string | null>(null);
  const applica = (d: Awaited<ReturnType<typeof leggiRendiconto>>, conViaggio = false) => {
    setId(d.testata.id); setStato(d.testata.stato); setNumero(d.testata.numero); setData(d.testata.data);
    setLavori(d.testata.descrizione_lavori ?? ""); setNote(d.testata.note ?? "");
    // «Rendiconto trasporti» su un foglio ancora vuoto: il primo viaggio è già lì da compilare,
    // come il rapportino trasporti che parte dal viaggio.
    setRighe(conViaggio && d.righe.length === 0 ? [rigaViaggioNuova(tr("Trasporto"))] : d.righe);
    setSalSigillato(!!d.testata.sal_id && d.testata.sal_stato !== "bozza");
    setSalInBozza(!!d.testata.sal_id && d.testata.sal_stato === "bozza");
    setRapportiniNuovi(d.testata.rapportini_nuovi);
  };
  const lettura = useQuery({
    queryKey: ["rendiconto-giornaliero", rendicontoId],
    enabled: !!rendicontoId,
    queryFn: () => leggiRendiconto(rendicontoId!),
  });
  useEffect(() => {
    if (lettura.data && caricato.current !== rendicontoId) { caricato.current = rendicontoId; applica(lettura.data, partiDaTrasporti); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lettura.data, rendicontoId, partiDaTrasporti]);

  // «Il rendiconto può essere sempre modificato: non ha ancora completato il lavoro» (28/11/2026).
  // Anche confermato: si corregge e resta confermato. Si ferma solo quando è dentro il rendiconto
  // del periodo, perché quel documento è già partito.
  const modificabile = puoModificare && stato !== "annullato" && !salSigillato;
  // L'IVA del rendiconto: la scelta è della commessa, non del singolo giorno (28/11/2026), così il
  // documento del giorno e quello del periodo dicono la stessa cosa.
  const ivaCommessa = useQuery({
    queryKey: ["rendiconto-iva", orderId],
    staleTime: 60_000,
    queryFn: () => leggiIvaRendiconto(orderId),
  });
  const iva = ivaCommessa.data ?? null;
  const totale = useMemo(() => righe.reduce((s, r) => s + importoRiga(r), 0), [righe]);
  // Quello che il committente legge: somma delle righe, poi la scelta dell'IVA della commessa.
  const conIva = useMemo(() => totaleConIva(totale, iva), [totale, iva]);
  const senza = righe.filter(senzaPrezzo).length;

  const aggiorna = (chiave: string, patch: Partial<RigaRendiconto>) =>
    setRighe((rs) => rs.map((r) => (r.chiave === chiave ? { ...r, ...patch } : r)));
  const aggiungi = (r: Partial<RigaRendiconto> & { categoria: CategoriaRiga }) => {
    const cat = CATEGORIE.find((c) => c.valore === r.categoria)!;
    setRighe((rs) => [...rs, {
      chiave: chiaveRiga(), descrizione: "", unita: cat.unita, quantita: 1, prezzo_unitario: null, prezzo_a_mano: false,
      prezzo_fonte: null, listino_voce_id: null, appalto_tariffa_id: null, employee_id: null, subappaltatore_id: null,
      mezzo_id: null, fase_id: null, da_rapportino_id: null, maggiorazione_pct: 0, note: null,
      voce_computo_id: null, extra_contratto: false, viaggio: null, ...r,
    }]);
  };
  const daListino = (categoria: CategoriaRiga, v: VoceListino) => {
    const prodotto = !v.tariffa_id;
    aggiungi({
      categoria, descrizione: v.descrizione, unita: v.unita || "cad",
      listino_voce_id: v.tariffa_id ?? null,
      prezzo_unitario: v.prezzo ?? null,
      // Un prodotto del listino prodotti non ha una voce di listino voci: il suo prezzo si scrive.
      prezzo_a_mano: prodotto && v.prezzo != null,
      prezzo_fonte: prodotto ? (v.prezzo != null ? "manuale" : "mancante") : v.fonte,
      avviso_unita: avvisoUnita(v),
    });
  };
  // Voce del listino del committente (anche non collegata al generale): il prezzo viene da lì.
  const daCommittente = (categoria: CategoriaRiga, v: VoceListinoCommittente) =>
    aggiungi({
      categoria, descrizione: v.descrizione, unita: v.unita || "cad", appalto_tariffa_id: v.appalto_tariffa_id,
      listino_voce_id: v.tariffa_id ?? null, prezzo_unitario: v.prezzo ?? null, prezzo_a_mano: false,
      prezzo_fonte: v.prezzo == null ? "mancante" : "committente",
    });

  const bozza = () => ({ id, order_id: orderId, data, descrizione_lavori: lavori, note, righe });
  const dopo = async (idSalvato: string) => {
    // Il prezzo lo ha deciso il server: si rilegge.
    applica(await leggiRendiconto(idSalvato));
    caricato.current = rendicontoId ?? idSalvato;
    void qc.invalidateQueries({ queryKey: ["rendiconti-giornalieri", orderId] });
    void qc.invalidateQueries({ queryKey: ["rendiconto-giornaliero", idSalvato] });
    void qc.invalidateQueries({ queryKey: ["appalto-rendiconto"] });
  };
  const errore = (e: unknown) => toast.error(messaggioErrore(e, tr("Operazione non riuscita")));
  const cambiaIva = useMutation({
    mutationFn: ({ pct, compresa }: { pct: number | null; compresa: boolean }) => salvaIvaRendiconto(orderId, pct, compresa),
    onSuccess: (nuova) => {
      qc.setQueryData(["rendiconto-iva", orderId], nuova);
      void qc.invalidateQueries({ queryKey: ["rendiconti-giornalieri", orderId] });
      toast.success(nuova.iva_pct == null
        ? tr("Rendiconti di questa commessa: importi IVA esclusa")
        : nuova.iva_compresa
          ? tr("Rendiconti di questa commessa: prezzi IVA {pct}% compresa", { pct: nuova.iva_pct })
          : tr("Rendiconti di questa commessa: IVA {pct}% aggiunta al totale", { pct: nuova.iva_pct }));
    },
    onError: errore,
  });
  const senzaQuantita = righe.find((r) => !(r.quantita > 0));
  // Su una commessa che si misura sul computo il database rifiuta una voce a prezzo che non dica
  // se è del computo o un extra: lo diciamo qui, con il nome della riga, prima di provarci.
  const voceMuta = sulComputo
    ? righe.find((r) => r.categoria === "voce" && !r.voce_computo_id && !r.extra_contratto)
    : undefined;
  const salva = useMutation({
    mutationFn: () => {
      if (senzaQuantita) throw new Error(tr("La riga «{nome}» ha quantità 0: scrivila o toglila", { nome: senzaQuantita.descrizione || tr("senza nome") }));
      if (voceMuta) throw new Error(tr("La riga «{nome}»: di' se è una voce del computo o un lavoro extra", { nome: voceMuta.descrizione || tr("senza nome") }));
      return salvaRendiconto(bozza());
    },
    onSuccess: async (nuovo) => { await dopo(nuovo); toast.success(tr("Rendiconto salvato")); },
    onError: errore,
  });
  const conferma = useMutation({
    mutationFn: async () => { const nuovo = await salvaRendiconto(bozza()); setId(nuovo); await confermaRendiconto(nuovo); return nuovo; },
    onSuccess: async (nuovo) => { await dopo(nuovo); toast.success(tr("Rendiconto confermato")); },
    onError: async (e) => {
      errore(e);
      if (id) await dopo(id).catch((): void => undefined);
      // Righe senza prezzo: si scorre alla prima, col bordo ambra.
      setTimeout(() => sezione.current?.querySelector('[data-senza-prezzo="true"]')?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
    },
  });
  // Il mezzo senza voce di listino: si collega una volta e il prezzo arriva da sé, qui e dopo.
  const suggerimentiMezzo = useQuery({
    queryKey: ["mezzo-voci-suggerite", orderId, mezzoDaCollegare],
    enabled: !!mezzoDaCollegare,
    queryFn: () => vociSuggeriteMezzo(orderId, mezzoDaCollegare!),
  });
  const collegaMezzo = useMutation({
    mutationFn: async ({ mezzo, voce }: { mezzo: string; voce: string }) => {
      await mezzoCollegaVoce(mezzo, voce);
      if (id) await salvaRendiconto(bozza());
      return id;
    },
    onSuccess: async () => {
      setMezzoDaCollegare(null);
      toast.success(tr("Mezzo collegato al listino: il prezzo arriva da sé"));
      if (id) await dopo(id);
    },
    onError: errore,
  });
  const salvaPrezzoCommittente = useMutation({
    mutationFn: async (r: RigaRendiconto) => ({
      r, esito: await salvaPrezzoPerCommittente(orderId, r.listino_voce_id!, r.prezzo_unitario ?? 0, r.unita, r.descrizione),
    }),
    onSuccess: ({ r, esito }) => {
      aggiorna(r.chiave, { appalto_tariffa_id: esito.appalto_tariffa_id, prezzo_a_mano: false, prezzo_fonte: "committente" });
      const nome = committente.data || tr("committente");
      toast.success(esito.contratto_creato
        ? tr("Salvato nel listino di {nome}: ho creato l'accordo con le condizioni predefinite", { nome })
        : tr("Salvato nel listino di {nome}", { nome }));
      void qc.invalidateQueries({ queryKey: ["appalto-tariffe"] });
    },
    onError: errore,
  });
  const copiaGiorno = useMutation({
    mutationFn: async () => {
      // Con un rendiconto già salvato si salva prima, così la data scelta qui è quella a cui si copia.
      if (id) await salvaRendiconto(bozza());
      return rendicontoCopia(origineCopia, data);
    },
    onSuccess: async (r) => {
      setCopiando(false); setOrigineCopia("");
      await dopo(r.id);
      caricato.current = rendicontoId ?? r.id;
      toast.success(tr(r.copiate === 1 ? "Copiata {n} riga" : "Copiate {n} righe", { n: r.copiate }));
    },
    onError: errore,
  });
  const cambiaStato = useMutation({
    mutationFn: async (azione: "riapri" | "annulla") => {
      if (!id) return null;
      await (azione === "riapri" ? riapriRendiconto(id) : annullaRendiconto(id));
      return id;
    },
    onSuccess: async (v) => { if (v) await dopo(v); },
    onError: errore,
  });
  const occupato = salva.isPending || conferma.isPending || cambiaStato.isPending || copiaGiorno.isPending;

  const nomeStato: Record<StatoRendiconto, string> = { bozza: tr("Bozza"), confermato: tr("Confermato"), annullato: tr("Annullato") };

  const aggiungiPersona = (idPersona: string) => {
    const p = employees.find((e) => e.id === idPersona);
    if (!p) return;
    aggiungi({ categoria: "manodopera", descrizione: p.label, employee_id: p.id, ...campiDaPredefinita(predefinite.data?.manodopera) });
  };
  const aggiungiDitta = (idDitta: string) => {
    const d = ditte.data?.find((x) => x.id === idDitta);
    if (!d) return;
    const v = predefinite.data?.ditte?.find((x) => x.subappaltatore_id === d.id);
    // Senza voce la ditta prende la tariffa sua al salvataggio: resta «ora», senza «prezzo da definire».
    aggiungi({ categoria: "manodopera", descrizione: d.nome, subappaltatore_id: d.id,
      ...(v?.listino_voce_id ? campiDaPredefinita(v) : { unita: "ora", quantita: 8 }) });
  };
  const aggiungiMezzo = (idMezzo: string) => {
    const m = mezzi.find((x) => x.id === idMezzo);
    if (!m) return;
    const v = predefinite.data?.mezzi?.find((x) => x.mezzo_id === m.id);
    aggiungi({ categoria: "mezzo", descrizione: `${m.nome}${m.targa ? ` · ${m.targa}` : ""}`, mezzo_id: m.id, ...campiDaPredefinita(v) });
  };
  /** Un viaggio: riga di trasporto a prezzo da scrivere, coi campi carico/scarico/mezzo/DDT/km. */
  const aggiungiViaggio = () => setRighe((rs) => [...rs, rigaViaggioNuova(tr("Trasporto"))]);
  const cambiaViaggio = (r: RigaRendiconto, campo: keyof ViaggioRendiconto, valore: string) =>
    aggiorna(r.chiave, { viaggio: { ...(r.viaggio ?? {}), [campo]: valore } });

  // Rapportini scritti dopo: si salva quello che c'è, poi il database aggiunge le loro voci e si rilegge.
  const prendiNuovi = useMutation({
    mutationFn: async () => {
      const idSalvato = await salvaRendiconto(bozza());
      const r = await rendicontoDelGiorno(orderId, data);
      return { idSalvato, r };
    },
    onSuccess: async ({ idSalvato, r }) => {
      await dopo(r.id ?? idSalvato);
      if (r.aggiunti > 0) toast.success(tr("Prese le voci di {n} rapportini", { n: r.rapportini }));
    },
    onError: errore,
  });

  const fonteRiga = (r: RigaRendiconto) => {
    if (senzaPrezzo(r)) return <span className="text-amber-700">{tr("prezzo da definire")}</span>;
    if (r.prezzo_fonte) return <span className="text-muted-foreground">{tr(ETICHETTA_FONTE[r.prezzo_fonte])}</span>;
    return <span className="text-muted-foreground">{tr("prezzo al salvataggio")}</span>;
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {id && numero != null ? tr("Rendiconto n. {n}", { n: numero }) : rendicontoId ? tr("Rendiconto") : tr("Nuovo rendiconto del giorno")}
            {id && !lettura.isLoading && <span className="rounded border px-1.5 py-0 text-[11px] font-normal">{nomeStato[stato]}</span>}
          </DialogTitle>
          <DialogDescription>{tr("Il foglio per il committente: le voci del giorno, con quantità e prezzo. Il rapportino resta il diario interno.")}</DialogDescription>
        </DialogHeader>
        {salSigillato && <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">{tr("È già nel rendiconto del periodo, che è uscito: per modificarlo annulla quello.")}</p>}
        {salInBozza && <p className="rounded-md border px-2 py-1 text-xs text-muted-foreground">{tr("È in un rendiconto del periodo ancora in bozza: se lo correggi, il totale del periodo si rifà.")}</p>}
        {/* Confermato non vuol dire chiuso: il lavoro va avanti e il foglio si corregge fino al
            rendiconto del periodo. Quello che si salva resta confermato (28/11/2026). */}
        {stato === "confermato" && !salSigillato && modificabile && (
          <p className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-900">
            {tr("Confermato, ma si corregge ancora: quello che salvi resta confermato, finché il giorno non entra nel rendiconto del periodo.")}
          </p>
        )}
        {rapportiniNuovi > 0 && !salSigillato && stato !== "annullato" && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
            <span>
              {tr(rapportiniNuovi === 1
                ? "C'è {n} rapportino nuovo di questo giorno: le sue voci non sono ancora qui."
                : "Ci sono {n} rapportini nuovi di questo giorno: le loro voci non sono ancora qui.", { n: rapportiniNuovi })}
            </span>
            {modificabile && (
              <Button type="button" size="sm" variant="outline" className="h-7 gap-1 bg-background text-xs" disabled={occupato || prendiNuovi.isPending} onClick={() => prendiNuovi.mutate()}>
                {prendiNuovi.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{tr("Aggiungi le voci dei rapportini nuovi")}
              </Button>
            )}
          </div>
        )}
        {lettura.isLoading ? <p className="py-6 text-center text-sm text-muted-foreground">{tr("Caricamento…")}</p> : (
          <section ref={sezione} aria-label={tr("Rendiconto del giorno")} className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-xs text-muted-foreground">{tr("Giorno")}
                <Input type="date" aria-label={tr("Data")} className="h-9 w-40 text-foreground" value={data} disabled={!modificabile} onChange={(e) => setData(e.target.value)} />
              </label>
            </div>
            {modificabile && puoCopiare(stato, righe.length) && (
              <div className="space-y-1">
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1" disabled={occupato} onClick={() => setCopiando((c) => !c)}>
                  <Copy className="h-3.5 w-3.5" />{tr("Copia da un altro giorno")}
                </Button>
                {copiando && (
                  <div className="flex flex-wrap items-center gap-2">
                    <OfficeSelect value={origineCopia} label={tr("Rendiconto da copiare")} className="h-8 min-w-[14rem] flex-1" placeholder={tr("Scegli il giorno da copiare…")}
                      onValueChange={setOrigineCopia}
                      options={(elenco.data ?? []).filter((x) => x.id !== id && x.stato !== "annullato" && x.righe > 0)
                        .map((x) => ({ value: x.id, label: `${x.data} · n. ${x.numero} · ${x.righe} ${tr("righe")}` }))} />
                    <Button type="button" size="sm" className="h-8" disabled={!origineCopia || occupato} onClick={() => copiaGiorno.mutate()}>
                      {copiaGiorno.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{tr("Copia le righe")}
                    </Button>
                  </div>
                )}
              </div>
            )}
            <label className="grid gap-1 text-xs text-muted-foreground">{tr("Cosa si è fatto")}
              <Textarea rows={2} maxLength={4000} aria-label={tr("Lavori del giorno")} className="text-foreground" value={lavori} disabled={!modificabile}
                onChange={(e) => setLavori(e.target.value)} placeholder={tr("Cosa si è fatto, per il committente")} />
            </label>

            {CATEGORIE.map((c) => {
              const dentro = righe.filter((r) => r.categoria === c.valore);
              const subtotale = dentro.reduce((t, r) => t + importoRiga(r), 0);
              return (
                <Blocco key={c.valore} titolo={tr(c.titolo)} destra={dentro.length > 0 ? `${dentro.length} · ${formatCurrency(subtotale)}` : undefined}>
                  {dentro.length > 0 && (
                    <ul aria-label={tr(c.titolo)} className="divide-y rounded-md border">
                      {dentro.map((r) => {
                        const legata = !!(r.employee_id || r.mezzo_id || r.subappaltatore_id);
                        const mancante = senzaPrezzo(r);
                        const conVoce = !!(r.listino_voce_id || r.appalto_tariffa_id);
                        const mostraStraord = c.valore === "manodopera" && (r.maggiorazione_pct > 0 || conStraord.has(r.chiave));
                        const salvabile = puoSalvarePrezzo && modificabile && r.prezzo_a_mano && !!r.listino_voce_id && !r.appalto_tariffa_id && (r.prezzo_unitario ?? 0) > 0;
                        return (
                          <li key={r.chiave} data-senza-prezzo={mancante ? "true" : undefined}
                            className={`flex flex-wrap items-center gap-2 px-2 py-0.5 ${mancante ? "border-l-2 border-amber-400 bg-amber-50/40" : ""}`}>
                            <div className="min-w-[8rem] flex-1">
                              {legata
                                ? <span className="block truncate text-sm">{r.descrizione}</span>
                                : <Input aria-label={tr("Descrizione")} className="h-7 text-sm" value={r.descrizione} disabled={!modificabile}
                                    onChange={(e) => aggiorna(r.chiave, { descrizione: e.target.value })} />}
                              <span className="block text-[11px]">{fonteRiga(r)}</span>
                              {r.avviso_unita && <span role="alert" className="block text-[11px] text-amber-700">{r.avviso_unita}</span>}
                              {salvabile && (
                                <button type="button" disabled={salvaPrezzoCommittente.isPending} onClick={() => salvaPrezzoCommittente.mutate(r)}
                                  className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-blue-800 underline-offset-2 hover:underline">
                                  <Save className="h-3 w-3" />{tr("Salva questo prezzo per il committente")}
                                </button>
                              )}
                            </div>
                            <Numero etichetta={tr("Quantità")} className="h-7 w-20 text-right" disabled={!modificabile} valore={r.quantita}
                              onCambia={(n) => aggiorna(r.chiave, { quantita: n })} />
                            {legata || conVoce
                              ? <span className="w-10 text-xs text-muted-foreground">{r.unita}</span>
                              : <Input aria-label={tr("Unità")} className="h-7 w-12 text-xs" value={r.unita} disabled={!modificabile}
                                  onChange={(e) => aggiorna(r.chiave, { unita: e.target.value })} />}
                            {mostraStraord && (
                              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Numero etichetta={tr("Maggiorazione straordinario %")} className="h-7 w-14 text-right" disabled={!modificabile} valore={r.maggiorazione_pct}
                                  onCambia={(n) => aggiorna(r.chiave, { maggiorazione_pct: n })} />{tr("% straord.")}
                              </span>
                            )}
                            <Numero etichetta={tr("Prezzo")} className="h-7 w-20 text-right" disabled={!modificabile} valore={r.prezzo_unitario}
                              onCambia={(n) => aggiorna(r.chiave, { prezzo_unitario: n, prezzo_a_mano: true, prezzo_fonte: "manuale" })} />
                            <span className="w-20 text-right text-sm font-medium tabular-nums">{r.prezzo_unitario == null ? "—" : formatCurrency(importoRiga(r))}</span>
                            {modificabile && c.valore === "manodopera" && !mostraStraord && (
                              <button type="button" className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                                onClick={() => setConStraord((x) => new Set(x).add(r.chiave))}>{tr("+% straord.")}</button>
                            )}
                            {modificabile && (
                              <button type="button" aria-label={tr("Togli la riga")} className="text-muted-foreground hover:text-rose-600"
                                onClick={() => setRighe((rs) => rs.filter((x) => x.chiave !== r.chiave))}><X className="h-4 w-4" /></button>
                            )}
                            {/* Mezzo senza prezzo: il legame col listino si fa qui, una volta
                                (28/11/2026). Dopo, ogni rendiconto trova il prezzo da sé. */}
                            {modificabile && c.valore === "mezzo" && mancante && r.mezzo_id && (
                              <div className="flex w-full flex-wrap items-center gap-1.5 pb-1 pl-0.5">
                                {mezzoDaCollegare === r.mezzo_id ? (
                                  <>
                                    <OfficeSelect value="" label={tr("Voce di listino per questo mezzo")}
                                      className="h-7 min-w-[16rem] flex-1 text-xs"
                                      placeholder={suggerimentiMezzo.isLoading ? tr("Cerco nel listino…") : tr("Scegli la voce del listino…")}
                                      onValueChange={(v) => { if (v && r.mezzo_id) collegaMezzo.mutate({ mezzo: r.mezzo_id, voce: v }); }}
                                      options={(suggerimentiMezzo.data ?? [])
                                        .filter((v) => !!v.listino_voce_id)
                                        .map((v) => ({
                                          value: v.listino_voce_id!,
                                          label: `${v.descrizione}${v.prezzo != null ? ` · ${formatCurrency(v.prezzo)}/${v.unita ?? ""}` : ""}`,
                                          group: v.fonte === "committente" ? tr("Listino del committente") : tr("Listino generale"),
                                        }))} />
                                    <button type="button" className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                                      onClick={() => setMezzoDaCollegare(null)}>{tr("Annulla")}</button>
                                  </>
                                ) : (
                                  <button type="button" className="text-[11px] text-blue-800 underline-offset-2 hover:underline"
                                    onClick={() => setMezzoDaCollegare(r.mezzo_id!)}>
                                    {tr("Questo mezzo non ha una voce di listino: collegala")}
                                  </button>
                                )}
                              </div>
                            )}
                            {/* Commessa a computo: ogni voce a prezzo dice se è del computo o un extra
                                (28/11/2026). Senza la scelta il database la rifiuta. */}
                            {sulComputo && c.valore === "voce" && (
                              <div className="flex w-full flex-wrap items-center gap-1.5 pb-1 pl-0.5">
                                <OfficeSelect
                                  value={r.extra_contratto ? "extra" : (r.voce_computo_id ?? "")}
                                  label={tr("Voce del computo o lavoro extra")}
                                  className={`h-7 min-w-[16rem] flex-1 text-xs ${!r.voce_computo_id && !r.extra_contratto ? "border-amber-400" : ""}`}
                                  placeholder={tr("Scegli: voce del computo o extra…")}
                                  disabled={!modificabile}
                                  onValueChange={(v) => aggiorna(r.chiave, v === "extra"
                                    ? { extra_contratto: true, voce_computo_id: null }
                                    : { extra_contratto: false, voce_computo_id: v || null })}
                                  options={[
                                    { value: "extra", label: tr("Lavoro extra, fuori contratto") },
                                    ...(lavorazioniComputo.data ?? [])
                                      .filter((l) => !!l.voce_computo_id)
                                      .map((l) => ({ value: l.voce_computo_id!, label: `${l.fase} · ${l.lavorazione}`, group: tr("Voci del computo") })),
                                  ]} />
                                {!r.voce_computo_id && !r.extra_contratto && (
                                  <span role="alert" className="text-[11px] text-amber-700">{tr("Serve la scelta")}</span>
                                )}
                              </div>
                            )}
                            {/* Il viaggio: carico, scarico, mezzo o targa, DDT, km. Gli stessi campi del
                                rapportino trasporti, così il committente legge la tratta e non «Trasporto». */}
                            {r.viaggio && (
                              <div className="flex w-full flex-wrap items-center gap-1.5 pb-1 pl-0.5">
                                {CAMPI_VIAGGIO_RENDICONTO.map((campo) => (
                                  <Input key={campo.chiave} aria-label={tr(campo.etichetta)} placeholder={tr(campo.etichetta)} disabled={!modificabile}
                                    className={`h-7 text-xs ${campo.larghezza}`} value={r.viaggio?.[campo.chiave] ?? ""}
                                    onChange={(e) => cambiaViaggio(r, campo.chiave, e.target.value)} />
                                ))}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {modificabile && (
                    <div className="flex flex-wrap items-center gap-2">
                      {c.valore === "manodopera" && (
                        <OfficeSelect value="" label={tr("Aggiungi persona")} className="h-8 min-w-[12rem] flex-1 text-muted-foreground"
                          placeholder={tr("+ Aggiungi persona…")} onValueChange={(v) => { if (v) aggiungiPersona(v); }}
                          options={employees.map((e) => ({ value: e.id, label: e.label }))} />
                      )}
                      {c.valore === "manodopera" && (ditte.data ?? []).length > 0 && (
                        <OfficeSelect value="" label={tr("Aggiungi ditta")} className="h-8 min-w-[10rem] flex-1 text-muted-foreground"
                          placeholder={tr("+ Aggiungi ditta…")} onValueChange={(v) => { if (v) aggiungiDitta(v); }}
                          options={(ditte.data ?? []).map((d) => ({ value: d.id, label: d.nome, group: d.qui ? tr("Su questo cantiere") : tr("Altre ditte") }))} />
                      )}
                      {c.valore === "mezzo" && (
                        <OfficeSelect value="" label={tr("Aggiungi mezzo")} className="h-8 min-w-[12rem] flex-1 text-muted-foreground"
                          placeholder={tr("+ Aggiungi mezzo…")} onValueChange={(v) => { if (v) aggiungiMezzo(v); }}
                          options={mezzi.map((m) => ({ value: m.id, label: `${m.nome}${m.targa ? ` · ${m.targa}` : ""}` }))} />
                      )}
                      {c.valore === "trasporto" && (
                        <Button type="button" variant="outline" size="sm" className="h-8" onClick={aggiungiViaggio}>
                          <Truck className="mr-1 h-3.5 w-3.5" />{tr("Aggiungi viaggio")}
                        </Button>
                      )}
                      {c.valore !== "manodopera" && c.valore !== "mezzo" && (
                        <Button type="button" variant="outline" size="sm" className="h-8" aria-label={`${tr("Aggiungi")} ${tr(c.titolo)}`}
                          onClick={() => setAggiungendo(aggiungendo === c.valore ? null : c.valore)}>
                          <Plus className="mr-1 h-3.5 w-3.5" />{tr("Aggiungi")}
                        </Button>
                      )}
                      <Button type="button" variant="outline" size="sm" className="h-8"
                        onClick={() => { aggiungi({ categoria: c.valore }); setAggiungendo(null); }}>{tr("Riga libera, prezzo a mano")}</Button>
                    </div>
                  )}
                  {modificabile && aggiungendo === c.valore && c.valore !== "manodopera" && c.valore !== "mezzo" && (
                    <CercaVoceRendiconto orderId={orderId} data={data} conProdotti={c.valore === "materiale"}
                      onScegliCommittente={(v) => { daCommittente(c.valore, v); setAggiungendo(null); }}
                      onScegliGenerale={(v) => { daListino(c.valore, v); setAggiungendo(null); }} />
                  )}
                </Blocco>
              );
            })}

            {/* L'altra faccia del giorno (28/11/2026): non quanto si è speso, ma quanto si è fatto
                delle lavorazioni già pattuite nel computo. Scrive i movimenti dell'avanzamento, e da
                lì nasce il SAL. Compare solo dove la commessa si misura sul computo. */}
            {sulComputo && (
              <Blocco titolo={tr("Avanzamento del giorno")} destra={tr("dal computo")}>
                <AvanzamentoDelGiorno orderId={orderId} documentoId={id} data={data} origine="rendiconto"
                  puoModificare={puoModificare} chiuso={stato !== "bozza"} />
              </Blocco>
            )}

            <label className="grid gap-1 text-xs text-muted-foreground">{tr("Note (facoltative)")}
              <Input aria-label={tr("Note")} maxLength={4000} className="text-foreground" value={note} disabled={!modificabile} onChange={(e) => setNote(e.target.value)} />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm">
              <span className="text-xs text-amber-700">{senza > 0 ? tr("{n} senza prezzo", { n: senza }) : ""}</span>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {/* La scelta vale per tutti i rendiconti della commessa: lo dice l'etichetta. */}
                {iva?.inversione ? (
                  <span className="text-xs text-muted-foreground">{tr("Inversione contabile: fattura senza IVA")}</span>
                ) : (
                  <OfficeSelect
                    label={tr("IVA dei rendiconti di questa commessa")}
                    className="h-7 w-[13rem] text-xs"
                    value={iva?.iva_pct == null ? "" : `${iva.iva_compresa ? "c" : "a"}${iva.iva_pct}`}
                    disabled={!puoModificare || cambiaIva.isPending}
                    placeholder={tr("IVA esclusa")}
                    onValueChange={(v) => cambiaIva.mutate(v === "-"
                      ? { pct: null, compresa: false }
                      : { pct: Number(v.slice(1)), compresa: v.startsWith("c") })}
                    options={[
                      { value: "-", label: tr("IVA esclusa (la mette la fattura)") },
                      ...[22, 10, 4].map((p) => ({ value: `a${p}`, label: tr("+ IVA {pct}%", { pct: p }), group: tr("IVA aggiunta al totale") })),
                      ...[22, 10, 4].map((p) => ({ value: `c${p}`, label: tr("IVA {pct}% compresa", { pct: p }), group: tr("Prezzi che la comprendono già") })),
                    ]} />
                )}
                {conIva.iva > 0 && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {tr("Imponibile")} {formatCurrency(conIva.imponibile)} · {tr("IVA")} {formatCurrency(conIva.iva)}
                  </span>
                )}
                <span className="font-semibold">{tr("Totale")} <span className="tabular-nums">{formatCurrency(conIva.totale)}</span></span>
              </div>
            </div>
          </section>
        )}
        {!lettura.isLoading && <DialogFooter className="gap-1.5 sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {/* Annullare un confermato vuol dire prima riportarlo in bozza: il database non lo butta via
                con un comando solo, e qui non si finge il contrario. */}
            {puoModificare && id && stato === "bozza" && !salSigillato && (
              <Button type="button" variant="outline" disabled={occupato}
                onClick={() => { if (window.confirm(tr("Annullare questo rendiconto?"))) cambiaStato.mutate("annulla"); }}>{tr("Annulla rendiconto")}</Button>
            )}
            {id && stato !== "annullato" && <PulsantePdfRendiconto rendicontoId={id} className="h-10 px-4 text-sm" />}
            {puoModificare && id && stato === "confermato" && !salSigillato && (
              <Button type="button" variant="outline" disabled={occupato} onClick={() => cambiaStato.mutate("riapri")}>{tr("Riporta in bozza")}</Button>
            )}
          </div>
          <div className="flex gap-1.5">
            <Button type="button" variant="ghost" onClick={onClose}>{tr("Chiudi")}</Button>
            {modificabile && (
              <>
                <Button type="button" variant="outline" disabled={occupato} onClick={() => salva.mutate()}>
                  {salva.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{tr("Salva")}
                </Button>
                {stato === "bozza" && (
                  <Button type="button" disabled={occupato || righe.length === 0} onClick={() => conferma.mutate()}>
                    {conferma.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{tr("Conferma")}
                  </Button>
                )}
              </>
            )}
          </div>
        </DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
