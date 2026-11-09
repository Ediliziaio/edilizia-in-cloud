/**
 * CommittenteDetail — la scheda di un'impresa che ti passa lavori in appalto.
 * ──────────────────────────────────────────────────────────────────────────
 * Non e' una copia della scheda cliente: un committente non compra, commissiona.
 * Qui sopra l'anagrafica stanno le tre cose che servono tutti i giorni:
 *
 *   1. il CONTRATTO attivo con le condizioni concordate (giorni di pagamento,
 *      ritenuta, maggiorazioni, come si fattura, se comprende la fornitura);
 *   2. il LISTINO di quel contratto — la giornata uomo, il viaggio, il mq di
 *      posa — che e' l'unico posto dove quell'accordo esiste scritto;
 *   3. i LAVORI che quel committente ti passa.
 *
 * Il listino sono prezzi: chi non ha «Importi delle commesse» non lo vede, e
 * non lo vede nemmeno interrogando il database (policy su appalto_tariffe).
 *
 * Fase 1 del Modulo Appaltatori (28/10/2026) — vedi docs/piano-commessa-appalto.md.
 * L'override di tariffa per singolo cantiere e la rendicontazione arrivano con
 * le fasi successive, insieme alle pagine che li leggono.
 */
import { useCondizioniDocumento } from "@/hooks/useCondizioniDocumento";
import { datiDaAccordo } from "@/lib/contratti/contrattoCliente";
import { caricaDatiSocietari } from "../../../supabase/functions/_shared/datiSocietari";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Building2, Download, FileSignature, HardHat, Loader2, Pencil, Plus,
  Trash2, Euro, AlertTriangle, ClipboardList, Lock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";
import { parseDecimalIT, formatDecimalIT } from "@/lib/parseDecimalIT";
import { euro } from "@/lib/clienti/schedaCliente";
import { contrattoDiOggi } from "@/lib/appalto/contratti";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { QuoteCard } from "@/components/marketing/preventivi/ui/builderUI";
import { SalAppalto } from "@/components/orders/SalAppalto";

/* ─── Tipi ─────────────────────────────────────────────────────────── */

interface Committente {
  id: string; business_name: string | null; first_name: string | null; last_name: string | null;
  email: string | null; phone: string | null; fiscal_code: string | null;
  address: string | null; city: string | null; postal_code: string | null; province: string | null;
  customer_type: string | null;
}

interface Contratto {
  id: string; company_id: string; committente_id: string; nome: string;
  valido_dal: string; valido_al: string | null;
  giorni_pagamento: number; ritenuta_pct: number;
  maggiorazione_straordinario_pct: number; maggiorazione_festivo_pct: number;
  modo_fatturazione: "per_commessa" | "mensile_cumulativa";
  regime_iva: "ordinaria" | "reverse_charge";
  include_fornitura: boolean; riferimento_committente: string | null;
  condizioni: string | null; note: string | null; attivo: boolean;
}

interface Tariffa {
  id: string; contratto_id: string; tipo: string; codice: string | null;
  descrizione: string; unita_misura: string; prezzo_unitario: number;
  maggiorazione_straordinario_pct: number | null; maggiorazione_festivo_pct: number | null;
  qualifica: string | null; note: string | null; ordine: number; attivo: boolean;
}

interface Lavoro {
  id: string; order_code: string | null; description: string | null;
  total_amount: number | null;
  work_start_date: string | null; work_end_date: string | null;
  valorizzazione: string | null; tetto_importo: number | null;
  /* La fase vera della commessa sta in `order_statuses`, non nella vecchia
     colonna `orders.status`, che su queste righe contiene ancora le sigle dei
     dati storici ("in_progress") e finiva a video cosi' com'era. */
  fase: { name: string | null; color: string | null } | null;
}

const TIPI_TARIFFA: Array<{ v: string; label: string }> = [
  { v: "manodopera", label: "Manodopera" },
  { v: "trasporto", label: "Trasporto" },
  { v: "lavorazione", label: "Lavorazione" },
  { v: "nolo", label: "Nolo" },
  { v: "materiale", label: "Materiale" },
  { v: "forfait", label: "Forfait" },
];

