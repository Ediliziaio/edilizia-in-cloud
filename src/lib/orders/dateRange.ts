import { format, isValid, parseISO } from "date-fns";
export function inDateRange(value: string | null | undefined, from: string, to: string) {
  const valid = (date:string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && isValid(parseISO(date)) && format(parseISO(date),"yyyy-MM-dd") === date;
  if ((!from && !to) || (from && !valid(from)) || (to && !valid(to)) || (from && to && from > to)) return false;
  if (!value || !isValid(parseISO(value))) return false;
  const day = format(parseISO(value),"yyyy-MM-dd");
  return (!from || day >= from) && (!to || day <= to);
}
