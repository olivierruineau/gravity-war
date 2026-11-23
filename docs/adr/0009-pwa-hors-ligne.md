# 0009 — PWA : installation et hors ligne sans dépendance

- **Statut** : accepté
- **Date** : 2026-11-23

## Contexte

Phase 8.10 : le jeu doit s'installer (plein écran, sans barre du navigateur, seule voie plein écran sur iPhone) et se lancer hors ligne. Le déploiement est statique (GitHub Pages, sous un sous-chemin : `base: './'`). Règle du projet : pas de nouvelle dépendance sans passer par l'architecte.

## Décision

**Pas de dépendance : un manifeste statique, un service worker écrit à la main, et un petit plugin Vite maison (`build/pwaPlugin.js`) qui l'instancie à chaque build.**

- `public/manifest.webmanifest` : `display: fullscreen` (repli `standalone`), `orientation: landscape`, couleurs du jeu, icônes 192 / 512 / maskable 512 (`public/icons/`, dessinées depuis `icon.svg`) ; `apple-touch-icon` pour iOS.
- `build/sw.template.js` : gabarit du worker. Le plugin y écrit, au `generateBundle`, la **liste de tous les fichiers du build** et un **identifiant de build** (empreinte SHA-256 du contenu). Le worker précache tout à l'installation, donc le jeu démarre hors ligne dès la première visite.
- **Mise à jour propre** : le `sw.js` change à chaque build (nouvel identifiant), donc le navigateur installe le nouveau worker, qui précache ses fichiers dans un cache **nommé par l'identifiant**, puis supprime les autres à l'activation (`skipWaiting` + `clients.claim`). La page est servie **réseau d'abord** (une version fraîche dès qu'on est en ligne), le reste **cache d'abord** (noms à empreinte, contenu immuable). Pas de rechargement forcé en pleine partie : la nouvelle version prend la main au lancement suivant.
- Enregistrement dans `main.js`, **en production seulement** (`import.meta.env.PROD`) : en dev, un worker masquerait les changements du serveur Vite.
- Les correspondances de cache ignorent `Vary` : certains serveurs (dont `vite preview`) envoient `Vary: Origin`, ce qui ferait rater toutes les requêtes de modules.

## Alternatives écartées

- **`vite-plugin-pwa` (Workbox)** — fait la même chose avec ~100 dépendances transitives ; le besoin tient en ~60 lignes lisibles et testées.
- **Cache d'exécution seulement (sans précache)** — le premier lancement hors ligne échouerait tant que tous les fichiers ne sont pas passés au moins une fois par le réseau.
- **Recharger la page à l'arrivée d'une nouvelle version** — peut couper une partie en cours.

## Conséquences

- `sw.js` n'existe qu'après `npm run build` ; `npm run dev` ne fait pas de hors ligne.
- Les fichiers de `public/` sont listés en dur dans le plugin : en ajouter un à précacher demande de le déclarer.
- À vérifier à la main sur appareil : installation Android (invite Chrome) et iOS (Partager → Sur l'écran d'accueil), voir la checklist en 8.11.
