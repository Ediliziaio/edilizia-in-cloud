import { useSearchParams } from "react-router-dom";
export type OperationalScope = "active" | "history" | "all";
export function useOperationalArchive(
  key: string,
  defaultScope: OperationalScope = "active",
) {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const scope: OperationalScope =
    raw === "active" || raw === "history" || raw === "all" ? raw : defaultScope;
  const setScope = (value: OperationalScope, clear: string[] = []) =>
    setParams(
      (before) => {
        const next = new URLSearchParams(before);
        next.set(key, value);
        for (const field of clear) next.delete(field);
        return next;
      },
      { replace: true },
    );
  return { scope, setScope };
}
export function inOperationalScope(
  historical: boolean,
  scope: OperationalScope,
) {
  return scope === "all" || (scope === "history" ? historical : !historical);
}
