/**
 * Siti e Google — quello che GA4 e Search Console sanno dei nostri siti,
 * scaricato una volta al giorno e conservato qui.
 *
 * Le due fonti non si sommano e non si sostituiscono. Search Console dice
 * quante volte Google ha mostrato il sito e quante volte l'hanno cliccato;
 * GA4 dice cosa è successo dopo. Un sito con zero impressioni non ha un
 * problema di conversione: non lo trova nessuno, ed è lì che si interviene.
 *
 * Fino all'11/09/2026 la pagina non aveva mai mostrato un numero: la chiave
 * Google non era mai stata caricata, la raccolta notturna rispondeva «ok»
 * senza scaricare nulla e «Sincronizza» diceva «completata» qualunque cosa
 * fosse successa. Il riquadro in alto ora guarda le cose vere — la chiave,
 * gli ID dei siti, i dati arrivati — e ogni sito dice perché è fermo.
 */
import { Fragment, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Globe, RefreshCw, Search, Settings2, Plus, AlertTriangle, CheckCircle2, XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Sito {
  id: string; nome: string; dominio: string;
  ga4_property_id: string | null; gsc_site_url: string | null;
  attivo: boolean; ultimo_sync: string | null; ultimo_errore: string | null;
  /** Ultimo giorno per cui ci sono numeri, di qualunque fonte. */
  ultimo_dato: string | null;
  utenti: number; sessioni: number; visualizzazioni: number;
  /** Durata di una visita, pesata sulle visite di ogni giorno. */
  durata_media_s: number | null;
  sessioni_prima: number; visualizzazioni_prima: number;
  impressioni: number; clic: number;
  /** Pesata sulle impressioni, come la calcola Google. */
  posizione_media: number | null;
  clic_prima: number; ctr_pct: number | null; pagine_viste_da_google: number;
}

interface Metriche {
  giorni: number; siti: Sito[]; calcolato_il: string;
  /** Nel Vault, oppure provata da una raccolta riuscita su un sito collegato. */
  chiave_google: boolean;
  /** Siti attivi con almeno un ID fra GA4 e Search Console. */
  siti_collegati: number;
  ultimo_dato: string | null;
  configurato: boolean;
}

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

const PERIODI = [7, 28, 90];

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
  return format(d, "HH:mm");
}

/**
 * Cosa dire dopo «Sincronizza». Prima era sempre «Sincronizzazione
 * completata», anche quando la funzione rispondeva che non poteva partire.
 */
