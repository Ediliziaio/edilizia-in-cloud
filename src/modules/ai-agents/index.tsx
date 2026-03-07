import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";

const AgentsListPage = lazy(() => import("./pages/AgentsListPage"));
const AgentEditorPage = lazy(() => import("./pages/AgentEditorPage"));

const Fallback = () => (
  <div className="flex items-center justify-center h-full min-h-[200px]">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

export default function AIAgentsModule() {
  return (
    <Suspense fallback={<Fallback />}>
      <Routes>
        <Route index element={<AgentsListPage />} />
        <Route path=":id" element={<AgentEditorPage />} />
      </Routes>
    </Suspense>
  );
}
