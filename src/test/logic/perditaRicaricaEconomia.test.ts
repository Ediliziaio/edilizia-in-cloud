import { expect, it } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { refreshOrderErrorQueries } from "@/lib/orders/refreshOrderErrorQueries";

it("ricarica un riepilogo economico attivo dopo la perdita senza invalidare altre commesse", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  let persistedLoss = 0;
  const key = ["order-economics-canonical", "demo"];
  const queryFn = async () => ({ errors: persistedLoss, margin: 100 - persistedLoss });
  await client.fetchQuery({ queryKey: key, queryFn });
  client.setQueryData(["order-economics-canonical", "altra"], { errors: 0, margin: 400 });
  const observer = new QueryObserver(client, { queryKey: key, queryFn });
  const done = new Promise<void>(resolve => {
    const unsubscribe = observer.subscribe(result => {
      if (result.data?.errors === 25) { unsubscribe(); resolve(); }
    });
  });
  persistedLoss = 25;
  refreshOrderErrorQueries(client, "demo", "azienda");
  await done;
  expect(client.getQueryData(key)).toEqual({ errors: 25, margin: 75 });
  expect(client.getQueryState(["order-economics-canonical", "altra"])?.isInvalidated).toBe(false);
  client.clear();
});
