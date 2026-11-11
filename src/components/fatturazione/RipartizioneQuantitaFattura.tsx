import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Calculator, Loader2 } from "lucide-react";
import { documentiDb as db } from "@/lib/ddt/documentiPersistenti";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { messaggioSalvataggio } from "@/lib/fatturazione/salvataggioFattura";
import {
  preparaQuote,
  quoteDaSalvare,
  type QuotaFattura,
} from "../../../supabase/functions/_shared/ripartizioneFatture.ts";
import type { ContestoRiconciliazione } from "../../../supabase/functions/_shared/riconciliazioneFattureAI.ts";
import type { AnalisiFatturaAI } from "@/hooks/useRiconciliazioneFatturaAI";
export function RipartizioneQuantitaFattura({
  analisi,
  contesto,
  impronta,
  puoModificare,
}: {
  analisi: AnalisiFatturaAI;
  contesto: ContestoRiconciliazione;
  impronta: string;
  puoModificare: boolean;
}) {
  const [aperta, setAperta] = useState(false);
  const [quote, setQuote] = useState<QuotaFattura[]>(() =>
    preparaQuote(contesto, analisi.proposta, analisi.decisioni),
  );
  const [completa, setCompleta] = useState(analisi.quantita_complete ?? false);
  const qc = useQueryClient();
  const salva = useMutation({
    mutationFn: async () => {
      const righe = quoteDaSalvare(quote);
      const { data, error } = await db.rpc("fattura_riconciliazione_imputa", {
        p_analisi: analisi.id,
        p_impronta: impronta,
        p_righe: righe,
        p_revisione: analisi.revisione,
        p_completa: completa,
      });
      if (error) throw error;
      if (!data) throw new Error("Ripartizione non salvata.");
      return data;
    },
    onSuccess: async () => {
      await Promise.all(
        [
          "fattura-riconciliazione-ai",
          "fattura-confronto",
          "fattura-collegamenti",
          "ddt-fatture",
          "ddt-righe",
        ].map((k) => qc.invalidateQueries({ queryKey: [k] })),
      );
      setAperta(false);
    },
  });
  const modifica = (
    id: string,
    key: keyof QuotaFattura,
    value: string | boolean,
  ) =>
    setQuote((v) =>
      v.map((r) => (r.chiave === id ? { ...r, [key]: value } : r)),
    );
  const campi: [keyof QuotaFattura, string][] = [
    ["quantita_fattura", "Quantità fattura"],
    ["unita_fattura", "UM fattura"],
    ["unita_ddt", "UM DDT"],
    ["fattore", "Fattore"],
  ];
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={!puoModificare}
        onClick={() => {
          setQuote(preparaQuote(contesto, analisi.proposta, analisi.decisioni));
          setCompleta(analisi.quantita_complete ?? false);
          salva.reset();
          setAperta(true);
        }}
      >
        <Calculator className="mr-1 h-3.5 w-3.5" />
        Ripartisci quantità
      </Button>
      <Dialog open={aperta} onOpenChange={setAperta}>
        <DialogContent className="flex max-h-[90dvh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b p-5 pr-12">
            <DialogTitle>Quantità della fattura sui DDT</DialogTitle>
            <DialogDescription>
              Conferma le quantità da attribuire a ciascuna bolla. Un fattore 25
              significa che 1 unità in fattura corrisponde a 25 unità del DDT.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-3 overflow-auto p-5">
            {!quote.length && (
              <p className="rounded border border-dashed p-4 text-sm text-muted-foreground">
                Conferma prima gli abbinamenti ai DDT. Per una nota di credito
                serve anche la ripartizione della fattura originale.
              </p>
            )}
            {quote.map((r) => (
              <div key={r.chiave} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap justify-between gap-2 text-xs">
                  <strong>{r.descrizione}</strong>
                  <span className="text-muted-foreground">{r.documento}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Quantità voce: {r.massimo} · Residuo bolla:{" "}
                  {r.residuo ?? "da verificare"} {r.unita_ddt}
                  {r.incerto ? " · Altre fatture da controllare" : ""}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {campi.map(([campo, label]) => (
                    <label
                      key={campo}
                      className="text-xs text-muted-foreground"
                    >
                      {label}
                      <input
                        aria-label={`${label} ${r.chiave}`}
                        className="mt-1 h-9 w-full rounded border bg-background px-2 text-foreground"
                        inputMode={
                          campo === "fattore" || campo === "quantita_fattura"
                            ? "decimal"
                            : undefined
                        }
                        value={String(r[campo] ?? "")}
                        onChange={(e) =>
                          modifica(r.chiave, campo, e.target.value)
                        }
                      />
                    </label>
                  ))}
                </div>
                {r.incerto && (
                  <label className="flex items-start gap-2 rounded bg-amber-50 p-2 text-xs text-amber-900">
                    <input
                      type="checkbox"
                      checked={r.conferma_residuo}
                      onChange={(e) =>
                        modifica(r.chiave, "conferma_residuo", e.target.checked)
                      }
                    />
                    Ho controllato le altre fatture collegate e confermo questa
                    quantità disponibile.
                  </label>
                )}
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
                  {(
                    [
                      "conferma_unita",
                      "conferma_conversione",
                      "ricorda_conversione",
                    ] as const
                  ).map((key, i) => (
                    <label key={key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={r[key]}
                        onChange={(e) =>
                          modifica(r.chiave, key, e.target.checked)
                        }
                      />
                      {
                        [
                          "Confermo le unità mancanti",
                          "Confermo il fattore di conversione",
                          "Ricorda il fattore per questo articolo e fornitore",
                        ][i]
                      }
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <footer className="space-y-3 border-t bg-muted/10 p-4">
            {salva.isError && (
              <p role="alert" className="text-xs text-red-700">
                {messaggioSalvataggio(salva.error)}
              </p>
            )}
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={completa}
                onChange={(e) => setCompleta(e.target.checked)}
              />
              Confermo di avere ripartito tutte le quantità materiali della
              fattura. I servizi senza DDT restano fuori dalla ripartizione.
            </label>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Le quantità verranno considerate anche nelle altre fatture
                collegate.
              </p>
              <Button
                size="sm"
                disabled={salva.isPending || !puoModificare || !quote.length}
                onClick={() => salva.mutate()}
              >
                {salva.isPending && (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                )}
                Salva quantità
              </Button>
            </div>
          </footer>
        </DialogContent>
      </Dialog>
    </>
  );
}
