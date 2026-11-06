import { useEffect, useRef } from "react";
import { useWarehouses, type Warehouse } from "@/hooks/useWarehouses";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { DocumentoOperativo } from "@/lib/documentiOperativi/modello";

type Props = {
  documento: DocumentoOperativo;
  onChange: (patch: Partial<DocumentoOperativo>) => void;
  commessaId: string | null;
};
export function DestinazioneDocumento({
  documento: d,
  onChange,
  commessaId,
}: Props) {
  const { warehouses, isLoading, error } = useWarehouses();
  const inizializzata = useRef(false);
  const tipo =
    d.destinazioneTipo ??
    (d.luogo ? "altro" : commessaId ? "cantiere" : "magazzino");
  const dati = (w: Warehouse) => ({
    magazzinoId: w.id,
    luogo: [w.name, w.address, w.postal_code, w.city, w.province]
      .filter(Boolean)
      .join(", "),
    referenteConsegna: [w.contact_name, w.contact_phone]
      .filter(Boolean)
      .join(" · "),
  });
  useEffect(() => {
    if (inizializzata.current || isLoading || error) return;
    inizializzata.current = true;
    if (tipo !== "magazzino") return;
    const w =
      warehouses.find((w) => w.id === d.magazzinoId) ??
      (!d.magazzinoId && !d.luogo
        ? warehouses.find((w) => w.is_default)
        : undefined);
    if (w) onChange(dati(w));
  }, [isLoading, error, warehouses, tipo, d.magazzinoId, d.luogo, onChange]);
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3 sm:col-span-2">
      <Label htmlFor="doc-destinazione-tipo">Dove consegnare / ritirare</Label>
      <div className="grid gap-3 sm:grid-cols-2">
        <select
          id="doc-destinazione-tipo"
          className="h-10 rounded-md border bg-white px-2 text-sm"
          value={tipo}
          onChange={(e) => {
            const value = e.target.value as NonNullable<
              DocumentoOperativo["destinazioneTipo"]
            >;
            if (value === "ritiro")
              onChange({
                destinazioneTipo: value,
                magazzinoId: null,
                luogo: d.ritiroIndirizzo || "",
                referenteConsegna: "",
                noteConsegna: d.ritiroNote || "",
              });
            else if (value === "magazzino") {
              const w =
                warehouses.find((w) => w.id === d.magazzinoId) ??
                warehouses.find((w) => w.is_default);
              onChange({
                destinazioneTipo: value,
                noteConsegna: "",
                ...(w
                  ? dati(w)
                  : { luogo: "", magazzinoId: null, referenteConsegna: "" }),
              });
            } else
              onChange({
                destinazioneTipo: value,
                magazzinoId: null,
                luogo: value === "cantiere" ? d.indirizzoCantiere || "" : "",
                referenteConsegna: "",
                noteConsegna: "",
              });
          }}
        >
          <option value="magazzino">Nostro magazzino</option>
          <option value="cantiere">Cantiere della commessa</option>
          <option value="ritiro" disabled={!d.fornitoreId}>
            Ritiro dal fornitore
          </option>
          <option value="altro">Altro indirizzo</option>
        </select>
        {tipo === "magazzino" && (
          <select
            aria-label="Magazzino di destinazione"
            value={d.magazzinoId || ""}
            disabled={isLoading}
            className="h-10 rounded-md border bg-white px-2 text-sm"
            onChange={(e) => {
              const w = warehouses.find((w) => w.id === e.target.value);
              if (w) onChange(dati(w));
              else
                onChange({
                  magazzinoId: null,
                  luogo: "",
                  referenteConsegna: "",
                  noteConsegna: "",
                });
            }}
          >
            <option value="">
              {isLoading ? "Caricamento…" : "Scegli magazzino"}
            </option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {w.is_default ? " (predefinito)" : ""}
              </option>
            ))}
          </select>
        )}
      </div>
      {error && tipo === "magazzino" && (
        <p role="alert" className="text-xs text-red-700">
          Magazzini non disponibili. Puoi indicare un altro indirizzo.
        </p>
      )}
      {tipo === "cantiere" && (
        <p className="text-xs text-slate-500">
          Seleziona la commessa per riportare il suo indirizzo di cantiere.
        </p>
      )}
      {tipo === "ritiro" && !d.ritiroIndirizzo && (
        <p className="text-xs text-amber-700">
          Completa l’indirizzo di ritiro: non è presente nell’anagrafica del
          fornitore.
        </p>
      )}
      <Label htmlFor="doc-luogo">
        Indirizzo completo di destinazione / ritiro
      </Label>
      <Input
        id="doc-luogo"
        value={d.luogo ?? ""}
        onChange={(e) => onChange({ luogo: e.target.value })}
        placeholder="Via, numero civico, CAP, città e provincia"
      />
      <Label htmlFor="doc-referente-consegna">
        Referente per la consegna / accesso
      </Label>
      <Input
        id="doc-referente-consegna"
        value={d.referenteConsegna ?? ""}
        onChange={(e) => onChange({ referenteConsegna: e.target.value })}
        placeholder="Nome, telefono ed eventuale email"
      />
    </div>
  );
}
