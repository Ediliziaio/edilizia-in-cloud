import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { ArrowRight, Mail, MessageCircle, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { BriefingOperativo } from "@/components/admin/dashboard/BriefingOperativo";
import { DashboardHeader } from "@/components/admin/dashboard/DashboardHeader";
import { DashboardSkeleton } from "@/components/admin/dashboard/DashboardSkeleton";

interface Soldi {
  mrr_incassato: number;
  aziende_paganti: number;
  a_listino_non_fatturato: number;
  aziende_comped: number;
  insoluti_n: number;
  insoluti_totale: number;
  tool_a_costo_mese: number;
  calcolato_il: string;
}

interface Azienda {
  id: string;
  nome: string;
  stato: string;
  piano: string | null;
  stripe: string | null;
  creata_il: string;
  ultimo_accesso: string | null;
  utenti_totali: number;
  utenti_attivi_7g: number;
  ordini_30g: number;
  preventivi_30g: number;
  salute: number | null;
  insoluto: boolean;
  mrr_listino: number;
  mrr_incassato: number;
}

interface Outreach {
  whatsapp: {
    campagne_in_corso: number; in_coda: number; inviati_oggi: number; risposte_oggi: number;
    risposte_totali: number; numeri_connessi: number; numeri_totali: number;
  };
  email: {
    sequenze_attive: number; in_coda: number; inviati_oggi: number; inviati_7g: number;
    risposte_7g: number; caselle_attive: number; caselle_in_errore: number; caselle_totali: number;
  };
  calcolato_il: string;
}

const CHIAVI = {
  soldi: ["admin-home-soldi"],
  aziende: ["admin-home-aziende"],
  outreach: ["admin-home-outreach"],
  briefing: ["admin-briefing-operativo"],
};

async function rpc<T>(nome: string): Promise<T> {
  const { data, error } = await supabase.rpc(nome as never);
  if (error) throw error;
  return data as unknown as T;
}

const GIORNO_MS = 24 * 60 * 60 * 1000;

/**
 * Home della piattaforma. Risponde a quattro domande, nell'ordine in cui il
 * founder se le fa la mattina: cosa devo fare oggi, quanti soldi, chi sta
 * usando il prodotto, come va l'outreach. Prima erano 23 widget da SaaS con
 * migliaia di clienti; con 18 aziende dicevano lo stesso MRR sei volte.
 */
export default function AdminDashboard() {
  const { permissions } = useSuperAdminPermissions();
  const queryClient = useQueryClient();

  const soldi = useQuery({ queryKey: CHIAVI.soldi, queryFn: () => rpc<Soldi>("admin_home_soldi"), staleTime: 5 * 60_000 });
  const aziende = useQuery({ queryKey: CHIAVI.aziende, queryFn: () => rpc<Azienda[]>("admin_home_aziende"), staleTime: 5 * 60_000 });
  const outreach = useQuery({ queryKey: CHIAVI.outreach, queryFn: () => rpc<Outreach>("admin_home_outreach"), staleTime: 2 * 60_000 });

  if (!permissions.can_view_platform_stats) return <AccessDenied />;

  const isRefreshing = soldi.isFetching || aziende.isFetching || outreach.isFetching;
  const aggiorna = () => Object.values(CHIAVI).forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));

  if (soldi.isLoading && aziende.isLoading && outreach.isLoading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Piattaforma"
        subtitle="Cosa fare oggi, soldi, chi usa il prodotto, outreach"
        lastUpdatedAt={soldi.data ? `Aggiornato alle ${format(new Date(soldi.data.calcolato_il), "HH:mm", { locale: it })}` : null}
        isRefreshing={isRefreshing}
        onRefresh={aggiorna}
      >
        {/* Nell'hero navy i link ereditano il bianco: il bottone chiaro vuole il suo colore. */}
        <Button asChild variant="outline" size="sm" className="gap-2 text-foreground hover:text-foreground">
          <Link to="/admin/aziende/nuova">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nuova azienda</span>
          </Link>
        </Button>
      </DashboardHeader>

      <BriefingOperativo />

      {soldi.data ? <SoldiInUnaRiga s={soldi.data} /> : <Skeleton className="h-24 w-full" />}

      {aziende.data ? <AziendeTabella righe={aziende.data} /> : <Skeleton className="h-64 w-full" />}

      {outreach.data ? <OutreachInCorso o={outreach.data} /> : <Skeleton className="h-40 w-full" />}
    </div>
  );
}

