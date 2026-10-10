import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  usePhoneNumbers,
  useSearchAvailableNumbers,
  usePurchaseNumber,
  useReleaseNumber,
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Phone, Plus, Search, Trash2, MessageSquare, PhoneCall, Loader2, Download, Bot, Link2, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { TelephonyComplianceCard } from "@/components/telephony/TelephonyComplianceCard";

type PurchaseStep = "search" | "results" | "confirm";

/** Importi in euro come si scrivono in Italia: «12,00 €». */
const euro = (valore: number) => valore.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
/** L'importo di un fornitore nella sua valuta, scritto una volta sola: «12,00 USD al mese». */
const alMese = (importo: string | number, valuta?: string) =>
  `${Number(importo).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${valuta || "USD"} al mese`;
/** Le funzionalità di un numero in parole di tutti i giorni (prima comparivano «sms» e «voice» crudi). */
const FUNZIONALITA: Record<string, string> = { sms: "SMS", voice: "Voce", mms: "MMS", fax: "Fax" };
const funzionalita = (f: string) => FUNZIONALITA[f] ?? f;

/** I due badge «SMS» e «Voce» di un numero aziendale: stanno in una colonna a parte e, sul telefono, sotto il numero. */
function funzionalitaDelNumero(num: { capabilities?: unknown }) {
  const capacita = num.capabilities as { sms?: boolean; voice?: boolean } | null | undefined;
  return (
    <div className="flex flex-wrap gap-1">
      {capacita?.sms && (
        <Badge variant="secondary" className="text-xs"><MessageSquare className="h-3 w-3 mr-1" />SMS</Badge>
      )}
      {capacita?.voice && (
        <Badge variant="secondary" className="text-xs"><PhoneCall className="h-3 w-3 mr-1" />Voce</Badge>
      )}
    </div>
  );
}

