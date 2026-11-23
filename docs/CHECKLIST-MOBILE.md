# Checklist manuelle — mobile

À passer sur un **vrai appareil** avant une release (l'émulation de `npm run e2e` ne remplace ni le GPU, ni le tactile réel, ni le comportement propre à iOS). Cocher dans une copie de ce fichier ou dans la description de la release. Déploiement : la page doit être en **HTTPS** (GitHub Pages l'est) pour le service worker et le plein écran.

Appareils à couvrir : **Android Chrome** et **iOS Safari** (un téléphone milieu de gamme de préférence, c'est là que la cadence se joue).

## Avant de commencer

- [ ] Ouvrir la page en **portrait** : l'invite « Tournez l'appareil » s'affiche, rien d'autre.
- [ ] Tourner en **paysage** : le menu s'affiche sans barre d'adresse envahissante, rien n'est coupé par l'encoche ni par les coins arrondis.
- [ ] Pas de zoom au double-tap, pas de tirer-pour-rafraîchir, pas de sélection de texte ni de menu contextuel à l'appui long.

## Menu

- [ ] Boutons JOUER, COMMANDES et OPTIONS visibles et touchables ; « COMMANDES » affiche les gestes (pas de « ESPACE » ni de « H »).
- [ ] Bouton PLEIN ECRAN présent sur Android (absent sur iPhone : normal), il passe bien en plein écran paysage.
- [ ] OPTIONS : un toucher sur une ligne change la valeur (DIFFICULTE, AIDE A LA POSE, QUALITE, SON), elle est retenue après rechargement ; RETOUR ferme. Aussi depuis la pause.
- [ ] DIFFICULTE en AUTO : les bots sont nettement plus faciles qu'au clavier (comparer avec NORMAL).
- [ ] **Netteté (9.5)** : les traits sont fins et non crénelés (vaisseau, planètes, minimap), le texte est net. Noter l'appareil et si la cadence tient ; sinon la qualité auto doit repasser en basse.
- [ ] **Aide à la pose (9.1)** : elle ne se déclenche que près du sol (≈ 70 px), le nez se tourne contre une dérive latérale forte et il suffit alors de pousser pour l'annuler ; elle cède dès qu'on tourne, tire ou pousse.

## En jeu

- [ ] Le son démarre au **premier toucher** (iOS : après le relâchement du doigt), et revient en quittant puis rouvrant l'application.
- [ ] ◄ ► tournent, ▲ pousse, TIR tire, MIS lance un missile (une fois l'usine construite). **Trois doigts** en même temps (rotation + poussée + tir) marchent.
- [ ] Faire glisser le pouce de ◄ vers ► sans le lever bascule bien d'un bouton à l'autre.
- [ ] Les boutons font au moins la taille d'un pouce, aucun n'est caché par la main ; HUD (vie, bouclier, vitesse), minimap et boutons II / SON sont lisibles en haut.
- [ ] Atterrir sur une planète avec l'aide AUTO : le nez s'aligne tout seul à l'approche, sans empêcher de tourner ni de tirer.
- [ ] II met en pause ; REPRENDRE reprend ; MENU revient au menu. Passer l'application en arrière-plan (ou verrouiller l'écran) met la partie en pause.
- [ ] Fin de partie (victoire ou défaite) : REJOUER et MENU marchent au doigt.
- [ ] Cadence : pas de saccade perceptible pendant 5 minutes ; sinon, essayer QUALITE BASSE et noter l'appareil.
- [ ] Le téléphone ne chauffe pas anormalement après 10 minutes.

## Installation (PWA)

- [ ] Android Chrome : « Installer l'application » (ou « Ajouter à l'écran d'accueil »), l'icône apparaît, le lancement est en plein écran paysage.
- [ ] iOS Safari : Partager → « Sur l'écran d'accueil », l'icône apparaît, le lancement est sans barre Safari.
- [ ] Mode avion après une première visite : le jeu se lance quand même.
- [ ] Après un nouveau déploiement : la version à jour est servie au lancement suivant (relancer l'application une fois).

## Avec un clavier (tablette, portable tactile)

- [ ] Brancher / utiliser un clavier : appuyer sur une touche masque les boutons tactiles, toucher l'écran les rend. Aide et textes suivent la dernière source.
- [ ] Clavier et doigts en même temps (flèche + bouton TIR) : les deux agissent.

## À noter

| Appareil | Navigateur | Version | Cadence ressentie | Remarques |
| -------- | ---------- | ------- | ----------------- | --------- |
|          |            |         |                   |           |
