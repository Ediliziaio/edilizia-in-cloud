import { useState, useRef } from "react";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, Save, AlertTriangle, Upload, Trash2,
  Plus, Building2, Receipt, Palette, CreditCard, Percent,
  Settings2, FileText, Globe, Download
} from "lucide-react";
import { toast } from "sonner";
import { REGIMI_FISCALI, METODI_PAGAMENTO_SDI, CAUSALI_RITENUTA, TIPI_CASSA_PREVIDENZIALE } from "@/types/fatturazione";
import { FatturaElettronicaPassi } from "@/components/fatturazione/FatturaElettronicaPassi";
import { CANALE_SDI, CODICE_DESTINATARIO_EIC } from "@/lib/fatturazione/canaleSdi";
import { isDemoCompanyId } from "@/lib/constants/demoCompany";
import { datiReaMancanti, eSocieta, eSocietaDiCapitali } from "../../../../supabase/functions/_shared/datiSocietari";

import { useSearchParams } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
// ─── Aliquote IVA predefinite italiane ────────────────────────
const NATURE_IVA = {
  N1: "Escluse ex art.15",
  N2: "Non soggette",
  "N2.1": "Non soggette - artt. da 7 a 7-septies",
  "N2.2": "Non soggette - altri casi",
  N3: "Non imponibili",
  "N3.1": "Non imponibili - esportazioni",
  "N3.2": "Non imponibili - cessioni intracomunitarie",
  "N3.3": "Non imponibili - cessioni San Marino",
  "N3.4": "Non imponibili - trattati/accordi internazionali",
  "N3.5": "Non imponibili - dichiarazioni intento",
  "N3.6": "Non imponibili - altri servizi non soggetti",
  N4: "Esenti",
  N5: "Regime del margine / IVA non esposta",
  N6: "Inversione contabile (reverse charge)",
  "N6.1": "Reverse charge - cessione rottami",
  "N6.2": "Reverse charge - oro e argento",
  "N6.3": "Reverse charge - subappalto edilizia",
  "N6.4": "Reverse charge - cessione fabbricati",
  "N6.5": "Reverse charge - cellulari",
  "N6.6": "Reverse charge - componenti elettronici",
  "N6.7": "Reverse charge - prestazioni comparto edile",
  "N6.8": "Reverse charge - operazioni settore energetico",
  "N6.9": "Reverse charge - altri casi",
  N7: "IVA assolta in altro stato UE",
} as const;

interface AliquotaIva {
  id: string;
  aliquota: number;
  natura?: string;
  descrizione: string;
  predefinita?: boolean;
}

interface ContoCorrente {
  id: string;
  iban: string;
  bic_swift?: string;
  nome_banca: string;
  intestatario: string;
  predefinito: boolean;
}

const DEFAULT_ALIQUOTE: AliquotaIva[] = [
  { id: "1", aliquota: 22, descrizione: "IVA ordinaria 22%", predefinita: true },
  { id: "2", aliquota: 10, descrizione: "IVA ridotta 10%" },
  { id: "3", aliquota: 4, descrizione: "IVA super-ridotta 4%" },
  { id: "4", aliquota: 5, descrizione: "IVA ridotta 5%" },
  { id: "5", aliquota: 0, natura: "N4", descrizione: "Esente art. 10" },
  { id: "6", aliquota: 0, natura: "N2.2", descrizione: "Non soggetta" },
  { id: "7", aliquota: 0, natura: "N3.5", descrizione: "Non imponibile - lett. intento" },
  { id: "8", aliquota: 0, natura: "N6.3", descrizione: "Reverse charge - subappalto edilizia" },
];

