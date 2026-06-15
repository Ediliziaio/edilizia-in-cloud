import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  usePhoneNumbers,
  useCompanyProfiles,
  useSearchAvailableNumbers,
  usePurchaseNumber,
  useReleaseNumber,
  useAssignNumber,
} from "@/hooks/usePhoneNumbers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Phone, Plus, Search, Trash2, MessageSquare, PhoneCall, Info, Loader2, Download, Bot, ArrowRight, Link2, Headphones } from "lucide-react";
import { Link } from "react-router-dom";

type PurchaseStep = "search" | "results" | "confirm";

export default function SettingsPhoneNumbers() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id || null;

  const { data: numbers, isLoading } = usePhoneNumbers(companyId);
  const { data: profiles } = useCompanyProfiles(companyId);
  const { results, isSearching, search, setResults } = useSearchAvailableNumbers();
  const purchaseMutation = usePurchaseNumber(companyId);
  const releaseMutation = useReleaseNumber(companyId);
  const assignMutation = useAssignNumber();
  const queryClient = useQueryClient();

  // Numeri per le chiamate AI (voce) — pool ai_phone_numbers_v2. Gestiti qui in
  // Telefonia; l'assegnazione a un agente avviene in Agenti AI → Telefonia.
  const { data: aiNumbers = [] } = useQuery({
    queryKey: ["ai-phone-numbers-v2", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_phone_numbers_v2" as never)
        .select("id, numero, nome_etichetta, agent_id, elevenlabs_phone_id, attivo")
        .eq("company_id", companyId!)
        .order("creato_il", { ascending: false });
      return (data ?? []) as unknown as { id: string; numero: string; nome_etichetta: string | null; agent_id: string | null; elevenlabs_phone_id: string | null; attivo: boolean }[];
    },
  });

  const norm = (s: string) => (s || "").replace(/\s+/g, "");
  const importTelnyx = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const existing = new Set(aiNumbers.map((n) => norm(n.numero)));
      const found: { numero: string; etichetta: string | null }[] = [];
      const vpn = await supabase.from("virtual_phone_numbers").select("phone_number, friendly_name, is_active").eq("company_id", companyId).eq("is_active", true);
      (vpn.data ?? []).forEach((r: { phone_number?: string | null; friendly_name?: string | null }) => { if (r.phone_number) found.push({ numero: r.phone_number, etichetta: r.friendly_name ?? null }); });
      const sms = await supabase.from("sms_telnyx_numbers").select("numero_e164, numero_display, stato").eq("company_id", companyId).eq("stato", "attivo");
      (sms.data ?? []).forEach((r: { numero_e164?: string | null; numero_display?: string | null }) => { if (r.numero_e164) found.push({ numero: r.numero_e164, etichetta: r.numero_display ?? null }); });
      const seen = new Set<string>();
      const toInsert = found
        .filter((s) => !existing.has(norm(s.numero)))
        .filter((s) => { const k = norm(s.numero); if (seen.has(k)) return false; seen.add(k); return true; })
        .map((s) => ({ company_id: companyId, numero: s.numero, nome_etichetta: s.etichetta, provider: "telnyx", capacita: ["voce", "sms"], attivo: true }));
      if (toInsert.length === 0) return { inserted: 0 };
      const { error } = await supabase.from("ai_phone_numbers_v2" as never).insert(toInsert as never);
      if (error) throw error;
      return { inserted: toInsert.length };
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["ai-phone-numbers-v2"] });
      if (r.inserted > 0) toast.success(`${r.inserted} numero/i Telnyx importato/i`);
      else toast.info("Nessun nuovo numero Telnyx da importare");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Errore import numeri Telnyx"),
  });

  // Consuntivo chiamate (costo per l'azienda; wholesale+margine solo super_admin).
  const { data: voiceConsuntivo } = useQuery({
    queryKey: ["voice-consuntivo", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_voice_consuntivo" as never, { p_company_id: companyId } as never);
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as
        | { chiamate: number; minuti: number; costo_cliente: number; costo_wholesale: number | null; margine: number | null }
        | undefined;
      return row ?? null;
    },
  });

  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [step, setStep] = useState<PurchaseStep>("search");
  const [searchCountry, setSearchCountry] = useState("IT");
  const [searchPrefix, setSearchPrefix] = useState("");
  const [selectedNumber, setSelectedNumber] = useState<any>(null);
  const [purchaseLabel, setPurchaseLabel] = useState("");

  const resetPurchase = () => {
    setStep("search");
    setSearchCountry("IT");
    setSearchPrefix("");
    setSelectedNumber(null);
    setPurchaseLabel("");
    setResults([]);
  };

  const handleSearch = async () => {
    await search({ country_code: searchCountry, prefix: searchPrefix });
    setStep("results");
  };

  const handleConfirmPurchase = async () => {
    if (!selectedNumber) return;
    await purchaseMutation.mutateAsync({
      phone_number: selectedNumber.phone_number,
      monthly_cost: selectedNumber.monthly_cost?.amount ? parseFloat(selectedNumber.monthly_cost.amount) : 0,
      label: purchaseLabel || undefined,
      country_code: searchCountry,
      number_type: selectedNumber.phone_number_type || "local",
      capabilities: {
        sms: selectedNumber.features?.includes("sms") ?? true,
        voice: selectedNumber.features?.includes("voice") ?? false,
      },
    });
    setPurchaseOpen(false);
    resetPurchase();
  };

  const handleAssign = (numberId: string, userId: string | null) => {
    assignMutation.mutate({ id: numberId, assigned_to: userId === "none" ? null : userId });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Phone className="h-6 w-6 text-primary" /> Telefonia
          </h2>
          <p className="text-muted-foreground">
            Sistema telefonico aziendale: gestisci qui i numeri per SMS, chiamate e agenti AI.
          </p>
        </div>
        <Dialog open={purchaseOpen} onOpenChange={(open) => { setPurchaseOpen(open); if (!open) resetPurchase(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Acquista Numero</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {step === "search" && "Cerca Numeri Disponibili"}
                {step === "results" && "Numeri Disponibili"}
                {step === "confirm" && "Conferma Acquisto"}
              </DialogTitle>
              <DialogDescription>
                {step === "search" && "Imposta i filtri per cercare numeri disponibili su Telnyx."}
                {step === "results" && `${results.length} numeri trovati. Seleziona quello desiderato.`}
                {step === "confirm" && "Conferma l'acquisto del numero selezionato."}
              </DialogDescription>
            </DialogHeader>

            {step === "search" && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Paese</Label>
                  <Select value={searchCountry} onValueChange={setSearchCountry}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IT">Italia (+39)</SelectItem>
                      <SelectItem value="US">Stati Uniti (+1)</SelectItem>
                      <SelectItem value="GB">Regno Unito (+44)</SelectItem>
                      <SelectItem value="DE">Germania (+49)</SelectItem>
                      <SelectItem value="FR">Francia (+33)</SelectItem>
                      <SelectItem value="ES">Spagna (+34)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Prefisso (opzionale)</Label>
                  <Input
                    placeholder="es. 02, 06..."
                    value={searchPrefix}
                    onChange={(e) => setSearchPrefix(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button onClick={handleSearch} disabled={isSearching}>
                    {isSearching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                    Cerca
                  </Button>
                </DialogFooter>
              </div>
            )}

            {step === "results" && (
              <div className="space-y-4 py-4">
                {results.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Nessun numero trovato. Prova con filtri diversi.
                  </p>
                ) : (
                  <div className="max-h-80 overflow-y-auto space-y-2">
                    {results.map((num: any, i: number) => (
                      <button
                        key={i}
                        onClick={() => { setSelectedNumber(num); setStep("confirm"); }}
                        className={`w-full text-left p-3 rounded-lg border transition-colors hover:bg-muted ${
                          selectedNumber?.phone_number === num.phone_number ? "border-primary bg-muted" : "border-border"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-medium">{num.phone_number}</span>
                          <div className="flex gap-1">
                            {num.features?.includes("sms") && (
                              <Badge variant="secondary" className="text-xs"><MessageSquare className="h-3 w-3 mr-1" />SMS</Badge>
                            )}
                            {num.features?.includes("voice") && (
                              <Badge variant="secondary" className="text-xs"><PhoneCall className="h-3 w-3 mr-1" />Voice</Badge>
                            )}
                          </div>
                        </div>
                        {num.monthly_cost?.amount && (
                          <p className="text-xs text-muted-foreground mt-1">
                            ${num.monthly_cost.amount}/{num.monthly_cost.currency || "USD"}/mese
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setStep("search")}>Indietro</Button>
                </DialogFooter>
              </div>
            )}

            {step === "confirm" && selectedNumber && (
              <div className="space-y-4 py-4">
                <Card>
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Numero</span>
                      <span className="font-mono font-medium">{selectedNumber.phone_number}</span>
                    </div>
                    {selectedNumber.monthly_cost?.amount && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Costo mensile</span>
                        <span>${selectedNumber.monthly_cost.amount}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Funzionalità</span>
                      <div className="flex gap-1">
                        {selectedNumber.features?.map((f: string) => (
                          <Badge key={f} variant="outline" className="text-xs">{f}</Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <div className="space-y-2">
                  <Label>Etichetta (opzionale)</Label>
                  <Input
                    placeholder="es. Reception, Supporto..."
                    value={purchaseLabel}
                    onChange={(e) => setPurchaseLabel(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setStep("results")}>Indietro</Button>
                  <Button onClick={handleConfirmPurchase} disabled={purchaseMutation.isPending}>
                    {purchaseMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Conferma Acquisto
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Scorciatoie: dove si usano i numeri (logica GHL — gestione qui, uso altrove) */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/azienda/centralino" className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/30">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><Headphones className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm flex items-center gap-1.5">Centralino <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" /></p>
              <p className="text-xs text-muted-foreground">Chiama e parla dal browser col numero aziendale.</p>
            </div>
          </div>
        </Link>
        <Link to="/azienda/agenti-ai?tab=telefonia" className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/30">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Bot className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm flex items-center gap-1.5">Agenti AI · Telefonia <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" /></p>
              <p className="text-xs text-muted-foreground">Assegna un numero a un agente vocale per le chiamate AI.</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Info box */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-3 pt-4">
          <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="text-sm text-foreground/80">
            <p>I numeri virtuali sono gestiti tramite Telnyx, configurato dalla piattaforma.</p>
            <p className="mt-1">
              Per gestire il credito SMS, vai alla sezione{" "}
              <Link to="/azienda/impostazioni/crediti" className="underline font-medium">Crediti</Link>.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Numbers table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Numeri aziendali (SMS & voce)
          </CardTitle>
          <CardDescription>
            {numbers?.length || 0} numeri attivi · acquisto, etichetta, assegnazione e rilascio
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !numbers?.length ? (
            <p className="text-center text-muted-foreground py-8">
              Nessun numero virtuale attivo. Acquista il primo numero per iniziare.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numero</TableHead>
                  <TableHead>Etichetta</TableHead>
                  <TableHead>Funzionalità</TableHead>
                  <TableHead>Assegnato a</TableHead>
                  <TableHead className="text-right">Costo/mese</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {numbers.map((num: any) => (
                  <TableRow key={num.id}>
                    <TableCell className="font-mono">{num.phone_number}</TableCell>
                    <TableCell>{num.friendly_name || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {(num.capabilities as { sms?: boolean; voice?: boolean })?.sms && (
                          <Badge variant="secondary" className="text-xs"><MessageSquare className="h-3 w-3 mr-1" />SMS</Badge>
                        )}
                        {(num.capabilities as { sms?: boolean; voice?: boolean })?.voice && (
                          <Badge variant="secondary" className="text-xs"><PhoneCall className="h-3 w-3 mr-1" />Voice</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={num.assigned_to || "none"}
                        onValueChange={(v) => handleAssign(num.id, v)}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Non assegnato" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Non assegnato</SelectItem>
                          {profiles?.map((p: any) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.first_name} {p.last_name || ""} ({p.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">€{Number(num.monthly_cost_eur || 0).toFixed(2)}</TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Rilascia Numero</AlertDialogTitle>
                            <AlertDialogDescription>
                              Stai per rilasciare il numero <strong>{num.phone_number}</strong>. 
                              Questa azione è irreversibile e il numero non sarà più disponibile.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annulla</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => releaseMutation.mutate({ id: num.id, telnyx_phone_id: num.telnyx_phone_id })}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Rilascia
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Numeri per le chiamate AI (voce) — pool ai_phone_numbers_v2 */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" /> Numeri per chiamate AI (voce)
            </CardTitle>
            <CardDescription>
              Numeri abilitati alle chiamate degli agenti vocali. L'assegnazione a un agente si fa in{" "}
              <Link to="/azienda/agenti-ai?tab=telefonia" className="underline font-medium">Agenti AI → Telefonia</Link>.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => importTelnyx.mutate()} disabled={importTelnyx.isPending} className="shrink-0">
            {importTelnyx.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Download className="h-4 w-4 mr-1.5" />}
            Importa numeri Telnyx
          </Button>
        </CardHeader>
        <CardContent>
          {aiNumbers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              Nessun numero per le chiamate AI. Usa <strong>Importa numeri Telnyx</strong> per portarli qui dai numeri che usi già per gli SMS.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numero</TableHead>
                  <TableHead>Etichetta</TableHead>
                  <TableHead>Pronto per chiamate AI</TableHead>
                  <TableHead>Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aiNumbers.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-mono text-sm">{n.numero}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{n.nome_etichetta || "—"}</TableCell>
                    <TableCell>
                      {n.elevenlabs_phone_id ? (
                        <span className="inline-flex items-center gap-1 text-xs text-primary"><Link2 className="h-3.5 w-3.5" /> Collegato</span>
                      ) : n.agent_id ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600">Da collegare in Agenti AI</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">Nessun agente assegnato</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={n.attivo ? "secondary" : "outline"} className="text-xs">{n.attivo ? "Attivo" : "Disattivo"}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Consuntivo chiamate — costo per l'azienda (+ margine se super_admin) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PhoneCall className="h-5 w-5 text-primary" /> Consuntivo chiamate
          </CardTitle>
          <CardDescription>
            Riepilogo delle chiamate effettuate dal Centralino e relativo costo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!voiceConsuntivo || Number(voiceConsuntivo.chiamate) === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">
              Nessuna chiamata registrata. Il consuntivo comparirà qui dopo le prime chiamate.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-2xl font-bold tabular-nums">{Number(voiceConsuntivo.chiamate)}</p>
                  <p className="text-xs text-muted-foreground">Chiamate</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-2xl font-bold tabular-nums">{Number(voiceConsuntivo.minuti)}</p>
                  <p className="text-xs text-muted-foreground">Minuti</p>
                </div>
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <p className="text-2xl font-bold tabular-nums text-primary">€{Number(voiceConsuntivo.costo_cliente).toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Costo chiamate</p>
                </div>
              </div>
              {/* Solo super_admin: wholesale + margine piattaforma */}
              {voiceConsuntivo.costo_wholesale != null && (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs">
                  <span className="font-semibold text-muted-foreground">Vista piattaforma</span>
                  <span>Costo Telnyx: <strong>€{Number(voiceConsuntivo.costo_wholesale).toFixed(2)}</strong></span>
                  <span className="text-emerald-700">Margine: <strong>€{Number(voiceConsuntivo.margine ?? 0).toFixed(2)}</strong></span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