function Tessera({
  etichetta, valore, dettaglio, tono = "neutro",
}: {
  etichetta: string; valore: string | number; dettaglio?: string;
  tono?: "neutro" | "buono" | "attenzione" | "critico";
}) {
  const colori = {
    neutro: "text-foreground",
    buono: "text-emerald-600 dark:text-emerald-400",
    attenzione: "text-amber-600 dark:text-amber-400",
    critico: "text-destructive",
  }[tono];
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{etichetta}</p>
      <p className={`text-2xl font-semibold tabular-nums leading-tight ${colori}`}>{valore}</p>
      {dettaglio && <p className="text-xs text-muted-foreground mt-0.5">{dettaglio}</p>}
    </div>
  );
}

function plurale(n: number, uno: string, tanti: string) {
  return `${n} ${n === 1 ? uno : tanti}`;
}

function SoldiInUnaRiga({ s }: { s: Soldi }) {
  return (
    <section className="space-y-2">
      <Intestazione titolo="Soldi" link={{ to: "/admin/fatturato", testo: "Fatturato" }} />
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Tessera
          etichetta="Incassato al mese"
          valore={formatCurrency(s.mrr_incassato)}
          dettaglio={plurale(s.aziende_paganti, "azienda pagante", "aziende paganti")}
        />
        <Tessera
          etichetta="Regalato a listino"
          valore={formatCurrency(s.a_listino_non_fatturato)}
          dettaglio={`${plurale(s.aziende_comped, "azienda", "aziende")} con piano concesso, al mese`}
        />
        <Tessera
          etichetta="Insoluti"
          valore={s.insoluti_n > 0 ? formatCurrency(s.insoluti_totale) : "Nessuno"}
          dettaglio={s.insoluti_n > 0 ? plurale(s.insoluti_n, "azienda con carta rifiutata", "aziende con carta rifiutata") : "Tutti i pagamenti sono passati"}
          tono={s.insoluti_n > 0 ? "critico" : "buono"}
        />
        <Tessera
          etichetta="Tool a costo, questo mese"
          valore={formatCurrency(s.tool_a_costo_mese)}
          dettaglio="Render, AI, email e WhatsApp dal 1° del mese"
        />
      </div>
    </section>
  );
}

