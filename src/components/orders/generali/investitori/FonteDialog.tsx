// src/components/orders/generali/investitori/FonteDialog.tsx
// Nuova fonte o modifica: chi è, a che titolo mette i soldi, quanto si è impegnato.
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ScegliCliente } from "@/components/orders/generali/ScegliCliente";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyCustomers } from "@/hooks/useCompanyCustomers";
import { messaggioInvestitori, useSalvaFonte, type FonteDaSalvare } from "@/hooks/useGeneraleInvestitori";
import { leggiImporto } from "@/lib/controlloGestione/formatCG";
import {
  FORME_DEBITO, NOMI_FONTE, NOMI_FORMA, NOMI_RIMBORSO, PIANI_RIMBORSO, TIPI_FONTE, aCapitale, aDebito, aPrestito,
  type FormaDebito, type Fonte, type PianoRimborso, type TipoFonte,
} from "@/lib/orders/generali/investitoriConti";
import { nomeContatto } from "@/lib/orders/generali/investitoriLettura";
import { cn } from "@/lib/utils";

const testoNumero = (n: number | null | undefined) =>
  n === null || n === undefined ? "" : new Intl.NumberFormat("it-IT", { maximumFractionDigits: 3 }).format(n);

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  generaleId: string;
  /** null = nuova fonte. */
  fonte: Fonte | null;
  /** Il tipo proposto per una fonte nuova. */
  tipoIniziale?: TipoFonte;
}

function Errore({ testo }: { testo: string | null }) {
  return testo ? <p className="text-xs text-destructive">{testo}</p> : null;
}

