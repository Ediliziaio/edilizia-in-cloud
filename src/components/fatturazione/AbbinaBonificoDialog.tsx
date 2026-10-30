import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Landmark, Loader2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { nomeCliente } from "@/lib/fatturazione/clienteSnapshot";
import { residuoDaIncassare } from "@/lib/fatturazione/incassi";
import {
  incassiSenzaBonifico,
  ordinaMovimentiPerFattura,
  type IncassoFattura,
  type Proposta,
} from "@/lib/fatturazione/abbinaBanca";
import { useAbbinaBonifico, useMovimentiBancaPerFattura } from "@/hooks/useIncassiFattura";
import type { DocumentoFiscale } from "@/types/fatturazione";

// «Abbina al movimento della banca» dalla fattura (30/10/2026): gli accrediti
// non ancora abbinati della banca collegata, prima i più probabili. Se il
// bonifico è un pagamento già registrato a mano, si abbina a quell'incasso e
// non se ne crea un secondo.

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doc: DocumentoFiscale;
  incassi: IncassoFattura[];
}

export function AbbinaBonificoDialog({ open, onOpenChange, doc, incassi }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {open && <Scelta doc={doc} incassi={incassi} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}

/** "nuovo" = registra un incasso dal bonifico; altrimenti l'id dell'incasso già registrato. */
type Destinazione = "nuovo" | string;

function Scelta({ doc, incassi, onOpenChange }: Omit<Props, "open">) {
  const banca = useMovimentiBancaPerFattura(doc.id, true);
  const abbina = useAbbinaBonifico();
  const [cerca, setCerca] = useState("");
  const [scelto, setScelto] = useState<Proposta | null>(null);
  const [destinazione, setDestinazione] = useState<Destinazione>("nuovo");

  const residuo = residuoDaIncassare(doc);
  const liberi = useMemo(() => incassiSenzaBonifico(incassi), [incassi]);
  const proposte = useMemo(
    () =>
      ordinaMovimentiPerFattura(
        banca.data?.movimenti ?? [],
        {
          numero: doc.numero,
          numero_progressivo: doc.numero_progressivo,
          anno: doc.anno,
          cliente: nomeCliente(doc.cliente_snapshot),
          residuo,
          data_emissione: doc.data_emissione,
        },
        incassi,
      ),
    [banca.data, doc, incassi, residuo],
  );
  const filtrate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    if (!q) return proposte.slice(0, 50);
    return proposte
      .filter(({ movimento: m }) =>
        `${m.descrizione ?? ""} ${m.controparte ?? ""} ${m.riferimento ?? ""} ${m.importo.toFixed(2).replace(".", ",")}`
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 50);
  }, [proposte, cerca]);

  const scegli = (p: Proposta) => {
    setScelto(p);
    // Già pagata per intero: il bonifico può solo essere la prova di un incasso esistente.
    if (p.incassoUguale) setDestinazione(p.incassoUguale.id);
    else if (residuo <= 0 && liberi[0]) setDestinazione(liberi[0].id);
    else setDestinazione("nuovo");
  };

  const conferma = () => {
    if (!scelto || abbina.isPending) return;
    abbina.mutate(
      {
        transactionId: scelto.movimento.id,
        documentoId: doc.id,
        movimentoId: destinazione === "nuovo" ? null : destinazione,
        punteggio: scelto.punteggio,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const nuovoPossibile = residuo > 0;
  const confermabile = scelto && (destinazione !== "nuovo" || nuovoPossibile);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Abbina al movimento della banca</DialogTitle>
        <DialogDescription className="max-sm:sr-only">
          Fattura n. {doc.numero}
          {residuo > 0 ? ` · da incassare ${formatCurrency(residuo)}` : " · già incassata"}. Scegli l'accredito che la paga.
        </DialogDescription>
      </DialogHeader>

      {banca.isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : banca.isError ? (
        <p className="text-sm text-destructive">{(banca.error as Error).message}</p>
      ) : !banca.data?.bancaCollegata ? (
        <div className="rounded-lg border border-dashed p-4 text-sm">
          <p className="font-medium">Nessuna banca collegata</p>
          <p className="mt-1 text-muted-foreground">
            Collega il conto in Tesoreria: i bonifici in entrata arrivano da soli e si abbinano alle fatture.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link to="/azienda/tesoreria" onClick={() => onOpenChange(false)}>
              <Landmark className="mr-1.5 h-4 w-4" /> Vai a Tesoreria
            </Link>
          </Button>
        </div>
      ) : proposte.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nessun accredito da abbinare dopo la data della fattura.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              placeholder="Cerca per causale, ordinante o importo"
              className="pl-8"
              aria-label="Cerca movimento"
            />
          </div>
          <ul className="max-h-72 space-y-1 overflow-y-auto pr-1" aria-label="Movimenti della banca">
            {filtrate.map((p) => {
              const m = p.movimento;
              const attivo = scelto?.movimento.id === m.id;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => scegli(p)}
                    aria-pressed={attivo}
                    className={cn(
                      "w-full rounded-md border p-2.5 text-left text-sm transition-colors hover:bg-muted/60",
                      attivo && "border-primary bg-primary/5",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold tabular-nums">{formatCurrency(m.importo)}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {m.data ? formatDateShort(m.data) : ""}
                        {m.conto ? ` · ${m.conto}` : ""}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {[m.controparte, m.descrizione].filter(Boolean).join(" — ") || "Senza causale"}
                    </p>
                    {p.motivi.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {p.motivi.map((motivo) => (
                          <Badge key={motivo} variant="secondary" className="text-[10px] font-normal">
                            {motivo}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {scelto && liberi.length > 0 && (
        <RadioGroup
          value={destinazione}
          onValueChange={setDestinazione}
          className="gap-2 rounded-lg bg-muted/50 p-3"
          aria-label="Cosa è questo bonifico"
        >
          {liberi.map((i) => (
            <div key={i.id} className="flex items-start gap-2">
              <RadioGroupItem value={i.id} id={`dest-${i.id}`} className="mt-0.5" />
              <Label htmlFor={`dest-${i.id}`} className="text-xs font-normal leading-snug">
                È l'incasso già registrato il {formatDateShort(i.data_movimento)} ({formatCurrency(i.importo)}): lo
                abbino, senza contarlo due volte
              </Label>
            </div>
          ))}
          <div className="flex items-start gap-2">
            <RadioGroupItem value="nuovo" id="dest-nuovo" disabled={!nuovoPossibile} className="mt-0.5" />
            <Label htmlFor="dest-nuovo" className={cn("text-xs font-normal leading-snug", !nuovoPossibile && "opacity-50")}>
              È un pagamento nuovo: registra l'incasso di {formatCurrency(Math.min(scelto.movimento.importo, Math.max(residuo, 0)))}
            </Label>
          </div>
        </RadioGroup>
      )}

      {scelto && liberi.length === 0 && nuovoPossibile && scelto.movimento.importo > residuo + 0.01 && (
        <p className="text-xs text-muted-foreground">
          L'accredito è più alto del residuo: si registra l'incasso di {formatCurrency(residuo)}.
        </p>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={abbina.isPending} className="max-sm:hidden">
          Annulla
        </Button>
        <Button onClick={conferma} disabled={!confermabile || abbina.isPending}>
          {abbina.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Abbina
        </Button>
      </DialogFooter>
    </>
  );
}
