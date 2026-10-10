import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { useDebounce } from "@/hooks/useDebounce";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, ScrollText, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { DateRangeFilter } from "@/components/orders/DateRangeFilter";
import {
  OGGETTI_FILTRO_LOG_AZIENDA,
  cosaDelLogAzienda,
  filtroNomePersona,
  paroleDaCercare,
  suCosaDelLogAzienda,
  vocedaLogAzienda,
  type RigaLogAzienda,
} from "@/lib/users/logAttivitaUtente";

const PAGE_SIZE = 20;

/** Colore del badge: le cancellazioni si notano, le creazioni sono il colore pieno. */
function varianteAzione(azione: string): "default" | "secondary" | "destructive" | "outline" {
  if (azione.endsWith(".deleted") || azione.endsWith("_deleted")) return "destructive";
  if (azione.endsWith(".created") || azione.endsWith("_created") || azione.endsWith(".hired")) return "default";
  if (azione.endsWith(".updated") || azione.endsWith("_updated")) return "secondary";
  return "outline";
}

interface RigaRegistro extends RigaLogAzienda {
  id: string;
  created_at: string;
  user_id?: string | null;
  actor_name?: string | null;
  actor_user_id?: string | null;
  target_type?: string | null;
}

export default function CompanyActivityLogTab() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [page, setPage] = useState(0);
  const [oggetto, setOggetto] = useState("all");
  const [ricercaScritta, setRicercaScritta] = useState("");
  const ricercaRitardata = useDebounce(ricercaScritta, 350);
  const ricerca = paroleDaCercare(ricercaRitardata);
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });

  const modelloAzione = OGGETTI_FILTRO_LOG_AZIENDA.find((o) => o.chiave === oggetto)?.modelloAzione ?? null;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.activityLog.list(companyId, page, oggetto, ricerca, dateRange.from?.toISOString(), dateRange.to?.toISOString()),
    queryFn: async () => {
      if (!companyId) throw new Error("No company");
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // La ricerca guarda cosa è successo (descrizione e nome), chi l'ha fatto
      // (nome registrato, oppure le persone dell'azienda che si chiamano così):
      // su tutto il registro, non solo sulle 20 righe della pagina.
      let filtroRicerca: string | null = null;
      if (ricerca) {
        const { data: persone } = await supabase
          .from("profiles")
          .select("id")
          .eq("company_id", companyId)
          .or(filtroNomePersona(ricerca))
          .limit(50);
        const ids = (persone ?? []).map((p: { id: string }) => p.id);
        filtroRicerca = [
          `description.ilike.*${ricerca}*`,
          `target_label.ilike.*${ricerca}*`,
          `actor_name.ilike.*${ricerca}*`,
          ids.length > 0 ? `user_id.in.(${ids.join(",")})` : null,
        ].filter(Boolean).join(",");
      }

      let query = supabase
        .from("company_activity_log")
        .select("*", { count: "exact" })
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (modelloAzione) query = query.like("action", modelloAzione);
      if (filtroRicerca) query = query.or(filtroRicerca);
      if (dateRange.from) query = query.gte("created_at", dateRange.from.toISOString());
      if (dateRange.to) query = query.lte("created_at", dateRange.to.toISOString());

      const { data: righe, error, count } = await query;
      if (error) throw error;
      const logs = (righe || []) as unknown as RigaRegistro[];

      const userIds = [...new Set(logs.map((l) => l.user_id).filter((x): x is string => !!x))];
      const profiles: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .eq("company_id", companyId)
          .in("id", userIds);
        (profileData || []).forEach((p: { id: string; first_name: string | null; last_name: string | null }) => {
          profiles[p.id] = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
        });
      }

      // Le commesse nel registro hanno l'identificativo al posto del numero:
      // il numero e il cliente si leggono dalla commessa.
      const idCommesse = [...new Set(
        logs.filter((l) => l.target_type === "orders" && l.target_id).map((l) => l.target_id as string),
      )];
      const nomiPerId: Record<string, string> = {};
      if (idCommesse.length > 0) {
        const { data: commesse } = await supabase
          .from("orders")
          .select("id, order_code, client_name")
          .eq("company_id", companyId)
          .in("id", idCommesse);
        (commesse || []).forEach((c: { id: string; order_code: string | null; client_name: string | null }) => {
          const nome = [c.order_code, c.client_name].filter(Boolean).join(" · ");
          if (nome) nomiPerId[c.id] = nome;
        });
      }

      return { logs, total: count || 0, profiles, nomiPerId };
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  /**
   * Chi ha fatto l'azione.
   *
   * Tre sorgenti, in ordine: `actor_name` che il registratore nuovo risolve già
   * lui, il profilo cercato per `user_id`, e infine nulla. Il "nulla" NON si
   * chiama "Sistema": scriverlo farebbe credere che l'abbia fatto la
   * piattaforma, mentre spesso è una persona di cui non abbiamo registrato
   * l'identità. Un registro che attribuisce a "Sistema" azioni umane non
   * risponde alla domanda per cui esiste — chi ha fatto cosa.
   */
  const nomeAttore = useCallback((log: RigaRegistro): { testo: string; attribuito: boolean } => {
    const risolto = (log.actor_name || "").trim();
    if (risolto) return { testo: risolto, attribuito: true };
    const daProfilo = (data?.profiles[log.user_id ?? ""] || "").trim();
    if (daProfilo && daProfilo !== "null null") return { testo: daProfilo, attribuito: true };
    // Niente scorciatoie: `source_function` dice quale funzione SQL ha scritto
    // la riga, non che l'abbia fatto un'automazione — sui salvataggi fatti a
    // mano è valorizzata lo stesso. Chiamarla "Automazione" sarebbe un'altra
    // attribuzione inventata, come "Sistema".
    return { testo: "Non attribuito", attribuito: false };
  }, [data]);

  const logs = data?.logs ?? [];
  const totalPages = Math.ceil((data?.total || 0) / PAGE_SIZE);
  const haFiltri = oggetto !== "all" || !!ricercaScritta.trim() || !!dateRange.from || !!dateRange.to;
  const cisonoNonAttribuiti = logs.some((l) => !nomeAttore(l).attribuito);

  const togliFiltri = () => {
    setOggetto("all");
    setRicercaScritta("");
    setDateRange({ from: undefined, to: undefined });
    setPage(0);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-semibold leading-none tracking-tight">Registro attività</h2>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">Chi ha fatto cosa nell'azienda, dal più recente.</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()} aria-label="Aggiorna il registro" className="shrink-0">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] max-w-xs flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              aria-label="Cerca nel registro"
              placeholder="Cerca un nome o una parola…"
              value={ricercaScritta}
              onChange={(e) => { setRicercaScritta(e.target.value); setPage(0); }}
              className="pl-9"
            />
          </div>
          <DateRangeFilter
            label="Periodo"
            range={dateRange}
            onRangeChange={(r) => { setDateRange(r); setPage(0); }}
          />
          <Select value={oggetto} onValueChange={(v) => { setOggetto(v); setPage(0); }}>
            <SelectTrigger className="w-[200px]" aria-label="Filtra per tipo di dato">
              <SelectValue placeholder="Tutto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutto</SelectItem>
              {OGGETTI_FILTRO_LOG_AZIENDA.map((o) => (
                <SelectItem key={o.chiave} value={o.chiave}>{o.etichetta}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div role="status" className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
            <span className="sr-only">Caricamento del registro…</span>
          </div>
        ) : isError ? (
          <div role="alert" className="py-8 text-center text-muted-foreground">
            Non riesco a leggere il registro.{" "}
            <Button variant="link" onClick={() => refetch()}>Riprova</Button>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <ScrollText className="mb-3 h-10 w-10 opacity-40" aria-hidden="true" />
            <p className="font-medium">{haFiltri ? "Nessun risultato con questi filtri" : "Nessuna attività registrata"}</p>
            <p className="mt-1 text-sm">
              {haFiltri
                ? <Button variant="link" className="h-auto p-0" onClick={togliFiltri}>Togli i filtri</Button>
                : "Le azioni svolte nell'azienda appariranno qui."}
            </p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Chi</TableHead>
                  <TableHead>Cosa è successo</TableHead>
                  <TableHead>Su cosa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const azione = log.action ?? "";
                  const attore = nomeAttore(log);
                  const suCosa = suCosaDelLogAzienda(log, data?.nomiPerId);
                  const dettaglio = cosaDelLogAzienda(log);
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: it })}
                      </TableCell>
                      <TableCell className="text-sm">
                        {attore.attribuito ? attore.testo : (
                          <span className="italic text-muted-foreground">{attore.testo}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={varianteAzione(azione)}>{vocedaLogAzienda(azione).titolo}</Badge>
                        {dettaglio && <p className="mt-1 max-w-[320px] text-xs text-muted-foreground">{dettaglio}</p>}
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate text-sm text-muted-foreground" title={suCosa ?? undefined}>
                        {suCosa ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {cisonoNonAttribuiti && (
              <p className="mt-3 text-xs text-muted-foreground">
                «Non attribuito»: azione fatta da un'importazione, da un'automazione o registrata senza il nome di chi l'ha fatta.
              </p>
            )}

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Pagina {page + 1} di {totalPages} ({data?.total} risultati)
                </p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Pagina precedente">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} aria-label="Pagina successiva">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
