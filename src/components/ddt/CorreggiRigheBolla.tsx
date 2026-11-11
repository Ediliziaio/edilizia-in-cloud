import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { importoRiga } from "@/lib/ddt/letturaAI";
import type { DDTRigaNuova } from "@/hooks/useDDTRicezione";
export function CorreggiRigheBolla({
  file,
  righe,
  onChange,
  disabled,
}: {
  file: File;
  righe: DDTRigaNuova[];
  onChange: (r: DDTRigaNuova[]) => void;
  disabled: boolean;
}) {
  const [aperto, setAperto] = useState(false);
  const preview = useRef<HTMLIFrameElement & HTMLImageElement>(null);
  useEffect(() => {
    if (!aperto || !preview.current) return;
    const u = URL.createObjectURL(file);
    preview.current.src = u;
    return () => URL.revokeObjectURL(u);
  }, [aperto, file]);
  const cambia = (i: number, patch: Partial<DDTRigaNuova>) =>
    onChange(
      righe.map((r, j) => {
        if (i !== j) return r;
        const nuova = {
          ...r,
          ...patch,
          purchase_order_item_id: null as string | null,
          abbinamento: null as "auto" | "manuale" | null,
          origine: "manuale" as const,
        };
        return { ...nuova, importo: importoRiga({ ...nuova, importo: null }) };
      }),
    );
  return (
    <div className="space-y-3">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => setAperto((v) => !v)}
      >
        {aperto ? "Chiudi correzione" : "Correggi righe con originale a fianco"}
      </Button>
      {aperto && (
        <div className="grid gap-3 xl:grid-cols-2">
          <div className="overflow-hidden rounded-lg border bg-muted/20">
            {file.type === "application/pdf" || /\.pdf$/i.test(file.name) ? (
              <iframe
                title={`Originale ${file.name}`}
                ref={preview}
                className="h-[520px] w-full"
              />
            ) : (
              <img
                alt={`Originale ${file.name}`}
                ref={preview}
                className="max-h-[600px] w-full object-contain"
              />
            )}
          </div>
          <div className="max-h-[600px] space-y-3 overflow-y-auto">
            {righe.map((r, i) => (
              <fieldset
                key={i}
                className="space-y-2 rounded-lg border p-3"
                disabled={disabled}
              >
                <legend className="px-1 text-xs font-medium">
                  Riga {i + 1}
                  {r.origine === "manuale"
                    ? " · corretta a mano"
                    : " · letta dall’AI"}
                </legend>
                <label className="block text-xs">
                  Descrizione
                  <Input
                    aria-label={`Descrizione riga ${i + 1}`}
                    value={r.descrizione}
                    onChange={(e) => cambia(i, { descrizione: e.target.value })}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs">
                    Codice
                    <Input
                      aria-label={`Codice riga ${i + 1}`}
                      value={r.codice_articolo ?? ""}
                      onChange={(e) =>
                        cambia(i, { codice_articolo: e.target.value || null })
                      }
                    />
                  </label>
                  <label className="text-xs">
                    Unità di misura
                    <Input
                      aria-label={`UM riga ${i + 1}`}
                      value={r.unita_misura ?? ""}
                      onChange={(e) =>
                        cambia(i, { unita_misura: e.target.value || null })
                      }
                    />
                  </label>
                  <label className="text-xs">
                    Quantità
                    <Input
                      aria-label={`Quantità riga ${i + 1}`}
                      type="number"
                      min="0"
                      step="any"
                      value={r.quantita ?? ""}
                      onChange={(e) =>
                        cambia(i, {
                          quantita:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="text-xs">
                    Prezzo unitario (facoltativo)
                    <Input
                      aria-label={`Prezzo riga ${i + 1}`}
                      type="number"
                      min="0"
                      step="any"
                      value={r.prezzo_unitario ?? ""}
                      onChange={(e) =>
                        cambia(i, {
                          prezzo_unitario:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    onChange(
                      righe
                        .filter((_, j) => i !== j)
                        .map((x, j) => ({ ...x, posizione: j + 1 })),
                    )
                  }
                >
                  Togli riga {i + 1}
                </Button>
              </fieldset>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() =>
                onChange([
                  ...righe,
                  {
                    posizione: righe.length + 1,
                    descrizione: "",
                    codice_articolo: null,
                    unita_misura: null,
                    quantita: null,
                    prezzo_unitario: null,
                    importo: null,
                    iva_percentuale: null,
                    order_item_id: null,
                    origine: "manuale",
                    testo_grezzo: null,
                    note: null,
                  },
                ])
              }
            >
              Aggiungi riga mancante
            </Button>
            <p className="text-xs text-muted-foreground">
              Le modifiche restano nella bozza fino alla registrazione. Prezzo
              vuoto significa da definire.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