export function FonteDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        {/* Il modulo nasce a ogni apertura con i valori di adesso. */}
        {props.open && <Modulo {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function Modulo({ onOpenChange, generaleId, fonte, tipoIniziale }: Props) {
  const salva = useSalvaFonte(generaleId);
  const { effectiveCompany } = useAuth();
  const { data: clienti = [] } = useCompanyCustomers(effectiveCompany?.id);
  const [tipo, setTipo] = useState<TipoFonte>(fonte?.tipo ?? tipoIniziale ?? "capitale");
  const [nome, setNome] = useState(fonte?.nome ?? (tipoIniziale === "propri" ? effectiveCompany?.name ?? "" : ""));
  const [soggetto, setSoggetto] = useState<"persona" | "societa">(fonte?.soggetto ?? "persona");
  const [clienteId, setClienteId] = useState<string | null>(fonte?.clienteId ?? null);
  const [email, setEmail] = useState(fonte?.email ?? "");
  const [impegno, setImpegno] = useState(testoNumero(fonte?.impegno));
  const [quotaFissa, setQuotaFissa] = useState(fonte?.quotaUtilePct !== null && fonte?.quotaUtilePct !== undefined);
  const [quota, setQuota] = useState(testoNumero(fonte?.quotaUtilePct));
  const [tasso, setTasso] = useState(testoNumero(fonte?.tassoPct));
  const [inizio, setInizio] = useState(fonte?.dataInizio ?? "");
  const [scadenza, setScadenza] = useState(fonte?.scadenza ?? "");
  const [nota, setNota] = useState(fonte?.nota ?? "");
  const [forma, setForma] = useState<FormaDebito>(fonte?.forma ?? (tipoIniziale === "finanziamento" ? "finanziamento" : "mutuo_fondiario"));
  const [spese, setSpese] = useState(testoNumero(fonte?.speseIniziali || null));
  const [rimborso, setRimborso] = useState<PianoRimborso>(fonte?.rimborso ?? "scadenza");
  const [ammortamento, setAmmortamento] = useState(fonte?.ammortamentoDal ?? "");

  const clientiPerId = useMemo(() => new Map(clienti.map((c) => [c.id, c])), [clienti]);
  const scegliContatto = (id: string | null) => {
    setClienteId(id);
    const c = id ? clientiPerId.get(id) : null;
    if (!c) return;
    // Il nome e l'email del contatto si propongono, ma restano modificabili.
    if (!nome.trim()) setNome(nomeContatto(c));
    if (!email.trim() && c.email) setEmail(c.email);
  };

  const valImpegno = impegno.trim() === "" ? 0 : leggiImporto(impegno);
  const valQuota = quotaFissa ? leggiImporto(quota) : null;
  const valTasso = tasso.trim() === "" ? null : leggiImporto(tasso);
  const valSpese = spese.trim() === "" ? 0 : leggiImporto(spese);
  const errori = {
    nome: nome.trim() === "" ? "Scrivi il nome di chi mette i soldi." : null,
    impegno: valImpegno === null || valImpegno < 0 ? "Scrivi un importo, ad esempio 150.000." : null,
    quota: aCapitale(tipo) && quotaFissa && (valQuota === null || valQuota < 0 || valQuota > 100) ? "Una percentuale tra 0 e 100." : null,
    tasso: aPrestito(tipo) && valTasso !== null && (valTasso < 0 || valTasso > 100) ? "Un tasso tra 0 e 100." : null,
    email: email.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? "L'indirizzo email non sembra giusto." : null,
    date: aPrestito(tipo) && inizio && scadenza && scadenza < inizio ? "La scadenza viene prima dell'inizio." : null,
    spese: aPrestito(tipo) && (valSpese === null || valSpese < 0) ? "Scrivi un importo, ad esempio 2.500." : null,
    rate: aPrestito(tipo) && rimborso === "rate" && !scadenza ? "A rate serve la scadenza: è il giorno dell'ultima rata." : null,
  };
  const [tentato, setTentato] = useState(false);
  const valido = !Object.values(errori).some(Boolean);

  const invia = () => {
    setTentato(true);
    if (!valido || salva.isPending) return;
    const dati: FonteDaSalvare = {
      id: fonte?.id,
      tipo,
      nome,
      soggetto: aDebito(tipo) ? "societa" : soggetto,
      clienteId: tipo === "propri" || aDebito(tipo) ? null : clienteId,
      email: email.trim() || null,
      impegno: valImpegno ?? 0,
      quotaUtilePct: aCapitale(tipo) ? valQuota : null,
      tassoPct: aPrestito(tipo) ? valTasso : null,
      dataInizio: inizio || null,
      scadenza: aPrestito(tipo) ? scadenza || null : null,
      nota: nota.trim() || null,
      forma: aDebito(tipo) ? forma : null,
      speseIniziali: aPrestito(tipo) ? valSpese ?? 0 : 0,
      rimborso: aPrestito(tipo) ? rimborso : "scadenza",
      ammortamentoDal: aPrestito(tipo) && rimborso === "rate" ? ammortamento || null : null,
    };
    salva.mutate(dati, {
      onSuccess: () => { toast.success(fonte ? "Fonte aggiornata" : "Fonte aggiunta"); onOpenChange(false); },
      onError: (e) => toast.error(messaggioInvestitori(e, "la fonte")),
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{fonte ? `Modifica ${fonte.nome}` : "Nuova fonte di finanziamento"}</DialogTitle>
        <DialogDescription>Chi mette i soldi nell'operazione e a che condizioni. Versamenti e rimborsi si registrano dopo, con la data.</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); invia(); }}>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">A che titolo</legend>
          <RadioGroup value={tipo} onValueChange={(v) => setTipo(v as TipoFonte)} className="grid gap-2 sm:grid-cols-2">
            {TIPI_FONTE.map((t) => (
              <Label
                key={t}
                htmlFor={`fonte-tipo-${t}`}
                className={cn("flex cursor-pointer gap-2 rounded-md border p-2.5 font-normal", tipo === t && "border-primary bg-primary/5")}
              >
                <RadioGroupItem id={`fonte-tipo-${t}`} value={t} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">{NOMI_FONTE[t].nome}</span>
                  <span className="block text-xs text-muted-foreground">{NOMI_FONTE[t].aiuto}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
        </fieldset>

        {(tipo === "capitale" || tipo === "prestito") && (
          <div className="space-y-1.5">
            <Label htmlFor="fonte-contatto">Cliente o contatto <span className="font-normal text-muted-foreground">(facoltativo)</span></Label>
            <ScegliCliente id="fonte-contatto" valore={clienteId} onCambia={scegliContatto} />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="fonte-nome">{tipo === "banca" ? "Banca" : tipo === "finanziamento" ? "Chi finanzia" : tipo === "propri" ? "Chi" : "Nome dell'investitore"}</Label>
          <Input id="fonte-nome" value={nome} onChange={(e) => setNome(e.target.value)} aria-invalid={(tentato && !!errori.nome) || undefined} />
          {tentato && <Errore testo={errori.nome} />}
        </div>

        {(tipo === "capitale" || tipo === "prestito") && (
          <RadioGroup value={soggetto} onValueChange={(v) => setSoggetto(v === "societa" ? "societa" : "persona")} className="flex gap-4">
            <Label htmlFor="fonte-persona" className="flex items-center gap-2 font-normal"><RadioGroupItem id="fonte-persona" value="persona" /> Persona</Label>
            <Label htmlFor="fonte-societa" className="flex items-center gap-2 font-normal"><RadioGroupItem id="fonte-societa" value="societa" /> Società</Label>
          </RadioGroup>
        )}

        {aDebito(tipo) && (
          <div className="space-y-1.5">
            <Label htmlFor="fonte-forma">Che finanziamento è</Label>
            <Select value={forma} onValueChange={(v) => setForma(v as FormaDebito)}>
              <SelectTrigger id="fonte-forma"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FORME_DEBITO.map((f) => <SelectItem key={f} value={f}>{NOMI_FORMA[f]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="fonte-impegno">{aDebito(tipo) ? "Importo deliberato" : "Impegno"} <span className="font-normal text-muted-foreground">(€)</span></Label>
            <Input id="fonte-impegno" inputMode="decimal" value={impegno} onChange={(e) => setImpegno(e.target.value)} aria-invalid={!!errori.impegno || undefined} />
            <Errore testo={errori.impegno} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fonte-inizio">{aPrestito(tipo) ? "Dal" : "Entra dal"} <span className="font-normal text-muted-foreground">(facoltativo)</span></Label>
            <Input id="fonte-inizio" type="date" value={inizio} onChange={(e) => setInizio(e.target.value)} />
          </div>
        </div>

        {aPrestito(tipo) && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fonte-tasso">Tasso annuo <span className="font-normal text-muted-foreground">(%)</span></Label>
              <Input id="fonte-tasso" inputMode="decimal" value={tasso} onChange={(e) => setTasso(e.target.value)} aria-invalid={!!errori.tasso || undefined} />
              <Errore testo={errori.tasso} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fonte-scadenza">Scadenza</Label>
              <Input id="fonte-scadenza" type="date" value={scadenza} onChange={(e) => setScadenza(e.target.value)} aria-invalid={!!errori.date || undefined} />
              <Errore testo={errori.date} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fonte-spese">Spese <span className="font-normal text-muted-foreground">(€, istruttoria, perizia, notaio…)</span></Label>
              <Input id="fonte-spese" inputMode="decimal" value={spese} onChange={(e) => setSpese(e.target.value)} aria-invalid={!!errori.spese || undefined} />
              <Errore testo={errori.spese} />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Interessi semplici su ogni euro, dal giorno {aDebito(tipo) ? "dell'erogazione" : "del versamento"} a quello del rimborso. Senza scadenza contano fino alla fine dell'operazione.
              {aDebito(tipo) && " Le erogazioni a SAL si registrano come movimenti; quelle non ancora fatte entrano quando il piano ne ha bisogno."}
            </p>
            <fieldset className="space-y-2 rounded-md border p-3 sm:col-span-2">
              <legend className="px-1 text-sm font-medium">Piano di rimborso</legend>
              <RadioGroup value={rimborso} onValueChange={(v) => setRimborso(v as PianoRimborso)} className="space-y-2">
                {PIANI_RIMBORSO.map((r) => (
                  <Label key={r} htmlFor={`fonte-rimborso-${r}`} className="flex gap-2 font-normal">
                    <RadioGroupItem id={`fonte-rimborso-${r}`} value={r} className="mt-0.5" />
                    <span>
                      <span className="block text-sm">{NOMI_RIMBORSO[r].nome}</span>
                      <span className="block text-xs text-muted-foreground">{NOMI_RIMBORSO[r].aiuto}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
              {rimborso === "rate" && (
                <div className="space-y-1.5 pl-6">
                  <Label htmlFor="fonte-ammortamento">Prima rata dal <span className="font-normal text-muted-foreground">(vuoto = dall'inizio)</span></Label>
                  <Input id="fonte-ammortamento" type="date" className="max-w-[12rem]" value={ammortamento} onChange={(e) => setAmmortamento(e.target.value)} />
                  <Errore testo={errori.rate} />
                </div>
              )}
            </fieldset>
          </div>
        )}

        {aCapitale(tipo) && (
          <fieldset className="space-y-2 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">Quanto utile gli spetta</legend>
            <RadioGroup value={quotaFissa ? "fissa" : "pro_quota"} onValueChange={(v) => setQuotaFissa(v === "fissa")} className="space-y-2">
              <Label htmlFor="fonte-pro-quota" className="flex gap-2 font-normal">
                <RadioGroupItem id="fonte-pro-quota" value="pro_quota" className="mt-0.5" />
                <span>
                  <span className="block text-sm">Pro quota</span>
                  <span className="block text-xs text-muted-foreground">In proporzione al capitale versato e ai giorni per cui resta nell'operazione.</span>
                </span>
              </Label>
              <Label htmlFor="fonte-fissa" className="flex gap-2 font-normal">
                <RadioGroupItem id="fonte-fissa" value="fissa" className="mt-0.5" />
                <span>
                  <span className="block text-sm">Quota fissa pattuita</span>
                  <span className="block text-xs text-muted-foreground">Una percentuale dell'utile decisa a prescindere dal capitale.</span>
                </span>
              </Label>
            </RadioGroup>
            {quotaFissa && (
              <div className="space-y-1.5 pl-6">
                <Label htmlFor="fonte-quota">Percentuale dell'utile</Label>
                <Input id="fonte-quota" inputMode="decimal" className="max-w-[10rem]" value={quota} onChange={(e) => setQuota(e.target.value)} aria-invalid={!!errori.quota || undefined} />
                <Errore testo={errori.quota} />
              </div>
            )}
          </fieldset>
        )}

        {tipo !== "propri" && (
          <div className="space-y-1.5">
            <Label htmlFor="fonte-email">Email per il rendiconto <span className="font-normal text-muted-foreground">(facoltativo)</span></Label>
            <Input id="fonte-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errori.email || undefined} />
            <Errore testo={errori.email} />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="fonte-nota">Note <span className="font-normal text-muted-foreground">(facoltativo)</span></Label>
          <Textarea id="fonte-nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={2000} />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button type="submit" disabled={salva.isPending}>
            {salva.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {fonte ? "Salva" : "Aggiungi"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
