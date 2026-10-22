import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarDays, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { getDateRange } from "@/lib/dateRangeUtils";
import { cn } from "@/lib/utils";
import { fmt, formatDuration } from "@/components/marketing/dashboard/utils";
import type { DashboardStats, DashboardFiltersState } from "@/hooks/useMarketingDashboard";

/*
 * Tab «Attività»: chi ha lavorato quanto nel periodo e come sono andati gli
 * appuntamenti, per persona e per calendario (marketing_attivita_team,
 * 20281021223000). Prima c'erano solo i totali di appuntamenti e chiamate.
 */

interface Persona {
  user_id: string;
  name: string;
  chiamate: number;
  risposte: number;
  durata_media: number | null;
  note: number;
  messaggi: number;
  cambi_fase: number;
  interventi: number;
  contatti: number;
  appuntamenti_fissati: number;
  appuntamenti: number;
  effettuati: number;
  no_show: number;
  da_esitare: number;
  annullati: number;
  riprogrammati: number;
  ultima_attivita: string | null;
}
interface Calendario {
  id: string;
  name: string;
  calendar_type: string | null;
  in_agenda: number;
  effettuati: number;
  no_show: number;
  da_esitare: number;
  prenotati_da_soli: number;
  con_vendita: number;
}
interface AttivitaTeam {
  persone: Persona[];
  calendari: Calendario[];
  totale: Omit<Persona, "user_id" | "name" | "durata_media" | "ultima_attivita">;
}

interface Props {
  data: DashboardStats | undefined;
  isLoading: boolean;
  filters: DashboardFiltersState;
  assignedUserIds: string[] | null;
}

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
/** show rate come in tutta la pagina: effettuati ÷ (effettuati + no-show) */
const show = (e: number, n: number) => pct(e, e + n);

function Cifra({ label, valore, nota, tono, soloComputer }: { label: string; valore: string; nota?: string; tono?: "rosso" | "giallo"; soloComputer?: boolean }) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white px-3 py-2", soloComputer && "max-sm:hidden",
      tono === "rosso" && "border-red-200 bg-red-50/60", tono === "giallo" && "border-amber-200 bg-amber-50/60")}>
      <div className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-lg font-bold tabular-nums text-slate-900">{valore}</div>
      {nota && <div className="truncate text-[11px] text-muted-foreground">{nota}</div>}
    </div>
  );
}

