/**
 * SettingsQrCodici — QR e codici a barre del magazzino.
 *
 * 4 schede:
 *   1. QR con link        — QR che aprono un link (una commessa, un documento…) e contano le scansioni.
 *   2. Scansioni          — quanti articoli hanno un codice e le ultime scansioni del magazzino.
 *   3. Per fornitore      — quanti articoli di ogni fornitore hanno un codice.
 *   4. Prova una scansione — si scrive o si scansiona un codice e si vede cosa riconosce il magazzino
 *                            (parser GS1 + ricerca warehouse_scan_lookup + decideUiAction).
 *
 * Permessi: la rotta si apre con «Configurazione Ordini» in vista. Chi lo ha solo in vista consulta
 * tutto e può provare una scansione (è una ricerca, non scrive), ma non crea, non modifica e non
 * archivia i QR: lo fanno gli amministratori e chi ha «Configurazione Ordini» in modifica.
 *
 * Si appoggia a:
 *   - useAuth().effectiveCompany per scoping multi-tenant
 *   - queryKeys.warehouse.qrStats / qrBySupplier / scanEvents
 *   - useBarcodeLookup per la prova di scansione
 *   - BarcodeScanner per aprire la camera (una scansione sola)
 */

import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useBarcodeLookup, type RawMatchRow, type UiAction } from "@/hooks/warehouse/useBarcodeLookup";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { userErrorMessage } from "@/lib/userErrorMessage";
import { AvvisoSolaLetturaImpostazioni } from "@/components/impostazioni/AvvisoSolaLetturaImpostazioni";
import { format } from "date-fns";
import { it as itLocale } from "date-fns/locale";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  QrCode,
  Camera,
  ScanLine,
  Package,
  TrendingUp,
  Users,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Loader2,
  Plus,
  Copy,
  Download,
  Archive,
  ExternalLink,
  ShieldCheck,
  Search,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const BarcodeScanner = lazy(() =>
  import("@/components/warehouse/BarcodeScanner").then((m) => ({ default: m.BarcodeScanner })),
);

// ────────────────────────────────────────────────────────────
// Tipi locali per le query (evitiamo coupling stretto con types DB)
// ────────────────────────────────────────────────────────────

interface QrStats {
  totalItems: number;
  itemsWithBarcode: number;
  itemsSerialized: number;
  totalUnits: number;
  unitsAvailable: number;
  scans7d: number;
  matchedScans7d: number;
}

interface ScanEventRow {
  id: string;
  created_at: string;
  scanned_code: string;
  scan_type: string;
  resolution_status: string;
  resolved_stock_item_id: string | null;
  resolved_stock_unit_id: string | null;
  warehouse_id: string | null;
  user_id: string | null;
}

// `default_qr_format` non c'è più: nessun codice lo leggeva (0 fornitori su 181 l'avevano compilato).
interface SupplierCoverageRow {
  id: string;
  name: string;
  uses_gs1: boolean | null;
  totalItems: number;
  itemsWithBarcode: number;
  coveragePct: number;
}

interface DynamicQrCode {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  qr_type: string;
  destination_url: string;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  public_token: string;
  access_level: "public" | "private";
  status: "active" | "inactive" | "archived";
  expires_at: string | null;
  scan_count: number;
  last_scanned_at: string | null;
  created_at: string;
  created_by: string | null;
}

interface DynamicQrFormData {
  name: string;
  description: string;
  qr_type: string;
  destination_url: string;
  linked_entity_type: string;
  linked_entity_id: string;
  access_level: "public" | "private";
  status: "active" | "inactive";
  expires_at: string;
}

const emptyDynamicQrForm: DynamicQrFormData = {
  name: "",
  description: "",
  qr_type: "url",
  destination_url: "",
  linked_entity_type: "none",
  linked_entity_id: "",
  access_level: "public",
  status: "active",
  expires_at: "",
};

// I valori (url, ordine, ticket…) sono quelli del database; a schermo si leggono le parole del mestiere.
const qrTypeLabels: Record<string, string> = {
  url: "Link",
  cliente: "Cliente",
  contatto: "Contatto",
  ordine: "Commessa",
  cantiere: "Cantiere",
  materiale: "Materiale",
  documento: "Documento",
  ticket: "Richiesta di assistenza",
  appuntamento: "Appuntamento",
};

const entityTypeOptions = [
  { value: "none", label: "Niente" },
  { value: "customer", label: "Cliente" },
  { value: "contact", label: "Contatto" },
  { value: "order", label: "Commessa" },
  { value: "job", label: "Cantiere" },
  { value: "stock_item", label: "Materiale" },
  { value: "document", label: "Documento" },
  { value: "ticket", label: "Richiesta di assistenza" },
  { value: "appointment", label: "Appuntamento" },
];

// Tipo di scansione del magazzino (warehouse_scan_events.scan_type), in italiano.
const scanTypeLabels: Record<string, string> = {
  lookup: "ricerca",
  carico: "carico",
  load: "carico",
  scarico: "scarico",
  unload: "scarico",
  inventario: "inventario",
  transfer: "trasferimento",
  return: "reso",
  oda_receive: "ricevimento ordine",
};

