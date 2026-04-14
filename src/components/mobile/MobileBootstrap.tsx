/**
 * MobileBootstrap — native-only initialisation component.
 *
 * This component is lazy-loaded **only** when `isNative` is true (i.e. inside
 * a Capacitor iOS/Android shell).  On the web it is never imported, so the
 * Capacitor-plugin dependencies it pulls in (`@capacitor/app`,
 * `@capacitor/status-bar`, `@capacitor/keyboard`, etc.) stay out of the web
 * bundle entirely.
 *
 * It must render inside `<BrowserRouter>` because `useMobileInit` calls
 * `useNavigate()`.
 */

import { useMobileInit } from "@/hooks/useMobileInit";

export default function MobileBootstrap() {
  useMobileInit();
  return null;
}
