import { useSearchParams } from "react-router-dom";
import {
  fiscalPeriod,
  updateFiscalParams,
} from "@/lib/fatturazione/fiscalWorkspace";
export function useFiscalPeriod() {
  const [params, setParams] = useSearchParams();
  const period = fiscalPeriod(params);
  const set = (changes: Record<string, string>, replace = false) =>
    setParams((prev) => updateFiscalParams(prev, changes), { replace });
  return { ...period, params, set };
}
