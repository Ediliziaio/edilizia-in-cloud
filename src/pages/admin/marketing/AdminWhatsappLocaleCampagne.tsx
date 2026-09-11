/**
 * WhatsApp Locale — Campagne a freddo (piattaforma).
 *
 * Crea una campagna, carica i destinatari da un filtro sui contatti, avvia.
 * Da lì in poi il dispatcher (cron ogni 10 min in fascia diurna) manda al
 * ritmo consentito dai numeri: warm-up, cap giornaliero e settimanale,
 * throttle fra un invio e l'altro, rotazione sul numero meno carico.
 *
 * Il ritmo NON si imposta qui, di proposito: si governa dai cap dei singoli
 * numeri (Impostazioni → WhatsApp Locale). Due posti che decidono la stessa
 * cosa finiscono sempre per contraddirsi.
 *
 * Il follow-up parte solo verso chi NON ha risposto: alla prima risposta il
 * destinatario esce dalla coda. Insistere con chi ti ha già risposto è il
 * modo più rapido di farsi segnalare come spam.
 */
import { useMemo, useState, useRef } from "react";
import { readInvokeError } from "@/lib/readInvokeError";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Send, MessageCircle, AlertTriangle, Ban, WifiOff, ExternalLink, Loader2, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import RisposteRapide from "@/components/admin/whatsapp-locale/RisposteRapide";
import PipelineCampagna from "@/components/admin/whatsapp-locale/PipelineCampagna";
import RisposteCampagna from "@/components/admin/whatsapp-locale/RisposteCampagna";
import { CampagnaFlusso } from "@/components/admin/whatsapp-locale/CampagnaFlusso";

interface Riepilogo {
  id: string;
  nome: string;
  stato: string;
  messaggio?: string | null;
  followup_messaggio?: string | null;
  parte_il?: string | null;
  followup_dopo_giorni: number;
  ha_followup: boolean;
  totali: number;
  da_inviare: number;
  inviati: number;
  followup_inviati: number;
  risposti: number;
  saltati: number;
  falliti: number;
  created_at: string;
  avviata_at: string | null;
}

