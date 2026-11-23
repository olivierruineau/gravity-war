// Plateforme (DOM) : détection du tactile, orientation, retour d'arrière-plan. Aucune règle de jeu ici.

const COARSE = '(pointer: coarse)';
const PORTRAIT = '(orientation: portrait)';

/** Appareil dont le pointeur principal est tactile (téléphone, tablette) ; faux pour un portable à écran tactile. */
export function hasCoarsePointer() {
  return typeof matchMedia === 'function' && matchMedia(COARSE).matches;
}

/** Vrai en portrait sur un appareil tactile : la page affiche alors l'invite « tournez l'appareil ». */
export function isPortraitBlocked() {
  return hasCoarsePointer() && matchMedia(PORTRAIT).matches;
}

/**
 * Appelle `onAway` quand le joueur ne voit plus le jeu : onglet masqué, application en arrière-plan,
 * ou passage en portrait sur tactile. Retourne la fonction qui retire les écouteurs.
 */
export function watchAway(onAway) {
  const onVisibility = () => {
    if (document.hidden) onAway();
  };
  const onOrientation = () => {
    if (isPortraitBlocked()) onAway();
  };
  const orientation = matchMedia(PORTRAIT);
  document.addEventListener('visibilitychange', onVisibility);
  orientation.addEventListener('change', onOrientation);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    orientation.removeEventListener('change', onOrientation);
  };
}

/** Plein écran paysage ; ignore les refus (iOS, politique du navigateur). */
export function enterFullscreen(scene) {
  const { scale } = scene;
  if (!scale.fullscreen.available) return;
  scale.startFullscreen();
  screen.orientation?.lock?.('landscape').catch(() => {});
}

export const canFullscreen = (scene) => scene.scale.fullscreen.available;
