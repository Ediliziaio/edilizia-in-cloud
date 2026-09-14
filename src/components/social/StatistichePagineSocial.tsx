/**
 * Statistiche vere di Pagina Facebook e profilo Instagram (scheda «Analitiche»
 * del Social Manager). Legge social_statistiche_*; «Aggiorna ora» chiama
 * meta-api-proxy (azione sincronizza-statistiche-social). Nessun dato finto:
 * quello che Meta non dà resta «—», e se manca il permesso si dice di
 * ricollegare Meta.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ExternalLink,
  Eye,
  Heart,
  Loader2,
  MessageSquare,
  MousePointerClick,
  RefreshCw,
  Share2,
  UserPlus,
  Users,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SocialConnectedAccount } from "@/lib/social/types";
import {
  PERIODI_STATISTICHE,
  etichettaUltimaSync,
  formatNumero,
  formatVariazione,
  interazioniPost,
  miglioriPost,
  riepilogaStatistiche,
  type PeriodoStatistiche,
  type PiattaformaStatistiche,
  type RigaStatisticaGiornaliera,
  type RigaStatisticaPost,
  type StatoStatisticheAccount,
} from "@/lib/social/statisticheSocial";

// Tabelle nuove, non ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromTable = (name: string) => (supabase as any).from(name);

const NOME_PIATTAFORMA: Record<PiattaformaStatistiche, string> = { facebook: "Facebook", instagram: "Instagram" };
const STILE_PIATTAFORMA: Record<PiattaformaStatistiche, { badge: string; sigla: string; barra: string; barraChiara: string }> = {
  facebook: { badge: "from-blue-600 to-blue-700", sigla: "f", barra: "#2563eb", barraChiara: "#bfdbfe" },
  instagram: { badge: "from-fuchsia-500 via-pink-500 to-orange-400", sigla: "IG", barra: "#db2777", barraChiara: "#fbcfe8" },
};

interface DatiStatistiche {
  stati: StatoStatisticheAccount[];
  giorni: RigaStatisticaGiornaliera[];
  post: RigaStatisticaPost[];
}

interface AccountVisibile {
  chiave: string;
  piattaforma: PiattaformaStatistiche;
  accountId: string | null;
  nome: string;
  stato: StatoStatisticheAccount | null;
}

interface Props {
  companyId: string;
  connectedAccounts: SocialConnectedAccount[];
  onGoToSettings: () => void;
}

export function StatistichePagineSocial({ companyId, connectedAccounts, onGoToSettings }: Props) {
  const qc = useQueryClient();
  const [periodo, setPeriodo] = useState<PeriodoStatistiche>(30);

  const datiQuery = useQuery({
    queryKey: ["social-statistiche", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<DatiStatistiche> => {
      // 90 giorni + i 90 precedenti per il confronto
      const dal = new Date(Date.now() - 182 * 86_400_000).toISOString().slice(0, 10);
      const [stati, giorni, post] = await Promise.all([
        fromTable("social_statistiche_stato")
          .select("piattaforma,account_esterno_id,pagina_id,nome,username,follower,contenuti_totali,esito,messaggio,metriche_non_disponibili,ultima_sync,ultima_sync_riuscita")
          .eq("company_id", companyId),
        fromTable("social_statistiche_giornaliere")
          .select("piattaforma,account_esterno_id,giorno,follower,nuovi_follower,follower_persi,copertura,visualizzazioni,interazioni,visite_profilo,click_link")
          .eq("company_id", companyId)
          .gte("giorno", dal)
          .order("giorno", { ascending: true })
          .limit(1000),
        fromTable("social_statistiche_post")
          .select("piattaforma,account_esterno_id,post_id,pubblicato_il,tipo,testo,permalink,immagine_url,copertura,visualizzazioni,reazioni,commenti,condivisioni,salvataggi,clic,interazioni")
          .eq("company_id", companyId)
          .gte("pubblicato_il", new Date(Date.now() - 92 * 86_400_000).toISOString())
          .order("pubblicato_il", { ascending: false })
          .limit(500),
      ]);
      const errore = stati.error ?? giorni.error ?? post.error;
      if (errore) throw new Error(errore.message);
      return { stati: stati.data ?? [], giorni: giorni.data ?? [], post: post.data ?? [] };
    },
  });

  const integrazioneQuery = useQuery({
    queryKey: ["social-statistiche", companyId, "integrazione-meta"],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ id: string; status: string } | null> => {
      const { data } = await fromTable("integrations")
        .select("id,status")
        .eq("company_id", companyId)
        .eq("provider", "meta")
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });

  const aggiorna = useMutation({
    mutationFn: async () => {
      const integrationId = integrazioneQuery.data?.id;
      if (!integrationId) throw new Error("Meta non è collegato: collega Facebook e Instagram dalle Integrazioni.");
      const { data, error } = await supabase.functions.invoke("meta-api-proxy", {
        body: { action: "sincronizza-statistiche-social", company_id: companyId, integration_id: integrationId, giorni: periodo },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      return data as { permessi_mancanti?: number };
    },
    onSuccess: (r) => {
      if (r?.permessi_mancanti) {
        toast.warning("Statistiche aggiornate in parte", { description: "Per alcuni account Meta non concede il permesso: ricollega Meta." });
      } else {
        toast.success("Statistiche aggiornate");
      }
      qc.invalidateQueries({ queryKey: ["social-statistiche", companyId] });
      qc.invalidateQueries({ queryKey: ["social-manager", "accounts"] });
    },
    onError: (e: Error) => toast.error("Aggiornamento non riuscito", { description: e.message }),
  });

  const dati = datiQuery.data;

  // Si mostrano solo gli account collegati adesso (una pagina tolta non resta a schermo).
  const account = useMemo<AccountVisibile[]>(() => {
    const collegati = connectedAccounts.filter((c) => c.platform_id === "facebook" || c.platform_id === "instagram");
    const out: AccountVisibile[] = [];
    for (const c of collegati) {
      const piattaforma = c.platform_id as PiattaformaStatistiche;
      const stati = (dati?.stati ?? []).filter((s) => s.piattaforma === piattaforma && s.pagina_id === c.page_id);
      if (!stati.length) {
        out.push({ chiave: `${piattaforma}|${c.page_id}`, piattaforma, accountId: null, nome: c.page_name, stato: null });
      }
      for (const s of stati) {
        out.push({
          chiave: `${piattaforma}|${s.account_esterno_id}`,
          piattaforma,
          accountId: s.account_esterno_id,
          nome: s.username ? `@${s.username}` : (s.nome ?? c.page_name),
          stato: s,
        });
      }
    }
    return out.sort((a, b) => a.piattaforma.localeCompare(b.piattaforma) || a.nome.localeCompare(b.nome));
  }, [connectedAccounts, dati?.stati]);

  const ultimaSync = (dati?.stati ?? [])
    .map((s) => s.ultima_sync)
    .filter((x): x is string => !!x)
    .sort()
    .pop() ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h2 className="text-base font-bold text-slate-900">Statistiche di Facebook e Instagram</h2>
          <p className="text-xs text-slate-500">
            Dati di Meta, aggiornati ogni 4 ore · ultimo aggiornamento {etichettaUltimaSync(ultimaSync)}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
          {PERIODI_STATISTICHE.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriodo(p)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-semibold transition",
                periodo === p ? "bg-orange-500 text-white" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {p} giorni
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={aggiorna.isPending || !integrazioneQuery.data?.id}
          onClick={() => aggiorna.mutate()}
        >
          {aggiorna.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Aggiorna ora
        </Button>
      </div>

      {datiQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carico le statistiche…
        </div>
      ) : datiQuery.error ? (
        <Card>
          <CardContent className="p-5 text-sm text-slate-600">
            Non riesco a leggere le statistiche: {(datiQuery.error as Error).message}
          </CardContent>
        </Card>
      ) : account.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <Users className="h-8 w-8 text-slate-300" />
            <div>
              <p className="font-semibold text-slate-800">Nessuna pagina Facebook o profilo Instagram collegato</p>
              <p className="mt-1 text-sm text-slate-500">
                Collega Meta e scegli le pagine: le statistiche arrivano da sole, ogni 4 ore.
              </p>
            </div>
            <Button size="sm" onClick={onGoToSettings}>Collega Facebook e Instagram</Button>
          </CardContent>
        </Card>
      ) : (
        account.map((a) => (
          <SezioneAccount
            key={a.chiave}
            account={a}
            giorni={dati?.giorni ?? []}
            post={dati?.post ?? []}
            periodo={periodo}
            onGoToSettings={onGoToSettings}
          />
        ))
      )}
    </div>
  );
}

function SezioneAccount({
  account,
  giorni,
  post,
  periodo,
  onGoToSettings,
}: {
  account: AccountVisibile;
  giorni: RigaStatisticaGiornaliera[];
  post: RigaStatisticaPost[];
  periodo: PeriodoStatistiche;
  onGoToSettings: () => void;
}) {
  const { piattaforma, accountId, stato } = account;
  const stile = STILE_PIATTAFORMA[piattaforma];

  const righe = useMemo(
    () => (accountId ? giorni.filter((r) => r.piattaforma === piattaforma && r.account_esterno_id === accountId) : []),
    [giorni, piattaforma, accountId],
  );
  const postAccount = useMemo(
    () => (accountId ? post.filter((p) => p.piattaforma === piattaforma && p.account_esterno_id === accountId) : []),
    [post, piattaforma, accountId],
  );
  const r = useMemo(() => riepilogaStatistiche(righe, periodo, stato?.follower ?? null), [righe, periodo, stato?.follower]);
  const migliori = useMemo(() => miglioriPost(postAccount, periodo), [postAccount, periodo]);

  const esito = stato?.esito ?? "mai";
  const crescita = r.crescitaFollower;
  const tessere = [
    {
      etichetta: "Follower",
      valore: r.follower,
      nota: crescita === null ? "crescita non disponibile" : `${crescita > 0 ? "+" : ""}${formatNumero(crescita)} nel periodo`,
      notaColore: crescita === null ? "text-slate-400" : crescita >= 0 ? "text-emerald-600" : "text-red-600",
      icona: UserPlus,
    },
    {
      etichetta: "Persone raggiunte",
      valore: r.copertura,
      nota: variazioneTesto(r.variazioni.copertura, "somma dei giorni"),
      notaColore: coloreVariazione(r.variazioni.copertura),
      icona: Users,
    },
    {
      etichetta: "Visualizzazioni",
      valore: r.visualizzazioni,
      nota: variazioneTesto(r.variazioni.visualizzazioni),
      notaColore: coloreVariazione(r.variazioni.visualizzazioni),
      icona: Eye,
    },
    {
      etichetta: "Interazioni",
      valore: r.interazioni,
      nota: variazioneTesto(r.variazioni.interazioni),
      notaColore: coloreVariazione(r.variazioni.interazioni),
      icona: Heart,
    },
    piattaforma === "facebook"
      ? { etichetta: "Visite alla pagina", valore: r.visiteProfilo, nota: "nel periodo", notaColore: "text-slate-400", icona: MousePointerClick }
      : { etichetta: "Tocchi sui link", valore: r.clickLink, nota: "nel periodo", notaColore: "text-slate-400", icona: MousePointerClick },
  ];

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br text-[10px] font-bold text-white", stile.badge)}>
            {stile.sigla}
          </span>
          <div className="mr-auto min-w-0">
            <p className="truncate text-sm font-bold text-slate-800">{account.nome}</p>
            <p className="text-[11px] text-slate-500">
              {NOME_PIATTAFORMA[piattaforma]}
              {stato?.contenuti_totali != null ? ` · ${formatNumero(stato.contenuti_totali)} contenuti` : ""}
              {" · aggiornato "}
              {etichettaUltimaSync(stato?.ultima_sync_riuscita ?? null)}
            </p>
          </div>
        </div>

        {esito === "permesso_mancante" && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <p className="mr-auto text-xs text-amber-900">
              <strong>Ricollega Meta per vedere le statistiche.</strong>{" "}
              {stato?.messaggio ?? "Meta non ci ha dato il permesso di leggere le statistiche di questo account."}
            </p>
            <Button size="sm" variant="outline" className="h-7 border-amber-300 bg-white text-xs" onClick={onGoToSettings}>
              Ricollega Meta
            </Button>
          </div>
        )}
        {esito === "errore" && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <AlertTriangle className="h-4 w-4 shrink-0 text-slate-500" />
            Ultimo aggiornamento non riuscito{stato?.messaggio ? `: ${stato.messaggio}` : "."}
          </div>
        )}
        {esito === "mai" && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            In attesa della prima lettura da Meta: arriva entro 4 ore, oppure premi «Aggiorna ora».
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {tessere.map(({ etichetta, valore, nota, notaColore, icona: Icona }) => (
            <div key={etichetta} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <Icona className="h-3.5 w-3.5" /> {etichetta}
              </p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900" title={valore === null ? "Dato non disponibile da Meta" : undefined}>
                {formatNumero(valore)}
              </p>
              <p className={cn("text-[10px]", notaColore)}>{nota}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-600">Visualizzazioni e persone raggiunte per giorno</p>
            {r.giorniConDati > 0 ? (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={r.serie} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="giorno" tickFormatter={giornoBreve} tick={{ fontSize: 10 }} minTickGap={16} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip
                      labelFormatter={(g) => giornoBreve(String(g))}
                      formatter={(v, nome) => [formatNumero(typeof v === "number" ? v : null), nome === "visualizzazioni" ? "Visualizzazioni" : "Persone raggiunte"]}
                    />
                    <Bar dataKey="visualizzazioni" fill={stile.barra} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="copertura" fill={stile.barraChiara} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500">
                Nessun dato giornaliero per questo periodo.
              </p>
            )}
            {!!stato?.metriche_non_disponibili?.length && (
              <p className="mt-1 text-[10px] text-slate-400">
                Meta non fornisce per questo account: {stato.metriche_non_disponibili.join(", ")}.
              </p>
            )}
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold text-slate-600">Migliori post del periodo</p>
            {migliori.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500">
                Nessun post pubblicato in questo periodo.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {migliori.map((p) => (
                  <li key={p.post_id} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white p-2">
                    {p.immagine_url ? (
                      <img src={p.immagine_url} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="h-10 w-10 shrink-0 rounded bg-slate-100" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-700">{p.testo || "(senza testo)"}</p>
                      <p className="flex flex-wrap items-center gap-x-2 text-[10px] text-slate-500">
                        <span>{p.pubblicato_il ? new Date(p.pubblicato_il).toLocaleDateString("it-IT", { day: "2-digit", month: "short" }) : ""}</span>
                        {p.tipo && <span>{p.tipo}</span>}
                        <span className="flex items-center gap-0.5" title="Persone raggiunte"><Users className="h-3 w-3" />{formatNumero(p.copertura)}</span>
                        <span className="flex items-center gap-0.5" title="Reazioni / mi piace"><Heart className="h-3 w-3" />{formatNumero(p.reazioni)}</span>
                        <span className="flex items-center gap-0.5" title="Commenti"><MessageSquare className="h-3 w-3" />{formatNumero(p.commenti)}</span>
                        <span className="flex items-center gap-0.5" title="Condivisioni"><Share2 className="h-3 w-3" />{formatNumero(p.condivisioni)}</span>
                        <span className="font-semibold text-slate-700" title="Interazioni totali">{formatNumero(interazioniPost(p))} interazioni</span>
                      </p>
                    </div>
                    {p.permalink && (
                      <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="shrink-0 text-slate-400 hover:text-slate-700" title="Apri il post">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function giornoBreve(g: string): string {
  const [, m, d] = g.split("-");
  return d && m ? `${d}/${m}` : g;
}

function variazioneTesto(v: number | null, altrimenti = "nel periodo"): string {
  const f = formatVariazione(v);
  return f ? `${f} sul periodo prima` : altrimenti;
}

function coloreVariazione(v: number | null): string {
  if (v === null) return "text-slate-400";
  return v >= 0 ? "text-emerald-600" : "text-red-600";
}
