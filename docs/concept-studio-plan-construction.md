# Concept Studio — plan de construction (v1.1, 11 nov. 2026)

*Rédigé à partir de la méthode validée (`claude/concept-studio-methode.md` v0.3, décisions D1–D9), des profils et parcours (`claude/concept-studio-profils-parcours.md`), de la stratégie maîtresse v1.6 (§3.19 et §16) et du code en ligne (commit `8c9aa4b`). Toutes les données citées ont été relues dans Supabase le 11 nov. 2026. Décisions d'Arnaud du 11 nov. au §9.*

---

## 1. Ce que l'on construit, en une phrase

Un outil en ligne qui prend un porteur là où il en est, lui pose des questions courtes, lui répond par des **cartes** (pistes, quartiers, ordres de grandeur) dont **le code choisit le contenu et calcule les chiffres** et dont **le modèle écrit seulement le texte**, puis lui remet un **concept book PDF** et un **concept record** qui pré-remplit le Validator.

Rien n'est montré sur le site tant que ce n'est pas en ligne et testé (règle du site).

## 2. Ce qui existe déjà et sera réutilisé tel quel

| Brique en ligne | Rôle dans le Studio |
|---|---|
| `lib/validator-v2.js` → `runFinancials()` et `buildFacts()` | M7 : mêmes calculs que le Validator et l'atelier de concept (≈ 0,1 s, aucun appel au modèle). **On n'appelle jamais `assess()` ni `finalize()`** : pas de score, pas de verdict. |
| `lib/concept-record.js` (cr-1.0.0), `lib/formats.js` | Brouillon du record tenu pendant la session, mêmes champs, mêmes familles. |
| `lib/estimates.js` | Équipe et investissement estimés à partir des places, de la surface et des services. |
| `lib/validator-writer.js` (contrôles) | Mêmes contrôles de texte : chiffres = valeurs fournies, noms = sources, langue, élisions. |
| `lib/bp-chrome.js`, polices intégrées `lib/bp-assets.js` | Concept book PDF rendu par Chrome sur Vercel, comme le plan. |
| `lib/brain-watch.js` (veille réglementaire) | Modèle de la veille des cartes (D8) et de la Phase C légère. |
| `/brain` (boîte d'entrée, revue en un geste) | Revue par Arnaud des cartes trouvées (D8) et des traits de format (lot 0). |
| `lib/youcanpay.js`, `lib/payments.js`, `lib/payment-fulfil.js`, Stripe | Paiement du Studio (MAD par YouCan Pay, EUR/USD par Stripe). |
| `lib/dashboard.js` | Ventes du Studio dans `/pilotage`. |
| `project.html` + `api/project-status.js` | Étape « Créer » ajoutée au suivi du projet. |

## 3. Ce que le Brain contient aujourd'hui (relu le 11 nov.)

| Donnée | Quantité | Utilisable par le code ? |
|---|---|---|
| Formats du catalogue (`brain_concept_formats`) | 29 (27 avec une famille moteur, 2 hors moteur : dark kitchen, traiteur) | Oui (slug, famille, `seat_based`) |
| Lignes du catalogue (`brain_concept_lines`) | 380, chaque format a 1 ligne « types de quartier » et 1 ligne « adéquation aux profils » | **Non : ce sont des phrases.** Le code ne peut pas filtrer « exige une extraction » ou « archétype C » dans du texte. |
| Exemples (`brain_concept_examples`) | 73 | Oui (nom, ville, pays, source, date) |
| Lignes de fiches quartiers (`brain_district_notes`) | 88 sur 13 quartiers | Oui pour l'affichage ; **aucun archétype A–E rattaché aux quartiers** |
| Lieux recensés (`brain_venues`) | 13 | Oui |
| Densité OpenStreetMap | Maârif, Gauthier | Oui |
| Loyers par quartier | 9 libellés (dont Sidi Belyout) ; aucun pour Centre-ville, CIL, Oasis, Palmier, Racine | Oui |
| Prix de cartes (`brain_menu_prices`) | 32 lignes, **toutes à Essaouira** | Rien pour Casablanca |
| Fourchettes par format (page A9) | 8 fiches ouvertes ; tickets pour 4 formats, places pour 2, **aucune surface** ; rien rempli par Arnaud | **Bloquant** pour chiffrer un porteur qui ne connaît pas ses chiffres |

**Conséquence :** avant toute interface, il faut transformer ce que le catalogue dit en **traits structurés** que le code peut filtrer, et obtenir les **fourchettes de taille et de ticket** (lot 0).

## 4. Architecture

### 4.1 Fichiers nouveaux

| Fichier | Contenu | I/O |
|---|---|---|
| `lib/studio-route.js` | Les 6 questions d'entrée → profil P1–P7 → chemin de modules (§3 de la méthode). | Pur |
| `lib/studio-select.js` | Sélection en code : formats candidats (M3), compatibilité d'un local (M6), classement des quartiers (M5), lecture du marché par archétype (M2). Le classement interne n'est jamais renvoyé au client. | Pur |
| `lib/studio-figures.js` | M7 : brouillon du record → `runFinancials()` → les chiffres affichés (investissement par grandes lignes, effectif, CA en croisière, couverts au point mort, besoin de financement face au budget, part du loyer), chacun avec l'origine de son hypothèse. | Pur |
| `lib/studio-brain.js` | Lecture du Brain (formats, traits, lignes, exemples, quartiers, loyers, recensement, densité, fourchettes), mise en cache dans l'instance. | Supabase |
| `lib/studio-writer.js` | Texte des cartes par Sonnet : l'extrait choisi par le code + placeholders ; contrôles automatiques (§6) ; jusqu'à 2 réécritures, puis la carte s'affiche sans texte libre (données seules) plutôt que fausse. | Claude |
| `lib/studio-session.js` | Machine à étapes : avancer, revenir en arrière, sauter une étape hors chemin, rouvrir. | Pur |
| `lib/studio-book.js` | Concept book : gabarit fixe A4, polices intégrées, rendu Chrome ; aucun appel au modèle (textes déjà vérifiés). | Chrome |
| `api/studio.js` | Une seule fonction, actions `start`, `answer`, `card`, `back`, `figures`, `save`, `finish`. Accès par le code du projet (cookie 2 h, verrouillage 5 essais / 30 min, comme les rapports). | — |
| `api/studio-book.js` | PDF du concept book (`?code=…`), même accès. | — |
| `api/submit-studio.js` | Paiement : branche YouCan Pay d'abord pour le MAD, puis Stripe. | — |
| `studio.html` | La conversation en cartes, bilingue (paires `data-en`/`data-fr`), mobile d'abord. | — |
| `lib/menu-watch.js`, `api/menu-watch.js` | D8, veille des cartes (§7.1). | Claude + web |
| `lib/benchmarks.js` | D9, repères des porteurs (§7.2). | Supabase |

### 4.2 Tables et migrations (toutes RLS activée, aucune politique ; fichier dans `supabase/migrations/`)

| Table | Contenu |
|---|---|
| `brain_concept_traits` | Une ligne par format et par trait : archétypes (A–E), compétence clé (cuisine / salle / bar / gestion), difficulté pour un débutant, besoin d'un exploitant pour un investisseur, extraction (exigée / souhaitable / non), alcool (au cœur / possible / non), services typiques, drapeau réglementaire (aucun / à surveiller / fort), fiche mince, **proposable spontanément** (faux pour le beach club, D4). Chaque trait porte **la ligne du catalogue sur laquelle il repose** (`line_id`) ou `inference = true`. Statut *researched* jusqu'à la revue d'Arnaud. |
| `brain_district_archetypes` | Quartier → archétype(s) A–E, avec ligne source ou `inference = true`. Revue d'Arnaud (B1). |
| `brain_parameter_values` (existante) | Fourchettes par format : nouveaux paramètres `concept.ticket` (qualificatif = service), `concept.seats`, `concept.surface_m2`, avec `format_key` = slug du catalogue (les familles du moteur restent intactes), écrits par `brain_add_value()`, classe *estimate* pour le jugement d'Arnaud, *published* ou signal pour une source. |
| `studio_sessions` | Projet, chemin, étape, réponses, brouillon du record, historique des cartes, usage modèle (tokens, coût), dates. |
| `studio_cards` | Chaque carte écrite : empreinte de l'extrait, texte, contrôles passés, modèle, coût. **Une carte déjà écrite pour le même extrait n'est pas réécrite** (coût encadré en code, jamais de limite affichée). |
| `concept_records` (existante) | Contrainte de source élargie à `concept_studio`. |
| `za3fran_projects` (existante) | `studio_status`, `benchmark_consent_at`. |

### 4.3 Concept record cr-1.1.0

Les champs que le Validator lit déjà ne changent pas. On ajoute un bloc `studio` lu seulement par le concept book et l'écran de confirmation : `format_slug`, `positioning`, `offer_outline`, `price_architecture`, `ambience`, `name_options` (toujours « à vérifier à l'OMPIC »), `districts` (2–3 slugs avec raisons), et une table `estimates` : pour chaque champ estimé, sa fourchette et son origine (fourchette Za3fran du format, carte datée, moteur). Test : un record cr-1.1.0 donne exactement les mêmes chiffres dans `runFinancials()` qu'un record cr-1.0.0 aux mêmes valeurs.

