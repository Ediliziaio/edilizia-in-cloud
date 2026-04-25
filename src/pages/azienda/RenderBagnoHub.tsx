import { RenderModuleHubPage } from "@/components/render/RenderModuleHubPage";
import { renderModuleHubConfigs } from "@/lib/render/renderModuleHubConfigs";

export default function RenderBagnoHub() {
  return <RenderModuleHubPage {...renderModuleHubConfigs.bagno} />;
}
