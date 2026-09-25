import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Users, Download, Loader2, AlertTriangle, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

/**
 * Dialog per export PDF schede clienti con selezione quantità + progress bar.
 *
 * Fix per il bug "1000 schede non le esporta": ora il dialog
 *  1. mostra il conteggio totale,
 *  2. permette di scegliere quante esportare,
 *  3. fa fetch a batch (500 per query, evita timeout Supabase),
 *  4. genera il PDF a chunk con yield al main thread (evita UI freeze),
 *  5. mostra progress in tempo reale.
 */

interface CustomerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  is_business?: boolean | null;
  business_name?: string | null;
  fiscal_code: string | null;
  address: string | null;
  city?: string | null;
  postal_code?: string | null;
  province?: string | null;
  site_address: string | null;
  site_city?: string | null;
  site_postal_code?: string | null;
  site_province?: string | null;
  notes: string | null;
  created_at: string;
}

interface OrderRow {
  id: string;
  order_code: string | null;
  description: string | null;
  total_amount: number | null;
  created_at: string;
  customer_id: string | null;
  status_name: string | null;
}

export interface CustomerSheetsExportDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type RangeMode = "all" | "first_n" | "custom";

// Batch size per query Supabase: 500 righe per batch è un buon compromesso
// tra numero di round-trip e rischio timeout/URL-too-long.
const BATCH_SIZE = 500;
// Numero massimo assoluto per evitare abusi (max 5000 = 5000 pagine PDF ~= 5MB)
const HARD_CAP = 5000;

function getDisplayName(c: CustomerRow): string {
  if (c.is_business && c.business_name) return c.business_name;
  const f = (c.first_name ?? "").trim();
  const l = (c.last_name ?? "").trim();
  const isPh = (s: string) => s === "—" || s === "-" || s === "";
  return `${isPh(f) ? "" : f} ${isPh(l) ? "" : l}`.trim() || "(senza nome)";
}

// Cede il main thread per 0ms → il browser può renderizzare la progress bar
const yieldToBrowser = () => new Promise<void>((r) => setTimeout(r, 0));

