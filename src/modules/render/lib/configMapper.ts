import {
  PROFILI_MANIGLIA_CENTRALE_COMPATIBILI,
  WIZARD_CASS_MATERIALI,
  WIZARD_HW_COLORS,
  WIZARD_LEGNO,
  WIZARD_PROFILI,
  WIZARD_RAL,
  WIZARD_TAPP_OPTIONS,
  WIZARD_TIPI,
  getWizardColorById,
  type WizardCassMat,
  type WizardHw,
  type WizardProfilo,
  type WizardState,
  type WizardTapp,
  type WizardTipo,
} from "../../../../shared/render-window/catalog.ts";
import { buildWindowRenderConfig, type WindowRenderBuildOptions } from "../../../../shared/render-window/windowRenderConfig.ts";

export {
  PROFILI_MANIGLIA_CENTRALE_COMPATIBILI,
  WIZARD_CASS_MATERIALI,
  WIZARD_HW_COLORS,
  WIZARD_LEGNO,
  WIZARD_PROFILI,
  WIZARD_RAL,
  WIZARD_TAPP_OPTIONS,
  WIZARD_TIPI,
};

export type {
  WizardCassMat,
  WizardHw,
  WizardProfilo,
  WizardState,
  WizardTapp,
  WizardTipo,
};

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
