/**
 * CampoSquadra — «chi c'è oggi»: il capocantiere vede tutto il cantiere, il
 * caposquadra la sua squadra (e l'ufficio tutto).
 * Legge la RPC campo_squadra_oggi: per ogni persona assegnata al cantiere,
 * entrata/uscita di oggi, se è ancora dentro, le ore fatte e se ha mandato il
 * rapportino. Le timbrature altrui sono chiuse dalla RLS: passa dalla funzione.
 */
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, BellRing, Check, Users, Clock, FileText, Loader2, Phone, RefreshCw, HardHat } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { linkTelefono } from "@/hooks/campo/useCampoGiornata";
import { useRegoleCampoOrdine } from "@/hooks/useRegoleCampo";
import { useMezziDellaGiornata } from "@/components/campo/MezziFineGiornata";
import { campoReportUrl } from "@/lib/campo/reportKind";
import { messaggioErrore } from "@/lib/campo/messaggioErrore";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface RigaSquadra {
  /** Vuoto per chi della squadra non ha l'app: le sue ore vengono dal Personale. */
  user_id: string | null;
  nome: string;
  ruolo: "dipendente" | "sub";
  is_capocantiere: boolean;
  /** La squadra della persona su questo cantiere. */
  squadra?: string | null;
  entrata: string | null;
  uscita: string | null;
  in_cantiere: boolean;
  ore: number;
  rapportino_inviato: boolean;
  /** Il telefono di lavoro, mai quello privato. */
  telefono?: string | null;
}

const ora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : null;

const oreDaControllare = (riga: RigaSquadra) =>
  riga.in_cantiere || (!riga.rapportino_inviato && !(Number(riga.ore) > 0));

