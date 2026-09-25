/**
 * Pagina: Listini Serramenti → Matrice prezzi (Editor Excel-like).
 *
 * STEP 4 — gated da `listini_serramenti_avanzati`.
 *
 * Flow:
 *   1) Utente seleziona una famiglia (vertical=serramentista).
 *   2) Utente seleziona un fornitore (supplier_catalog) dell'azienda.
 *   3) Utente seleziona una linea prodotto (profilo del fornitore).
 *   4) Solo quando tutti e 3 i valori sono scelti viene renderizzato
 *      `<MatriceEditor />` che compila la matrice prezzi persistita in
 *      `listino_griglia` con FK su supplier_catalog_id + supplier_product_line_id.
 *
 * Guardrail:
 *   - Feature flag check a livello pagina (simmetrico con ListiniFornitori).
 *   - Empty states con CTA: "Nessun fornitore? Vai alla pagina Fornitori."
 *   - Solo famiglie vertical=serramentista (il catalogo base include le 20
 *     tipologie seed + eventuali custom dell'azienda).
 *
 * Nota wiring wizard preventivo: arriva in STEP 6. Qui solo data entry.
 */

import { useMemo, useState } from "react";
import { Info, Loader2 } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFamilies } from "@/hooks/useFamilies";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { MatriceEditor } from "../components/MatriceEditor";
import { useListiniFeature } from "../hooks/useListiniFeature";
import { useSupplierCatalogs } from "../hooks/useSupplierCatalogs";
import { useSupplierProductLines } from "../hooks/useSupplierProductLines";

const SENTINEL_UNSELECTED = "";

