import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const PlatformSettingsPage = lazy(() => import("@/modules/ai-agents/pages/PlatformSettingsPage"));

export default function AdminSettingsAI() {
  return (
    <Suspense fallback={<Skeleton className="h-[400px]" />}>
      <PlatformSettingsPage />
    </Suspense>
  );
}
