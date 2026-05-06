import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { isNative } from "./platform";

export async function tapFeedback() { if (!isNative) return; try { await Haptics.impact({ style: ImpactStyle.Light }); } catch { /* intentionally ignored */ } }
export async function impactFeedback() { if (!isNative) return; try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch { /* intentionally ignored */ } }
export async function heavyImpact() { if (!isNative) return; try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch { /* intentionally ignored */ } }
export async function successFeedback() { if (!isNative) return; try { await Haptics.notification({ type: NotificationType.Success }); } catch { /* intentionally ignored */ } }
export async function errorFeedback() { if (!isNative) return; try { await Haptics.notification({ type: NotificationType.Error }); } catch { /* intentionally ignored */ } }
export async function warningFeedback() { if (!isNative) return; try { await Haptics.notification({ type: NotificationType.Warning }); } catch { /* intentionally ignored */ } }