export default function SettingsPhoneNumbers() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id || null;
  // Comprare o rilasciare un numero apre/chiude un canone mensile vero: solo
  // l'amministratore (21/09/2026). Il database e le funzioni edge lo
  // impongono già (telnyx-proxy, telnyx-acquista-numero); qui si tolgono i
  // pulsanti a chi il salvataggio lo rifiuterebbe comunque.
  const { isAdmin } = usePermissions();

  const { data: numbers, isLoading, isError: isErrorNumbers } = usePhoneNumbers(companyId);
  const { results, isSearching, search, setResults } = useSearchAvailableNumbers();
  const purchaseMutation = usePurchaseNumber(companyId);
  const releaseMutation = useReleaseNumber(companyId);
  const queryClient = useQueryClient();

  // Numeri per le chiamate AI (voce) — pool ai_phone_numbers_v2. Gestiti qui in
  // Telefonia; l'assegnazione a un agente avviene in Agenti AI → Telefonia.
  const { data: aiNumbers = [], isError: erroreNumeriAi } = useQuery({
    queryKey: ["ai-phone-numbers-v2", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_phone_numbers_v2" as never)
        .select("id, numero, nome_etichetta, agent_id, elevenlabs_phone_id, attivo")
        .eq("company_id", companyId!)
        .order("creato_il", { ascending: false });
      if (error) throw error;
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
      if (r.inserted > 0) toast.success(r.inserted === 1 ? "1 numero portato nelle chiamate AI" : `${r.inserted} numeri portati nelle chiamate AI`);
      else toast.info("Nessun numero nuovo da portare qui");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Non sono riuscito a portare qui i numeri. Riprova."),
  });

  // Stato normativo: l'acquisto di numeri IT è bloccato finché non è approvato.
  const { data: complianceStato, isLoading: caricaStatoNormativo, isError: erroreStatoNormativo } = useQuery({
    queryKey: ["telephony-compliance-stato", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_telephony_compliance" as never)
        .select("stato")
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return ((data as { stato?: string } | null)?.stato) ?? "da_compilare";
    },
  });
  const canBuyNumbers = complianceStato === "approvato";

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

  // Finché i dati normativi non sono approvati la scheda che li chiede sta in cima, sopra le tabelle: è quella che sblocca
  // l'acquisto. Approvati, scende in fondo alla pagina. Si disegna solo a stato noto, per non vederla saltare da un posto all'altro.
  const schedaNormativaInCima = !caricaStatoNormativo && !canBuyNumbers;
  const schedaNormativaInFondo = !caricaStatoNormativo && canBuyNumbers;

  return (
    <div className="space-y-6">
      {/* Il titolo «Telefonia» c'è già nella testata delle Impostazioni: qui solo cosa si fa in questa pagina. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-muted-foreground">
          Numeri per SMS, chiamate e agenti vocali. Per comprare un numero italiano servono prima i dati dell'azienda, approvati.
        </p>
        {isAdmin && (
        <Dialog open={purchaseOpen} onOpenChange={(open) => { setPurchaseOpen(open); if (!open) resetPurchase(); }}>
          <DialogTrigger asChild>
            <Button disabled={!canBuyNumbers} className="max-md:h-11 max-md:w-full">
              <Plus className="mr-2 h-4 w-4" />Acquista un numero
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {step === "search" && "Cerca numeri disponibili"}
                {step === "results" && "Numeri disponibili"}
                {step === "confirm" && "Conferma l'acquisto"}
              </DialogTitle>
              <DialogDescription>
                {step === "search" && "Scegli il paese e, se vuoi, il prefisso: ti mostriamo i numeri che puoi acquistare."}
                {step === "results" && `${results.length} numeri trovati. Seleziona quello desiderato.`}
                {step === "confirm" && "Conferma l'acquisto del numero selezionato."}
              </DialogDescription>
            </DialogHeader>

            {step === "search" && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="tel-paese">Paese</Label>
                  <Select value={searchCountry} onValueChange={setSearchCountry}>
                    <SelectTrigger id="tel-paese" className="max-md:h-11"><SelectValue /></SelectTrigger>
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
                  <Label htmlFor="tel-prefisso">Prefisso (facoltativo)</Label>
                  <Input
                    id="tel-prefisso"
                    placeholder="es. 02, 06..."
                    value={searchPrefix}
                    onChange={(e) => setSearchPrefix(e.target.value)}
                    className="max-md:h-11"
                  />
                </div>
                <DialogFooter>
                  <Button onClick={handleSearch} disabled={isSearching} className="max-md:h-11">
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
                        className={`w-full text-left p-3 rounded-lg border transition-colors hover:bg-muted max-md:min-h-11 ${
                          selectedNumber?.phone_number === num.phone_number ? "border-primary bg-primary/5 shadow-sm" : "border-slate-300 bg-white shadow-sm hover:border-primary/60"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-medium">{num.phone_number}</span>
                          <div className="flex gap-1">
                            {num.features?.includes("sms") && (
                              <Badge variant="secondary" className="text-xs"><MessageSquare className="h-3 w-3 mr-1" />SMS</Badge>
                            )}
                            {num.features?.includes("voice") && (
                              <Badge variant="secondary" className="text-xs"><PhoneCall className="h-3 w-3 mr-1" />Voce</Badge>
                            )}
                          </div>
                        </div>
                        {num.monthly_cost?.amount && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {alMese(num.monthly_cost.amount, num.monthly_cost.currency)}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setStep("search")} className="max-md:h-11">Indietro</Button>
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
                        <span className="text-muted-foreground">Costo</span>
                        <span>{alMese(selectedNumber.monthly_cost.amount, selectedNumber.monthly_cost.currency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Funzionalità</span>
                      <div className="flex gap-1">
                        {selectedNumber.features?.map((f: string) => (
                          <Badge key={f} variant="outline" className="text-xs">{funzionalita(f)}</Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <div className="space-y-2">
                  <Label htmlFor="tel-etichetta">Etichetta (facoltativa)</Label>
                  <Input
                    id="tel-etichetta"
                    placeholder="es. Reception, Supporto..."
                    value={purchaseLabel}
                    onChange={(e) => setPurchaseLabel(e.target.value)}
                    className="max-md:h-11"
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setStep("results")} className="max-md:h-11">Indietro</Button>
                  <Button onClick={handleConfirmPurchase} disabled={purchaseMutation.isPending} className="max-md:h-11">
                    {purchaseMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Conferma l'acquisto
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
        )}
      </div>

      {/* Perché «Acquista un numero» è spento: lo dice una riga, con il collegamento alla scheda che lo sblocca (il title non si vede su tablet). */}
      {isAdmin && !caricaStatoNormativo && !canBuyNumbers && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {erroreStatoNormativo
            ? "Non riesco a controllare i dati normativi dell'azienda: riprova tra poco."
            : <>Prima compila e fai approvare «Dati normativi azienda»: <a href="#dati-normativi" className="font-medium underline">vai alla scheda</a>.</>}
        </p>
      )}

      {/* Dove si usano i numeri: gestione qui, uso altrove. Una riga sola al posto delle due scorciatoie e del riquadro. */}
      <p className="text-sm text-muted-foreground">
        Dove li usi:{" "}
        <Link to="/azienda/centralino" className="font-medium text-foreground underline max-md:inline-block max-md:py-2.5">Centralino</Link>
        {" · "}
        <Link to="/azienda/agenti-ai?tab=telefonia" className="font-medium text-foreground underline max-md:inline-block max-md:py-2.5">Agenti AI → Telefonia</Link>.
        {" "}I numeri sono gestiti da Telnyx per conto della piattaforma; il credito SMS è in{" "}
        <Link to="/azienda/impostazioni/crediti" className="font-medium text-foreground underline max-md:inline-block max-md:py-2.5">Crediti</Link>.
      </p>

      {schedaNormativaInCima && (
        <div id="dati-normativi" className="scroll-mt-28">
          <TelephonyComplianceCard />
        </div>
      )}


      {/* Numbers table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Numeri aziendali (SMS e voce)
          </CardTitle>
          <CardDescription>
            {numbers?.length === 1 ? "1 numero attivo" : `${numbers?.length || 0} numeri attivi`} · acquisto, etichetta e rilascio
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isErrorNumbers ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>Errore nel caricamento dei numeri. Riprova.</AlertDescription>
            </Alert>
          ) : !numbers?.length ? (
            <p className="text-center text-muted-foreground py-8">
              Nessun numero virtuale attivo. Acquista il primo numero per iniziare.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="max-sm:px-2">Numero</TableHead>
                  <TableHead className="hidden sm:table-cell">Etichetta</TableHead>
                  <TableHead className="hidden sm:table-cell">Funzionalità</TableHead>
                  <TableHead className="text-right max-sm:px-2">Costo al mese (€)</TableHead>
                  {isAdmin && <TableHead className="max-sm:px-2" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {numbers.map((num: any) => (
                  <TableRow key={num.id}>
                    <TableCell className="max-sm:px-2">
                      <span className="font-mono whitespace-nowrap">{num.phone_number}</span>
                      {/* Sul telefono le colonne «Etichetta» e «Funzionalità» non entrano: stanno sotto il numero. */}
                      <div className="mt-1 space-y-1 sm:hidden">
                        <p className="text-sm text-muted-foreground">{num.friendly_name || "—"}</p>
                        {funzionalitaDelNumero(num)}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{num.friendly_name || "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">{funzionalitaDelNumero(num)}</TableCell>
                    <TableCell className="text-right max-sm:px-2">{Number(num.monthly_cost_eur || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    {isAdmin && (
                      <TableCell className="max-sm:px-2">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Rilascia il numero ${num.phone_number}`} className="text-destructive hover:text-destructive max-md:h-11 max-md:w-11">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Rilasciare il numero?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Stai per rilasciare il numero <strong>{num.phone_number}</strong>.
                                Non si può annullare: il numero non sarà più disponibile.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="max-md:h-11">Annulla</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => releaseMutation.mutate({ id: num.id, telnyx_phone_id: num.telnyx_phone_id })}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 max-md:h-11"
                              >
                                Rilascia il numero
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Numeri per le chiamate AI (voce) — pool ai_phone_numbers_v2 */}
      <Card>
        <CardHeader className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" /> Numeri per chiamate AI (voce)
            </CardTitle>
            <CardDescription>
              Numeri abilitati alle chiamate degli agenti vocali. L'assegnazione a un agente si fa in{" "}
              <Link to="/azienda/agenti-ai?tab=telefonia" className="underline font-medium">Agenti AI → Telefonia</Link>.
            </CardDescription>
          </div>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => importTelnyx.mutate()} disabled={importTelnyx.isPending} className="shrink-0 max-md:h-auto max-md:min-h-11 max-md:whitespace-normal max-md:text-left">
              {importTelnyx.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Download className="h-4 w-4 mr-1.5 shrink-0" />}
              Porta qui i numeri che usi già per gli SMS
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {erroreNumeriAi ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>Non riesco a leggere i numeri per le chiamate AI. Riprova tra poco.</AlertDescription>
            </Alert>
          ) : aiNumbers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              {isAdmin
                ? <>Nessun numero per le chiamate AI. Premi <strong>Porta qui i numeri che usi già per gli SMS</strong> per aggiungere quelli che hai.</>
                : "Nessun numero per le chiamate AI."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="max-sm:px-2">Numero</TableHead>
                  <TableHead className="hidden sm:table-cell">Etichetta</TableHead>
                  <TableHead className="max-sm:px-2">Pronto per chiamate AI</TableHead>
                  <TableHead className="max-sm:px-2">Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aiNumbers.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="max-sm:px-2">
                      <span className="font-mono text-sm">{n.numero}</span>
                      <p className="mt-1 text-sm text-muted-foreground sm:hidden">{n.nome_etichetta || "—"}</p>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{n.nome_etichetta || "—"}</TableCell>
                    <TableCell className="max-sm:px-2">
                      {n.elevenlabs_phone_id ? (
                        <span className="inline-flex items-center gap-1 text-xs text-primary"><Link2 className="h-3.5 w-3.5" /> Collegato</span>
                      ) : n.agent_id ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600">Da collegare in Agenti AI</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">Nessun agente assegnato</span>
                      )}
                    </TableCell>
                    <TableCell className="max-sm:px-2">
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
                  <p className="text-2xl font-bold tabular-nums text-primary">{euro(Number(voiceConsuntivo.costo_cliente))}</p>
                  <p className="text-xs text-muted-foreground">Costo chiamate</p>
                </div>
              </div>
              {/* Solo super_admin: wholesale + margine piattaforma */}
              {voiceConsuntivo.costo_wholesale != null && (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs">
                  <span className="font-semibold text-muted-foreground">Vista piattaforma</span>
                  <span>Costo Telnyx: <strong>{euro(Number(voiceConsuntivo.costo_wholesale))}</strong></span>
                  <span className="text-emerald-700">Margine: <strong>{euro(Number(voiceConsuntivo.margine ?? 0))}</strong></span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dati normativi compilati dall'azienda (responsabilità sua): approvati, scendono in fondo. */}
      {schedaNormativaInFondo && (
        <div id="dati-normativi" className="scroll-mt-28">
          <TelephonyComplianceCard />
        </div>
      )}
    </div>
  );
}
