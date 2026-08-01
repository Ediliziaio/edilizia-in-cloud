/**
 * GroundednessCard — quanto Silvio si appoggia davvero alle fonti che riceve.
 *
 * Legge `silvio_kb_citation_log`, scritto da silvio-chat a ogni turno in cui il
 * pre-RAG inietta dei chunk. Il segnale utile e' lo scarto tra "fonti fornite"
 * e "fonti citate": quando il modello riceve 6 chunk e non ne cita nessuno, la
 * risposta POTREBBE essere campata in aria — non e' una condanna (puo' aver
 * risposto bene a memoria), ma e' esattamente il posto dove andare a guardare.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BookOpenCheck } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface CitationRow {
  id: string;
  persona_key: string | null;
  user_query: string | null;
  doc_ids: string[] | null;
  similarity_scores: number[] | null;
  used_in_response: boolean | null;
  created_at: string;
}

const GIORNI = 30;

export function GroundednessCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["silvio-groundedness", GIORNI],
    refetchInterval: 60_000,
    queryFn: async () => {
      const da = new Date();
      da.setDate(da.getDate() - GIORNI);
      const { data, error } = await supabase
        .from("silvio_kb_citation_log")
        .select("id, persona_key, user_query, doc_ids, similarity_scores, used_in_response, created_at")
        .gte("created_at", da.toISOString())
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as CitationRow[];
    },
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const righe = data ?? [];
  const totale = righe.length;
  const senzaCitazioni = righe.filter((r) => r.used_in_response === false);
  // Percentuale calcolata solo se c'e' qualcosa da percentualizzare: su 0 turni
  // un "100% fondate" sarebbe una bugia gentile.
  const pctFondate = totale > 0
    ? Math.round(((totale - senzaCitazioni.length) / totale) * 100)
    : null;
  // Similarita' del chunk migliore per turno: se e' bassa, il RAG sta pescando
  // materiale poco pertinente e il problema e' la KB, non il modello.
  const simMigliori = righe
    .map((r) => Math.max(...(r.similarity_scores ?? [0])))
    .filter((n) => Number.isFinite(n) && n > 0);
  const simMedia = simMigliori.length
    ? simMigliori.reduce((a, b) => a + b, 0) / simMigliori.length
    : null;

  return (
    <Card className="border-sky-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BookOpenCheck className="h-4 w-4 text-sky-600" />
          Risposte fondate sulle fonti
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Turni degli ultimi {GIORNI} giorni in cui il pre-RAG ha passato dei
          documenti a Silvio, e quanti di quei documenti sono finiti citati nella
          risposta. Fonti non citate non significa risposta sbagliata: significa
          che vale la pena rileggerla.
        </p>

        {totale === 0 ? (
          <div className="text-xs text-muted-foreground border rounded p-3 bg-muted/30">
            Nessun turno con fonti tracciato negli ultimi {GIORNI} giorni. Il
            tracciamento parte dalle conversazioni nuove: le chat precedenti non
            sono ricostruibili.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              <div className="p-2 rounded bg-emerald-50 border border-emerald-200">
                <div className="text-[10px] text-muted-foreground">Fonti citate</div>
                <div className="font-bold text-emerald-700">{pctFondate}%</div>
              </div>
              <div className="p-2 rounded bg-amber-50 border border-amber-200">
                <div className="text-[10px] text-muted-foreground">
                  Fonti fornite ma ignorate
                </div>
                <div className="font-bold text-amber-700">
                  {senzaCitazioni.length} su {totale}
                </div>
              </div>
              <div className="p-2 rounded bg-sky-50 border border-sky-200">
                <div className="text-[10px] text-muted-foreground">
                  Pertinenza media (chunk migliore)
                </div>
                <div className="font-bold text-sky-700">
                  {simMedia != null ? simMedia.toFixed(2) : "—"}
                </div>
              </div>
            </div>

            {senzaCitazioni.length > 0 && (
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-muted-foreground">
                  Da rileggere — fonti disponibili, nessuna citata
                </div>
                {senzaCitazioni.slice(0, 5).map((r) => (
                  <div
                    key={r.id}
                    className="text-xs border rounded p-2 flex items-start justify-between gap-2"
                  >
                    <span className="line-clamp-2">
                      {r.user_query || "(domanda non registrata)"}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant="outline" className="text-[10px]">
                        {r.doc_ids?.length ?? 0} fonti
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(r.created_at), "d MMM", { locale: it })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
