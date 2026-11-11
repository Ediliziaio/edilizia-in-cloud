import { RenderSessionDetailPage } from "@/components/render/RenderSessionDetailPage";
import type { TechnicalRenderModuleId } from "@/lib/render/technicalRenderModules";

export default function RenderTechnicalModuleGalleryDetail({ moduleId }: { moduleId: TechnicalRenderModuleId }) {
  return <RenderSessionDetailPage moduleId={moduleId} />;
}