const STATO_NUMERO: Record<string, { label: string; className: string }> = {
  connected: { label: "connesso", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  connecting: { label: "in connessione", className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  disconnected: { label: "disconnesso", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  banned: { label: "BANNATO", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
};

const IN_ARCHIVIO = new Set(["completata", "annullata"]);

/** Variabili del contatto disponibili nei testi ({{nome}}, {{azienda}}…). */
const VARIABILI_CONTATTO = ["nome", "cognome", "nome_completo", "azienda", "citta", "provincia", "telefono", "email", "sito", "fonte", "tag"] as const;
const GIORNI_SETTIMANA: Array<[number, string]> = [[1, "Lun"], [2, "Mar"], [3, "Mer"], [4, "Gio"], [5, "Ven"], [6, "Sab"], [7, "Dom"]];

/** "chiave=valore" per riga → oggetto; chiavi in minuscolo, solo lettere/numeri/_ . */
function parseVariabili(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const riga of (text ?? "").split(/\r?\n/)) {
    const i = riga.indexOf("=");
    if (i <= 0) continue;
    const k = riga.slice(0, i).trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const v = riga.slice(i + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
}

/** Data ISO → valore per <input type="datetime-local"> in ora locale. */
function aDatetimeLocale(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function AdminWhatsappLocaleCampagne() {
  const qc = useQueryClient();
  const [creaAperto, setCreaAperto] = useState(false);
  const [listaPer, setListaPer] = useState<Riepilogo | null>(null);
  // Campagne aperte sul loro flusso (come le sequenze email) e archivio.
  const [aperte, setAperte] = useState<Set<string>>(() => new Set());
  const apriChiudi = (id: string) => setAperte((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const [archivioAperto, setArchivioAperto] = useState(false);

  // Nuova campagna
  const [nome, setNome] = useState("");
  const [messaggio, setMessaggio] = useState("");
  const [followup, setFollowup] = useState("");
  const [followupGiorni, setFollowupGiorni] = useState(3);
  const [followup2, setFollowup2] = useState("");
  const [followup2Giorni, setFollowup2Giorni] = useState(3);
  const [followup3, setFollowup3] = useState("");
  const [followup3Giorni, setFollowup3Giorni] = useState(3);
  const [messaggioB, setMessaggioB] = useState("");
  const [aiAttiva, setAiAttiva] = useState(false);
  const [aiIstruzioni, setAiIstruzioni] = useState("");
  const [parteIl, setParteIl] = useState("");
  // Tempi, limiti e variabili della campagna (vuoto = finestra globale anti-ban).
  const [orarioDa, setOrarioDa] = useState("");
  const [orarioA, setOrarioA] = useState("");
  const [giorni, setGiorni] = useState<number[]>([]);
  const [scadenzaIl, setScadenzaIl] = useState("");
  const [maxAlGiorno, setMaxAlGiorno] = useState("");
  const [variabiliText, setVariabiliText] = useState("");
  const [stopSeRisponde, setStopSeRisponde] = useState(true);
  const campoAttivoRef = useRef<"msg" | "msgB" | "msg2" | "msg3" | "msg4">("msg");
  /** Inserisce {{variabile}} nel testo su cui si stava scrivendo. */
  const inserisciVariabile = (v: string) => {
    const tok = `{{${v}}}`;
    const app = (s: string) => (s ? `${s} ${tok}` : tok);
    const c = campoAttivoRef.current;
    if (c === "msg") setMessaggio(app); else if (c === "msgB") setMessaggioB(app);
    else if (c === "msg2") setFollowup(app); else if (c === "msg3") setFollowup2(app); else setFollowup3(app);
  };
  // Modifica: stesso dialog della creazione, con l'id di chi si sta correggendo.
  const [modificaId, setModificaId] = useState<string | null>(null);
  // Prova: mandarsi la campagna prima di lanciarla su centinaia di persone.
  const [provaPer, setProvaPer] = useState<Riepilogo | null>(null);
  const [provaNumero, setProvaNumero] = useState("");
  const [pipelinePer, setPipelinePer] = useState<Riepilogo | null>(null);
  const [rispostePer, setRispostePer] = useState<Riepilogo | null>(null);

  // Caricamento lista
  const [fTags, setFTags] = useState("");
  const [fCitta, setFCitta] = useState("");
  const [fProvincia, setFProvincia] = useState("");
  const [fLimite, setFLimite] = useState("");

  const { data: campagne = [], isLoading } = useQuery({
    queryKey: ["openwa-campagne"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("openwa_campagne_riepilogo");
      if (error) throw error;
      return (data ?? []) as Riepilogo[];
    },
    refetchInterval: 60_000,
  });

  // Capacità del pool: senza numeri collegati una campagna non parte, e va
  // detto PRIMA di crearla invece di lasciarla ferma senza spiegazioni.
  const { data: numeri = [] } = useQuery({
    queryKey: ["openwa-numeri-capacita"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("openwa_numbers")
        .select("id, numero, display_name, stato, tags, daily_cap, daily_sent, daily_sent_date")
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; numero: string | null; display_name: string | null; stato: string; tags: string[] | null;
        daily_cap: number | null; daily_sent: number | null; daily_sent_date: string | null;
      }>;
    },
    refetchInterval: 60_000,
  });

  const connessi = useMemo(() => numeri.filter((n) => n.stato === "connected"), [numeri]);
  const capacitaGiorno = useMemo(
    () => connessi.reduce((s, n) => s + (n.daily_cap ?? 0), 0),
    [connessi],
  );
  // Quanto si puo' ancora inviare OGGI: il cap teorico dice poco se i numeri
  // hanno gia' lavorato — e' il residuo che spiega perche' la campagna rallenta.
  const residuoOggi = useMemo(() => {
    const oggi = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
    return connessi.reduce((tot, n) => {
      const usati = n.daily_sent_date === oggi ? (n.daily_sent ?? 0) : 0;
      return tot + Math.max(0, (n.daily_cap ?? 0) - usati);
    }, 0);
  }, [connessi]);
  const inProblema = useMemo(
    () => numeri.filter((n) => n.stato === "banned" || n.stato === "disconnected"),
    [numeri],
  );
  const campagneAttive = useMemo(() => campagne.filter((c) => c.stato === "in_corso"), [campagne]);
  const nomeNumero = (n: { display_name: string | null; numero: string | null }) =>
    n.display_name || n.numero || "numero";

  // La RPC di riepilogo non restituisce il testo del messaggio: senza, una
  // campagna creata non si poteva piu' rileggere ne' correggere.
  const { data: testiById = {} } = useQuery({
    queryKey: ["openwa-campagne-testi"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("openwa_campagne")
        .select("id, messaggio, messaggio_b, ai_personalizza, ai_istruzioni, followup_messaggio, followup_dopo_giorni, followup2_messaggio, followup2_dopo_giorni, followup3_messaggio, followup3_dopo_giorni, parte_il, nome, orario_da, orario_a, giorni_settimana, scadenza_il, max_al_giorno, variabili, stop_se_risponde, tags_numeri");
      if (error) throw error;
      const m: Record<string, { messaggio: string; followup_messaggio: string | null; followup_dopo_giorni: number; followup2_messaggio: string | null; followup2_dopo_giorni: number; followup3_messaggio: string | null; followup3_dopo_giorni: number; messaggio_b: string | null; ai_personalizza: boolean; ai_istruzioni: string | null; parte_il: string | null; nome: string; orario_da: number | null; orario_a: number | null; giorni_settimana: number[] | null; scadenza_il: string | null; max_al_giorno: number | null; variabili: Record<string, string> | null; stop_se_risponde: boolean | null; tags_numeri: string[] | null }> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const c of (data ?? []) as any[]) m[c.id] = c;
      return m;
    },
    staleTime: 30_000,
  });

  // Le campagne su cui si lavora vengono prima; completate e annullate in
  // fondo — sono archivio, non lavoro.
  const campagneOrdinate = useMemo(() => {
    const peso: Record<string, number> = { in_corso: 0, in_pausa: 1, bozza: 2, completata: 3, annullata: 4 };
    return [...campagne].sort((a, b) =>
      (peso[a.stato] ?? 9) - (peso[b.stato] ?? 9) || (a.created_at < b.created_at ? 1 : -1));
  }, [campagne]);

  const filtriRpc = useMemo(() => {
    const tags = fTags.split(",").map((t) => t.trim()).filter(Boolean);
    return {
      p_tags: tags.length ? tags : null,
      p_citta: fCitta.trim() || null,
      p_provincia: fProvincia.trim() || null,
      p_source: null as string | null,
      p_limite: fLimite.trim() ? Number(fLimite) : null,
    };
  }, [fTags, fCitta, fProvincia, fLimite]);

  const { data: anteprima, isFetching: anteprimaInCorso } = useQuery({
    queryKey: ["openwa-anteprima", filtriRpc],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("openwa_campagna_anteprima", filtriRpc);
      if (error) throw error;
      return (data as number | null) ?? 0;
    },
    enabled: !!listaPer,
  });

  const chiudiEditor = () => {
    setCreaAperto(false); setModificaId(null);
    setNome(""); setMessaggio(""); setFollowup(""); setFollowupGiorni(3);
    setFollowup2(""); setFollowup2Giorni(3); setFollowup3(""); setFollowup3Giorni(3); setParteIl("");
    setMessaggioB(""); setAiAttiva(false); setAiIstruzioni("");
    setOrarioDa(""); setOrarioA(""); setGiorni([]); setScadenzaIl(""); setMaxAlGiorno(""); setVariabiliText(""); setStopSeRisponde(true);
  };

  const crea = useMutation({
    mutationFn: async () => {
      const payload = {
        nome: nome.trim(),
        messaggio: messaggio.trim(),
        followup_messaggio: followup.trim() || null,
        followup_dopo_giorni: followupGiorni,
        followup2_messaggio: followup2.trim() || null,
        followup2_dopo_giorni: followup2Giorni,
        followup3_messaggio: followup3.trim() || null,
        followup3_dopo_giorni: followup3Giorni,
        messaggio_b: messaggioB.trim() || null,
        ai_personalizza: aiAttiva,
        ai_istruzioni: aiIstruzioni.trim() || null,
        parte_il: parteIl ? new Date(parteIl).toISOString() : null,
        orario_da: orarioDa === "" ? null : Number(orarioDa),
        orario_a: orarioA === "" ? null : Number(orarioA),
        giorni_settimana: giorni.length ? [...giorni].sort() : null,
        scadenza_il: scadenzaIl ? new Date(scadenzaIl).toISOString() : null,
        max_al_giorno: maxAlGiorno.trim() ? Math.max(1, Math.round(Number(maxAlGiorno))) : null,
        variabili: parseVariabili(variabiliText),
        stop_se_risponde: stopSeRisponde,
      };
      // Modifica: consentita solo finche' la campagna non e' partita — cambiare
      // il testo a meta' invio significa due messaggi diversi nella stessa
      // campagna, e nessun modo di sapere chi ha ricevuto cosa.
      const { error } = modificaId
        ? await supabase.from("openwa_campagne").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", modificaId)
        : await supabase.from("openwa_campagne").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(modificaId ? "Campagna aggiornata" : "Campagna creata", {
        description: modificaId ? undefined : "Ora carica i destinatari, poi avviala.",
      });
      chiudiEditor();
      qc.invalidateQueries({ queryKey: ["openwa-campagne"] });
      qc.invalidateQueries({ queryKey: ["openwa-campagne-testi"] });
    },
    onError: (e: Error) => toast.error("Salvataggio non riuscito", { description: e.message }),
  });

  // Duplica: il gesto piu' frequente (stessa campagna, mese dopo). Copia testi
  // e regole (orari, ritmo, numeri, cosa fare quando rispondono), MAI i
  // destinatari, lo stato o le date: la copia nasce vuota e in bozza.
  const duplica = useMutation({
    mutationFn: async (c: Riepilogo) => {
      const src = testiById[c.id];
      if (!src) throw new Error("Testo della campagna non disponibile");
      const { data: copia, error } = await supabase.from("openwa_campagne").insert({
        nome: `${src.nome} (copia)`,
        messaggio: src.messaggio,
        followup_messaggio: src.followup_messaggio,
        followup_dopo_giorni: src.followup_dopo_giorni,
        followup2_messaggio: src.followup2_messaggio,
        followup2_dopo_giorni: src.followup2_dopo_giorni,
        followup3_messaggio: src.followup3_messaggio,
        followup3_dopo_giorni: src.followup3_dopo_giorni,
        messaggio_b: src.messaggio_b,
        ai_personalizza: src.ai_personalizza,
        ai_istruzioni: src.ai_istruzioni,
        orario_da: src.orario_da,
        orario_a: src.orario_a,
        giorni_settimana: src.giorni_settimana,
        max_al_giorno: src.max_al_giorno,
        variabili: src.variabili,
        stop_se_risponde: src.stop_se_risponde !== false,
        tags_numeri: src.tags_numeri ?? [],
      }).select("id").single();
      if (error) throw error;
      // openwa_rules non ha ancora campagna_id nei tipi generati.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const regole = () => (supabase as any).from("openwa_rules");
      const { data: suo, error: e2 } = await regole().select("*").eq("campagna_id", c.id);
      if (e2) throw new Error(`Campagna copiata, ma non le regole sulle risposte: ${e2.message}`);
      if (suo?.length) {
        const righe = (suo as Array<Record<string, unknown>>).map((r) => {
          const { id: _id, created_at: _creata, updated_at: _aggiornata, ...resto } = r;
          return { ...resto, campagna_id: copia.id };
        });
        const { error: e3 } = await regole().insert(righe);
        if (e3) throw new Error(`Campagna copiata, ma non le regole sulle risposte: ${e3.message}`);
      }
    },
    onSuccess: () => {
      toast.success("Campagna duplicata", { description: "La copia è in bozza e senza destinatari." });
      qc.invalidateQueries({ queryKey: ["openwa-campagne"] });
      qc.invalidateQueries({ queryKey: ["openwa-campagne-testi"] });
    },
    onError: (e: Error) => toast.error("Duplicazione non riuscita", { description: e.message }),
  });

  // Prova: manda il messaggio a UN numero scelto. Con 500 destinatari in coda,
  // scoprire un errore nel testo dopo il lancio non e' recuperabile.
  const inviaProva = useMutation({
    mutationFn: async () => {
      const numero = provaNumero.trim();
      const testo = provaPer ? testiById[provaPer.id]?.messaggio : "";
      if (!numero) throw new Error("Indica un numero");
      if (!testo) throw new Error("Testo della campagna non disponibile");
      const { data, error } = await supabase.functions.invoke("openwa-gateway", {
        body: { action: "send_text", to: numero, text: testo },
      });
      if (error) throw new Error(await readInvokeError(error));
      const r = data as { ok?: boolean; error?: string } | null;
      if (r?.ok === false || r?.error) throw new Error(r?.error ?? "Invio fallito");
    },
    onSuccess: () => {
      toast.success("Prova inviata", { description: "Controlla come è arrivato prima di lanciare." });
      setProvaPer(null); setProvaNumero("");
    },
    onError: (e: Error) => toast.error("Prova non riuscita", { description: e.message }),
  });

  /** Apre l'editor su una campagna esistente. */
  const apriModifica = (c: Riepilogo) => {
    const src = testiById[c.id];
    if (!src) { toast.error("Testo non disponibile, riprova"); return; }
    setModificaId(c.id);
    setNome(src.nome);
    setMessaggio(src.messaggio ?? "");
    setFollowup(src.followup_messaggio ?? "");
    setFollowupGiorni(src.followup_dopo_giorni ?? 3);
    setFollowup2(src.followup2_messaggio ?? "");
    setFollowup2Giorni(src.followup2_dopo_giorni ?? 3);
    setFollowup3(src.followup3_messaggio ?? "");
    setFollowup3Giorni(src.followup3_dopo_giorni ?? 3);
    setMessaggioB(src.messaggio_b ?? "");
    setAiAttiva(!!src.ai_personalizza);
    setAiIstruzioni(src.ai_istruzioni ?? "");
    // datetime-local vuole l'ora LOCALE: con toISOString() (UTC) una campagna
    // delle 10:00 si riapriva alle 08:00 e ogni salvataggio la anticipava.
    setParteIl(src.parte_il ? aDatetimeLocale(src.parte_il) : "");
    setOrarioDa(src.orario_da == null ? "" : String(src.orario_da));
    setOrarioA(src.orario_a == null ? "" : String(src.orario_a));
    setGiorni(src.giorni_settimana ?? []);
    setScadenzaIl(src.scadenza_il ? aDatetimeLocale(src.scadenza_il) : "");
    setMaxAlGiorno(src.max_al_giorno == null ? "" : String(src.max_al_giorno));
    setVariabiliText(Object.entries(src.variabili ?? {}).map(([k, v]) => `${k}=${v}`).join("\n"));
    setStopSeRisponde(src.stop_se_risponde !== false);
    setCreaAperto(true);
  };

  const caricaLista = useMutation({
    mutationFn: async (campagnaId: string) => {
      const { data, error } = await supabase.rpc("openwa_campagna_carica_lista", {
        p_campagna_id: campagnaId, ...filtriRpc,
      });
      if (error) throw error;
      return (data as number | null) ?? 0;
    },
    onSuccess: (n) => {
      toast.success(`${n} destinatari aggiunti`, {
        description: n === 0 ? "Nessun contatto nuovo: erano già tutti in lista." : undefined,
      });
      setListaPer(null);
      qc.invalidateQueries({ queryKey: ["openwa-campagne"] });
    },
    onError: (e: Error) => toast.error("Caricamento non riuscito", { description: e.message }),
  });

  // Un fallito e' un destinatario su cui l'invio e' andato male 5 volte
  // (gateway giu', sessione caduta...). Risolto il guasto, va rimesso in coda:
  // senza questo pulsante restava fallito per sempre.
  const riprovaFalliti = useMutation({
    mutationFn: async (campagnaId: string) => {
      // La RPC riparte dal passo GIA' raggiunto: rimettere tutti a "da_inviare"
      // rispediva il primo messaggio a chi era fallito su un follow-up.
      const { data, error } = await supabase.rpc("openwa_campagna_riprova_falliti", { p_campagna_id: campagnaId });
      if (error) throw error;
      return (data as number | null) ?? 0;
    },
    onSuccess: (n) => {
      toast.success(`${n} destinatari rimessi in coda`, {
        description: "Ripartiranno al prossimo giro del motore (entro 10 minuti).",
      });
      qc.invalidateQueries({ queryKey: ["openwa-campagne"] });
    },
    onError: (e: Error) => toast.error("Operazione non riuscita", { description: e.message }),
  });

  // Gli ultimi errori della campagna selezionata: senza vederli, "12 falliti"
  // e' un numero muto — non si capisce se e' colpa del gateway o dei numeri.
  const [erroriPer, setErroriPer] = useState<Riepilogo | null>(null);
  const { data: erroriDettaglio = [], isLoading: erroriInCorso } = useQuery({
    queryKey: ["openwa-campagna-errori", erroriPer?.id],
    enabled: !!erroriPer,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("openwa_campagna_destinatari")
        .select("id, stato, ultimo_errore, tentativi, contact_id, marketing_contacts(first_name, last_name, phone)")
        .eq("campagna_id", erroriPer!.id)
        .in("stato", ["fallito", "saltato"])
        .not("ultimo_errore", "is", null)
        .order("tentativi", { ascending: false })
        .limit(50);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
  });

  // Annullare non e' mettere in pausa: la pausa dice "riprendo", l'annullo dice
  // "questa campagna e' morta" e la toglie dal lavoro del dispatcher per sempre.
  const annulla = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("openwa_campagne")
        .update({ stato: "annullata", updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campagna annullata");
      qc.invalidateQueries({ queryKey: ["openwa-campagne"] });
    },
    onError: (e: Error) => toast.error("Operazione non riuscita", { description: e.message }),
  });

  // Eliminabile SOLO la bozza: una campagna che ha inviato e' storia di
  // contatti reali, e la storia non si cancella (i destinatari cadrebbero in
  // cascata e con loro gli esiti).
  const elimina = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("openwa_campagne")
        .delete().eq("id", id).eq("stato", "bozza");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bozza eliminata");
      qc.invalidateQueries({ queryKey: ["openwa-campagne"] });
    },
    onError: (e: Error) => toast.error("Eliminazione non riuscita", { description: e.message }),
  });

  const cambiaStato = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: string }) => {
      const patch: TablesUpdate<"openwa_campagne"> = { stato, updated_at: new Date().toISOString() };
      const { error } = await supabase.from("openwa_campagne").update(patch).eq("id", id);
      if (error) throw error;
      // "avviata il" e' la PRIMA partenza: riprendere da pausa non la riscrive.
      if (stato === "in_corso") {
        const { error: e2 } = await supabase.from("openwa_campagne")
          .update({ avviata_at: new Date().toISOString() }).eq("id", id).is("avviata_at", null);
        if (e2) throw e2;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["openwa-campagne"] }),
    onError: (e: Error) => toast.error("Operazione non riuscita", { description: e.message }),
  });

  return (
    <div className="space-y-6 p-1">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Campagne WhatsApp Locale</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Messaggi a freddo con follow-up automatico. Il ritmo lo impongono i cap dei numeri,
            non la campagna.
          </p>
        </div>
        <Button onClick={() => setCreaAperto(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nuova campagna
        </Button>
      </div>

      {/* Un numero bannato o caduto ferma gli invii in silenzio: qui deve
          urlare. Rosso se non resta nessun numero a coprire, ambra altrimenti. */}
      {inProblema.length > 0 && (
        <Card className={connessi.length === 0
          ? "border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40"
          : "border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40"}>
          <div className="flex items-start gap-3">
            {inProblema.some((n) => n.stato === "banned")
              ? <Ban className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              : <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />}
            <div className="min-w-0 space-y-1 text-sm">
              {inProblema.map((n) => (
                <p key={n.id}>
                  <strong>{nomeNumero(n)}</strong>{" "}
                  {n.stato === "banned"
                    ? "è stato BANNATO da WhatsApp: non può più inviare né ricevere."
                    : "risulta disconnesso: riapri la sessione scansionando di nuovo il QR."}
                </p>
              ))}
              {connessi.length === 0 && campagneAttive.length > 0 && (
                <p className="font-semibold">
                  Nessun numero attivo: {campagneAttive.length === 1
                    ? `la campagna "${campagneAttive[0].nome}" è ferma`
                    : `${campagneAttive.length} campagne sono ferme`} finché non ricolleghi un numero.
                </p>
              )}
              <Button asChild size="sm" variant="outline" className="mt-1">
                <Link to="/admin/marketing/whatsapp-locale/numeri">
                  Vai ai numeri <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Capacità: la prima cosa da sapere prima di lanciare qualcosa */}
      <Card className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <MessageCircle className="h-5 w-5 text-emerald-600 shrink-0" />
          {connessi.length === 0 ? (
            <div className="flex items-start gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <span>
                <strong>Nessun numero collegato.</strong> Le campagne restano ferme finché non
                colleghi almeno un numero da <em>Impostazioni → WhatsApp Locale</em>.
              </span>
            </div>
          ) : (
            <div className="min-w-0 space-y-2 text-sm">
              <span>
                <strong>{connessi.length}</strong> {connessi.length === 1 ? "numero attivo" : "numeri attivi"} ·
                oggi restano <strong>{residuoOggi}</strong> {residuoOggi === 1 ? "invio" : "invii"} su {capacitaGiorno}
                <span className="text-muted-foreground">
                  {" "}— un numero appena collegato invia meno finché il warm-up non lo porta a regime.
                </span>
              </span>
              {capacitaGiorno > 0 && (
                <div className="flex h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted"
                  title={`${capacitaGiorno - residuoOggi} usati · ${residuoOggi} disponibili`}>
                  <div className="h-full bg-emerald-600 transition-all"
                    style={{ width: `${((capacitaGiorno - residuoOggi) / capacitaGiorno) * 100}%` }} />
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {numeri.map((n) => {
                  const b = STATO_NUMERO[n.stato] ?? { label: n.stato, className: "bg-slate-100 text-slate-600" };
                  return (
                    <Badge key={n.id} variant="secondary" className={b.className}>
                      {nomeNumero(n)} · {b.label}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : campagne.length === 0 ? (
        <Card className="p-10 text-center">
          <Send className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="font-medium">Nessuna campagna</p>
          <p className="text-sm text-muted-foreground mt-1">
            Creane una, carica i destinatari da un filtro sui contatti e avviala.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {campagneOrdinate.filter((c) => !IN_ARCHIVIO.has(c.stato)).map((c) => (
            <CampagnaFlusso
              key={c.id}
              c={c}
              t={testiById[c.id]}
              numeri={numeri}
              capacitaGiorno={capacitaGiorno}
              aperta={aperte.has(c.id)}
              onToggle={() => apriChiudi(c.id)}
              onDestinatari={() => setListaPer(c)}
              onStato={(stato) => {
                if (stato === c.stato) return;
                if (stato === "annullata") {
                  if (window.confirm(`Annullare "${c.nome}"? Gli invii si fermano per sempre; i dati restano.`)) annulla.mutate(c.id);
                  return;
                }
                cambiaStato.mutate({ id: c.id, stato });
              }}
              onModifica={() => apriModifica(c)}
              onProva={() => setProvaPer(c)}
              onDuplica={() => duplica.mutate(c)}
              onPipeline={() => setPipelinePer(c)}
              onRisposte={() => setRispostePer(c)}
              onProblemi={() => setErroriPer(c)}
              onRiprova={() => riprovaFalliti.mutate(c.id)}
              onElimina={() => {
                if (window.confirm(`Eliminare la bozza "${c.nome}"? Sparisce anche la lista destinatari.`)) elimina.mutate(c.id);
              }}
              inCorso={{
                duplica: duplica.isPending,
                stato: cambiaStato.isPending || annulla.isPending,
                riprova: riprovaFalliti.isPending,
                elimina: elimina.isPending,
              }}
            />
          ))}
          {/* Completate e annullate sono archivio, non lavoro: chiuse in fondo. */}
          {campagneOrdinate.some((c) => IN_ARCHIVIO.has(c.stato)) && (
            <div className="pt-2">
              <button
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setArchivioAperto((v) => !v)}
              >
                {archivioAperto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Archivio · {campagneOrdinate.filter((c) => IN_ARCHIVIO.has(c.stato)).length} completate o annullate
              </button>
              {archivioAperto && (
                <div className="mt-2 space-y-3 opacity-80">
                  {campagneOrdinate.filter((c) => IN_ARCHIVIO.has(c.stato)).map((c) => (
                    <CampagnaFlusso
                      key={c.id}
                      c={c}
                      t={testiById[c.id]}
                      numeri={numeri}
                      capacitaGiorno={capacitaGiorno}
                      aperta={aperte.has(c.id)}
                      onToggle={() => apriChiudi(c.id)}
                      onDestinatari={() => setListaPer(c)}
                      onStato={() => undefined}
                      onModifica={() => apriModifica(c)}
                      onProva={() => setProvaPer(c)}
                      onDuplica={() => duplica.mutate(c)}
                      onPipeline={() => setPipelinePer(c)}
                      onRisposte={() => setRispostePer(c)}
                      onProblemi={() => setErroriPer(c)}
                      onRiprova={() => riprovaFalliti.mutate(c.id)}
                      onElimina={() => undefined}
                      inCorso={{ duplica: duplica.isPending, stato: false, riprova: riprovaFalliti.isPending, elimina: false }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Nuova campagna ── */}
      <Dialog open={creaAperto} onOpenChange={(o) => { if (!o) chiudiEditor(); else setCreaAperto(true); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{modificaId ? "Modifica campagna" : "Nuova campagna"}</DialogTitle>
            <DialogDescription>
              Varianti <code>{"{ciao|salve}"}</code>: a ogni invio ne esce una a caso, così i
              messaggi non sono tutti identici. Variabili: clicca un chip per inserirla nel
              testo; <code>{"{{nome|ciao}}"}</code> usa "ciao" se il contatto non ha il nome, senza
              riserva il segnaposto sparisce senza lasciare buchi nella frase.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="nome">Nome campagna</Label>
              <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)}
                placeholder="Es. Imprese edili Veneto — settembre" />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="msg">Primo messaggio</Label>
                {/* Stesso archivio dell'inbox: una frase salvata una volta si
                    riusa dove serve, invece di riscriverla in due posti. */}
                <RisposteRapide categoria="campagna" etichetta="Template"
                  onScegli={(t) => setMessaggio((m) => (m ? `${m}\n${t}` : t))} />
              </div>
              <Textarea id="msg" rows={4} value={messaggio} onFocus={() => { campoAttivoRef.current = "msg"; }} onChange={(e) => setMessaggio(e.target.value)}
                placeholder="{Ciao|Salve} {{nome}}, ..." />
              <div className="mt-2">
                <Label htmlFor="msgB" className="text-xs text-muted-foreground">
                  Variante B — A/B test (facoltativa)
                </Label>
                <Textarea id="msgB" rows={2} value={messaggioB} onFocus={() => { campoAttivoRef.current = "msgB"; }}
                  onChange={(e) => setMessaggioB(e.target.value)}
                  placeholder="Un testo alternativo: metà lista riceve questo, e confronti i tassi" />
              </div>
            </div>

            {/* AI: adatta, non inventa. Il testo base resta la sostanza. */}
            <div className="rounded-lg border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={aiAttiva} onChange={(e) => setAiAttiva(e.target.checked)} />
                Personalizza ogni messaggio con l'AI
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                Il messaggio viene adattato al contatto (settore, città, dimensione) mantenendo
                significato e proposta. Se l'AI non risponde, parte il testo base. Ogni messaggio
                diverso dagli altri è anche la miglior difesa del numero.
              </p>
              {aiAttiva && (
                <Textarea rows={2} value={aiIstruzioni}
                  onChange={(e) => setAiIstruzioni(e.target.value)}
                  className="mt-2"
                  placeholder="Indicazioni per l'AI (es. tono diretto da imprenditore, cita la città se c'è)" />
              )}
            </div>
            {/* La sequenza: ogni passo parte SOLO verso chi non ha risposto al
                precedente. Il passo N+1 si puo' scrivere solo se esiste il
                passo N: una sequenza col buco in mezzo non e' una sequenza. */}
            {([
              { n: 2, testo: followup, setTesto: setFollowup, giorni: followupGiorni, setGiorni: setFollowupGiorni, attivo: true },
              { n: 3, testo: followup2, setTesto: setFollowup2, giorni: followup2Giorni, setGiorni: setFollowup2Giorni, attivo: !!followup.trim() },
              { n: 4, testo: followup3, setTesto: setFollowup3, giorni: followup3Giorni, setGiorni: setFollowup3Giorni, attivo: !!followup2.trim() },
            ]).map((p2) => (
              (p2.attivo || p2.testo.trim()) && (
                <div key={p2.n} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={`msg${p2.n}`}>Messaggio {p2.n} (facoltativo)</Label>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      dopo
                      <Input type="number" min={1} max={30} value={p2.giorni}
                        onChange={(e) => p2.setGiorni(Number(e.target.value))}
                        className="h-7 w-16 text-xs" aria-label={`Giorni di attesa del messaggio ${p2.n}`} />
                      giorni
                    </div>
                  </div>
                  <Textarea id={`msg${p2.n}`} rows={2} value={p2.testo} onFocus={() => { campoAttivoRef.current = `msg${p2.n}` as "msg2" | "msg3" | "msg4"; }}
                    onChange={(e) => p2.setTesto(e.target.value)}
                    placeholder="Lascia vuoto per fermare la sequenza qui" className="mt-1.5" />
                </div>
              )
            ))}
            <p className="text-xs text-muted-foreground -mt-2">
              Ogni messaggio parte solo verso chi <strong>non ha risposto</strong> al precedente.
            </p>
            {/* Variabili: quelle del contatto + quelle scritte qui (chiave=valore). */}
            <div className="rounded-lg border p-3 space-y-2">
              <Label className="text-sm font-medium">Variabili</Label>
              <div className="flex flex-wrap gap-1">
                {[...VARIABILI_CONTATTO, ...Object.keys(parseVariabili(variabiliText))].map((v) => (
                  <button key={v} type="button" onClick={() => inserisciVariabile(v)}
                    className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] hover:bg-accent"
                    title={`Inserisci {{${v}}} nel testo su cui stavi scrivendo`}>{`{{${v}}}`}</button>
                ))}
              </div>
              <Textarea rows={2} value={variabiliText} onChange={(e) => setVariabiliText(e.target.value)}
                placeholder={"Variabili tue, una per riga: chiave=valore\nofferta=sopralluogo gratuito entro venerdì\nlink=https://…"}
                className="font-mono text-xs" />
            </div>

            {/* Tempi e limiti: vuoto = finestra globale anti-ban (8-21, feriali). */}
            <div className="rounded-lg border p-3 space-y-3">
              <Label className="text-sm font-medium">Tempi e limiti</Label>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label htmlFor="orario-da" className="text-xs text-muted-foreground">Dalle</Label>
                  <Input id="orario-da" type="number" min={0} max={23} value={orarioDa} placeholder="8"
                    onChange={(e) => setOrarioDa(e.target.value)} className="h-8 w-20" />
                </div>
                <div>
                  <Label htmlFor="orario-a" className="text-xs text-muted-foreground">Alle</Label>
                  <Input id="orario-a" type="number" min={1} max={24} value={orarioA} placeholder="21"
                    onChange={(e) => setOrarioA(e.target.value)} className="h-8 w-20" />
                </div>
                <div>
                  <Label htmlFor="max-giorno" className="text-xs text-muted-foreground">Max al giorno (campagna)</Label>
                  <Input id="max-giorno" type="number" min={1} value={maxAlGiorno} placeholder="senza limite"
                    onChange={(e) => setMaxAlGiorno(e.target.value)} className="h-8 w-36" />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-xs text-muted-foreground">Giorni:</span>
                {GIORNI_SETTIMANA.map(([n, label]) => {
                  const on = giorni.includes(n);
                  return (
                    <button key={n} type="button" aria-pressed={on}
                      onClick={() => setGiorni((g) => (g.includes(n) ? g.filter((x) => x !== n) : [...g, n]))}
                      className={`rounded border px-2 py-0.5 text-xs ${on ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>
                      {label}
                    </button>
                  );
                })}
                <span className="ml-1 text-[11px] text-muted-foreground">{giorni.length === 0 ? "(nessuno selezionato = feriali, finestra globale)" : ""}</span>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label htmlFor="scadenza" className="text-xs text-muted-foreground">Scade il (poi si chiude da sola)</Label>
                  <Input id="scadenza" type="datetime-local" value={scadenzaIl}
                    onChange={(e) => setScadenzaIl(e.target.value)} className="h-8 w-56" />
                </div>
                <label className="flex items-center gap-2 pb-1.5 text-sm">
                  <input type="checkbox" checked={stopSeRisponde} onChange={(e) => setStopSeRisponde(e.target.checked)} />
                  Ferma la sequenza quando risponde
                </label>
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <div>
                <Label htmlFor="parteil">Parte il (facoltativo)</Label>
                <Input id="parteil" type="datetime-local" value={parteIl}
                  onChange={(e) => setParteIl(e.target.value)} className="w-56" />
                <p className="text-xs text-muted-foreground mt-1">
                  Lascia vuoto per partire appena la avvii.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={chiudiEditor}>Annulla</Button>
            <Button disabled={!nome.trim() || !messaggio.trim() || crea.isPending}
              onClick={() => crea.mutate()}>
              {crea.isPending ? "Salvo…" : modificaId ? "Salva modifiche" : "Crea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Pipeline destinatari/esiti ── */}
      {pipelinePer && (
        <PipelineCampagna
          campagnaId={pipelinePer.id}
          nome={pipelinePer.nome}
          aperta={!!pipelinePer}
          onChiudi={() => setPipelinePer(null)}
        />
      )}

      {/* ── Report risposte ── */}
      {rispostePer && (
        <RisposteCampagna
          campagnaId={rispostePer.id}
          nome={rispostePer.nome}
          haVarianteB={!!testiById[rispostePer.id]?.messaggio_b}
          aperta={!!rispostePer}
          onChiudi={() => setRispostePer(null)}
        />
      )}

      {/* ── Invio di prova ── */}
      <Dialog open={!!provaPer} onOpenChange={(o) => { if (!o) { setProvaPer(null); setProvaNumero(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Prova — {provaPer?.nome}</DialogTitle>
            <DialogDescription>
              Manda il primo messaggio a un numero che conosci, per vedere come arriva davvero
              prima di lanciarlo su tutta la lista. Consuma un invio del tetto giornaliero.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="prova-num">Numero destinatario</Label>
              <Input id="prova-num" placeholder="+39 333 1234567" value={provaNumero}
                onChange={(e) => setProvaNumero(e.target.value)} />
            </div>
            {provaPer && testiById[provaPer.id]?.messaggio && (
              <div className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white whitespace-pre-wrap">
                {testiById[provaPer.id].messaggio}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Le varianti <code>{"{a|b}"}</code> e le variabili <code>{"{{nome}}"}</code> vengono
              risolte al momento dell'invio: qui vedi il testo grezzo.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setProvaPer(null); setProvaNumero(""); }}>Annulla</Button>
            <Button disabled={!provaNumero.trim() || inviaProva.isPending} onClick={() => inviaProva.mutate()}>
              {inviaProva.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
              Invia la prova
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Problemi (falliti e saltati con errore) ── */}
      <Dialog open={!!erroriPer} onOpenChange={(o) => !o && setErroriPer(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Problemi — {erroriPer?.nome}</DialogTitle>
            <DialogDescription>
              I <strong>saltati</strong> non verranno ricontattati (opt-out o numero non su WhatsApp).
              I <strong>falliti</strong> sono errori tecnici: risolvi la causa e usa "Riprova".
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {erroriInCorso ? (
              <Skeleton className="h-24 w-full" />
            ) : erroriDettaglio.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nessun dettaglio disponibile.</p>
            ) : (
              erroriDettaglio.map((d) => {
                const contatto = d.marketing_contacts;
                const chi = contatto
                  ? [contatto.first_name, contatto.last_name].filter(Boolean).join(" ") || contatto.phone
                  : "contatto rimosso";
                return (
                  <div key={d.id} className="rounded-md border px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{chi}</span>
                      <Badge variant={d.stato === "fallito" ? "destructive" : "secondary"} className="shrink-0 text-[10px]">
                        {d.stato === "fallito" ? `fallito · ${d.tentativi} tentativi` : "saltato"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{d.ultimo_errore}</p>
                  </div>
                );
              })
            )}
          </div>
          {erroriPer && erroriPer.falliti > 0 && (
            <DialogFooter>
              <Button variant="outline" disabled={riprovaFalliti.isPending}
                onClick={() => { riprovaFalliti.mutate(erroriPer.id); setErroriPer(null); }}>
                <RotateCcw className="mr-1.5 h-4 w-4" /> Riprova i {erroriPer.falliti} falliti
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Carica destinatari ── */}
      <Dialog open={!!listaPer} onOpenChange={(o) => !o && setListaPer(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Destinatari — {listaPer?.nome}</DialogTitle>
            <DialogDescription>
              Filtra i contatti della piattaforma. Chi è già in lista non viene aggiunto due volte,
              e chi ha chiesto di non essere contattato è sempre escluso.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="tags">Tag (separati da virgola)</Label>
              <Input id="tags" value={fTags} onChange={(e) => setFTags(e.target.value)}
                placeholder="edilizia, veneto" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="citta">Città</Label>
                <Input id="citta" value={fCitta} onChange={(e) => setFCitta(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="prov">Provincia</Label>
                <Input id="prov" value={fProvincia} onChange={(e) => setFProvincia(e.target.value)}
                  placeholder="VI" />
              </div>
            </div>
            <div>
              <Label htmlFor="lim">Quanti al massimo</Label>
              <Input id="lim" type="number" min={1} value={fLimite}
                onChange={(e) => setFLimite(e.target.value)} placeholder="tutti" className="w-40" />
            </div>

            <Card className="p-3 bg-muted/40">
              <p className="text-sm">
                {anteprimaInCorso ? "Conto…" : (
                  <>
                    <strong>{anteprima ?? 0}</strong> contatti corrispondono.
                    {typeof anteprima === "number" && anteprima > 0 && capacitaGiorno > 0 && (
                      <span className="text-muted-foreground">
                        {" "}Al ritmo attuale servono circa{" "}
                        <strong>{Math.ceil(anteprima / capacitaGiorno)} giorni</strong> per contattarli tutti.
                      </span>
                    )}
                  </>
                )}
              </p>
            </Card>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setListaPer(null)}>Annulla</Button>
            <Button disabled={!anteprima || caricaLista.isPending}
              onClick={() => listaPer && caricaLista.mutate(listaPer.id)}>
              {caricaLista.isPending ? "Carico…" : `Aggiungi ${anteprima ?? 0} destinatari`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
