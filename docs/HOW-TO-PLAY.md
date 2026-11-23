# Comment jouer

Les valeurs chiffrées viennent de `src/config.js` et `src/data/` ; elles peuvent évoluer.

## Piloter

Le vaisseau obéit à l'inertie et à la gravité des planètes. `←` `→` tournent, `↑` pousse dans l'axe du nez, sans limite de carburant. Rien ne freine : pour ralentir, retournez-vous et poussez. Les bords de la carte vous repoussent doucement, sans dégâts. La flèche de gravité sur le vaisseau montre l'attraction dominante.

## Au doigt (téléphone, tablette)

Tenez l'appareil en **paysage**. Les commandes apparaissent au premier toucher : **◄ ►** (pouce gauche) tournent, **▲** pousse, **TIR** tire et **MIS** lance un missile (pouce droit). Trois doigts en même temps marchent, et glisser d'un bouton à l'autre sans lever le doigt change de commande. **II** met en pause (REPRENDRE ou MENU ensuite), **SON** coupe le son. La pause se déclenche aussi toute seule si l'application passe en arrière-plan.

Si vous touchez une touche du clavier, les boutons disparaissent et l'aide suit les touches ; un toucher les ramène. Le menu **OPTIONS** (touche `O`, au menu comme en pause) regroupe tous les réglages, mémorisés d'une visite à l'autre : **DIFFICULTE** des bots, **AIDE A LA POSE**, **QUALITE**, **SON**, **DEBUG** (affiche la cadence, la position et le mode des bots ; aussi `F3`), **PLEIN ECRAN**, **COMMANDES**. L'aide à la pose (AUTO : actif au tactile seulement, OUI ou NON) n'agit que près du sol, en approche : elle tourne le nez vers la verticale, ou, si vous dérivez trop sur le côté, **contre** votre dérive pour qu'une poussée l'annule. Elle se retire dès que vous tournez, tirez ou poussez. **QUALITE** (AUTO, HAUTE, BASSE) coupe la lueur des traits sur un appareil lent ; en AUTO, le jeu le fait tout seul si la cadence passe sous 40 images par seconde.

**Installer le jeu** : Android Chrome, « Installer l'application » ; iPhone, Partager puis « Sur l'écran d'accueil ». Il se lance alors en plein écran et marche hors ligne.

## Atterrir

Une planète vous attire jusqu'à cinq fois son rayon. Pour vous poser, il faut à la fois :

- une vitesse d'approche d'au plus **45 px/s** ;
- une vitesse le long de la surface d'au plus **35 px/s** ;
- un nez à moins de **25°** de la verticale de la planète.

Sinon c'est un impact : des dégâts proportionnels à l'excès de vitesse et un rebond. Sous 120 px d'une planète, des jauges s'affichent (vert = respecté, orange = trop risqué). Poussez pour décoller.

## Capturer

- **Planète neutre** : posez-vous et restez **3 secondes** d'affilée. Un anneau montre la progression ; décoller ou être éjecté la remet à zéro.
- **Planète ennemie** : détruisez d'abord ses tourelles (tir ou missiles), puis posez-vous 3 secondes. Un second vaisseau posé sur la même planète conteste la capture.
- Une planète capturée prend votre couleur et **repart de zéro** : ses bâtiments sont réinitialisés.

## Les bâtiments

Une planète possédée développe seule ses bâtiments, dans cet ordre, chacun avec sa durée :

| Bâtiment               | Durée | Effet                                                          |
| ---------------------- | ----- | -------------------------------------------------------------- |
| Tourelle               | 20 s  | Tire sur les ennemis à portée ; bloque la capture par l'ennemi |
| Usine à missiles       | 30 s  | Débloque les missiles pour toute la faction                    |
| Générateur de bouclier | 40 s  | Débloque le bouclier pour toute la faction                     |
| Tourelle améliorée     | 45 s  | Portée, cadence et dégâts supérieurs                           |

Tirer sur une planète ennemie abîme d'abord ses tourelles, puis ses autres bâtiments (qui font alors perdre leur capacité).

## Combattre

- **Vie** : 60 points. **Bouclier** (si débloqué) : 50 points absorbés avant la vie, qui reviennent en vol après 4 s sans dégâts.
- **Tir principal** : illimité, 12 de dégâts par balle. Les balles subissent la gravité.
- **Missiles** : 40 de dégâts, autoguidés dans un cône devant vous, **non** soumis à la gravité. Stock de 4 au maximum ; on se réarme **posé sur une de ses planètes équipée d'une usine**.
- **Mort** : vous réapparaissez après 3 s sur la planète que vous possédez la plus proche, vie et bouclier pleins, avec un seul missile.
- Aucun tir ami : ni entre vaisseaux, ni des tourelles sur leurs alliés.

## Les bots

Les deux bots suivent les mêmes règles que vous. Ils capturent des neutres, attaquent les planètes défendues, vous chassent, défendent leurs planètes menacées, se replient à vie basse et se réarment. Trois niveaux (FACILE, NORMAL, DIFFICILE, réglage **DIFFICULTE** des options ; AUTO, le défaut, prend FACILE au tactile, où le jeu est plus dur, et NORMAL au clavier) : ils changent la rapidité de décision, la précision de tir, la portée, l'agressivité et l'esquive des bots, jamais les règles.

## Fin de partie

Victoire quand les deux bots sont éliminés ; défaite quand c'est vous. Un écran de fin propose de rejouer (`Espace`, bouton REJOUER) ou de revenir au menu (`Echap`, bouton MENU).
