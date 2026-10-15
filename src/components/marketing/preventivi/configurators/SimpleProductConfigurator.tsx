import { useState } from "react";
import { ArrowLeft, Plus, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CatalogItem, ConfiguredItem } from "@/types/catalogItem";
import {
  configuraProdottoSemplice,
  descrizioneCommerciale,
} from "@/lib/preventivi/configurazioneSemplice";

const euro = (value: number) =>
  value.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 4,
  });

export function SimpleProductConfigurator({
  item,
  currentSortOrder,
  onBack,
  onAddItems,
  confirmLabel,
}: {
  item: CatalogItem;
  currentSortOrder: number;
  onBack: () => void;
  onAddItems: (items: ConfiguredItem[], next: number) => void;
  confirmLabel?: string;
}) {
  const [quantita, setQuantita] = useState("1");
  const [prezzo, setPrezzo] = useState(
    item.prezzo_base_vendita > 0 ? String(item.prezzo_base_vendita) : "",
  );
  const qty = Number(quantita.replace(",", "."));
  const vendita = Number(prezzo.replace(",", "."));
  const costo =
    item.source === "family"
      ? item.family.prezzo_base_acquisto
      : item.article.prezzo_acquisto_netto;
  const valido = qty > 0 && vendita > 0 && Number.isFinite(qty * vendita);
  const descrizione = descrizioneCommerciale(item.descrizione);
  const codice = item.source === "article" ? item.sku : item.family.codice;
  function aggiungi() {
    if (!valido) return;
    onAddItems(
      [configuraProdottoSemplice(item, qty, vendita, currentSortOrder)],
      currentSortOrder + 1,
    );
  }
  return (
    <div className="space-y-5">
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="-ml-2 text-muted-foreground"
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> Cambia prodotto
      </Button>
      {codice && (
        <p className="text-xs text-muted-foreground">
          Codice {codice} · Unità: {item.unit_of_measure}
        </p>
      )}
      {descrizione && descrizione !== item.nome && (
        <p className="max-h-24 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">
          {descrizione}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_2fr]">
        <div className="space-y-2">
          <Label htmlFor="prodotto-quantita">
            Quantità ({item.unit_of_measure})
          </Label>
          <Input
            id="prodotto-quantita"
            inputMode="decimal"
            value={quantita}
            onChange={(e) => setQuantita(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prodotto-vendita">
            Prezzo di vendita unitario (€)
          </Label>
          <Input
            id="prodotto-vendita"
            inputMode="decimal"
            placeholder="Inserisci il prezzo cliente"
            value={prezzo}
            onChange={(e) => setPrezzo(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            IVA esclusa · solo per questo preventivo
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <LockKeyhole className="h-3.5 w-3.5 shrink-0" />
        Costo d’acquisto · solo interno:{" "}
        {costo != null ? euro(costo) : "non disponibile"}
      </div>
      {!prezzo.trim() && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Il listino contiene i costi, non i prezzi cliente. Inserisci il prezzo
          di vendita per aggiungere il prodotto.
        </p>
      )}
      {prezzo.trim() && !valido && (
        <p role="alert" className="text-sm text-destructive">
          Quantità e prezzo devono essere numeri maggiori di zero.
        </p>
      )}
      <div className="flex items-center justify-between border-t pt-4">
        <span className="text-sm text-muted-foreground">
          Totale vendita <span className="block text-xs">IVA esclusa</span>
        </span>
        <strong className="text-2xl tabular-nums">
          {valido ? euro(qty * vendita) : "—"}
        </strong>
      </div>
      <Button
        variant="brand"
        className="w-full"
        disabled={!valido}
        onClick={aggiungi}
      >
        <Plus className="mr-2 h-4 w-4" />
        {confirmLabel ?? "Aggiungi al preventivo"}
      </Button>
    </div>
  );
}
