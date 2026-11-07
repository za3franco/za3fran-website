# Stratégie de lancement v2 — angle, ton, canaux, automatisation (7 nov 2026)

Remplace le message et les posts de la v1 (`plan-lancement-maroc.md`). Le seuil de viabilité (15 Validators dont 5 bundles + 3 accompagnements en 90 jours) et le plafond de 5 h par semaine ne changent pas.

## 1. Diagnostic
Les posts v1 vendaient un produit (« teste ton concept », prix, livrables). Le marché du « business plan automatisé » est encombré et le produit y paraît interchangeable. Ce qui n'est pas interchangeable : un opérateur qui a plus de 20 ans de terrain, des chiffres calculés et sourcés pour le Maroc, et un besoin réel mal servi.

Ce que dit la recherche (sources lues le 7 nov) :
- Contenu de fondateur : ce qui marche, ce sont des histoires réelles et précises, dans la voix de la personne, pas des conseils génériques ; le contenu écrit pour l'acheteur plutôt que pour les pairs ; 2 posts par semaine, régulièrement, préparés en une session ; la première ligne décide de la lecture ([HubSpot](https://www.hubspot.com/startups/resources/sales-and-marketing/founder-led-content-strategy)).
- Positionnement : en B2B, l'acheteur n'agit que s'il reconnaît le problème, et tout achat se rattache d'abord à une catégorie ; sans créer une catégorie entière (lourd), on peut tailler une niche en nommant un problème ou une approche distincts ([Eau Cube](https://www.eaucube.com/en/insights/what-is-the-role-of-category-design-in-positioning/)).

## 2. Le besoin (à dire avant le produit)
Un porteur de projet restauration engage ses économies, souvent un prêt, sur un concept que **personne d'expérimenté n'a regardé avec des chiffres**. Un directeur F&B ou un consultant coûte cher et n'est pas à sa portée ; l'entourage donne des avis, pas des calculs. Za3fran rend ce regard accessible.

## 3. L'idée centrale : le service à blanc
Dans un restaurant, on n'ouvre pas sans service à blanc : une répétition générale pour la brigade, avant le premier vrai client. **Le concept, lui, n'a jamais droit à sa répétition.** Il est testé le soir de l'ouverture, bail signé.

> **Fais ton service à blanc avant d'ouvrir.** (ligne secondaire : « Teste ton concept avant d'investir »)

- Catégorie nommée : *le service à blanc du concept* (le regard d'opérateur, sur le papier, avant de signer).
- Ennemi : pas un concurrent, une pratique : « on ouvre pour voir ».
- Vocabulaire maison (cuisine, pas startup) : service à blanc, coup de feu, passe, mise en place, fiche technique.
- À vérifier par Arnaud : que « service à blanc » parle bien aux restaurateurs marocains (sinon « répétition générale », « service d'essai »).

Honnêteté sur ce que fait chaque offre :
- Le Validator et le business plan appliquent la méthode d'Arnaud, codifiée en questions et en calculs (les chiffres viennent du moteur, pas d'une IA). On ne dit jamais qu'Arnaud relit chaque rapport.
- L'accompagnement concept, c'est Arnaud lui-même.

## 4. Ton
- Tutoiement, phrases courtes, un chiffre concret dès les deux premières lignes.
- Sec et un peu drôle, voix de chef d'exploitation : direct, jamais donneur de leçons.
- Pas de « solution », « révolutionnaire », « IA » en slogan ; l'IA se mentionne seulement pour dire ce qu'elle ne fait pas (elle n'écrit pas les chiffres).
- Une idée par post, pas de liste de fonctionnalités. Un appel à l'action doux, une fois sur quatre.
- Jamais d'anecdote inventée : les histoires vécues viennent d'Arnaud (voir §8).

## 5. Quatre rubriques récurrentes
1. **Dossier Maison Figue** (feuilleton, fictif et étiqueté) : un vrai rapport du moteur disséqué en épisodes. Contenu unique, vérifiable, et c'est la démonstration du produit sans jamais le vendre.
2. **Le chiffre de Casa** : un chiffre local sourcé et daté (loyers par quartier, etc.), avec sa limite. Partageable, utile, impossible à copier par un générateur générique.
3. **La question de l'opérateur** : la question que tu poses avant de parler de déco ou de nom.
4. **Vu de la cuisine** : une histoire vécue d'Arnaud (il la fournit, je la mets en forme).
Les offres : une fois sur quatre, doucement.

## 6. Canaux, réévalués
Le besoin apparaît **avant la signature du bail**. Il faut donc aussi être là où le porteur de projet passe avant :
- **LinkedIn d'Arnaud** : canal principal, 2 posts par semaine (environ 2 h par semaine avec validation).
- **Prescripteurs** (environ 1 h par semaine) : agents immobiliers commerciaux, comptables, banquiers PME, écoles hôtelières, incubateurs, fournisseurs d'équipement. Offre : le test gratuit à proposer à leurs clients. Un prescripteur qui parle de Za3fran vaut plus que 20 posts.
- **Messages directs** (environ 1 h par semaine) : 5 personnes par semaine, avec un chiffre local utile et le test gratuit, pas un pitch.
- **Instagram et Facebook** : carrousels tirés des posts, publiés ensemble via Meta. Secondaire, sans gain de temps pour Arnaud.
- **Page LinkedIn Za3fran** : repartage manuel (10 s). **Profil Google** : réglé une fois.
- Plus tard : guichets PME des banques, écoles hôtelières.

Suivi hebdomadaire (en plus du seuil) : tests du Scorecard commencés / terminés, messages ayant reçu une réponse, conversations d'accompagnement. Revue au jour 30 : l'angle « service à blanc » tient-il, que dit-on le plus souvent en commentaire ?

## 7. Automatisation avec n8n
Ce que montre la recherche (tierces sources, non testé par moi) :
- **LinkedIn, profil personnel** : possible avec le nœud LinkedIn de n8n et ta propre application développeur LinkedIn (produits « Share on LinkedIn » et « Sign In with OpenID Connect », application associée à une page entreprise). Un seul visuel ou un lien par post (pas de carrousel PDF). Le jeton dure 60 jours, sans renouvellement automatique : il faut reconnecter tous les 60 jours.
- **LinkedIn, page entreprise** : exige une validation LinkedIn (Community Management) : on l'écarte, repartage manuel.
- **Instagram et Facebook** : compte Instagram professionnel relié à une page Facebook, identifiants Meta Graph API, visuel à une adresse HTTPS publique ([modèle n8n avec validation humaine](https://n8n.io/workflows/20222-create-human-approved-instagram-posts-with-gemini-telegram-and-instagram/)). Les carrousels sont à vérifier.
- Source du détail LinkedIn : [OpenTweet](https://opentweet.io/how-to/post-to-linkedin-from-n8n), qui vend une alternative : à relire en test réel.

Mon environnement ne peut pas appeler ton n8n directement. Montage proposé, sans abonnement :
1. Table `social_posts` dans Supabase (texte, visuel, réseau, date, statut `brouillon` / `validé` / `publié`).
2. Je rédige les posts ici ; tu valides dans le chat ; **je passe le statut à `validé`** (ta validation reste le seul déclencheur).
3. Un workflow n8n (que je te fournis, à importer) lit toutes les 15 min les posts `validé` dont l'heure est arrivée, publie, puis passe en `publié` et te prévient.
4. Pas besoin de « agents » : le workflow suffit, l'intelligence reste ici.

Ordre : cette semaine, tu publies à la main (le jour 0 ne dépend pas de l'automatisation) ; semaine 2 : workflow LinkedIn profil ; ensuite Instagram/Facebook si ça vaut l'effort.

## 8. À fournir par Arnaud
1. Le nom de la rubrique et l'angle « service à blanc » : validé, ou ajusté.
2. 4 anecdotes vécues (sans nommer l'employeur) : un projet qui a mal tourné faute d'un chiffre, un concept sauvé par un ajustement, une décision de bail, un service à blanc raté.
3. Adresse de ton n8n et sa version ; création de l'application LinkedIn (je te guide).
4. Une photo plus grande.
