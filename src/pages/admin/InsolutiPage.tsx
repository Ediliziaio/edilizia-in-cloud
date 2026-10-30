import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { AlertTriangle, Gift, ExternalLink, RefreshCw, CheckCircle2, Clock, Ban, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatInsolutiEuro as euro, paymentStatusLabel, reminderStatusLabel, paymentFailureLabel, plannedRecoveryAction } from "@/lib/adminInsoluti";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isSuperAdminEmailAllowed } from "@/config/superAdmin";
import { Card, CardContent } from "@/components/ui/card";
import { IntestazioneArea, RigaRiepilogo, StatoVuoto } from "@/components/admin/fatturato/AreaUI";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface RigaInsoluto {
  azienda_id: string;
  azienda: string;
  email: string | null;
  stato_azienda: string;
  piano: string | null;
  canone_mensile: number | null;
  stato_stripe: string | null;
  stato_solleciti: string | null;
  pagamenti_falliti: number | null;
  primo_fallimento: string | null;
  motivo_fallimento: string | null;
  giorni_scaduto: number | null;
  fascia_anzianita: string;
  fatture_aperte: number;
  importo_dovuto: number;
  prossima_azione: string;
  in_omaggio: boolean | null;
}

const COLORE_FASCIA: Record<string, string> = {
  "0-7 giorni": "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  "8-14 giorni": "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  "15-30 giorni": "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  "oltre 30 giorni": "bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100",
};

/**
 * Cruscotto insoluti (F2-08).
 *
 * Risponde alle quattro domande del recupero crediti che prima richiedevano una
 * query SQL a mano: chi non ha pagato, quanto deve, da quanti giorni, e cosa
 * succede adesso.
 */
/**
 * Nome dell'azienda come link alla scheda solo per chi la può aprire: la rotta
 * /admin/aziende/:id è riservata al super admin (RequireSuperAdmin, stessa
 * regola qui). Per gli altri ruoli con billing_read resta testo.
 */
function NomeAzienda({ r, puoAprire }: { r: RigaInsoluto; puoAprire: boolean }) {
  if (!puoAprire) return <p className="font-medium text-sm">{r.azienda}</p>;
  return (
    <Link to={`/admin/aziende/${r.azienda_id}`} className="font-medium text-sm hover:underline underline-offset-2">
      {r.azienda}
    </Link>
  );
}

function CosaSuccede({ r }: { r: RigaInsoluto }) {
  if (r.in_omaggio) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Gift className="h-3 w-3" /> in omaggio
      </span>
    );
  }
  return (
    <span className={r.prossima_azione?.startsWith("sospensione") ? "text-destructive font-medium" : ""}>
      {plannedRecoveryAction(r.prossima_azione)}
    </span>
  );
}

type Raggruppa = "eta" | "motivo" | "importo";

const ORDINE_FASCE = ["oltre 30 giorni", "15-30 giorni", "8-14 giorni", "0-7 giorni"];

/** Il motivo, in parole semplici: carta rifiutata (col perché) o fatture aperte. */
function motivoDi(r: RigaInsoluto): string {
  if (r.in_omaggio) return "In omaggio (escluse dal recupero)";
  if (r.motivo_fallimento) return paymentFailureLabel(r.motivo_fallimento);
  if (r.fatture_aperte > 0) return "Fatture aperte non pagate";
  return "Abbonamento non in regola";
}

function fasciaImporto(r: RigaInsoluto): string {
  const v = Number(r.importo_dovuto) || 0;
  if (v >= 500) return "Da 500 € in su";
  if (v >= 100) return "Da 100 a 500 €";
  return "Sotto i 100 €";
}

function gruppoDi(r: RigaInsoluto, per: Raggruppa): string {
  if (per === "motivo") return motivoDi(r);
  if (per === "importo") return fasciaImporto(r);
  return r.in_omaggio ? "In omaggio" : (r.fascia_anzianita || "Senza data");
}

