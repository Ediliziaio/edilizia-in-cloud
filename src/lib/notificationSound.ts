let audio: HTMLAudioElement | null = null;

export function playNotificationSound() {
  try {
    if (!audio) {
      // Use a short Web Audio API beep as fallback
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.value = 800;
      oscillator.type = "sine";
      gainNode.gain.value = 0.3;
      oscillator.start();
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      oscillator.stop(ctx.currentTime + 0.3);
      return;
    }
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch {
    // Silently fail if audio is not supported
  }
}
