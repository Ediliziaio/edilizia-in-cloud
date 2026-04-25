import { RenderModuleHubPage } from "@/components/render/RenderModuleHubPage";
import { renderModuleHubConfigs } from "@/lib/render/renderModuleHubConfigs";

export default function RenderPavimentoHub() {
  return <RenderModuleHubPage {...renderModuleHubConfigs.pavimento} />;
}
