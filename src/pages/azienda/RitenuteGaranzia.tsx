// ============================================================================
// Ritenute di Garanzia — il registro dei soldi parcheggiati (capp. 29, 73-74)
// ============================================================================
// Due direzioni: ATTIVE (il committente le trattiene a noi sui SAL — soldi
// gia' maturati che tornano solo se il rapporto finisce bene) e PASSIVE
// (quelle che noi tratteniamo ai subappaltatori, back-to-back). Il registro
// esiste perche' senza nessuno le va a riprendere: svincolo previsto,
// scaduto da svincolare, fideiussione come alternativa.
// ============================================================================
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { parseDecimalIT } from "@/lib/parseDecimalIT";
import {
  FiscalLegacyRedirect,
  FiscalStandaloneWorkspace,
} from "@/components/fatturazione/FiscalWorkspace";
import { FiscalQueryState } from "@/components/fatturazione/FiscalQueryState";
import { usePermissions } from "@/hooks/usePermissions";
import { readAllPages } from "@/lib/personale/readAllPages";
import { useFiscalPeriod } from "@/hooks/useFiscalPeriod";
import { FiscalReleaseDialog } from "@/components/fatturazione/FiscalReleaseDialog";
import { RitenutaBadge } from "@/components/ritenute/RitenutaBadge";
import {
  FiscalSectionHeader,
  FiscalMetric,
  FiscalSelectFilter,
} from "@/components/fatturazione/FiscalSectionLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle2, Plus, ShieldCheck } from "lucide-react";
import { fiscalAmountTotal } from "@/lib/fatturazione/fiscalWorkspace";
import {
  fiscalDate,
  fiscalDue,
  fiscalMatch,
  fiscalToday,
} from "@/lib/fatturazione/fiscalInsights";

interface Ritenuta {
  id: string;
  contratto_id: string | null;
  order_id: string | null;
  direzione: "attiva" | "passiva";
  controparte: string | null;
  importo: number;
  percentuale_applicata: number | null;
  stato: "trattenuta" | "svincolata" | "persa";
  data_svincolo_prevista: string | null;
  data_svincolo_effettiva: string | null;
  fideiussione: boolean;
  note: string | null;
  created_at: string;
  orders?: { order_code: string | null; description: string | null } | null;
  contratti_subappalto?: {
    subappaltatori_sicurezza: { ragione_sociale: string | null } | null;
  } | null;
}

