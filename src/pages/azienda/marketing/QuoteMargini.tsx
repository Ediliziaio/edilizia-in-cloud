/**
 * QuoteMargini — Pagina admin "Margine & Pianificazione".
 *
 * Sprint B — Varianti Costo Manodopera.
 *
 * Route: /azienda/marketing/preventivi/:id/margini
 * Gating: can_view_margins (ruoli company_admin / super_admin di default).
 *
 * Mostra:
 *   · summary totali vendita/costo/margine con semaforo
 *   · stato completezza (completo/parziale/stimato)
 *   · tabella righe con dropdown variante per righe manodopera
 *   · cambio variante → upsert assegnazione → ricalcolo live
 *
 * Il commerciale NON vede mai questa pagina: viene redirezionato al builder.
 */
import { useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft, TrendingUp, AlertTriangle, CheckCircle2, MinusCircle, HelpCircle, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/formatters";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useMargineBreakdown } from "@/hooks/useMargineBreakdown";
import { useTariffaVarianti } from "@/hooks/useTariffaVarianti";
import { useAssegnazioniMutations } from "@/hooks/useAssegnazioniMutations";
import {
  MODALITA_CONTABILE_ICONS,
  type FonteCosto,
  type MargineQuoteItem,
} from "@/types/costVariants";

// ─── Semaforo ────────────────────────────────────────────────────────────────
function semaforoClass(pct: number): { bg: string; text: string; label: string } {
  if (pct >= 25) return { bg: "bg-green-100", text: "text-green-700", label: "Ottimo" };
  if (pct >= 15) return { bg: "bg-yellow-100", text: "text-yellow-700", label: "Accettabile" };
  return { bg: "bg-red-100", text: "text-red-700", label: "Critico" };
}

function statoBadge(stato: "completo" | "parziale" | "stimato") {
  const map = {
    completo: { icon: CheckCircle2, text: "Completo", class: "bg-green-100 text-green-700 border-green-200", hint: "Tutte le righe manodopera hanno una variante costo assegnata." },
    parziale: { icon: MinusCircle, text: "Parziale", class: "bg-amber-100 text-amber-800 border-amber-200", hint: "Alcune righe hanno una variante assegnata, altre usano il costo default." },
    stimato: { icon: HelpCircle, text: "Stimato", class: "bg-gray-100 text-gray-600 border-gray-200", hint: "Nessuna variante assegnata: il calcolo usa il costo_default delle tariffe." },
  };
  return map[stato];
}

function fonteBadge(fonte: FonteCosto) {
  const map: Record<FonteCosto, { label: string; class: string }> = {
    variante_assegnata: { label: "Variante assegnata", class: "bg-green-50 text-green-700 border-green-200" },
    variante_default: { label: "Variante default", class: "bg-blue-50 text-blue-700 border-blue-200" },
    costo_default_tariffa: { label: "Costo tariffa", class: "bg-gray-50 text-gray-600 border-gray-200" },
    stimato: { label: "Stimato", class: "bg-red-50 text-red-700 border-red-200" },
  };
  return map[fonte];
}

// ─── Row variante selector ──────────────────────────────────────────────────
function VarianteSelector({
  quoteId, riga,
}: { quoteId: string; riga: MargineQuoteItem }) {
  const { data: varianti = [] } = useTariffaVarianti(riga.tariffa_id);
  const { assignVariante, removeAssegnazione } = useAssegnazioniMutations();

  if (!riga.tariffa_id) return <span className="text-xs text-muted-foreground">—</span>;

  const handleChange = async (varId: string) => {
    if (varId === "__none__") {
      try {
        await removeAssegnazione.mutateAsync({ quoteItemId: riga.quote_item_id, quoteId });
        toast.success("Assegnazione rimossa");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Errore rimozione");
      }
      return;
    }
    const variante = varianti.find((v) => v.id === varId);
    if (!variante) return;
    try {
      await assignVariante.mutateAsync({
        quoteId,
        quoteItemId: riga.quote_item_id,
        tariffaId: riga.tariffa_id!,
        varianteId: variante.id,
        costo: variante.costo,
      });
      toast.success(`Variante "${variante.nome}" assegnata`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore assegnazione");
    }
  };

  if (varianti.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        Nessuna variante. <Link to="/azienda/impostazioni/tariffe" className="underline">Configura</Link>
      </span>
    );
  }

  return (
    <Select value={riga.variante_scelta_id ?? "__none__"} onValueChange={handleChange}>
      <SelectTrigger className="h-8 text-xs min-w-[200px]">
        <SelectValue placeholder="Scegli variante…" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">— Nessuna (usa default) —</SelectItem>
        {varianti.map((v) => (
          <SelectItem key={v.id} value={v.id}>
            <span className="mr-1">{MODALITA_CONTABILE_ICONS[v.modalita_contabile]}</span>
            <span>{v.nome}</span>
            <span className="text-muted-foreground ml-2">— {formatCurrency(v.costo)}</span>
            {v.is_default && <Badge variant="outline" className="ml-2 text-xs">Default</Badge>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function QuoteMargini() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: perms, isLoading: permsLoading } = useUserPermissions();
  const canView = perms?.can_view_margins ?? false;

  const { data: quote } = useQuery({
    queryKey: ["quote-header", id],
    enabled: !!id && canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        // Quattro nomi su cinque erano inventati: su quotes le colonne sono
        // quote_number/status/created_at, e la tabella dei contatti e'
        // marketing_contacts (con first_name/last_name), non "contacts".
        // L'intestazione della pagina Margini andava sempre in errore.
        // Alias per non toccare i punti che leggono quote.numero e
        // quote.contacts.nome/cognome. stato e data_emissione non erano
        // usati da nessuna parte: non li richiediamo piu'.
        .select("id, numero:quote_number, contact_id, payment_phases, contacts:marketing_contacts(nome:first_name, cognome:last_name, company_name)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const { data: breakdown, isLoading: bdLoading } = useMargineBreakdown(id);

  const righeAssegnabili = useMemo(
    () => (breakdown?.righe ?? []).filter((r) => r.tariffa_id),
    [breakdown],
  );
  const righeNonAssegnabili = useMemo(
    () => (breakdown?.righe ?? []).filter((r) => !r.tariffa_id),
    [breakdown],
  );

  if (permsLoading) {
    return <div className="p-6 text-muted-foreground">Verifica permessi…</div>;
  }
  if (!canView) {
    return (
      <div className="p-6">
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6 space-y-3 text-center">
            <AlertTriangle className="h-10 w-10 mx-auto text-amber-500" />
            <h2 className="text-lg font-semibold">Accesso riservato</h2>
            <p className="text-sm text-muted-foreground">
              Questa vista è disponibile solo ai ruoli amministrativi (company_admin, super_admin).
            </p>
            <Button onClick={() => navigate(`/azienda/marketing/preventivi/${id}`)}>
              Torna al preventivo
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!id) return null;

  const contactName = quote?.contacts
    ? `${quote.contacts.nome ?? ""} ${quote.contacts.cognome ?? ""}`.trim() || quote.contacts.company_name || "—"
    : "—";

  const sem = breakdown ? semaforoClass(breakdown.margine_totale_pct) : null;
  const statoInfo = breakdown ? statoBadge(breakdown.stato_completezza) : null;

  return (
    <TooltipProvider>
      <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <TrendingUp className="h-6 w-6 text-primary" />
                Margine &amp; Pianificazione
              </h1>
              <p className="text-sm text-muted-foreground">
                Preventivo {quote?.numero ?? id.slice(0, 8)} · Cliente: {contactName}
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate(`/azienda/marketing/preventivi/${id}`)}>
            Vai al preventivo
          </Button>
        </div>

        {/* Summary */}
        {bdLoading && <p className="text-muted-foreground">Calcolo margine…</p>}
        {breakdown && sem && statoInfo && (
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Ricavo totale</p>
                  <p className="text-2xl font-bold">{formatCurrency(breakdown.totale_vendita)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Costo stimato</p>
                  <p className="text-2xl font-bold">{formatCurrency(breakdown.totale_costo)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Margine</p>
                  <p className={`text-2xl font-bold ${sem.text}`}>
                    {formatCurrency(breakdown.margine_totale_euro)}
                  </p>
                  <span className={`text-xs font-medium ${sem.text}`}>
                    {breakdown.margine_totale_pct.toFixed(1)}% · {sem.label}
                  </span>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Completezza</p>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className={`${statoInfo.class} cursor-help text-sm mt-1`}>
                        <statoInfo.icon className="h-3.5 w-3.5 mr-1" />
                        {statoInfo.text}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">{statoInfo.hint}</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Il terzo strato del prezzo: gli imprevisti, in % per tipo di
                  lavoro. Non spesi, diventano utile; non messi, il preventivo
                  lavora gratis. */}
              <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                Nel margine devono starci gli imprevisti: serramenti 2-3%, bagni 5-8%,
                ristrutturazioni pesanti 8-10% del prezzo — se il cantiere fila diventano utile.
                E le voci fantasma (smaltimento, trasporto, ponteggio, ripristini, pratiche):
                insieme valgono il 4-6%.
              </p>
              {/* Check dell'acconto (clausola 1): minimo 25-30%, incassato
                  prima di ordinare qualunque materiale. Se le fasi di
                  pagamento sono compilate, il controllo e' automatico. */}
              {(() => {
                const fasi = (quote as { payment_phases?: { type?: string; percent?: number }[] } | null)?.payment_phases;
                if (!Array.isArray(fasi) || fasi.length === 0) return null;
                const acconto = fasi.filter((f) => f.type === "deposit").reduce((s2, f) => s2 + (Number(f.percent) || 0), 0);
                if (acconto >= 25) return null;
                return (
                  <p className="mt-2 text-xs font-medium text-orange-700">
                    Acconto al {acconto.toLocaleString("it-IT")}%: sotto il minimo del 25-30%.
                    L'acconto si incassa prima di ordinare qualunque materiale — il cliente che
                    non lo dà è quasi sempre lo stesso che poi contesta il saldo.
                  </p>
                );
              })()}

              {/* Effetto-sconto (cap. 6 del manuale): lo sconto esce tutto
                  dall'utile, non dal prezzo. Col margine attuale, il conto. */}
              {breakdown.margine_totale_pct > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Effetto sconto: con questo margine, un 5% di sconto al cliente brucia il{" "}
                  <strong className={5 / breakdown.margine_totale_pct >= 0.3 ? "text-orange-700" : "text-foreground"}>
                    {Math.round((5 / breakdown.margine_totale_pct) * 100)}% dell'utile
                  </strong>{" "}
                  della commessa. Lo sconto si decide coi numeri, non a sensazione.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Table righe */}
        {breakdown && (
          <Card>
            <CardContent className="pt-4">
              <h2 className="text-sm font-semibold mb-3">Righe preventivo — assegnazione varianti</h2>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Voce</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Prezzo vendita</TableHead>
                      <TableHead>Variante costo</TableHead>
                      <TableHead className="text-right">Costo unit.</TableHead>
                      <TableHead className="text-right">Totale costo</TableHead>
                      <TableHead className="text-right">Margine</TableHead>
                      <TableHead>Fonte</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {righeAssegnabili.map((r) => {
                      const rSem = semaforoClass(r.margine_pct);
                      const fb = fonteBadge(r.fonte_costo);
                      return (
                        <TableRow key={r.quote_item_id}>
                          <TableCell className="font-medium">{r.nome}</TableCell>
                          <TableCell className="text-right text-sm">{r.quantita}</TableCell>
                          <TableCell className="text-right text-sm">
                            {formatCurrency(r.prezzo_vendita_unitario)}
                          </TableCell>
                          <TableCell>
                            <VarianteSelector quoteId={id} riga={r} />
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {formatCurrency(r.costo_unitario)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {formatCurrency(r.totale_costo)}
                          </TableCell>
                          <TableCell className={`text-right text-sm font-medium ${rSem.text}`}>
                            {formatCurrency(r.margine_euro)}
                            <div className="text-xs">{r.margine_pct.toFixed(1)}%</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${fb.class}`}>
                              {fb.label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {righeNonAssegnabili.map((r) => (
                      <TableRow key={r.quote_item_id} className="bg-muted/20">
                        <TableCell className="font-medium">{r.nome}</TableCell>
                        <TableCell className="text-right text-sm">{r.quantita}</TableCell>
                        <TableCell className="text-right text-sm">
                          {formatCurrency(r.prezzo_vendita_unitario)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">—</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(r.costo_unitario)}</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(r.totale_costo)}</TableCell>
                        <TableCell className="text-right text-sm">
                          {formatCurrency(r.margine_euro)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">Prodotto/altro</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {breakdown.righe.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                          Nessuna riga nel preventivo.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {breakdown.prezzo_manuale_attivo && (
                <p className="mt-3 flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  Il prezzo di questo preventivo è scritto a mano: le righe sotto restano a 0€
                  di vendita (non caricano un prezzo dal listino). Ricavo, costo e margine qui
                  sopra usano il prezzo reale del preventivo, non la somma delle righe.
                </p>
              )}
              {breakdown.stato_completezza === "stimato" && righeAssegnabili.length > 0 && (
                <p className="mt-3 text-xs text-amber-600">
                  ⚠ Nessuna variante configurata per le tariffe usate. <Link to="/azienda/impostazioni/tariffe" className="underline">Configura varianti</Link> per calcoli più accurati.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}