export const TabAttivita = memo(function TabAttivita({ filters, assignedUserIds }: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const isMobile = useIsMobile();
  const range = getDateRange(filters.datePreset, filters.dateFrom, filters.dateTo);
  const da = range.from.toISOString();
  const a = range.to.toISOString();

  const { data, isLoading, error } = useQuery({
    queryKey: ["marketing-attivita-team", companyId, da.slice(0, 13), a.slice(0, 13), assignedUserIds],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("marketing_attivita_team" as never, {
        p_company_id: companyId,
        p_date_from: da,
        p_date_to: a,
        p_assigned_user_ids: assignedUserIds,
      } as never);
      if (error) throw error;
      return data as unknown as AttivitaTeam;
    },
    enabled: !!companyId,
    staleTime: 3 * 60 * 1000,
  });

  // un errore non è un caricamento: prima lo scheletro restava lì per sempre
  if (error) {
    return <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">Non riesco a caricare le attività del team. Riprova tra poco.</p>;
  }
  if (isLoading || !data) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>;
  }

  const t = data.totale;
  const chiamateConRisposta = pct(t.risposte, t.chiamate);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Cifra label="Contatti lavorati" valore={fmt(t.contatti)} nota={`${fmt(t.interventi)} interventi`} />
        <Cifra label="Chiamate" valore={fmt(t.chiamate)} nota={t.chiamate > 0 ? `${chiamateConRisposta} con risposta` : undefined} />
        <Cifra soloComputer label="Appuntamenti fissati" valore={fmt(t.appuntamenti_fissati)} nota="fissati nel periodo" />
        <Cifra label="In agenda" valore={fmt(t.appuntamenti)} nota={`${fmt(t.effettuati)} effettuati`} />
        <Cifra soloComputer label="Show rate" valore={show(t.effettuati, t.no_show)} nota={`${fmt(t.no_show)} no-show`}
          tono={t.effettuati + t.no_show >= 5 && t.effettuati / (t.effettuati + t.no_show) < 0.6 ? "giallo" : undefined} />
        <Cifra label="Da esitare" valore={fmt(t.da_esitare)} nota="passati senza esito" tono={t.da_esitare > 0 ? "giallo" : undefined} />
      </div>

      {/* Per persona */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" /> Chi ha lavorato quanto
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {data.persone.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nessuna attività nel periodo.</p>
          ) : isMobile ? (
            <div className="space-y-1.5">
              {data.persone.slice(0, 5).map((p) => (
                <div key={p.user_id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs">
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {fmt(p.contatti)} contatti · {fmt(p.chiamate)} chiamate · {fmt(p.appuntamenti)} app.
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Persona</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Contatti</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Chiamate</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Risposta</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Durata</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Note</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Messaggi</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Cambi fase</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">App. fissati</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">In agenda</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Show rate</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Da esitare</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs">Ultima attività</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.persone.map((p) => (
                    <TableRow key={p.user_id}>
                      <TableCell className="whitespace-nowrap text-sm font-medium">{p.name}</TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums">{fmt(p.contatti)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{fmt(p.chiamate)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{pct(p.risposte, p.chiamate)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{p.durata_media ? formatDuration(p.durata_media) : "—"}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{fmt(p.note)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{fmt(p.messaggi)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{fmt(p.cambi_fase)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{fmt(p.appuntamenti_fissati)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{fmt(p.appuntamenti)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{show(p.effettuati, p.no_show)}</TableCell>
                      <TableCell className={cn("text-right text-sm tabular-nums", p.da_esitare > 0 && "font-semibold text-amber-700")}>{fmt(p.da_esitare)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">
                        {p.ultima_attivita ? formatDistanceToNowStrict(parseISO(p.ultima_attivita), { locale: it, addSuffix: true }) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Contano solo gli interventi di una persona (non creazione e assegnazione automatiche). «App. fissati» = fissati
                da lei, anche per altri; «In agenda» = assegnati a lei nel periodo.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per calendario */}
      {data.calendari.length > 0 && !isMobile && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarDays className="h-4 w-4 text-muted-foreground" /> Calendari
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isMobile ? (
              <div className="space-y-1.5">
                {data.calendari.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs">
                    <span className="truncate font-medium">{c.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {fmt(c.in_agenda)} app. · show {show(c.effettuati, c.no_show)} · {pct(c.con_vendita, c.in_agenda)} vendita
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Calendario</TableHead>
                      <TableHead className="whitespace-nowrap text-right text-xs">In agenda</TableHead>
                      <TableHead className="whitespace-nowrap text-right text-xs">Prenotati da soli</TableHead>
                      <TableHead className="whitespace-nowrap text-right text-xs">Effettuati</TableHead>
                      <TableHead className="whitespace-nowrap text-right text-xs">No-show</TableHead>
                      <TableHead className="whitespace-nowrap text-right text-xs">Show rate</TableHead>
                      <TableHead className="whitespace-nowrap text-right text-xs">Da esitare</TableHead>
                      <TableHead className="whitespace-nowrap text-right text-xs">Diventati vendita</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.calendari.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="whitespace-nowrap text-sm font-medium">{c.name}</TableCell>
                        <TableCell className="text-right text-sm font-semibold tabular-nums">{fmt(c.in_agenda)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{fmt(c.prenotati_da_soli)} <span className="text-xs text-muted-foreground">({pct(c.prenotati_da_soli, c.in_agenda)})</span></TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{fmt(c.effettuati)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{fmt(c.no_show)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{show(c.effettuati, c.no_show)}</TableCell>
                        <TableCell className={cn("text-right text-sm tabular-nums", c.da_esitare > 0 && "font-semibold text-amber-700")}>{fmt(c.da_esitare)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{fmt(c.con_vendita)} <span className="text-xs text-muted-foreground">({pct(c.con_vendita, c.in_agenda)})</span></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  «Prenotati da soli» = senza un autore (link di prenotazione, assistente). «Diventati vendita» = il contatto ha
                  un preventivo firmato o un'opportunità vinta.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
});
