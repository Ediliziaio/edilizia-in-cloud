import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigationType, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Globe, RefreshCw, Search, Settings2, Plus, AlertTriangle, CheckCircle2, XCircle, BarChart3, ChevronDown, MousePointer2, Activity, X,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { BrandPageHeader } from "@/components/admin/BrandPageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { retryAuthorizedRead } from "@/lib/retryAuthorizedRead";
import { dominioSito, PERIODI_TRAFFICO, periodoTraffico, useSitiGoogleMetriche, type SitoGoogle as Sito } from "@/hooks/useSitiGoogleMetriche";

interface Scoperta {
  ok: boolean; configurato?: boolean; messaggio?: string; account?: string;
  proprieta_ga4?: Array<{ id: string; nome: string; account: string }>;
  siti_search_console?: string[];
  error?: string;
}

interface EsitoSincronizzazione {
  ok: boolean; configurato?: boolean; messaggio?: string; error?: string;
  siti?: Array<{ sito: string; giorni_metriche: number; righe_pagine: number; errore: string | null }>;
}

function crescita(ora: number, prima: number): string | null {
  if (!prima) return null;
  const d = Math.round(((ora - prima) / prima) * 100);
  return `${d > 0 ? "+" : ""}${d}%`;
}

/** «41s», «1m 25s». */
function durata(secondi: number | null): string {
  if (secondi === null || secondi === undefined) return "—";
  const tot = Math.round(Number(secondi));
  if (tot < 60) return `${tot}s`;
  const m = Math.floor(tot / 60);
  const s = tot % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

/** Un giorno senza ora («2026-09-09») letto come giorno locale, non come mezzanotte UTC. */
function giorno(iso: string): string {
  return format(new Date(`${iso}T12:00:00`), "dd/MM/yyyy");
}

/**
 * Search Console restituisce l'indirizzo intero. Se è del sito stesso basta il
 * percorso; se è di un altro host (una proprietà «dominio» comprende anche i
 * sottodomini, app. e admin.) l'host resta, perché è proprio l'informazione.
 */
function percorsoLeggibile(indirizzo: string, dominio: string): string {
  const m = indirizzo.match(/^https?:\/\/([^/]+)(\/.*)?$/i);
  if (!m) return indirizzo;
  const host = m[1].toLowerCase();
  const percorso = m[2] || "/";
  if (host === dominio.toLowerCase()) return percorso;
  return percorso === "/" ? host : `${host}${percorso}`;
}

/** L'ora della raccolta (05:35 UTC) in quella di chi guarda: 07:35 d'estate, 06:35 d'inverno. */
function oraRaccolta(): string {
  const d = new Date();
  d.setUTCHours(5, 35, 0, 0);
  return orarioItalia.format(d);
}
const orarioItalia = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

/**
 * Cosa dire dopo «Sincronizza». Prima era sempre «Sincronizzazione
 * completata», anche quando la funzione rispondeva che non poteva partire.
 */
function esitoSincronizzazione(r: EsitoSincronizzazione, collegati: number): { tipo: "success" | "warning" | "error"; testo: string } {
  if (r.configurato === false) {
    return { tipo: "warning", testo: "Nessun dato scaricato: manca la chiave Google (istruzioni in alto)" };
  }
  if (!r.ok) return { tipo: "error", testo: r.error ?? "Sincronizzazione non riuscita" };
  const siti = r.siti ?? [];
  const inErrore = siti.filter((s) => s.errore);
  const conDati = siti.filter((s) => s.giorni_metriche > 0 || s.righe_pagine > 0);
  if (inErrore.length) {
    return {
      tipo: "warning",
      testo: `${inErrore.length} ${inErrore.length === 1 ? "sito" : "siti"} su ${siti.length} con errori: il motivo è sotto il nome`,
    };
  }
  if (!conDati.length) {
    return { tipo: "warning", testo: collegati
      ? "Google non ha restituito dati per il periodo richiesto."
      : "Nessun dato scaricato: nessun sito ha GA4 o Search Console collegati" };
  }
  return { tipo: "success", testo: `Dati scaricati per ${conDati.length} ${conDati.length === 1 ? "sito" : "siti"}` };
}

function Passo({ fatto, children }: { fatto: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {fatto
        ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" aria-label="fatto" />
        : <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" aria-label="da fare" />}
      <span>{children}</span>
    </li>
  );
}

function statoSito(s: Sito): string {
  if (s.ultimo_dato) return `dati fino al ${giorno(s.ultimo_dato)}`;
  if (s.ultimo_sync) return `ultimo tentativo ${format(new Date(s.ultimo_sync), "dd/MM HH:mm")} · nessun dato`;
  return "mai raccolto";
}

const numero = new Intl.NumberFormat("it-IT");
const ordineItaliano = new Intl.Collator("it-IT", { sensitivity: "base", numeric: true });

const STATI = {
  tutti: "Tutti gli stati",
  operativi: "Operativi",
  verifica: "Da verificare",
  errori: "Con errori",
  sospesi: "Sospesi",
};

const FONTI = {
  tutte: "Tutte le fonti",
  entrambe: "GA4 e Search Console",
  ga4: "Solo GA4",
  gsc: "Solo Search Console",
  nessuna: "Nessuna fonte",
};

const ORDINAMENTI = {
  nome: "Nome A–Z",
  clic: "Clic da Google",
  impressioni: "Impressioni",
  visite: "Visite GA4",
  viste: "Pagine viste",
  recente: "Dato più recente",
};

function opzione<T extends Record<string, string>>(opzioni: T, valore: string | null, predefinita: keyof T & string): keyof T & string {
  return valore && Object.hasOwn(opzioni, valore) ? valore as keyof T & string : predefinita;
}

function testoRicerca(valore: string) {
  return valore.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function necessitaVerifica(sito: Sito) {
  return sito.attivo && (!sito.ga4_property_id || !sito.gsc_site_url || !sito.ultimo_dato || !!sito.ultimo_errore);
}

function fonteSito(sito: Sito): keyof typeof FONTI {
  if (sito.ga4_property_id && sito.gsc_site_url) return "entrambe";
  if (sito.ga4_property_id) return "ga4";
  return sito.gsc_site_url ? "gsc" : "nessuna";
}

function verificaStato(sito: Sito, filtro: keyof typeof STATI) {
  switch (filtro) {
    case "operativi": return sito.attivo && !necessitaVerifica(sito);
    case "verifica": return necessitaVerifica(sito);
    case "errori": return !!sito.ultimo_errore;
    case "sospesi": return !sito.attivo;
    default: return true;
  }
}

function valoreOrdine(sito: Sito, ordine: keyof typeof ORDINAMENTI) {
  switch (ordine) {
    case "clic": return sito.gsc_site_url ? sito.clic : -1;
    case "impressioni": return sito.gsc_site_url ? sito.impressioni : -1;
    case "visite": return sito.ga4_property_id ? sito.sessioni : -1;
    case "viste": return sito.ga4_property_id ? sito.visualizzazioni : -1;
    case "recente": return sito.ultimo_dato ? Date.parse(sito.ultimo_dato) : -1;
    default: return 0;
  }
}

function FiltroSiti({ label, value, options, onChange }: {
  label: string; value: string; options: Record<string, string>; onChange: (value: string) => void;
}) {
  return (
    <label className="min-w-0 text-xs font-medium text-muted-foreground">
      {label}
      <span className="relative mt-1 block">
        <select value={value} onChange={event => onChange(event.target.value)}
          className="h-9 w-full appearance-none truncate rounded-md border border-input bg-background pl-3 pr-7 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {Object.entries(options).map(([key, nome]) => <option key={key} value={key}>{nome}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2" aria-hidden="true" />
      </span>
    </label>
  );
}

function DatoSito({ titolo, valore, confronto }: { titolo: string; valore: number | null; confronto?: string | null }) {
  return (
    <div className="flex flex-wrap items-baseline justify-end gap-x-1.5">
      <span className="font-semibold tabular-nums">{valore === null ? "—" : numero.format(valore)}</span>
      {valore !== null && <span className="text-xs text-muted-foreground">{titolo}</span>}
      {valore !== null && confronto && (
        <span title="Variazione sul periodo precedente" className="text-[11px] tabular-nums text-muted-foreground">{confronto}</span>
      )}
    </div>
  );
}

export default function SitiGooglePage() {
  const [parametri, setParametri] = useSearchParams();
  const posizione = useLocation();
  const navigazione = useNavigationType();
  const ultimiParametri = useRef(parametri);
  useEffect(() => {
    if (navigazione === "POP" || posizione.state?.origine !== "siti-google") {
      ultimiParametri.current = parametri;
    }
  }, [navigazione, parametri, posizione]);
  const giorni = periodoTraffico(parametri.get("giorni"), 28);
  const [inModifica, setInModifica] = useState<Partial<Sito> | null>(null);
  const [scoperta, setScoperta] = useState<Scoperta | null>(null);
  const [ricercaProprieta, setRicercaProprieta] = useState("");
  const qc = useQueryClient();

  const { data, isLoading, isFetching, error, refetch } = useSitiGoogleMetriche(giorni);
  const siti = data?.siti ?? [];
  const ricercaSiti = parametri.get("q") ?? "";
  const stato = opzione(STATI, parametri.get("stato"), "tutti");
  const fonte = opzione(FONTI, parametri.get("fonte"), "tutte");
  const ordine = opzione(ORDINAMENTI, parametri.get("ordine"), "nome");
  const filtriAttivi = !!ricercaSiti || stato !== "tutti" || fonte !== "tutte" || ordine !== "nome";
  const parole = testoRicerca(ricercaSiti.trim()).split(/\s+/).filter(Boolean);
  const sitiVisibili = siti.filter(sito => {
    const termine = testoRicerca(`${sito.nome} ${sito.dominio}`);
    return parole.every(parola => termine.includes(parola))
      && verificaStato(sito, stato)
      && (fonte === "tutte" || fonteSito(sito) === fonte);
  }).sort((a, b) => valoreOrdine(b, ordine) - valoreOrdine(a, ordine) || ordineItaliano.compare(a.nome, b.nome));
  const dominioRichiesto = dominioSito(parametri.get("sito") ?? "");
  const dettaglio = sitiVisibili.find(sito => dominioSito(sito.dominio) === dominioRichiesto)?.id;

  // React Router legge la query renderizzata, anche quando due filtri cambiano nello stesso evento.
  const aggiornaParametri = (modifica: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(ultimiParametri.current);
    modifica(next);
    ultimiParametri.current = next;
    setParametri(next, { replace: true, state: { origine: "siti-google" } });
  };
  const impostaParametro = (chiave: string, valore: string | null) => aggiornaParametri(next => {
    if (valore === null) next.delete(chiave);
    else next.set(chiave, valore);
  });
  const azzeraFiltri = () => aggiornaParametri(next => {
    for (const chiave of ["q", "stato", "fonte", "ordine"]) next.delete(chiave);
  });

  const { data: pagine, isLoading: caricaPagine, isError: errorePagine, refetch: ricaricaPagine } = useQuery({
    queryKey: ["admin-sito-pagine", dettaglio, giorni],
    enabled: !!dettaglio,
    retry: retryAuthorizedRead,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_sito_pagine_google" as never,
        { p_sito_id: dettaglio, p_giorni: giorni } as never);
      if (error) throw error;
      if (!data) throw new Error("Dettaglio Google non disponibile.");
      return data as unknown as {
        ricerca: Array<{ percorso: string; impressioni: number; clic: number; posizione: number | null; ctr_pct: number | null }>;
        visite: Array<{ percorso: string; visualizzazioni: number; utenti: number; durata_media_s: number | null }>;
      };
    },
  });

  const salva = useMutation({
    mutationFn: async (s: Partial<Sito>) => {
      const { data, error } = await supabase.rpc("admin_sito_salva" as never, {
        p_id: s.id ?? null, p_nome: s.nome, p_dominio: s.dominio,
        p_ga4: s.ga4_property_id ?? null, p_gsc: s.gsc_site_url ?? null,
        p_attivo: s.attivo ?? true,
      } as never);
      if (error) throw error;
      const r = data as unknown as { error?: string };
      if (r?.error) throw new Error(r.error);
    },
    onSuccess: () => {
      toast.success("Sito salvato");
      setInModifica(null);
      qc.invalidateQueries({ queryKey: ["admin-siti-metriche"] });
      qc.invalidateQueries({ queryKey: ["admin-sito-pagine"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const chiamaFunzione = useMutation({
    mutationFn: async (azione: "scopri" | "sincronizza") => {
      const { data, error } = await supabase.functions.invoke("siti-metriche-sync", {
        // Con il periodo a 90 giorni si scaricano 90 giorni: la raccolta
        // notturna ne riprende solo quattordici.
        body: { azione, giorni: Math.max(28, giorni) },
      });
      if (error) throw new Error(await edgeErrorMessage(error, "La funzione non ha risposto"));
      if (!data) throw new Error("Google non ha restituito un esito.");
      return { azione, risposta: data as Scoperta & EsitoSincronizzazione };
    },
    onSuccess: ({ azione, risposta }) => {
      if (azione === "scopri") {
        setScoperta(risposta);
        setRicercaProprieta("");
        if (risposta.configurato === false) toast.warning("Manca la chiave Google: vedi le istruzioni in alto");
        return;
      }
      const esito = esitoSincronizzazione(risposta, data?.siti_collegati ?? 0);
      toast[esito.tipo](esito.testo);
    },
    onError: (e) => toast.error((e as Error).message),
    // Anche quando va male i siti cambiano: la funzione scrive su ognuno perché è fermo.
    onSettled: async (_r, _e, azione) => {
      if (azione === "sincronizza") await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-siti-metriche"] }),
        qc.invalidateQueries({ queryKey: ["admin-sito-pagine"] }),
      ]);
    },
  });

  const tuttoPronto = !!data && data.chiave_google && data.siti_collegati > 0 && !!data.ultimo_dato;
  const ultimoTentativo = siti
    .map((s) => s.ultimo_sync)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);
  const inCorso = chiamaFunzione.isPending ? chiamaFunzione.variables : null;
  const proprietaGa4 = (scoperta?.proprieta_ga4 ?? []).filter(p => /^\d+$/.test(p.id));
  const proprietaGsc = (scoperta?.siti_search_console ?? []).filter(s => /^(sc-domain:|https?:\/\/)/i.test(s));
  const cercaProprieta = ricercaProprieta.trim().toLowerCase();
  const ga4Visibili = (scoperta?.proprieta_ga4 ?? []).filter(p =>
    [p.nome, p.id, p.account].some(v => v?.toLowerCase().includes(cercaProprieta)));
  const gscVisibili = (scoperta?.siti_search_console ?? []).filter(s => s.toLowerCase().includes(cercaProprieta));
  const daVerificare = siti.filter(necessitaVerifica).length;
  const totali = siti.reduce((tot, sito) => {
    if (!sito.attivo || !sito.ultimo_dato) return tot;
    if (sito.gsc_site_url) {
      tot.clic += sito.clic;
      tot.impressioni += sito.impressioni;
    }
    if (sito.ga4_property_id) {
      tot.visite += sito.sessioni;
      tot.viste += sito.visualizzazioni;
    }
    return tot;
  }, { clic: 0, impressioni: 0, visite: 0, viste: 0 });
  const configuraGsc = (proprieta: string) => {
    const host = proprieta.match(/^(?:sc-domain:|https?:\/\/)([^/]+)/i)?.[1];
    if (!host) return;
    const esistente = siti.find(s => dominioSito(s.dominio) === dominioSito(host));
    setInModifica(esistente ? { ...esistente, gsc_site_url: proprieta } : {
      nome: dominioSito(host), dominio: host, gsc_site_url: proprieta, attivo: true,
    });
  };

  return (
    <div className="min-w-0 max-w-[1600px] space-y-4">
      <BrandPageHeader compact icon={Globe} title="Siti e Google"
        subtitle="Raccolta delle metriche GA4 e Search Console per i siti del gruppo." />
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-2.5">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Periodo delle metriche Google">
          {PERIODI_TRAFFICO.map(g => (
            <Button key={g} size="sm" variant={g === giorni ? "secondary" : "ghost"} aria-pressed={g === giorni}
              onClick={() => impostaParametro("giorni", String(g))}>{g} giorni</Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => chiamaFunzione.mutate("scopri")}
                  disabled={chiamaFunzione.isPending}>
            <Search className={`h-4 w-4 md:mr-1.5 ${inCorso === "scopri" ? "animate-pulse" : ""}`} />
            <span className="ml-1.5 md:ml-0">{inCorso === "scopri" ? "Ricerca…" : "Scopri proprietà"}</span>
          </Button>
          <Button size="sm" variant="outline" onClick={() => chiamaFunzione.mutate("sincronizza")}
                  disabled={chiamaFunzione.isPending}>
            <RefreshCw className={`h-4 w-4 md:mr-1.5 ${inCorso === "sincronizza" ? "animate-spin" : ""}`} />
            <span className="ml-1.5 md:ml-0">{inCorso === "sincronizza" ? "Sincronizzazione…" : "Sincronizza"}</span>
          </Button>
          <Button size="sm" onClick={() => setInModifica({ attivo: true })}>
            <Plus className="h-4 w-4 md:mr-1.5" />
            <span className="ml-1.5 md:ml-0">Aggiungi sito</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}
                  aria-label="Ricarica">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            {data ? "Aggiornamento non riuscito. Sono mostrati gli ultimi dati disponibili." : "Impossibile caricare i siti e le metriche Google."}
            <Button size="sm" variant="outline" disabled={isFetching} onClick={() => void refetch()}>Riprova</Button>
          </AlertDescription>
        </Alert>
      )}

      {data && !tuttoPronto && (
        <Card className="border-amber-500/40">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium">
              Il collegamento a Google non è completo
            </p>
            <ul className="text-sm space-y-1">
              <Passo fatto={data.chiave_google}>
                {data.chiave_google
                  ? "Chiave Google caricata"
                  : <>Chiave Google: <strong>non caricata</strong> (nel Vault non c'è «google_service_account»)</>}
              </Passo>
              <Passo fatto={data.siti_collegati > 0}>
                Siti collegati a GA4 o Search Console: {data.siti_collegati} su {siti.length}
              </Passo>
              <Passo fatto={!!data.ultimo_dato}>
                {data.ultimo_dato
                  ? `Dati scaricati fino al ${giorno(data.ultimo_dato)}`
                  : "Dati scaricati: ancora nessuno"}
              </Passo>
            </ul>
            {!data.chiave_google && (
              <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer font-medium text-foreground">Configura l’accesso a Google</summary>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Nel progetto Google Cloud della piattaforma: abilitare <strong>Google Analytics Data API</strong>,
                    <strong> Google Analytics Admin API</strong> e <strong>Search Console API</strong></li>
                <li>Creare un <strong>service account</strong> e scaricarne la chiave in formato JSON</li>
                <li>In Supabase → Vault: nuovo segreto chiamato <code>google_service_account</code>,
                    con dentro il JSON intero</li>
                <li>In GA4 → Amministrazione → Gestione accessi: aggiungere l'email del service account
                    come <em>Visualizzatore</em></li>
                <li>In Search Console → Impostazioni → Utenti: aggiungere la stessa email, per ogni sito</li>
                <li>Premere <strong>Scopri proprietà</strong> e associare i siti.</li>
                </ol>
              </details>
            )}
            {data.chiave_google && data.siti_collegati === 0 && (
              <p className="text-sm text-muted-foreground">
                Premi <strong>Scopri proprietà</strong> per vedere i siti disponibili su Google e associarli.
              </p>
            )}
            {data.chiave_google && data.siti_collegati > 0 && !data.ultimo_dato && (
              <p className="text-sm text-muted-foreground">
                Premi <strong>Sincronizza</strong>: se un sito non riceve dati, il motivo compare sotto il suo nome.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {scoperta && !inModifica && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Proprietà disponibili su Google
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {scoperta.configurato === false ? (
              <p className="text-amber-700 dark:text-amber-400">Configura l’account di servizio Google per trovare le proprietà accessibili.</p>
            ) : scoperta.messaggio && (
              <p className="text-amber-700 dark:text-amber-400">{scoperta.messaggio}</p>
            )}
            {scoperta.error && <p className="text-destructive">{scoperta.error}</p>}
            {scoperta.account && <p className="break-all text-xs text-muted-foreground">{scoperta.account}</p>}
            {scoperta.ok && !proprietaGa4.length && !proprietaGsc.length && (
              <p>Nessuna proprietà selezionabile con l’accesso configurato.</p>
            )}
            {(proprietaGa4.length > 0 || proprietaGsc.length > 0) && (
              <Input aria-label="Cerca proprietà Google" placeholder="Cerca per dominio, nome o ID"
                value={ricercaProprieta} onChange={e => setRicercaProprieta(e.target.value)} />
            )}
            {cercaProprieta && !ga4Visibili.length && !gscVisibili.length && (
              <p className="text-muted-foreground">Nessuna proprietà corrispondente.</p>
            )}
            {ga4Visibili.length > 0 && (
              <div>
                <p className="mb-1 font-medium">Proprietà GA4</p>
                <ul className="max-h-44 space-y-0.5 overflow-y-auto">
                  {ga4Visibili.map((p) => (
                    <li key={p.id || p.nome} className="break-words text-muted-foreground">
                      <code className="text-xs bg-muted px-1 rounded">{p.id}</code> {p.nome}
                      {p.account && <span className="text-xs"> · {p.account}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {gscVisibili.length > 0 && (
              <div>
                <p className="mb-1 font-medium">Proprietà Search Console</p>
                <ul className="max-h-72 space-y-1 overflow-y-auto">
                  {gscVisibili.map((s) => {
                    const associato = siti.some(sito => sito.gsc_site_url === s);
                    return <li key={s} className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b py-1.5 last:border-0">
                      <code className="break-all text-xs text-muted-foreground">{s}</code>
                      {associato ? <Badge variant="secondary">Associato</Badge> : proprietaGsc.includes(s) && (
                        <Button variant="outline" size="sm" onClick={() => configuraGsc(s)} aria-label={`Configura ${s}`}>Configura sito</Button>
                      )}
                    </li>;
                  })}
                </ul>
              </div>
            )}
            <Button size="sm" variant="ghost" onClick={() => setScoperta(null)}>Chiudi</Button>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      )}

      {data && (
        <section aria-label="Riepilogo dei siti del gruppo" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Globe className="size-4 shrink-0" aria-hidden="true" /> Siti collegati</p>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums">{data.siti_collegati} <span className="text-sm font-normal text-muted-foreground">su {siti.length}</span></p>
              <p className="text-xs text-muted-foreground">{data.ultimo_dato ? `Dati fino al ${giorno(data.ultimo_dato)}` : "Importazione in attesa"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><MousePointer2 className="size-4 shrink-0" aria-hidden="true" /> Clic da Google</p>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums">{totali.impressioni || totali.clic ? numero.format(totali.clic) : "—"}</p>
              <p className="text-xs text-muted-foreground">{numero.format(totali.impressioni)} impressioni</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Activity className="size-4 shrink-0" aria-hidden="true" /> Visite GA4</p>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums">{totali.visite || totali.viste ? numero.format(totali.visite) : "—"}</p>
              <p className="text-xs text-muted-foreground">{numero.format(totali.viste)} pagine viste</p>
            </CardContent>
          </Card>
          <Card className={stato === "verifica" ? "border-primary" : ""}>
            <button type="button" aria-pressed={stato === "verifica"} aria-label="Mostra i siti da verificare"
              onClick={() => impostaParametro("stato", stato === "verifica" ? null : "verifica")}
              className="h-full w-full rounded-lg p-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><AlertTriangle className="size-4 shrink-0" aria-hidden="true" /> Da verificare</p>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums">{daVerificare}</p>
              <p className="text-xs text-muted-foreground">{daVerificare ? "Errori o fonti da completare" : "Nessun sito attivo da verificare"}</p>
            </button>
          </Card>
        </section>
      )}

      {data && (
        <Card>
          <CardHeader className="space-y-3 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Siti monitorati</CardTitle>
                <p aria-live="polite" className="mt-1 text-xs text-muted-foreground">{sitiVisibili.length} di {siti.length} siti · Ultimi {giorni} giorni</p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link to={`/admin/sito?giorni=${giorni}`}><BarChart3 className="size-4" /> Traffico sito</Link>
              </Button>
            </div>
            <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-3 lg:grid-cols-[minmax(12rem,1.3fr)_repeat(3,minmax(8rem,1fr))_auto]">
              <label className="col-span-2 min-w-0 text-xs font-medium text-muted-foreground sm:col-span-3 lg:col-span-1">
                Cerca sito
                <span className="relative mt-1 block">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2" aria-hidden="true" />
                  <Input type="search" placeholder="Nome o dominio" className="h-9 pl-8"
                    value={ricercaSiti} onChange={e => impostaParametro("q", e.target.value || null)} />
                </span>
              </label>
              <FiltroSiti label="Stato" value={stato} options={STATI}
                onChange={v => impostaParametro("stato", v === "tutti" ? null : v)} />
              <FiltroSiti label="Fonti collegate" value={fonte} options={FONTI}
                onChange={v => impostaParametro("fonte", v === "tutte" ? null : v)} />
              <FiltroSiti label="Ordina per" value={ordine} options={ORDINAMENTI}
                onChange={v => impostaParametro("ordine", v === "nome" ? null : v)} />
              <Button type="button" size="sm" variant="ghost" onClick={azzeraFiltri} disabled={!filtriAttivi}
                className="justify-self-end"><X className="size-4" /> Azzera</Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto border-t p-0">
            <table className="w-full table-fixed text-sm">
              <caption className="sr-only">Prestazioni per sito e fonte Google</caption>
              <colgroup><col className="w-[44%] sm:w-[50%]" /><col /><col /><col className="w-10 sm:w-12" /></colgroup>
              <thead className="border-b bg-muted/40">
                <tr className="text-left">
                  <th scope="col" className="px-3 py-2 font-medium sm:px-4">Sito</th>
                  <th scope="col" className="px-1 py-2 text-right font-medium sm:px-2">Search Console</th>
                  <th scope="col" className="px-1 py-2 text-right font-medium sm:px-2">GA4</th>
                  <th scope="col"><span className="sr-only">Azioni</span></th>
                </tr>
              </thead>
              <tbody>
                {sitiVisibili.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center">
                    <p className="font-medium">{siti.length ? "Nessun sito corrispondente" : "Nessun sito monitorato"}</p>
                    {siti.length
                      ? <Button size="sm" variant="link" onClick={azzeraFiltri}>Azzera i filtri</Button>
                      : <p className="mt-1 text-sm text-muted-foreground">Usa «Scopri proprietà» o «Aggiungi sito».</p>}
                  </td></tr>
                )}
                {sitiVisibili.map(s => (
                  <Fragment key={s.id}>
                    <tr className="border-b last:border-0 hover:bg-muted/30">
                      <td className="min-w-0 px-3 py-2.5 sm:px-4">
                        <button type="button" className="inline-flex max-w-full items-start gap-1.5 text-left font-semibold hover:underline"
                          aria-expanded={dettaglio === s.id}
                          onClick={() => impostaParametro("sito", dettaglio === s.id ? null : dominioSito(s.dominio))}>
                          <ChevronDown className={`mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform ${dettaglio === s.id ? "" : "-rotate-90"}`} aria-hidden="true" />
                          <span className="[overflow-wrap:anywhere]">{s.nome}</span>
                        </button>
                        <p className="block break-all text-xs text-muted-foreground">{s.dominio}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[11px] text-muted-foreground">{statoSito(s)}</span>
                          {!s.attivo && <Badge variant="secondary" className="text-[10px]">Sospeso</Badge>}
                          {s.ultimo_errore
                            ? <Badge variant="destructive" className="gap-1 text-[10px]"><AlertTriangle className="size-3" /> Errore</Badge>
                            : s.attivo && (!s.ga4_property_id || !s.gsc_site_url) && <Badge variant="outline" className="text-[10px]">Fonti da completare</Badge>}
                        </div>
                      </td>
                      <td className="px-1 py-2.5 text-right sm:px-2">
                        <DatoSito titolo="clic" valore={s.gsc_site_url && s.ultimo_dato ? s.clic : null} confronto={crescita(s.clic, s.clic_prima)} />
                        {s.gsc_site_url && s.ultimo_dato && <p className="mt-0.5 text-xs text-muted-foreground">{numero.format(s.impressioni)} impr.</p>}
                        {s.posizione_media != null && <p className="hidden text-[11px] text-muted-foreground lg:block">Pos. {numero.format(s.posizione_media)}{s.ctr_pct != null && ` · CTR ${numero.format(s.ctr_pct)}%`}</p>}
                      </td>
                      <td className="px-1 py-2.5 text-right sm:px-2">
                        <DatoSito titolo="visite" valore={s.ga4_property_id && s.ultimo_dato ? s.sessioni : null} confronto={crescita(s.sessioni, s.sessioni_prima)} />
                        {s.ga4_property_id && s.ultimo_dato && <p className="mt-0.5 text-xs text-muted-foreground">{numero.format(s.visualizzazioni)} viste</p>}
                        {s.durata_media_s != null && <p className="hidden text-[11px] text-muted-foreground lg:block">{durata(s.durata_media_s)} a visita</p>}
                      </td>
                      <td className="p-1 text-center">
                        <Button size="icon" variant="ghost" className="size-8" aria-label={`Modifica ${s.nome}`}
                          onClick={() => setInModifica(s)}><Settings2 className="size-4" /></Button>
                      </td>
                    </tr>
                    {s.ultimo_errore && (
                      <tr className="border-b last:border-0">
                        <td colSpan={4} className="px-3 pb-2 text-xs text-destructive [overflow-wrap:anywhere]">
                          {s.ultimo_errore}
                        </td>
                      </tr>
                    )}
                    {dettaglio === s.id && (
                      <tr className="border-b last:border-0 bg-muted/20">
                        <td colSpan={4} className="p-3 sm:p-4">
                          <div className="mb-3 grid gap-2 rounded-md border bg-card p-3 text-xs sm:grid-cols-2">
                            <div className="[overflow-wrap:anywhere]">
                              <p className="font-medium">Search Console</p>
                              <p className="text-muted-foreground">{s.gsc_site_url ?? "Proprietà da associare"}</p>
                              {!!s.gsc_site_url && <p className="mt-1">CTR {s.ctr_pct == null ? "—" : `${numero.format(s.ctr_pct)}%`} · Pos. {s.posizione_media == null ? "—" : numero.format(s.posizione_media)} · {numero.format(s.pagine_viste_da_google)} pagine su Google</p>}
                            </div>
                            <div className="[overflow-wrap:anywhere]">
                              <p className="font-medium">GA4</p>
                              <p className="text-muted-foreground">{s.ga4_property_id ?? "Proprietà da associare"}</p>
                              {!!s.ga4_property_id && s.durata_media_s != null && <p className="mt-1">Durata media della visita {durata(s.durata_media_s)}</p>}
                            </div>
                          </div>
                          {caricaPagine && <Skeleton className="h-24 w-full" />}
                          {errorePagine && <div className="flex flex-wrap items-center gap-2 text-sm" role="alert">
                            Impossibile aggiornare il dettaglio Google.
                            <Button size="sm" variant="outline" onClick={() => void ricaricaPagine()}>Riprova dettaglio</Button>
                          </div>}
                          {((!caricaPagine && !errorePagine) || pagine) && (
                            <div className="grid gap-4 lg:grid-cols-2">
                              <div>
                                <p className="text-xs font-medium mb-1">Pagine che Google mostra</p>
                                {(pagine?.ricerca?.length ?? 0) === 0 && (
                                  <p className="text-xs text-muted-foreground">Nessun dato di ricerca nel periodo.</p>
                                )}
                                {(pagine?.ricerca ?? []).slice(0, 12).map((p) => (
                                  <div key={p.percorso} className="flex items-baseline justify-between gap-2 py-0.5">
                                    <span className="font-mono text-[11px] truncate" title={p.percorso}>
                                      {percorsoLeggibile(p.percorso, s.dominio)}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                      {p.impressioni.toLocaleString("it-IT")} impr · {p.clic} clic
                                      {p.posizione !== null && ` · pos ${p.posizione}`}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <div>
                                <p className="text-xs font-medium mb-1">Pagine più aperte</p>
                                {(pagine?.visite?.length ?? 0) === 0 && (
                                  <p className="text-xs text-muted-foreground">Nessun dato GA4 nel periodo.</p>
                                )}
                                {(pagine?.visite ?? []).slice(0, 12).map((p) => (
                                  <div key={p.percorso} className="flex items-baseline justify-between gap-2 py-0.5">
                                    <span className="font-mono text-[11px] truncate" title={p.percorso}>{p.percorso}</span>
                                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                      {p.visualizzazioni.toLocaleString("it-IT")} viste
                                      {p.durata_media_s !== null && ` · ${durata(p.durata_media_s)} a vista`}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!inModifica} onOpenChange={(o) => !o && setInModifica(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{inModifica?.id ? "Modifica sito" : "Nuovo sito"}</DialogTitle>
            <DialogDescription>Associa le proprietà Google a questo dominio.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" value={inModifica?.nome ?? ""}
                     onChange={(e) => setInModifica({ ...inModifica, nome: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="dominio">Dominio</Label>
              <Input id="dominio" placeholder="www.esempio.it" value={inModifica?.dominio ?? ""}
                     onChange={(e) => setInModifica({ ...inModifica, dominio: e.target.value })} />
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" disabled={chiamaFunzione.isPending} onClick={() => chiamaFunzione.mutate("scopri")}>
                  <Search className="size-4" /> {inCorso === "scopri" ? "Ricerca…" : "Scopri proprietà"}
                </Button>
                {scoperta?.configurato === false && <span className="text-xs text-muted-foreground">Accesso Google da configurare.</span>}
              </div>
              <Label htmlFor="ga4">Proprietà GA4</Label>
              <Input id="ga4" placeholder="123456789" value={inModifica?.ga4_property_id ?? ""}
                     onChange={(e) => setInModifica({ ...inModifica, ga4_property_id: e.target.value })} />
              <p className="text-[11px] text-muted-foreground mt-1">
                Usa l’ID numerico della proprietà GA4.
              </p>
              {proprietaGa4.length > 0 && (
                <Select value={proprietaGa4.some(p => p.id === inModifica?.ga4_property_id) ? inModifica?.ga4_property_id : ""}
                  onValueChange={v => setInModifica(s => s && { ...s, ga4_property_id: v })}>
                  <SelectTrigger aria-label="Scegli proprietà GA4" className="mt-2 min-w-0 [&>span]:truncate"><SelectValue placeholder="Scegli tra le proprietà visibili" /></SelectTrigger>
                  <SelectContent>
                    {proprietaGa4.map(p => <SelectItem key={p.id} value={p.id}>{p.nome || "GA4"} · {p.id}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {scoperta?.proprieta_ga4?.filter(p => !p.id).map(p => <p key={p.nome} className="break-words text-xs text-destructive">{p.nome}</p>)}
            </div>
            <div>
              <Label htmlFor="gsc">Sito in Search Console</Label>
              <Input id="gsc" placeholder="sc-domain:esempio.it oppure https://www.esempio.it/"
                     value={inModifica?.gsc_site_url ?? ""}
                     onChange={(e) => setInModifica({ ...inModifica, gsc_site_url: e.target.value })} />
              <p className="text-[11px] text-muted-foreground mt-1">
                Usa l’identificativo esatto mostrato in Search Console.
              </p>
              {proprietaGsc.length > 0 && (
                <Select value={proprietaGsc.includes(inModifica?.gsc_site_url ?? "") ? inModifica?.gsc_site_url ?? "" : ""}
                  onValueChange={v => setInModifica(s => s && { ...s, gsc_site_url: v })}>
                  <SelectTrigger aria-label="Scegli proprietà Search Console" className="mt-2 min-w-0 [&>span]:truncate"><SelectValue placeholder="Scegli tra i siti visibili" /></SelectTrigger>
                  <SelectContent>
                    {proprietaGsc.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {scoperta?.siti_search_console?.filter(p => /^errore:/i.test(p)).map(p => <p key={p} className="break-words text-xs text-destructive">{p}</p>)}
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <Label htmlFor="sito-google-attivo">Raccolta attiva</Label>
                <p className="text-xs text-muted-foreground">Include il sito nelle sincronizzazioni Google.</p>
              </div>
              <Switch id="sito-google-attivo" checked={inModifica?.attivo ?? true}
                onCheckedChange={attivo => setInModifica(s => s && { ...s, attivo })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInModifica(null)}>Annulla</Button>
            <Button onClick={() => inModifica && salva.mutate(inModifica)}
              disabled={salva.isPending || !inModifica?.nome?.trim() || !inModifica?.dominio?.trim()}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {data && (
        <p className="text-[11px] text-muted-foreground">
          {ultimoTentativo
            ? `Ultima raccolta tentata ${format(new Date(ultimoTentativo), "dd/MM HH:mm")}`
            : "Nessuna raccolta registrata"}
          {" · "}Raccolta automatica alle {oraRaccolta()} (Roma) sugli ultimi 14 giorni.
        </p>
      )}
    </div>
  );
}
