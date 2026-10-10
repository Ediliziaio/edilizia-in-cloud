/**
 * Impostazioni → Finanziamenti → Nuova tabella (procedura in 3 passi).
 *
 *   1. Finanziaria (già registrata o nuova) + nome del prodotto + condizione + date
 *   2. File con le righe (PDF letto dall'AI, oppure CSV) + PDF originale (facoltativo)
 *   3. Anteprima delle righe lette + conferma → salva la tabella e le righe
 *
 * La rotta chiede già «Finanziamenti» in modifica. Se la pagina si apre lo stesso a chi può solo
 * consultare, i campi e i pulsanti sono spenti e un avviso dice perché.
 * Finché c'è qualcosa di scritto o caricato, uscire dalla pagina chiede conferma (useSettingsDraftGuard).
 */

import { useState, useRef, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Download,
  FileText,
  Upload,
  AlertTriangle,
  ShieldAlert,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { supabase } from "@/integrations/supabase/client";
import {
  useFinanziarie,
  useCreateFinanziaria,
  useCreateTabella,
  useInsertRigheBatch,
} from "@/lib/finanziamenti/queries";
import {
  parseTabellaCsv,
  generaCsvTemplate,
} from "@/lib/finanziamenti/parseTabellaCsv";
import type { RisultatoImportCsv } from "@/lib/finanziamenti/types";
import { toast } from "sonner";
import {
  conteggio,
  dataItaliana,
  erroreComprensibile,
  formattaEuro,
  formattaPercentuale,
  ID_AVVISO_SOLA_LETTURA,
  useAccessoFinanziamenti,
} from "./_finanziamenti/comuni";
import { AccessoNegato, AvvisoSolaLettura, TitoloAvviso } from "./_finanziamenti/pezzi";

type Step = 1 | 2 | 3;

interface FormState {
  // Passo 1
  finanziaria_modalita: "esistente" | "nuova";
  finanziaria_id: string;
  finanziaria_nome_nuova: string;
  finanziaria_ragione_sociale: string;
  finanziaria_partita_iva: string;
  finanziaria_email: string;
  nome_prodotto: string;
  codice_condizione: string;
  subtariffa_default: string;
  tan_base: string;
  data_decorrenza: string;
  data_scadenza: string;
  note: string;
  // Passo 2 — come si caricano le righe
  import_mode: "csv" | "ai_pdf";
  csv_file: File | null;
  pdf_file: File | null;
  csv_text: string;
  parse_result: RisultatoImportCsv | null;
  // Lettura con l'AI (popolato dopo la chiamata alla funzione)
  ai_extracting: boolean;
  ai_progress: number;
  ai_detected: { finanziaria: string | null; prodotto: string | null; condizione: string | null; tan_base: number | null } | null;
  ai_confidence: number | null;
}

const initialState: FormState = {
  finanziaria_modalita: "esistente",
  finanziaria_id: "",
  finanziaria_nome_nuova: "",
  finanziaria_ragione_sociale: "",
  finanziaria_partita_iva: "",
  finanziaria_email: "",
  nome_prodotto: "",
  codice_condizione: "",
  subtariffa_default: "",
  tan_base: "",
  data_decorrenza: "",
  data_scadenza: "",
  note: "",
  // Decisione D3 aperta: oggi la procedura parte su «CSV» anche se il testo consiglia l'AI. Non si cambia qui.
  import_mode: "csv",
  csv_file: null,
  pdf_file: null,
  csv_text: "",
  parse_result: null,
  ai_extracting: false,
  ai_progress: 0,
  ai_detected: null,
  ai_confidence: null,
};

/** C'è già qualcosa di scritto o caricato che si perderebbe uscendo dalla pagina? */
function haDatiInseriti(f: FormState): boolean {
  return Boolean(
    f.finanziaria_id ||
      f.finanziaria_nome_nuova.trim() ||
      f.finanziaria_ragione_sociale.trim() ||
      f.finanziaria_partita_iva.trim() ||
      f.finanziaria_email.trim() ||
      f.nome_prodotto.trim() ||
      f.codice_condizione.trim() ||
      f.subtariffa_default.trim() ||
      f.tan_base.trim() ||
      f.data_decorrenza ||
      f.data_scadenza ||
      f.note.trim() ||
      f.csv_file ||
      f.pdf_file ||
      f.parse_result,
  );
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const CSV_MIME_TYPES = new Set([
  "text/csv",
  "text/plain",
  "application/csv",
  "application/vnd.ms-excel",
  "",
]);

function parsePercentuale(value: string, label: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(`${label} deve essere un numero tra 0 e 100`);
  }
  return parsed;
}

function emailValida(value: string): boolean {
  const trimmed = value.trim();
  return !trimmed || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function validaDate(decorrenza: string, scadenza: string): void {
  if (decorrenza && scadenza && scadenza < decorrenza) {
    throw new Error("La data di scadenza non può essere precedente alla decorrenza");
  }
}

function validaCsvFile(file: File): void {
  const name = file.name.toLowerCase();
  const isCsvLike = name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".tsv");
  if (!isCsvLike || !CSV_MIME_TYPES.has(file.type)) {
    throw new Error("Formato non supportato: importa un file CSV, TXT o TSV. Converti eventuali Excel in CSV prima del caricamento.");
  }
  if (file.size <= 0) {
    throw new Error("Il file CSV è vuoto");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("CSV troppo grande (max 20 MB)");
  }
}

function validaPdfFile(file: File): void {
  if (!file.name.toLowerCase().endsWith(".pdf") || (file.type && file.type !== "application/pdf")) {
    throw new Error("Solo file PDF supportati");
  }
  if (file.size <= 0) {
    throw new Error("Il file PDF è vuoto");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("PDF troppo grande (max 20 MB)");
  }
}

export default function SettingsFinanziamentiNuova() {
  const { effectiveCompany } = useAuth();
  const { puoVedere, puoModificare } = useAccessoFinanziamenti();
  const navigate = useNavigate();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(initialState);
  const [isSaving, setIsSaving] = useState(false);

  const { data: finanziarie = [] } = useFinanziarie();
  const createFinanziaria = useCreateFinanziaria();
  const createTabella = useCreateTabella();
  const insertRighe = useInsertRigheBatch();

  // Finché c'è qualcosa di scritto o caricato, ricaricare la pagina o seguire un collegamento chiede conferma.
  // Dopo il salvataggio si esce con navigate(), che non passa da questa protezione.
  useSettingsDraftGuard(puoModificare && haDatiInseriti(form));

  // ─── Validazione passo 1 (hook prima del return anticipato per non violare le rules-of-hooks)
  const step1Valido = useMemo(() => {
    if (!form.nome_prodotto.trim()) return false;
    if (form.finanziaria_modalita === "esistente" && !form.finanziaria_id)
      return false;
    if (
      form.finanziaria_modalita === "nuova" &&
      !form.finanziaria_nome_nuova.trim()
    )
      return false;
    if (form.finanziaria_modalita === "nuova" && !emailValida(form.finanziaria_email))
      return false;
    try {
      parsePercentuale(form.tan_base, "TAN base");
      validaDate(form.data_decorrenza, form.data_scadenza);
    } catch {
      return false;
    }
    return true;
  }, [form]);

  const financeSummary = useMemo(() => {
    if (!form.parse_result) return null;
    return summarizeRows(form.parse_result.righe_valide);
  }, [form.parse_result]);

  if (!puoVedere) return <AccessoNegato />;

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  };

  // ─── Passo 2: lettura del CSV ───────────────────────────────────────────
  const handleCsvSelect = async (file: File) => {
    try {
      validaCsvFile(file);
      update("csv_file", file);
      const text = await file.text();
      update("csv_text", text);
      const result = parseTabellaCsv(text, {
        subtariffa_default: form.subtariffa_default || null,
      });
      update("parse_result", result);
      if (result.errori.length > 0) {
        toast.error("Il file ha degli errori", {
          description: `Correggi ${conteggio(result.errori.length, "errore", "errori")} prima di salvare.`,
        });
      }
    } catch (e) {
      update("csv_file", null);
      update("csv_text", "");
      update("parse_result", null);
      toast.error("Non riesco a leggere il file CSV", {
        description: erroreComprensibile(e, "Controlla che sia un file CSV."),
      });
    }
  };

  const handlePdfSelect = (file: File) => {
    try {
      validaPdfFile(file);
      update("pdf_file", file);
    } catch (e) {
      update("pdf_file", null);
      toast.error("Il PDF non va bene", {
        description: erroreComprensibile(e, "Scegli un file PDF."),
      });
    }
  };

  // ─── Passo 2 (AI): carica il PDF e chiama la funzione che ne legge le righe ──
  const handleAiExtract = async (file: File) => {
    if (!effectiveCompany?.id) {
      toast.error("Non riesco a capire a quale azienda appartieni. Ricarica la pagina e riprova.");
      return;
    }
    try {
      validaPdfFile(file);
    } catch (e) {
      toast.error("Il PDF non va bene", {
        description: erroreComprensibile(e, "Scegli un file PDF."),
      });
      return;
    }

    update("pdf_file", file);
    setForm((prev) => ({
      ...prev,
      ai_extracting: true,
      ai_progress: 10,
      parse_result: null,
      ai_detected: null,
      ai_confidence: null,
    }));

    const ts = Date.now();
    const path = `${effectiveCompany.id}/ai-staging/${ts}-${file.name.replace(/[^\w.-]/g, "_")}`;

    try {
      // 1. Carica il PDF in una cartella d'appoggio (lo riusiamo come allegato al salvataggio)
      const { error: upErr } = await supabase.storage
        .from("finanziamenti-tabelle")
        .upload(path, file, {
          cacheControl: "60",
          upsert: false,
          contentType: "application/pdf",
        });
      if (upErr) throw new Error(`Non riesco a caricare il PDF. ${erroreComprensibile(upErr, "Riprova tra poco.")}`);
      setForm((p) => ({ ...p, ai_progress: 35 }));

      // 2. Chiama la funzione che legge il PDF
      const { data, error } = await supabase.functions.invoke(
        "ai-tabella-finanziamento-extract",
        {
          body: {
            storage_path: path,
            hint: {
              finanziaria:
                form.finanziaria_modalita === "nuova"
                  ? form.finanziaria_nome_nuova
                  : finanziarie.find((f) => f.id === form.finanziaria_id)?.nome,
              nome_prodotto: form.nome_prodotto || undefined,
              subtariffa_default: form.subtariffa_default || undefined,
            },
          },
        },
      );
      if (error) throw error;

      const result = data as {
        rows: Array<Record<string, unknown>>;
        detected: FormState["ai_detected"];
        confidence: number;
      };

      // 3. Porta il JSON al formato delle righe valide (lo stesso del CSV)
      const mapped: RisultatoImportCsv["righe_valide"] = [];
      const errori: RisultatoImportCsv["errori"] = [];
      result.rows.forEach((r, idx) => {
        const num = (k: string): number | null => {
          const v = r[k];
          if (v == null) return null;
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        };
        const importo_erogato = num("importo_erogato");
        const numero_rate = num("numero_rate");
        const importo_rata = num("importo_rata");
        const tan = num("tan");
        const taeg = num("taeg");
        if (
          importo_erogato == null ||
          numero_rate == null ||
          importo_rata == null ||
          tan == null ||
          taeg == null
        ) {
          errori.push({
            riga: idx + 2,
            messaggio: "Riga letta dall'AI scartata: mancano dei dati obbligatori",
          });
          return;
        }
        const spese_istruttoria = num("spese_istruttoria") ?? 0;
        mapped.push({
          subtariffa:
            (typeof r.subtariffa === "string" ? r.subtariffa : null) ||
            form.subtariffa_default ||
            null,
          importo_erogato,
          spese_istruttoria,
          importo_totale_credito:
            num("importo_totale_credito") ?? importo_erogato + spese_istruttoria,
          numero_rate: Math.round(numero_rate),
          durata_mesi: Math.round(num("durata_mesi") ?? numero_rate),
          prima_rata_giorni: Math.round(num("prima_rata_giorni") ?? 30),
          importo_rata,
          spese_incasso_rata: num("spese_incasso_rata") ?? 0,
          interessi_cliente: num("interessi_cliente") ?? 0,
          importo_totale_dovuto: num("importo_totale_dovuto") ?? 0,
          tan,
          taeg,
          icc: num("icc"),
          provvigione_dealer: num("provvigione_dealer") ?? 0,
        });
      });

      // 4. Compila i campi del passo 1 se sono stati riconosciuti (solo quelli vuoti)
      if (result.detected) {
        setForm((p) => ({
          ...p,
          nome_prodotto: p.nome_prodotto || result.detected?.prodotto || "",
          codice_condizione:
            p.codice_condizione || result.detected?.condizione || "",
          tan_base:
            p.tan_base ||
            (result.detected?.tan_base != null
              ? String(result.detected.tan_base)
              : ""),
        }));
      }

      setForm((p) => ({
        ...p,
        parse_result: { righe_valide: mapped, errori },
        ai_detected: result.detected,
        ai_confidence: result.confidence,
        ai_progress: 100,
      }));

      toast.success(
        `${conteggio(mapped.length, "riga letta", "righe lette")} dal PDF (affidabilità ${(result.confidence * 100).toFixed(0)}%)`,
      );
    } catch (e) {
      toast.error("Non sono riuscito a leggere il PDF", {
        description: erroreComprensibile(e, "Riprova tra poco, oppure carica un file CSV con le righe."),
      });
    } finally {
      setForm((p) => ({ ...p, ai_extracting: false }));
      setTimeout(() => setForm((p) => ({ ...p, ai_progress: 0 })), 1500);
    }
  };

  const downloadTemplate = () => {
    const csv = generaCsvTemplate();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template-tabella-finanziamento.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Passo 3: salvataggio ───────────────────────────────────────────────
  const handleSalva = async () => {
    if (!puoModificare) return;
    if (!form.parse_result || form.parse_result.righe_valide.length === 0) {
      toast.error("Carica prima un file con le righe.");
      return;
    }
    if (form.parse_result.errori.length > 0) {
      toast.error("Correggi gli errori della tabella prima di salvare.", {
        description: `${conteggio(form.parse_result.errori.length, "errore trovato", "errori trovati")} nel file.`,
      });
      return;
    }
    if (!effectiveCompany?.id) {
      toast.error("Non riesco a capire a quale azienda appartieni. Ricarica la pagina e riprova.");
      return;
    }

    setIsSaving(true);
    try {
      parsePercentuale(form.tan_base, "TAN base");
      validaDate(form.data_decorrenza, form.data_scadenza);
      if (form.finanziaria_modalita === "nuova" && !emailValida(form.finanziaria_email)) {
        throw new Error("Email pratiche non valida");
      }
      if (form.csv_file && form.csv_file.size > MAX_UPLOAD_BYTES) {
        throw new Error("CSV troppo grande (max 20 MB)");
      }
      if (form.pdf_file && form.pdf_file.size > MAX_UPLOAD_BYTES) {
        throw new Error("PDF troppo grande (max 20 MB)");
      }

      // 1. Risolvi la finanziaria (nuova o già registrata)
      let finanziariaId = form.finanziaria_id;
      if (form.finanziaria_modalita === "nuova") {
        const fin = await createFinanziaria.mutateAsync({
          nome: form.finanziaria_nome_nuova.trim(),
          ragione_sociale: form.finanziaria_ragione_sociale.trim() || undefined,
          partita_iva: form.finanziaria_partita_iva.trim() || undefined,
          email_pratiche: form.finanziaria_email.trim() || undefined,
        });
        finanziariaId = fin.id;
      }

      // 2. Carica PDF e CSV nell'archivio (se ci sono)
      const companyPath = effectiveCompany.id;
      const ts = Date.now();
      let pdfUrl: string | null = null;
      let pdfFilename: string | null = null;
      let csvUrl: string | null = null;
      let csvFilename: string | null = null;

      if (form.pdf_file) {
        const path = `${companyPath}/${ts}-${sanitizeFilename(form.pdf_file.name)}`;
        const { error } = await supabase.storage
          .from("finanziamenti-tabelle")
          .upload(path, form.pdf_file, {
            cacheControl: "3600",
            upsert: false,
            contentType: form.pdf_file.type || "application/pdf",
          });
        if (error) throw new Error(`Non riesco a caricare il PDF. ${erroreComprensibile(error, "Riprova tra poco.")}`);
        pdfUrl = path;
        pdfFilename = form.pdf_file.name;
      }
      if (form.csv_file) {
        const path = `${companyPath}/${ts}-${sanitizeFilename(form.csv_file.name)}`;
        const { error } = await supabase.storage
          .from("finanziamenti-tabelle")
          .upload(path, form.csv_file, {
            cacheControl: "3600",
            upsert: false,
            contentType: "text/csv",
          });
        if (error) throw new Error(`Non riesco a caricare il file CSV. ${erroreComprensibile(error, "Riprova tra poco.")}`);
        csvUrl = path;
        csvFilename = form.csv_file.name;
      }

      // 3. Crea la testata della tabella
      const tabella = await createTabella.mutateAsync({
        finanziaria_id: finanziariaId,
        nome_prodotto: form.nome_prodotto.trim(),
        codice_condizione: form.codice_condizione.trim() || null,
        subtariffa_default: form.subtariffa_default.trim() || null,
        tan_base: parsePercentuale(form.tan_base, "TAN base"),
        pdf_url: pdfUrl,
        pdf_filename: pdfFilename,
        csv_url: csvUrl,
        csv_filename: csvFilename,
        data_decorrenza: form.data_decorrenza || null,
        data_scadenza: form.data_scadenza || null,
        note: form.note.trim() || null,
      });

      // 4. Salva le righe
      await insertRighe.mutateAsync({
        tabella_id: tabella.id,
        righe: form.parse_result.righe_valide,
      });

      toast.success(
        `Tabella "${tabella.nome_prodotto}" caricata con ${conteggio(form.parse_result.righe_valide.length, "riga", "righe")}.`
      );
      navigate(`/azienda/impostazioni/finanziamenti/${tabella.id}`);
    } catch (e) {
      toast.error("Non sono riuscito a salvare la tabella", {
        description: erroreComprensibile(e, "Riprova tra poco."),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const erroriPresenti = (form.parse_result?.errori.length ?? 0) > 0;
  const tanBaseScritto = form.tan_base.trim();

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {!puoModificare && <AvvisoSolaLettura />}

      {/* Stepper */}
      <div className="flex items-center gap-2 text-sm">
        <Button asChild variant="ghost" size="sm">
          <Link to="/azienda/impostazioni/finanziamenti">
            <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />
            Torna alle tabelle
          </Link>
        </Button>
      </div>

      {/* `disabled` sul fieldset spegne ogni campo e pulsante che contiene. */}
      <fieldset
        disabled={!puoModificare}
        aria-describedby={puoModificare ? undefined : ID_AVVISO_SOLA_LETTURA}
        className="m-0 min-w-0 space-y-4 border-0 p-0"
      >
        <Card>
          <CardContent className="py-6">
            <div className="flex items-center gap-3">
              <Banknote className="h-6 w-6 text-primary" aria-hidden="true" />
              <div>
                <h2 className="font-semibold">Nuova tabella</h2>
                <p className="text-sm text-muted-foreground">
                  Passo {step} di 3 —{" "}
                  {step === 1 && "Finanziaria e prodotto"}
                  {step === 2 && "File con le righe e PDF"}
                  {step === 3 && "Controlla e salva"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Passo 1 */}
        {step === 1 && (
          <Card>
            <CardContent className="py-6 space-y-5">
              <div role="group" aria-labelledby="fin-gruppo">
                <p id="fin-gruppo" className="text-sm font-medium leading-none">Finanziaria *</p>
                <div className="flex gap-2 mt-1.5">
                  <Button
                    type="button"
                    variant={
                      form.finanziaria_modalita === "esistente"
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    aria-pressed={form.finanziaria_modalita === "esistente"}
                    onClick={() => update("finanziaria_modalita", "esistente")}
                  >
                    Già registrata
                  </Button>
                  <Button
                    type="button"
                    variant={
                      form.finanziaria_modalita === "nuova" ? "default" : "outline"
                    }
                    size="sm"
                    aria-pressed={form.finanziaria_modalita === "nuova"}
                    onClick={() => update("finanziaria_modalita", "nuova")}
                  >
                    Nuova finanziaria
                  </Button>
                </div>

                {form.finanziaria_modalita === "esistente" && (
                  <div className="mt-3">
                    {finanziarie.length === 0 ? (
                      <Alert>
                        <TitoloAvviso>Nessuna finanziaria registrata</TitoloAvviso>
                        <AlertDescription>
                          Non ne hai ancora registrate: scegli «Nuova finanziaria» qui sopra.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Select
                        value={form.finanziaria_id}
                        onValueChange={(v) => update("finanziaria_id", v)}
                      >
                        <SelectTrigger aria-label="Finanziaria">
                          <SelectValue placeholder="Seleziona finanziaria…" />
                        </SelectTrigger>
                        <SelectContent>
                          {finanziarie.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.nome}
                              {f.ragione_sociale ? ` — ${f.ragione_sociale}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}

                {form.finanziaria_modalita === "nuova" && (
                  <div className="grid sm:grid-cols-2 gap-3 mt-3">
                    <div>
                      <Label htmlFor="fin_nome">Nome breve *</Label>
                      <Input
                        id="fin_nome"
                        placeholder="es. Fiditalia"
                        value={form.finanziaria_nome_nuova}
                        onChange={(e) =>
                          update("finanziaria_nome_nuova", e.target.value)
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="fin_rs">Ragione sociale</Label>
                      <Input
                        id="fin_rs"
                        placeholder="es. Fiditalia S.p.A."
                        value={form.finanziaria_ragione_sociale}
                        onChange={(e) =>
                          update("finanziaria_ragione_sociale", e.target.value)
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="fin_piva">Partita IVA</Label>
                      <Input
                        id="fin_piva"
                        placeholder="es. 01259520031"
                        value={form.finanziaria_partita_iva}
                        onChange={(e) =>
                          update("finanziaria_partita_iva", e.target.value)
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="fin_email">Email pratiche</Label>
                      <Input
                        id="fin_email"
                        type="email"
                        placeholder="pratiche@fiditalia.it"
                        value={form.finanziaria_email}
                        onChange={(e) =>
                          update("finanziaria_email", e.target.value)
                        }
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="prod">Nome prodotto *</Label>
                  <Input
                    id="prod"
                    placeholder="es. OKNOPLAST TAN 8.75"
                    value={form.nome_prodotto}
                    onChange={(e) => update("nome_prodotto", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="cond">Codice condizione</Label>
                  <Input
                    id="cond"
                    placeholder="es. 255891"
                    value={form.codice_condizione}
                    onChange={(e) => update("codice_condizione", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="sub">Subtariffa (se le righe non la riportano)</Label>
                  <Input
                    id="sub"
                    placeholder="es. GT57T"
                    value={form.subtariffa_default}
                    onChange={(e) => update("subtariffa_default", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="tan">TAN base (%)</Label>
                  <Input
                    id="tan"
                    type="text"
                    inputMode="decimal"
                    placeholder="es. 8,75"
                    value={form.tan_base}
                    onChange={(e) => update("tan_base", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="dec">Decorrenza</Label>
                  <Input
                    id="dec"
                    type="date"
                    value={form.data_decorrenza}
                    onChange={(e) => update("data_decorrenza", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="sca">Scadenza</Label>
                  <Input
                    id="sca"
                    type="date"
                    value={form.data_scadenza}
                    onChange={(e) => update("data_scadenza", e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="note">Note interne</Label>
                <Textarea
                  id="note"
                  placeholder="Note opzionali (visibili solo internamente)"
                  value={form.note}
                  onChange={(e) => update("note", e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => setStep(2)}
                  disabled={!step1Valido}
                >
                  Avanti
                  <ArrowRight className="h-4 w-4 ml-2" aria-hidden="true" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Passo 2 */}
        {step === 2 && (
          <Card>
            <CardContent className="py-6 space-y-5">
              {/* Come si caricano le righe */}
              <div role="group" aria-labelledby="come-carichi">
                <p id="come-carichi" className="text-sm font-medium leading-none">Come carichi le righe</p>
                <div className="grid sm:grid-cols-2 gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => update("import_mode", "ai_pdf")}
                    className={
                      "rounded-md border p-3 text-left transition " +
                      (form.import_mode === "ai_pdf"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "hover:bg-muted")
                    }
                    aria-pressed={form.import_mode === "ai_pdf"}
                  >
                    <div className="flex items-center gap-2 font-medium">
                      <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                      Leggi il PDF con l&apos;AI (consigliato)
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Carichi il PDF della finanziaria e l&apos;AI ne legge tutte le
                      righe (importo, rata, TAN, TAEG…). Poi controlli l&apos;anteprima.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => update("import_mode", "csv")}
                    className={
                      "rounded-md border p-3 text-left transition " +
                      (form.import_mode === "csv"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "hover:bg-muted")
                    }
                    aria-pressed={form.import_mode === "csv"}
                  >
                    <div className="flex items-center gap-2 font-medium">
                      <Upload className="h-4 w-4" aria-hidden="true" />
                      Carica un file CSV
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Hai già un file CSV con le righe? Caricalo direttamente, senza
                      AI. Se hai un foglio Excel, salvalo prima come CSV.
                    </p>
                  </button>
                </div>
              </div>

              {/* Con l'AI */}
              {form.import_mode === "ai_pdf" && (
                <div className="space-y-3">
                  <div>
                    <Label id="lbl-pdf-ai" htmlFor="file-pdf-ai">PDF della tabella *</Label>
                    <input
                      id="file-pdf-ai"
                      ref={pdfInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      tabIndex={-1}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        // Si svuota il campo: scegliere di nuovo lo stesso file (magari corretto nel frattempo) deve rileggerlo,
                        // e il browser avvisa solo se il file cambia.
                        e.target.value = "";
                        if (f) void handleAiExtract(f);
                      }}
                    />
                    <Button
                      id="btn-pdf-ai"
                      type="button"
                      variant="outline"
                      onClick={() => pdfInputRef.current?.click()}
                      disabled={form.ai_extracting}
                      aria-labelledby="lbl-pdf-ai btn-pdf-ai"
                      className="w-full mt-1.5 justify-start"
                    >
                      {form.ai_extracting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                      ) : (
                        <Wand2 className="h-4 w-4 mr-2 text-primary" aria-hidden="true" />
                      )}
                      <span className="min-w-0 truncate" title={form.pdf_file?.name}>
                        {form.pdf_file ? form.pdf_file.name : "Scegli il PDF (max 20 MB)…"}
                      </span>
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">
                      Compatibile con le tabelle di Fiditalia, Findomestic, Compass,
                      Agos, Cofidis, BNL e altre finanziarie. Se nel passo 1 mancano il
                      nome del prodotto, il codice condizione o il TAN, l&apos;AI li compila.
                    </p>
                  </div>

                  {form.ai_extracting && (
                    <div className="space-y-2">
                      <Progress value={form.ai_progress} />
                      <p className="text-xs text-muted-foreground text-center" role="status">
                        Lettura del PDF in corso… Sulle tabelle grandi può richiedere
                        un minuto o più.
                      </p>
                    </div>
                  )}

                  {form.ai_detected &&
                    (form.ai_detected.finanziaria ||
                      form.ai_detected.prodotto) && (
                      <Alert>
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                        <TitoloAvviso>Cosa ha riconosciuto l&apos;AI</TitoloAvviso>
                        <AlertDescription>
                          <ul className="text-xs mt-1 space-y-0.5">
                            {form.ai_detected.finanziaria && (
                              <li>
                                Finanziaria:{" "}
                                <strong>{form.ai_detected.finanziaria}</strong>
                              </li>
                            )}
                            {form.ai_detected.prodotto && (
                              <li>
                                Prodotto:{" "}
                                <strong>{form.ai_detected.prodotto}</strong>
                              </li>
                            )}
                            {form.ai_detected.condizione && (
                              <li>
                                Condizione:{" "}
                                <strong>{form.ai_detected.condizione}</strong>
                              </li>
                            )}
                            {form.ai_detected.tan_base != null && (
                              <li>
                                TAN base:{" "}
                                <strong>{formattaPercentuale(form.ai_detected.tan_base)}</strong>
                              </li>
                            )}
                            {form.ai_confidence != null && (
                              <li>
                                Affidabilità:{" "}
                                <strong>
                                  {(form.ai_confidence * 100).toFixed(0)}%
                                </strong>
                              </li>
                            )}
                          </ul>
                          <p className="text-xs mt-2 text-muted-foreground">
                            I campi del passo 1 (nome del prodotto, codice condizione, TAN base)
                            sono stati compilati se erano vuoti. Torna indietro per controllarli.
                          </p>
                        </AlertDescription>
                      </Alert>
                    )}
                </div>
              )}

              {/* Con il CSV */}
              {form.import_mode === "csv" && (
                <>
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <Label id="lbl-csv" htmlFor="file-csv">File CSV con le righe *</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={downloadTemplate}
                      >
                        <Download className="h-4 w-4 mr-1" aria-hidden="true" />
                        Scarica il file di esempio
                      </Button>
                    </div>
                    <input
                      id="file-csv"
                      ref={csvInputRef}
                      type="file"
                      accept=".csv,.txt,.tsv,text/csv,text/plain"
                      className="hidden"
                      tabIndex={-1}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        // Si svuota il campo: scegliere di nuovo lo stesso file (magari corretto nel frattempo) deve rileggerlo,
                        // e il browser avvisa solo se il file cambia.
                        e.target.value = "";
                        if (f) void handleCsvSelect(f);
                      }}
                    />
                    <Button
                      id="btn-csv"
                      type="button"
                      variant="outline"
                      onClick={() => csvInputRef.current?.click()}
                      aria-labelledby="lbl-csv btn-csv"
                      className="w-full mt-1.5 justify-start"
                    >
                      <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
                      <span className="min-w-0 truncate" title={form.csv_file?.name}>
                        {form.csv_file ? form.csv_file.name : "Scegli il file CSV…"}
                      </span>
                    </Button>
                    <details className="mt-2 text-xs text-muted-foreground">
                      <summary className="cursor-pointer py-1 text-sm font-medium text-foreground">
                        Quali colonne servono?
                      </summary>
                      <div className="mt-1 space-y-2">
                        <p>
                          La prima riga del file contiene i nomi delle colonne. Tra parentesi c&apos;è il nome
                          tecnico, quello da scrivere nel file: molte intestazioni usate dalle finanziarie
                          (come «N° rate» o «T.A.N.») vengono riconosciute lo stesso. Per non sbagliare,
                          scarica il file di esempio e riempilo.
                        </p>
                        <p className="font-medium text-foreground">Servono sempre</p>
                        <ul className="list-disc space-y-0.5 pl-5">
                          <li>Importo erogato (<code>importo_erogato</code>)</li>
                          <li>Numero di rate (<code>numero_rate</code>)</li>
                          <li>Importo della rata (<code>importo_rata</code>)</li>
                          <li>Interessi pagati dal cliente (<code>interessi_cliente</code>)</li>
                          <li>Totale dovuto dal cliente (<code>importo_totale_dovuto</code>)</li>
                          <li>TAN (<code>tan</code>)</li>
                          <li>TAEG (<code>taeg</code>)</li>
                        </ul>
                        <p className="font-medium text-foreground">Facoltative</p>
                        <ul className="list-disc space-y-0.5 pl-5">
                          <li>Subtariffa (<code>subtariffa</code>)</li>
                          <li>Spese di istruttoria (<code>spese_istruttoria</code>)</li>
                          <li>Importo totale del credito (<code>importo_totale_credito</code>)</li>
                          <li>Durata in mesi (<code>durata_mesi</code>)</li>
                          <li>Giorni alla prima rata (<code>prima_rata_giorni</code>)</li>
                          <li>Spese di incasso della rata (<code>spese_incasso_rata</code>)</li>
                          <li>ICC (<code>icc</code>)</li>
                          <li>Provvigione (<code>provvigione_dealer</code>)</li>
                        </ul>
                        <p>
                          Se una colonna facoltativa manca, si parte da questi valori: spese e provvigione a
                          zero, durata uguale al numero di rate, prima rata dopo 30 giorni.
                        </p>
                      </div>
                    </details>
                  </div>

                  <div>
                    <Label id="lbl-pdf-orig" htmlFor="file-pdf-orig">PDF originale (facoltativo)</Label>
                    <input
                      id="file-pdf-orig"
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      tabIndex={-1}
                      ref={pdfInputRef}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        // Si svuota il campo: scegliere di nuovo lo stesso file (magari corretto nel frattempo) deve rileggerlo,
                        // e il browser avvisa solo se il file cambia.
                        e.target.value = "";
                        if (f) handlePdfSelect(f);
                      }}
                    />
                    <Button
                      id="btn-pdf-orig"
                      type="button"
                      variant="outline"
                      onClick={() => pdfInputRef.current?.click()}
                      aria-labelledby="lbl-pdf-orig btn-pdf-orig"
                      className="w-full mt-1.5 justify-start"
                    >
                      <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
                      <span className="min-w-0 truncate" title={form.pdf_file?.name}>
                        {form.pdf_file ? form.pdf_file.name : "Scegli il PDF…"}
                      </span>
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">
                      Il PDF resta insieme alla tabella, nella scheda «Allegati».
                    </p>
                  </div>
                </>
              )}

              {/* Anteprima delle righe lette (dal CSV o dal PDF) */}
              {form.parse_result && (
                <ParseResultCard
                  result={form.parse_result}
                  fileName={
                    form.import_mode === "ai_pdf"
                      ? form.pdf_file?.name ?? ""
                      : form.csv_file?.name ?? ""
                  }
                />
              )}

              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />
                  Indietro
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  disabled={
                    !form.parse_result ||
                    form.parse_result.righe_valide.length === 0 ||
                    form.ai_extracting
                  }
                >
                  Avanti
                  <ArrowRight className="h-4 w-4 ml-2" aria-hidden="true" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Passo 3 */}
        {step === 3 && form.parse_result && (
          <Card>
            <CardContent className="py-6 space-y-4">
              <h3 className="font-medium">Riepilogo prima del salvataggio</h3>
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <DataRow label="Prodotto" value={form.nome_prodotto} />
                <DataRow
                  label="Finanziaria"
                  value={
                    form.finanziaria_modalita === "nuova"
                      ? `${form.finanziaria_nome_nuova} (nuova)`
                      : finanziarie.find((f) => f.id === form.finanziaria_id)
                          ?.nome ?? "—"
                  }
                />
                <DataRow
                  label="Codice condizione"
                  value={form.codice_condizione || "—"}
                />
                <DataRow
                  label="Subtariffa"
                  value={form.subtariffa_default || "—"}
                />
                <DataRow label="TAN base" value={tanBaseScritto ? `${tanBaseScritto.replace(".", ",")}%` : "—"} />
                <DataRow
                  label="Decorrenza"
                  value={dataItaliana(form.data_decorrenza)}
                />
                <DataRow
                  label="Scadenza"
                  value={dataItaliana(form.data_scadenza)}
                />
                <DataRow
                  label="Righe valide"
                  value={`${form.parse_result.righe_valide.length}`}
                />
                <DataRow
                  label="PDF allegato"
                  value={form.pdf_file?.name ?? "—"}
                />
              </div>
              {financeSummary && (
                <div className="grid sm:grid-cols-3 gap-3">
                  <SummaryMetric label="Importi" value={`€ ${formattaEuro(financeSummary.importoMin)} - € ${formattaEuro(financeSummary.importoMax)}`} />
                  <SummaryMetric label="Durate" value={`${financeSummary.durate.join(", ")} mesi`} />
                  <SummaryMetric label="TAEG" value={`${formattaPercentuale(financeSummary.taegMin)} - ${formattaPercentuale(financeSummary.taegMax)}`} />
                  <SummaryMetric label="Rata" value={`€ ${formattaEuro(financeSummary.rataMin, 2)} - € ${formattaEuro(financeSummary.rataMax, 2)}`} />
                  <SummaryMetric label="Totale dovuto più alto" value={`€ ${formattaEuro(financeSummary.totaleDovutoMax, 2)}`} />
                  <SummaryMetric label="Provvigione" value={`€ ${formattaEuro(financeSummary.provvigioneMin, 2)} - € ${formattaEuro(financeSummary.provvigioneMax, 2)}`} />
                </div>
              )}
              <Alert>
                <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                <TitoloAvviso>Prima di salvare</TitoloAvviso>
                <AlertDescription>
                  Le rate sono indicative: valgono quelle ufficiali della finanziaria. Una tabella già usata nei
                  preventivi non va sostituita: disattivala e caricane una nuova, così lo storico resta com&apos;era.
                </AlertDescription>
              </Alert>
              {erroriPresenti && (
                <Alert variant="destructive" id="errori-salvataggio">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  <TitoloAvviso>
                    {conteggio(form.parse_result.errori.length, "errore trovato", "errori trovati")}
                  </TitoloAvviso>
                  <AlertDescription>
                    Con degli errori non puoi salvare. Torna indietro e correggi il file (o rileggi il PDF).
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex justify-between gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  disabled={isSaving}
                >
                  <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />
                  Indietro
                </Button>
                <Button
                  onClick={handleSalva}
                  disabled={isSaving || erroriPresenti}
                  aria-describedby={erroriPresenti ? "errori-salvataggio" : undefined}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                      Salvataggio…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" aria-hidden="true" />
                      Salva tabella ({conteggio(form.parse_result.righe_valide.length, "riga", "righe")})
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </fieldset>
    </div>
  );
}

// ─── Sotto-componenti ──────────────────────────────────────────────────────
type FinanceRowInput = RisultatoImportCsv["righe_valide"][number];

function summarizeRows(rows: FinanceRowInput[]) {
  // Senza righe valide, Math.min/max(...[]) darebbe Infinity/-Infinity negli SummaryMetric.
  // Ritorniamo null: il render è già gated da `financeSummary && (...)`.
  if (!rows.length) return null;
  const durate = Array.from(new Set(rows.map((r) => r.numero_rate))).sort((a, b) => a - b);
  return {
    importoMin: Math.min(...rows.map((r) => r.importo_erogato)),
    importoMax: Math.max(...rows.map((r) => r.importo_erogato)),
    durataMin: Math.min(...durate),
    durataMax: Math.max(...durate),
    durate,
    taegMin: Math.min(...rows.map((r) => r.taeg)),
    taegMax: Math.max(...rows.map((r) => r.taeg)),
    rataMin: Math.min(...rows.map((r) => r.importo_rata + r.spese_incasso_rata)),
    rataMax: Math.max(...rows.map((r) => r.importo_rata + r.spese_incasso_rata)),
    totaleDovutoMax: Math.max(...rows.map((r) => r.importo_totale_dovuto)),
    provvigioneMin: Math.min(...rows.map((r) => r.provvigione_dealer)),
    provvigioneMax: Math.max(...rows.map((r) => r.provvigione_dealer)),
  };
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ParseResultCard({
  result,
  fileName,
}: {
  result: RisultatoImportCsv;
  fileName: string;
}) {
  const [showAllErrors, setShowAllErrors] = useState(false);
  const erroriDaMostrare = showAllErrors
    ? result.errori
    : result.errori.slice(0, 5);
  const hasErrors = result.errori.length > 0;
  const preview = result.righe_valide.slice(0, 5);

  return (
    <div className="rounded-md border p-4 space-y-3 bg-muted/20">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium">
            {fileName ? `Anteprima ${fileName}` : "Anteprima"}
          </p>
          <p className="text-xs text-muted-foreground">
            {conteggio(result.righe_valide.length, "riga valida", "righe valide")}
            {hasErrors && `, ${conteggio(result.errori.length, "errore", "errori")}`}
          </p>
        </div>
        {result.righe_valide.length > 0 && (
          <span className="inline-flex items-center text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
            <CheckCircle2 className="h-3 w-3 mr-1" aria-hidden="true" />
            Righe lette
          </span>
        )}
      </div>

      {hasErrors && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <TitoloAvviso>{conteggio(result.errori.length, "errore", "errori")}</TitoloAvviso>
          <AlertDescription>
            <ul className="text-xs space-y-1 mt-1">
              {erroriDaMostrare.map((e, i) => (
                <li key={i}>
                  Riga {e.riga}
                  {e.colonna && ` (colonna ${e.colonna})`}: {e.messaggio}
                </li>
              ))}
            </ul>
            {result.errori.length > 5 && !showAllErrors && (
              <button
                type="button"
                className="text-xs underline mt-1"
                onClick={() => setShowAllErrors(true)}
              >
                Mostra tutti i {result.errori.length} errori
              </button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {preview.length > 0 && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Importo</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Rata</TableHead>
                <TableHead>Interessi</TableHead>
                <TableHead>Totale dovuto</TableHead>
                <TableHead>TAN</TableHead>
                <TableHead>TAEG</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="tabular-nums whitespace-nowrap">
                    € {formattaEuro(r.importo_erogato, 2)}
                  </TableCell>
                  <TableCell className="tabular-nums">{r.numero_rate}</TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">
                    € {formattaEuro(r.importo_rata, 2)}
                  </TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">
                    € {formattaEuro(r.interessi_cliente, 2)}
                  </TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">
                    € {formattaEuro(r.importo_totale_dovuto, 2)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formattaPercentuale(r.tan)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formattaPercentuale(r.taeg)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {result.righe_valide.length > 5 && (
            <p className="text-xs text-muted-foreground mt-2">
              … e altre {result.righe_valide.length - 5} righe.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DataRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function sanitizeFilename(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 100);
}
