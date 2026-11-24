import { useState } from "react";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { AzioniProdotto, LayoutConfigurazione, type DopoAggiunta } from "./LayoutConfigurazione";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CatalogItem, ConfiguredItem } from "@/types/catalogItem";
import {
  configuraProdottoSemplice,
  descrizioneCommerciale,
} from "@/lib/preventivi/configurazioneSemplice";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const euro = (value: number) =>
  value.toLocaleString(intlCampo(), {
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
  inserimentoContinuo,
}: {
  item: CatalogItem;
  currentSortOrder: number;
  onBack: () => void;
  onAddItems: (items: ConfiguredItem[], next: number, dopo?: DopoAggiunta) => void;
  confirmLabel?: string;
  inserimentoContinuo?: boolean;
}) {
  const t = useT();
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
  function aggiungi(dopo?: DopoAggiunta) {
    if (!valido) return;
    onAddItems(
      [configuraProdottoSemplice(item, qty, vendita, currentSortOrder)],
      currentSortOrder + 1,
      dopo,
    );
  }
  return (
    <LayoutConfigurazione
      scelte={
        <>
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="-ml-2 text-muted-foreground max-sm:h-8"
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> {t("Cambia prodotto")}
      </Button>
      {codice && (
        <p className="text-xs text-muted-foreground">{t("Codice {codice} · Unità: {unit_of_measure}", { codice: String(codice ?? ""), unit_of_measure: String(item.unit_of_measure ?? "") })}</p>
      )}
      {descrizione && descrizione !== item.nome && (
        <p className="max-h-24 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">
          {descrizione}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_2fr]">
        <div className="space-y-2">
          <Label htmlFor="prodotto-quantita">{t("Quantità ({unita})", { unita: String(item.unit_of_measure ?? "") })}</Label>
          <Input
            id="prodotto-quantita"
            inputMode="decimal"
            value={quantita}
            onChange={(e) => setQuantita(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prodotto-vendita">
            {t("Prezzo di vendita unitario (€)")}
          </Label>
          <Input
            id="prodotto-vendita"
            inputMode="decimal"
            placeholder={t("Inserisci il prezzo cliente")}
            value={prezzo}
            onChange={(e) => setPrezzo(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {t("IVA esclusa · solo per questo preventivo")}
          </p>
        </div>
      </div>
        </>
      }
      riepilogo=
        <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <LockKeyhole className="h-3.5 w-3.5 shrink-0" />
        {t("Costo d’acquisto · solo interno:")}{" "}
        {costo != null ? euro(costo) : t("non disponibile")}
      </div>
      
      azioni={
        <>
      {!prezzo.trim() && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t("Il listino contiene i costi, non i prezzi cliente. Inserisci il prezzo di vendita per aggiungere il prodotto.")}
        </p>
      )}
      {prezzo.trim() && !valido && (
        <p role="alert" className="text-sm text-destructive">
          {t("Quantità e prezzo devono essere numeri maggiori di zero.")}
        </p>
      )}
      <div className="flex items-center justify-between border-t pt-3">
        <span className="text-sm text-muted-foreground">
          {t("Totale vendita")} <span className="block text-xs">{t("IVA esclusa")}</span>
        </span>
        <strong className="text-2xl tabular-nums">
          {valido ? euro(qty * vendita) : "—"}
        </strong>
      </div>
      <AzioniProdotto
        disabled={!valido}
        confirmLabel={confirmLabel ?? t("Aggiungi al preventivo")}
        inserimentoContinuo={inserimentoContinuo}
        onConferma={aggiungi}
      />
        </>
      }
    />
  );
}
