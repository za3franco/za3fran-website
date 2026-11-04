-- Concept catalogue (K3), lot 3b (researched 4 Nov 2026): bowls / poke, food hall, bar de quartier, beach club, supper club, traiteur.
-- Method as lots 1-3a: every line has a source and a date or is flagged as a deduction; undated or old sources say so in their name.
-- Status: researched. The beach-club sheet carries the Aïn Diab / public maritime domain regulatory flag.
begin;
create temporary table s(k text primary key, name text, url text, pub date, country text) on commit drop;
insert into s values
 ('nrw',$q$Newrest — ouverture d'un restaurant d'entreprise à Casablanca (date d'ouverture indiquée : 22 sept. 2025)$q$,'https://media.newrest.eu/news/new-opening-successful-for-newrest-morocco/','2025-09-22','MA'),
 ('cve',$q$Hespress — Secteur de l'événementiel : les traiteurs pas trop convaincus par les mesures du CVE (source ancienne, octobre 2020)$q$,'https://fr.hespress.com/168507-secteur-de-levenementiel-les-traiteurs-pas-trop-convaincus-par-les-mesures-prises-par-le-cve.html','2020-10-12','MA'),
 ('cde',$q$FoodInSpace — Carré Eden Food Hall, Marrakech (projet de 2023 ; article de septembre 2024, source de plus de 18 mois)$q$,'https://www.foodinspace.net/project/carre-eden-food-hall-marrakech-morocco/','2024-09-28','MA'),
 ('thb',$q$Bladi — Iconic Casablanca beach club shuttered over tax dispute (Tahiti Beach Club)$q$,'https://en.bladi.net/iconic-casablanca-beach-club-shuttered-over-tax-dispute,107192.html','2024-03-05','MA'),
 ('dbz',$q$Le360 — Dar Bouazza : sept plages privées et restaurants menacés de démolition$q$,'https://fr.le360.ma/economie/dar-bouazza-sept-plages-privees-et-restaurants-menaces-de-demolition_LXSZR6EDYJCKPAMM4C4R5DX2RE/','2024-02-24','MA'),
 ('mhd',$q$Le360 — Casablanca : parasols, chaises… le wali décrète la fin du « business » des plages$q$,'https://fr.le360.ma/societe/casablanca-parasols-chaises-mhidia-decrete-la-fin-du-business-des-plages_LAGT4BCDCJCD3NUTFGCMH6GIMA/','2026-04-22','MA'),
 ('hesp',$q$Hespress — Démolitions sur le littoral d'Aïn Diab$q$,'https://fr.hespress.com/466627-466627.html','2026-03-21','MA'),
 ('ous26',$q$Où Sortir — The 15 New Restaurants in Casablanca to Try in 2026 (14 adresses nommées ; quartiers parfois contradictoires)$q$,'https://ousortir-ma.pages.dev/en/blog/nouveaux-restaurants-casablanca-2026/','2026-02-15','MA'),
 ('mila',$q$Où Sortir — fiche Mila Supper Club (page mise à jour le 7 oct. 2026 ; ouverture non indiquée)$q$,'https://ousortir-ma.pages.dev/en/lieu/mila-supper-club/','2026-10-07','MA'),
 ('ruby',$q$En Primeur Club — fiche Ruby Supper Club Casablanca (site de réservation ; horaires d'août 2026, prix indicatif)$q$,'https://www.enprimeurclub.com/restaurants/ruby-supper-club-casablanca-restaurant','2026-08-24','MA'),
 ('brs',$q$Hespress — Braise Social Kitchen & Wine Bar ouvre ses portes à Casablanca$q$,'https://fr.hespress.com/492406-braise-social-kitchen-et-wine-bar-ouvre-ses-portes-a-casablanca.html','2026-10-15','MA');

create temporary table x(slug text, block text, pos int, body text, inf boolean, sk text, conf text) on commit drop;
insert into x values
 -- BOWLS / POKE
 ('bowls-poke','promise',0,$q$Les poké bowls figurent au menu d'un restaurant d'entreprise ouvert à Casablanca le 22 septembre 2025, à côté d'un bar à salades, de plats marocains, de brasserie, d'italien et d'un barbecue.$q$,false,'nrw','low'),
 ('bowls-poke','economics',0,$q$Bol composé à la commande, ticket moyen modéré ; le coût du poisson cru pèse sur la marge. Les chiffres viennent de la famille restauration rapide du moteur.$q$,true,null,'low'),
 ('bowls-poke','operations',0,$q$Poisson cru frais (chaîne du froid, approvisionnement quotidien) et ligne de montage rapide au comptoir.$q$,true,null,'low'),
 ('bowls-poke','pitfalls',0,$q$Format porté par la mode du « healthy » et concurrencé par les bols des cafés sains et des bars à jus (voir la fiche jus et bowls).$q$,true,null,'low'),
 ('bowls-poke','profile_fit',0,$q$Accessible à un porteur sans expérience si la chaîne du froid est maîtrisée ; faible différenciation à produit égal.$q$,true,null,'low'),
 ('bowls-poke','district_types',0,$q$Archétype A (bureaux, déjeuner) : lecture déduite.$q$,true,null,'low'),
 ('bowls-poke','regulatory',0,$q$Hygiène du poisson cru et traçabilité ; pas de licence d'alcool.$q$,true,null,'low'),
 ('bowls-poke','gaps',0,$q$Aucun restaurant de poké de Casablanca trouvé avec une source datée (une annonce de vente d'un restaurant de poké sur une plateforme d'annonces, non datée, n'est pas retenue) ; aucun exemple de concept dédié, aucun prix, aucun cas d'échec ; fiche mince.$q$,false,null,'medium'),
 -- FOOD HALL
 ('food-hall','promise',0,$q$Marché d'Eden (centre commercial Carré Eden, Marrakech) : food court de 1 200 m² conçu comme un lieu où manger, se détendre et travailler, avec des assises variées (tables familiales, couples, groupes) et une vitrine de créateurs locaux ; la zone en bois peut devenir une scène.$q$,false,'cde','low'),
 ('food-hall','economics',0,$q$Le modèle de la halle (loyers de stands, parties communes, animation) n'est pas dans le moteur ; pour un exploitant de stand, les chiffres viennent de la famille restauration rapide.$q$,true,null,'low'),
 ('food-hall','operations',0,$q$Parties communes, plonge, gestion des flux et choix du mélange de comptoirs : le rôle de l'opérateur de la halle est distinct de celui du locataire d'un stand.$q$,true,null,'low'),
 ('food-hall','pitfalls',0,$q$Dépend du flux du centre ou du lieu qui l'accueille ; un porteur seul ne crée pas la fréquentation d'une halle.$q$,true,null,'low'),
 ('food-hall','profile_fit',0,$q$Côté stand : accessible, investissement réduit ; côté halle : investisseur ou promoteur avec un site.$q$,true,null,'low'),
 ('food-hall','district_types',0,$q$Archétype E (centres commerciaux, passage) : lecture déduite.$q$,true,null,'low'),
 ('food-hall','regulatory',0,$q$Règles d'un centre commercial ou d'un marché couvert ; hygiène par stand.$q$,true,null,'low'),
 ('food-hall','gaps',0,$q$Aucune halle gourmande de Casablanca vérifiée avec une source datée. Un projet de reconversion du Marché central en marché gastronomique est annoncé depuis juillet 2019 (articles non lisibles par nos outils) : état actuel inconnu. Aucun prix, aucun cas d'échec ; exemple unique de Marrakech, source de plus de 18 mois.$q$,false,null,'medium'),
 -- BAR DE QUARTIER
 ('bar-de-quartier','promise',0,$q$Braise Social Kitchen & Wine Bar (Gauthier, ouverture le 16 octobre 2026) : cuisine de feu méditerranéenne au Josper, petites assiettes à partager, vins marocains et internationaux, pensé pour l'afterwork, les dîners entre amis et les longues soirées.$q$,false,'brs','medium'),
 ('bar-de-quartier','economics',0,$q$Forte part de boissons si la licence d'alcool est obtenue ; ticket modéré, rotation du soir. Les chiffres viennent de la famille bar-lounge du moteur.$q$,true,null,'low'),
 ('bar-de-quartier','operations',0,$q$Équipe réduite (bar et petite cuisine), horaires du soir ; la sélection de vins et de bières est le cœur de l'offre.$q$,true,null,'low'),
 ('bar-de-quartier','pitfalls',0,$q$Dépend de la licence d'alcool et de l'accord du voisinage ; la clientèle de quartier est fidèle mais limitée en nombre.$q$,true,null,'low'),
 ('bar-de-quartier','profile_fit',0,$q$Adapté à un opérateur qui connaît la clientèle du quartier ; difficile pour un porteur sans licence ni expérience du bar.$q$,true,null,'low'),
 ('bar-de-quartier','district_types',0,$q$Archétype C (sortie du soir, centre animé) puis B : lecture déduite.$q$,true,null,'low'),
 ('bar-de-quartier','casablanca',0,$q$L'Octave (cocktail bar et restaurant, Gauthier) figure parmi les adresses de 2026 d'un guide ; Braise (Gauthier) ouvre en octobre 2026.$q$,false,'ous26','medium'),
 ('bar-de-quartier','regulatory',0,$q$Licence d'alcool, horaires de fermeture et règles de voisinage.$q$,true,null,'low'),
 ('bar-de-quartier','gaps',0,$q$Aucun bar de quartier indépendant (hors restaurant-bar) trouvé avec une source datée ; aucun prix ; aucun cas d'échec ; procédure de licence d'alcool à Casablanca non documentée (voir la liste d'Arnaud).$q$,false,null,'medium'),
 -- BEACH CLUB
 ('beach-club','promise',0,$q$Tahiti Beach Club (Aïn Diab) se présente comme le plus grand complexe de plage privée du Maroc, avec huit piscines.$q$,false,'thb','medium'),
 ('beach-club','economics',0,$q$Revenus de saison et part de location d'équipements : la recette dépend du titre d'occupation. Format mal couvert par le moteur (famille bar-lounge) : prudence sur tout chiffre.$q$,true,null,'low'),
 ('beach-club','pitfalls',0,$q$Cas d'échec : le Tahiti Beach Club est fermé depuis le 29 février 2024, après la saisie de son matériel par les autorités pour impôts impayés ; il exploitait une concession maritime qui n'a pas été renouvelée à son échéance. La direction disait vouloir régler le dossier fiscal.$q$,false,'thb','medium'),
 ('beach-club','pitfalls',1,$q$Sur la corniche de Dar Bouazza, sept plages privées et restaurants (dont Sunny Beach, Baya Beach et Malibu Beach) sont menacés de démolition pour occupation illégale du domaine public maritime, après une mise en demeure du gouverneur de Nouaceur (février 2024).$q$,false,'dbz','medium'),
 ('beach-club','profile_fit',0,$q$Réservé à un investisseur titulaire d'une concession régulière et d'un dossier fiscal propre ; non recommandé sans titre d'occupation.$q$,true,null,'low'),
 ('beach-club','district_types',0,$q$Archétype D (front de mer) : lecture déduite.$q$,true,null,'low'),
 ('beach-club','casablanca',0,$q$Tahiti Beach Club (Aïn Diab), fermé depuis février 2024.$q$,false,'thb','medium'),
 ('beach-club','regulatory',0,$q$Drapeau réglementaire : le wali de Casablanca-Settat a interdit l'exploitation commerciale des plages de Casablanca pour l'été 2026 (location de parasols et de chaises), tous les appels d'offres étant gelés (22 avril 2026) ; l'article ne dit pas comment les exploitants existants seront traités.$q$,false,'mhd','medium'),
 ('beach-club','regulatory',1,$q$Démolitions de constructions illicites sur le littoral d'Aïn Diab (mars 2026) : le statut juridique de tout ouvrage en bord de mer est à vérifier avant tout engagement.$q$,false,'hesp','medium'),
 ('beach-club','gaps',0,$q$Aucun beach club de Casablanca en activité régulière confirmé par une source datée ; aucun prix ; statut des concessions existantes et décision pour l'été 2027 inconnus ; format à très fort risque réglementaire, à signaler plainement dans le Studio.$q$,false,null,'medium'),
 -- SUPPER CLUB
 ('supper-club','promise',0,$q$Mila Supper Club (Oasis-Maârif) : le dîner d'abord, service à partir de 20 h, puis musique live jusqu'à 3 h du matin ; ouvert du mardi au dimanche.$q$,false,'mila','medium'),
 ('supper-club','success',0,$q$Ruby Supper Club (21 boulevard Driss Slaoui) : « supper club japonais raffiné », menu dégustation, musique live, ouvert tous les jours de 21 h à 3 h 30 (horaires d'août 2026) ; prix indicatif de 50 à 100 dollars par personne selon un site de réservation (source secondaire).$q$,false,'ruby','low'),
 ('supper-club','economics',0,$q$Ticket élevé, part de boissons et d'animation importante, coût des artistes en direct. Les chiffres viennent de la famille restaurant du moteur.$q$,true,null,'low'),
 ('supper-club','operations',0,$q$Horaires tardifs, sonorisation et gestion du voisinage ; équipe de nuit et service des boissons.$q$,true,null,'low'),
 ('supper-club','pitfalls',0,$q$Dépend de l'ambiance, de la programmation et d'horaires tardifs ; une mode de sortie peut vieillir vite.$q$,true,null,'low'),
 ('supper-club','profile_fit',0,$q$Demande une expérience de l'animation de salle et un réseau de clientèle ; à réserver aux profils expérimentés ou aux investisseurs avec un opérateur.$q$,true,null,'low'),
 ('supper-club','district_types',0,$q$Archétype C (sortie du soir) : lecture déduite.$q$,true,null,'low'),
 ('supper-club','casablanca',0,$q$Mila Supper Club (Maârif ou Oasis selon la source, annoncé parmi les adresses de 2026) ; Ruby Supper Club (boulevard Driss Slaoui).$q$,false,'ous26','medium'),
 ('supper-club','regulatory',0,$q$Licence d'alcool, horaires de fermeture, musique live et règles de voisinage.$q$,true,null,'low'),
 ('supper-club','gaps',0,$q$Aucun prix de carte daté ; aucune date d'ouverture ; aucun cas d'échec ; le quartier de Mila diffère selon les sources.$q$,false,null,'medium'),
 -- TRAITEUR
 ('traiteur','promise',0,$q$Restaurant d'entreprise de Newrest Morocco ouvert à Casablanca le 22 septembre 2025 pour un grand client bancaire : stations digitalisées, menu changeant chaque jour, bar à salades, poké bowls, plats marocains, brasserie, italien et barbecue ; près de 300 couverts par jour, plus de 1 000 repas par jour attendus quand les trois restaurants du site tourneront.$q$,false,'nrw','medium'),
 ('traiteur','economics',0,$q$Format hors moteur (pas de places) : les chiffres se construisent par commande (coût par couvert, minimum de commande, saisonnalité des fêtes) et restent à définir.$q$,true,null,'low'),
 ('traiteur','operations',0,$q$Cuisine de production, logistique et transport, personnel d'extra les jours de pointe ; pas de salle à tenir.$q$,true,null,'low'),
 ('traiteur','pitfalls',0,$q$Cas d'ancienneté : en octobre 2020, l'événementiel marocain était à l'arrêt depuis mars (mariages interdits) ; une traiteuse de Casablanca jugeait les aides publiques trop tardives et refusait de s'endetter (source ancienne, 2020).$q$,false,'cve','low'),
 ('traiteur','profile_fit',0,$q$Accessible à un professionnel avec réseau (entreprises, familles) ; faible besoin d'un emplacement en vitrine.$q$,true,null,'low'),
 ('traiteur','district_types',0,$q$Pas de quartier de salle : le choix suit la logistique (accès, coût du local) ; lecture déduite.$q$,true,null,'low'),
 ('traiteur','regulatory',0,$q$Agrément sanitaire de la cuisine de production et règles de transport des denrées ; à vérifier.$q$,true,null,'low'),
 ('traiteur','gaps',0,$q$Aucun traiteur indépendant de Casablanca trouvé avec une source datée ; aucun prix par couvert ; aucun cas d'échec récent ; format hors moteur ; l'exemple trouvé est un grand groupe de restauration collective.$q$,false,null,'medium');

update public.brain_concept_formats f set status='researched', definition_fr=d.def from (values
 ('bowls-poke',$q$Comptoir de bols composés à la commande (poké, riz, protéines, légumes), pensé pour le déjeuner rapide.$q$),
 ('food-hall',$q$Halle gourmande ou food court : plusieurs comptoirs de cuisines différentes autour d'espaces de restauration communs.$q$),
 ('bar-de-quartier',$q$Bar de proximité tourné vers l'afterwork et la soirée : boissons, vins, petites assiettes à partager.$q$),
 ('beach-club',$q$Établissement de bord de mer avec plage privée ou aménagée, piscine, restauration et animation, souvent saisonnier.$q$),
 ('supper-club',$q$Dîner suivi d'une soirée avec musique live : le repas d'abord, l'ambiance ensuite, tard dans la nuit.$q$),
 ('traiteur',$q$Production de repas pour événements et entreprises, livrés ou servis chez le client, sans salle ouverte au public.$q$)
) d(slug,def) where f.slug=d.slug;

insert into public.brain_concept_lines (format_id, block, position, body_fr, inference, source_class, source_name, source_url, source_published_at, source_country, confidence)
select f.id, x.block, x.pos, x.body, x.inf, 'published', s.name, s.url, s.pub, s.country, x.conf
from x join public.brain_concept_formats f on f.slug=x.slug left join s on s.k=x.sk;

insert into public.brain_concept_examples (format_id, venue_name, city, country, opened_text, what_fr, proof_fr, source_name, source_url, source_published_at)
select f.id, v.venue, v.city, v.country, v.opened, v.what, v.proof, s.name, s.url, s.pub
from (values
 ('food-hall','Marché d''Eden (Carré Eden)','Marrakech','MA','projet de 2023',$q$Food court de 1 200 m² avec assises variées et vitrine de créateurs locaux.$q$,null,'cde'),
 ('bar-de-quartier','Braise Social Kitchen & Wine Bar','Casablanca (Gauthier)','MA','16 octobre 2026',$q$Cuisine de feu méditerranéenne, petites assiettes, vins sélectionnés avec un sommelier.$q$,null,'brs'),
 ('bar-de-quartier','L''Octave','Casablanca (Gauthier)','MA','non indiqué',$q$Cocktail bar et restaurant.$q$,null,'ous26'),
 ('beach-club','Tahiti Beach Club','Casablanca (Aïn Diab)','MA','fermé depuis le 29 février 2024',$q$Plus grand complexe de plage privée du Maroc selon lui, huit piscines.$q$,$q$Fermé après saisie du matériel pour impôts impayés ; concession maritime non renouvelée.$q$,'thb'),
 ('supper-club','Mila Supper Club','Casablanca (Oasis-Maârif)','MA','non indiqué',$q$Dîner puis musique live jusqu'à 3 h, du mardi au dimanche.$q$,null,'mila'),
 ('supper-club','Ruby Supper Club','Casablanca (boulevard Driss Slaoui)','MA','non indiqué',$q$Supper club japonais, menu dégustation, musique live.$q$,null,'ruby'),
 ('traiteur','Newrest Morocco (restaurant d''entreprise)','Casablanca','MA','22 septembre 2025',$q$Restauration collective digitalisée pour un client bancaire ; menu quotidien varié.$q$,$q$Près de 300 couverts par jour ; plus de 1 000 attendus.$q$,'nrw')
) v(slug,venue,city,country,opened,what,proof,sk)
join public.brain_concept_formats f on f.slug=v.slug join s on s.k=v.sk;
commit;
