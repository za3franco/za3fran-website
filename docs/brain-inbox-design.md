# Brain Inbox — note de conception

*29 oct. 2026 · Phase A, étape 7 · à valider par Arnaud avant construction*

## En une phrase
Tu envoies au Brain tout ce que tu croises (article, PDF, photo de carte, lien, note dictée) ; Claude le lit, le résume, en extrait les chiffres avec leur source et leur date, et te le présente dans une file « À revoir » où tu valides, corriges ou rejettes d'un geste. Rien n'entre dans le Brain sans ton accord.

## Deux portes d'entrée
1. **Par e-mail — brain@za3fran.io.** Depuis n'importe quelle appli du téléphone : Partager → Mail → brain@za3fran.io. Cloudflare remet le message à un petit programme gratuit (un *Email Worker*, collé une seule fois dans Cloudflare) qui le dépose dans un stockage privé et prévient le site. **Seules tes adresses d'expéditeur sont acceptées** ; tout autre envoi est refusé à l'entrée.
2. **Par l'appli Brain — za3fran.io/brain.** Une page installable sur l'écran d'accueil du téléphone, comme une appli. Quatre gestes : coller un lien, joindre un fichier, prendre une photo, taper ou dicter une note (micro du clavier) ; étiquettes facultatives. Sur Android, l'appli apparaît aussi directement dans le menu « Partager ».

**Accès :** un code personnel saisi une fois par appareil, mémorisé 30 jours ; 5 essais puis blocage 30 minutes (compteur en base, pas en mémoire).

## Ce que fait Claude sur chaque élément (en 10 à 60 secondes)
- **Lit** le texte, le PDF, la photo ou la page web du lien.
- **Résume** en français, en 3 à 5 lignes.
- **Extrait les faits chiffrés**, chacun avec : la valeur ou la fourchette, l'unité, la ville et le format concernés, la date d'observation, la source (nom, lien, date de publication) et une courte citation. Quand un fait correspond à un paramètre existant du Brain (loyer, salaire, ticket, charges…), il le rattache.
- **Cartes de restaurant** : relève chaque prix (établissement, plat, prix, date de la carte). La photo est **supprimée** dès les prix extraits ; une carte de plus de 18 mois est signalée.
- **Propose des étiquettes** (marché, format, thème) et une destination : *chiffre de référence*, *méthode*, *document à garder*, *à jeter*.
- **Pose la question des droits** quand c'est flou. Un document d'employeur ou contenant des données clients n'est **pas lu au-delà de son identification** et le fichier est supprimé.
- Modèle : Haiku d'abord (≈ 1 centime) ; Sonnet pour les photos, PDF chargés et cas difficiles (≈ 3 à 10 centimes). Pas d'abonnement.

## Ce que tu fais — l'écran « À revoir »
Chaque élément montre le résumé, puis ses faits un par un : **✓ ajouter · ✎ corriger · ✕ rejeter**. Un fait ajouté devient une valeur du Brain avec sa source ; s'il remplace une valeur existante, l'ancienne est archivée (« une seule valeur vivante »). La même file reprend les points déjà en attente de ta revue (aujourd'hui 37 ouverts, dont 31 changements de méthode).

**Recherche :** une barre « Que sait le Brain sur… » cherche dans les éléments reçus et dans toutes les valeurs du Brain (recherche plein texte de Supabase, gratuite).

## Écrans de l'appli
1. **Ajouter** (écran d'accueil) · 2. **À revoir** (avec compteur) · 3. **Fiche d'un élément** · 4. **Rechercher**.
Bilingue FR/EN, charte Za3fran, pensée pour le téléphone.

## Sous le capot (pour mémoire)
- Tables (accès serveur uniquement) : `brain_inbox_items` (un élément reçu : origine, texte, fichiers, statut, résumé, étiquettes, droits, contributeur, dates), `brain_inbox_facts` (un fait extrait, son statut et la valeur du Brain créée), `brain_menu_prices` (prix relevés sur des cartes datées), `brain_auth_attempts` (blocage des essais).
- Stockage : seau privé Supabase `brain-inbox` (1 Go gratuit) ; les fichiers sont déposés directement par le Worker ou l'appli (pas de limite des 4,5 Mo de Vercel).
- Pages et fonctions : `brain.html`, `api/brain-inbox.js` (réception, revue, recherche), `api/brain-extract.js` (lecture par Claude) ; une tâche planifiée Vercel relance tout élément resté en attente.
- Coût fixe : zéro. Coût variable : quelques centimes par élément.

## Ce qui n'est pas dans cette étape
Questions en langage libre au Brain (« quel loyer pour un bistrot à Maarif ? » avec réponse rédigée) — prévu ensuite, sur la même recherche ; le résumé mensuel des changements ; l'ouverture à d'autres contributeurs que toi.
