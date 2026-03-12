import { Plus, Trash2, PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useArticoliNative } from "@/hooks/useArticoliNative";
import { createEmptyRiga } from "./useEditorState";
import type { RigaDocumento, ArticoloNative } from "@/types/fatturazione";
import type { EditorState } from "./useEditorState";
import { useState } from "react";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<any>;
  disabled?: boolean;
}

export function EditorRigheSection({ state, dispatch, disabled }: Props) {
  const righe = state.righe ?? [];
  const { data: articoli } = useArticoliNative();
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");

  function addBlankRow() {
    dispatch({ type: "ADD_RIGA", riga: createEmptyRiga(righe.length + 1) });
  }

  function addFromCatalog(art: ArticoloNative) {
    const riga: RigaDocumento = {
      id: crypto.randomUUID(),
      numero_linea: righe.length + 1,
      codice_articolo: art.codice ?? undefined,
      descrizione: art.descrizione,
      quantita: 1,
      unita_misura: art.unita_misura,
      prezzo_unitario: art.prezzo_vendita,
      aliquota_iva: art.aliquota_iva,
      natura_iva: art.natura_iva as RigaDocumento["natura_iva"],
      imponibile: 0,
      imposta: 0,
      totale_riga: 0,
    };
    dispatch({ type: "ADD_RIGA", riga });
    setCatalogOpen(false);
    setCatalogSearch("");
  }

  function updateField(index: number, field: keyof RigaDocumento, value: unknown) {
    dispatch({ type: "UPDATE_RIGA", index, riga: { [field]: value } });
  }

  const filteredArticoli = (articoli ?? []).filter((a) =>
    !catalogSearch ||
    a.descrizione.toLowerCase().includes(catalogSearch.toLowerCase()) ||
    (a.codice && a.codice.toLowerCase().includes(catalogSearch.toLowerCase()))
  ).slice(0, 10);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Righe documento</Label>
        {!disabled && (
          <div className="flex gap-1">
            <Popover open={catalogOpen} onOpenChange={setCatalogOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs">
                  <PackageSearch className="h-3 w-3 mr-1" />
                  Da catalogo
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-2" align="end">
                <Input
                  placeholder="Cerca articolo..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="h-8 text-sm mb-2"
                />
                <div className="max-h-48 overflow-auto space-y-0.5">
                  {filteredArticoli.map((art) => (
                    <button
                      key={art.id}
                      className="w-full text-left px-2 py-1.5 hover:bg-accent rounded text-sm"
                      onClick={() => addFromCatalog(art)}
                    >
                      <div className="font-medium truncate">{art.descrizione}</div>
                      <div className="text-xs text-muted-foreground">
                        €{art.prezzo_vendita.toFixed(2)} · IVA {art.aliquota_iva}%
                      </div>
                    </button>
                  ))}
                  {filteredArticoli.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      Nessun articolo trovato
                    </p>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addBlankRow}>
              <Plus className="h-3 w-3 mr-1" />
              Riga vuota
            </Button>
          </div>
        )}
      </div>

      {righe.length === 0 ? (
        <div className="border border-dashed rounded-lg py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nessuna riga. Aggiungi articoli dal catalogo o una riga vuota.
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[2rem_1fr_4rem_3.5rem_5rem_3.5rem_3.5rem_5rem_2rem] gap-1 px-2 py-1.5 bg-muted/50 text-xs font-medium text-muted-foreground">
            <span>#</span>
            <span>Descrizione</span>
            <span>Qtà</span>
            <span>U.M.</span>
            <span>Prezzo</span>
            <span>Sc.%</span>
            <span>IVA%</span>
            <span className="text-right">Totale</span>
            <span />
          </div>

          {/* Rows */}
          {righe.map((riga, i) => (
            <div
              key={riga.id}
              className="grid grid-cols-[2rem_1fr_4rem_3.5rem_5rem_3.5rem_3.5rem_5rem_2rem] gap-1 px-2 py-1 border-t items-center"
            >
              <span className="text-xs text-muted-foreground">{i + 1}</span>
              <Input
                value={riga.descrizione}
                onChange={(e) => updateField(i, "descrizione", e.target.value)}
                className="h-7 text-xs border-0 bg-transparent px-1"
                disabled={disabled}
              />
              <Input
                type="number"
                value={riga.quantita}
                onChange={(e) => updateField(i, "quantita", parseFloat(e.target.value) || 0)}
                className="h-7 text-xs border-0 bg-transparent px-1"
                disabled={disabled}
              />
              <Input
                value={riga.unita_misura}
                onChange={(e) => updateField(i, "unita_misura", e.target.value)}
                className="h-7 text-xs border-0 bg-transparent px-1"
                disabled={disabled}
              />
              <Input
                type="number"
                step="0.01"
                value={riga.prezzo_unitario}
                onChange={(e) => updateField(i, "prezzo_unitario", parseFloat(e.target.value) || 0)}
                className="h-7 text-xs border-0 bg-transparent px-1"
                disabled={disabled}
              />
              <Input
                type="number"
                step="0.01"
                value={riga.sconto_percentuale ?? ""}
                onChange={(e) => updateField(i, "sconto_percentuale", parseFloat(e.target.value) || 0)}
                className="h-7 text-xs border-0 bg-transparent px-1"
                placeholder="0"
                disabled={disabled}
              />
              <Input
                value={riga.aliquota_iva}
                onChange={(e) => updateField(i, "aliquota_iva", e.target.value)}
                className="h-7 text-xs border-0 bg-transparent px-1"
                disabled={disabled}
              />
              <span className="text-xs font-medium text-right tabular-nums">
                €{riga.totale_riga.toFixed(2)}
              </span>
              {!disabled && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => dispatch({ type: "REMOVE_RIGA", index: i })}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
