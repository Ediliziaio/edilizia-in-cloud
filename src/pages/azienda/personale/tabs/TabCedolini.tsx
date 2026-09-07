import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { parseDecimalIT } from "@/lib/parseDecimalIT";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Download, Loader2, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { PrintPreviewModal } from "@/components/shared/PrintPreviewModal";

const MESI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

const STATO_COLORS: Record<string, string> = {
  bozza: "bg-muted text-muted-foreground",
  emesso: "bg-blue-100 text-blue-800",
  pagato: "bg-green-100 text-green-800",
};

const STATO_LABELS: Record<string, string> = {
  bozza: "Bozza",
  emesso: "Emesso",
  pagato: "Pagato",
};

interface CedolinoForm {
  employee_name: string;
  mese: string;
  anno: string;
  lordo: string;
  contributi_dipendente: string;
  contributi_datore: string;
  ritenute_irpef: string;
  stato: "bozza" | "emesso" | "pagato";
  note: string;
}

const emptyForm = (): CedolinoForm => ({
  employee_name: "",
  mese: String(new Date().getMonth() + 1),
  anno: String(new Date().getFullYear()),
  lordo: "",
  contributi_dipendente: "",
  contributi_datore: "",
  ritenute_irpef: "",
  stato: "bozza",
  note: "",
});

