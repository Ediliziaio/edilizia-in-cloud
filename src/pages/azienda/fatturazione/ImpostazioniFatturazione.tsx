import { useState } from "react";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, CheckCircle, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import { REGIMI_FISCALI } from "@/types/fatturazione";

export default function ImpostazioniFatturazione() {
  const { data: azienda, isLoading } = useAnagraficaAzienda();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const current: Record<string, any> = { ...azienda, ...form };
  const updateField = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Impostazioni Fatturazione</h1>
          <p className="text-muted-foreground">Configura il modulo di fatturazione nativa.</p>
        </div>
        <Button onClick={handleSave} disabled={saving || Object.keys(form).length === 0}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
          Salva modifiche
        </Button>
      </div>

      <Tabs defaultValue="azienda">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="azienda">Azienda</TabsTrigger>
          <TabsTrigger value="numeratori">Numeratori</TabsTrigger>
          <TabsTrigger value="template">Template PDF</TabsTrigger>
          <TabsTrigger value="sdi">Integrazioni SDI</TabsTrigger>
          <TabsTrigger value="avanzate">Avanzate</TabsTrigger>
        </TabsList>

        {/* Tab Azienda */}
        <TabsContent value="azienda" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Dati Aziendali</CardTitle><CardDescription>Informazioni utilizzate nei documenti fiscali</CardDescription></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Ragione Sociale</Label><Input value={current.ragione_sociale ?? ""} onChange={(e) => updateField("ragione_sociale", e.target.value)} /></div>
              <div className="space-y-2"><Label>Partita IVA</Label><Input value={current.partita_iva ?? ""} onChange={(e) => updateField("partita_iva", e.target.value)} className="font-mono" /></div>
              <div className="space-y-2"><Label>Codice Fiscale</Label><Input value={current.codice_fiscale ?? ""} onChange={(e) => updateField("codice_fiscale", e.target.value)} className="font-mono" /></div>
              <div className="space-y-2"><Label>Forma Giuridica</Label><Input value={current.forma_giuridica ?? ""} onChange={(e) => updateField("forma_giuridica", e.target.value)} /></div>
              <div className="space-y-2">
                <Label>Regime Fiscale</Label>
                <Select value={current.regime_fiscale ?? "RF01"} onValueChange={(v) => updateField("regime_fiscale", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(REGIMI_FISCALI).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{k} - {v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Codice SDI</Label><Input value={current.codice_sdi ?? ""} onChange={(e) => updateField("codice_sdi", e.target.value)} className="font-mono" /></div>
              <div className="space-y-2"><Label>PEC</Label><Input value={current.pec ?? ""} onChange={(e) => updateField("pec", e.target.value)} type="email" /></div>
              <div className="space-y-2"><Label>Email</Label><Input value={current.email ?? ""} onChange={(e) => updateField("email", e.target.value)} type="email" /></div>
              <div className="space-y-2"><Label>Telefono</Label><Input value={current.telefono ?? ""} onChange={(e) => updateField("telefono", e.target.value)} /></div>
              <div className="space-y-2"><Label>Sito Web</Label><Input value={current.sito_web ?? ""} onChange={(e) => updateField("sito_web", e.target.value)} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Indirizzo</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2"><Label>Via</Label><Input value={current.indirizzo_via ?? ""} onChange={(e) => updateField("indirizzo_via", e.target.value)} /></div>
              <div className="space-y-2"><Label>N. Civico</Label><Input value={current.indirizzo_numero_civico ?? ""} onChange={(e) => updateField("indirizzo_numero_civico", e.target.value)} /></div>
              <div className="space-y-2"><Label>CAP</Label><Input value={current.indirizzo_cap ?? ""} onChange={(e) => updateField("indirizzo_cap", e.target.value)} /></div>
              <div className="space-y-2"><Label>Comune</Label><Input value={current.indirizzo_comune ?? ""} onChange={(e) => updateField("indirizzo_comune", e.target.value)} /></div>
              <div className="space-y-2"><Label>Provincia</Label><Input value={current.indirizzo_provincia ?? ""} onChange={(e) => updateField("indirizzo_provincia", e.target.value)} maxLength={2} className="uppercase" /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Dati Bancari</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2"><Label>IBAN</Label><Input value={current.iban_principale ?? ""} onChange={(e) => updateField("iban_principale", e.target.value)} className="font-mono uppercase" /></div>
              <div className="space-y-2"><Label>BIC/SWIFT</Label><Input value={current.bic_swift ?? ""} onChange={(e) => updateField("bic_swift", e.target.value)} className="font-mono uppercase" /></div>
              <div className="space-y-2"><Label>Nome Banca</Label><Input value={current.nome_banca ?? ""} onChange={(e) => updateField("nome_banca", e.target.value)} /></div>
              <div className="space-y-2"><Label>Intestatario Conto</Label><Input value={current.intestatario_conto ?? ""} onChange={(e) => updateField("intestatario_conto", e.target.value)} /></div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Numeratori */}
        <TabsContent value="numeratori" className="space-y-4">
          {[
            { tipo: "Fattura", prefix: "prefisso_fattura", numero: "ultimo_numero_fattura", default: "FT" },
            { tipo: "Nota di Credito", prefix: "prefisso_nc", numero: "ultimo_numero_nc", default: "NC" },
            { tipo: "DDT", prefix: "prefisso_ddt", numero: "ultimo_numero_ddt", default: "DDT" },
            { tipo: "Preventivo", prefix: "prefisso_preventivo", numero: "ultimo_numero_preventivo", default: "PRV" },
          ].map((item) => (
            <Card key={item.tipo}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">{item.tipo}</h3>
                  <Badge variant="outline" className="font-mono">
                    {current[item.prefix] ?? item.default}-{current.anno_corrente ?? new Date().getFullYear()}-{String((current[item.numero] ?? 0) + 1).padStart(4, "0")}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Prefisso</Label>
                    <Input
                      value={current[item.prefix] ?? item.default}
                      onChange={(e) => updateField(item.prefix, e.target.value.toUpperCase().slice(0, 5))}
                      maxLength={5}
                      className="font-mono uppercase"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Prossimo numero</Label>
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

        {/* Tab Template PDF */}
        <TabsContent value="template" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Personalizzazione PDF</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Colore Primario</Label>
                <div className="flex items-center gap-3">
                  <input type="color" value={current.colore_primario ?? "#0ea5e9"} onChange={(e) => updateField("colore_primario", e.target.value)} className="w-10 h-10 rounded border cursor-pointer" />
                  <div className="flex gap-2">
                    {["#0ea5e9", "#10b981", "#8b5cf6", "#ef4444", "#f59e0b", "#64748b"].map((c) => (
                      <button key={c} className="w-8 h-8 rounded-full border-2" style={{ backgroundColor: c, borderColor: current.colore_primario === c ? "currentColor" : "transparent" }}
                        onClick={() => updateField("colore_primario", c)} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Note predefinite in fattura</Label>
                <Textarea value={current.note_fattura_default ?? ""} onChange={(e) => updateField("note_fattura_default", e.target.value)} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Condizioni di pagamento predefinite</Label>
                <Input value={current.condizioni_pagamento_default ?? ""} onChange={(e) => updateField("condizioni_pagamento_default", e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab SDI */}
        <TabsContent value="sdi" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Provider SDI</CardTitle><CardDescription>Configura il provider per l'invio delle fatture elettroniche</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select value={current.sdi_provider ?? "manuale"} onValueChange={(v) => updateField("sdi_provider", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aruba">Aruba PEC</SelectItem>
                    <SelectItem value="infocert">InfoCert</SelectItem>
                    <SelectItem value="poste">Poste Italiane</SelectItem>
                    <SelectItem value="manuale">Manuale</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {current.sdi_provider !== "manuale" && (
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input type="password" value={current.sdi_api_key ?? ""} onChange={(e) => updateField("sdi_api_key", e.target.value)} />
                </div>
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
                    <p>Scarica il file XML e caricalo manualmente sul portale dell'Agenzia delle Entrate.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Avanzate */}
        <TabsContent value="avanzate" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-6">
              <div className="flex items-center justify-between">
                <div><Label>IVA per cassa</Label><p className="text-sm text-muted-foreground">Esigibilità IVA differita al pagamento</p></div>
                <Switch
                  checked={current.iva_per_cassa ?? false}
                  onCheckedChange={(v) => updateField("iva_per_cassa", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div><Label>Split payment PA</Label><p className="text-sm text-muted-foreground">Applicazione automatica per enti pubblici</p></div>
                <Switch
                  checked={current.split_payment_pa ?? true}
                  onCheckedChange={(v) => updateField("split_payment_pa", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div><Label>Bollo virtuale automatico</Label><p className="text-sm text-muted-foreground">Applica automaticamente per importi sopra soglia (€ 77,47)</p></div>
                <Switch
                  checked={current.bollo_virtuale_auto ?? true}
                  onCheckedChange={(v) => updateField("bollo_virtuale_auto", v)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
