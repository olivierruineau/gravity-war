# 0011 — Netteté : canvas à la résolution de l'écran, monde en unités de jeu

- **Statut** : accepté (remplace pour le tracé la posture « résolution basse, ne jamais lisser » de `CLAUDE.md`)
- **Date** : 2026-11-23

## Contexte

Retour de playtest sur mobile : les lignes sont crénelées, épaisses (≈ 3 à 6 pixels CSS) et manquent de précision. Cause : le canvas faisait 480×270 pixels réels, agrandi par le navigateur (`Scale.FIT`, `image-rendering: pixelated`). Un trait de « 1 px » occupait donc 1 pixel de jeu, soit plusieurs pixels de l'écran, avec des marches d'escalier. Le jeu est 100 % filaire : la finesse du trait fait l'esthétique.

## Décision

- Le **monde et les mises en page restent en unités de jeu 480×270** (cartes, vitesses, boutons tactiles, HUD) : rien ne change dans `core/` ni dans les données.
- Le **canvas est dessiné à `K × 480 × 270`**, `K` = entier de 1 à `RENDER_SCALE_MAX` (3) qui approche le nombre de pixels physiques de l'écran (`computeRenderScale(largeur, hauteur, devicePixelRatio)`), recalculé au début de chaque scène (`applyRenderScale`).
- La **caméra principale** zoome de `K`, origine en haut à gauche (les objets fixes se placent donc toujours en unités de jeu) ; elle est cadrée à la main (`placeCamera`, bornée à la carte) au lieu de `centerOn` + `setBounds`, et la zone visible (`viewRect`) remplace `worldView`.
- Les **traits** sont épaissis de `LINE_PX / K` unités : `Graphics.lineStyle` et `Shape.setStrokeStyle` sont enveloppés une fois (`installRenderPatches`), ce qui garde tous les sites d'appel en « 1 » sans les toucher. Les **textes** sont rastérisés à la résolution `K` (même enveloppe sur `add.text`).
- `antialias: true`, `roundPixels: false`, plus de `pixelArt` : le canvas étant à la résolution de l'écran, le lissage ne floute rien et les traits sont adoucis.
- Le toucher lit des coordonnées de canvas : `readPointers` les divise par `K`.

## Alternatives écartées

- Garder 480×270 et lisser à l'agrandissement : floute tout, traits toujours épais.
- Passer tout le monde en pixels de canvas (cartes, mises en page) : réécriture massive et risque pour la simulation.
- Une seconde caméra pour l'interface : oblige à assigner chaque objet à une caméra ; l'origine en haut à gauche de la caméra unique suffit.

## Conséquences

- Coût : jusqu'à 9× plus de pixels à remplir (plafond `K = 3`) ; mesuré en 9.5 (voir `docs/REVIEW-MOBILE.md`). Le mode qualité « basse » (lueur coupée) et le moniteur de cadence restent le recours.
- Changer la fenêtre en cours de scène (plein écran) ne recalcule `K` qu'à la scène suivante : le rendu reste correct, seulement un peu moins fin ou plus épais.
- Le jeu reste rétro par ses formes, sa palette et ses sons ; seule la matière du trait change.