function parseNonNegativeAmount(value: string, label: string, required = false) {
  if (!value.trim()) {
    if (required) throw new Error(`${label} obbligatorio`);
    return 0;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} deve essere un importo valido e non negativo`);
  }

  return parsed;
}

export function TabCedolini() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const permissions = usePermissions();

  // Guard finanziario: cedolini contengono lordo/IRPEF/netto — riservati a chi
  // ha accesso ai dati di fatturazione/payroll. Calcolato come FLAG (NON
  // early-return): così TUTTI gli hook sotto girano sempre (Rules of Hooks).
  // La query sensibile è disabilitata per i ristretti + render gated più sotto.
  const isRestricted = !permissions.isAdmin && !permissions.canViewBilling;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CedolinoForm>(emptyForm());
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [isExporting, setIsExporting] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [printTitle, setPrintTitle] = useState("");

  const { data: cedolini = [], isLoading } = useQuery({
    queryKey: ["cedolini", companyId, filterYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cedolini")
        .select("*")
        .eq("company_id", companyId!)
        .eq("anno", parseInt(filterYear))
        .order("mese", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId && !isRestricted,
  });

  const computedNetto = () => {
    // 2026-05-27 (Form UX audit): parseDecimalIT — prima parseFloat
    // su "2.350,00" (lordo CCNL stampato) ritornava 2.35 → netto
    // calcolato sbagliato di migliaia di euro. Critico per HR.
    const lordo = parseDecimalIT(form.lordo);
    const contrib = parseDecimalIT(form.contributi_dipendente);
    const irpef = parseDecimalIT(form.ritenute_irpef);
    return lordo - contrib - irpef;
  };

  const [isFetchingOre, setIsFetchingOre] = useState(false);

  const autoFetchOre = async () => {
    if (!companyId) {
      toast.error("Azienda non disponibile");
      return;
    }
    if (!form.employee_name.trim()) {
      toast.error("Inserisci prima il nome del dipendente");
      return;
    }
    setIsFetchingOre(true);
    try {
      const mese = parseInt(form.mese);
      const anno = parseInt(form.anno);
      const inizioMese = `${anno}-${String(mese).padStart(2, "0")}-01`;
      // Ultimo giorno del mese SENZA passare da toISOString (UTC): a
      // mezzanotte locale la data UTC è il giorno prima e il 30/31 spariva.
      const ultimoGiorno = new Date(anno, mese, 0).getDate();
      const fineMese = `${anno}-${String(mese).padStart(2, "0")}-${String(ultimoGiorno).padStart(2, "0")}`;

      // Fonte VERA: hr_giornate (consolidate dalle timbrature). La vecchia
      // query interrogava una tabella `presenze` che non è mai esistita nel
      // database: il bottone falliva dal primo giorno.
      const nomeCercato = form.employee_name.trim().toLowerCase();
      const { data: profili, error: profErr } = await supabase
        .from("hr_profili")
        .select("id, nome, cognome, employee_id")
        .eq("company_id", companyId!)
        .eq("attivo", true);
      if (profErr) { toast.error("Errore nel recupero dei profili"); return; }
      const match = (profili || []).filter((p) =>
        `${p.nome ?? ""} ${p.cognome ?? ""}`.trim().toLowerCase().includes(nomeCercato)
        || nomeCercato.includes(`${p.nome ?? ""} ${p.cognome ?? ""}`.trim().toLowerCase()),
      );
      if (match.length === 0) {
        toast.info(`Nessun profilo HR trovato per "${form.employee_name}"`);
        return;
      }
      if (match.length > 1) {
        toast.error(`Più profili corrispondono a "${form.employee_name}": scrivi nome e cognome completi`);
        return;
      }

      const { data, error } = await supabase
        .from("hr_giornate")
        .select("ore_lavorate, ore_straordinario")
        .eq("company_id", companyId!)
        .eq("profilo_id", match[0].id)
        .gte("data", inizioMese)
        .lte("data", fineMese);

      if (error) { toast.error("Errore nel recupero delle giornate"); return; }
      if (!data || data.length === 0) {
        toast.info(`Nessuna giornata registrata per ${form.employee_name} nel ${MESI[mese - 1]} ${anno}`);
        return;
      }

      const totalOre = data.reduce((sum: number, p: any) => sum + (Number(p.ore_lavorate) || 0), 0);
      const oreStraordinario = data.reduce((sum: number, p: any) => sum + (Number(p.ore_straordinario) || 0), 0);

      const oreLine = `Ore lavorate ${MESI[mese - 1]} ${anno}: ${totalOre.toFixed(1)} h (di cui ${oreStraordinario.toFixed(1)} h straordinario)`;

      // Fino a qui si recuperavano le ore e si scriveva "inserisci il lordo a
      // mano": il motore CCNL esisteva sul database e non lo chiamava nessuno.
      // Ora lo si chiama. Restituisce lordo, contributi e ritenute, ma anche
      // gli avvisi (timbrature spaiate, dipendente non attivo) e le ipotesi su
      // cui ha calcolato: vanno nelle note, perché un cedolino che non dice su
      // cosa è stato calcolato non è verificabile da nessuno.
      const employeeId = match[0].employee_id;
      if (!employeeId) {
        setForm((f) => ({ ...f, note: f.note ? `${f.note}\n${oreLine}` : oreLine }));
        toast.warning(`Recuperate ${totalOre.toFixed(1)} ore, ma il lordo non si può calcolare`, {
          description: `${form.employee_name} non è collegato a un'anagrafica dipendente: inseriscilo a mano.`,
        });
        return;
      }

      const { data: calcolo, error: calcErr } = await supabase.rpc("cedolino_calcola", {
        p_employee_id: employeeId,
        p_anno: anno,
        p_mese: mese,
      });

      const esito = calcolo as Record<string, unknown> | null;
      if (calcErr || !esito || esito.calcolabile !== true) {
        const motivo = (esito?.motivo as string | undefined) ?? calcErr?.message;
        setForm((f) => ({ ...f, note: f.note ? `${f.note}\n${oreLine}` : oreLine }));
        toast.warning(`Recuperate ${totalOre.toFixed(1)} ore, ma il lordo non si può calcolare`, {
          description: motivo ? `${motivo}. Inseriscilo a mano.` : "Inserisci il lordo a mano.",
        });
        return;
      }

      const avvisi = (esito.avvisi as Array<{ testo?: string }> | undefined) ?? [];
      const ipotesi = (esito.ipotesi as string[] | undefined) ?? [];
      const righeNote = [
        oreLine,
        `Lordo calcolato: ${Number(esito.lordo ?? 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })} € — netto ${Number(esito.netto ?? 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })} €`,
        ...avvisi.map((a) => `⚠ ${a.testo ?? ""}`).filter((r) => r.length > 2),
        ...(ipotesi.length ? ["Calcolato assumendo:", ...ipotesi.map((i) => `· ${i}`)] : []),
        esito.da_rivedere_da_un_consulente === true
          ? "Da far verificare al consulente del lavoro prima dell'emissione."
          : "",
      ].filter(Boolean);

      setForm((f) => ({
        ...f,
        lordo: String(esito.lordo ?? ""),
        contributi_dipendente: String(esito.contributi_dipendente ?? ""),
        contributi_datore: String(esito.contributi_datore ?? ""),
        note: [f.note, ...righeNote].filter(Boolean).join("\n"),
      }));

      toast.success(
        `Cedolino calcolato: lordo ${Number(esito.lordo ?? 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })} €`,
        {
          description: avvisi.length
            ? `${avvisi.length} ${avvisi.length === 1 ? "avviso" : "avvisi"} nelle note — controlla prima di salvare.`
            : "Ipotesi e ore nelle note. Da far verificare al consulente.",
        },
      );
    } finally {
      setIsFetchingOre(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Azienda non disponibile");
      if (!form.employee_name.trim()) throw new Error("Nome dipendente obbligatorio");
      const lordo = parseNonNegativeAmount(form.lordo, "Lordo", true);
      const contributiDipendente = parseNonNegativeAmount(form.contributi_dipendente, "Contributi dipendente");
      const contributiDatore = parseNonNegativeAmount(form.contributi_datore, "Contributi datore");
      const ritenuteIrpef = parseNonNegativeAmount(form.ritenute_irpef, "Ritenute IRPEF");

      if (contributiDipendente + ritenuteIrpef > lordo) {
        throw new Error("Contributi dipendente e IRPEF non possono superare il lordo");
      }

      // Il cedolino si aggancia al dipendente VERO, e senza di quello non si
      // scrive. Prima il nome era testo libero e l'aggancio facoltativo: un
      // cedolino senza employee_id non arrivava mai nell'area personale del
      // dipendente (che filtra proprio su employee_id), cioè non serviva a
      // nessuno. Ora l'archivio è uno solo, `hr_cedolini`, dove il legame è
      // obbligatorio: il nome lo prende dall'anagrafica.
      const nomeCompleto = form.employee_name.trim().toLowerCase();
      const { data: profiliMatch } = await supabase
        .from("hr_profili")
        .select("employee_id, nome, cognome")
        .eq("company_id", companyId)
        .not("employee_id", "is", null);
      const trovati = (profiliMatch || []).filter(
        (p) => `${p.nome ?? ""} ${p.cognome ?? ""}`.trim().toLowerCase() === nomeCompleto,
      );
      if (trovati.length === 0) {
        throw new Error(
          `"${form.employee_name.trim()}" non corrisponde a nessun dipendente in anagrafica. `
          + "Scrivi nome e cognome come sono registrati: il cedolino va agganciato a una persona, "
          + "altrimenti non arriva nella sua area personale.",
        );
      }
      if (trovati.length > 1) {
        throw new Error(`Più dipendenti corrispondono a "${form.employee_name.trim()}": scrivi nome e cognome completi.`);
      }
      const employeeId = trovati[0].employee_id as string;

      const { error } = await supabase.from("hr_cedolini").insert({
        company_id: companyId,
        employee_id: employeeId,
        mese: parseInt(form.mese),
        anno: parseInt(form.anno),
        lordo,
        contributi_dipendente: contributiDipendente,
        contributi_datore: contributiDatore,
        ritenute_irpef: ritenuteIrpef,
        netto: Math.round((lordo - contributiDipendente - ritenuteIrpef) * 100) / 100,
        stato: form.stato,
        generation_method: "manual",
        note: form.note.trim() || null,
      } as never);
      if (error) throw new Error(error.message || error.details || error.hint || "Errore");
    },
    onSuccess: () => {
      toast.success("Cedolino creato");
      queryClient.invalidateQueries({ queryKey: ["cedolini", companyId] });
      setDialogOpen(false);
      setForm(emptyForm());
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateStatoMutation = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: string }) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const { error } = await supabase
        .from("hr_cedolini")
        .update({ stato })
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message || error.details || error.hint || "Errore");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cedolini", companyId] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const handleExportPdf = async (cedolino: any) => {
    setIsExporting(true);
    setExportingId(cedolino.id);
    try {
      const { data, error } = await supabase.functions.invoke("generate-cedolino-pdf", {
        body: { cedolino_id: cedolino.id, company_id: companyId },
      });
      if (error) {
        const detail = error.context ? await error.context.json?.().catch((): null => null) : null;
        throw new Error(detail?.error || error.message || "Errore nella generazione del PDF");
      }
      if (!data?.html) throw new Error("Nessun contenuto generato");
      const mese = MESI[(cedolino.mese ?? 1) - 1] ?? "";
      setPrintTitle(`Cedolino ${mese} ${cedolino.anno ?? ""}`);
      setPrintHtml(data.html);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore nell'esportazione");
    } finally {
      setIsExporting(false);
      setExportingId(null);
    }
  };

  const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

  // Render gated DOPO tutti gli hook → Rules of Hooks rispettate (i ristretti
  // non vedono i dati e la query sensibile sopra è già disabilitata per loro).
  if (isRestricted) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Sezione riservata agli amministratori.
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
          <h3 className="font-semibold">Cedolini Paga</h3>
          <Badge variant="secondary">{cedolini.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="w-24 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" aria-hidden="true" /> Nuovo cedolino
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : cedolini.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Nessun cedolino per il {filterYear}</p>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Crea cedolino
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dipendente</TableHead>
                <TableHead>Periodo</TableHead>
                <TableHead className="text-right">Lordo</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Contributi</TableHead>
                <TableHead className="text-right hidden sm:table-cell">IRPEF</TableHead>
                <TableHead className="text-right">Netto</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cedolini.map((c: any) => {
                const netto = c.netto ?? ((Number(c.lordo) || 0) - (Number(c.contributi_dipendente) || 0) - (Number(c.ritenute_irpef) || 0));
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.employee_name}</TableCell>
                    <TableCell className="text-sm">{MESI[c.mese - 1]} {c.anno}</TableCell>
                    <TableCell className="text-right text-sm">{formatCurrency(c.lordo)}</TableCell>
                    <TableCell className="text-right text-sm hidden sm:table-cell">{formatCurrency(c.contributi_dipendente)}</TableCell>
                    <TableCell className="text-right text-sm hidden sm:table-cell">{formatCurrency(c.ritenute_irpef)}</TableCell>
                    <TableCell className="text-right font-semibold text-primary">{formatCurrency(netto)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATO_COLORS[c.stato] || "bg-muted text-muted-foreground"}`}>
                          {STATO_LABELS[c.stato] || c.stato}
                        </span>
                      </div>
                      <Select value={c.stato} onValueChange={(v) => updateStatoMutation.mutate({ id: c.id, stato: v })}>
                        <SelectTrigger className="h-9 text-base md:h-6 md:text-xs w-24 border-none p-1 mt-0.5 opacity-50 hover:opacity-100">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["bozza", "emesso", "pagato"] as const).map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">{STATO_LABELS[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleExportPdf(c)}
                        disabled={isExporting && exportingId === c.id}
                        aria-label="Scarica cedolino PDF"
                      >
                        {isExporting && exportingId === c.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuovo Cedolino</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Dipendente *</Label>
              <Input
                value={form.employee_name}
                onChange={(e) => setForm((p) => ({ ...p, employee_name: e.target.value }))}
                placeholder="Nome e cognome"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Mese</Label>
                <Select value={form.mese} onValueChange={(v) => setForm((p) => ({ ...p, mese: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MESI.map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Anno</Label>
                <Select value={form.anno} onValueChange={(v) => setForm((p) => ({ ...p, anno: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Carica ore da timbrature */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={autoFetchOre}
              disabled={isFetchingOre}
            >
              {isFetchingOre ? (
                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-3.5 w-3.5 mr-2" aria-hidden="true" />
              )}
              {isFetchingOre ? "Caricamento..." : "Carica ore da timbrature"}
            </Button>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Lordo (€) *</Label>
                <Input type="number" min="0" step="0.01" value={form.lordo} onChange={(e) => setForm((p) => ({ ...p, lordo: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label>Contributi dip. (€)</Label>
                <Input type="number" min="0" step="0.01" value={form.contributi_dipendente} onChange={(e) => setForm((p) => ({ ...p, contributi_dipendente: e.target.value }))} placeholder="0.00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Ritenute IRPEF (€)</Label>
                <Input type="number" min="0" step="0.01" value={form.ritenute_irpef} onChange={(e) => setForm((p) => ({ ...p, ritenute_irpef: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label>Contributi datore (€)</Label>
                <Input type="number" min="0" step="0.01" value={form.contributi_datore} onChange={(e) => setForm((p) => ({ ...p, contributi_datore: e.target.value }))} placeholder="0.00" />
              </div>
            </div>
            <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
              <span className="text-sm font-medium">Netto stimato</span>
              <span className="text-primary font-bold">{formatCurrency(computedNetto())}</span>
            </div>
            <div className="space-y-1">
              <Label>Stato</Label>
              <Select value={form.stato} onValueChange={(v) => setForm((p) => ({ ...p, stato: v as CedolinoForm["stato"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["bozza", "emesso", "pagato"] as const).map((s) => (
                    <SelectItem key={s} value={s}>{STATO_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crea cedolino"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {printHtml && (
        <PrintPreviewModal
          htmlContent={printHtml}
          fileName={printTitle}
          title={printTitle}
          open={!!printHtml}
          onOpenChange={(open) => { if (!open) setPrintHtml(null); }}
        />
      )}
    </div>
  );
}
