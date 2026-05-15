import {
  PROFILI_MANIGLIA_CENTRALE_COMPATIBILI,
  PROFILI_NODO_ASIMMETRICO_COMPATIBILI,
  PROFILI_CERNIERE_NASCOSTE_COMPATIBILI,
  WIZARD_CERNIERE_OPTIONS,
  WIZARD_CASS_MATERIALI,
  WIZARD_HANDLE_TYPES,
  WIZARD_HW_COLORS,
  WIZARD_LEGNO,
  WIZARD_NODO_OPTIONS,
  WIZARD_PROFILI,
  WIZARD_RAL,
  WIZARD_TAPP_OPTIONS,
  WIZARD_TRAVERSO_OPTIONS,
  WIZARD_TIPI,
  RAL_FAMILY_LABELS,
  getRalsByFamily,
  getReferenceImageUrl,
  getWizardColorById,
  getWizardColorPreviewUrl,
  profileSupportsHiddenHinges,
  profileSupportsAsymmetricNode,
  type RalFamily,
  type WizardCassMat,
  type WizardCerniere,
  type WizardHandleType,
  type WizardHw,
  type WizardNodo,
  type WizardProfilo,
  type WizardState,
  type WizardTapp,
  type WizardTraverso,
  type WizardTipo,
} from "../../../../shared/render-window/catalog.ts";
import {
  buildWindowRenderConfig,
  ensureWindowRenderConfig,
  type WindowRenderBuildOptions,
} from "../../../../shared/render-window/windowRenderConfig.ts";

export {
  PROFILI_MANIGLIA_CENTRALE_COMPATIBILI,
  PROFILI_NODO_ASIMMETRICO_COMPATIBILI,
  PROFILI_CERNIERE_NASCOSTE_COMPATIBILI,
  WIZARD_CERNIERE_OPTIONS,
  WIZARD_CASS_MATERIALI,
  WIZARD_HANDLE_TYPES,
  WIZARD_HW_COLORS,
  WIZARD_LEGNO,
  WIZARD_NODO_OPTIONS,
  WIZARD_PROFILI,
  WIZARD_RAL,
  WIZARD_TAPP_OPTIONS,
  WIZARD_TRAVERSO_OPTIONS,
  WIZARD_TIPI,
  RAL_FAMILY_LABELS,
  getRalsByFamily,
  getReferenceImageUrl,
  getWizardColorPreviewUrl,
  profileSupportsHiddenHinges,
  profileSupportsAsymmetricNode,
};

export type {
  RalFamily,
  WizardCassMat,
  WizardCerniere,
  WizardHandleType,
  WizardHw,
  WizardNodo,
  WizardProfilo,
  WizardState,
  WizardTapp,
  WizardTraverso,
  WizardTipo,
};

export { ensureWindowRenderConfig };

export type MapperOutput = ReturnType<typeof buildWindowRenderConfig>;

export function mapWizardToConfig(
  state: WizardState,
  notes = "",
  options: Omit<WindowRenderBuildOptions, "notes"> = {},
): MapperOutput {
  if (!state.tipo || !state.profilo || !state.coloreInfisso) {
    throw new Error("Wizard incompleto: tipo, profilo e colore infisso sono obbligatori");
  }

  return buildWindowRenderConfig(state, {
    ...options,
    notes,
  });
}

export function getColorById(id: string) {
  return getWizardColorById(id);
}