function Intestazione({ titolo, sottotitolo, link }: { titolo: string; sottotitolo?: string; link?: { to: string; testo: string } }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">{titolo}</h2>
        {sottotitolo && <span className="text-xs text-muted-foreground">{sottotitolo}</span>}
      </div>
      {link && (
        <Link to={link.to} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          {link.testo} <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

function giorniDa(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / GIORNO_MS);
}

function AziendeTabella({ righe }: { righe: Azienda[] }) {
  const entrateSettimana = righe.filter((a) => (giorniDa(a.ultimo_accesso) ?? 99) < 7).length;
  return (
    <section className="space-y-2">
      <Intestazione
        titolo="Chi usa il prodotto"
        sottotitolo={`${plurale(righe.length, "azienda", "aziende")} · ${entrateSettimana} entrate negli ultimi 7 giorni`}
        link={{ to: "/admin/aziende", testo: "Tutte le aziende" }}
      />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>Azienda</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Ultimo accesso</TableHead>
                <TableHead className="text-right">Utenti attivi 7gg</TableHead>
                <TableHead className="text-right">Ordini 30gg</TableHead>
                <TableHead className="text-right">Preventivi 30gg</TableHead>
                <TableHead className="text-right">Salute</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {righe.map((a) => {
                const giorni = giorniDa(a.ultimo_accesso);
                const accessoTono = giorni === null || giorni > 30
                  ? "text-destructive"
                  : giorni > 14 ? "text-amber-600 dark:text-amber-400" : "";
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link to={`/admin/aziende/${a.id}`} className="font-medium hover:underline">{a.nome}</Link>
                      <p className="text-xs text-muted-foreground">{a.piano ?? "senza piano"}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <StatoBadge stato={a.stato} />
                        {a.mrr_incassato > 0 && (
                          <Badge className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">paga</Badge>
                        )}
                        {a.insoluto && <Badge variant="destructive" className="text-[10px]">insoluto</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className={`text-xs whitespace-nowrap ${accessoTono}`}>
                      {a.ultimo_accesso
                        ? formatDistanceToNow(new Date(a.ultimo_accesso), { addSuffix: true, locale: it })
                        : "mai entrata"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {a.utenti_attivi_7g}
                      <span className="text-muted-foreground"> / {a.utenti_totali}</span>
                    </TableCell>
                    <Numero valore={a.ordini_30g} />
                    <Numero valore={a.preventivi_30g} />
                    <TableCell className="text-right">
                      <Salute score={a.salute} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}

function Numero({ valore }: { valore: number }) {
  return (
    <TableCell className={`text-right tabular-nums text-xs ${valore === 0 ? "text-muted-foreground" : ""}`}>
      {valore}
    </TableCell>
  );
}

function StatoBadge({ stato }: { stato: string }) {
  if (stato === "active") return <Badge variant="outline" className="text-[10px]">attiva</Badge>;
  if (stato === "free") return <Badge variant="outline" className="text-[10px]">gratuita</Badge>;
  if (stato === "trial") return <Badge variant="secondary" className="text-[10px]">trial</Badge>;
  return <Badge variant="destructive" className="text-[10px]">{stato === "expired" ? "scaduta" : stato}</Badge>;
}

function Salute({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-muted-foreground">—</span>;
  const tono = score >= 70
    ? "text-emerald-600 dark:text-emerald-400"
    : score >= 40 ? "text-amber-600 dark:text-amber-400" : "text-destructive";
  return <span className={`text-xs font-medium tabular-nums ${tono}`}>{score}</span>;
}

function OutreachInCorso({ o }: { o: Outreach }) {
  const wa = o.whatsapp;
  const em = o.email;
  return (
    <section className="space-y-2">
      <Intestazione titolo="Outreach a freddo" sottotitolo="quello che le campagne stanno facendo oggi" />
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp</span>
              <Link to="/admin/marketing/whatsapp-locale/campagne" className="text-xs font-normal text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                {plurale(wa.campagne_in_corso, "campagna in corso", "campagne in corso")} <ArrowRight className="h-3 w-3" />
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tessera etichetta="Inviati oggi" valore={wa.inviati_oggi} />
            <Tessera etichetta="Risposte oggi" valore={wa.risposte_oggi} dettaglio={`${wa.risposte_totali} in totale`} tono={wa.risposte_oggi > 0 ? "buono" : "neutro"} />
            <Tessera etichetta="In coda" valore={wa.in_coda.toLocaleString("it-IT")} />
            <Tessera
              etichetta="Numeri collegati"
              valore={`${wa.numeri_connessi}/${wa.numeri_totali}`}
              tono={wa.numeri_connessi < wa.numeri_totali ? "critico" : "buono"}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2"><Mail className="h-4 w-4 text-blue-600" /> Email</span>
              <Link to="/admin/marketing/email" className="text-xs font-normal text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                {plurale(em.sequenze_attive, "sequenza attiva", "sequenze attive")} <ArrowRight className="h-3 w-3" />
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tessera etichetta="Inviate oggi" valore={em.inviati_oggi} dettaglio={`${em.inviati_7g} negli ultimi 7 giorni`} />
            <Tessera etichetta="Risposte 7 giorni" valore={em.risposte_7g} tono={em.risposte_7g > 0 ? "buono" : "neutro"} />
            <Tessera etichetta="In coda" valore={em.in_coda.toLocaleString("it-IT")} />
            <Tessera
              etichetta="Caselle attive"
              valore={`${em.caselle_attive}/${em.caselle_totali}`}
              dettaglio={em.caselle_in_errore > 0 ? plurale(em.caselle_in_errore, "in errore", "in errore") : undefined}
              tono={em.caselle_in_errore > 0 ? "critico" : "buono"}
            />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
