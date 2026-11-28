import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Scadenza } from "@/hooks/useScadenzario";
import { gruppoMetodo } from "@/lib/finance/metodoScadenza";
import { formatCurrency } from "@/lib/formatters";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { usePermissions } from "@/hooks/usePermissions";
import { metodiConEffetto, residuoLibero, tipoEffettoDaMetodo, useEffettiFonte, useRegistraEffetto } from "@/hooks/useEffetti";
import { toast } from "sonner";

const fmtEur = (n: number) => formatCurrency(n);

interface Props {
  scadenza: Scadenza | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (params: { scadenzaId: string; amount: number; paymentMethod: string; paymentDate: string; notes?: string; accountLabel?: string }) => void;
  isPending: boolean;
}

export default function MarkPaidDialog({ scadenza, open, onOpenChange, onConfirm, isPending }: Props) {
  const t = useT();
  const isMobile = useIsMobile();
  const remaining = scadenza ? scadenza.amount - scadenza.paid_amount : 0;
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bonifico");
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [notes, setNotes] = useState("");
  const [accountLabel, setAccountLabel] = useState("banca");
  const [numero, setNumero] = useState("");
  const [banca, setBanca] = useState("");
  const permissions = usePermissions();
  const registraEffetto = useRegistraEffetto();
  const effettiFonte = useEffettiFonte(scadenza?.company_id, { scadenzaId: scadenza?.id }, open && !!scadenza);
  const conEffetto = metodiConEffetto(method);
  const oggi = new Date().toLocaleDateString("en-CA");
  const dataFutura = conEffetto && date > oggi;
  const libero = residuoLibero(remaining, effettiFonte.coperto);

  // Prefill all'APERTURA. NB: con dialog controllato Radix invoca onOpenChange solo
  // per interazioni interne (Esc/X/overlay), mai quando il parent setta open=true →
  // il vecchio handleOpen non scattava: importo mai precompilato col residuo e, alla
  // seconda apertura su un'ALTRA scadenza, restavano importo/note precedenti
  // (rischio di registrare un pagamento sbagliato).
  const scadenzaId = scadenza?.id;
  useEffect(() => {
    if (open && scadenza) {
      setAmount(String(scadenza.amount - scadenza.paid_amount));
      // Un codice solo per la RiBa: le scadenze vecchie possono dire ancora «ri.ba».
      setMethod(gruppoMetodo(scadenza.payment_method) ?? "bonifico");
      setDate(new Date().toLocaleDateString("en-CA"));
      setNotes("");
      setNumero("");
      setBanca("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scadenzaId]);

  if (!scadenza) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{scadenza.direction === "entrata" ? t("Registra incasso") : t("Registra pagamento")}</DialogTitle>
        </DialogHeader>
        {/* Mobile: campi a due colonne (importo e conto, metodo e data), via le note. */}
        <div className="space-y-4 max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-2 max-sm:gap-y-3 max-sm:space-y-0">
          <div className="rounded-lg bg-muted/50 p-3 text-sm max-sm:col-span-2 max-sm:px-3 max-sm:py-2 max-sm:text-xs">
            <p className="font-medium max-sm:truncate">{scadenza.description}</p>
            <p className="text-muted-foreground">{t("Totale: {totale} · Residuo: {residuo}", { totale: fmtEur(scadenza.amount), residuo: fmtEur(remaining) })}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scadenza-importo">{isMobile ? t("Importo") : scadenza.direction === "entrata" ? t("Importo incassato") : t("Importo pagato")}</Label>
            <Input
              id="scadenza-importo"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              max={libero}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {effettiFonte.effetti.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("Già coperti {importo} da {n} assegni/effetti in attesa. Residuo libero: {libero}", { importo: fmtEur(effettiFonte.coperto), n: String(effettiFonte.effetti.length), libero: fmtEur(libero) })}
              </p>
            )}
          </div>

          {/* Mobile: il conto sale accanto all'importo (vedi order). */}
          <div className="grid grid-cols-2 gap-3 max-sm:order-1 max-sm:col-span-2 max-sm:gap-2">
            <div className="space-y-2">
              <Label>{t("Metodo")}</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bonifico">{t("Bonifico")}</SelectItem>
                  <SelectItem value="contanti">{t("Contanti")}</SelectItem>
                  <SelectItem value="carta">{t("Carta")}</SelectItem>
                  <SelectItem value="assegno">{t("Assegno")}</SelectItem>
                  <SelectItem value="riba">RiBa</SelectItem>
                  <SelectItem value="rid">RID / SDD</SelectItem>
                  <SelectItem value="altro">{t("Altro")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scadenza-data">{conEffetto ? (method === "assegno" ? t("Data dell'assegno") : t("Data effetto")) : <>{t("Data")}<span className="max-sm:hidden"> {scadenza.direction === "entrata" ? t("incasso") : t("pagamento")}</span></>}</Label>
              <Input id="scadenza-data" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {conEffetto && (
            <div className="grid grid-cols-2 gap-3 max-sm:col-span-2 max-sm:gap-2">
              <div className="space-y-2">
                <Label htmlFor="scadenza-effetto-numero">{method === "assegno" ? t("Numero assegno") : t("Numero")}</Label>
                <Input id="scadenza-effetto-numero" value={numero} onChange={(e) => setNumero(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scadenza-effetto-banca">{t("Banca")}</Label>
                <Input id="scadenza-effetto-banca" value={banca} onChange={(e) => setBanca(e.target.value)} />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>{t("Conto")}</Label>
            <Select value={accountLabel} onValueChange={setAccountLabel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="banca">{t("Banca")}</SelectItem>
                <SelectItem value="cassa">{t("Cassa")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 max-sm:hidden">
            <Label>{t("Note (opzionale)")}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="max-sm:hidden">{t("Annulla")}</Button>
          <Button
            onClick={() => {
              if (dataFutura) {
                registraEffetto.mutate({
                  fonteTipo: "scadenza", fonteId: scadenza.id, tipo: tipoEffettoDaMetodo(method),
                  direzione: scadenza.direction === "entrata" ? "ricevuto" : "emesso",
                  numero, banca, importo: Number(amount), dataEmissione: oggi, dataScadenza: date, note: notes || null,
                }, {
                  onSuccess: () => { toast.success(t("Assegno registrato: la scadenza resta aperta fino all'incasso")); onOpenChange(false); },
                  onError: (e: Error) => toast.error(e.message),
                });
                return;
              }
              onConfirm({
                scadenzaId: scadenza.id,
                amount: Number(amount),
                paymentMethod: method,
                paymentDate: date,
                notes: notes || undefined,
                accountLabel,
              });
            }}
            disabled={isPending || registraEffetto.isPending || permissions.solaLettura || !amount || Number(amount) <= 0 || Number(amount) > libero || (dataFutura && !date)}
          >
            {registraEffetto.isPending || isPending ? t("Salvataggio...") : dataFutura ? t("Registra assegno") : t("Registra")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
