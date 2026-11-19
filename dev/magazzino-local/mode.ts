const KEY = 'eic-magazzino-local-preview';
const locale = import.meta.env.DEV && typeof window !== 'undefined'
  && ['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname);

export function isWarehouseRoute(pathname: string) {
  return /^\/azienda\/magazzino\/?$/.test(pathname);
}

export function requestsWarehouseLab(pathname: string, search: string) {
  return locale && isWarehouseRoute(pathname) && new URLSearchParams(search).get('warehouseLocal') === '1';
}

function initWarehouseLab() {
  if (!locale) return false;
  const { pathname, search } = window.location;
  if (!isWarehouseRoute(pathname)) {
    sessionStorage.removeItem(KEY);
    return false;
  }
  if (requestsWarehouseLab(pathname, search)) sessionStorage.setItem(KEY, '1');
  return sessionStorage.getItem(KEY) === '1';
}

// Il confine vale per il documento, anche durante il cambio di rotta.
// Una richiesta avviata nel collaudo non può diventare una scrittura online.
const laboratorio = initWarehouseLab();
export const localWarehouseMode = () => laboratorio;

export function exitLocalWarehouse() {
  sessionStorage.removeItem(KEY);
  window.location.assign('/azienda/magazzino');
}
