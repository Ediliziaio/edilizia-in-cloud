/**
 * CampoSquadra — «chi c'è oggi» per il capocantiere (e per l'ufficio).
 * Legge la RPC campo_squadra_oggi: per ogni persona assegnata al cantiere,
 * entrata/uscita di oggi, se è ancora dentro, le ore fatte e se ha mandato il
 * rapportino. Le timbrature altrui sono chiuse dalla RLS: passa dalla funzione.
 */
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Users, Clock, FileText, RefreshCw, HardHat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface RigaSquadra {
  user_id: string;
  nome: string;
  ruolo: "dipendente" | "sub";
  is_capocantiere: boolean;
  entrata: string | null;
  uscita: string | null;
  in_cantiere: boolean;
  ore: number;
  rapportino_inviato: boolean;
}

const ora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : null;

export default function CampoSquadra() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();

  const { data: order } = useQuery({
    queryKey: ["campo-squadra-ordine", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("order_code, description").eq("id", orderId!).maybeSingle();
      return data;
    },
  });

  const { data: squadra = [], isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["campo-squadra-oggi", orderId],
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

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 md:space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => navigate(-1)} aria-label="Indietro">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold">Squadra di oggi</h1>
          <p className="truncate text-xs text-muted-foreground">
            {order?.order_code ?? "Cantiere"}{order?.description ? ` · ${order.description}` : ""}
          </p>
        </div>
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => refetch()} aria-label="Aggiorna" disabled={isFetching}>
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            {isLoading ? "Carico…" : `${dentro} in cantiere su ${squadra.length} · ${conRapportino} rapportini inviati`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <>
              <Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" />
            </>
          ) : isError ? (
            <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error instanceof Error && /capocantiere|ufficio/i.test(error.message)
                ? "Solo il capocantiere di questo cantiere può vedere la squadra."
                : "Non riesco a leggere la squadra. Riprova tra poco."}
            </p>
          ) : squadra.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nessuno assegnato a questo cantiere.</p>
          ) : (
            squadra.map((r) => (
              <div key={r.user_id} className="flex items-center gap-3 rounded-xl border bg-muted/40 p-3">
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  r.in_cantiere ? "bg-emerald-100 text-emerald-700" : r.uscita ? "bg-slate-200 text-slate-600" : "bg-amber-100 text-amber-700")}>
                  {r.nome.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase() || <HardHat className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-semibold">{r.nome || "Senza nome"}</p>
                    {r.is_capocantiere && <Badge variant="outline" className="h-4 px-1.5 text-[10px] border-primary/30 text-primary">Capo</Badge>}
                    {r.ruolo === "sub" && <Badge variant="outline" className="h-4 px-1.5 text-[10px]">Sub</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {r.in_cantiere
                      ? `In cantiere dalle ${ora(r.entrata)}`
                      : r.uscita
                        ? `${ora(r.entrata)} → ${ora(r.uscita)}`
                        : "Non ha timbrato oggi"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="flex items-center justify-end gap-1 text-sm font-semibold tabular-nums">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />{Number(r.ore).toLocaleString("it-IT")} h
                  </p>
                  <p className={cn("mt-0.5 flex items-center justify-end gap-1 text-[11px]", r.rapportino_inviato ? "text-emerald-600" : "text-muted-foreground")}>
                    <FileText className="h-3 w-3" />{r.rapportino_inviato ? "rapportino ok" : "senza rapportino"}
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      <p className="px-1 text-center text-[11px] text-muted-foreground">Le ore contano dalle timbrature di oggi; chi è ancora dentro conta fino ad adesso.</p>
    </div>
  );
}
