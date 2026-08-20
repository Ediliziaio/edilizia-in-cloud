/**
 * TariffePickerDialog — cerca una voce del listino tariffe e mettila nel
 * preventivo. Colma il buco storico del builder unificato: manodopera,
 * trasporti e noli entravano solo auto-agganciati o "il primo del tipo",
 * senza mai poter scegliere dal listino su cui l'azienda lavora.
 */
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatters";
import type { TariffaPro } from "@/hooks/usePreventivoCosti";

const ETICHETTE_TIPO: Record<string, string> = {
  posa: "Posa",
  trasporto: "Trasporto",
  smaltimento: "Smaltimento",
  nolo: "Nolo",
  tiro_piano: "Tiro al piano",
  manodopera: "Manodopera",
};

export function TariffePickerDialog({
  open,
  onClose,
  tariffe,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  tariffe: TariffaPro[];
  onPick: (tariffa: TariffaPro) => void;
}) {
  const [cerca, setCerca] = useState("");

  const filtrate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    if (!q) return tariffe.slice(0, 50);
    return tariffe
      .filter((t) =>
        [t.nome, t.tipo, t.unita, t.unita_fatturazione ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 50);
  }, [tariffe, cerca]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setCerca(""); onClose(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Voce dal listino tariffe</DialogTitle>
          <DialogDescription>
            Cerca per nome o tipo: la voce entra nel preventivo col prezzo del
            listino, poi quantità e prezzo restano modificabili sulla riga.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="Cerca: demolizione, posa, nolo piattaforma…"
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
        />
        <div className="max-h-72 overflow-y-auto space-y-1">
          {filtrate.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nessuna voce trovata nel listino.
            </p>
          )}
          {filtrate.map((t) => (
            <Button
              key={t.id}
              variant="ghost"
              className="w-full justify-between h-auto py-2 px-2 text-left"
              onClick={() => { onPick(t); setCerca(""); onClose(); }}
            >
              <span className="flex flex-col items-start gap-0.5 min-w-0">
                <span className="text-sm font-medium truncate w-full">{t.nome}</span>
                <span className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px] py-0">
                    {ETICHETTE_TIPO[t.tipo] ?? t.tipo}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {t.unita_fatturazione ?? t.unita}
                  </span>
                </span>
              </span>
              <span className="text-sm tabular-nums font-medium shrink-0 ml-2">
                {formatCurrency(t.prezzo_vendita)}
              </span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