function scanTypeLabel(scanType: string) {
  return scanTypeLabels[scanType] ?? scanType.toLowerCase();
}

/** Un controllo fatto dalla pagina prima di scrivere: il messaggio è già in italiano e si mostra com'è. */
class ErroreControllo extends Error {}

const MSG_SOLA_LETTURA = "Non puoi modificare i QR: serve «Configurazione Ordini» in modifica.";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Il motivo di un errore, in italiano: i controlli della pagina come sono, gli errori del database tradotti. */
function motivoErrore(e: unknown, ripiego: string) {
  return e instanceof ErroreControllo ? e.message : userErrorMessage(e, ripiego);
}

function generateQrToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("").slice(0, 32);
}

function normalizeDestinationUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  // v8.6.43 — SECURITY: blocca scheme pericolosi (javascript:, data:, vbscript:, ...)
  // Senza questo guard, anche se il DB ha un CHECK constraint, un attaccante con
  // accesso DB diretto (super_admin malevolo) potrebbe iniettare XSS via QR pubblico.
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("file:") ||
    lower.startsWith("blob:")
  ) {
    throw new ErroreControllo("Schema URL non consentito (solo https://, mailto:, tel:, /path interno)");
  }
  if (trimmed.startsWith("/") || /^https?:\/\//i.test(trimmed)) return trimmed;
  // Schemi consentiti senza riscrittura
  if (/^(mailto:|tel:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function getPublicQrUrl(token: string) {
  return `${window.location.origin}/qr/${token}`;
}

function isExpired(expiresAt: string | null) {
  return !!expiresAt && new Date(expiresAt).getTime() <= Date.now();
}

function formDaQr(qr: DynamicQrCode | null): DynamicQrFormData {
  if (!qr) return { ...emptyDynamicQrForm };
  return {
    name: qr.name,
    description: qr.description ?? "",
    qr_type: qr.qr_type,
    destination_url: qr.destination_url,
    linked_entity_type: qr.linked_entity_type ?? "none",
    linked_entity_id: qr.linked_entity_id ?? "",
    access_level: qr.access_level,
    status: qr.status === "archived" ? "inactive" : qr.status,
    expires_at: qr.expires_at ? qr.expires_at.slice(0, 16) : "",
  };
}

// ────────────────────────────────────────────────────────────
// Scheda 1 — QR con link
// ────────────────────────────────────────────────────────────

function QrDinamiciTab({ puoModificare }: { puoModificare: boolean }) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  // La finestra (nuovo QR o QR da modificare) esiste solo da aperta: ogni apertura riparte dai suoi valori.
  const [finestra, setFinestra] = useState<{ qr: DynamicQrCode | null } | null>(null);

  const { data: qrs = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["company-dynamic-qr-codes", companyId],
    queryFn: async (): Promise<DynamicQrCode[]> => {
      if (!companyId) return [];
      const { data, error } = await (supabase as any)
        .from("company_qr_codes")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const filteredQrs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return qrs.filter((qr) => {
      const matchesSearch = !q ||
        qr.name.toLowerCase().includes(q) ||
        (qr.description ?? "").toLowerCase().includes(q) ||
        qr.destination_url.toLowerCase().includes(q) ||
        (qr.linked_entity_id ?? "").toLowerCase().includes(q);
      const statusForFilter = isExpired(qr.expires_at) && qr.status === "active" ? "expired" : qr.status;
      const matchesStatus = statusFilter === "all" || statusForFilter === statusFilter;
      const matchesType = typeFilter === "all" || qr.qr_type === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [qrs, search, statusFilter, typeFilter]);

  const stats = useMemo(() => ({
    total: qrs.length,
    active: qrs.filter((qr) => qr.status === "active" && !isExpired(qr.expires_at)).length,
    expired: qrs.filter((qr) => isExpired(qr.expires_at)).length,
    scans: qrs.reduce((sum, qr) => sum + (qr.scan_count ?? 0), 0),
  }), [qrs]);

  const archiveMutation = useMutation({
    mutationFn: async (qr: DynamicQrCode) => {
      // Difesa oltre al pulsante nascosto: senza il permesso di modifica non si scrive.
      if (!puoModificare) throw new ErroreControllo(MSG_SOLA_LETTURA);
      if (!companyId) throw new ErroreControllo("Azienda non selezionata.");
      const { error } = await (supabase as any)
        .from("company_qr_codes")
        .update({ status: "archived" })
        .eq("id", qr.id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("QR archiviato");
      queryClient.invalidateQueries({ queryKey: ["company-dynamic-qr-codes"] });
    },
    onError: (e) => toast.error("QR non archiviato", {
      description: motivoErrore(e, "Non sono riuscito ad archiviare il QR. Riprova."),
    }),
  });

  const openCreate = () => {
    if (!puoModificare) return;
    setFinestra({ qr: null });
  };

  const openEdit = (qr: DynamicQrCode) => {
    if (!puoModificare) return;
    setFinestra({ qr });
  };

  const copyLink = async (qr: DynamicQrCode) => {
    try {
      await navigator.clipboard.writeText(getPublicQrUrl(qr.public_token));
      toast.success("Link copiato");
    } catch {
      toast.error("Link non copiato", { description: "Il browser non ha permesso di copiarlo. Riprova." });
    }
  };

  const downloadPng = async (qr: DynamicQrCode) => {
    try {
      const QRCode = await import("qrcode");
      const dataUrl = await QRCode.toDataURL(getPublicQrUrl(qr.public_token), {
        width: 1024,
        margin: 2,
        errorCorrectionLevel: "M",
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${qr.name.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}-qr.png`;
      a.click();
    } catch {
      toast.error("QR non scaricato", { description: "Non sono riuscito a creare l'immagine. Riprova." });
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={QrCode} label="QR totali" value={String(stats.total)} hint="con link" accent="primary" />
        <KpiCard icon={CheckCircle2} label="Attivi" value={String(stats.active)} hint="accessibili ora" accent="emerald" />
        <KpiCard icon={AlertCircle} label="Scaduti" value={String(stats.expired)} hint="da verificare" accent={stats.expired > 0 ? "amber" : "blue"} />
        <KpiCard icon={ScanLine} label="Scansioni" value={String(stats.scans)} hint="totale storico" accent="primary" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle aria-level={2} className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                QR con link
              </CardTitle>
              <CardDescription>
                Crea QR che aprono un link e contano le scansioni: per clienti, commesse, cantieri, materiali, documenti o richieste di assistenza.
              </CardDescription>
            </div>
            {puoModificare && (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Nuovo QR
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_160px_180px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca per nome, descrizione, link o codice…"
                aria-label="Cerca tra i QR"
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger aria-label="Filtra per stato"><SelectValue placeholder="Stato" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati</SelectItem>
                <SelectItem value="active">Attivi</SelectItem>
                <SelectItem value="inactive">Disattivati</SelectItem>
                <SelectItem value="expired">Scaduti</SelectItem>
                <SelectItem value="archived">Archiviati</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger aria-label="Filtra per tipo"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i tipi</SelectItem>
                {Object.entries(qrTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Non riesco a leggere i QR</AlertTitle>
              <AlertDescription className="space-y-3">
                <p className="text-xs">{userErrorMessage(error, "Non sono riuscito a caricare i QR. Riprova.")}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                  Riprova
                </Button>
              </AlertDescription>
            </Alert>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredQrs.length === 0 ? (
            <div className="rounded-lg border border-dashed py-10 text-center text-muted-foreground">
              <QrCode className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium text-foreground">Nessun QR trovato</p>
              {puoModificare && (
                <p className="text-sm mt-1">Crea un QR per tracciare gli accessi a link, documenti o schede operative.</p>
              )}
            </div>
          ) : (
            // Su telefono ogni QR è una scheda (stesso schema di «Cartelle documenti»): la tabella a sette
            // colonne con le azioni da 220 px restava fuori schermo. Da `md` in su torna la tabella.
            // Il bordo della scheda è «!important»: il corpo della tabella toglie il bordo all'ultima riga e l'ultima scheda restava senza.
            <Table className="block md:table">
              <TableHeader className="hidden md:table-header-group">
                <TableRow>
                  <TableHead>QR</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Accesso</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Scansioni</TableHead>
                  <TableHead>Ultima scansione</TableHead>
                  <TableHead className="w-[220px]">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="block space-y-3 md:table-row-group md:space-y-0">
                {filteredQrs.map((qr) => (
                  <TableRow
                    key={qr.id}
                    className="flex flex-wrap items-center gap-x-2 gap-y-2 p-3 max-md:rounded-lg max-md:!border md:table-row md:p-0"
                  >
                    <TableCell className="w-full min-w-0 p-0 md:w-auto md:p-4">
                      <div className="font-medium">{qr.name}</div>
                      <div className="text-xs text-muted-foreground truncate md:max-w-[320px]">{qr.destination_url}</div>
                    </TableCell>
                    <TableCell className="p-0 md:p-4"><Badge variant="outline">{qrTypeLabels[qr.qr_type] ?? qr.qr_type}</Badge></TableCell>
                    <TableCell className="p-0 md:p-4">
                      <Badge variant={qr.access_level === "public" ? "default" : "secondary"}>
                        {qr.access_level === "public" ? "Chiunque" : "Solo con accesso"}
                      </Badge>
                    </TableCell>
                    <TableCell className="p-0 md:p-4"><QrStatusBadge qr={qr} /></TableCell>
                    <TableCell className="p-0 text-xs text-muted-foreground md:p-4 md:text-right md:text-sm md:font-medium md:text-foreground">
                      {qr.scan_count ?? 0}
                      <span className="md:hidden"> {(qr.scan_count ?? 0) === 1 ? "scansione" : "scansioni"}</span>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {qr.last_scanned_at ? format(new Date(qr.last_scanned_at), "dd/MM/yyyy HH:mm") : "—"}
                    </TableCell>
                    <TableCell className="w-full p-0 md:w-auto md:p-4">
                      <div className="flex flex-wrap gap-1">
                        <Button variant="ghost" size="icon" onClick={() => void copyLink(qr)} aria-label={`Copia link ${qr.name}`}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => void downloadPng(qr)} aria-label={`Scarica QR ${qr.name}`}>
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => window.open(getPublicQrUrl(qr.public_token), "_blank", "noopener,noreferrer")} aria-label={`Apri QR ${qr.name}`}>
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        {puoModificare && (
                          <Button variant="ghost" size="sm" onClick={() => openEdit(qr)} aria-label={`Modifica ${qr.name}`}>Modifica</Button>
                        )}
                        {puoModificare && qr.status !== "archived" && (
                          <Button variant="ghost" size="icon" onClick={() => archiveMutation.mutate(qr)} aria-label={`Archivia ${qr.name}`}>
                            <Archive className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {finestra && (
        <FinestraQr
          qr={finestra.qr}
          companyId={companyId}
          puoModificare={puoModificare}
          onClose={() => setFinestra(null)}
        />
      )}
    </div>
  );
}

/**
 * Nuovo QR / modifica di un QR. Si monta solo da aperta, così ogni apertura riparte dai suoi valori e
 * la protezione della bozza (Esc, clic fuori, Annulla) chiede conferma solo se qualcosa è cambiato.
 */
function FinestraQr({
  qr,
  companyId,
  puoModificare,
  onClose,
}: {
  qr: DynamicQrCode | null;
  companyId: string | undefined;
  puoModificare: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [iniziale] = useState(() => formDaQr(qr));
  const [formData, setFormData] = useState<DynamicQrFormData>(iniziale);
  const modificato = JSON.stringify(formData) !== JSON.stringify(iniziale);
  const confermaUscita = useSettingsDraftGuard(modificato);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Difesa oltre al pulsante nascosto: senza il permesso di modifica non si scrive.
      if (!puoModificare) throw new ErroreControllo(MSG_SOLA_LETTURA);
      if (!companyId) throw new ErroreControllo("Azienda non selezionata.");
      const name = formData.name.trim();
      const destinationUrl = normalizeDestinationUrl(formData.destination_url);
      if (!name) throw new ErroreControllo("Il nome del QR è obbligatorio.");
      if (!destinationUrl) throw new ErroreControllo("La destinazione è obbligatoria.");
      // v8.6.43 — Allowlist schemi sicuri (coerente con CHECK constraint DB)
      const isInternal = destinationUrl.startsWith("/") && !destinationUrl.startsWith("//");
      const isHttp = /^https?:\/\//i.test(destinationUrl);
      const isMailto = /^mailto:/i.test(destinationUrl);
      const isTel = /^tel:/i.test(destinationUrl);
      if (!isInternal && !isHttp && !isMailto && !isTel) {
        throw new ErroreControllo("Schema non consentito. Usa https://, mailto:, tel: o un percorso interno (/...).");
      }
      // La colonna è un codice interno (uuid): un testo qualsiasi farebbe rifiutare il salvataggio dal database.
      const codiceCollegato = formData.linked_entity_id.trim();
      if (codiceCollegato && !UUID_RE.test(codiceCollegato)) {
        throw new ErroreControllo("Il codice dell'elemento collegato non è valido. Se non ce l'hai, lascia il campo vuoto.");
      }

      const payload = {
        name,
        description: formData.description.trim() || null,
        qr_type: formData.qr_type,
        destination_url: destinationUrl,
        linked_entity_type: formData.linked_entity_type === "none" ? null : formData.linked_entity_type,
        linked_entity_id: codiceCollegato || null,
        access_level: formData.access_level,
        status: formData.status,
        expires_at: formData.expires_at ? new Date(formData.expires_at).toISOString() : null,
      };

      if (qr) {
        const { error } = await (supabase as any)
          .from("company_qr_codes")
          .update(payload)
          .eq("id", qr.id)
          .eq("company_id", companyId);
        if (error) throw error;
      } else {
        const user = (await supabase.auth.getUser()).data.user;
        const { error } = await (supabase as any)
          .from("company_qr_codes")
          .insert({
            ...payload,
            company_id: companyId,
            public_token: generateQrToken(),
            created_by: user?.id ?? null,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(qr ? "QR aggiornato" : "QR creato");
      queryClient.invalidateQueries({ queryKey: ["company-dynamic-qr-codes"] });
      onClose();
    },
    onError: (e) => toast.error("QR non salvato", {
      description: motivoErrore(e, "Non sono riuscito a salvare il QR. Riprova."),
    }),
  });

  const chiudi = () => {
    if (saveMutation.isPending) return;
    if (confermaUscita()) onClose();
  };

  return (
    <Dialog open onOpenChange={(aperta) => { if (!aperta) chiudi(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{qr ? "Modifica QR" : "Nuovo QR con link"}</DialogTitle>
          <DialogDescription>
            Scegli dove porta il QR, chi può aprirlo e fino a quando. Il link si crea da solo.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="qr-nome">Nome del QR *</Label>
            <Input id="qr-nome" value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qr-tipo">Tipo di QR</Label>
            <Select value={formData.qr_type} onValueChange={(value) => setFormData((p) => ({ ...p, qr_type: value }))}>
              <SelectTrigger id="qr-tipo"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(qrTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="qr-destinazione">Destinazione *</Label>
            <Input
              id="qr-destinazione"
              value={formData.destination_url}
              onChange={(e) => setFormData((p) => ({ ...p, destination_url: e.target.value }))}
              placeholder="https://... oppure /azienda/ordini/…"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qr-accesso">Accesso</Label>
            <Select value={formData.access_level} onValueChange={(value: "public" | "private") => setFormData((p) => ({ ...p, access_level: value }))}>
              <SelectTrigger id="qr-accesso"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Chiunque abbia il link</SelectItem>
                <SelectItem value="private">Solo chi ha fatto l'accesso</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="qr-stato">Stato</Label>
            <Select value={formData.status} onValueChange={(value: "active" | "inactive") => setFormData((p) => ({ ...p, status: value }))}>
              <SelectTrigger id="qr-stato"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Attivo</SelectItem>
                <SelectItem value="inactive">Disattivato</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="qr-collegato-a">Collegato a</Label>
            <Select value={formData.linked_entity_type} onValueChange={(value) => setFormData((p) => ({ ...p, linked_entity_type: value }))}>
              <SelectTrigger id="qr-collegato-a"><SelectValue /></SelectTrigger>
              <SelectContent>
                {entityTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="qr-codice-collegato">Codice dell'elemento collegato (facoltativo)</Label>
            <Input
              id="qr-codice-collegato"
              value={formData.linked_entity_id}
              onChange={(e) => setFormData((p) => ({ ...p, linked_entity_id: e.target.value }))}
              placeholder="Lascia vuoto se non serve"
              aria-describedby="qr-codice-collegato-aiuto"
              autoComplete="off"
            />
            <p id="qr-codice-collegato-aiuto" className="text-xs text-muted-foreground">
              Serve solo se un tecnico ti ha dato il codice interno di una commessa o di un cliente.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="qr-scadenza">Scadenza (facoltativa)</Label>
            <Input
              id="qr-scadenza"
              type="datetime-local"
              value={formData.expires_at}
              onChange={(e) => setFormData((p) => ({ ...p, expires_at: e.target.value }))}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="qr-descrizione">Descrizione (facoltativa)</Label>
            <Textarea
              id="qr-descrizione"
              value={formData.description}
              onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
              rows={3}
              maxLength={500}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={chiudi}>Annulla</Button>
          <Button type="button" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {qr ? "Salva" : "Crea QR"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QrStatusBadge({ qr }: { qr: DynamicQrCode }) {
  if (qr.status === "archived") return <Badge variant="outline" className="text-muted-foreground">Archiviato</Badge>;
  if (isExpired(qr.expires_at)) return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Scaduto</Badge>;
  if (qr.status === "inactive") return <Badge variant="secondary">Disattivato</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Attivo</Badge>;
}

// ────────────────────────────────────────────────────────────
// Scheda 2 — Scansioni
// ────────────────────────────────────────────────────────────

function PanoramicaTab() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: stats, isLoading: statsLoading, isError: statsIsError, error: statsError, refetch: refetchStats } = useQuery({
    queryKey: queryKeys.warehouse.qrStats(companyId),
    queryFn: async (): Promise<QrStats> => {
      if (!companyId) {
        return {
          totalItems: 0,
          itemsWithBarcode: 0,
          itemsSerialized: 0,
          totalUnits: 0,
          unitsAvailable: 0,
          scans7d: 0,
          matchedScans7d: 0,
        };
      }

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // 4 query in parallelo per i conteggi (head:true → solo metadata, no payload)
      const [items, itemsBc, itemsSer, units, unitsAvail, scans, scansMatched] = await Promise.all([
        supabase.from("warehouse_stock").select("id", { count: "exact", head: true })
          .eq("company_id", companyId),
        supabase.from("warehouse_stock").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).not("barcode", "is", null),
        supabase.from("warehouse_stock").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).eq("tracking_mode", "serialized"),
        supabase.from("stock_units").select("id", { count: "exact", head: true })
          .eq("company_id", companyId),
        supabase.from("stock_units").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).eq("status", "available"),
        supabase.from("warehouse_scan_events").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).gte("created_at", sevenDaysAgo),
        supabase.from("warehouse_scan_events").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).gte("created_at", sevenDaysAgo).eq("resolution_status", "matched"),
      ]);
      const failedCount = [items, itemsBc, itemsSer, units, unitsAvail, scans, scansMatched].find((res) => res.error);
      if (failedCount?.error) throw failedCount.error;

      return {
        totalItems: items.count ?? 0,
        itemsWithBarcode: itemsBc.count ?? 0,
        itemsSerialized: itemsSer.count ?? 0,
        totalUnits: units.count ?? 0,
        unitsAvailable: unitsAvail.count ?? 0,
        scans7d: scans.count ?? 0,
        matchedScans7d: scansMatched.count ?? 0,
      };
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const { data: recentScans = [], isLoading: scansLoading, isError: scansIsError, error: scansError, refetch: refetchScans } = useQuery({
    queryKey: queryKeys.warehouse.scanEvents(companyId, "recent"),
    queryFn: async (): Promise<ScanEventRow[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("warehouse_scan_events")
        .select("id, created_at, scanned_code, scan_type, resolution_status, resolved_stock_item_id, resolved_stock_unit_id, warehouse_id, user_id")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as ScanEventRow[];
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  const coveragePct = stats && stats.totalItems > 0
    ? Math.round((stats.itemsWithBarcode / stats.totalItems) * 100)
    : 0;

  const matchRate7d = stats && stats.scans7d > 0
    ? Math.round((stats.matchedScans7d / stats.scans7d) * 100)
    : 0;

  if (statsIsError || scansIsError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Non riesco a leggere le scansioni</AlertTitle>
        <AlertDescription className="space-y-3">
          <p className="text-xs">
            {userErrorMessage(statsError ?? scansError, "Non sono riuscito a caricare i dati delle scansioni. Riprova.")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void refetchStats();
              void refetchScans();
            }}
          >
            Riprova
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          icon={Package}
          label="Articoli"
          value={statsLoading ? "…" : String(stats?.totalItems ?? 0)}
          hint={`${stats?.itemsWithBarcode ?? 0} con codice a barre`}
          accent="primary"
        />
        <KpiCard
          icon={QrCode}
          label="Articoli con codice"
          value={statsLoading ? "…" : `${coveragePct}%`}
          hint="hanno un codice a barre"
          accent={coveragePct >= 50 ? "emerald" : coveragePct >= 20 ? "amber" : "rose"}
        />
        <KpiCard
          icon={Users}
          label="Seriali"
          value={statsLoading ? "…" : String(stats?.unitsAvailable ?? 0)}
          hint={`su ${stats?.totalUnits ?? 0} totali · ${stats?.itemsSerialized ?? 0} articoli`}
          accent="blue"
        />
        <KpiCard
          icon={ScanLine}
          label="Scansioni 7 giorni"
          value={statsLoading ? "…" : String(stats?.scans7d ?? 0)}
          hint={`${matchRate7d}% trovate`}
          accent="primary"
        />
      </div>

      {/* Recent scan events */}
      <Card>
        <CardHeader>
          <CardTitle aria-level={2} className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Ultime scansioni
          </CardTitle>
          <CardDescription>
            Le ultime 50 scansioni (ricerche, carichi, scarichi).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scansLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : recentScans.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ScanLine className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nessuna scansione registrata. Inizia a usare lo scanner dal magazzino.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">Quando</TableHead>
                    <TableHead>Codice</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Esito</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentScans.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(s.created_at), "dd MMM HH:mm", { locale: itLocale })}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {s.scanned_code.length > 32 ? `${s.scanned_code.slice(0, 32)}…` : s.scanned_code}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{scanTypeLabel(s.scan_type)}</Badge>
                      </TableCell>
                      <TableCell>
                        <ResolutionBadge status={s.resolution_status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ResolutionBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
    matched: { label: "Trovato", className: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
    matched_ambiguous: { label: "Ambiguo", className: "bg-amber-100 text-amber-700 border-amber-200", icon: HelpCircle },
    new_item_created: { label: "Nuovo articolo", className: "bg-blue-100 text-blue-700 border-blue-200", icon: Package },
    unresolved: { label: "Non trovato", className: "bg-zinc-100 text-zinc-700 border-zinc-200", icon: HelpCircle },
    rejected: { label: "Rifiutato", className: "bg-rose-100 text-rose-700 border-rose-200", icon: AlertCircle },
  };
  const c = cfg[status] ?? cfg.unresolved;
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={`gap-1 text-[10px] ${c.className}`}>
      <Icon className="h-3 w-3" />
      {c.label}
    </Badge>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: typeof QrCode;
  label: string;
  value: string;
  hint?: string;
  accent: "primary" | "emerald" | "amber" | "rose" | "blue";
}) {
  const accentMap = {
    primary: "border-l-primary",
    emerald: "border-l-emerald-500",
    amber: "border-l-amber-500",
    rose: "border-l-rose-500",
    blue: "border-l-blue-500",
  };
  return (
    <div className={`rounded-lg border-l-4 ${accentMap[accent]} bg-card p-3`}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-xl font-bold mt-1">{value}</p>
      {hint ? <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p> : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Scheda 3 — Per fornitore
// ────────────────────────────────────────────────────────────

function PerFornitoreTab() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: rows = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.warehouse.qrBySupplier(companyId),
    queryFn: async (): Promise<SupplierCoverageRow[]> => {
      if (!companyId) return [];
      // Una sola round-trip: prendiamo fornitori + articoli relativi.
      const { data: suppliers, error: e1 } = await supabase
        .from("suppliers")
        .select("id, name, uses_gs1")
        .eq("company_id", companyId)
        .order("name");
      if (e1) throw e1;

      const { data: items, error: e2 } = await supabase
        .from("warehouse_stock")
        .select("id, supplier_id, barcode")
        .eq("company_id", companyId);
      if (e2) throw e2;

      // Aggregazione client-side: per ogni supplier, conta items + items con barcode.
      const itemsBySupplier = new Map<string, { total: number; withBc: number }>();
      (items ?? []).forEach((it: { supplier_id: string | null; barcode: string | null }) => {
        if (!it.supplier_id) return;
        const cur = itemsBySupplier.get(it.supplier_id) ?? { total: 0, withBc: 0 };
        cur.total += 1;
        if (it.barcode) cur.withBc += 1;
        itemsBySupplier.set(it.supplier_id, cur);
      });

      return ((suppliers ?? []) as Array<{
        id: string;
        name: string;
        uses_gs1: boolean | null;
      }>).map((s) => {
        const cnt = itemsBySupplier.get(s.id) ?? { total: 0, withBc: 0 };
        return {
          id: s.id,
          name: s.name,
          uses_gs1: s.uses_gs1,
          totalItems: cnt.total,
          itemsWithBarcode: cnt.withBc,
          coveragePct: cnt.total > 0 ? Math.round((cnt.withBc / cnt.total) * 100) : 0,
        };
      });
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle aria-level={2} className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          Codici per fornitore
        </CardTitle>
        <CardDescription>
          Quanti articoli di ogni fornitore hanno un codice a barre o QR.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Non riesco a leggere i fornitori</AlertTitle>
            <AlertDescription className="space-y-3">
              <p className="text-xs">{userErrorMessage(error, "Non sono riuscito a caricare i fornitori. Riprova.")}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                Riprova
              </Button>
            </AlertDescription>
          </Alert>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nessun fornitore configurato. Aggiungi i fornitori da Impostazioni → Fornitori.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornitore</TableHead>
                  <TableHead className="text-right">Articoli</TableHead>
                  <TableHead className="text-right">Con codice</TableHead>
                  <TableHead className="text-right">Percentuale</TableHead>
                  <TableHead>Usa GS1</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right text-sm">{r.totalItems}</TableCell>
                    <TableCell className="text-right text-sm">{r.itemsWithBarcode}</TableCell>
                    <TableCell className="text-right">
                      <CoverageBar pct={r.coveragePct} />
                    </TableCell>
                    <TableCell>
                      {r.uses_gs1 ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">Sì</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">No</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CoverageBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center justify-end gap-2 min-w-[120px]">
      <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-xs font-medium w-9 text-right">{pct}%</span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Scheda 4 — Prova una scansione
// ────────────────────────────────────────────────────────────

// È una ricerca (la funzione del database legge e basta): resta usabile anche da chi può solo consultare.
function TestScanTab() {
  const lookup = useBarcodeLookup();
  const [manualCode, setManualCode] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    lookup.mutate({ rawScan: code });
  };

  const handleCameraScan = (code: string) => {
    setScannerOpen(false);
    setManualCode(code);
    lookup.mutate({ rawScan: code });
  };

  const result = lookup.data;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle aria-level={2} className="text-base flex items-center gap-2">
            <ScanLine className="h-4 w-4" />
            Prova una scansione
          </CardTitle>
          <CardDescription>
            Scrivi o scansiona un codice per vedere cosa riconosce il magazzino.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleManualSubmit} className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="test-code" className="text-xs">Codice (incolla o digita)</Label>
              <Input
                id="test-code"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Es. 8001234567890 oppure 0108001234567890..."
                autoComplete="off"
                className="font-mono"
              />
            </div>
            <div className="flex gap-2 sm:items-end">
              <Button type="submit" disabled={!manualCode.trim() || lookup.isPending}>
                {lookup.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ScanLine className="h-4 w-4 mr-2" />}
                Cerca
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setScannerOpen(true)}
                disabled={lookup.isPending}
              >
                <Camera className="h-4 w-4 mr-2" />
                Camera
              </Button>
            </div>
          </form>

          {lookup.isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Ricerca non riuscita</AlertTitle>
              <AlertDescription className="text-xs">
                {userErrorMessage(lookup.error, "Non sono riuscito a cercare il codice. Riprova.")}
              </AlertDescription>
            </Alert>
          )}

          {result && <TestResultCard result={result} />}
        </CardContent>
      </Card>

      <Suspense fallback={null}>
        {scannerOpen && (
          <BarcodeScanner
            open={scannerOpen}
            onOpenChange={setScannerOpen}
            onScan={handleCameraScan}
          />
        )}
      </Suspense>
    </div>
  );
}

function TestResultCard({ result }: { result: NonNullable<ReturnType<typeof useBarcodeLookup>["data"]> }) {
  const action = result.action;
  return (
    <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-[11px] uppercase text-muted-foreground">Codice letto</p>
          <p className="font-mono text-xs break-all">{result.rawScan}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-muted-foreground">Codice usato per la ricerca</p>
          <p className="font-mono text-xs break-all">{result.parsedPrimary}</p>
        </div>
      </div>

      {result.gs1Detected && result.gs1 && (
        <div className="text-xs space-y-1 border-l-2 border-emerald-300 pl-3">
          <p className="font-medium text-emerald-700">GS1 rilevato</p>
          {result.gs1.gtin && <p>GTIN: <span className="font-mono">{result.gs1.gtin}</span></p>}
          {result.gs1.serialNumber && <p>Seriale: <span className="font-mono">{result.gs1.serialNumber}</span></p>}
          {result.gs1.lotNumber && <p>Lotto: <span className="font-mono">{result.gs1.lotNumber}</span></p>}
          {result.gs1.expiryDate && <p>Scadenza: <span className="font-mono">{result.gs1.expiryDate}</span></p>}
        </div>
      )}

      <div className="border-t pt-3">
        <p className="text-[11px] uppercase text-muted-foreground mb-1">Cosa fa il magazzino</p>
        <ActionDescription action={action} rows={result.rows} />
        {action.kind === "confirm_ambiguous" && (
          <ul className="mt-2 space-y-1 text-xs">
            {action.rows.map((r, i) => (
              <li key={`${r.stock_item_id}-${i}`} className="flex items-center gap-2">
                <span className="font-medium">{r.item_name ?? "—"}</span>
                {r.supplier_name && (
                  <span className="text-muted-foreground">· {r.supplier_name}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ActionDescription({ action, rows }: { action: UiAction; rows: RawMatchRow[] }) {
  // Il nome dell'articolo, se la ricerca lo ha restituito: più utile del codice interno.
  const nomeArticolo = (itemId: string) => rows.find((r) => r.stock_item_id === itemId)?.item_name ?? null;
  switch (action.kind) {
    case "accept_unit":
      return (
        <div className="flex items-start gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Pezzo trovato</p>
            <p className="text-xs text-muted-foreground">
              Il sistema procede da solo con questo pezzo:{" "}
              {nomeArticolo(action.itemId) ?? <code className="font-mono">{action.unitId.slice(0, 8)}…</code>}
            </p>
          </div>
        </div>
      );
    case "accept_item":
      return (
        <div className="flex items-start gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Articolo trovato</p>
            <p className="text-xs text-muted-foreground">
              Articolo identificato:{" "}
              {nomeArticolo(action.itemId) ?? <code className="font-mono">{action.itemId.slice(0, 8)}…</code>}
              {" "}— il sistema procede.
            </p>
          </div>
        </div>
      );
    case "confirm_ambiguous":
      return (
        <div className="flex items-start gap-2 text-sm">
          <HelpCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Più articoli possibili: l'operatore sceglie</p>
            <p className="text-xs text-muted-foreground">
              {action.rows.length} candidati. Il magazzino mostra una finestra per scegliere.
            </p>
          </div>
        </div>
      );
    case "offer_create_new":
      return (
        <div className="flex items-start gap-2 text-sm">
          <Package className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Codice nuovo: si propone di creare l'articolo</p>
            <p className="text-xs text-muted-foreground">
              Si apre la scheda dell'articolo con il codice già inserito.
            </p>
          </div>
        </div>
      );
  }
}

// ────────────────────────────────────────────────────────────
// Pagina principale
// ────────────────────────────────────────────────────────────

export default function SettingsQrCodici() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const permissions = usePermissions();
  // 13/7/2026: la pagina rispetta il permesso Impostazioni dedicato (prima solo ruolo admin,
  // e il toggle dato dall'admin non apriva nulla). Modifica ⇒ tutte le azioni; Visualizza ⇒ accesso.
  // `isAdmin` è chi MODIFICA; chi ha solo la vista consulta (prima la pagina restava vuota).
  const isAdmin = role === "company_admin" || role === "super_admin" || permissions.canEditSettingsOrders;
  const canView = isAdmin || permissions.canViewSettingsOrders;
  const [tab, setTab] = useState("dinamici");

  useEffect(() => {
    if (!canView) navigate("/azienda", { replace: true });
  }, [canView, navigate]);

  if (!canView) return null;

  // Il titolo della pagina lo mette già il layout delle impostazioni: qui non se ne ripete uno.
  return (
    <div className="space-y-4">
      {!isAdmin && <AvvisoSolaLetturaImpostazioni permesso="Configurazione Ordini" />}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="dinamici">QR con link</TabsTrigger>
          <TabsTrigger value="panoramica">Scansioni</TabsTrigger>
          <TabsTrigger value="per-fornitore">Per fornitore</TabsTrigger>
          <TabsTrigger value="test-scan">Prova una scansione</TabsTrigger>
        </TabsList>
        <TabsContent value="dinamici" className="mt-4">
          <QrDinamiciTab puoModificare={isAdmin} />
        </TabsContent>
        <TabsContent value="panoramica" className="mt-4">
          <PanoramicaTab />
        </TabsContent>
        <TabsContent value="per-fornitore" className="mt-4">
          <PerFornitoreTab />
        </TabsContent>
        <TabsContent value="test-scan" className="mt-4">
          <TestScanTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