export default function ImpostazioniFatturazione() {
  const isMobile = useIsMobile();
  const { data: azienda, isLoading } = useAnagraficaAzienda();
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  // ?sezione=pdf apre direttamente una scheda (es. «Personalizza lo stile delle tue fatture»).
  const [paramsUrl] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => paramsUrl.get("sezione") || "azienda");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // M8 — Export Contabile
  const [isExportingContabile, setIsExportingContabile] = useState(false);
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");
  const [exportFormat, setExportFormat] = useState("csv");

  // Local state for managed lists
  const [aliquote, setAliquote] = useState<AliquotaIva[]>(DEFAULT_ALIQUOTE);
  const [showNewAliquota, setShowNewAliquota] = useState(false);
  const [newAliquota, setNewAliquota] = useState<Partial<AliquotaIva>>({ aliquota: 0, descrizione: "" });

  // Conti correnti
  const [conti, setConti] = useState<ContoCorrente[]>([]);
  const [showNewConto, setShowNewConto] = useState(false);
  const [newConto, setNewConto] = useState<Partial<ContoCorrente>>({});

  // ─── Onboarding Fatturazione Elettronica (registrazione cedente openapi) ──
  const companyId = effectiveCompany?.id;
  const { data: feConfig, isLoading: feLoading } = useQuery({
    queryKey: ["sdi-cedente-config", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sdi_cedente_config" as never)
        .select("stato, delega_stato, fiscal_id, last_error, registered_at, codice_destinatario, ricezione_openapi, ricevute_controllate_at, ricevute_ultimo_errore")
        .eq("company_id", companyId as string)
        .maybeSingle();
      if (error) throw error;
      return data as {
        stato?: string; delega_stato?: string; fiscal_id?: string;
        last_error?: string | null; registered_at?: string | null; codice_destinatario?: string | null;
        ricezione_openapi?: string | null; ricevute_controllate_at?: string | null; ricevute_ultimo_errore?: string | null;
      } | null;
    },
  });
  // Fatture dei fornitori arrivate da openapi: le importa openapi-fatture-ricevute
  // (ogni ora, e subito quando openapi avvisa). Qui solo il conteggio.
  const feRegistrata = feConfig?.stato === "registrato" || feConfig?.stato === "attivo";
  const { data: ricevuteOpenapi } = useQuery({
    queryKey: ["fatture-ricevute-openapi", companyId],
    enabled: !!companyId && feRegistrata,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("fatture_ricevute" as never)
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId as string)
        .not("openapi_id", "is", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const quante = (n: number, uno: string, piu: string) => `${n} ${n === 1 ? uno : piu}`;
  const controllaRicevuteMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("openapi-fatture-ricevute", { body: { company_id: companyId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { ok?: boolean; importate?: number; fallite?: number; appena_controllato?: boolean; motivo?: string; errore?: string };
    },
    onSuccess: (data) => {
      if (data?.motivo === "token_mancante") toast.error("Il collegamento con openapi non è configurato: avvisa l'assistenza.");
      else if (data?.appena_controllato) toast.info("Controllato meno di un minuto fa: riprova tra poco.");
      else if (data?.fallite) toast.warning(`${quante(data.importate ?? 0, "fattura nuova", "fatture nuove")}, ${quante(data.fallite, "non importata", "non importate")}: il dettaglio è qui sotto.`);
      else if (data?.importate) toast.success(`${quante(data.importate, "fattura nuova", "fatture nuove")} in Fatture ricevute`);
      else toast.success("Nessuna fattura nuova dai fornitori");
      queryClient.invalidateQueries({ queryKey: ["sdi-cedente-config", companyId] });
      queryClient.invalidateQueries({ queryKey: ["fatture-ricevute-openapi", companyId] });
      queryClient.invalidateQueries({ queryKey: ["fatture-ricevute"] });
    },
    onError: (e: Error) => toast.error(e?.message || "Controllo non riuscito"),
  });
  const onboardMutation = useMutation({
    mutationFn: async () => {
      // Con Edilizia in Cloud il canale è uno solo (01/10/2026): attivare vuol dire
      // passare a openapi, e il codice destinatario dell'azienda diventa quello del
      // nostro canale di ricezione (serve anche nell'XML delle autofatture, dove il
      // destinatario è l'azienda stessa).
      const { error: canaleErr } = await supabase
        .from("anagrafica_azienda" as never)
        .update({ sdi_provider: CANALE_SDI, codice_sdi: CODICE_DESTINATARIO_EIC } as never)
        .eq("company_id", companyId as string);
      if (canaleErr) throw canaleErr;
      const { data, error } = await supabase.functions.invoke("sdi-onboarding", { body: { company_id: companyId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { stato?: string; next_step?: string };
    },
    onSuccess: (data) => {
      toast.success(data?.stato === "registrato" ? "Invio allo SDI attivo" : "Attivazione eseguita");
      queryClient.invalidateQueries({ queryKey: ["sdi-cedente-config", companyId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.anagraficaAzienda.detail(companyId) });
    },
    onError: (e: any) => toast.error(e?.message || "Errore durante l'attivazione"),
  });

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const current: Record<string, any> = { ...azienda, ...form };
  const updateField = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));
  // Rende il numero come il backend (formatta_numero_documento): stesso template nella scheda.
  const renderNumero = (formato: string | null | undefined, prefisso: string, n: number, anno: number): string => {
    const tpl = formato && String(formato).trim() ? String(formato) : "{prefisso}-{yyyy}-{nnnn}";
    return tpl.replaceAll("{prefisso}", prefisso).replaceAll("{yyyy}", String(anno)).replaceAll("{yy}", String(anno).slice(-2)).replaceAll("{nnnn}", String(n).padStart(4, "0")).replaceAll("{n}", String(n));
  };

  // Initialize conti from azienda data
  if (conti.length === 0 && azienda?.iban_principale) {
    setConti([{
      id: "main",
      iban: azienda.iban_principale ?? "",
      bic_swift: azienda.bic_swift ?? "",
      nome_banca: azienda.nome_banca ?? "",
      intestatario: azienda.intestatario_conto ?? "",
      predefinito: true,
    }]);
  }

  const handleSave = async () => {
    if (!azienda?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("anagrafica_azienda" as never)
        .update({ ...form, updated_at: new Date().toISOString() } as never)
        .eq("id", azienda.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: queryKeys.anagraficaAzienda.all });
      setForm({});
      toast.success("Impostazioni salvate");
    } catch (err: any) { toast.error("Salvataggio non riuscito", { description: err.message }); }
    finally { setSaving(false); }
  };

  const handleLogoUpload = async (file: File) => {
    if (!effectiveCompany?.id) return;
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
      // Bucket "company-logos": e' l'unico bucket loghi che esiste davvero ed e'
      // pubblico, quindi l'URL regge nel PDF fattura (generate-native-pdf lo
      // incorpora come <img src>). La sua RLS ammette la scrittura solo se la
      // PRIMA cartella e' il company_id: percorso "logos/<id>/..." verrebbe
      // rifiutato. Sottocartella dedicata per non finire sotto la pulizia che
      // LogoUploader fa sui file in radice quando cambia il logo aziendale.
      const path = `${effectiveCompany.id}/fatturazione/logo.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("company-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("company-logos").getPublicUrl(path);
      const logoUrl = urlData.publicUrl + "?t=" + Date.now();
      updateField("logo_url", logoUrl);
      toast.success("Logo caricato");
    } catch (err: any) {
      toast.error("Errore upload logo: " + err.message);
    } finally {
      setUploadingLogo(false);
    }
  };

  const isDirty = Object.keys(form).length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Impostazioni Fatturazione</h1>
          <p className="text-muted-foreground text-sm">Configura il modulo di fatturazione nativa — dati aziendali, personalizzazione, pagamenti e aliquote.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={saving || !isDirty} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salva modifiche
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 w-full justify-start bg-muted/50">
          <TabsTrigger value="azienda" className="gap-1.5 text-xs"><Building2 className="h-3.5 w-3.5" />Azienda</TabsTrigger>
          <TabsTrigger value="fiscale" className="gap-1.5 text-xs"><Receipt className="h-3.5 w-3.5" />Dati Fiscali</TabsTrigger>
          <TabsTrigger value="elettronica" className="gap-1.5 text-xs"><Globe className="h-3.5 w-3.5" />Fatt. Elettronica</TabsTrigger>
          <TabsTrigger value="pdf" className="gap-1.5 text-xs"><Palette className="h-3.5 w-3.5" />Template PDF</TabsTrigger>
          <TabsTrigger value="pagamenti" className="gap-1.5 text-xs"><CreditCard className="h-3.5 w-3.5" />Pagamenti</TabsTrigger>
          <TabsTrigger value="aliquote" className="gap-1.5 text-xs"><Percent className="h-3.5 w-3.5" />Aliquote IVA</TabsTrigger>
          <TabsTrigger value="numeratori" className="gap-1.5 text-xs"><FileText className="h-3.5 w-3.5" />Numeratori</TabsTrigger>
          <TabsTrigger value="avanzate" className="gap-1.5 text-xs"><Settings2 className="h-3.5 w-3.5" />Avanzate</TabsTrigger>
          {/* Niente export su telefono: qui si tirano fuori i documenti
              fiscali per il commercialista, è lavoro da scrivania. */}
          {!isMobile && (
            <TabsTrigger value="export-contabile" className="gap-1.5 text-xs"><Download className="h-3.5 w-3.5" />Export</TabsTrigger>
          )}
        </TabsList>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB: AZIENDA                                          */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="azienda" className="space-y-4 mt-4">
          {/* Logo & Identity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Logo e Identità</CardTitle>
              <CardDescription>Il logo apparirà nelle fatture, preventivi, DDT e altri documenti.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-6">
                <div className="relative group">
                  <div className="h-24 w-24 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center bg-muted/30 overflow-hidden">
                    {current.logo_url ? (
                      <img loading="lazy" src={current.logo_url} alt="Logo" className="h-full w-full object-contain p-1" />
                    ) : (
                      <Upload className="h-8 w-8 text-muted-foreground/50" />
                    )}
                  </div>
                  {uploadingLogo && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-lg">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  )}
                </div>
                <div className="space-y-2 flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])}
                  />
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()} disabled={uploadingLogo}>
                    <Upload className="h-3.5 w-3.5" />
                    {current.logo_url ? "Cambia logo" : "Carica logo"}
                  </Button>
                  {current.logo_url && (
                    <Button variant="ghost" size="sm" className="gap-1 text-destructive hover:text-destructive/80 ml-2" onClick={() => updateField("logo_url", null)}>
                      <Trash2 className="h-3.5 w-3.5" />
                      Rimuovi
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">PNG, JPG o SVG. Max 2 MB.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Dati Aziendali */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dati Aziendali</CardTitle>
              <CardDescription>Informazioni anagrafiche utilizzate nei documenti fiscali e nella fatturazione elettronica.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2"><Label>Ragione Sociale / Denominazione</Label><Input value={current.ragione_sociale ?? ""} onChange={(e) => updateField("ragione_sociale", e.target.value)} placeholder="Es. Edilizia Rossi S.r.l." /></div>
              <div className="space-y-2"><Label>Partita IVA</Label><Input value={current.partita_iva ?? ""} onChange={(e) => updateField("partita_iva", e.target.value)} className="font-mono" placeholder="12345678901" maxLength={11} /></div>
              <div className="space-y-2"><Label>Codice Fiscale</Label><Input value={current.codice_fiscale ?? ""} onChange={(e) => updateField("codice_fiscale", e.target.value)} className="font-mono uppercase" placeholder="RSSMRA80A01H501U" /></div>
              <div className="space-y-2"><Label>Forma Giuridica</Label>
                <Select value={current.forma_giuridica ?? ""} onValueChange={(v) => updateField("forma_giuridica", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                  <SelectContent>
                    {["SRL", "SRLS", "SPA", "SAS", "SNC", "SS", "Ditta Individuale", "Libero Professionista", "Cooperativa", "Associazione", "Altro"].map((fg) => (
                      <SelectItem key={fg} value={fg}>{fg}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>PEC</Label><Input value={current.pec ?? ""} onChange={(e) => updateField("pec", e.target.value)} type="email" placeholder="azienda@pec.it" /></div>
              <div className="space-y-2"><Label>Email</Label><Input value={current.email ?? ""} onChange={(e) => updateField("email", e.target.value)} type="email" placeholder="info@azienda.it" /></div>
              <div className="space-y-2"><Label>Telefono</Label><Input value={current.telefono ?? ""} onChange={(e) => updateField("telefono", e.target.value)} placeholder="+39 02 1234567" /></div>
              <div className="space-y-2"><Label>Sito Web</Label><Input value={current.sito_web ?? ""} onChange={(e) => updateField("sito_web", e.target.value)} placeholder="https://www.azienda.it" /></div>
            </CardContent>
          </Card>

          {/* Indirizzo */}
          <Card>
            <CardHeader><CardTitle className="text-base">Sede Legale</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2"><Label>Indirizzo</Label><Input value={current.indirizzo_via ?? ""} onChange={(e) => updateField("indirizzo_via", e.target.value)} placeholder="Via Roma" /></div>
              <div className="space-y-2"><Label>N. Civico</Label><Input value={current.indirizzo_numero_civico ?? ""} onChange={(e) => updateField("indirizzo_numero_civico", e.target.value)} placeholder="1" /></div>
              <div className="space-y-2"><Label>CAP</Label><Input value={current.indirizzo_cap ?? ""} onChange={(e) => updateField("indirizzo_cap", e.target.value)} placeholder="00100" maxLength={5} /></div>
              <div className="space-y-2"><Label>Comune</Label><Input value={current.indirizzo_comune ?? ""} onChange={(e) => updateField("indirizzo_comune", e.target.value)} placeholder="Roma" /></div>
              <div className="space-y-2"><Label>Provincia</Label><Input value={current.indirizzo_provincia ?? ""} onChange={(e) => updateField("indirizzo_provincia", e.target.value)} maxLength={2} className="uppercase" placeholder="RM" /></div>
              <div className="space-y-2"><Label>Nazione</Label><Input value={current.indirizzo_nazione ?? "IT"} onChange={(e) => updateField("indirizzo_nazione", e.target.value)} maxLength={2} className="uppercase" placeholder="IT" /></div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB: DATI FISCALI                                     */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="fiscale" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Regime Fiscale</CardTitle>
              <CardDescription>Il regime fiscale determina gli obblighi IVA e le note obbligatorie in fattura.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Regime Fiscale</Label>
                <Select value={current.regime_fiscale ?? "RF01"} onValueChange={(v) => updateField("regime_fiscale", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(REGIMI_FISCALI).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{k} — {v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {current.regime_fiscale === "RF19" && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-800 dark:text-amber-300">Regime Forfettario</p>
                    <p className="text-amber-700 dark:text-amber-400 text-xs mt-0.5">Le fatture non avranno addebito IVA. Verrà inserita automaticamente la dicitura obbligatoria: "Operazione effettuata ai sensi dell'art.1 commi da 54 a 89 della Legge n. 190/2014 — Regime forfettario".</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ─── Registro imprese (art. 2250 c.c., 24/09/2026) ─── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Registro imprese</CardTitle>
              <CardDescription>
                Per le società questi dati vanno in ogni fattura (art. 2250 del codice civile). Li trovi nella visura camerale.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Ufficio REA (provincia)</Label>
                  <Input
                    value={current.rea_ufficio ?? ""}
                    onChange={(e) => updateField("rea_ufficio", e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) || null)}
                    placeholder={current.indirizzo_provincia || "PN"}
                    className="font-mono uppercase"
                    maxLength={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Numero REA</Label>
                  <Input
                    value={current.codice_rea ?? ""}
                    onChange={(e) => updateField("codice_rea", e.target.value.trim() || null)}
                    placeholder="123456"
                    className="font-mono"
                  />
                </div>
                {eSocietaDiCapitali(current.forma_giuridica) && (
                  <div className="space-y-2">
                    <Label>Capitale sociale versato (€)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={current.capitale_sociale ?? ""}
                      onChange={(e) => updateField("capitale_sociale", e.target.value === "" ? null : parseFloat(e.target.value))}
                      placeholder="10000"
                    />
                  </div>
                )}
              </div>
              {eSocieta(current.forma_giuridica) && (
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Società in liquidazione</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">In fattura esce «in liquidazione» (LS) invece di «non in liquidazione» (LN).</p>
                  </div>
                  <Switch
                    checked={current.stato_liquidazione === "LS"}
                    onCheckedChange={(v) => updateField("stato_liquidazione", v ? "LS" : "LN")}
                  />
                </div>
              )}
              {datiReaMancanti(current).length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Senza questi dati le fatture della tua società non partono allo SDI: la legge li chiede su ogni fattura.</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ritenuta d'Acconto</CardTitle>
              <CardDescription>Per professionisti e agenti di commercio. Verrà applicata automaticamente in fattura se attivata.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Applica ritenuta d'acconto</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Attiva per liberi professionisti e agenti</p>
                </div>
                <Switch checked={current.ritenuta_acconto_default ?? false} onCheckedChange={(v) => updateField("ritenuta_acconto_default", v)} />
              </div>
              {current.ritenuta_acconto_default && (
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-2">
                    <Label>Tipo Ritenuta</Label>
                    <Select value={current.ritenuta_tipo_default ?? "RT01"} onValueChange={(v) => updateField("ritenuta_tipo_default", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="RT01">RT01 — Persone fisiche</SelectItem>
                        <SelectItem value="RT02">RT02 — Persone giuridiche</SelectItem>
                        <SelectItem value="RT03">RT03 — Contributo INPS</SelectItem>
                        <SelectItem value="RT04">RT04 — Contributo ENASARCO</SelectItem>
                        <SelectItem value="RT05">RT05 — Contributo ENPAM</SelectItem>
                        <SelectItem value="RT06">RT06 — Altro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Aliquota Ritenuta (%)</Label>
                    <Input type="number" min={0} max={100} value={current.ritenuta_aliquota_default ?? 20} onChange={(e) => updateField("ritenuta_aliquota_default", parseFloat(e.target.value))} />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label>Causale Pagamento</Label>
                    <Select value={current.ritenuta_causale_default ?? "A"} onValueChange={(v) => updateField("ritenuta_causale_default", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(CAUSALI_RITENUTA).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{k} — {v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cassa Previdenziale</CardTitle>
              <CardDescription>Per professionisti iscritti ad albi (ingegneri, architetti, geometri, avvocati, ecc.)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Applica contributo cassa</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Es. INARCASSA, Cassa Forense</p>
                </div>
                <Switch checked={current.cassa_previdenziale_default ?? false} onCheckedChange={(v) => updateField("cassa_previdenziale_default", v)} />
              </div>
              {current.cassa_previdenziale_default && (
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-2">
                    <Label>Tipo Cassa</Label>
                    <Select value={current.cassa_tipo_default ?? "TC01"} onValueChange={(v) => updateField("cassa_tipo_default", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(TIPI_CASSA_PREVIDENZIALE).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{k} — {v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Aliquota (%)</Label>
                    <Input type="number" min={0} max={100} value={current.cassa_aliquota_default ?? 4} onChange={(e) => updateField("cassa_aliquota_default", parseFloat(e.target.value))} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* DURC */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Regolarità Contributiva (DURC)</CardTitle>
              <CardDescription>Il sistema notifica automaticamente 30 giorni prima della scadenza.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-w-xs">
                <Label>Scadenza DURC</Label>
                <Input
                  type="date"
                  value={current.durc_expiry_date ?? ""}
                  onChange={(e) => updateField("durc_expiry_date", e.target.value || null)}
                />
                <p className="text-xs text-muted-foreground">
                  Inserisci la data di scadenza del DURC per ricevere alert automatici.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB: FATTURAZIONE ELETTRONICA                         */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="elettronica" className="space-y-4 mt-4">
          <FatturaElettronicaPassi
            demo={isDemoCompanyId(companyId)}
            datiPerAttivare={
              String(azienda?.partita_iva ?? "").replace(/\D/g, "").length === 11
              && !!azienda?.ragione_sociale
              && !!(azienda?.pec || azienda?.email)
            }
            anagraficaDaSalvare={["partita_iva", "ragione_sociale", "pec", "email"].some((k) => k in form)}
            canale={feConfig}
            caricamento={feLoading}
            ricevute={ricevuteOpenapi}
            onAttiva={() => onboardMutation.mutate()}
            attivando={onboardMutation.isPending}
            onControllaRicevute={() => controllaRicevuteMutation.mutate()}
            controllando={controllaRicevuteMutation.isPending}
            conservazioneAderitoIl={current.conservazione_ade_aderito_il}
            onConservazioneAderitoIl={(valore) => updateField("conservazione_ade_aderito_il", valore)}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tipologia Documento Predefinita</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo documento di default per nuove fatture</Label>
                <Select value={current.tipo_documento_default ?? "fattura"} onValueChange={(v) => updateField("tipo_documento_default", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fattura">Fattura (TD01)</SelectItem>
                    <SelectItem value="fattura_pa">Fattura PA (FPA12)</SelectItem>
                    <SelectItem value="proforma">Proforma</SelectItem>
                    <SelectItem value="preventivo">Preventivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB: TEMPLATE PDF                                     */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="pdf" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Colori e Stile</CardTitle>
              <CardDescription>Personalizza l'aspetto grafico dei documenti PDF generati.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Colore Primario</Label>
                <div className="flex items-center gap-3">
                  <input type="color" value={current.colore_primario ?? "#0ea5e9"} onChange={(e) => updateField("colore_primario", e.target.value)} className="w-10 h-10 rounded border cursor-pointer" />
                  <div className="flex gap-2">
                    {["#0ea5e9", "#10b981", "#8b5cf6", "#ef4444", "#f59e0b", "#64748b", "#0f172a", "#dc2626"].map((c) => (
                      <button key={c} className={`w-8 h-8 rounded-full border-2 transition-all ${current.colore_primario === c ? "border-foreground scale-110" : "border-transparent hover:border-muted-foreground/30"}`}
                        style={{ backgroundColor: c }}
                        onClick={() => updateField("colore_primario", c)} />
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Font</Label>
                <Select value={current.font_fattura ?? "helvetica"} onValueChange={(v) => updateField("font_fattura", v)}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="helvetica">Helvetica</SelectItem>
                    <SelectItem value="times">Times New Roman</SelectItem>
                    <SelectItem value="courier">Courier</SelectItem>
                    <SelectItem value="inter">Inter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Testi Predefiniti</CardTitle>
              <CardDescription>Note e condizioni che verranno inserite automaticamente nei nuovi documenti.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Note predefinite in fattura</Label>
                <Textarea value={current.note_fattura_default ?? ""} onChange={(e) => updateField("note_fattura_default", e.target.value)} rows={3} placeholder="Es. Operazione soggetta a ritenuta d'acconto..." />
              </div>
              <div className="space-y-2">
                <Label>Condizioni di pagamento predefinite</Label>
                <Input value={current.condizioni_pagamento_default ?? ""} onChange={(e) => updateField("condizioni_pagamento_default", e.target.value)} placeholder="Es. Pagamento a 30 giorni data fattura" />
              </div>
              <div className="space-y-2">
                <Label>Testo introduttivo (intestazione documento)</Label>
                <Textarea value={current.testo_intro_default ?? ""} onChange={(e) => updateField("testo_intro_default", e.target.value)} rows={2} placeholder="Es. Spett.le Cliente, come da accordi le inviamo..." />
              </div>
              <div className="space-y-2">
                <Label>Testo conclusivo (piè di pagina)</Label>
                <Textarea value={current.testo_conclusivo_default ?? ""} onChange={(e) => updateField("testo_conclusivo_default", e.target.value)} rows={2} placeholder="Es. Vi ringraziamo per la fiducia..." />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Anteprima</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg p-6 bg-white dark:bg-gray-950 min-h-[200px]">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {current.logo_url && <img loading="lazy" src={current.logo_url} alt="Logo" className="h-10 object-contain" />}
                    <div>
                      <div className="font-bold text-sm" style={{ color: current.colore_primario ?? "#0ea5e9" }}>{current.ragione_sociale ?? "Nome Azienda"}</div>
                      <div className="text-[10px] text-muted-foreground">P.IVA {current.partita_iva ?? "00000000000"}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold" style={{ color: current.colore_primario ?? "#0ea5e9" }}>FATTURA</div>
                    <div className="text-xs text-muted-foreground">N° FT-2026-0001</div>
                    <div className="text-xs text-muted-foreground">del 29/03/2026</div>
                  </div>
                </div>
                <div className="mt-4 h-1 rounded" style={{ backgroundColor: current.colore_primario ?? "#0ea5e9" }} />
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Destinatario</div>
                    <div className="text-xs font-medium">Cliente Esempio S.r.l.</div>
                    <div className="text-[10px] text-muted-foreground">Via Roma 1, 00100 Roma</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Importo</div>
                    <div className="text-lg font-bold">€ 1.220,00</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB: PAGAMENTI                                        */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="pagamenti" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Metodo di Pagamento Predefinito</CardTitle>
              <CardDescription>Il metodo di pagamento che verrà selezionato automaticamente nei nuovi documenti.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>Metodo Pagamento SDI</Label>
                <Select value={current.metodo_pagamento_default ?? "MP05"} onValueChange={(v) => updateField("metodo_pagamento_default", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(METODI_PAGAMENTO_SDI).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{k} — {v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Conti Correnti</CardTitle>
                  <CardDescription>Gestisci i conti correnti da utilizzare nelle fatture. L'IBAN verrà inserito nel documento.</CardDescription>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowNewConto(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Nuovo conto
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Existing main account */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Conto Principale</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">Predefinito</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">IBAN</Label>
                    <Input value={current.iban_principale ?? ""} onChange={(e) => updateField("iban_principale", e.target.value.toUpperCase())} className="font-mono uppercase text-xs" placeholder="IT60X0542811101000000123456" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">BIC/SWIFT</Label>
                    <Input value={current.bic_swift ?? ""} onChange={(e) => updateField("bic_swift", e.target.value.toUpperCase())} className="font-mono uppercase text-xs" placeholder="BPMOIT22XXX" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome Banca</Label>
                    <Input value={current.nome_banca ?? ""} onChange={(e) => updateField("nome_banca", e.target.value)} className="text-xs" placeholder="Banca Popolare di Milano" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Intestatario</Label>
                    <Input value={current.intestatario_conto ?? ""} onChange={(e) => updateField("intestatario_conto", e.target.value)} className="text-xs" placeholder="Mario Rossi S.r.l." />
                  </div>
                </div>
              </div>

              {/* Add new conto form */}
              {showNewConto && (
                <div className="border rounded-lg p-4 space-y-3 bg-muted/30 animate-in fade-in-50">
                  <div className="font-medium text-sm">Nuovo conto corrente</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">IBAN</Label>
                      <Input value={newConto.iban ?? ""} onChange={(e) => setNewConto({ ...newConto, iban: e.target.value.toUpperCase() })} className="font-mono uppercase text-xs" placeholder="IT60X..." />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">BIC/SWIFT</Label>
                      <Input value={newConto.bic_swift ?? ""} onChange={(e) => setNewConto({ ...newConto, bic_swift: e.target.value.toUpperCase() })} className="font-mono uppercase text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Nome Banca</Label>
                      <Input value={newConto.nome_banca ?? ""} onChange={(e) => setNewConto({ ...newConto, nome_banca: e.target.value })} className="text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Intestatario</Label>
                      <Input value={newConto.intestatario ?? ""} onChange={(e) => setNewConto({ ...newConto, intestatario: e.target.value })} className="text-xs" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="text-xs" onClick={() => {
                      if (!newConto.iban) return;
                      setConti([...conti, { ...newConto as ContoCorrente, id: crypto.randomUUID(), predefinito: false }]);
                      setNewConto({});
                      setShowNewConto(false);
                      toast.success("Conto aggiunto");
                    }}>Aggiungi</Button>
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => { setShowNewConto(false); setNewConto({}); }}>Annulla</Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs">Termini di pagamento predefiniti</Label>
                <Select value={current.termini_pagamento_default ?? "30"} onValueChange={(v) => updateField("termini_pagamento_default", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Pagamento immediato</SelectItem>
                    <SelectItem value="15">15 giorni</SelectItem>
                    <SelectItem value="30">30 giorni data fattura</SelectItem>
                    <SelectItem value="60">60 giorni data fattura</SelectItem>
                    <SelectItem value="90">90 giorni data fattura</SelectItem>
                    <SelectItem value="30fm">30 giorni fine mese</SelectItem>
                    <SelectItem value="60fm">60 giorni fine mese</SelectItem>
                    <SelectItem value="custom">Personalizzato</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB: ALIQUOTE IVA                                     */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="aliquote" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Aliquote IVA</CardTitle>
                  <CardDescription>Gestisci le aliquote IVA disponibili nei documenti. Ogni aliquota allo 0% richiede un codice Natura.</CardDescription>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowNewAliquota(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Nuova aliquota
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {aliquote.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 border rounded-lg px-3 py-2.5 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-center h-8 w-12 rounded bg-primary/10 text-primary font-bold text-sm">
                      {a.aliquota}%
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{a.descrizione}</div>
                      {a.natura && <div className="text-xs text-muted-foreground">{a.natura} — {NATURE_IVA[a.natura as keyof typeof NATURE_IVA] ?? a.natura}</div>}
                    </div>
                    {a.predefinita && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                    {!a.predefinita && (
                      <Button variant="ghost" size="icon" aria-label="Rimuovi aliquota" className="h-9 w-9 md:h-7 md:w-7 text-destructive hover:text-destructive" onClick={() => setAliquote(aliquote.filter((x) => x.id !== a.id))}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {/* New aliquota form */}
              {showNewAliquota && (
                <div className="mt-4 border rounded-lg p-4 space-y-3 bg-muted/30 animate-in fade-in-50">
                  <div className="font-medium text-sm">Nuova aliquota IVA</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Aliquota (%)</Label>
                      <Input type="number" min={0} max={100} value={newAliquota.aliquota ?? 0} onChange={(e) => setNewAliquota({ ...newAliquota, aliquota: parseFloat(e.target.value) })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Natura (se 0%)</Label>
                      <Select value={newAliquota.natura ?? ""} onValueChange={(v) => setNewAliquota({ ...newAliquota, natura: v })}>
                        <SelectTrigger><SelectValue placeholder="Seleziona natura..." /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(NATURE_IVA).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{k} — {v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Descrizione</Label>
                      <Input value={newAliquota.descrizione ?? ""} onChange={(e) => setNewAliquota({ ...newAliquota, descrizione: e.target.value })} placeholder="Es. Esente art. 10" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="text-xs" onClick={() => {
                      if (!newAliquota.descrizione) return;
                      setAliquote([...aliquote, { ...newAliquota as AliquotaIva, id: crypto.randomUUID() }]);
                      setNewAliquota({ aliquota: 0, descrizione: "" });
                      setShowNewAliquota(false);
                    }}>Aggiungi</Button>
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => { setShowNewAliquota(false); setNewAliquota({ aliquota: 0, descrizione: "" }); }}>Annulla</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB: NUMERATORI                                       */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="numeratori" className="space-y-4 mt-4">
          {[
            { tipo: "Fattura", prefix: "prefisso_fattura", numero: "ultimo_numero_fattura", default: "FT", icon: "📄" },
            { tipo: "Nota di Credito", prefix: "prefisso_nc", numero: "ultimo_numero_nc", default: "NC", icon: "📋" },
            { tipo: "DDT", prefix: "prefisso_ddt", numero: "ultimo_numero_ddt", default: "DDT", icon: "🚚" },
          ].map((item) => {
            const anno = current.anno_corrente_fattura ?? new Date().getFullYear();
            const eFattura = item.prefix === "prefisso_fattura";
            const ncSegue = item.prefix === "prefisso_nc" && !!current.nc_serie_condivisa;
            const badge = eFattura || ncSegue
              ? renderNumero(current.formato_numero, current.prefisso_fattura ?? "FT", (current.ultimo_numero_fattura ?? 0) + 1, anno)
              : renderNumero(null, current[item.prefix] ?? item.default, (current[item.numero] ?? 0) + 1, anno);
            return (
            <Card key={item.tipo}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-sm">{item.tipo}</h3>
                  <Badge variant="outline" className="font-mono text-xs">{badge}</Badge>
                </div>
                {ncSegue ? (
                  <p className="text-sm text-muted-foreground">Segue la serie delle Fatture (serie unica): il prossimo numero è <span className="font-mono">{badge}</span>.</p>
                ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Prefisso</Label>
                    <Input
                      value={current[item.prefix] ?? item.default}
                      onChange={(e) => updateField(item.prefix, e.target.value.toUpperCase().slice(0, 5))}
                      maxLength={5}
                      className="font-mono uppercase"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Prossimo numero</Label>
                    <Input
                      type="number"
                      min={1}
                      value={(current[item.numero] ?? 0) + 1}
                      onChange={(e) => updateField(item.numero, Math.max(0, parseInt(e.target.value) - 1))}
                    />
                  </div>
                </div>
                )}
                {eFattura && (
                  <div className="mt-4 space-y-4 border-t pt-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Formato del numero</Label>
                      <Input value={current.formato_numero ?? ""} onChange={(e) => updateField("formato_numero", e.target.value || null)} placeholder="{prefisso}-{yyyy}-{nnnn}" className="font-mono" />
                      <p className="text-[11px] text-muted-foreground">Segnaposto: <span className="font-mono">{"{prefisso} {n} {nnnn} {yyyy} {yy}"}</span>. Vuoto = standard (<span className="font-mono">FT-2026-0001</span>).</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-xs">Serie unica con le Note di Credito</Label>
                        <p className="text-[11px] text-muted-foreground">La nota di credito prende il numero successivo della serie Fatture.</p>
                      </div>
                      <Switch checked={!!current.nc_serie_condivisa} onCheckedChange={(v) => updateField("nc_serie_condivisa", v)} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            );
          })}
          <Card>
            <CardContent className="pt-6 flex items-center justify-between">
              <div>
                <Label>Reset numeratore annuale</Label>
                <p className="text-sm text-muted-foreground">Riparti da 1 ogni anno</p>
              </div>
              <Switch checked={current.reset_numeratore_annuale ?? true} onCheckedChange={(v) => updateField("reset_numeratore_annuale", v)} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB: AVANZATE                                         */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="avanzate" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Opzioni Fiscali Avanzate</CardTitle>
              <CardDescription>Configurazioni avanzate per la gestione IVA e bollo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>IVA per cassa</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Esigibilità IVA differita al momento del pagamento (art. 32-bis DL 83/2012)</p>
                </div>
                <Switch checked={current.iva_per_cassa ?? false} onCheckedChange={(v) => updateField("iva_per_cassa", v)} />
              </div>
              {/* Le fatture escono giuste (esigibilità D e dicitura), ma registro e
                  liquidazione non seguono incassi e pagamenti: meglio dirlo qui
                  che far versare l'IVA nel mese sbagliato (24/09/2026). */}
              {current.iva_per_cassa && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-3 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    Le fatture escono con l'esigibilità differita e la dicitura di legge. Il Registro IVA e la liquidazione di questa app
                    però contano l'IVA delle vendite alla data della fattura e quella degli acquisti alla ricezione, non all'incasso e al
                    pagamento: i versamenti falli calcolare al commercialista. Il regime è ammesso con un volume d'affari fino a 2 milioni di euro.
                  </span>
                </div>
              )}
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Split payment PA</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Applicazione automatica per fatture verso enti pubblici (art. 17-ter DPR 633/72)</p>
                </div>
                <Switch checked={current.split_payment_pa ?? true} onCheckedChange={(v) => updateField("split_payment_pa", v)} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Società con unico socio</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Attiva se sei una S.r.l. unipersonale — genera <strong>SU</strong> invece di <strong>SM</strong> nel campo XML &lt;SocioUnico&gt;</p>
                </div>
                <Switch checked={current.socio_unico ?? false} onCheckedChange={(v) => updateField("socio_unico", v)} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Bollo virtuale automatico</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Applica da solo il bollo di € 2,00 quando la parte della fattura senza IVA (esente, esclusa, non soggetta, forfettario, lettera d'intento) supera € 77,47</p>
                </div>
                <Switch checked={current.bollo_virtuale_auto ?? true} onCheckedChange={(v) => updateField("bollo_virtuale_auto", v)} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Rivalsa INPS 4%</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Addebita il contributo INPS del 4% al cliente (regime forfettario/gestione separata)</p>
                </div>
                <Switch checked={current.rivalsa_inps ?? false} onCheckedChange={(v) => updateField("rivalsa_inps", v)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Moduli Attivi</CardTitle>
              <CardDescription>Attiva o disattiva le sezioni del modulo fatturazione.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: "modulo_fatture", label: "Fatture", desc: "Emissione fatture attive", default: true },
                { key: "modulo_preventivi", label: "Preventivi", desc: "Preventivi con pipeline", default: true },
                { key: "modulo_proforma", label: "Proforma", desc: "Fatture proforma", default: true },
                { key: "modulo_ddt", label: "DDT", desc: "Documenti di trasporto", default: true },
                { key: "modulo_note_credito", label: "Note di Credito", desc: "Emissione note di credito", default: true },
                { key: "modulo_fatture_estere", label: "Fatture Estere", desc: "TD17, TD18, TD19 — autofatture di integrazione", default: false },
                { key: "modulo_cassetto_sdi", label: "Cassetto SDI", desc: "Monitoraggio stato invii SDI", default: true },
                { key: "modulo_scadenzario", label: "Scadenzario", desc: "Gestione scadenze pagamenti", default: true },
              ].map((mod) => (
                <div key={mod.key} className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">{mod.label}</Label>
                    <p className="text-xs text-muted-foreground">{mod.desc}</p>
                  </div>
                  <Switch checked={current[mod.key] ?? mod.default} onCheckedChange={(v) => updateField(mod.key, v)} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* M8 — Export Contabile */}
        <TabsContent value="export-contabile" className="space-y-4 mt-4">
          {isMobile ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                L'export contabile si fa da computer: apri questa pagina da lì
                per scaricare i documenti fiscali del periodo.
              </CardContent>
            </Card>
          ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Download className="h-4 w-4" aria-hidden="true" /> Export Contabile
              </CardTitle>
              <CardDescription>
                Esporta documenti fiscali in formato CSV o Excel per il tuo commercialista o software di contabilità.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Format selector */}
              <div className="space-y-2">
                <Label>Formato di esportazione</Label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { id: "csv", label: "CSV standard", desc: "Excel, LibreOffice, Google Sheets" },
                    // L'id resta quello che il backend conosce; il file è un riepilogo
                    // XML nostro (<ExportContabile>), NON il tracciato FatturaPA: prima
                    // l'etichetta prometteva l'import in Danea, TeamSystem e Zucchetti.
                    { id: "fatturapa_xml", label: "Riepilogo XML", desc: "Elenco dei documenti in XML. I file FatturaPA veri si scaricano dal cassetto SDI" },
                    { id: "prima_nota", label: "Prima nota", desc: "Registro contabile semplificato" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setExportFormat(f.id)}
                      className={`flex-1 min-w-[120px] p-3 rounded-lg border text-left transition-colors ${
                        exportFormat === f.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      <p className={`text-sm font-medium ${exportFormat === f.id ? "text-primary" : ""}`}>{f.label}</p>
                      <p className="text-xs text-muted-foreground">{f.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Date range */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="export-date-from">Dal</Label>
                  <Input
                    id="export-date-from"
                    type="date"
                    value={exportDateFrom}
                    onChange={(e) => setExportDateFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="export-date-to">Al</Label>
                  <Input
                    id="export-date-to"
                    type="date"
                    value={exportDateTo}
                    onChange={(e) => setExportDateTo(e.target.value)}
                  />
                </div>
              </div>

              {/* Quick presets */}
              <div className="flex gap-2 flex-wrap">
                {[
                  {
                    label: "Anno corrente",
                    from: `${new Date().getFullYear()}-01-01`,
                    to: `${new Date().getFullYear()}-12-31`,
                  },
                  {
                    label: "Anno precedente",
                    from: `${new Date().getFullYear() - 1}-01-01`,
                    to: `${new Date().getFullYear() - 1}-12-31`,
                  },
                  {
                    label: "Trimestre corrente",
                    from: (() => {
                      const q = Math.floor(new Date().getMonth() / 3);
                      return `${new Date().getFullYear()}-${String(q * 3 + 1).padStart(2, "0")}-01`;
                    })(),
                    to: new Date().toISOString().split("T")[0],
                  },
                ].map((preset) => (
                  <Button
                    key={preset.label}
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => { setExportDateFrom(preset.from); setExportDateTo(preset.to); }}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>

              <Separator />

              {/* Export button */}
              <Button
                className="w-full gap-2"
                disabled={isExportingContabile || !exportDateFrom || !exportDateTo}
                onClick={async () => {
                  if (!exportDateFrom || !exportDateTo) {
                    toast.error("Seleziona un intervallo di date");
                    return;
                  }
                  setIsExportingContabile(true);
                  try {
                    const { data, error } = await supabase.functions.invoke("export-contabile", {
                      body: {
                        company_id: effectiveCompany?.id,
                        date_from: exportDateFrom,
                        date_to: exportDateTo,
                        format: exportFormat,
                      },
                    });
                    if (error) {
                      const detail = error.context ? await error.context.json?.().catch((): null => null) : null;
                      throw new Error(detail?.error || error.message || "Errore nell'esportazione");
                    }
                    if (!data?.content) throw new Error("Nessun dato da esportare");
                    // Download file
                    const mimeTypes: Record<string, string> = {
                      csv: "text/csv",
                      fatturapa_xml: "application/xml",
                      prima_nota: "text/csv",
                    };
                    const extensions: Record<string, string> = {
                      csv: "csv",
                      fatturapa_xml: "xml",
                      prima_nota: "csv",
                    };
                    const blob = new Blob([data.content], { type: mimeTypes[exportFormat] || "text/plain" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = data.filename || `export-contabile-${exportDateFrom}_${exportDateTo}.${extensions[exportFormat] || "csv"}`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 10000);
                    toast.success("Export completato", { description: `${data.rows || ""} righe esportate` });
                  } catch (err: unknown) {
                    toast.error(err instanceof Error ? err.message : "Errore nell'esportazione");
                  } finally {
                    setIsExportingContabile(false);
                  }
                }}
              >
                {isExportingContabile ? (
                  <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Esportazione in corso...</>
                ) : (
                  <><Download className="h-4 w-4" aria-hidden="true" />Esporta documenti fiscali</>
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Include fatture, note credito e proforma nel periodo selezionato
              </p>
            </CardContent>
          </Card>
          )}
        </TabsContent>

      </Tabs>
    </div>
  );
}
