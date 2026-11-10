import { useQueries } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRenderDate } from "@/lib/render/renderStatus";
import { loadStoredRender } from "@/lib/render/renderSessionData";
import { savedRenderChoices } from "@/lib/render/renderSavedChoices";
import { RenderImage } from "./RenderDetailViewer";
import { RenderSavedChoices } from "./RenderSavedChoices";

export interface RenderComparisonTarget {
  id: string;
  module: string;
  url: string;
  title: string;
  createdAt: string;
}
export default function RenderComparisonDialog({
  targets,
  open,
  onOpenChange,
}: {
  targets: RenderComparisonTarget[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { effectiveCompany } = useAuth();
  const company = effectiveCompany?.id;
  const queries = useQueries({
    queries: targets.map((target) => ({
      queryKey: ["render-stored-session", company, target.module, target.id],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        loadStoredRender(company!, target.module, target.id, signal),
      enabled: !!company && open,
      staleTime: 30_000,
      retry: 1,
    })),
  });
  const selections = queries.map(
    (query) =>
      new Map(
        savedRenderChoices(query.data?.config).map((choice) => [
          choice.key,
          choice.value,
        ]),
      ),
  );
  const differences = new Set<string>();
  if (queries.length === 2 && queries.every((query) => query.data))
    for (const key of new Set(
      selections.flatMap((selection) => [...selection.keys()]),
    ))
      if (selections[0].get(key) !== selections[1].get(key))
        differences.add(key);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] w-[96vw] max-w-7xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Confronto tra render</DialogTitle>
          <DialogDescription>
            Ogni immagine conserva le proprie scelte e la propria versione. I
            valori diversi sono evidenziati.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 md:grid-cols-2">
          {targets.map((target, index) => (
            <div
              key={`${target.module}:${target.id}:${target.url}`}
              className="min-w-0 space-y-3"
            >
              <div>
                <h3 className="font-semibold">{target.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {formatRenderDate(target.createdAt)}
                </p>
              </div>
              <RenderImage
                url={target.url}
                label={target.title}
                className="h-[42dvh] w-full rounded-lg border"
              />
              {queries[index]?.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : queries[index]?.isError || !queries[index]?.data ? (
                <p role="alert" className="text-sm text-muted-foreground">
                  Le scelte di questa immagine non sono disponibili.
                </p>
              ) : (
                <RenderSavedChoices
                  config={queries[index].data?.config}
                  comparisonKeys={differences}
                />
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
