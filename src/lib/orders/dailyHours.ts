export interface DailyHoursPerson { id: string; name: string }
export function assertDailyHoursCompany(data:{company_id?:unknown}|null|undefined,companyId:string):void {
 if(data?.company_id!==companyId)throw new Error('L’azienda attiva è cambiata. Ricarica la pagina prima di consultare le ore.');
}
export interface DailyHoursOrder { id: string; name: string }
export interface DailyHoursRecord {
 id: string; order_id: string; data_lavoro: string; stato: string; updated_at: string;
 ufficio_employee_id: string | null; presenze: unknown; presenze_registrate: unknown;
 costo_registrato_at: string | null; note: string | null;
}
export interface DailyHoursLine { key: string; reportId: string; employeeId: string; day: string; orderId: string; hours: number; cost: number | null; pending: boolean; office: boolean; updatedAt: string; note: string | null }
export function dailyHoursLines(records: DailyHoursRecord[]): DailyHoursLine[] {
 return records.flatMap(r => {
  if (!['approvato','inviato'].includes(r.stato)) return [];
  const pending = r.stato !== 'approvato' || !r.costo_registrato_at;
  const entries = !pending && Array.isArray(r.presenze_registrate) ? r.presenze_registrate : r.presenze;
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((p: {employee_id?:string;ore?:unknown;costo?:unknown},i:number) => {
   const hours = Number(p.ore), cost = p.costo == null ? null : Number(p.costo);
   if (!p.employee_id || !Number.isFinite(hours) || hours <= 0) return [];
   return [{key:`${r.id}-${i}`,reportId:r.id,employeeId:p.employee_id,day:String(r.data_lavoro).slice(0,10),orderId:r.order_id,hours,cost:!pending && cost != null && Number.isFinite(cost) && cost > 0 ? cost : null,pending,office:!!r.ufficio_employee_id,updatedAt:r.updated_at,note:r.note}];
  });
 });
}
export function dailyHoursError(day:string, hours:string, employeeId:string, orderId:string,today:string):string|null {
 if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day>today || Number.isNaN(Date.parse(day+'T12:00:00'))) return 'Scegli una data valida, non futura.';
 if (!employeeId || !orderId) return 'Seleziona dipendente e cantiere.';
 if (!/^\d+(?:[.,]\d{1,2})?$/.test(hours.trim())) return 'Inserisci le ore, anche con la virgola (es. 7,5).';
 const n=Number(hours.replace(',','.'));
 return n>0 && n<=24 ? null : 'Le ore devono essere maggiori di zero e non superare 24.';
}