export default function MatriceListiniPage() {
  const { enabled, isLoading: flagLoading } = useListiniFeature();
  const { role } = useAuth();
  const permessi = usePermissions();
  // La pagina si apre col permesso di vedere il listino; le celle le salva chi
  // può modificarlo, come nel resto del listino.
  const puoModificare = role === "company_admin" || role === "super_admin" || permessi.canEditSettingsPricing;

  // Caricamento dati in parallelo (TanStack gestisce dedup)
  const {
    families,
    isLoading: famLoading,
    isError: famError,
    refetch: refetchFamilies,
  } = useFamilies();
  const {
    suppliers,
    isLoading: supLoading,
    isError: supError,
    refetch: refetchSuppliers,
  } = useSupplierCatalogs();

  const [familyId, setFamilyId] = useState<string>(SENTINEL_UNSELECTED);
  const [supplierId, setSupplierId] = useState<string>(SENTINEL_UNSELECTED);
  const [productLineId, setProductLineId] = useState<string>(SENTINEL_UNSELECTED);

  // Linee prodotto dipendono dal fornitore selezionato.
  const { lines, isLoading: linesLoading } = useSupplierProductLines({
    supplierCatalogId: supplierId || null,
    enabled: !!supplierId,
  });

  // Filtriamo famiglie al solo vertical serramentista — la pagina è dedicata
  // a questo segmento. Evita di mostrare famiglie generiche o altri vertical.
  const serramentiFamilies = useMemo(
    () => families.filter((f) => f.vertical === "serramentista"),
    [families],
  );

  const selectedFamily = useMemo(
    () => serramentiFamilies.find((f) => f.id === familyId) ?? null,
    [serramentiFamilies, familyId],
  );
  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) ?? null,
    [suppliers, supplierId],
  );
  const selectedProductLine = useMemo(
    () => lines.find((l) => l.id === productLineId) ?? null,
    [lines, productLineId],
  );

  // ─── Early returns ─────────────────────────────────────────────────────────

  if (flagLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2
          className="h-6 w-6 animate-spin text-muted-foreground"
          aria-hidden
        />
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="container mx-auto p-4 md:p-6 max-w-3xl">
        <Alert>
          <Info className="h-4 w-4" aria-hidden />
          <AlertTitle>Funzionalità non disponibile</AlertTitle>
          <AlertDescription>
            I listini serramenti avanzati sono una feature opt-in dedicata alle
            aziende serramentiste. Contatta il supporto per attivarla.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4 max-w-6xl">
      <header className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
          Listini Serramenti — Matrice prezzi
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Compila la matrice prezzi per la combinazione{" "}
          <strong>famiglia × fornitore × linea prodotto</strong>. Inserisci i
          prezzi di <em>listino</em>: acquisto e vendita sono calcolati
          automaticamente dalla formula (sconto fornitore + ricarico azienda).
        </p>
      </header>

      {/* Pannello selettori */}
      <Card className="sticky top-0 z-20 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm sm:text-base">Seleziona combinazione</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
          {/* Famiglia */}
          <div className="space-y-2">
            <Label htmlFor="sel-famiglia">Famiglia serramento</Label>
            {famLoading ? (
              <div className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Caricamento…
              </div>
            ) : famError ? (
              <button
                type="button"
                className="w-full rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-left text-sm text-destructive"
                onClick={() => void refetchFamilies()}
              >
                Errore caricamento · riprova
              </button>
            ) : serramentiFamilies.length === 0 ? (
              <Alert>
                <Info className="h-4 w-4" aria-hidden />
                <AlertDescription className="text-xs">
                  Nessuna famiglia serramentista trovata. Installa il catalogo
                  base dalla pagina Listini.
                </AlertDescription>
              </Alert>
            ) : (
              <Select value={familyId} onValueChange={setFamilyId}>
                <SelectTrigger id="sel-famiglia" aria-label="Seleziona famiglia">
                  <SelectValue placeholder="Scegli una famiglia…" />
                </SelectTrigger>
                <SelectContent>
                  {serramentiFamilies.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Fornitore */}
          <div className="space-y-2">
            <Label htmlFor="sel-fornitore">Fornitore</Label>
            {supLoading ? (
              <div className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Caricamento…
              </div>
            ) : supError ? (
              <button
                type="button"
                className="w-full rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-left text-sm text-destructive"
                onClick={() => void refetchSuppliers()}
              >
                Errore caricamento · riprova
              </button>
            ) : suppliers.length === 0 ? (
              <Alert>
                <Info className="h-4 w-4" aria-hidden />
                <AlertDescription className="text-xs">
                  Nessun fornitore. Aggiungine uno dalla pagina{" "}
                  <a
                    href="/azienda/impostazioni/listini-serramenti/fornitori"
                    className="font-medium underline underline-offset-2"
                  >
                    Fornitori
                  </a>
                  .
                </AlertDescription>
              </Alert>
            ) : (
              <Select
                value={supplierId}
                onValueChange={(v) => {
                  setSupplierId(v);
                  setProductLineId(SENTINEL_UNSELECTED);
                }}
              >
                <SelectTrigger id="sel-fornitore" aria-label="Seleziona fornitore">
                  <SelectValue placeholder="Scegli un fornitore…" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Linea prodotto */}
          <div className="space-y-2">
            <Label htmlFor="sel-linea">Linea prodotto</Label>
            {!supplierId ? (
              <div className="flex h-10 items-center rounded-md border border-dashed px-3 text-xs text-muted-foreground">
                Scegli prima un fornitore
              </div>
            ) : linesLoading ? (
              <div className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Caricamento…
              </div>
            ) : lines.length === 0 ? (
              <Alert>
                <Info className="h-4 w-4" aria-hidden />
                <AlertDescription className="text-xs">
                  Nessuna linea prodotto per questo fornitore. Aggiungila dalla{" "}
                  <a
                    href="/azienda/impostazioni/listini-serramenti/fornitori"
                    className="font-medium underline underline-offset-2"
                  >
                    pagina Fornitori
                  </a>
                  .
                </AlertDescription>
              </Alert>
            ) : (
              <Select value={productLineId} onValueChange={setProductLineId}>
                <SelectTrigger id="sel-linea" aria-label="Seleziona linea prodotto">
                  <SelectValue placeholder="Scegli una linea…" />
                </SelectTrigger>
                <SelectContent>
                  {lines.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Editor (solo se combinazione completa) */}
      {selectedFamily && selectedSupplier && selectedProductLine ? (
        <MatriceEditor
          familyId={selectedFamily.id}
          familyNome={selectedFamily.nome}
          supplier={selectedSupplier}
          productLine={selectedProductLine}
          asseXLabel={selectedFamily.griglia_asse_x_label || "Larghezza (mm)"}
          asseYLabel={selectedFamily.griglia_asse_y_label || "Altezza (mm)"}
          solaLettura={!puoModificare}
        />
      ) : (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Seleziona famiglia, fornitore e linea prodotto per iniziare a
              compilare la matrice prezzi.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
