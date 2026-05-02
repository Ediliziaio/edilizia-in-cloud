/**
 * Wizard creazione nuova tabella finanziaria.
 *
 * 3 step:
 *   1. Anagrafica → finanziaria (esistente o nuova) + nome prodotto + condizione
 *   2. Upload CSV righe + (opzionale) PDF allegato originale
 *   3. Preview parsing + conferma → salva header + bulk insert righe
 */

import { useState, useRef, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

type Step = 1 | 2 | 3;

interface FormState {
  // Step 1
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
  // Step 2 — modalità import
  import_mode: "csv" | "ai_pdf";
  csv_file: File | null;
  pdf_file: File | null;
  csv_text: string;
  parse_result: RisultatoImportCsv | null;
  // AI extraction (popolato dopo chiamata edge function)
  ai_extracting: boolean;
  ai_progress: number;
  ai_detected: { finanziaria: string | null; prodotto: string | null; condizione: string | null; tan_base: number | null } | null;
  ai_confidence: number | null;
  ai_cost_cents: number | null;
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
  import_mode: "csv",
  csv_file: null,
  pdf_file: null,
  csv_text: "",
  parse_result: null,
  ai_extracting: false,
  ai_progress: 0,
  ai_detected: null,
  ai_confidence: null,
  ai_cost_cents: null,
};

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
  const { role, effectiveCompany } = useAuth();
  const isAdmin = role === "company_admin" || role === "super_admin";
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

  // ─── Validazione step 1 (hook prima dell'early return per non violare le rules-of-hooks)
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

  if (!isAdmin) {
    return (
      <Card className="max-w-xl mx-auto mt-8">
        <CardContent className="py-10 flex flex-col items-center gap-4 text-center">
          <ShieldAlert className="h-12 w-12 text-amber-500" />
          <p className="font-medium">Accesso riservato</p>
          <p className="text-sm text-muted-foreground">
            Solo gli amministratori dell&apos;azienda possono caricare nuove
            tabelle.
          </p>
        </CardContent>
      </Card>
    );
  }

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  };

  // ─── Step 2: parsing CSV ────────────────────────────────────────────────
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
        toast.error("CSV importato con errori", {
          description: `Correggi ${result.errori.length} errore/i prima di salvare.`,
        });
      }
    } catch (e) {
      update("csv_file", null);
      update("csv_text", "");
      update("parse_result", null);
      toast.error("CSV non valido", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const handlePdfSelect = (file: File) => {
    try {
      validaPdfFile(file);
      update("pdf_file", file);
    } catch (e) {
      update("pdf_file", null);
      toast.error("PDF non valido", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  // ─── Step 2 (AI mode): upload PDF + chiamata edge function ──────────────
  const handleAiExtract = async (file: File) => {
    if (!effectiveCompany?.id) {
      toast.error("Company non identificata.");
      return;
    }
    try {
      validaPdfFile(file);
    } catch (e) {
      toast.error("PDF non valido", {
        description: e instanceof Error ? e.message : String(e),
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
      ai_cost_cents: null,
    }));

    const ts = Date.now();
    const path = `${effectiveCompany.id}/ai-staging/${ts}-${file.name.replace(/[^\w.-]/g, "_")}`;

    try {
      // 1. Upload PDF in staging (lo riusiamo come allegato finale al salvataggio)
      const { error: upErr } = await supabase.storage
        .from("finanziamenti-tabelle")
        .upload(path, file, {
          cacheControl: "60",
          upsert: false,
          contentType: "application/pdf",
        });
      if (upErr) throw new Error(`Upload PDF fallito: ${upErr.message}`);
      setForm((p) => ({ ...p, ai_progress: 35 }));

      // 2. Chiama edge function
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
      if (error) throw new Error(error.message ?? "Errore edge function");

      const result = data as {
        rows: Array<Record<string, unknown>>;
        detected: FormState["ai_detected"];
        confidence: number;
        cost_cents: number;
      };

      // 3. Mappa il JSON al formato delle righe valide (compat con parse_result)
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
            messaggio: "Riga AI scartata: campi obbligatori mancanti",
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

      // 4. Auto-popola campi step 1 se rilevati (solo se vuoti)
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
        ai_cost_cents: result.cost_cents,
        ai_progress: 100,
      }));

      toast.success(
        `${mapped.length} righe estratte (conf. ${(result.confidence * 100).toFixed(0)}%, costo ~€ ${(result.cost_cents / 10000).toFixed(4)})`,
      );
    } catch (e) {
      toast.error("Errore estrazione AI", {
        description: e instanceof Error ? e.message : String(e),
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

  // ─── Step 3: salvataggio ────────────────────────────────────────────────
  const handleSalva = async () => {
    if (!form.parse_result || form.parse_result.righe_valide.length === 0) {
      toast.error("Carica un CSV valido prima di salvare.");
      return;
    }
    if (form.parse_result.errori.length > 0) {
      toast.error("Correggi gli errori della tabella prima di salvare.", {
        description: `${form.parse_result.errori.length} errore/i rilevati nel file importato.`,
      });
      return;
    }
    if (!effectiveCompany?.id) {
      toast.error("Company non identificata. Riprova dopo aver fatto login.");
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

      // 1. Risolvi finanziaria_id (nuova o esistente)
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

      // 2. Upload PDF e CSV su Storage (se presenti)
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
        if (error) throw new Error(`Upload PDF fallito: ${error.message}`);
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
        if (error) throw new Error(`Upload CSV fallito: ${error.message}`);
        csvUrl = path;
        csvFilename = form.csv_file.name;
      }

      // 3. Crea header tabella
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

      // 4. Bulk insert righe
      await insertRighe.mutateAsync({
        tabella_id: tabella.id,
        righe: form.parse_result.righe_valide,
      });

      toast.success(
        `Tabella "${tabella.nome_prodotto}" caricata con ${form.parse_result.righe_valide.length} righe.`
      );
      navigate(`/azienda/impostazioni/finanziamenti/${tabella.id}`);
    } catch (e) {
      toast.error("Errore durante il salvataggio", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Stepper */}
      <div className="flex items-center gap-2 text-sm">
        <Button asChild variant="ghost" size="sm">
          <Link to="/azienda/impostazioni/finanziamenti">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Torna alle tabelle
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="py-6">
          <div className="flex items-center gap-3">
            <Banknote className="h-6 w-6 text-primary" aria-hidden="true" />
            <div>
              <h2 className="font-semibold">Nuova tabella finanziamento</h2>
              <p className="text-sm text-muted-foreground">
                Step {step} di 3 —{" "}
                {step === 1 && "Anagrafica prodotto e finanziaria"}
                {step === 2 && "Upload CSV righe e PDF allegato"}
                {step === 3 && "Conferma e salva"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 1 */}
      {step === 1 && (
        <Card>
          <CardContent className="py-6 space-y-5">
            <div>
              <Label>Finanziaria *</Label>
              <div className="flex gap-2 mt-1.5">
                <Button
                  type="button"
                  variant={
                    form.finanziaria_modalita === "esistente"
                      ? "default"
                      : "outline"
                  }
                  size="sm"
                  onClick={() => update("finanziaria_modalita", "esistente")}
                >
                  Esistente
                </Button>
                <Button
                  type="button"
                  variant={
                    form.finanziaria_modalita === "nuova" ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => update("finanziaria_modalita", "nuova")}
                >
                  Nuova finanziaria
                </Button>
              </div>

              {form.finanziaria_modalita === "esistente" && (
                <div className="mt-3">
                  {finanziarie.length === 0 ? (
                    <Alert>
                      <AlertTitle>Nessuna finanziaria registrata</AlertTitle>
                      <AlertDescription>
                        Devi creare una nuova finanziaria. Seleziona "Nuova
                        finanziaria" sopra.
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
                <Label htmlFor="sub">Subtariffa default</Label>
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
                  placeholder="es. 8.75"
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
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <Card>
          <CardContent className="py-6 space-y-5">
            {/* Toggle modalità import */}
            <div>
              <Label>Modalità import</Label>
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
                    <Sparkles className="h-4 w-4 text-primary" />
                    Estrai con AI da PDF
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Carica il PDF della tabella ufficiale e l&apos;AI estrae
                    automaticamente tutte le righe (importo, rata, TAN, TAEG…).
                    Consigliato.
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
                    <Upload className="h-4 w-4" />
                    Carica CSV/Excel
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Hai già un file con le righe? Caricalo direttamente.
                    Bypassa l&apos;AI.
                  </p>
                </button>
              </div>
            </div>

            {/* Modalità AI */}
            {form.import_mode === "ai_pdf" && (
              <div className="space-y-3">
                <div>
                  <Label>PDF tabella finanziaria *</Label>
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleAiExtract(f);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => pdfInputRef.current?.click()}
                    disabled={form.ai_extracting}
                    className="w-full mt-1.5 justify-start"
                  >
                    {form.ai_extracting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Wand2 className="h-4 w-4 mr-2 text-primary" />
                    )}
                    {form.pdf_file
                      ? form.pdf_file.name
                      : "Scegli PDF (max 22 MB)…"}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">
                    Compatibile con tabelle Fiditalia, Findomestic, Compass,
                    Agos, Cofidis, BNL, ecc. L&apos;AI legge le 14 colonne
                    standard e popola automaticamente.
                  </p>
                </div>

                {form.ai_extracting && (
                  <div className="space-y-2">
                    <Progress value={form.ai_progress} />
                    <p className="text-xs text-muted-foreground text-center">
                      Estrazione in corso… (può richiedere 30–60 secondi su
                      tabelle grandi)
                    </p>
                  </div>
                )}

                {form.ai_detected &&
                  (form.ai_detected.finanziaria ||
                    form.ai_detected.prodotto) && (
                    <Alert>
                      <Sparkles className="h-4 w-4" />
                      <AlertTitle>Dati rilevati dall&apos;AI</AlertTitle>
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
                              <strong>{form.ai_detected.tan_base}%</strong>
                            </li>
                          )}
                          {form.ai_confidence != null && (
                            <li>
                              Confidence:{" "}
                              <strong>
                                {(form.ai_confidence * 100).toFixed(0)}%
                              </strong>
                              {form.ai_cost_cents != null &&
                                ` · Costo: ~€ ${(form.ai_cost_cents / 10000).toFixed(4)}`}
                            </li>
                          )}
                        </ul>
                        <p className="text-xs mt-2 text-muted-foreground">
                          I campi del Step 1 sono stati pre-popolati se erano
                          vuoti. Torna indietro per verificarli.
                        </p>
                      </AlertDescription>
                    </Alert>
                  )}
              </div>
            )}

            {/* Modalità CSV */}
            {form.import_mode === "csv" && (
              <>
                <div>
                  <div className="flex items-center justify-between">
                    <Label>CSV righe tabella *</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={downloadTemplate}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Scarica template CSV
                    </Button>
                  </div>
                  <input
                    ref={csvInputRef}
                    type="file"
                    accept=".csv,.txt,.tsv,text/csv,text/plain"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleCsvSelect(f);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => csvInputRef.current?.click()}
                    className="w-full mt-1.5 justify-start"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {form.csv_file ? form.csv_file.name : "Scegli file CSV…"}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">
                    Colonne richieste: <code>importo_erogato</code>,{" "}
                    <code>numero_rate</code>, <code>importo_rata</code>,{" "}
                    <code>interessi_cliente</code>,{" "}
                    <code>importo_totale_dovuto</code>, <code>tan</code>,{" "}
                    <code>taeg</code>. Opzionali: subtariffa,
                    spese_istruttoria, durata_mesi, prima_rata_giorni,
                    spese_incasso_rata, icc, provvigione_dealer.
                  </p>
                </div>

                <div>
                  <Label>PDF originale (opzionale)</Label>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    ref={pdfInputRef}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handlePdfSelect(f);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => pdfInputRef.current?.click()}
                    className="w-full mt-1.5 justify-start"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    {form.pdf_file
                      ? form.pdf_file.name
                      : "Scegli file PDF…"}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">
                    Il PDF originale viene archiviato come riferimento.
                  </p>
                </div>
              </>
            )}

            {/* Risultati parsing/AI (formato unico) */}
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
                <ArrowLeft className="h-4 w-4 mr-1" />
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
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 */}
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
                label="Subtariffa default"
                value={form.subtariffa_default || "—"}
              />
              <DataRow label="TAN base" value={form.tan_base || "—"} />
              <DataRow
                label="Decorrenza"
                value={form.data_decorrenza || "—"}
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
            {form.parse_result.errori.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>
                  {form.parse_result.errori.length} errori riscontrati
                </AlertTitle>
                <AlertDescription>
                  Le righe con errori non verranno salvate. Puoi tornare
                  indietro e correggere il CSV, oppure procedere e importare
                  solo le righe valide.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex justify-between gap-2">
              <Button
                variant="outline"
                onClick={() => setStep(2)}
                disabled={isSaving}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Indietro
              </Button>
              <Button onClick={handleSalva} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvataggio…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Salva tabella ({form.parse_result.righe_valide.length} righe)
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Sotto-componenti ──────────────────────────────────────────────────────
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
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">
            {fileName ? `Anteprima ${fileName}` : "Anteprima"}
          </p>
          <p className="text-xs text-muted-foreground">
            {result.righe_valide.length} righe valide
            {hasErrors && `, ${result.errori.length} errori`}
          </p>
        </div>
        {result.righe_valide.length > 0 && (
          <span className="inline-flex items-center text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            CSV parsato
          </span>
        )}
      </div>

      {hasErrors && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{result.errori.length} errori</AlertTitle>
          <AlertDescription>
            <ul className="text-xs space-y-1 mt-1">
              {erroriDaMostrare.map((e, i) => (
                <li key={i}>
                  Riga {e.riga}
                  {e.colonna && ` (col. ${e.colonna})`}: {e.messaggio}
                </li>
              ))}
            </ul>
            {result.errori.length > 5 && !showAllErrors && (
              <button
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
                <TableHead>Totale dov.</TableHead>
                <TableHead>TAN</TableHead>
                <TableHead>TAEG</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="tabular-nums">
                    € {r.importo_erogato.toFixed(2)}
                  </TableCell>
                  <TableCell className="tabular-nums">{r.numero_rate}</TableCell>
                  <TableCell className="tabular-nums">
                    € {r.importo_rata.toFixed(2)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    € {r.interessi_cliente.toFixed(2)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    € {r.importo_totale_dovuto.toFixed(2)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {r.tan.toFixed(2)}%
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {r.taeg.toFixed(2)}%
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