function FineGiornata({ orderId, companyId, squadra, soloDaControllare, onFiltra }: {
  orderId: string;
  companyId: string;
  squadra: RigaSquadra[];
  soloDaControllare: boolean;
  onFiltra: () => void;
}) {
  const navigate = useNavigate();
  const t = useT();
  const mezzi = useMezziDellaGiornata(orderId);
  const fasi = useQuery({
    queryKey: ["campo-fine-giornata-fasi", companyId, orderId],
    queryFn: async ({ signal }) => {
      const { count, error } = await supabase.from("order_work_phases").select("id", { count: "exact", head: true })
        .eq("company_id", companyId).eq("order_id", orderId).neq("status", "completata").abortSignal(signal);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const daControllare = squadra.filter(oreDaControllare).length;
  const attrezzature = mezzi.data ?? [];
  const registrati = attrezzature.filter(m => m.segnato_oggi).length;

  return <section aria-labelledby="chiusura-campo" className="space-y-2 rounded-2xl border bg-card p-3">
    <h2 id="chiusura-campo" className="text-sm font-bold">{t("Fine giornata")}</h2>
    {/* Collaudo 23/11: «3 Ore da verificare» si leggeva come 3 ore (sono 3 persone); «0/0 Mezzi segnati» senza mezzi
        era un numero vuoto. Ora si dice cosa si conta, e il riquadro dei mezzi c'è solo se ci sono mezzi. */}
    <div className={cn("grid gap-1.5", mezzi.data && attrezzature.length === 0 ? "grid-cols-2" : "grid-cols-3")} aria-label={t("Riepilogo giornata")}>
      <button type="button" aria-pressed={soloDaControllare} disabled={!soloDaControllare && daControllare === 0} onClick={onFiltra}
        className={cn("min-h-14 rounded-xl border px-1 py-1.5 text-xs disabled:opacity-70", soloDaControllare && "border-primary bg-primary/10")}>
        <span className="block text-sm font-bold">{daControllare}</span> {daControllare === 1 ? t("Persona con ore da verificare") : t("Persone con ore da verificare")}
      </button>
      {!(mezzi.data && attrezzature.length === 0) && <div className="flex min-h-14 flex-col items-center justify-center rounded-xl border px-1 py-1.5 text-center text-xs">
        <span className="text-sm font-bold">{mezzi.data ? t("{n} di {totale}", { n: registrati, totale: attrezzature.length }) : "—"}</span> {t("Mezzi segnati")}
      </div>}
      <button type="button" onClick={() => navigate(`/campo/avanzamento?order_id=${encodeURIComponent(orderId)}`)}
        className="min-h-14 rounded-xl border px-1 py-1.5 text-xs">
        <span className="block text-sm font-bold">{fasi.data ?? "—"}</span> {t("Fasi aperte")}
      </button>
    </div>
    {(mezzi.isError || fasi.isError) && <p className="text-xs text-muted-foreground">{t("Alcuni dati non disponibili.")}{" "}
      <button type="button" className="min-h-11 text-primary underline" onClick={() => { void mezzi.refetch(); void fasi.refetch(); }}>{t("Riprova")}</button>
    </p>}
    <Button type="button" className="min-h-11 w-full gap-2" onClick={() => navigate(campoReportUrl(orderId, "daily"))}>
      <FileText className="size-4" aria-hidden="true" /> {t("Apri rapportino della giornata")}
    </Button>
  </section>;
}

export default function CampoSquadra() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const t = useT();
  const { user, profile, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id;
  const [sollecitati, setSollecitati] = useState<Set<string>>(new Set());
  const [soloDaControllare, setSoloDaControllare] = useState(false);
  // Dove il rapportino lo fa il capo, gli operai non hanno niente da mandare.
  const { data: regole } = useRegoleCampoOrdine(orderId);
  const sollecita = useMutation({
    mutationFn: async (userId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("campo_sollecita_rapportino", { p_order_id: orderId, p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: (_, userId) => {
      setSollecitati((s) => new Set(s).add(userId));
      toast.success(t("Sollecito mandato"));
    },
    onError: (e) => toast.error(messaggioErrore(e, t("Non sono riuscito a mandare il sollecito. Riprova."))),
  });

  const { data: order } = useQuery({
    queryKey: ["campo-squadra-ordine", orderId, companyId],
    enabled: !!orderId && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("order_code, description")
        .eq("id", orderId!).eq("company_id", companyId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: squadra = [], isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["campo-squadra-oggi", orderId, companyId, user?.id],
    enabled: !!orderId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<RigaSquadra[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("campo_squadra_oggi", { p_order_id: orderId });
      if (error) throw error;
      return (data ?? []) as RigaSquadra[];
    },
  });

  const dentro = squadra.filter((r) => r.in_cantiere).length;
  const conRapportino = squadra.filter((r) => r.rapportino_inviato).length;
  const righeVisibili = soloDaControllare ? squadra.filter(oreDaControllare) : squadra;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 md:space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 max-md:hidden" onClick={() => navigate(-1)} aria-label={t("Indietro")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-bold md:text-lg">{t("Squadra di oggi")}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {order?.order_code ?? t("Cantiere")}{order?.description ? ` · ${order.description}` : ""}
          </p>
        </div>
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => refetch()} aria-label={t("Aggiorna")} disabled={isFetching}>
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
        </Button>
      </div>

      {!isLoading && !isError && orderId && companyId && order && <FineGiornata key={orderId}
        orderId={orderId} companyId={companyId} squadra={squadra} soloDaControllare={soloDaControllare}
        onFiltra={() => setSoloDaControllare(v => !v)} />}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            {/* Con un errore niente «0 su 0»: sembrerebbe un dato vero (collaudo 23/11). */}
            {isLoading ? t("Carico…") : isError ? t("Chi c’è oggi") : t("{dentro} in cantiere su {totale} · {rapportini} rapportini inviati", { dentro, totale: squadra.length, rapportini: conRapportino })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <>
              <Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" />
            </>
          ) : isError ? (
            <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {/* L'errore del database è un oggetto con «message», non un Error: prima il messaggio giusto non usciva mai. */}
              {/capocantiere|caposquadra|ufficio/i.test(String((error as { message?: unknown } | null)?.message ?? ""))
                ? t("Solo il capocantiere e il caposquadra possono vedere chi c'è oggi.")
                : t("Non riesco a leggere la squadra. Riprova tra poco.")}
            </p>
          ) : righeVisibili.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{soloDaControllare ? t("Le ore della squadra risultano complete.") : t("Oggi qui non è previsto nessuno.")}</p>
          ) : (
            righeVisibili.map((r, i) => {
              const tel = linkTelefono(r.telefono ?? null);
              const uid = r.user_id;
              const puoSollecitare = !!uid && uid !== user?.id && !r.rapportino_inviato && !!regole && regole.chiCompila !== "capo";
              const sollecitato = !!uid && sollecitati.has(uid);
              return (
              <div key={r.user_id ?? `senza-app-${i}`} className="flex items-center gap-3 rounded-xl border bg-muted/40 p-3">
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  r.in_cantiere ? "bg-emerald-100 text-emerald-700" : r.uscita ? "bg-slate-200 text-slate-600" : "bg-amber-100 text-amber-700")}>
                  {r.nome.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase() || <HardHat className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="min-w-0 truncate text-sm font-semibold">{r.nome || t("Senza nome")}</p>
                    {r.is_capocantiere && <Badge variant="outline" className="h-4 px-1.5 text-[10px] border-primary/30 text-primary">{t("Capo")}</Badge>}
                    {r.ruolo === "sub" && <Badge variant="outline" className="h-4 px-1.5 text-[10px]">{t("Sub")}</Badge>}
                    {r.squadra && <span className="text-[11px] text-muted-foreground">{r.squadra}</span>}
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    <span>
                      {r.in_cantiere
                        ? t("In cantiere dalle {ora}", { ora: String(ora(r.entrata)) })
                        : r.uscita
                          ? `${ora(r.entrata)} → ${ora(r.uscita)}`
                          : t("Non ha timbrato oggi")}
                    </span>
                    <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-foreground">
                      <Clock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />{Number(r.ore).toLocaleString("it-IT")} h
                    </span>
                  </p>
                  {r.user_id ? (
                    <p className={cn("mt-0.5 flex items-center gap-1 text-[11px]", r.rapportino_inviato ? "text-emerald-600" : "text-muted-foreground")}>
                      <FileText className="h-3 w-3" aria-hidden="true" />{r.rapportino_inviato ? t("rapportino ok") : t("senza rapportino")}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{t("senza app")}</p>
                  )}
                </div>
                {(tel || puoSollecitare) && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    {tel && (
                      <a href={tel} aria-label={t("Chiama {nome}", { nome: r.nome })} className="tap-compact flex h-9 w-9 items-center justify-center rounded-lg border bg-background text-foreground active:bg-muted">
                        <Phone className="h-4 w-4" aria-hidden="true" />
                      </a>
                    )}
                    {puoSollecitare && (
                      <button
                        type="button"
                        aria-label={sollecitato ? t("Sollecito mandato a {nome}", { nome: r.nome }) : t("Sollecita il rapportino a {nome}", { nome: r.nome })}
                        disabled={sollecitato || (sollecita.isPending && sollecita.variables === uid)}
                        onClick={() => sollecita.mutate(uid!)}
                        className="tap-compact flex h-9 w-9 items-center justify-center rounded-lg border bg-background text-foreground active:bg-muted disabled:opacity-60"
                      >
                        {sollecitato ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                          : sollecita.isPending && sollecita.variables === uid ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          : <BellRing className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    )}
                  </div>
                )}
              </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
