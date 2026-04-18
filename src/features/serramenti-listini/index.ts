/**
 * Barrel del modulo Listini Serramenti Avanzati.
 *
 * Esportazioni pubbliche consumate FUORI dalla feature folder.
 * Tutto il resto (utility interne, style, tipi privati) resta nei sotto-file.
 *
 * Import consigliato dal resto dell'app:
 *   import { useListiniFeature, InstallaCatalogoButton } from "@/features/serramenti-listini";
 */

// Hooks
export { useListiniFeature, LISTINI_SERRAMENTI_FEATURE_KEY } from "./hooks/useListiniFeature";
export { useInstallaCatalogoSerramenti } from "./hooks/useInstallaCatalogoSerramenti";
export {
  useSupplierCatalogs,
  useSupplierCatalogMutations,
} from "./hooks/useSupplierCatalogs";
export {
  useSupplierProductLines,
  useSupplierProductLineMutations,
} from "./hooks/useSupplierProductLines";
export {
  useGridCells,
  useGridCellMutations,
  type GridCellUpsert,
} from "./hooks/useGridCells";

// Components
export { InstallaCatalogoButton } from "./components/InstallaCatalogoButton";
export { FornitoriManager } from "./components/FornitoriManager";
export { SupplierCatalogFormDialog } from "./components/SupplierCatalogFormDialog";
export { SupplierProductLineFormDialog } from "./components/SupplierProductLineFormDialog";

// Pages
export { default as ListiniFornitoriPage } from "./pages/ListiniFornitori";

// Data (catalogo statico, utile in UI per icone e lookup per slug)
export {
  CATALOGO_TIPOLOGIE,
  getTipologieCountByCategoria,
  getTipologiaBySlug,
  ICON_GENERICO_SVG,
} from "./data/tipologie-catalogo";

// Pricing utilities
export {
  calcolaPrezzoSerramento,
  findExactGridCell,
  findNearestGridCell,
} from "./utils/pricing";

// Types
export type {
  MaterialeProfilo,
  SupplierCatalog,
  SupplierProductLine,
  PricingInput,
  PricingOutput,
  GridCell,
  TipologiaSerramento,
} from "./types";
