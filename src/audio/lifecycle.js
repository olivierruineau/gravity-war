// Cycle de vie de l'audio sur mobile (8.8) : les navigateurs gardent l'AudioContext suspendu tant qu'aucun geste
// n'a eu lieu (iOS exige un relâchement du doigt, pas un appui), et le suspendent quand l'appli passe en arrière-plan.
// Pur vis-à-vis de Phaser : le contexte et le document sont injectés, ce qui rend le module testable sans navigateur.

/** Gestes qui débloquent l'audio : `touchend`/`pointerup` pour iOS, `keydown` pour le clavier. */
export const UNLOCK_EVENTS = ['touchend', 'pointerup', 'keydown', 'click'];

/**
 * @param {{ state: string, resume: () => unknown, suspend: () => unknown }} ctx contexte audio
 * @param {{ hidden: boolean, addEventListener: Function, removeEventListener: Function }} doc
 * @returns {() => void} retire tous les écouteurs
 */
export function installAudioLifecycle(ctx, doc) {
  const tryResume = () => {
    if (ctx.state !== 'running') Promise.resolve(ctx.resume()).catch(() => {});
  };
  // Débloque au premier geste valable ; on garde l'écouteur tant que le contexte n'est pas réellement lancé.
  const onGesture = () => {
    tryResume();
    if (ctx.state === 'running') disarmGestures();
  };
  const armGestures = () => {
    for (const name of UNLOCK_EVENTS) doc.addEventListener(name, onGesture, true);
  };
  const disarmGestures = () => {
    for (const name of UNLOCK_EVENTS) doc.removeEventListener(name, onGesture, true);
  };
  const onVisibility = () => {
    if (doc.hidden) {
      if (ctx.state === 'running') Promise.resolve(ctx.suspend()).catch(() => {});
      return;
    }
    tryResume(); // marche sur Android ; sur iOS, le prochain geste s'en charge
    armGestures();
  };

  armGestures();
  doc.addEventListener('visibilitychange', onVisibility);
  return () => {
    disarmGestures();
    doc.removeEventListener('visibilitychange', onVisibility);
  };
}
