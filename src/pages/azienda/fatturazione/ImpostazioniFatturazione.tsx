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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Loader2, Save, AlertTriangle, Upload, Trash2,
  Building2, Receipt, Palette, CreditCard,
  Settings2, FileText, Globe, Download
} from "lucide-react";
import { toast } from "sonner";
import { REGIMI_FISCALI, METODI_PAGAMENTO_SDI } from "@/types/fatturazione";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import {
  campiMancantiPerCreare, campiProvvisori, datiBastanoPerAttivare, messaggioErroreSalvataggio,
  schedaDaMostrare, schedaDalProfilo, type ProfiloAzienda,
} from "@/lib/fatturazione/schedaAzienda";
import { FatturaElettronicaPassi } from "@/components/fatturazione/FatturaElettronicaPassi";
import { CANALE_SDI, CODICE_DESTINATARIO_EIC } from "@/lib/fatturazione/canaleSdi";
import { isDemoCompanyId } from "@/lib/constants/demoCompany";
import { datiReaMancanti, eSocieta, eSocietaDiCapitali } from "../../../../supabase/functions/_shared/datiSocietari";

import { useSearchParams } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
/** Le schede della pagina: l'indirizzo («?sezione=pdf») ne apre una, anche a pagina già aperta. */
const SEZIONI = ["azienda", "fiscale", "elettronica", "pdf", "pagamenti", "numeratori", "avanzate", "export-contabile"];
const sezioneValida = (s: string | null): string => (s && SEZIONI.includes(s) ? s : "azienda");

/** Il logo delle fatture pesa al massimo questo. */
const LOGO_MAX_BYTE = 2 * 1024 * 1024;

