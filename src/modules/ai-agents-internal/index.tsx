import { lazy, Suspense } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { InternalAgentSidebar } from "./components/InternalAgentSidebar";

const InternalAgentsListPage = lazy(() => import("./pages/InternalAgentsListPage"));
const InternalAgentEditorPage = lazy(() => import("./pages/InternalAgentEditorPage"));
const InternalCallLogsPage = lazy(() => import("./pages/InternalCallLogsPage"));
const InternalCampaignsPage = lazy(() => import("./pages/InternalCampaignsPage"));

const Fallback = () => (
  <div className="flex items-center justify-center h-full min-h-[200px]">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

export default function InternalAIAgentsModule() {
  const location = useLocation();
  const isEditorPage = /\/agente-interno\/[0-9a-f-]{36}/.test(location.pathname);

  return (
    <div>
      {!isEditorPage && <InternalAgentSidebar />}
      <Suspense fallback={<Fallback />}>
        <Routes>
          <Route index element={<InternalAgentsListPage />} />
          <Route path="chiamate" element={<InternalCallLogsPage />} />
          <Route path=":id" element={<InternalAgentEditorPage />} />
        </Routes>
      </Suspense>
    </div>
  );
}