### 4.4 Passage au Validator (point délicat, relu dans le code)

Aujourd'hui `api/webhook-validator.js` **crée le projet** à partir de la soumission et écrit le record **en version 1** ; s'il existe déjà une version 1, l'insertion est ignorée en silence. Avec le Studio, le projet et le record existent avant le Validator. À construire :

1. `validator.html?code=…` charge le record du projet, pré-remplit le formulaire et marque chaque estimation « à confirmer » ; le porteur corrige avant de payer.
2. La soumission porte `project_id` ; le webhook (Stripe et YouCan Pay) **rattache au projet existant** au lieu d'en créer un, et écrit le record confirmé en **version suivante** (source `validator_form`).
3. Le pack Studio + Validator : le Validator déjà payé est consommé à la soumission (pas de second paiement), sur le modèle des packs existants.
4. Test qui casse si le record du formulaire est ignoré (le défaut actuel ne se voit pas : il faut un test).

## 5. Ce que fait chaque module en code (rappel opérationnel de la méthode)

| Module | Le code choisit | Le modèle écrit | Écrit au record |
|---|---|---|---|
| Routage | Profil et chemin (règles §3 de la méthode, dans l'ordre) | Rien | — |
| M1 Profil | — | Une phrase « ce que votre profil implique », à partir des traits (jamais un jugement de la personne) | budget, apport, présence en salle, alcool refusé, ouverture |
| M2 Marché | Par archétype : formats recensés (lieux datés + lignes sourcées) et formats du catalogue sans exemple casablancais daté | La lecture, avec « manque possible, ou limite de nos données » | — |
| M3 Pistes | Filtre : budget (investissement moteur à la taille type ≤ budget × 1,2), expérience, contraintes, drapeaux ; tri par envies, archétypes, manques possibles ; l'idée du porteur toujours incluse | 3 cartes + un tableau comparatif sans note | piste retenue |
| M4 Approfondissement | Les lignes utiles à chaque étape ; les lieux recensés du même format (défi « en quoi êtes-vous différent ? ») ; les noms existants à éviter | Proposition et défi pour chacune des 7 étapes | positionnement, clientèle, services, ticket, places, surface, offre, ambiance, noms |
| M5 Localisation | Archétype compatible, loyer de la surface visée, concurrents recensés, signaux | 2–3 cartes quartier, raisons sourcées, « à vérifier sur place » | quartiers retenus, loyer de référence |
| M6 Local donné | Formats compatibles / sous condition / incompatibles (extraction, surface, places, archétype, part du loyer) | Les raisons | local |
| M7 Ordres de grandeur | Tout (moteur) | Une carte d'accompagnement : constats du moteur, jamais « viable » | — |
| M8 Synthèse | Contrôle « prêt pour le Validator » (format, services, ticket, couverts, places, surface, loyer, budget, ouverture, Ramadan, alcool) | Rien de nouveau : réutilise les textes vérifiés | record `concept_studio` |

Formats hors moteur (dark kitchen, traiteur) : M7 le dit et oriente vers un échange avec Za3fran. Beach club : jamais proposé ; à la demande, la carte du drapeau réglementaire vient en premier.

## 6. Contrôles automatiques des cartes (avant affichage)

1. **Chiffres :** chaque nombre du texte est une valeur fournie par le code (placeholders) ; un nombre en lettres ou en chiffres inventé → réécriture.
2. **Noms :** seulement les lieux, marques et exemples de l'extrait, ce que le porteur a dit, ou la liste `INSTITUTIONS` ; tout autre nom propre → réécriture.
3. **Pas de verdict :** refus des mots « viable », « non viable », « score », « note », « /100 », « garanti », « succès assuré ».
4. **Déductions dites :** une ligne marquée `inference` doit être introduite comme une lecture (« nous en déduisons », « notre lecture »).
5. **Absence ≠ manque :** une phrase qui conclut à un manque du marché sans la réserve → réécriture.
6. **Pays :** un exemple étranger cite son pays.
7. **Lacunes lues :** si la fiche du format proposé a des lignes « lacunes », la carte en dit au moins une.
8. **Nom de concept :** toujours suivi de « à vérifier à l'OMPIC » ; jamais « disponible » ou « libre ».
9. **Langue :** mêmes contrôles que le Validator (anglicismes, élisions, phrases inachevées).

Chaque faute trouvée plus tard dans une carte devient un contrôle, testé dans les deux sens.

## 7. Alimentation du Brain

### 7.1 D8 — Veille des cartes (automatisée)

- **Fonctionnement :** une fois par mois et par ville (Casablanca d'abord), pour une liste de formats (priorité 1 au premier passage), Sonnet avec la recherche web trouve des cartes **publiées par les lieux eux-mêmes** (site, PDF, plateformes de menus QR), lit les prix, relève places et surface quand une source les donne, et dépose **chaque carte en élément `/brain`** (contributeur `veille-cartes`, classe *signal*, lien et date d'observation). Arnaud valide dans `/brain` comme aujourd'hui.
- **Exclus :** plateformes de livraison, extraction automatique de TripAdvisor ou de Google, sites qui interdisent la lecture automatique.
- **Coût :** encadré en code (nombre maximal de recherches par passage, mesuré au premier lot) ; la veille réglementaire coûte ≈ 0,40 € par mois pour 12 recherches.
- **Indépendant du Studio :** peut être construit dès le lot 0, il remplit les fourchettes au fil des mois.

### 7.2 D9 — Chiffres des porteurs comme repères

- **Consentement d'abord (petit, à faire tôt) :** une case non cochée par défaut sur le Validator, l'intake du business plan et le Studio (« J'accepte que mes chiffres, anonymisés et agrégés avec ceux d'au moins N autres projets, servent de repère ») + une ligne dans la politique de confidentialité (FR/EN). Enregistré sur le projet avec la date.
- **Agrégation plus tard** (quand il y aura des projets) : par format et par ville — ticket par service, places, surface, loyer au m² — médiane et quartiles, projets de test et projets sans consentement exclus, **jamais publié sous N projets** ; entre dans le Brain en *estimate* avec la note « repère porteurs Za3fran (n projets) ».

### 7.3 Phase C légère — études publiées

Même mécanisme que D8, une fois par an et par pays : statistiques publiques (HCP), associations professionnelles, documents de franchise américains (Item 19), résumés de cabinets (marqués secondaires). Chaque élément entre comme *source publiée* avec son pays et sa date, ou en connaissance seule ; **une étude étrangère ne fixe jamais un chiffre de Casablanca.** Dernière priorité, après la mise en ligne du Studio.

## 8. Les lots, dans l'ordre, avec leur porte de sortie

Chaque lot se fait dans son propre chat, se termine par des tests verts, un déploiement vérifié (commit en ligne = GitHub) et un brief de passage.

| Lot | Contenu | Ce qu'Arnaud fait | Porte de sortie |
|---|---|---|---|
| **0 — Fondations de données** | Traits structurés des 29 formats tirés des 380 lignes (chaque trait rattaché à sa ligne) ; archétypes des 13 quartiers ; paramètres `concept.ticket/seats/surface_m2` et import des fourchettes ; case de consentement D9 + ligne de confidentialité | Remplir la page des fourchettes, 12 formats d'abord (§9, Q3) ; relire les traits dans `/brain` quand il veut (non bloquant) | Toutes les fourchettes des formats de priorité 1 et 2 présentes ; requêtes de sélection testées |
| **1 — Sélection et chiffres en code** | `studio-route`, `studio-select`, `studio-figures`, `studio-brain` ; 8 profils fictifs de test (P1 à P7 + « un bar à vin comme Canaille ») ; sortie lisible | Lire les 8 sorties : les pistes et les quartiers ont-ils du sens pour un opérateur ? | Arnaud valide les sorties ; aucun format interdit proposé ; chiffres = moteur |
| **2 — Textes des cartes** | `studio-writer` et ses contrôles ; **mesure du coût réel par parcours** sur les 8 profils | Lire les cartes de 3 profils | Toutes les cartes passent les contrôles ; coût d'un parcours P1 ≤ 2,50 € (sinon on réduit avant d'aller plus loin) |
| **3 — Session et interface (usage interne)** | `studio.html`, `api/studio.js`, `studio_sessions`, `studio_cards`, réponses libres classées par Haiku, retour en arrière, reprise par code ; ouvert seulement aux codes de test | Jouer P1 et P7 sur son téléphone ; **l'utiliser comme copilote de ses accompagnements** (§9, Q4) | Parcours complets sans erreur JS, rendu FR/EN téléphone et ordinateur |
| **4 — Concept book et passage au Validator** | Record cr-1.1.0 et source `concept_studio` ; concept book PDF ; `validator.html?code=…` pré-rempli « à confirmer » ; webhooks Stripe et YouCan rattachés au projet existant | Relire un concept book (design signé une fois, comme le plan) | Chaîne complète Studio → Validator payé sur un projet de test, record confirmé en version 2 |
| **5 — Paiement et mise en ligne publique** | Produits `studio` (249 € / 2 490 MAD), `studio_location` (99 € / 990 MAD), `studio_bundle` (349 € / 3 490 MAD) ; prix USD à fixer avec Arnaud ; paiement ; e-mail de livraison ; `/pilotage` ; étape « Créer » sur le tableau de bord du projet ; pages du site (page Studio, tarifs, porte « Pas encore d'idée claire », « Comment ça marche ») ; e-mail aux inscrits de la liste d'attente | Test réel au prix de test YouCan | Achat réel livré une seule fois ; `tests/pricing.test.js` et `tests/site-journey.test.js` verts |
| **6 — Veille des cartes (D8)** | §7.1 ; premier passage Casablanca, formats de priorité 1 | Valider les cartes dans `/brain` | Coût d'un passage mesuré ; aucune source exclue utilisée |
| **7 — Repères des porteurs (D9, agrégation)** | §7.2 ; quand le nombre de projets consentants le permet | — | Aucun repère sous N projets ; tests exclus |
| **8 — Phase C légère** | §7.3 | — | Un premier passage Maroc |

Le lot 6 peut avancer en parallèle des lots 1 à 4 si un chat se libère. Tous les prix MAD restent sous le plafond journalier YouCan actuel (5 000 MAD).

## 9. Décisions d'Arnaud (11 nov. 2026)

| # | Question | Décision |
|---|---|---|
| Q1 | À quel moment le porteur paie-t-il ? | **Décidé :** les 6 questions d'entrée et le routage sont gratuits (aucun appel au modèle) ; paiement avant la première carte écrite. « Localisation seule » (P3) à 99 € ; montée vers le Studio complet pour la différence (150 €). |
| Q2 | Case de consentement D9 avant le lancement du 17 nov. ? | **Décidé : oui, avant le 17 nov.** (Validator, intake du business plan, ligne de confidentialité FR/EN). |
| Q3 | Fourchettes par format (A9) | **Décidé :** Claude refait la page pour le téléphone (≈ 20 min, repères sourcés déjà affichés) ; Arnaud remplit d'abord les **12 formats les plus courants**, puis les autres. |
| Q4 | Studio interne comme copilote des « Accompagnements concept » dès le lot 3 | **Décidé : oui.** |
| Q5 | Seuil N des repères porteurs (D9) | **Ouvert** (à trancher au lot 7). Proposition : 5 projets minimum par format et par ville ; repère porteurs préféré à la fourchette d'Arnaud à partir de 10 projets. |

## 10. Risques et parades

| Risque | Parade |
|---|---|
| Fourchettes A9 non remplies | Le Studio demande le ticket et les places au porteur (M4 étape 5) et ne chiffre pas sans eux ; il ne remplit jamais en silence. |
| Catalogue *researched*, jamais relu | Chaque carte dit « notre recherche, datée » ; la revue d'Arnaud (traits, archétypes) passe en tête de sa liste `/brain` ; jamais bloquante. |
| Texte qui glisse vers un verdict | Contrôle 3 (§6) ; les mots du verdict sont refusés. |
| Coût par session plus élevé que prévu | Mesuré au lot 2 avant toute interface ; cartes mises en cache par extrait ; Haiku pour classer les réponses libres. |
| Record du Validator ignoré en silence | Correction du webhook au lot 4 + test dédié. |
| Concurrence lisible pour peu de formats (13 lieux recensés) | Dit à voix haute ; D8 et les notes `/brain` d'Arnaud enrichissent le recensement. |

## 11. Ce que le plan ne fait pas

Pas de score, pas de verdict, pas d'adresse, pas de nom vérifié à l'OMPIC, pas de chiffre écrit par le modèle, pas de stockage de Google Places, pas de ville hors Casablanca au lancement (liste d'attente ou Validator, D6), pas de page du site avant la mise en ligne.
