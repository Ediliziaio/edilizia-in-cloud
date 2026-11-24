import { useState, type FormEvent } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useManualTreasury, type ManualAccount } from "@/hooks/useManualTreasury";
import { usePermissions } from "@/hooks/usePermissions";
import { pulisciIbanConto } from "@/lib/fatturazione/contiAzienda";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function ContiBancariManuali() {
  const t = useT();
  const { isAdmin, canViewBankBalances, solaLettura } = usePermissions();
  const { accounts, isLoading, accountsError, refetchAccounts, createAccount, updateAccount } = useManualTreasury();
  const [conto, setConto] = useState<ManualAccount | "nuovo" | null>(null);
  const [nome, setNome] = useState("");
  const [iban, setIban] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const puoGestire = isAdmin && canViewBankBalances && !solaLettura;
  const salvataggio = createAccount.isPending || updateAccount.isPending;

  function apri(valore: ManualAccount | "nuovo") {
    setConto(valore);
    setNome(valore === "nuovo" ? "" : valore.display_name || valore.account_name || "");
    setIban(valore === "nuovo" ? "" : valore.iban || "");
    setErrore(null);
  }

  async function salva(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!conto || !puoGestire || salvataggio || !nome.trim()) return;
    const nuovo = conto === "nuovo";
    const ibanPulito = pulisciIbanConto(iban);
    const ibanVariato = nuovo || ibanPulito !== pulisciIbanConto(conto.iban);
    if (ibanVariato && ibanPulito && !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(ibanPulito)) {
      setErrore(t("Controlla il formato dell’IBAN."));
      return;
    }
    if (ibanVariato && ibanPulito && accounts.some((a) => pulisciIbanConto(a.iban) === ibanPulito)) {
      setErrore(t("Esiste già un conto manuale con questo IBAN."));
      return;
    }
    setErrore(null);
    try {
      if (nuovo) {
        await createAccount.mutateAsync({ name: nome.trim(), iban: ibanPulito || undefined, opening_balance: 0 });
      } else {
        await updateAccount.mutateAsync({ id: conto.id, name: nome.trim(), ...(ibanVariato ? { iban: ibanPulito || null } : {}) });
      }
      setConto(null);
    } catch {
      setErrore(t("Non è stato possibile salvare il conto. Riprova."));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-lg text-sm text-muted-foreground">
          {t("Aggiungi i conti correnti da usare in prima nota, negli incassi e nei pagamenti anche senza collegare la banca.")}
        </p>
        {puoGestire && <Button size="sm" onClick={() => apri("nuovo")} disabled={isLoading || !!accountsError}>
          <Plus className="mr-1.5 h-4 w-4" /> {t("Aggiungi conto")}
        </Button>}
      </div>
      {accountsError ? (
        <p role="alert" className="text-sm text-destructive">
          {t("Impossibile caricare i conti manuali.")} <button type="button" className="underline" onClick={() => void refetchAccounts()}>{t("Riprova")}</button>
        </p>
      ) : isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">{t("Caricamento conti…")}</p>
      ) : accounts.length === 0 ? (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">{t("Nessun conto manuale.")}</CardContent></Card>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 p-3 sm:px-4">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium">{a.display_name || a.account_name || t("Conto corrente")}</p>
                {a.iban && <p className="break-all text-xs text-muted-foreground">{a.iban}</p>}
                {!a.is_active && <p className="text-xs text-muted-foreground">{t("Inattivo")}</p>}
              </div>
              {puoGestire && <Button size="sm" variant="ghost" onClick={() => apri(a)} aria-label={t("Modifica {nome}", { nome: a.display_name || a.account_name || t("conto corrente") })}>
                <Pencil className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">{t("Modifica")}</span>
              </Button>}
            </li>
          ))}
        </ul>
      )}
      {!puoGestire && <p className="text-xs text-muted-foreground">{t("Un amministratore può aggiungere o modificare i conti.")}</p>}
      <Dialog open={!!conto && puoGestire} onOpenChange={(open) => { if (!open && !salvataggio) setConto(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{conto === "nuovo" ? t("Nuovo conto corrente manuale") : t("Modifica conto corrente manuale")}</DialogTitle>
            <DialogDescription>{t("Il nome identifica il conto nei movimenti dell’azienda.")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={salva} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="conto-manuale-nome">{t("Nome del conto")}</Label>
              <Input id="conto-manuale-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder={t("Es. Banca Intesa · conto operativo")} maxLength={120} required disabled={salvataggio} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conto-manuale-iban">{t("IBAN (opzionale)")}</Label>
              <Input id="conto-manuale-iban" value={iban} onChange={(e) => setIban(e.target.value)} autoCapitalize="characters" autoComplete="off" spellCheck={false} disabled={salvataggio} />
            </div>
            {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConto(null)} disabled={salvataggio}>{t("Annulla")}</Button>
              <Button type="submit" disabled={salvataggio || !nome.trim()}>
                {salvataggio ? t("Salvataggio…") : t("Salva conto")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
