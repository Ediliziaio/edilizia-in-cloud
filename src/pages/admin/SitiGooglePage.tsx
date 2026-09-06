/**
 * Siti e Google — quello che GA4 e Search Console sanno dei nostri siti,
 * scaricato una volta al giorno e conservato qui.
 *
 * Le due fonti non si sommano e non si sostituiscono. Search Console dice
 * quante volte Google ha mostrato il sito e quante volte l'hanno cliccato;
 * GA4 dice cosa è successo dopo. Un sito con zero impressioni non ha un
 * problema di conversione: non lo trova nessuno, ed è lì che si interviene.
 */
import { Fragment, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Globe, RefreshCw, Search, Settings2, Plus, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Sito {
  id: string; nome: string; dominio: string;
  ga4_property_id: string | null; gsc_site_url: string | null;
  attivo: boolean; ultimo_sync: string | null; ultimo_errore: string | null;
  utenti: number; sessioni: number; visualizzazioni: number; durata_media_s: number | null;
  visualizzazioni_prima: number;
  impressioni: number; clic: number; posizione_media: number | null;
  clic_prima: number; ctr_pct: number | null; pagine_viste_da_google: number;
}

interface Metriche { giorni: number; siti: Sito[]; configurato: boolean; calcolato_il: string }

interface Scoperta {
  ok: boolean; configurato?: boolean; messaggio?: string; account?: string;
  proprieta_ga4?: Array<{ id: string; nome: string; account: string }>;
  siti_search_console?: string[];
  error?: string;
}

const PERIODI = [7, 28, 90];

function crescita(ora: number, prima: number): string | null {
  if (!prima) return null;
  const d = Math.round(((ora - prima) / prima) * 100);
  return `${d > 0 ? "+" : ""}${d}%`;
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
        ricerca: Array<{ percorso: string; impressioni: number; clic: number; posizione: number; ctr_pct: number | null }>;
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
        body: { azione, giorni: 28 },
      });
      if (error) throw error;
      return { azione, risposta: data as Scoperta };
    },
    onSuccess: ({ azione, risposta }) => {
      if (azione === "scopri") {
        setScoperta(risposta);
        if (risposta.configurato === false) toast.warning(risposta.messaggio ?? "Service account non configurato");
      } else {
        toast.success("Sincronizzazione completata");
        qc.invalidateQueries({ queryKey: ["admin-siti-metriche"] });
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const siti = data?.siti ?? [];

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
            <Search className="h-4 w-4 md:mr-1.5" />
            <span className="hidden md:inline">Scopri proprietà</span>
          </Button>
          <Button size="sm" variant="outline" onClick={() => chiamaFunzione.mutate("sincronizza")}
                  disabled={chiamaFunzione.isPending}>
            <RefreshCw className={`h-4 w-4 md:mr-1.5 ${chiamaFunzione.isPending ? "animate-spin" : ""}`} />
            <span className="hidden md:inline">Sincronizza</span>
          </Button>
          <Button size="sm" onClick={() => setInModifica({ attivo: true })}>
            <Plus className="h-4 w-4 md:mr-1.5" />
            <span className="hidden md:inline">Sito</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {error && (
        <Card><CardContent className="p-6">
          <p className="text-sm text-destructive">Errore: {(error as Error).message}</p>
        </CardContent></Card>
      )}

      {data && !data.configurato && (
        <Card className="border-amber-500/40">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-medium">Manca ancora il collegamento a Google</p>
            <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
              <li>Nel progetto Google Cloud già in uso: abilitare <strong>Google Analytics Data API</strong>,
                  <strong> Google Analytics Admin API</strong> e <strong>Search Console API</strong></li>
              <li>Creare un <strong>service account</strong> e scaricarne la chiave JSON</li>
              <li>Caricare quel JSON nel Vault di Supabase con nome <code>google_service_account</code></li>
              <li>In ogni proprietà GA4: aggiungere l'email del service account come <em>Visualizzatore</em></li>
              <li>In Search Console, per ogni sito: aggiungere la stessa email fra gli utenti</li>
              <li>Premere <strong>Scopri proprietà</strong> qui sopra e incollare gli identificativi nei siti</li>
            </ol>
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
                  <th className="p-2 font-medium text-right">Impressioni</th>
                  <th className="p-2 font-medium text-right">Clic</th>
                  <th className="p-2 font-medium text-right hidden md:table-cell">CTR</th>
                  <th className="p-2 font-medium text-right hidden md:table-cell">Posizione</th>
                  <th className="p-2 font-medium text-right">Visite</th>
                  <th className="p-2 font-medium text-right hidden lg:table-cell">Pagine viste da Google</th>
                  <th className="p-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {siti.length === 0 && (
                  <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">
                    Nessun sito. Aggiungine uno con il pulsante «Sito».
                  </td></tr>
                )}
                {siti.map((s) => (
                  <Fragment key={s.id}>
                    <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                        onClick={() => setDettaglio(dettaglio === s.id ? null : s.id)}>
                      <td className="p-2">
                        <span className="font-medium">{s.nome}</span>
                        <span className="block text-[11px] text-muted-foreground">{s.dominio}</span>
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
                        {s.visualizzazioni.toLocaleString("it-IT")}
                        {crescita(s.visualizzazioni, s.visualizzazioni_prima) && (
                          <span className="block text-[10px] text-muted-foreground">
                            {crescita(s.visualizzazioni, s.visualizzazioni_prima)}
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-right tabular-nums hidden lg:table-cell">
                        {s.pagine_viste_da_google || "—"}
                      </td>
                      <td className="p-2 text-right">
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                                onClick={(e) => { e.stopPropagation(); setInModifica(s); }}>
                          <Settings2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                    {s.ultimo_errore && (
                      <tr key={`${s.id}-err`} className="border-b last:border-0">
                        <td colSpan={8} className="px-2 pb-2 text-[11px] text-destructive">
                          {s.ultimo_errore}
                        </td>
                      </tr>
                    )}
                    {dettaglio === s.id && (
                      <tr key={`${s.id}-det`} className="border-b last:border-0 bg-muted/20">
                        <td colSpan={8} className="p-3">
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
                                    <span className="font-mono text-[11px] truncate">{p.percorso}</span>
                                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                      {p.impressioni} impr · {p.clic} clic · pos {p.posizione}
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
                                    <span className="font-mono text-[11px] truncate">{p.percorso}</span>
                                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                      {p.visualizzazioni} viste · {p.utenti} utenti
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
              nessun lavoro sulla pagina lo risolve. I dati di Search Console arrivano con due o tre
              giorni di ritardo.
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
                Solo il numero, senza «properties/». Lo trovi con «Scopri proprietà».
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
          Aggiornato {format(new Date(data.calcolato_il), "HH:mm")} · la raccolta gira ogni notte
          alle 05:35 UTC su una finestra di quattordici giorni
        </p>
      )}
    </div>
  );
}