function esitoSincronizzazione(r: EsitoSincronizzazione): { tipo: "success" | "warning" | "error"; testo: string } {
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
    return { tipo: "warning", testo: "Nessun dato scaricato: nessun sito ha GA4 o Search Console collegati" };
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

export default function SitiGooglePage() {
  const [giorni, setGiorni] = useState(28);
  const [inModifica, setInModifica] = useState<Partial<Sito> | null>(null);
  const [scoperta, setScoperta] = useState<Scoperta | null>(null);
  const [dettaglio, setDettaglio] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["admin-siti-metriche", giorni],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_siti_metriche" as never,
        { p_giorni: giorni } as never);
      if (error) throw error;
      return data as unknown as Metriche;
    },
    staleTime: 60_000,
  });

  const { data: pagine, isFetching: caricaPagine } = useQuery({
    queryKey: ["admin-sito-pagine", dettaglio, giorni],
    enabled: !!dettaglio,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_sito_pagine_google" as never,
        { p_sito_id: dettaglio, p_giorni: giorni } as never);
      if (error) throw error;
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
      return { azione, risposta: data as Scoperta & EsitoSincronizzazione };
    },
    onSuccess: ({ azione, risposta }) => {
      if (azione === "scopri") {
        setScoperta(risposta);
        if (risposta.configurato === false) toast.warning("Manca la chiave Google: vedi le istruzioni in alto");
        return;
      }
      const esito = esitoSincronizzazione(risposta);
      toast[esito.tipo](esito.testo);
    },
    onError: (e) => toast.error((e as Error).message),
    // Anche quando va male i siti cambiano: la funzione scrive su ognuno perché è fermo.
    onSettled: (_r, _e, azione) => {
      if (azione === "sincronizza") qc.invalidateQueries({ queryKey: ["admin-siti-metriche"] });
    },
  });

  const siti = data?.siti ?? [];
  const tuttoPronto = !!data && data.chiave_google && data.siti_collegati > 0 && !!data.ultimo_dato;
  const ultimoTentativo = siti
    .map((s) => s.ultimo_sync)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);
  const inCorso = chiamaFunzione.isPending ? chiamaFunzione.variables : null;

  return (
    <div className="p-3 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="hidden md:flex items-center gap-3">
          <Globe className="h-6 w-6 text-blue-500" />
          <div>
            <h1 className="text-xl font-semibold">Siti e Google</h1>
            <p className="text-sm text-muted-foreground">
              Quante volte Google ci mostra, quanti entrano, e su quali pagine
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 ml-auto">
          {PERIODI.map((g) => (
            <Button key={g} size="sm" variant={g === giorni ? "default" : "outline"}
                    onClick={() => setGiorni(g)}>{g}g</Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => chiamaFunzione.mutate("scopri")}
                  disabled={chiamaFunzione.isPending}>
            <Search className={`h-4 w-4 md:mr-1.5 ${inCorso === "scopri" ? "animate-pulse" : ""}`} />
            <span className="hidden md:inline">Scopri proprietà</span>
          </Button>
          <Button size="sm" variant="outline" onClick={() => chiamaFunzione.mutate("sincronizza")}
                  disabled={chiamaFunzione.isPending}>
            <RefreshCw className={`h-4 w-4 md:mr-1.5 ${inCorso === "sincronizza" ? "animate-spin" : ""}`} />
            <span className="hidden md:inline">Sincronizza</span>
          </Button>
          <Button size="sm" onClick={() => setInModifica({ attivo: true })}>
            <Plus className="h-4 w-4 md:mr-1.5" />
            <span className="hidden md:inline">Sito</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}
                  aria-label="Ricarica">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {error && (
        <Card><CardContent className="p-6">
          <p className="text-sm text-destructive">Errore: {(error as Error).message}</p>
        </CardContent></Card>
      )}

      {data && !tuttoPronto && (
        <Card className="border-amber-500/40">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium">
              Il collegamento a Google non è completo: per questo qui non ci sono ancora numeri
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
              <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
                <li>Nel progetto Google Cloud della piattaforma: abilitare <strong>Google Analytics Data API</strong>,
                    <strong> Google Analytics Admin API</strong> e <strong>Search Console API</strong></li>
                <li>Creare un <strong>service account</strong> e scaricarne la chiave in formato JSON</li>
                <li>In Supabase → Vault: nuovo segreto chiamato <code>google_service_account</code>,
                    con dentro il JSON intero</li>
                <li>In GA4 → Amministrazione → Gestione accessi: aggiungere l'email del service account
                    come <em>Visualizzatore</em></li>
                <li>In Search Console → Impostazioni → Utenti: aggiungere la stessa email, per ogni sito</li>
                <li>Premere <strong>Scopri proprietà</strong> e incollare gli identificativi nei siti (⚙)</li>
              </ol>
            )}
            {data.chiave_google && data.siti_collegati === 0 && (
              <p className="text-sm text-muted-foreground">
                Premi <strong>Scopri proprietà</strong>, poi apri ogni sito con ⚙ e incolla gli identificativi.
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

      {scoperta && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Cosa vede il service account{scoperta.account ? ` (${scoperta.account})` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {scoperta.messaggio && <p className="text-amber-600">{scoperta.messaggio}</p>}
            {scoperta.error && <p className="text-destructive">{scoperta.error}</p>}
            {!!scoperta.proprieta_ga4?.length && (
              <div>
                <p className="font-medium mb-1">Proprietà GA4</p>
                <ul className="space-y-0.5">
                  {scoperta.proprieta_ga4.map((p) => (
                    <li key={p.id || p.nome} className="text-muted-foreground">
                      <code className="text-xs bg-muted px-1 rounded">{p.id}</code> {p.nome}
                      {p.account && <span className="text-xs"> · {p.account}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!!scoperta.siti_search_console?.length && (
              <div>
                <p className="font-medium mb-1">Siti in Search Console</p>
                <ul className="space-y-0.5">
                  {scoperta.siti_search_console.map((s) => (
                    <li key={s} className="text-muted-foreground">
                      <code className="text-xs bg-muted px-1 rounded">{s}</code>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Button size="sm" variant="ghost" onClick={() => setScoperta(null)}>Chiudi</Button>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      )}

      {!isLoading && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left">
                  <th className="p-2 font-medium">Sito</th>
                  <th className="p-2 font-medium text-right" title="Search Console">Impressioni</th>
                  <th className="p-2 font-medium text-right" title="Search Console">Clic</th>
                  <th className="p-2 font-medium text-right hidden md:table-cell" title="Search Console">CTR</th>
                  <th className="p-2 font-medium text-right hidden md:table-cell"
                      title="Search Console, media pesata sulle impressioni">Posizione</th>
                  <th className="p-2 font-medium text-right" title="GA4: sessioni">Visite</th>
                  <th className="p-2 font-medium text-right hidden lg:table-cell" title="GA4">Pagine viste</th>
                  <th className="p-2 font-medium text-right hidden lg:table-cell"
                      title="GA4, media pesata sulle visite">Durata visita</th>
                  <th className="p-2 font-medium text-right hidden xl:table-cell"
                      title="Pagine che Google ha mostrato almeno una volta nel periodo">Pagine su Google</th>
                  <th className="p-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {siti.length === 0 && (
                  <tr><td colSpan={10} className="p-4 text-center text-muted-foreground">
                    Nessun sito. Aggiungine uno con il pulsante «Sito».
                  </td></tr>
                )}
                {siti.map((s) => (
                  <Fragment key={s.id}>
                    <tr className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                        onClick={() => setDettaglio(dettaglio === s.id ? null : s.id)}>
                      <td className="p-2">
                        <span className="font-medium">{s.nome}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {s.dominio} · {statoSito(s)}
                        </span>
                        <span className="flex flex-wrap gap-1 mt-0.5">
                          {!s.ga4_property_id && <Badge variant="outline" className="text-[10px]">GA4 da collegare</Badge>}
                          {!s.gsc_site_url && <Badge variant="outline" className="text-[10px]">Search Console da collegare</Badge>}
                          {!s.attivo && <Badge variant="secondary" className="text-[10px]">sospeso</Badge>}
                          {s.ultimo_errore && (
                            <Badge variant="destructive" className="text-[10px] gap-1">
                              <AlertTriangle className="h-3 w-3" /> errore
                            </Badge>
                          )}
                        </span>
                      </td>
                      <td className="p-2 text-right tabular-nums">{s.impressioni.toLocaleString("it-IT")}</td>
                      <td className="p-2 text-right tabular-nums">
                        {s.clic.toLocaleString("it-IT")}
                        {crescita(s.clic, s.clic_prima) && (
                          <span className="block text-[10px] text-muted-foreground">
                            {crescita(s.clic, s.clic_prima)}
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-right tabular-nums hidden md:table-cell">
                        {s.ctr_pct === null ? "—" : `${s.ctr_pct}%`}
                      </td>
                      <td className="p-2 text-right tabular-nums hidden md:table-cell">
                        {s.posizione_media === null ? "—" : s.posizione_media}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {s.sessioni.toLocaleString("it-IT")}
                        {crescita(s.sessioni, s.sessioni_prima) && (
                          <span className="block text-[10px] text-muted-foreground">
                            {crescita(s.sessioni, s.sessioni_prima)}
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-right tabular-nums hidden lg:table-cell">
                        {s.visualizzazioni.toLocaleString("it-IT")}
                      </td>
                      <td className="p-2 text-right tabular-nums hidden lg:table-cell">
                        {durata(s.durata_media_s)}
                      </td>
                      <td className="p-2 text-right tabular-nums hidden xl:table-cell">
                        {s.pagine_viste_da_google || "—"}
                      </td>
                      <td className="p-2 text-right">
                        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Modifica ${s.nome}`}
                                onClick={(e) => { e.stopPropagation(); setInModifica(s); }}>
                          <Settings2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                    {s.ultimo_errore && (
                      <tr className="border-b last:border-0">
                        <td colSpan={10} className="px-2 pb-2 text-[11px] text-destructive">
                          {s.ultimo_errore}
                        </td>
                      </tr>
                    )}
                    {dettaglio === s.id && (
                      <tr className="border-b last:border-0 bg-muted/20">
                        <td colSpan={10} className="p-3">
                          {caricaPagine && <Skeleton className="h-24 w-full" />}
                          {!caricaPagine && (
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
          <CardContent className="pt-3">
            <p className="text-[11px] text-muted-foreground">
              <strong>Impressioni</strong> è quante volte Google ha mostrato il sito nei risultati,
              <strong> clic</strong> quante volte l'hanno aperto. Molte impressioni e pochi clic è un
              problema di titolo o di posizione; poche impressioni è un problema di indicizzazione, e
              nessun lavoro sulla pagina lo risolve. Posizione e durata sono medie pesate, come in
              Google. I dati di Search Console arrivano con due o tre giorni di ritardo.
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!inModifica} onOpenChange={(o) => !o && setInModifica(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{inModifica?.id ? "Modifica sito" : "Nuovo sito"}</DialogTitle>
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
              <Label htmlFor="ga4">Proprietà GA4</Label>
              <Input id="ga4" placeholder="123456789" value={inModifica?.ga4_property_id ?? ""}
                     onChange={(e) => setInModifica({ ...inModifica, ga4_property_id: e.target.value })} />
              <p className="text-[11px] text-muted-foreground mt-1">
                Solo il numero della proprietà. Non il codice «G-…»: quello è il tag che sta nel sito.
                Lo trovi con «Scopri proprietà».
              </p>
            </div>
            <div>
              <Label htmlFor="gsc">Sito in Search Console</Label>
              <Input id="gsc" placeholder="sc-domain:esempio.it oppure https://www.esempio.it/"
                     value={inModifica?.gsc_site_url ?? ""}
                     onChange={(e) => setInModifica({ ...inModifica, gsc_site_url: e.target.value })} />
              <p className="text-[11px] text-muted-foreground mt-1">
                Copiato esattamente com'è in Search Console: la proprietà «dominio» e quella
                «prefisso URL» sono due cose diverse e non si equivalgono.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInModifica(null)}>Annulla</Button>
            <Button onClick={() => inModifica && salva.mutate(inModifica)} disabled={salva.isPending}>
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
          {" · "}parte da sola ogni mattina alle {oraRaccolta()} e riscarica gli ultimi quattordici giorni
        </p>
      )}
    </div>
  );
}
