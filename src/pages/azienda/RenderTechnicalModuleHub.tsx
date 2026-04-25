import { RenderModuleHubPage } from "@/components/render/RenderModuleHubPage";
import { renderModuleHubConfigs } from "@/lib/render/renderModuleHubConfigs";

type TechnicalModuleId =
  | "ristrutturazioni"
  | "pavimenti-esterni"
  | "giardini"
  | "porte-blindate"
  | "porte-interne";

export default function RenderTechnicalModuleHub({ moduleId }: { moduleId: TechnicalModuleId }) {
  return <RenderModuleHubPage {...renderModuleHubConfigs[moduleId]} />;
}