/**
 * Cruscotto insoluti (F2-08).
 *
 * Risponde alle quattro domande del recupero crediti: chi non ha pagato,
 * quanto deve, da quanti giorni, e cosa succede adesso. Le posizioni sono
 * raggruppate per età del credito (default), per motivo o per importo; le
 * card in alto filtrano per età.
 */
export default function InsolutiPage() {
  const { user, role } = useAuth();
  const puoAprireScheda = role === "super_admin" && isSuperAdminEmailAllowed(user?.email);
  const [per, setPer] = useState<Raggruppa>("eta");
  const [fascia, setFascia] = useState<string | null>(null);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-insoluti", "readable-v2"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_insoluti" as never)
        .select("*")
        .order("giorni_scaduto", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as RigaInsoluto[];
    },
    staleTime: 60_000,
  });

  const righe = useMemo(() => data ?? [], [data]);
  const daRecuperare = righe.filter((r) => !r.in_omaggio);
  const totaleDovuto = daRecuperare.reduce((s, r) => s + (r.importo_dovuto ?? 0), 0);
  const inSospensione = daRecuperare.filter((r) =>
    r.prossima_azione?.startsWith("sospensione automatica"),
  ).length;
  const perFascia = (f: string) => daRecuperare.filter((r) => r.fascia_anzianita === f);
  const sommaDi = (rs: RigaInsoluto[]) => rs.reduce((s, r) => s + (r.importo_dovuto ?? 0), 0);

  const visibili = fascia ? righe.filter((r) => !r.in_omaggio && r.fascia_anzianita === fascia) : righe;

  // Gruppi ordinati: per età dal più vecchio, per importo/motivo dal più pesante.
  const gruppi = useMemo(() => {
    const m = new Map<string, RigaInsoluto[]>();
    for (const r of visibili) {
      const g = gruppoDi(r, per);
      m.set(g, [...(m.get(g) ?? []), r]);
    }
    const lista = [...m.entries()].map(([nome, rs]) => ({ nome, righe: rs, totale: sommaDi(rs) }));
    if (per === "eta") {
      const pos = (n: string) => { const i = ORDINE_FASCE.indexOf(n); return i < 0 ? 99 : i; };
      return lista.sort((a, b) => pos(a.nome) - pos(b.nome));
    }
    return lista.sort((a, b) => b.totale - a.totale);
  }, [visibili, per]);

  const caricoOErrore = (v: React.ReactNode) => (isLoading ? "…" : error ? "—" : v);

  return (
    // Il padding lo dà già il layout admin (<main> p-3 / p-6).
    <div className="space-y-4">
      <IntestazioneArea
        icona={AlertTriangle}
        titolo="Insoluti"
        spiegazione="Chi non ha pagato, quanto deve, da quanto tempo e cosa succede adesso"
        azioni={
          <Button variant="outline" className="gap-2" onClick={() => refetch()} disabled={isFetching} aria-label="Aggiorna">
            <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> <span className="hidden sm:inline">Aggiorna</span>
          </Button>
        }
      />

      <div aria-busy={isLoading}>
        <RigaRiepilogo
          colonne={4}
          voci={[
            {
              etichetta: "Da recuperare",
              icona: Wallet,
              valore: caricoOErrore(euro(totaleDovuto)),
              dettaglio: isLoading ? "Caricamento posizioni…" : error ? "Dati non disponibili" : `${daRecuperare.length} ${daRecuperare.length === 1 ? "azienda" : "aziende"}`,
              tono: daRecuperare.length > 0 ? "critico" : "neutro",
              onClick: fascia ? () => setFascia(null) : undefined,
            },
            {
              etichetta: "Sospensione prevista",
              icona: Ban,
              valore: caricoOErrore(inSospensione),
              dettaglio: "secondo le regole di recupero",
              tono: inSospensione > 0 ? "attenzione" : "neutro",
            },
            {
              etichetta: "Oltre 30 giorni",
              icona: Clock,
              valore: caricoOErrore(perFascia("oltre 30 giorni").length),
              dettaglio: isLoading || error ? "credito più anziano" : euro(sommaDi(perFascia("oltre 30 giorni"))),
              tono: perFascia("oltre 30 giorni").length > 0 ? "critico" : "neutro",
              onClick: () => setFascia((f) => (f === "oltre 30 giorni" ? null : "oltre 30 giorni")),
              attivo: fascia === "oltre 30 giorni",
            },
            {
              etichetta: "In omaggio",
              icona: Gift,
              valore: caricoOErrore(righe.filter((r) => r.in_omaggio).length),
              dettaglio: "escluse dal recupero",
              tono: "spento",
            },
          ]}
        />
      </div>

      {/* Età del credito: un clic filtra l'elenco su quella fascia. */}
      {!isLoading && !error && daRecuperare.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {ORDINE_FASCE.map((f) => {
            const rs = perFascia(f);
            if (rs.length === 0) return null;
            return (
              <button
                key={f}
                type="button"
                aria-pressed={fascia === f}
                onClick={() => setFascia((x) => (x === f ? null : f))}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-shadow ${COLORE_FASCIA[f] ?? "bg-muted"} ${fascia === f ? "ring-2 ring-primary" : ""}`}
              >
                {f} · {rs.length} · {euro(sommaDi(rs))}
              </button>
            );
          })}
          {fascia && (
            <button type="button" className="text-xs text-muted-foreground underline underline-offset-2" onClick={() => setFascia(null)}>
              tutte le età
            </button>
          )}
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5 md:px-4">
          <p className="text-sm font-semibold">
            {isLoading ? "Caricamento…" : error ? "Posizioni non disponibili" : `${visibili.length} ${visibili.length === 1 ? "posizione" : "posizioni"}`}
          </p>
          <div className="inline-flex rounded-lg border p-0.5 text-xs" role="group" aria-label="Raggruppa per">
            {([["eta", "Per età"], ["motivo", "Per motivo"], ["importo", "Per importo"]] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={per === v}
                onClick={() => setPer(v)}
                className={`rounded-md px-2.5 py-1 transition-colors ${per === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <CardContent className="p-0 overflow-x-auto">
          {error && (
            <div role="alert" className="p-6 space-y-3"><p className="text-sm text-destructive">Impossibile caricare le posizioni insolute.</p><Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>Riprova</Button></div>
          )}

          {isLoading && (
            <div className="p-4 space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          )}

          {!isLoading && !error && righe.length === 0 && (
            <StatoVuoto
              icona={CheckCircle2}
              titolo="Nessuna posizione insoluta"
              testo="Tutti gli abbonamenti risultano pagati. Se un pagamento non va a buon fine, la posizione compare qui da sola."
            />
          )}

          {/* Da telefono: card dense al posto della tabella larga. */}
          {!isLoading && !error && visibili.length > 0 && (
            <div className="md:hidden">
              {gruppi.map((g) => (
                <section key={g.nome}>
                  <h2 className="flex items-baseline justify-between gap-2 bg-muted/50 px-3 py-1.5 text-xs font-semibold">
                    <span className="truncate">{g.nome} · {g.righe.length}</span>
                    <span className="shrink-0 tabular-nums">{euro(g.totale)}</span>
                  </h2>
                  <ul className="divide-y">
                    {g.righe.map((r) => (
                      <li key={r.azienda_id} className={`space-y-1 px-3 py-2.5 ${r.in_omaggio ? "opacity-60" : ""}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <NomeAzienda r={r} puoAprire={puoAprireScheda} />
                            <p className="truncate text-xs text-muted-foreground">{r.piano ?? "—"}{r.email ? ` · ${r.email}` : ""}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold tabular-nums">{euro(r.importo_dovuto)}</p>
                            {r.giorni_scaduto != null && (
                              <Badge variant="secondary" className={`text-[11px] ${COLORE_FASCIA[r.fascia_anzianita] ?? ""}`}>
                                {r.giorni_scaduto} {r.giorni_scaduto === 1 ? "giorno" : "giorni"}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <p className="text-xs">
                          <span className="font-medium">{paymentStatusLabel(r.stato_stripe)}</span>
                          {" · "}
                          <CosaSuccede r={r} />
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {!isLoading && !error && visibili.length > 0 && (
            <Table className="hidden min-w-[820px] md:table">
              <TableHeader>
                <TableRow>
                  <TableHead>Azienda</TableHead>
                  <TableHead>Piano</TableHead>
                  <TableHead className="text-right">Dovuto</TableHead>
                  <TableHead>Scaduto da</TableHead>
                  <TableHead>Stato pagamento</TableHead>
                  <TableHead>Cosa succede</TableHead>
                  <TableHead><span className="sr-only">Apri azienda</span></TableHead>
                </TableRow>
              </TableHeader>
              {gruppi.map((g) => (
                <TableBody key={g.nome}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={2} className="py-1.5 text-xs font-semibold">{g.nome} · {g.righe.length} {g.righe.length === 1 ? "posizione" : "posizioni"}</TableCell>
                    <TableCell className="py-1.5 text-right text-xs font-semibold tabular-nums">{euro(g.totale)}</TableCell>
                    <TableCell colSpan={4} className="py-1.5" />
                  </TableRow>
                  {g.righe.map((r) => (
                    <TableRow key={r.azienda_id} className={r.in_omaggio ? "opacity-60" : undefined}>
                      <TableCell>
                        <NomeAzienda r={r} puoAprire={puoAprireScheda} />
                        <p className="text-xs text-muted-foreground">{r.email ?? "—"}</p>
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.piano ?? "—"}
                        {r.canone_mensile != null && (
                          <span className="block text-xs text-muted-foreground">
                            {Number(r.canone_mensile).toLocaleString("it-IT", {
                              style: "currency", currency: "EUR",
                            })}/mese
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {euro(r.importo_dovuto)}
                        {r.fatture_aperte > 0 && (
                          <span className="block text-xs text-muted-foreground font-normal">
                            {r.fatture_aperte} {r.fatture_aperte === 1 ? "fattura" : "fatture"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.giorni_scaduto != null ? (
                          <Badge variant="secondary" className={`text-xs ${COLORE_FASCIA[r.fascia_anzianita] ?? ""}`}>
                            {r.giorni_scaduto} {r.giorni_scaduto === 1 ? "giorno" : "giorni"}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                        {r.primo_fallimento && (
                          <span className="block text-[11px] text-muted-foreground mt-0.5">
                            dal {format(new Date(r.primo_fallimento), "d MMM", { locale: it })}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        <p className="font-medium">{paymentStatusLabel(r.stato_stripe)}</p>
                        {r.stato_solleciti && r.stato_solleciti !== "none" && (
                          <p className="text-muted-foreground mt-1">{reminderStatusLabel(r.stato_solleciti)}</p>
                        )}
                        {r.motivo_fallimento && <p className="text-muted-foreground mt-1 max-w-[220px]">{paymentFailureLabel(r.motivo_fallimento)}</p>}
                        <details className="mt-2 text-muted-foreground max-w-[240px]">
                          <summary className="cursor-pointer focus-visible:outline focus-visible:outline-2">Dettagli pagamento</summary>
                          <p className="mt-1 break-words">Stripe: {r.stato_stripe ?? "non disponibile"} · Solleciti: {r.stato_solleciti ?? "non disponibile"}</p>
                          {r.motivo_fallimento && <p className="mt-1 break-words">{r.motivo_fallimento}</p>}
                          {r.pagamenti_falliti != null && <p className="mt-1">Tentativi falliti: {r.pagamenti_falliti}</p>}
                        </details>
                      </TableCell>
                      <TableCell className="text-xs">
                        <CosaSuccede r={r} />
                      </TableCell>
                      <TableCell>
                        {puoAprireScheda && (
                          <Button asChild variant="ghost" size="sm">
                            <Link aria-label={`Apri azienda ${r.azienda}`} to={`/admin/aziende/${r.azienda_id}`}>
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              ))}
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="hidden text-xs text-muted-foreground sm:block">
        Gli importi derivano dalle fatture aperte. Le azioni indicate sono quelle previste dalle regole di recupero:
        verifica lo stato effettivo nella scheda azienda e l’esecuzione delle automazioni in Operazioni.
      </p>
    </div>
  );
}
