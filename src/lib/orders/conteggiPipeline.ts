export interface ConteggioPipeline {
  total: number;
  done: number;
}

export const FASI_PIPELINE = "orders-pipeline-phases";
export const TASK_UFFICIO_PIPELINE = "orders-pipeline-office-tasks";

export function queryConteggioPipeline(
  queryKey: readonly unknown[],
  tipo: typeof FASI_PIPELINE | typeof TASK_UFFICIO_PIPELINE,
  orderId?: string | null,
  companyId?: string | null,
) {
  const [key, azienda, ids] = queryKey;
  return key === tipo && (!companyId || azienda === companyId)
    && (!orderId || (Array.isArray(ids) && ids.includes(orderId)));
}