export function CustomerSheetsExportDialog({ open, onOpenChange }: CustomerSheetsExportDialogProps) {
  const { effectiveCompany } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<RangeMode>("first_n");
  const [firstN, setFirstN] = useState<number>(100);
  const [customFrom, setCustomFrom] = useState<number>(1);
  const [customTo, setCustomTo] = useState<number>(100);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; phase: string }>({ done: 0, total: 0, phase: "" });

  // Count totale clienti company (leggero, solo head count)
  const { data: totalCount, isLoading: countLoading } = useQuery({
    queryKey: ["customer-sheets-count", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return 0;
      const { count, error } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("company_id", effectiveCompany.id);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: open && !!effectiveCompany?.id,
    staleTime: 30 * 1000,
  });

  // Quante schede verranno effettivamente esportate
  const selectedCount = useMemo(() => {
    if (!totalCount) return 0;
    if (mode === "all") return Math.min(totalCount, HARD_CAP);
    if (mode === "first_n") return Math.min(firstN, totalCount, HARD_CAP);
    const from = Math.max(1, customFrom);
    const to = Math.min(customTo, totalCount, HARD_CAP);
    return Math.max(0, to - from + 1);
  }, [mode, firstN, customFrom, customTo, totalCount]);

  // Avviso livello: verde <100, ambra 100-500, rosso >500
  const warningLevel: "ok" | "warn" | "danger" =
    selectedCount <= 100 ? "ok" : selectedCount <= 500 ? "warn" : "danger";

  const estimatedSeconds = Math.max(2, Math.round(selectedCount * 0.08));
  const estimatedMB = (selectedCount * 0.01).toFixed(2); // ~10KB per pagina PDF

  const fetchCustomersBatched = useCallback(async (
    companyId: string,
    offset: number,
    limit: number,
    onBatch: (batch: CustomerRow[]) => void,
  ): Promise<number> => {
    let fetched = 0;
    let currentOffset = offset;
    const end = offset + limit;
    while (currentOffset < end) {
      const batchSize = Math.min(BATCH_SIZE, end - currentOffset);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone, is_business, business_name, fiscal_code, address, city, postal_code, province, site_address, site_city, site_postal_code, site_province, notes, created_at")
        .eq("company_id", companyId)
        .order("last_name", { ascending: true, nullsFirst: false })
        .order("first_name", { ascending: true, nullsFirst: false })
        .range(currentOffset, currentOffset + batchSize - 1);
      if (error) throw error;
      const batch = (data ?? []) as CustomerRow[];
      if (batch.length === 0) break;
      onBatch(batch);
      fetched += batch.length;
      currentOffset += batch.length;
      if (batch.length < batchSize) break;
    }
    return fetched;
  }, []);

  const handleExport = async () => {
    if (!effectiveCompany?.id) return;
    if (selectedCount === 0) {
      toast({ title: "Nessuna scheda da esportare", variant: "destructive" });
      return;
    }

    setIsExporting(true);
    setProgress({ done: 0, total: selectedCount, phase: "Caricamento clienti…" });

    try {
      // 1. Fetch customers in batch
      const customers: CustomerRow[] = [];
      const offset = mode === "custom" ? Math.max(0, customFrom - 1) : 0;

      await fetchCustomersBatched(effectiveCompany.id, offset, selectedCount, (batch) => {
        customers.push(...batch);
        setProgress({ done: customers.length, total: selectedCount, phase: "Caricamento clienti…" });
      });

      if (customers.length === 0) {
        toast({ title: "Nessun cliente trovato", variant: "destructive" });
        setIsExporting(false);
        return;
      }

      // 2. Fetch ordini in un unico colpo solo per i customer IDs selezionati
      setProgress({ done: 0, total: customers.length, phase: "Caricamento commesse…" });
      const customerIds = customers.map((c) => c.id);
      const ordersByCustomer = new Map<string, OrderRow[]>();

      // Supabase in-filter ha limit pratico ~1000 UUIDs → batch anche questo
      for (let i = 0; i < customerIds.length; i += BATCH_SIZE) {
        const chunk = customerIds.slice(i, i + BATCH_SIZE);
        const { data } = await supabase
          .from("orders")
          .select("id, order_code, description, total_amount, created_at, customer_id, order_statuses:current_status_id(name)")
          .eq("company_id", effectiveCompany.id)
          .in("customer_id", chunk);
        (data ?? []).forEach((o) => {
          const row: OrderRow = {
            id: o.id as string,
            order_code: o.order_code as string | null,
            description: o.description as string | null,
            total_amount: o.total_amount as number | null,
            created_at: o.created_at as string,
            customer_id: o.customer_id as string | null,
            status_name: (o.order_statuses as { name: string } | null)?.name ?? null,
          };
          const list = ordersByCustomer.get(row.customer_id!) ?? [];
          list.push(row);
          ordersByCustomer.set(row.customer_id!, list);
        });
        await yieldToBrowser();
      }

      // 3. Generate PDF a chunk con yield per non freezare UI
      setProgress({ done: 0, total: customers.length, phase: "Generazione PDF…" });

      const jsPDFModule = await import("jspdf");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jsPDF = jsPDFModule.default ?? (jsPDFModule as any).jsPDF;
      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4", compress: true });

      const companyName = effectiveCompany?.name ?? "Scheda Cliente";
      const stamp = format(new Date(), "dd/MM/yyyy");

      for (let i = 0; i < customers.length; i++) {
        const c = customers[i];
        if (i > 0) doc.addPage();

        const name = getDisplayName(c);
        const orders = ordersByCustomer.get(c.id) ?? [];

        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text(companyName, 40, 40);
        doc.text(stamp, 555, 40, { align: "right" });
        doc.setTextColor(0);

        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text(name, 40, 70);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        if (c.is_business) {
          doc.setTextColor(90);
          doc.text("AZIENDA / PERSONA GIURIDICA", 40, 86);
          doc.setTextColor(0);
        }

        let y = 110;
        const line = (label: string, value?: string | null) => {
          if (!value) return;
          doc.setFont("helvetica", "bold");
          doc.text(`${label}:`, 40, y);
          doc.setFont("helvetica", "normal");
          doc.text(String(value).slice(0, 80), 150, y);
          y += 16;
        };
        line("Email", c.email);
        line("Telefono", c.phone);
        line("CF / P.IVA", c.fiscal_code);

        y += 4;
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(c.is_business ? "Sede legale" : "Residenza", 40, y);
        y += 4;
        doc.setDrawColor(200);
        doc.line(40, y, 555, y);
        y += 14;
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        if (c.address) { doc.text(String(c.address).slice(0, 90), 40, y); y += 14; }
        const loc1 = [c.postal_code, c.city, c.province ? `(${c.province})` : null].filter(Boolean).join(" ");
        if (loc1) { doc.text(loc1, 40, y); y += 14; }

        if (c.site_address || c.site_city) {
          y += 8;
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.text("Indirizzo cantiere", 40, y);
          y += 4;
          doc.line(40, y, 555, y);
          y += 14;
          doc.setFontSize(10);
          doc.setFont("helvetica", "normal");
          if (c.site_address) { doc.text(String(c.site_address).slice(0, 90), 40, y); y += 14; }
          const loc2 = [c.site_postal_code, c.site_city, c.site_province ? `(${c.site_province})` : null].filter(Boolean).join(" ");
          if (loc2) { doc.text(loc2, 40, y); y += 14; }
        }

        if (c.notes) {
          y += 8;
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.text("Note", 40, y);
          y += 4;
          doc.line(40, y, 555, y);
          y += 14;
          doc.setFontSize(10);
          doc.setFont("helvetica", "normal");
          const lines = doc.splitTextToSize(c.notes, 515) as string[];
          for (const ln of lines) {
            if (y > 780) {
              doc.addPage();
              y = 40;
            }
            doc.text(ln, 40, y);
            y += 13;
          }
        }

        y += 16;
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(`Commesse (${orders.length})`, 40, y);
        y += 4;
        doc.line(40, y, 555, y);
        y += 14;
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");

        if (orders.length === 0) {
          doc.setTextColor(120);
          doc.text("Nessuna commessa registrata.", 40, y);
          doc.setTextColor(0);
        } else {
          doc.setFont("helvetica", "bold");
          doc.text("Codice", 40, y);
          doc.text("Descrizione", 130, y);
          doc.text("Stato", 370, y);
          doc.text("Data", 450, y);
          doc.text("Totale", 555, y, { align: "right" });
          y += 12;
          doc.setFont("helvetica", "normal");
          orders.forEach((o) => {
            if (y > 780) { doc.addPage(); y = 40; }
            doc.text((o.order_code ?? "—").slice(0, 18), 40, y);
            doc.text((o.description ?? "").slice(0, 48), 130, y);
            doc.text((o.status_name ?? "").slice(0, 14), 370, y);
            doc.text(o.created_at ? format(new Date(o.created_at), "dd/MM/yy") : "—", 450, y);
            doc.text(
              o.total_amount != null
                ? `€ ${Number(o.total_amount).toLocaleString("it-IT", { minimumFractionDigits: 2, useGrouping: true })}`
                : "—",
              555, y, { align: "right" },
            );
            y += 12;
          });
        }

        // Progress + yield ogni 10 pagine per non freezare UI
        if ((i + 1) % 10 === 0 || i === customers.length - 1) {
          setProgress({ done: i + 1, total: customers.length, phase: "Generazione PDF…" });
          await yieldToBrowser();
        }
      }

      setProgress({ done: customers.length, total: customers.length, phase: "Salvataggio file…" });
      await yieldToBrowser();

      doc.save(`schede-clienti-${format(new Date(), "yyyy-MM-dd")}-${customers.length}.pdf`);

      toast({
        title: "PDF pronto",
        description: `${customers.length} schede clienti esportate in un unico PDF.`,
      });
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Errore export",
        description: e instanceof Error ? e.message : "Generazione PDF fallita",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
      setProgress({ done: 0, total: 0, phase: "" });
    }
  };

  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isExporting) onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle>Esporta schede clienti in PDF</DialogTitle>
              <DialogDescription>
                Un unico PDF con una pagina dedicata per ogni cliente (anagrafica + commesse).
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {!isExporting ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 flex items-center gap-3">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm">
                  <span className="font-semibold">{countLoading ? "…" : (totalCount ?? 0)}</span>{" "}
                  clienti in anagrafica
                </p>
                <p className="text-xs text-muted-foreground">Ordinati per cognome / ragione sociale</p>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Cosa esportare?
              </Label>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as RangeMode)}>
                <div className="flex items-start gap-2 p-2 rounded border hover:bg-muted/30">
                  <RadioGroupItem value="all" id="mode-all" className="mt-0.5" />
                  <Label htmlFor="mode-all" className="cursor-pointer flex-1 text-sm">
                    <span className="font-medium">Tutti i clienti</span>
                    <p className="text-xs text-muted-foreground font-normal">
                      Esporta tutte le {totalCount ?? 0} schede (max {HARD_CAP}).
                    </p>
                  </Label>
                </div>
                <div className="flex items-start gap-2 p-2 rounded border hover:bg-muted/30">
                  <RadioGroupItem value="first_n" id="mode-n" className="mt-0.5" />
                  <Label htmlFor="mode-n" className="cursor-pointer flex-1 text-sm">
                    <span className="font-medium">Primi N clienti</span>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type="number"
                        min={1}
                        max={Math.min(totalCount ?? HARD_CAP, HARD_CAP)}
                        value={firstN}
                        onChange={(e) => setFirstN(Math.max(1, Number(e.target.value) || 0))}
                        onClick={(e) => { e.stopPropagation(); setMode("first_n"); }}
                        className="h-7 w-24 text-xs"
                        disabled={mode !== "first_n"}
                      />
                      <span className="text-xs text-muted-foreground">schede (ordinate per cognome)</span>
                    </div>
                  </Label>
                </div>
                <div className="flex items-start gap-2 p-2 rounded border hover:bg-muted/30">
                  <RadioGroupItem value="custom" id="mode-custom" className="mt-0.5" />
                  <Label htmlFor="mode-custom" className="cursor-pointer flex-1 text-sm">
                    <span className="font-medium">Intervallo personalizzato</span>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type="number"
                        min={1}
                        value={customFrom}
                        onChange={(e) => setCustomFrom(Math.max(1, Number(e.target.value) || 0))}
                        onClick={(e) => { e.stopPropagation(); setMode("custom"); }}
                        className="h-7 w-20 text-xs"
                        disabled={mode !== "custom"}
                      />
                      <span className="text-xs">→</span>
                      <Input
                        type="number"
                        min={1}
                        value={customTo}
                        onChange={(e) => setCustomTo(Math.max(1, Number(e.target.value) || 0))}
                        onClick={(e) => { e.stopPropagation(); setMode("custom"); }}
                        className="h-7 w-20 text-xs"
                        disabled={mode !== "custom"}
                      />
                      <span className="text-xs text-muted-foreground">es. dal 1° al 100°</span>
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Warning dimensione */}
            {selectedCount > 0 && (
              <Alert className={
                warningLevel === "ok"
                  ? ""
                  : warningLevel === "warn"
                  ? "border-amber-400 bg-amber-50/50 dark:bg-amber-900/10"
                  : "border-red-400 bg-red-50/50 dark:bg-red-900/10"
              }>
                {warningLevel === "ok" ? <Info className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                <AlertDescription className="text-xs space-y-1">
                  <p>
                    Verranno esportate <strong>{selectedCount} schede</strong> in un unico PDF.
                  </p>
                  <p className="text-[11px] opacity-80">
                    Tempo stimato: ~{estimatedSeconds}s · Dimensione stimata: ~{estimatedMB} MB
                  </p>
                  {warningLevel === "warn" && (
                    <p className="text-[11px]">
                      Con molte schede la generazione può richiedere tempo. Non chiudere questa finestra.
                    </p>
                  )}
                  {warningLevel === "danger" && (
                    <p className="text-[11px]">
                      <strong>Attenzione:</strong> con più di 500 schede il browser potrebbe rallentare.
                      Considera di esportare in più blocchi (es. 1–500, poi 501–1000).
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
              <Button
                onClick={handleExport}
                disabled={selectedCount === 0 || !totalCount}
              >
                <Download className="h-4 w-4 mr-1.5" />
                Genera PDF ({selectedCount})
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">{progress.phase}</p>
                <p className="text-xs text-muted-foreground">
                  {progress.done} / {progress.total} {progressPct > 0 ? `(${progressPct}%)` : ""}
                </p>
              </div>
            </div>
            <Progress value={progressPct} />
            <p className="text-[11px] text-muted-foreground text-center">
              Non chiudere questa finestra. Il PDF verrà scaricato automaticamente al termine.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