const UNITA: Array<{ v: string; label: string }> = [
  { v: "ora", label: "ora" }, { v: "giornata", label: "giornata" },
  { v: "uomo_giorno", label: "uomo/giorno" }, { v: "viaggio", label: "viaggio" },
  { v: "km", label: "km" }, { v: "mq", label: "m²" }, { v: "ml", label: "m" },
  { v: "mc", label: "m³" }, { v: "kg", label: "kg" }, { v: "cad", label: "cad" },
  { v: "corpo", label: "a corpo" },
];

const etichettaUnita = (v: string) => UNITA.find((u) => u.v === v)?.label ?? v;
const etichettaTipo = (v: string) => TIPI_TARIFFA.find((t) => t.v === v)?.label ?? v;

/** Le date si scrivono come le legge chi le legge: 07/09/2026, non 2026-09-07. */
const giornoIT = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const [a, m, g] = iso.slice(0, 10).split("-");
  return g && m && a ? `${g}/${m}/${a}` : iso;
};

const nomeCommittente = (c: Committente | null | undefined) =>
  c?.business_name?.trim() || [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim() || "Committente";

/* ─── Pagina ───────────────────────────────────────────────────────── */

export default function CommittenteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const permessi = usePermissions();

  const companyId = effectiveCompany?.id ?? null;
  const puoModificare = permessi.isAdmin || permessi.canEditCustomers;
  const vedeImporti = permessi.canViewOrderAmounts;

  const condizioniAzienda = useCondizioniDocumento("appalto");
  const [contrattoSelId, setContrattoSelId] = useState<string | null>(null);
  const [tariffaForm, setTariffaForm] = useState<Partial<Tariffa> | null>(null);
  const [prezzoGrezzo, setPrezzoGrezzo] = useState("");
  const [daEliminare, setDaEliminare] = useState<{ tipo: "contratto" | "tariffa"; id: string; nome: string } | null>(null);

  /* ── Dati ── */

  const committente = useQuery({
    queryKey: ["committente", companyId, id],
    enabled: !!companyId && !!id,
    queryFn: async (): Promise<Committente | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, business_name, first_name, last_name, email, phone, fiscal_code, address, city, postal_code, province, customer_type")
        .eq("id", id!)
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Committente) ?? null;
    },
  });

  const contratti = useQuery({
    queryKey: ["appalto-contratti", companyId, id],
    enabled: !!companyId && !!id,
    queryFn: async (): Promise<Contratto[]> => {
      const { data, error } = await (supabase as any)
        .from("appalto_contratti")
        .select("*")
        .eq("company_id", companyId)
        .eq("committente_id", id)
        .order("valido_dal", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Contratto[];
    },
  });

  const contrattoAttivo = useMemo(() => {
    const lista = contratti.data ?? [];
    if (contrattoSelId) return lista.find((c) => c.id === contrattoSelId) ?? contrattoDiOggi(lista);
    return contrattoDiOggi(lista);
  }, [contratti.data, contrattoSelId]);

  const tariffe = useQuery({
    queryKey: ["appalto-tariffe", contrattoAttivo?.id],
    // Senza il permesso sugli importi la policy restituisce zero righe: non la
    // interroghiamo nemmeno, cosi' la pagina dice perche' invece di mostrare
    // un listino vuoto che sembra un errore.
    enabled: !!contrattoAttivo?.id && vedeImporti,
    queryFn: async (): Promise<Tariffa[]> => {
      const { data, error } = await (supabase as any)
        .from("appalto_tariffe")
        .select("*")
        .eq("contratto_id", contrattoAttivo!.id)
        .order("ordine", { ascending: true })
        .order("descrizione", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Tariffa[];
    },
  });

  const lavori = useQuery({
    queryKey: ["appalto-lavori", companyId, id],
    enabled: !!companyId && !!id,
    queryFn: async (): Promise<Lavoro[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_code, description, total_amount, work_start_date, work_end_date, valorizzazione, tetto_importo, fase:order_statuses!orders_current_status_id_fkey(name, color)")
        .eq("company_id", companyId!)
        .eq("customer_id", id!)
        .eq("order_type", "appaltatore_lavoro")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Lavoro[];
    },
  });

  /* ── Scritture ── */

  // Il PDF dell'accordo (09/11/2026): come il contratto di subappalto, col listino in Allegato A.
  const pdfAccordo = useMutation({
    mutationFn: async () => {
      if (!contrattoAttivo || !committente.data) return;
      const [{ contrattoClienteBlob }, societari, listino] = await Promise.all([
        import("@/components/contratti/ContrattoClientePDF"),
        caricaDatiSocietari(supabase, companyId),
        (supabase as any).from("appalto_tariffe").select("*").eq("contratto_id", contrattoAttivo.id).order("ordine", { ascending: true }),
      ]);
      if (listino.error) throw listino.error;
      const blob = await contrattoClienteBlob(datiDaAccordo({ accordo: contrattoAttivo, committente: committente.data, tariffe: listino.data ?? [], societari, vessatorie: condizioniAzienda.clausole.filter((x) => x.vessatoria).map((x) => x.titolo.trim()) }));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Contratto ${contrattoAttivo.nome}.pdf`.replace(/[\\/:*?"<>|]/g, "-");
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    onError: (e) => toast({ title: "PDF non generato", description: e instanceof Error ? e.message : "Riprova", variant: "destructive" }),
  });

  const salvaTariffa = useMutation({
    mutationFn: async (f: Partial<Tariffa>) => {
      const riga = {
        company_id: companyId,
        contratto_id: contrattoAttivo!.id,
        tipo: f.tipo ?? "manodopera",
        codice: f.codice?.trim() || null,
        descrizione: (f.descrizione ?? "").trim(),
        unita_misura: f.unita_misura ?? "ora",
        prezzo_unitario: parseDecimalIT(prezzoGrezzo),
        maggiorazione_straordinario_pct: f.maggiorazione_straordinario_pct ?? null,
        maggiorazione_festivo_pct: f.maggiorazione_festivo_pct ?? null,
        qualifica: f.qualifica?.trim() || null,
        note: f.note || null,
        ordine: Number(f.ordine ?? 0),
        attivo: f.attivo !== false,
      };
      if (f.id) {
        const { error } = await (supabase as any).from("appalto_tariffe").update(riga).eq("id", f.id);
        if (error) throw error;
        return;
      }
      const { error } = await (supabase as any).from("appalto_tariffe").insert(riga);
      if (error) throw error;
    },
    onSuccess: () => {
      setTariffaForm(null);
      setPrezzoGrezzo("");
      queryClient.invalidateQueries({ queryKey: ["appalto-tariffe", contrattoAttivo?.id] });
      toast({ title: "Tariffa salvata" });
    },
    onError: (e) => {
      logger.error("salvaTariffa", e);
      toast({ title: "Tariffa non salvata", description: e instanceof Error ? e.message : "Riprova", variant: "destructive" });
    },
  });

  const elimina = useMutation({
    mutationFn: async (x: { tipo: "contratto" | "tariffa"; id: string }) => {
      const tabella = x.tipo === "contratto" ? "appalto_contratti" : "appalto_tariffe";
      const { error } = await (supabase as any).from(tabella).delete().eq("id", x.id);
      if (error) throw error;
    },
    onSuccess: (_d, x) => {
      setDaEliminare(null);
      if (x.tipo === "contratto") {
        setContrattoSelId(null);
        queryClient.invalidateQueries({ queryKey: ["appalto-contratti", companyId, id] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["appalto-tariffe", contrattoAttivo?.id] });
      }
      toast({ title: x.tipo === "contratto" ? "Contratto eliminato" : "Tariffa eliminata" });
    },
    onError: (e) => {
      logger.error("elimina appalto", e);
      toast({ title: "Non eliminato", description: e instanceof Error ? e.message : "Riprova", variant: "destructive" });
    },
  });

  /* ── Render ── */

  if (committente.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  const c = committente.data;
  if (!c) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Committente non trovato. <Link className="underline" to="/azienda/clienti?tipo=committenti">Torna all'elenco</Link>
        </AlertDescription>
      </Alert>
    );
  }

  if (c.customer_type !== "appaltatore") {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex flex-wrap items-center gap-2">
          <span>Questo contatto è un cliente, non un committente.</span>
          <Button size="sm" variant="outline" onClick={() => navigate(`/azienda/clienti/${c.id}`)}>
            Apri la scheda cliente
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const indirizzo = [c.address, [c.postal_code, c.city].filter(Boolean).join(" "), c.province]
    .filter((x) => x && String(x).trim()).join(" · ");

  return (
    <div className="space-y-4">
      {/* Testata */}
      <div className="testata-pagina rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-3 py-3 shadow-sm sm:px-6 sm:py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/clienti?tipo=committenti")} aria-label="Torna ai committenti">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 to-slate-600 text-white shadow">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-lg font-bold tracking-tight text-slate-900 sm:text-2xl">{nomeCommittente(c)}</h1>
                <Badge variant="secondary">Committente</Badge>
              </div>
              <p className="mt-0.5 truncate text-sm text-slate-500">
                {[c.fiscal_code, indirizzo, c.phone, c.email].filter(Boolean).join(" · ") || "Anagrafica da completare"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(`/azienda/clienti/${c.id}`)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Anagrafica
            </Button>
            {puoModificare && (
              <Button
                size="sm"
                onClick={() => navigate(`/azienda/committenti/${id}/contratto/nuovo`)}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Nuovo contratto
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] items-start">
        {/* Contratto e condizioni */}
        <QuoteCard title="Contratto" icon={<FileSignature className="h-4 w-4" />}>
          {contratti.isLoading ? (
            <Skeleton className="h-28 w-full" />
          ) : (contratti.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">
              Nessun contratto. È qui che si scrivono le condizioni concordate e il listino:
              senza, una commessa in appalto non sa a quanto fatturarti il lavoro.
            </p>
          ) : (
            <div className="space-y-3">
              {(contratti.data ?? []).length > 1 && (
                <Select value={contrattoAttivo?.id ?? ""} onValueChange={setContrattoSelId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(contratti.data ?? []).map((k) => (
                      <SelectItem key={k.id} value={k.id}>
                        {k.nome} · dal {giornoIT(k.valido_dal)}{k.attivo ? "" : " (non attivo)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {contrattoAttivo && (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{contrattoAttivo.nome}</p>
                      <p className="text-xs text-slate-500">
                        Dal {giornoIT(contrattoAttivo.valido_dal)}
                        {contrattoAttivo.valido_al ? ` al ${giornoIT(contrattoAttivo.valido_al)}` : " — senza scadenza"}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0 gap-1" disabled={pdfAccordo.isPending} onClick={() => pdfAccordo.mutate()}>
                      {pdfAccordo.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} PDF
                    </Button>
                    {puoModificare && (
                      <div className="flex shrink-0 gap-1">
                        <Button variant="ghost" size="icon" aria-label="Modifica contratto" onClick={() => navigate(`/azienda/committenti/${id}/contratto/${contrattoAttivo.id}`)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Elimina contratto"
                          onClick={() => setDaEliminare({ tipo: "contratto", id: contrattoAttivo.id, nome: contrattoAttivo.nome })}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <Voce t="Pagamento" v={`${contrattoAttivo.giorni_pagamento} gg`} />
                    <Voce t="Ritenuta a garanzia" v={`${formatDecimalIT(contrattoAttivo.ritenuta_pct, { minDecimals: 0 })} %`} />
                    <Voce t="Straordinario" v={`+${formatDecimalIT(contrattoAttivo.maggiorazione_straordinario_pct, { minDecimals: 0 })} %`} />
                    <Voce t="Festivo" v={`+${formatDecimalIT(contrattoAttivo.maggiorazione_festivo_pct, { minDecimals: 0 })} %`} />
                    <Voce t="Fatturazione" v={contrattoAttivo.modo_fatturazione === "mensile_cumulativa" ? "Mensile, tutte le commesse" : "Per commessa"} />
                    <Voce t="Fornitura" v={contrattoAttivo.include_fornitura ? "Compresa" : "Sola manodopera"} />
                    <Voce t="IVA" v={contrattoAttivo.regime_iva === "reverse_charge" ? "Reverse charge (N6.3)" : "Ordinaria"} />
                    {contrattoAttivo.riferimento_committente && (
                      <Voce t="Loro riferimento" v={contrattoAttivo.riferimento_committente} />
                    )}
                  </dl>
                  {contrattoAttivo.condizioni && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Condizioni</p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{contrattoAttivo.condizioni}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </QuoteCard>

        {/* Listino */}
        <QuoteCard
          title="Listino concordato"
          icon={<Euro className="h-4 w-4" />}
          action={puoModificare && vedeImporti && contrattoAttivo ? (
            <Button size="sm" variant="outline" onClick={() => { setTariffaForm({ tipo: "manodopera", unita_misura: "ora", attivo: true, ordine: (tariffe.data?.length ?? 0) }); setPrezzoGrezzo(""); }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Tariffa
            </Button>
          ) : undefined}
        >
          {!vedeImporti ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Lock className="h-4 w-4 shrink-0" />
              I prezzi concordati col committente li vede chi ha il permesso «Importi delle commesse».
            </p>
          ) : !contrattoAttivo ? (
            <p className="text-sm text-slate-500">Prima serve un contratto: il listino appartiene a quello.</p>
          ) : tariffe.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (tariffe.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">
              Listino vuoto. Aggiungi quello che a questo committente fatturi davvero: la giornata
              uomo, il viaggio, il metro quadro di posa.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Voce</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Unità</TableHead>
                    <TableHead className="text-right">Prezzo</TableHead>
                    {puoModificare && <TableHead className="w-20" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(tariffe.data ?? []).map((t) => (
                    <TableRow key={t.id} className={cn(!t.attivo && "opacity-50")}>
                      <TableCell className="font-medium">
                        {t.descrizione}
                        {t.qualifica && <span className="ml-1.5 text-xs text-slate-500">({t.qualifica})</span>}
                        {t.codice && <span className="ml-1.5 text-xs text-slate-400">{t.codice}</span>}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">{etichettaTipo(t.tipo)}</TableCell>
                      <TableCell className="text-sm text-slate-600">{etichettaUnita(t.unita_misura)}</TableCell>
                      <TableCell className="text-right tabular-nums">{euro(t.prezzo_unitario, true)}</TableCell>
                      {puoModificare && (
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" aria-label="Modifica tariffa"
                              onClick={() => { setTariffaForm(t); setPrezzoGrezzo(formatDecimalIT(t.prezzo_unitario)); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" aria-label="Elimina tariffa"
                              onClick={() => setDaEliminare({ tipo: "tariffa", id: t.id, nome: t.descrizione })}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </QuoteCard>
      </div>

      {/* I rendiconti di questo committente: qui vivono anche quelli mensili
          cumulativi, che non appartengono a una commessa sola. */}
      <SalAppalto
        committenteId={c.id}
        modoFatturazione={contrattoAttivo?.modo_fatturazione ?? null}
        puoModificare={puoModificare}
        vedeImporti={vedeImporti}
      />

      {/* Lavori che questo committente passa */}
      <QuoteCard title="Lavori che ti passa" icon={<HardHat className="h-4 w-4" />}>
        {lavori.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (lavori.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">
            Nessun lavoro in appalto da questo committente.{" "}
            <Link className="underline" to="/azienda/ordini/nuovo-lavoro-appaltatore">Aprine uno</Link>.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Commessa</TableHead>
                  <TableHead>Periodo</TableHead>
                  <TableHead>Stato</TableHead>
                  {vedeImporti && <TableHead className="text-right">Importo</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(lavori.data ?? []).map((l) => (
                  <TableRow key={l.id} className="cursor-pointer" onClick={() => navigate(`/azienda/ordini/${l.id}`)}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-1.5">
                        <ClipboardList className="h-3.5 w-3.5 text-slate-400" />
                        {l.order_code || "—"}
                      </span>
                      <span className="block truncate text-xs text-slate-500">{l.description}</span>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {[l.work_start_date, l.work_end_date].filter(Boolean).map(giornoIT).join(" → ") || "—"}
                    </TableCell>
                    <TableCell>
                      {l.fase?.name
                        ? <Badge variant="outline" style={l.fase.color ? { borderColor: l.fase.color, color: l.fase.color } : undefined}>{l.fase.name}</Badge>
                        : <span className="text-sm text-slate-400">—</span>}
                    </TableCell>
                    {vedeImporti && (
                      <TableCell className="text-right tabular-nums">
                        {/* Un lavoro a misura non vale zero: vale quello che
                            rendiconti. Scriverci «€ 0,00» farebbe sembrare
                            inutile un cantiere di tre mesi. */}
                        {l.valorizzazione === "a_misura"
                          ? <span className="text-slate-500">a misura</span>
                          : Number(l.total_amount) > 0
                            ? euro(l.total_amount, true)
                            : l.tetto_importo
                              ? <span className="text-slate-500">max {euro(l.tetto_importo, true)}</span>
                              : "—"}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </QuoteCard>

      {/* ─── Dialogo tariffa ─── */}
      <Dialog open={!!tariffaForm} onOpenChange={(o) => !o && setTariffaForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{tariffaForm?.id ? "Modifica tariffa" : "Nuova tariffa"}</DialogTitle>
            <DialogDescription>Il prezzo che fatturi a questo committente, non il tuo costo.</DialogDescription>
          </DialogHeader>
          {tariffaForm && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Descrizione</Label>
                <Input value={tariffaForm.descrizione ?? ""} onChange={(e) => setTariffaForm({ ...tariffaForm, descrizione: e.target.value })}
                  placeholder="Giornata uomo — operaio specializzato" />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={tariffaForm.tipo ?? "manodopera"} onValueChange={(v) => setTariffaForm({ ...tariffaForm, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPI_TARIFFA.map((t) => <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Unità di misura</Label>
                <Select value={tariffaForm.unita_misura ?? "ora"} onValueChange={(v) => setTariffaForm({ ...tariffaForm, unita_misura: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITA.map((u) => <SelectItem key={u.v} value={u.v}>{u.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prezzo</Label>
                {/* Testo grezzo e parse all'uscita dal campo: riscrivere il numero a
                    ogni tasto cancella il separatore appena digitato (lezione 25/07). */}
                <Input
                  inputMode="decimal"
                  value={prezzoGrezzo}
                  onChange={(e) => setPrezzoGrezzo(e.target.value)}
                  onBlur={() => setPrezzoGrezzo(formatDecimalIT(parseDecimalIT(prezzoGrezzo)))}
                  placeholder="180,00"
                />
              </div>
              <div>
                <Label>Codice</Label>
                <Input value={tariffaForm.codice ?? ""} onChange={(e) => setTariffaForm({ ...tariffaForm, codice: e.target.value })} />
              </div>
              {tariffaForm.tipo === "manodopera" && (
                <div className="sm:col-span-2">
                  <Label>Qualifica</Label>
                  <Input value={tariffaForm.qualifica ?? ""} onChange={(e) => setTariffaForm({ ...tariffaForm, qualifica: e.target.value })}
                    placeholder="Operaio specializzato, 3° livello…" />
                </div>
              )}
              <div className="sm:col-span-2">
                <Label>Note</Label>
                <Textarea rows={2} value={tariffaForm.note ?? ""} onChange={(e) => setTariffaForm({ ...tariffaForm, note: e.target.value })} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3 sm:col-span-2">
                <Label className="cursor-pointer">In uso</Label>
                <Switch checked={tariffaForm.attivo !== false} onCheckedChange={(v) => setTariffaForm({ ...tariffaForm, attivo: v })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTariffaForm(null)}>Annulla</Button>
            <Button
              disabled={!tariffaForm?.descrizione?.trim() || salvaTariffa.isPending}
              onClick={() => tariffaForm && salvaTariffa.mutate(tariffaForm)}
            >
              {salvaTariffa.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Conferma eliminazione ─── */}
      <AlertDialog open={!!daEliminare} onOpenChange={(o) => !o && setDaEliminare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare «{daEliminare?.nome}»?</AlertDialogTitle>
            <AlertDialogDescription>
              {daEliminare?.tipo === "contratto"
                ? "Sparisce anche tutto il listino di questo contratto. Se l'accordo è solo scaduto, conviene spegnerlo invece di cancellarlo."
                : "La tariffa sparisce dal listino."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => daEliminare && elimina.mutate({ tipo: daEliminare.tipo, id: daEliminare.id })}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Voce({ t, v }: { t: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{t}</dt>
      <dd className="truncate font-medium text-slate-900">{v}</dd>
    </div>
  );
}
