const KEY = 'eic-magazzino-local-preview';
export function localWarehouseMode(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined' || !['127.0.0.1', 'localhost', '::1'].includes(window.location.hostname)) return false;
  if (new URLSearchParams(window.location.search).get('warehouseLocal') === '1') sessionStorage.setItem(KEY, '1');
  return sessionStorage.getItem(KEY) === '1';
}
export function exitLocalWarehouse() {
  sessionStorage.removeItem(KEY);
  window.location.assign('/azienda/magazzino');
}
