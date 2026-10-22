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
import { Plus, Download, Loader2, FileText, FileUp, Send, Search, Building2, CheckCircle2, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { PrintPreviewModal } from "@/components/shared/PrintPreviewModal";
import { CaricaBustePagaDialog } from "./CaricaBustePagaDialog";
import { apriDocumentoPaghe } from "@/lib/paghe/apriDocumentoPaghe";
import { TIPI_DOCUMENTO, type TipoDocumentoPaghe } from "@/lib/paghe/lettoreBustePaga";

/** Un documento ricavato dal PDF del consulente (hr_paghe_documenti). */
interface DocumentoPaghe {
  id: string;
  tipo: TipoDocumentoPaghe;
  per_dipendente: boolean;
  cedolino_id: string | null;
  caricamento_id: string | null;
  titolo: string;
  anno: number | null;
  mese: number | null;
  pubblicato_at: string | null;
  visto_at: string | null;
}

const dataBreve = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });

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
  const [caricaOpen, setCaricaOpen] = useState(false);
  const [filterMese, setFilterMese] = useState("tutti");
  const [cerca, setCerca] = useState("");

  // I documenti caricati dal consulente nell'anno: il PDF vero di ogni busta,
  // la consegna (pubblicata / aperta) e i documenti che restano all'azienda.
  const { data: documenti = [] } = useQuery({
    queryKey: ["paghe-documenti", companyId, filterYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_paghe_documenti" as never)
        .select("id, tipo, per_dipendente, cedolino_id, caricamento_id, titolo, anno, mese, pubblicato_at, visto_at")
        .eq("company_id", companyId!)
        .eq("anno", parseInt(filterYear))
        .is("sostituito_da", null)
        .order("mese", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DocumentoPaghe[];
    },
    enabled: !!companyId && !isRestricted,
  });
  const docPerCedolino = new Map(documenti.filter((d) => d.cedolino_id).map((d) => [d.cedolino_id!, d]));
  // Tutto ciò che non è la busta di una riga qui sopra: documenti dell'ufficio,
  // CU e fogli presenze dati al dipendente, buste di chi non ha la scheda completa.
  const altriDocumenti = documenti.filter((d) => !d.cedolino_id);
  const caricamentiDaPubblicare = [...new Set(documenti.filter((d) => d.per_dipendente && !d.pubblicato_at && d.caricamento_id).map((d) => d.caricamento_id!))];
  const daPubblicare = documenti.filter((d) => d.per_dipendente && !d.pubblicato_at).length;

  const pubblicaMutation = useMutation({
    mutationFn: async () => {
      for (const id of caricamentiDaPubblicare) {
        const { error } = await supabase.rpc("paghe_pubblica" as never, { p_caricamento: id } as never);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      toast.success("Buste paga pubblicate: i dipendenti hanno ricevuto l'avviso");
      queryClient.invalidateQueries({ queryKey: ["paghe-documenti", companyId] });
      queryClient.invalidateQueries({ queryKey: ["cedolini", companyId] });
      // Il titolare che è anche dipendente vede subito la sua busta in «Il mio stato».
      queryClient.invalidateQueries({ queryKey: ["my-cedolini"] });
      queryClient.invalidateQueries({ queryKey: ["my-documenti-paghe"] });
    },
    onError: () => toast.error("Pubblicazione non riuscita. Riprova tra poco."),
  });

  const apri = async (documentoId: string) => {
    try { await apriDocumentoPaghe(documentoId); } catch { toast.error("Non riesco ad aprire il documento. Riprova tra poco."); }
  };

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

      const { data: calcolo, error: calcErr } = await supabase.rpc("cedolino_calcola" as never, {
        p_employee_id: employeeId,
        p_anno: anno,
        p_mese: mese,
      } as never);

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
        // cedolino_calcola restituisce anche l'IRPEF del mese: prima restava
        // fuori e il cedolino salvato aveva IRPEF 0 (netto gonfiato) se nessuno
        // la scriveva a mano.
        ritenute_irpef: String(esito.ritenute_irpef ?? ""),
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cedolini", companyId] });
      // Lo stato del cedolino muove anche la consegna del PDF (trigger nel database).
      queryClient.invalidateQueries({ queryKey: ["paghe-documenti", companyId] });
    },
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
  const testoCerca = cerca.trim().toLowerCase();
  const cedoliniVisibili = cedolini.filter((c: any) =>
    (filterMese === "tutti" || c.mese === Number(filterMese))
    && (!testoCerca || String(c.employee_name ?? "").toLowerCase().includes(testoCerca)));
  const altriDocumentiVisibili = altriDocumenti.filter((d) => filterMese === "tutti" || d.mese === Number(filterMese));

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
          <Badge variant="secondary">{cedoliniVisibili.length}</Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca dipendente" className="h-8 w-44 pl-7 text-sm" />
          </div>
          <Select value={filterMese} onValueChange={setFilterMese}>
            <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti i mesi</SelectItem>
              {MESI.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="w-24 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" aria-hidden="true" /> Nuovo a mano
          </Button>
          {/* Caricare e pubblicare è del titolare (così le regole del database). */}
          {permissions.isAdmin && (
            <Button size="sm" onClick={() => setCaricaOpen(true)}>
              <FileUp className="h-4 w-4 mr-1" aria-hidden="true" /> Carica dal consulente
            </Button>
          )}
        </div>
      </div>

      {daPubblicare > 0 && permissions.isAdmin && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>{daPubblicare} documenti per i dipendenti sono salvati ma non ancora pubblicati: i dipendenti non li vedono.</span>
          <Button size="sm" onClick={() => pubblicaMutation.mutate()} disabled={pubblicaMutation.isPending}>
            {pubblicaMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}Pubblica ora
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : cedoliniVisibili.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              {cedolini.length === 0 ? `Nessun cedolino per il ${filterYear}` : "Nessun cedolino con questi filtri"}
            </p>
            {cedolini.length === 0 && permissions.isAdmin && (
              <Button size="sm" onClick={() => setCaricaOpen(true)}>
                <FileUp className="h-4 w-4 mr-1" /> Carica il PDF del consulente
              </Button>
            )}
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
                <TableHead className="hidden md:table-cell">Consegna</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cedoliniVisibili.map((c: any) => {
                const netto = c.netto ?? ((Number(c.lordo) || 0) - (Number(c.contributi_dipendente) || 0) - (Number(c.ritenute_irpef) || 0));
                const doc = docPerCedolino.get(c.id);
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
                    <TableCell className="hidden md:table-cell text-xs">
                      {!doc ? <span className="text-muted-foreground">—</span>
                        : !doc.pubblicato_at ? <span className="text-amber-700">Non pubblicata</span>
                        : doc.visto_at ? <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="h-3.5 w-3.5" />Aperta il {dataBreve(doc.visto_at)}</span>
                        : <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock className="h-3.5 w-3.5" />Non ancora aperta</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        title={doc ? "Apri il PDF del consulente" : "Scarica cedolino PDF"}
                        onClick={() => (doc ? apri(doc.id) : handleExportPdf(c))}
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

      {/* Gli altri documenti del consulente: quelli dell'ufficio non arrivano mai ai dipendenti. */}
      {altriDocumentiVisibili.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h4 className="text-sm font-semibold">Altri documenti del consulente</h4>
            <span className="text-xs text-muted-foreground">riepiloghi, presenze, F24, Cassa Edile, CU</span>
          </div>
          <div className="divide-y rounded-lg border">
            {altriDocumentiVisibili.map((d) => (
              <button key={d.id} type="button" onClick={() => apri(d.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50">
                <Badge variant="outline" className="shrink-0">{TIPI_DOCUMENTO[d.tipo]?.label ?? d.tipo}</Badge>
                <span className="min-w-0 flex-1 truncate">{d.titolo}</span>
                <span className="hidden shrink-0 text-xs sm:inline">
                  {!d.per_dipendente ? <span className="text-muted-foreground">Solo ufficio</span>
                    : !d.pubblicato_at ? <span className="text-amber-700">Al dipendente · non pubblicato</span>
                    : d.visto_at ? <span className="text-green-700">Al dipendente · aperto il {dataBreve(d.visto_at)}</span>
                    : <span className="text-muted-foreground">Al dipendente · non ancora aperto</span>}
                </span>
                <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      )}

      {companyId && <CaricaBustePagaDialog companyId={companyId} open={caricaOpen} onOpenChange={setCaricaOpen} />}

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
