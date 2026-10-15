import { useState } from "react";
import { ArrowLeft, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CatalogItem, ConfiguredItem } from "@/types/catalogItem";
import { configuraProdottoSemplice } from "@/lib/preventivi/configurazioneSemplice";
import { formatCurrency } from "@/lib/formatters";

const numero = (value: string) => Number(value.replace(",", "."));
export function BatchProductConfigurator({
  items,
  currentSortOrder,
  onBack,
  onAddItems,
  onRemove,
}: {
  items: CatalogItem[];
  currentSortOrder: number;
  onBack: () => void;
  onAddItems: (items: ConfiguredItem[], next: number) => void;
  onRemove: (item: CatalogItem) => void;
}) {
  const [valori, setValori] = useState<
    Record<string, { quantita: string; prezzo: string }>
  >({});
  const righe = items.map((item) => ({
    item,
    ...(valori[`${item.source}:${item.id}`] ?? {
      quantita: "1",
      prezzo:
        item.prezzo_base_vendita > 0 ? String(item.prezzo_base_vendita) : "",
    }),
  }));
  const setRighe = (aggiorna: (prev: typeof righe) => typeof righe) =>
    setValori((prev) => {
      const correnti = items.map((item) => ({
        item,
        ...(prev[`${item.source}:${item.id}`] ?? {
          quantita: "1",
          prezzo:
            item.prezzo_base_vendita > 0
              ? String(item.prezzo_base_vendita)
              : "",
        }),
      }));
      return {
        ...prev,
        ...Object.fromEntries(
          aggiorna(correnti).map((riga) => [
            `${riga.item.source}:${riga.item.id}`,
            { quantita: riga.quantita, prezzo: riga.prezzo },
          ]),
        ),
      };
    });
  const [quantitaComune, setQuantitaComune] = useState("");
  const [prezzoComune, setPrezzoComune] = useState("");
  const valida = (riga: (typeof righe)[number]) =>
    numero(riga.quantita) > 0 &&
    numero(riga.prezzo) > 0 &&
    Number.isFinite(numero(riga.quantita) * numero(riga.prezzo));
  const incomplete = righe.filter((riga) => !valida(riga)).length;
  const totale = righe
    .filter(valida)
    .reduce(
      (somma, riga) => somma + numero(riga.quantita) * numero(riga.prezzo),
      0,
    );
  function modifica(
    index: number,
    campo: "quantita" | "prezzo",
    valore: string,
  ) {
    setRighe((prev) =>
      prev.map((riga, i) =>
        i === index ? { ...riga, [campo]: valore } : riga,
      ),
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Torna alla selezione
        </Button>
        <span className="text-sm text-muted-foreground">
          {righe.length} prodotti ·{" "}
          {incomplete ? `${incomplete} da completare` : "pronti da aggiungere"}
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
        <label className="space-y-1 text-xs font-medium">
          Quantità per tutti
          <Input
            aria-label="Quantità per tutti"
            className="w-32"
            inputMode="decimal"
            placeholder="Lascia invariata"
            value={quantitaComune}
            onChange={(e) => setQuantitaComune(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-xs font-medium">
          Prezzo cliente per tutti (€)
          <Input
            aria-label="Prezzo cliente per tutti"
            className="w-44"
            inputMode="decimal"
            placeholder="Lascia invariato"
            value={prezzoComune}
            onChange={(e) => setPrezzoComune(e.target.value)}
          />
        </label>
        <Button
          variant="outline"
          disabled={
            (!quantitaComune.trim() && !prezzoComune.trim()) ||
            (!!quantitaComune.trim() &&
              (!Number.isFinite(numero(quantitaComune)) ||
                numero(quantitaComune) <= 0)) ||
            (!!prezzoComune.trim() &&
              (!Number.isFinite(numero(prezzoComune)) ||
                numero(prezzoComune) <= 0))
          }
          onClick={() =>
            setRighe((prev) =>
              prev.map((riga) => ({
                ...riga,
                quantita: quantitaComune.trim() || riga.quantita,
                prezzo: prezzoComune.trim() || riga.prezzo,
              })),
            )
          }
        >
          Applica a tutti
        </Button>
        <p className="w-full text-xs text-muted-foreground">
          Le modifiche valgono solo per questo preventivo, non aggiornano il
          listino.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="p-3">Prodotto</th>
              <th className="p-3">Costo interno</th>
              <th className="p-3">Quantità</th>
              <th className="p-3">Prezzo cliente (€)</th>
              <th className="p-3 text-right">Totale</th>
              <th className="p-3">
                <span className="sr-only">Rimuovi</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {righe.map((riga, index) => {
              const costo =
                riga.item.source === "family"
                  ? riga.item.family.prezzo_base_acquisto
                  : riga.item.article.prezzo_acquisto_netto;
              return (
                <tr
                  key={`${riga.item.source}:${riga.item.id}`}
                  className="border-t align-middle"
                >
                  <td className="p-3 font-medium">
                    {riga.item.nome}
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      Unità: {riga.item.unit_of_measure}
                    </span>
                  </td>
                  <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">
                    {costo == null ? "Non disponibile" : costo.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 4 })}
                  </td>
                  <td className="p-3">
                    <Input
                      aria-label={`Quantità ${riga.item.nome}`}
                      className="w-24"
                      aria-invalid={!Number.isFinite(numero(riga.quantita)) || numero(riga.quantita) <= 0}
                      inputMode="decimal"
                      value={riga.quantita}
                      onChange={(e) =>
                        modifica(index, "quantita", e.target.value)
                      }
                    />
                  </td>
                  <td className="p-3">
                    <Input
                      aria-label={`Prezzo cliente ${riga.item.nome}`}
                      className={`w-36 ${!valida(riga) ? "border-amber-300 bg-amber-50/40" : ""}`}
                      aria-invalid={!Number.isFinite(numero(riga.prezzo)) || numero(riga.prezzo) <= 0}
                      inputMode="decimal"
                      placeholder="Da definire"
                      value={riga.prezzo}
                      onChange={(e) =>
                        modifica(index, "prezzo", e.target.value)
                      }
                    />
                  </td>
                  <td className="p-3 text-right whitespace-nowrap font-medium">
                    {valida(riga)
                      ? formatCurrency(
                          numero(riga.quantita) * numero(riga.prezzo),
                        )
                      : "—"}
                  </td>
                  <td className="p-3">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Rimuovi ${riga.item.nome}`}
                      onClick={() =>
                        onRemove(riga.item)
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div>
          <p className="text-xs text-muted-foreground">
            {incomplete ? "Totale parziale" : "Totale vendita"} · IVA esclusa
          </p>
          <strong className="text-2xl tabular-nums">
            {formatCurrency(totale)}
          </strong>
          {incomplete > 0 && (
            <p role="status" className="mt-1 text-xs text-amber-800">
              Completa quantità e prezzi delle {incomplete} righe indicate.
            </p>
          )}
        </div>
        <Button
          variant="brand"
          disabled={!righe.length || incomplete > 0 || !Number.isFinite(totale)}
          onClick={() => {
            const configurate = righe.map((riga, index) =>
              configuraProdottoSemplice(
                riga.item,
                numero(riga.quantita),
                numero(riga.prezzo),
                currentSortOrder + index,
              ),
            );
            onAddItems(configurate, currentSortOrder + configurate.length);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Aggiungi {righe.length} prodotti al preventivo
        </Button>
      </div>
    </div>
  );
}
