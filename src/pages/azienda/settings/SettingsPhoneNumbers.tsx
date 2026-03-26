import { useState } from "react";
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
import { Phone, Plus, Search, Trash2, MessageSquare, PhoneCall, Info, Loader2 } from "lucide-react";
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
          <h2 className="text-2xl font-bold tracking-tight">Numeri Virtuali</h2>
          <p className="text-muted-foreground">
            Gestisci i numeri di telefono aziendali per SMS e chiamate.
          </p>
        </div>
        <Dialog open={purchaseOpen} onOpenChange={(open) => { setPurchaseOpen(open); if (!open) resetPurchase(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Acquista Numero</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
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
            Numeri Attivi
          </CardTitle>
          <CardDescription>
            {numbers?.length || 0} numeri attivi per la tua azienda
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
    </div>
  );
}
