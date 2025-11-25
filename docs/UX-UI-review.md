# Synthèse UX/UI pour les utilisateurs 50-75 ans

Cette note rassemble un état des lieux rapide de l'application et des pistes d'amélioration pour rendre l'expérience des bénévoles plus simple et plus accessible aux personnes de 50 à 75 ans.

## Points positifs existants
- **Parcours bénévole dédié** : l'écran *Ma campagne* (`/volunteer`) propose déjà une version simplifiée avec de gros boutons d'action et des libellés clairs, ce qui est adapté à un public moins technophile.
- **Feedback visuel clair** : les états "En cours" / "Terminé" sont associés à des couleurs et des icônes explicites, et un message de confirmation est affiché après mise à jour d'un segment.
- **Navigation cohérente** : la barre supérieure reste présente en bureau et mobile, avec une hiérarchie claire (Tableau de bord, Ma campagne, Carte, etc.).
- **Chargements gérés** : des spinners s'affichent pendant les chargements (ex. tableau de bord, liste des segments), évitant la sensation de blocage.

## Risques ou irritants identifiés
- **Taille/poids visuel variable** : certains écrans clés (ex. tableau de bord, authentification) ont une taille de texte relativement standard. Pour un public senior, augmenter la hiérarchie visuelle (titres, boutons primaires) améliorerait la lisibilité.
- **Multiplication des entrées de menu** : côté admin, la navigation affiche jusqu'à 9 entrées. Sur mobile, cela génère une longue liste et peut perdre les utilisateurs.
- **Validation par code fixe** : le flux d'authentification repose sur un code à 6 chiffres pré-communiqué. Pour un public senior, l'absence d'assistance (renvoi du code, contact) peut être bloquante en cas d'oubli.
- **Gestion d'état silencieuse** : les erreurs réseau ou d'enregistrement sont peu contextualisées (toast générique "Erreur"), ce qui peut être anxiogène.
- **Accès aux actions clés** : sur l'écran bénévole, l'accès aux segments précédents/suivants repose sur de gros boutons mais la navigation clavier n'est pas indiquée ; sur mobile, les flèches latérales peuvent être moins évidentes.

## Recommandations UX/UI rapides (priorité haute)
1. **Renforcer la lisibilité**
   - Augmenter la taille et le poids du texte sur les pages d'authentification et du tableau de bord (corps 18-20px, boutons 18px, contrastes AA). Vérifier que les cartes conservent un contraste suffisant sur fond clair/sombre.
   - Ajouter un bouton "Agrandir le texte" ou respecter le zoom système en évitant les tailles de police figées.

2. **Simplifier la navigation pour les bénévoles**
   - Dédier l'entrée principale « Ma campagne » et masquer les liens avancés pour les profils non-admin (déjà prévu via `user_roles`). Vérifier que le menu mobile affiche d'abord les deux actions principales : "Ma campagne" et "Carte".
   - Ajouter un bouton "Retour à ma campagne" sur les autres pages accessibles aux bénévoles pour réduire les erreurs de navigation.

3. **Sécuriser et clarifier le parcours d'authentification**
   - Remplacer le code fixe par un envoi d'OTP (email ou SMS) avec bouton "Renvoyer le code" et un message d'aide en cas de non-réception.
   - Ajouter un lien d'assistance (téléphone/email coordinateur) et une explication courte du format attendu (ex. "6 chiffres" déjà présent).

4. **Guidage in-app pour les segments**
   - Sur l'écran `Ma campagne`, afficher un court tutoriel/bandeau la première fois ("1. Appuyez sur Je commence, 2. Distribuez, 3. Validez avec ✓ C'est fait !").
   - Ajouter une option "Besoin d'aide ?" ouvrant une fiche simple (FAQ ou popup avec 3 questions courantes) et un lien vers le coordinateur.
   - Confirmer explicitement l'enregistrement offline/online : si la connexion échoue, conserver l'action localement et proposer de réessayer.

5. **Accessibilité et confort d'usage**
   - Vérifier les zones cliquables : porter les boutons principaux à 44px de hauteur minimale (déjà le cas pour les actions principales) et augmenter les marges internes des cartes sur mobile.
   - Assurer un focus visible pour la navigation clavier (flèches gauche/droite déjà mentionnées ; ajouter une légende "Vous pouvez aussi balayer l'écran" sur mobile).
   - Ajouter un mode "fort contraste" (variation des tokens `--primary`/`--muted`) et tester en lumière vive.

## Recommandations d'évolution produit (moyen terme)
- **Mode hors-ligne léger** : mise en cache des segments assignés et des actions de validation pour les saisir sans réseau, avec synchronisation différée.
- **Résumé quotidien** : écran de synthèse minimal montrant "Segments restants aujourd'hui", "Temps estimé", "Dernière synchro", pour rassurer les utilisateurs.
- **Suivi audio ou vibrations** : sur mobile, vibration courte lors de la validation d'un segment et possibilité d'activer un guidage audio pour les moins à l'aise avec la lecture.
- **Réduction du menu admin sur mobile** : regrouper les entrées d'administration dans un sous-menu "Administration" ou dans une vue dédiée pour limiter le bruit visuel chez les profils avancés.

## Vérifications pré-prod rapides
- Mettre en place un scénario de test utilisateur avec 3 personnes de 60-70 ans : connexion, démarrer un segment, marquer terminé, passer au suivant, signaler un problème.
- Tester les messages d'erreur sans connexion internet et la récupération de session après fermeture de l'application.
- Vérifier la performance et le temps de chargement initial sur un smartphone milieu de gamme (3G/4G) : les pages volumineuses (carte, listes) doivent rester réactives.