const OGGI = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export default function RitenuteGaranzia({
  embedded = false,
}: { embedded?: boolean } = {}) {
  return embedded ? (
    <RitenuteContent />
  ) : (
    <FiscalLegacyRedirect
      section="ritenute"
      fallback={<FiscalStandaloneWorkspace section="ritenute" />}
    />
  );
}
function RitenuteContent() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions(),
    period = useFiscalPeriod();
  const canEdit =
    permissions.isAdmin && !permissions.solaLettura && !permissions.isLoading;
  const queryClient = useQueryClient();
  const direzione =
    period.params.get("direzione") === "passiva" ? "passiva" : "attiva";
  const [nuovaOpen, setNuovaOpen] = useState(false);
  const [releaseId, setReleaseId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const search = period.params.get("q_ritenute") ?? "";
  const rawStatus = period.params.get("stato_ritenute") ?? "tutti";
  const status = [
    "tutti",
    "trattenuta",
    "svincolata",
    "svincolata_anno",
    "persa",
  ].includes(rawStatus)
    ? rawStatus
    : "tutti";
  const rawDue = period.params.get("scadenza_ritenute") ?? "tutte";
  const due = ["tutte", "raggiunta", "prossimi", "mancante"].includes(rawDue)
    ? rawDue
    : "tutte";
  const applyFilter = (changes: Record<string, string>) => {
    period.set(changes);
    setPage(0);
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["ritenute-garanzia", "all", companyId],
    enabled: !!companyId,
    queryFn: async ({ signal }) =>
      readAllPages((from, to) =>
        supabase
          .from("ritenute_garanzia")
          .select(
            "id, contratto_id, order_id, direzione, controparte, importo, percentuale_applicata, stato, data_svincolo_prevista, data_svincolo_effettiva, fideiussione, note, created_at, orders(order_code, description), contratti_subappalto(subappaltatori_sicurezza(ragione_sociale))",
          )
          .eq("company_id", companyId!)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to)
          .abortSignal(signal),
      ) as Promise<Ritenuta[]>,
  });

  const ritenute = useMemo(() => data ?? [], [data]);
  const attive = ritenute.filter((r) => r.direzione === "attiva");
  const passive = ritenute.filter((r) => r.direzione === "passiva");
  const lista = direzione === "attiva" ? attive : passive;
  const filtered = lista.filter(
    (r) =>
      fiscalMatch(
        search,
        r.controparte,
        r.orders?.order_code,
        r.orders?.description,
        r.contratti_subappalto?.subappaltatori_sicurezza?.ragione_sociale,
      ) &&
      (status === "tutti" ||
        (status === "svincolata_anno"
          ? r.stato === "svincolata" &&
            (r.data_svincolo_effettiva ?? "").slice(0, 4) ===
              String(period.anno)
          : r.stato === status)) &&
      (due === "tutte" ||
        (r.stato === "trattenuta" &&
          (due === "raggiunta"
            ? fiscalDue(r.data_svincolo_prevista) !== "mancante" &&
              !!r.data_svincolo_prevista &&
              r.data_svincolo_prevista <= fiscalToday()
            : due === "prossimi"
              ? fiscalDue(r.data_svincolo_prevista) === "prossima"
              : fiscalDue(r.data_svincolo_prevista) === "mancante"))),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 50)),
    current = Math.min(page, pages - 1);

  const aperteAttive = attive.filter((r) => r.stato === "trattenuta");
  const sum = (items: Ritenuta[]) =>
    fiscalAmountTotal(items.map((r) => r.importo));
  const money = (value: number | null) =>
    value === null ? "Da verificare" : formatCurrency(value);
  const trattenutoAttivo = sum(aperteAttive);
  const trattenutoPassivo = sum(
    passive.filter((r) => r.stato === "trattenuta"),
  );
  const daSvincolare = aperteAttive.filter(
    (r) =>
      fiscalDue(r.data_svincolo_prevista) !== "mancante" &&
      r.data_svincolo_prevista &&
      r.data_svincolo_prevista <= OGGI(),
  );
  const svincolatoAnno = sum(
    ritenute.filter(
      (r) =>
        r.direzione === "attiva" &&
        r.stato === "svincolata" &&
        (r.data_svincolo_effettiva ?? "").slice(0, 4) === String(period.anno),
    ),
  );

  if (isLoading || isError)
    return (
      <FiscalQueryState
        loading={isLoading}
        error={isError}
        onRetry={() => void refetch()}
      />
    );
  return (
    <div className="space-y-4">
      <FiscalSectionHeader
        title="Ritenute di garanzia"
        description="Garanzie contrattuali, non ritenute fiscali. Saldi aperti di tutti gli anni; svincoli dell’anno selezionato."
        actions={
          <Button
            size="sm"
            disabled={!canEdit}
            onClick={() => setNuovaOpen(true)}
            className="bg-orange-500 text-white hover:bg-orange-600"
          >
            <Plus className="mr-1 h-4 w-4" />
            Nuova ritenuta
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FiscalMetric
          label="Trattenuto a te"
          value={money(trattenutoAttivo)}
          onClick={() =>
            applyFilter({
              direzione: "attiva",
              stato_ritenute: "trattenuta",
              scadenza_ritenute: "tutte",
              q_ritenute: "",
            })
          }
          active={
            direzione === "attiva" && status === "trattenuta" && due === "tutte"
          }
          description={`${aperteAttive.length} ${aperteAttive.length === 1 ? "ritenuta aperta" : "ritenute aperte"} sui tuoi SAL · tutti gli anni`}
        />
        <FiscalMetric
          label="Da svincolare"
          value={daSvincolare.length}
          onClick={() =>
            applyFilter({
              direzione: "attiva",
              stato_ritenute: "trattenuta",
              scadenza_ritenute: "raggiunta",
              q_ritenute: "",
            })
          }
          active={direzione === "attiva" && due === "raggiunta"}
          warning={daSvincolare.length > 0}
          description={
            daSvincolare.length > 0
              ? `${money(sum(daSvincolare))} con data prevista raggiunta`
              : "Nessuna ritenuta aperta con data prevista raggiunta"
          }
        />
        <FiscalMetric
          label="Trattenuto ai subappaltatori"
          value={money(trattenutoPassivo)}
          onClick={() =>
            applyFilter({
              direzione: "passiva",
              stato_ritenute: "trattenuta",
              scadenza_ritenute: "tutte",
              q_ritenute: "",
            })
          }
          active={
            direzione === "passiva" &&
            status === "trattenuta" &&
            due === "tutte"
          }
          description="Solo garanzie ancora aperte · tutti gli anni"
        />
        <FiscalMetric
          label={`Svincolato nel ${period.anno}`}
          value={money(svincolatoAnno)}
          onClick={() =>
            applyFilter({
              direzione: "attiva",
              stato_ritenute: "svincolata_anno",
              scadenza_ritenute: "tutte",
              q_ritenute: "",
            })
          }
          active={direzione === "attiva" && status === "svincolata_anno"}
          description="Svincolo dichiarato a tuo favore, non prova d’incasso"
        />
      </div>
      <details className="rounded-xl border bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Criteri di lettura e verifica
        </summary>
        <p className="mt-3 text-sm text-muted-foreground">
          Le garanzie aperte sono mostrate per tutti gli anni; il riepilogo
          svincoli riguarda l’anno selezionato. Importi, durata e percentuali
          dipendono dal contratto. Lo svincolo non prova l’incasso e non genera
          un movimento bancario. Ogni svincolo richiede data, riferimento
          verificato e conferma esplicita, conservando lo storico delle
          modifiche. Il conteggio nei filtri comprende anche le garanzie già
          svincolate o perse, escluse dai saldi aperti.
        </p>
      </details>

      {/* Selettore direzione + tabella */}
      <div
        role="group"
        aria-label="Direzione delle garanzie"
        className="flex flex-wrap items-center gap-2"
      >
        {(
          [
            ["attiva", `Trattenute a te (${attive.length})`],
            ["passiva", `Ai subappaltatori (${passive.length})`],
          ] as const
        ).map(([val, label]) => (
          <Button
            key={val}
            type="button"
            variant={direzione === val ? "default" : "outline"}
            aria-pressed={direzione === val}
            onClick={() =>
              applyFilter({
                direzione: val,
                stato_ritenute: "tutti",
                scadenza_ritenute: "tutte",
              })
            }
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Cerca nelle garanzie"
          placeholder="Commessa o controparte…"
          className="min-w-48 flex-1"
          value={search}
          onChange={(e) => {
            period.set({ q_ritenute: e.target.value }, true);
            setPage(0);
          }}
        />
        <FiscalSelectFilter
          label="Stato delle garanzie"
          value={status}
          onChange={(value) => applyFilter({ stato_ritenute: value })}
          options={[
            { value: "tutti", label: "Tutti gli stati" },
            { value: "trattenuta", label: "Aperte" },
            { value: "svincolata", label: "Svincolate · tutti gli anni" },
            {
              value: "svincolata_anno",
              label: `Svincolate nel ${period.anno}`,
            },
            { value: "persa", label: "Perse" },
          ]}
        />
        <FiscalSelectFilter
          label="Scadenza delle garanzie"
          value={due}
          onChange={(value) => applyFilter({ scadenza_ritenute: value })}
          options={[
            { value: "tutte", label: "Tutte le scadenze" },
            { value: "raggiunta", label: "Data prevista raggiunta" },
            { value: "prossimi", label: "Entro 30 giorni · aperte" },
            { value: "mancante", label: "Senza data valida · aperte" },
          ]}
        />
        {(search || status !== "tutti" || due !== "tutte") && (
          <Button
            variant="ghost"
            onClick={() =>
              applyFilter({
                q_ritenute: "",
                stato_ritenute: "tutti",
                scadenza_ritenute: "tutte",
              })
            }
          >
            Azzera filtri
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        I riepiloghi mantengono il loro periodo di riferimento; i filtri
        cambiano solo l’elenco.
      </p>

      <Card className="overflow-hidden rounded-xl bg-white shadow-none">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {direzione === "attiva"
                    ? "Commessa · committente"
                    : "Subappaltatore"}
                </TableHead>
                <TableHead className="text-right">Importo</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Svincolo previsto</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-12 text-center text-muted-foreground"
                  >
                    <ShieldCheck className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    {lista.length > 0 ? (
                      <p>Nessuna garanzia corrisponde ai filtri selezionati.</p>
                    ) : direzione === "attiva" ? (
                      <>
                        <p className="mb-1 font-medium text-foreground">
                          Nessuna ritenuta registrata sui tuoi SAL
                        </p>
                        <p className="text-sm">
                          Quando un committente trattiene una quota su un
                          pagamento, registralo qui: è l'unico modo per
                          andarselo a riprendere alla scadenza.
                        </p>
                      </>
                    ) : (
                      <p>Nessuna ritenuta trattenuta ai subappaltatori.</p>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.slice(current * 50, (current + 1) * 50).map((r) => {
                  const scaduta =
                    r.stato === "trattenuta" &&
                    r.data_svincolo_prevista &&
                    r.data_svincolo_prevista <= OGGI();
                  return (
                    <TableRow
                      key={r.id}
                      className={scaduta ? "bg-orange-50/60" : undefined}
                    >
                      <TableCell>
                        <p className="font-medium">
                          {r.orders?.order_code ??
                            r.contratti_subappalto?.subappaltatori_sicurezza
                              ?.ragione_sociale ??
                            r.controparte ??
                            "—"}
                          {r.fideiussione && (
                            <Badge
                              variant="outline"
                              className="ml-2 border-sky-300 text-[10px] text-sky-700"
                            >
                              fideiussione
                            </Badge>
                          )}
                        </p>
                        <p className="max-w-[260px] truncate text-xs text-muted-foreground">
                          {r.orders?.order_code
                            ? (r.controparte ?? r.orders?.description ?? "")
                            : (r.note ?? "")}
                        </p>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {money(fiscalAmountTotal([r.importo]))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.percentuale_applicata != null
                          ? `${Number(r.percentuale_applicata).toLocaleString("it-IT")}%`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <RitenutaBadge stato={r.stato} />
                      </TableCell>
                      <TableCell
                        className={
                          scaduta ? "font-medium text-orange-700" : undefined
                        }
                      >
                        {r.data_svincolo_prevista
                          ? fiscalDate(r.data_svincolo_prevista)
                          : "—"}
                        {scaduta && (
                          <span className="block text-[10px]">
                            da riprendere
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 border-blue-200 text-xs text-blue-700 hover:bg-blue-50"
                            onClick={() => setReleaseId(r.id)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />{" "}
                            {r.stato === "trattenuta"
                              ? "Verifica svincolo"
                              : "Dettagli e storico"}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>
          {filtered.length} {filtered.length === 1 ? "garanzia" : "garanzie"} ·
          pagina {current + 1} di {pages}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            Precedenti
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            Successivi
          </Button>
        </div>
      </div>

      <NuovaRitenutaDialog
        open={nuovaOpen}
        onOpenChange={setNuovaOpen}
        companyId={companyId}
        onCreated={() =>
          queryClient.invalidateQueries({ queryKey: ["ritenute-garanzia"] })
        }
      />
      {releaseId && companyId && canEdit && (
        <FiscalReleaseDialog
          key={`${companyId}:${releaseId}`}
          companyId={companyId}
          id={releaseId}
          onClose={() => setReleaseId(null)}
        />
      )}
    </div>
  );
}

function NuovaRitenutaDialog({
  open,
  onOpenChange,
  companyId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string | undefined;
  onCreated: () => void;
}) {
  const permissions = usePermissions();
  const [direzione, setDirezione] = useState<"attiva" | "passiva">("attiva");
  const [orderId, setOrderId] = useState<string>("");
  // Una ritenuta passiva vive su un contratto di subappalto (lo richiede il
  // database): prima il dialog non lo chiedeva e l'inserimento falliva sempre.
  const [contrattoId, setContrattoId] = useState<string>("");
  const [controparte, setControparte] = useState("");
  const [importo, setImporto] = useState("");
  const [percentuale, setPercentuale] = useState("");
  const [svincoloPrevisto, setSvincoloPrevisto] = useState("");
  const [fideiussione, setFideiussione] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: commesse = [] } = useQuery({
    queryKey: ["ritenute-commesse-picker", companyId],
    enabled: !!companyId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_code, description")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: contratti = [] } = useQuery({
    queryKey: ["ritenute-contratti-picker", companyId],
    enabled: !!companyId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contratti_subappalto")
        .select(
          "id, numero_contratto, ritenuta_garanzia_pct, sub:subappaltatori_sicurezza!contratti_subappalto_subappaltatore_id_fkey(ragione_sociale), commessa:orders!contratti_subappalto_order_id_fkey(order_code)",
        )
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        numero_contratto: string | null;
        ritenuta_garanzia_pct: number | null;
        sub: { ragione_sociale: string | null } | null;
        commessa: { order_code: string | null } | null;
      }>;
    },
  });

  const salva = async () => {
    if (!companyId || !permissions.isAdmin || permissions.solaLettura) {
      toast({ title: "Modifica non autorizzata", variant: "destructive" });
      return;
    }
    const imp = parseDecimalIT(importo);
    if (!imp || imp <= 0) {
      toast({
        title: "Importo mancante",
        description: "Inserisci l'importo trattenuto.",
        variant: "destructive",
      });
      return;
    }
    if (direzione === "passiva" && !contrattoId) {
      toast({
        title: "Contratto mancante",
        description:
          "Una ritenuta al subappaltatore si registra sul suo contratto: scegli quale.",
        variant: "destructive",
      });
      return;
    }
    if (direzione === "attiva" && !orderId) {
      toast({
        title: "Commessa mancante",
        description: "Una ritenuta attiva vive su una commessa: scegli quale.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("ritenute_garanzia").insert({
        company_id: companyId,
        direzione,
        order_id: direzione === "attiva" && orderId ? orderId : null,
        // Passiva: commessa, percentuale, svincolo e subappaltatore li completa il database dal contratto.
        contratto_id: direzione === "passiva" ? contrattoId : null,
        controparte: controparte || null,
        importo: imp,
        percentuale_applicata: percentuale.trim()
          ? parseDecimalIT(percentuale)
          : null,
        stato: "trattenuta",
        data_svincolo_prevista: svincoloPrevisto || null,
        fideiussione,
      });
      if (error) throw error;
      toast({ title: "Ritenuta registrata" });
      onCreated();
      onOpenChange(false);
      setOrderId("");
      setContrattoId("");
      setControparte("");
      setImporto("");
      setSvincoloPrevisto("");
      setFideiussione(false);
    } catch (e) {
      toast({
        title: "Errore",
        description: e instanceof Error ? e.message : "Riprova.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Nuova ritenuta di garanzia</DialogTitle>
          <DialogDescription>
            Registra la trattenuta appena compare su un pagamento: la data di
            svincolo è quella che poi ti ricorda di andare a riprenderla.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Direzione</Label>
            <Select
              value={direzione}
              onValueChange={(v) => setDirezione(v as "attiva" | "passiva")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="attiva">
                  Trattenuta a me (dal committente)
                </SelectItem>
                <SelectItem value="passiva">
                  La trattengo io (al subappaltatore)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {direzione === "attiva" && (
            <div className="space-y-1.5">
              <Label>Commessa</Label>
              <Select value={orderId} onValueChange={setOrderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Scegli la commessa" />
                </SelectTrigger>
                <SelectContent>
                  {commesse.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.order_code ?? c.id.slice(0, 8)}
                      {c.description ? ` · ${c.description.slice(0, 40)}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {direzione === "passiva" && (
            <div className="space-y-1.5">
              <Label>Contratto di subappalto</Label>
              <Select
                value={contrattoId}
                onValueChange={(v) => {
                  setContrattoId(v);
                  const c = contratti.find((x) => x.id === v);
                  if (c?.sub?.ragione_sociale && !controparte)
                    setControparte(c.sub.ragione_sociale);
                  if (c?.ritenuta_garanzia_pct != null)
                    setPercentuale(
                      String(c.ritenuta_garanzia_pct).replace(".", ","),
                    );
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Scegli il contratto" />
                </SelectTrigger>
                <SelectContent>
                  {contratti.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {[
                        c.sub?.ragione_sociale,
                        c.commessa?.order_code,
                        c.numero_contratto,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Contratto"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>
              {direzione === "attiva" ? "Committente" : "Subappaltatore"}
            </Label>
            <Input
              value={controparte}
              onChange={(e) => setControparte(e.target.value)}
              placeholder="Nome"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Importo trattenuto (€)</Label>
              <Input
                inputMode="decimal"
                value={importo}
                onChange={(e) => setImporto(e.target.value)}
                placeholder="es. 7.500"
              />
            </div>
            <div className="space-y-1.5">
              <Label>% applicata</Label>
              <Input
                inputMode="decimal"
                value={percentuale}
                onChange={(e) => setPercentuale(e.target.value)}
                placeholder="5"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Svincolo previsto</Label>
            <Input
              type="date"
              value={svincoloPrevisto}
              onChange={(e) => setSvincoloPrevisto(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Negozia 6 mesi dalla fine lavori, non 12 o 24.
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={fideiussione}
              onChange={(e) => setFideiussione(e.target.checked)}
              className="h-4 w-4"
            />
            Sostituita da polizza fideiussoria (i soldi restano in cassa)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            onClick={salva}
            disabled={saving}
            className="bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white hover:from-orange-600 hover:to-amber-600"
          >
            {saving ? "Salvataggio…" : "Registra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
