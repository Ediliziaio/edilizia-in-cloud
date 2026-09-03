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
  Loader2, Save, CheckCircle, AlertTriangle, Info, Upload, Trash2,
  Plus, Building2, Receipt, Palette, CreditCard, Percent,
  Settings2, FileText, Globe, Download
} from "lucide-react";
import { toast } from "sonner";
import { REGIMI_FISCALI, METODI_PAGAMENTO_SDI } from "@/types/fatturazione";
import { SDISetupWizard } from "@/components/sdi-wizard/SDISetupWizard";

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
  const { data: azienda, isLoading } = useAnagraficaAzienda();
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [activeTab, setActiveTab] = useState("azienda");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [sdiWizardOpen, setSdiWizardOpen] = useState(false);

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
        .select("stato, delega_stato, fiscal_id, last_error, registered_at, codice_destinatario")
        .eq("company_id", companyId as string)
        .maybeSingle();
      if (error) throw error;
      return data as {
        stato?: string; delega_stato?: string; fiscal_id?: string;
        last_error?: string | null; registered_at?: string | null; codice_destinatario?: string | null;
      } | null;
    },
  });
  const onboardMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("sdi-onboarding", { body: { company_id: companyId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { stato?: string; next_step?: string };
    },
    onSuccess: (data) => {
      toast.success(data?.stato === "registrato" ? "Azienda registrata sul sistema di invio SDI" : "Onboarding eseguito");
      queryClient.invalidateQueries({ queryKey: ["sdi-cedente-config", companyId] });
    },
    onError: (e: any) => toast.error(e?.message || "Errore durante l'attivazione"),
  });

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const current: Record<string, any> = { ...azienda, ...form };
  const updateField = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));

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
    } catch (err: any) { toast.error(err.message); }
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
          <Button variant="outline" onClick={() => setSdiWizardOpen(true)}>
            Configura SDI
          </Button>
          <Button onClick={handleSave} disabled={saving || !isDirty} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salva modifiche
          </Button>
        </div>
      </div>
      <SDISetupWizard open={sdiWizardOpen} onOpenChange={setSdiWizardOpen} />

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
          <TabsTrigger value="export-contabile" className="gap-1.5 text-xs"><Download className="h-3.5 w-3.5" />Export</TabsTrigger>
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
                        <SelectItem value="A">A — Prestazioni di lavoro autonomo</SelectItem>
                        <SelectItem value="B">B — Utili da contratti di associazione</SelectItem>
                        <SelectItem value="C">C — Utili da contratti di cointeressenza</SelectItem>
                        <SelectItem value="D">D — Utili spettanti ai soci promotori</SelectItem>
                        <SelectItem value="E">E — Levata protesti cambiari</SelectItem>
                        <SelectItem value="L">L — Redditi di lavoro dipendente</SelectItem>
                        <SelectItem value="M">M — Redditi di lavoro autonomo non abituale</SelectItem>
                        <SelectItem value="O">O — Indennità relative a prestazioni sportive</SelectItem>
                        <SelectItem value="Q">Q — Provvigioni ad agente o rappresentante</SelectItem>
                        <SelectItem value="R">R — Agenti con più mandanti</SelectItem>
                        <SelectItem value="S">S — Agente monomandatario</SelectItem>
                        <SelectItem value="V">V — Redditi non abituali diversi</SelectItem>
                        <SelectItem value="Z">Z — Titoli obbligazionari</SelectItem>
                        <SelectItem value="ZO">ZO — Altre tipologie di reddito</SelectItem>
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
                        <SelectItem value="TC01">TC01 — Cassa nazionale previdenza avvocati</SelectItem>
                        <SelectItem value="TC02">TC02 — Cassa previdenza dottori commercialisti</SelectItem>
                        <SelectItem value="TC03">TC03 — Cassa previdenza geometri</SelectItem>
                        <SelectItem value="TC04">TC04 — Cassa naz. previdenza ingegneri e architetti</SelectItem>
                        <SelectItem value="TC05">TC05 — Cassa naz. del notariato</SelectItem>
                        <SelectItem value="TC06">TC06 — Cassa naz. previdenza ragionieri</SelectItem>
                        <SelectItem value="TC07">TC07 — ENASARCO</SelectItem>
                        <SelectItem value="TC08">TC08 — ENPACL</SelectItem>
                        <SelectItem value="TC09">TC09 — ENPAM</SelectItem>
                        <SelectItem value="TC10">TC10 — ENPAF</SelectItem>
                        <SelectItem value="TC11">TC11 — ENPAV</SelectItem>
                        <SelectItem value="TC12">TC12 — ENPAIA</SelectItem>
                        <SelectItem value="TC13">TC13 — Fondo previdenza impiegati agricoli</SelectItem>
                        <SelectItem value="TC14">TC14 — INPGI</SelectItem>
                        <SelectItem value="TC15">TC15 — ONAOSI</SelectItem>
                        <SelectItem value="TC16">TC16 — CASAGIT</SelectItem>
                        <SelectItem value="TC17">TC17 — EPPI</SelectItem>
                        <SelectItem value="TC18">TC18 — EPAP</SelectItem>
                        <SelectItem value="TC19">TC19 — ENPAB</SelectItem>
                        <SelectItem value="TC20">TC20 — ENPAPI</SelectItem>
                        <SelectItem value="TC21">TC21 — ENPAP</SelectItem>
                        <SelectItem value="TC22">TC22 — INPS (gestione separata)</SelectItem>
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
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dati SDI</CardTitle>
              <CardDescription>Codice Destinatario e PEC per la ricezione delle fatture elettroniche.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Codice SDI (Destinatario)</Label>
                <Input value={current.codice_sdi ?? ""} onChange={(e) => updateField("codice_sdi", e.target.value.toUpperCase())} className="font-mono uppercase" maxLength={7} placeholder="0000000" />
                <p className="text-xs text-muted-foreground">7 caratteri per B2B, 6 per PA. "0000000" per privati.</p>
              </div>
              <div className="space-y-2">
                <Label>PEC Fatturazione</Label>
                <Input value={current.pec ?? ""} onChange={(e) => updateField("pec", e.target.value)} type="email" placeholder="fatture@pec.azienda.it" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Provider di Invio SDI</CardTitle>
              <CardDescription>Seleziona il provider per l'invio automatico delle fatture elettroniche al Sistema di Interscambio.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select value={current.sdi_provider ?? "manuale"} onValueChange={(v) => updateField("sdi_provider", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openapi">openapi.it — Fatturazione Elettronica / SDI</SelectItem>
                    <SelectItem value="aruba">Aruba PEC — Fatturazione Elettronica</SelectItem>
                    <SelectItem value="manuale">Manuale — Download XML</SelectItem>
                    {/* InfoCert e Poste nascosti finché non implementati (P2-04) */}
                  </SelectContent>
                </Select>
              </div>

              {current.sdi_provider === "openapi" && (
                <div className="bg-sky-50 dark:bg-sky-950/30 rounded-lg p-4 flex items-start gap-2">
                  <Info className="h-5 w-5 text-sky-600 mt-0.5 shrink-0" />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">openapi.it — invio automatico allo SDI</p>
                    <p className="text-xs mt-0.5">L'XML FatturaPA viene trasmesso, firmato e inoltrato allo SDI tramite openapi.it. Usa il token openapi configurato a livello piattaforma (Lead Scraper → Ambiente openapi.it) — nessuna chiave da inserire qui. In <b>Sandbox</b> le fatture sono di test; passa a <b>Produzione</b> per l'invio reale.</p>
                  </div>
                </div>
              )}

              {current.sdi_provider === "aruba" && (
                <>
                  <div className="space-y-2">
                    <Label>API Key / Credenziali</Label>
                    <Input type="password" value={current.sdi_api_key ?? ""} onChange={(e) => updateField("sdi_api_key", e.target.value)} placeholder="Inserisci la chiave API del provider" />
                  </div>
                  <div className="space-y-2">
                    <Label>Webhook URL (ricezione notifiche)</Label>
                    <div className="flex gap-2">
                      <Input readOnly value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sdi-webhook`} className="font-mono text-xs bg-muted" />
                      <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sdi-webhook`); toast.success("URL copiato"); }}>
                        Copia
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Configura questo URL nel pannello del provider per ricevere le notifiche di consegna (RC, NS, MC, EC, DT).</p>
                  </div>
                </>
              )}

              <div className="flex items-center gap-2">
                {current.sdi_configurato ? (
                  <Badge className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"><CheckCircle className="h-3 w-3" /> Connesso</Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 text-amber-600"><AlertTriangle className="h-3 w-3" /> Non configurato</Badge>
                )}
              </div>

              {current.sdi_provider === "manuale" && (
                <div className="bg-muted/50 rounded-lg p-4 flex items-start gap-2">
                  <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium">Modalità manuale</p>
                    <p className="text-xs mt-0.5">Scarica il file XML e caricalo manualmente sul portale Fatture e Corrispettivi dell'Agenzia delle Entrate.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ─── ATTIVAZIONE FE (registrazione cedente openapi) ─── */}
          {current.sdi_provider === "openapi" && (() => {
            // canOnboard si basa sui dati SALVATI (l'edge sdi-onboarding legge dal DB,
            // non dal form): evita che il pulsante e il backend siano in disaccordo.
            const savedPiva = String(azienda?.partita_iva ?? "").replace(/\D/g, "");
            const canOnboard = savedPiva.length === 11 && !!azienda?.ragione_sociale && !!(azienda?.pec || azienda?.email);
            // Blocca solo se ci sono modifiche NON salvate ai campi anagrafici usati per
            // la registrazione — non per modifiche fatte in altri tab (PDF, pagamenti…).
            const anagraficaDirty = ["partita_iva", "ragione_sociale", "pec", "email"].some((k) => k in form);
            const stato = feConfig?.stato ?? "non_attivo";
            const delega = feConfig?.delega_stato ?? "none";
            const registrato = stato === "registrato" || stato === "attivo";
            const statoBadge =
              stato === "attivo" ? <Badge className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"><CheckCircle className="h-3 w-3" />Attivo</Badge> :
              stato === "registrato" ? <Badge className="gap-1 bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300"><CheckCircle className="h-3 w-3" />Registrato</Badge> :
              stato === "errore" ? <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Errore</Badge> :
              stato === "pending" ? <Badge variant="outline" className="gap-1 text-amber-600"><Loader2 className="h-3 w-3 animate-spin" />In corso</Badge> :
              <Badge variant="outline" className="gap-1 text-muted-foreground"><AlertTriangle className="h-3 w-3" />Non attivo</Badge>;
            const delegaBadge =
              delega === "attiva" ? <Badge className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"><CheckCircle className="h-3 w-3" />Delega attiva</Badge> :
              delega === "richiesta" ? <Badge variant="outline" className="gap-1 text-amber-600">Delega richiesta</Badge> :
              delega === "revocata" ? <Badge variant="destructive" className="gap-1">Delega revocata</Badge> :
              <Badge variant="outline" className="gap-1 text-muted-foreground">Delega da completare</Badge>;
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Attivazione Fatturazione Elettronica</CardTitle>
                  <CardDescription>Registra la tua azienda come cedente sul sistema di invio. Operazione una tantum, necessaria <b>prima del primo invio allo SDI</b>.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {feLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Verifica stato…</div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {statoBadge}
                      {delegaBadge}
                      {feConfig?.registered_at && (
                        <span className="text-xs text-muted-foreground">Registrata il {new Date(feConfig.registered_at).toLocaleDateString("it-IT")}</span>
                      )}
                    </div>
                  )}

                  {feConfig?.last_error && stato === "errore" && (
                    <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
                      {feConfig.last_error}
                    </div>
                  )}

                  {registrato && delega !== "attiva" && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium text-amber-800 dark:text-amber-300">Ultimo passo: delega SDI</p>
                        <p className="text-amber-700 dark:text-amber-400 text-xs mt-0.5">La registrazione è completata. Per attivare invio e ricezione reali serve la <b>delega</b> al sistema di interscambio (codice destinatario / delega Agenzia delle Entrate). Ti guideremo a completarla.</p>
                      </div>
                    </div>
                  )}

                  {!canOnboard && (
                    <div className="bg-muted/50 rounded-lg p-3 flex items-start gap-2 text-sm text-muted-foreground">
                      <Info className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>Completa prima <b>Partita IVA</b> (11 cifre), <b>Ragione Sociale</b> ed <b>Email/PEC</b> nel tab Azienda, poi salva. Sono i dati usati per la registrazione.</span>
                    </div>
                  )}

                  <Button onClick={() => onboardMutation.mutate()} disabled={onboardMutation.isPending || !canOnboard || anagraficaDirty} className="gap-1.5">
                    {onboardMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                    {registrato ? "Ri-verifica registrazione" : "Attiva Fatturazione Elettronica"}
                  </Button>
                  {anagraficaDirty && <p className="text-xs text-amber-600">Hai modificato i dati anagrafici: salvali prima di attivare.</p>}
                </CardContent>
              </Card>
            );
          })()}

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
          ].map((item) => (
            <Card key={item.tipo}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-sm">{item.tipo}</h3>
                  <Badge variant="outline" className="font-mono text-xs">
                    {current[item.prefix] ?? item.default}-{current.anno_corrente ?? new Date().getFullYear()}-{String((current[item.numero] ?? 0) + 1).padStart(4, "0")}
                  </Badge>
                </div>
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
              </CardContent>
            </Card>
          ))}
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
                  <p className="text-xs text-muted-foreground mt-0.5">Applica automaticamente € 2,00 per documenti esenti IVA sopra € 77,47</p>
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
                    { id: "fatturapa_xml", label: "FatturaPA XML", desc: "Adatto a Danea, Teamsystem, Zucchetti" },
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
        </TabsContent>

      </Tabs>
    </div>
  );
}