export default function ImpostazioniFatturazione() {
  const isMobile = useIsMobile();
  const { data: azienda, isLoading, isError } = useAnagraficaAzienda();
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  // La scheda aperta sta nell'indirizzo («?sezione=pdf»): la ricerca delle impostazioni e i rimandi dagli altri
  // schermi ci portano anche a pagina già aperta, e ricaricando si resta dove si era.
  const [paramsUrl, setParamsUrl] = useSearchParams();
  const activeTab = sezioneValida(paramsUrl.get("sezione"));
  const setActiveTab = (valore: string) => {
    const prossimi = new URLSearchParams(paramsUrl);
    prossimi.set("sezione", valore);
    setParamsUrl(prossimi, { replace: true });
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  // Modifiche non salvate: chiede conferma uscendo dalla pagina (come Prezzo e margini).
  const isDirty = Object.keys(form).length > 0;
  useSettingsDraftGuard(isDirty);

  // M8 — Export Contabile
  const [isExportingContabile, setIsExportingContabile] = useState(false);
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");
  const [exportFormat, setExportFormat] = useState("csv");

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

  // Senza la scheda dell'azienda (si crea con la prima fattura o con il primo «Salva» qui) la pagina parte dai dati
  // del Profilo aziendale. I segnaposto che la prima fattura scrive dove il database vuole qualcosa («Da configurare»,
  // 00000000000) si mostrano come campi vuoti da compilare: non sono dati dell'azienda.
  const senzaScheda = !isError && !azienda?.id;
  const profilo = (effectiveCompany ?? null) as ProfiloAzienda | null;
  const provvisori = campiProvvisori(azienda as unknown as Record<string, unknown> | null | undefined);
  const current: Record<string, any> = { ...(azienda?.id ? schedaDaMostrare(azienda as unknown as Record<string, unknown>) : schedaDalProfilo(profilo)), ...form };
  const updateField = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));
  // Rende il numero come il backend (formatta_numero_documento): stesso template nella scheda.
  const renderNumero = (formato: string | null | undefined, prefisso: string, n: number, anno: number): string => {
    const tpl = formato && String(formato).trim() ? String(formato) : "{prefisso}-{yyyy}-{nnnn}";
    return tpl.replaceAll("{prefisso}", prefisso).replaceAll("{yyyy}", String(anno)).replaceAll("{yy}", String(anno).slice(-2)).replaceAll("{nnnn}", String(n).padStart(4, "0")).replaceAll("{n}", String(n));
  };

  // Il numero dell'anteprima è quello vero: prefisso, formato e prossimo numero della Numerazione.
  const numeroDiProva = renderNumero(
    current.formato_numero,
    current.prefisso_fattura ?? "FT",
    (current.ultimo_numero_fattura ?? 0) + 1,
    current.anno_corrente_fattura ?? new Date().getFullYear(),
  );

  const handleSave = async () => {
    if (isError) return;
    // Testo pulito: l'IBAN incollato dall'home banking porta spazi e tabulazioni, e il nome
    // della banca uno spazio in fondo (Renova: «IT39…6098<tab>», «BANCA DELLA MARCA »).
    const pulito: Record<string, unknown> = { ...form };
    if (typeof pulito.iban_principale === "string") pulito.iban_principale = pulito.iban_principale.replace(/\s+/g, "").toUpperCase() || null;
    for (const k of ["nome_banca", "intestatario_conto", "bic_swift"]) {
      if (typeof pulito[k] === "string") pulito[k] = (pulito[k] as string).trim() || null;
    }
    const iban = pulito.iban_principale;
    if (typeof iban === "string" && !/^IT\d{2}[A-Z]\d{10}[A-Z0-9]{12}$/.test(iban)) {
      toast.error("IBAN non valido", { description: "Un IBAN italiano ha 27 caratteri: IT, 2 cifre, una lettera e 22 tra cifre e lettere." });
      return;
    }

    // Senza la scheda si crea qui, mai in silenzio: se manca qualcosa che il database vuole si dice cosa e non si
    // crea niente.
    if (senzaScheda) {
      const dati: Record<string, unknown> = { ...schedaDalProfilo(profilo), ...pulito };
      const mancanti = campiMancantiPerCreare(dati);
      if (mancanti.length > 0) {
        toast.error("La scheda dell'azienda non si può ancora creare", {
          description: `Mancano: ${mancanti.join(", ")}. Completali e premi «Crea la scheda e salva».`,
        });
        return;
      }
      setSaving(true);
      try {
        const { error } = await supabase
          .from("anagrafica_azienda" as never)
          .insert({ company_id: companyId, ...dati } as never);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: queryKeys.anagraficaAzienda.all });
        setForm({});
        toast.success("Scheda dell'azienda creata e salvata");
      } catch (err) {
        toast.error("Salvataggio non riuscito", { description: messaggioErroreSalvataggio(err) });
      } finally {
        setSaving(false);
      }
      return;
    }

    setSaving(true);
    try {
      // `.select()` restituisce le righe aggiornate: se non ce n'è nessuna la modifica non è stata salvata e lo si dice.
      const { data, error } = await supabase
        .from("anagrafica_azienda" as never)
        .update({ ...pulito, updated_at: new Date().toISOString() } as never)
        .eq("id", azienda!.id)
        .select("id");
      if (error) throw error;
      if (!(data as unknown[] | null)?.length) {
        toast.error("Non ho salvato niente", { description: "Il database non ha accettato la modifica. Riprova; se continua, scrivi all'assistenza." });
        return;
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.anagraficaAzienda.all });
      setForm({});
      toast.success("Impostazioni salvate");
    } catch (err) {
      toast.error("Salvataggio non riuscito", { description: messaggioErroreSalvataggio(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    if (!effectiveCompany?.id) return;
    if (file.size > LOGO_MAX_BYTE) {
      toast.error("Il logo supera i 2 MB: scegline uno più leggero.");
      return;
    }
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
    } catch {
      toast.error("Non sono riuscito a caricare il logo. Riprova.");
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Il titolo lo mette la pagina (Fatturazione): qui solo il pulsante, a destra, e gli avvisi sullo stato della scheda. */}
      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Non riesco a leggere i dati dell'azienda</AlertTitle>
          <AlertDescription>Ricarica la pagina. Se continua, scrivi all'assistenza: finché non si leggono non si può salvare niente.</AlertDescription>
        </Alert>
      )}
      {senzaScheda && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>La scheda dell'azienda non è ancora stata creata</AlertTitle>
          <AlertDescription>
            Ho messo i dati che hai nel Profilo aziendale: controllali, completa quello che manca e premi «Crea la scheda e salva».
            Senza la scheda le fatture non hanno i tuoi dati fiscali.
          </AlertDescription>
        </Alert>
      )}
      {!senzaScheda && provvisori.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Alcuni dati sono ancora provvisori</AlertTitle>
          <AlertDescription>
            La scheda è nata con la prima fattura, con valori provvisori al posto di: {provvisori.join(", ")}. Compila i campi vuoti e salva:
            finché non lo fai, l'invio allo SDI non si può attivare.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || isError || (!isDirty && !senzaScheda)} className="gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {senzaScheda ? "Crea la scheda e salva" : "Salva modifiche"}
        </Button>
      </div>

      {/* Modifiche non salvate: si vedono da qualunque scheda, con il pulsante accanto.
          Fabio (Renova) aveva scritto l'IBAN in Pagamenti e non l'aveva salvato perché il
          pulsante «Salva modifiche» sta in alto e non lo si nota. */}
      {isDirty && (
        <div className="sticky top-2 z-30 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 shadow-sm dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200" role="status">
          <span className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4 shrink-0" /> Hai modifiche non salvate.</span>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salva ora
          </Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 w-full justify-start bg-muted/50">
          <TabsTrigger value="azienda" className="gap-1.5 text-xs"><Building2 className="h-3.5 w-3.5" />Azienda</TabsTrigger>
          <TabsTrigger value="fiscale" className="gap-1.5 text-xs"><Receipt className="h-3.5 w-3.5" />Dati fiscali</TabsTrigger>
          <TabsTrigger value="elettronica" className="gap-1.5 text-xs"><Globe className="h-3.5 w-3.5" />Fattura elettronica</TabsTrigger>
          <TabsTrigger value="pdf" className="gap-1.5 text-xs"><Palette className="h-3.5 w-3.5" />Aspetto</TabsTrigger>
          <TabsTrigger value="pagamenti" className="gap-1.5 text-xs"><CreditCard className="h-3.5 w-3.5" />Conto e pagamenti</TabsTrigger>
          <TabsTrigger value="numeratori" className="gap-1.5 text-xs"><FileText className="h-3.5 w-3.5" />Numerazione</TabsTrigger>
          <TabsTrigger value="avanzate" className="gap-1.5 text-xs"><Settings2 className="h-3.5 w-3.5" />IVA e bollo</TabsTrigger>
          {/* Niente export su telefono: qui si tirano fuori i documenti
              fiscali per il commercialista, è lavoro da scrivania. */}
          {!isMobile && (
            <TabsTrigger value="export-contabile" className="gap-1.5 text-xs"><Download className="h-3.5 w-3.5" />Per il commercialista</TabsTrigger>
          )}
        </TabsList>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB: AZIENDA                                          */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="azienda" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            Questi dati escono sulle fatture che fai ai tuoi clienti. Il Profilo aziendale ha i suoi (preventivi, email, portale
            clienti): cambiare uno non cambia l'altro.
          </p>
          {/* Logo */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Logo</CardTitle>
              <CardDescription>Il logo delle fatture: se non ne metti uno, si usa quello del Profilo aziendale.</CardDescription>
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
                  <p className="text-xs text-muted-foreground">PNG, JPG o SVG, al massimo 2 MB.</p>
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
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="az-ragione-sociale">Ragione Sociale / Denominazione</Label><Input id="az-ragione-sociale" value={current.ragione_sociale ?? ""} onChange={(e) => updateField("ragione_sociale", e.target.value)} placeholder="Es. Edilizia Rossi S.r.l." /></div>
              <div className="space-y-2"><Label htmlFor="az-partita-iva">Partita IVA</Label><Input id="az-partita-iva" value={current.partita_iva ?? ""} onChange={(e) => updateField("partita_iva", e.target.value)} className="font-mono" placeholder="12345678901" maxLength={11} /></div>
              <div className="space-y-2"><Label htmlFor="az-codice-fiscale">Codice Fiscale</Label><Input id="az-codice-fiscale" value={current.codice_fiscale ?? ""} onChange={(e) => updateField("codice_fiscale", e.target.value)} className="font-mono uppercase" placeholder="RSSMRA80A01H501U" /></div>
              <div className="space-y-2"><Label htmlFor="az-forma-giuridica">Forma Giuridica</Label>
                <Select value={current.forma_giuridica ?? ""} onValueChange={(v) => updateField("forma_giuridica", v)}>
                  <SelectTrigger id="az-forma-giuridica"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                  <SelectContent>
                    {["SRL", "SRLS", "SPA", "SAS", "SNC", "SS", "Ditta Individuale", "Libero Professionista", "Cooperativa", "Associazione", "Altro"].map((fg) => (
                      <SelectItem key={fg} value={fg}>{fg}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label htmlFor="az-pec">PEC</Label><Input id="az-pec" value={current.pec ?? ""} onChange={(e) => updateField("pec", e.target.value)} type="email" placeholder="azienda@pec.it" /></div>
              <div className="space-y-2"><Label htmlFor="az-email">Email</Label><Input id="az-email" value={current.email ?? ""} onChange={(e) => updateField("email", e.target.value)} type="email" placeholder="info@azienda.it" /></div>
              <div className="space-y-2"><Label htmlFor="az-telefono">Telefono</Label><Input id="az-telefono" value={current.telefono ?? ""} onChange={(e) => updateField("telefono", e.target.value)} placeholder="+39 02 1234567" /></div>
              <div className="space-y-2"><Label htmlFor="az-sito-web">Sito Web</Label><Input id="az-sito-web" value={current.sito_web ?? ""} onChange={(e) => updateField("sito_web", e.target.value)} placeholder="https://www.azienda.it" /></div>
            </CardContent>
          </Card>

          {/* Indirizzo */}
          <Card>
            <CardHeader><CardTitle className="text-base">Sede Legale</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="az-indirizzo">Indirizzo</Label><Input id="az-indirizzo" value={current.indirizzo_via ?? ""} onChange={(e) => updateField("indirizzo_via", e.target.value)} placeholder="Via Roma" /></div>
              <div className="space-y-2"><Label htmlFor="az-civico">N. Civico</Label><Input id="az-civico" value={current.indirizzo_numero_civico ?? ""} onChange={(e) => updateField("indirizzo_numero_civico", e.target.value)} placeholder="1" /></div>
              <div className="space-y-2"><Label htmlFor="az-cap">CAP</Label><Input id="az-cap" value={current.indirizzo_cap ?? ""} onChange={(e) => updateField("indirizzo_cap", e.target.value)} placeholder="00100" maxLength={5} /></div>
              <div className="space-y-2"><Label htmlFor="az-comune">Comune</Label><Input id="az-comune" value={current.indirizzo_comune ?? ""} onChange={(e) => updateField("indirizzo_comune", e.target.value)} placeholder="Roma" /></div>
              <div className="space-y-2"><Label htmlFor="az-provincia">Provincia</Label><Input id="az-provincia" value={current.indirizzo_provincia ?? ""} onChange={(e) => updateField("indirizzo_provincia", e.target.value)} maxLength={2} className="uppercase" placeholder="RM" /></div>
              <div className="space-y-2"><Label htmlFor="az-nazione">Nazione</Label><Input id="az-nazione" value={current.indirizzo_nazione ?? "IT"} onChange={(e) => updateField("indirizzo_nazione", e.target.value)} maxLength={2} className="uppercase" placeholder="IT" /></div>
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
                <Label htmlFor="fisc-regime">Regime Fiscale</Label>
                <Select value={current.regime_fiscale ?? "RF01"} onValueChange={(v) => updateField("regime_fiscale", v)}>
                  <SelectTrigger id="fisc-regime"><SelectValue /></SelectTrigger>
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
                  <Label htmlFor="fisc-rea-ufficio">Ufficio REA (provincia)</Label>
                  <Input
                    id="fisc-rea-ufficio"
                    value={current.rea_ufficio ?? ""}
                    onChange={(e) => updateField("rea_ufficio", e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) || null)}
                    placeholder={current.indirizzo_provincia || "PN"}
                    className="font-mono uppercase"
                    maxLength={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fisc-rea-numero">Numero REA</Label>
                  <Input
                    id="fisc-rea-numero"
                    value={current.codice_rea ?? ""}
                    onChange={(e) => updateField("codice_rea", e.target.value.trim() || null)}
                    placeholder="123456"
                    className="font-mono"
                  />
                </div>
                {eSocietaDiCapitali(current.forma_giuridica) && (
                  <div className="space-y-2">
                    <Label htmlFor="fisc-capitale">Capitale sociale versato (€)</Label>
                    <Input
                      id="fisc-capitale"
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
                    <Label htmlFor="fisc-liquidazione">Società in liquidazione</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">In fattura esce «in liquidazione» (LS) invece di «non in liquidazione» (LN).</p>
                  </div>
                  <Switch
                    id="fisc-liquidazione"
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

          {/* DURC: la data si segna qui; nessun avviso parte da solo. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">DURC</CardTitle>
              <CardDescription>Segna la data di scadenza.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-w-xs">
                <Label htmlFor="durc-scadenza">Scadenza DURC</Label>
                <Input
                  id="durc-scadenza"
                  type="date"
                  value={current.durc_expiry_date ?? ""}
                  onChange={(e) => updateField("durc_expiry_date", e.target.value || null)}
                />
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
            datiPerAttivare={datiBastanoPerAttivare(azienda as unknown as Record<string, unknown> | null | undefined)}
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

        </TabsContent>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB: TEMPLATE PDF                                     */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="pdf" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Colore delle fatture</CardTitle>
              <CardDescription>Il colore dei titoli e delle righe nei PDF delle fatture.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="colore-fattura">Colore</Label>
                <div className="flex items-center gap-3">
                  <input id="colore-fattura" type="color" value={current.colore_primario ?? "#0ea5e9"} onChange={(e) => updateField("colore_primario", e.target.value)} className="w-10 h-10 rounded border cursor-pointer" />
                  <div className="flex gap-2">
                    {["#0ea5e9", "#10b981", "#8b5cf6", "#ef4444", "#f59e0b", "#64748b", "#0f172a", "#dc2626"].map((c) => (
                      <button key={c} type="button" aria-label={`Colore ${c}`} aria-pressed={current.colore_primario === c} className={`w-8 h-8 rounded-full border-2 transition-all ${current.colore_primario === c ? "border-foreground scale-110" : "border-transparent hover:border-muted-foreground/30"}`}
                        style={{ backgroundColor: c }}
                        onClick={() => updateField("colore_primario", c)} />
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Anteprima</CardTitle>
              <CardDescription>Un esempio con i tuoi dati: il numero è il prossimo che uscirà.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg p-6 bg-white dark:bg-gray-950 min-h-[200px]">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {current.logo_url && <img loading="lazy" src={current.logo_url} alt="Logo" className="h-10 object-contain" />}
                    <div>
                      <div className="font-bold text-sm" style={{ color: current.colore_primario ?? "#0ea5e9" }}>{current.ragione_sociale || "Nome azienda"}</div>
                      <div className="text-[10px] text-muted-foreground">P.IVA {current.partita_iva || "—"}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold" style={{ color: current.colore_primario ?? "#0ea5e9" }}>FATTURA</div>
                    <div className="text-xs text-muted-foreground">N° {numeroDiProva}</div>
                    <div className="text-xs text-muted-foreground">del {new Date().toLocaleDateString("it-IT")}</div>
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
              <CardTitle className="text-base">Metodo di pagamento</CardTitle>
              <CardDescription>Quello che si seleziona da solo nelle fatture nuove.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="pag-metodo">Metodo di pagamento (codice SDI)</Label>
                <Select value={current.metodo_pagamento_default ?? "MP05"} onValueChange={(v) => updateField("metodo_pagamento_default", v)}>
                  <SelectTrigger id="pag-metodo"><SelectValue /></SelectTrigger>
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
              <CardTitle className="text-base">Conto corrente</CardTitle>
              <CardDescription>L'IBAN esce sulle fatture, dove si dice come pagare.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="conto-iban" className="text-xs">IBAN</Label>
                  <Input id="conto-iban" value={current.iban_principale ?? ""} onChange={(e) => updateField("iban_principale", e.target.value.replace(/\s+/g, "").toUpperCase())} className="font-mono uppercase text-xs" placeholder="IT60X0542811101000000123456" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="conto-bic" className="text-xs">BIC/SWIFT</Label>
                  <Input id="conto-bic" value={current.bic_swift ?? ""} onChange={(e) => updateField("bic_swift", e.target.value.toUpperCase())} className="font-mono uppercase text-xs" placeholder="BPMOIT22XXX" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="conto-banca" className="text-xs">Nome della banca</Label>
                  <Input id="conto-banca" value={current.nome_banca ?? ""} onChange={(e) => updateField("nome_banca", e.target.value)} className="text-xs" placeholder="Banca Popolare di Milano" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="conto-intestatario" className="text-xs">Intestatario</Label>
                  <Input id="conto-intestatario" value={current.intestatario_conto ?? ""} onChange={(e) => updateField("intestatario_conto", e.target.value)} className="text-xs" placeholder="Mario Rossi S.r.l." />
                </div>
              </div>
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
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB: AVANZATE                                         */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="avanzate" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">IVA, bollo e split payment</CardTitle>
              <CardDescription>Come escono sulle fatture l'IVA e il bollo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="iva-per-cassa">IVA per cassa</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Esigibilità IVA differita al momento del pagamento (art. 32-bis DL 83/2012)</p>
                </div>
                <Switch id="iva-per-cassa" checked={current.iva_per_cassa ?? false} onCheckedChange={(v) => updateField("iva_per_cassa", v)} />
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
                  <Label htmlFor="split-payment">Split payment (fatture alla pubblica amministrazione)</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Si applica da solo alle fatture verso enti pubblici (art. 17-ter DPR 633/72)</p>
                </div>
                <Switch id="split-payment" checked={current.split_payment_pa ?? true} onCheckedChange={(v) => updateField("split_payment_pa", v)} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="socio-unico">Società con unico socio</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Spunta se sei una S.r.l. con un solo socio.</p>
                </div>
                <Switch id="socio-unico" checked={current.socio_unico ?? false} onCheckedChange={(v) => updateField("socio_unico", v)} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="bollo-automatico">Bollo da 2 € automatico</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Applica da solo il bollo di € 2,00 quando la parte della fattura senza IVA (esente, esclusa, non soggetta, forfettario, lettera d'intento) supera € 77,47</p>
                </div>
                <Switch id="bollo-automatico" checked={current.bollo_virtuale_auto ?? true} onCheckedChange={(v) => updateField("bollo_virtuale_auto", v)} />
              </div>
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
