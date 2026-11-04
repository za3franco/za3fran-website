-- Concept catalogue (K3), lot 3a (researched 4 Nov 2026): crêperie, glacier et gelato, jus et bowls, poulet, tacos et street food.
-- Method as lots 1-2: every line has a source and a date or is flagged as a deduction; undated or old sources say so in their name;
-- other-country sources carry their ISO code. Status: researched. Sources shared by several sheets are declared once.
begin;
create temporary table s(k text primary key, name text, url text, pub date, country text) on commit drop;
insert into s values
 ('ogl',$q$Où Sortir — Nouvelles adresses de glaces à Casablanca$q$,'https://ousortir-ma.pages.dev/en/blog/nouvelles-adresses-glaces-casablanca/','2025-08-01','MA'),
 ('amo',$q$Amorino — page de la boutique Casablanca Anfa (page non datée ; avis les plus récents de mai 2026)$q$,'https://www.amorino.com/stores/casablanca-anfa',null,'MA'),
 ('gice',$q$Bladi — G-Ice s'installe au Maroc (source ancienne, 2007)$q$,'https://www.bladi.net/g-ice-maroc.html','2007-08-19','MA'),
 ('jtjr',$q$Hespress — Joe & The Juice s'installe au Maroc : une première en Afrique (Rabat)$q$,'https://fr.hespress.com/443891-joe-the-juice-sinstalle-au-maroc-une-premiere-en-afrique.html','2025-10-04','MA'),
 ('jtjc',$q$Consonews — Joe & The Juice ancre son concept à Casablanca avec une première adresse à CFC$q$,'https://consonews.ma/lancements/lifestyle-restauration-healthy-joe-the-juice-ancre-son-concept-a-casablanca-avec-une-premiere-adresse-a-cfc','2026-01-20','MA'),
 ('fnp',$q$Hespress — Fermetures de cafés en cascade et licenciements massifs en 2023 (chiffres de la fédération des propriétaires de cafés et restaurants, non vérifiés)$q$,'https://fr.hespress.com/348128-fermetures-de-cafes-en-cascade-et-licenciements-massifs-en-2023.html','2024-01-12','MA'),
 ('l360',$q$Le360 — Fermetures en série, licenciements : à Casablanca, les cafés et les restaurants sont en crise (revue de presse, chiffres de la fédération, non vérifiés)$q$,'https://fr.le360.ma/societe/fermetures-en-serie-licenciements-a-casablanca-les-cafes-et-les-restaurants-sont-en-crise_HCCWAV4CUZCBPMZUOONWGOAQLM/','2024-01-15','MA'),
 ('atc',$q$L'Express Franchise — L'Atelier Artisan Crêpier ouvre 3 nouvelles crêperies$q$,'https://lexpress-franchise.com/franchise/latelier-artisan-crepier/actualites/latelier-artisan-crepier-ouvre-3-nouvelles-creperies/','2024-04-29','FR'),
 ('otc',$q$Hespress — 3T Développement Maroc accélère l'expansion d'O'Tacos avec 15 nouvelles ouvertures$q$,'https://fr.hespress.com/429052-3t-developpement-maroc-accelere-lexpansion-dotacos-avec-15-nouvelles-ouvertures-a-venir.html','2025-06-17','MA'),
 ('etk',$q$Toute la Franchise — Enjoy Tacos accélère son développement international après Franchise Exhibition Morocco 2026 (chiffres de l'enseigne, France)$q$,'https://www.toute-la-franchise.com/news-enjoy-tacos-franchise-exhibition-morocco','2026-05-25','FR'),
 ('sag',$q$Sagaci Research — French tacos, the fast food taking Morocco by storm (source ancienne, 2019)$q$,'https://sagaciresearch.com/french-tacos-the-fast-food-taking-morocco-by-storm/','2019-08-05','MA'),
 ('cs',$q$Toute la Franchise — Destination Casablanca : Chicken Street se lance au Maroc (annonce de l'enseigne ; chiffres de la franchise, France)$q$,'https://www.toute-la-franchise.com/news-destination-casablanc-chicken-street-se-lance-au-maroc','2026-04-09','FR'),
 ('kfc',$q$Le Matin — KFC ouvre son 47e restaurant au centre commercial Almaz à Casablanca$q$,'https://lematin.ma/lifestyle/kfc-ouvre-son-47-restaurant-au-centre-commercial-almaz-a-casablanca/313950/amp','2025-11-17','MA');

create temporary table x(slug text, block text, pos int, body text, inf boolean, sk text, conf text) on commit drop;
insert into x values
 -- CRÊPERIE
 ('creperie','promise',0,$q$Crêpes sucrées, salées et sans gluten à base de produits frais et de saison (L'Atelier Artisan Crêpier, France) : un repas simple servi sur place ou à emporter.$q$,false,'atc','medium'),
 ('creperie','economics',0,$q$Matières premières peu coûteuses et carte courte ; la marge dépend du volume et du loyer. Les chiffres viennent de la famille café-brunch du moteur.$q$,true,null,'low'),
 ('creperie','operations',0,$q$Billig (plaque) et préparation à la minute : un poste de crêpier qualifié suffit, mais la vitesse en service fait le débit.$q$,true,null,'low'),
 ('creperie','success',0,$q$En France, une enseigne de crêperies artisanales annonce en avril 2024 trois ouvertures prévues à l'été 2024, 10 autres prévues la même année et au moins 50 restaurants dans les grandes villes d'ici 2030 ; apport personnel demandé : 150 000 € (chiffre de l'enseigne, France, non transposable).$q$,false,'atc','low'),
 ('creperie','pitfalls',0,$q$Concept saisonnier et facile à copier ; à Casablanca, la crêpe se vend déjà comme produit annexe dans les glaciers, salons de thé et cafés-brunch (voir leurs fiches).$q$,true,null,'low'),
 ('creperie','profile_fit',0,$q$Accessible à un porteur sans expérience (carte courte, équipement léger) ; peu différenciant seul : à associer à un lieu de passage ou à un brunch.$q$,true,null,'low'),
 ('creperie','district_types',0,$q$Archétypes B (familles, week-end) et D (balade, front de mer) : lecture déduite.$q$,true,null,'low'),
 ('creperie','regulatory',0,$q$Pas de licence d'alcool nécessaire (cidre exclu) ; hygiène alimentaire et extraction des fumées de la plaque.$q$,true,null,'low'),
 ('creperie','gaps',0,$q$Aucune crêperie de Casablanca trouvée avec une source datée (les annuaires consultés ne sont pas datés et ne servent pas au recensement) ; aucun prix daté ; aucun cas d'échec ; fiche mince.$q$,false,null,'medium'),
 -- GLACIER ET GELATO
 ('glacier-gelato','promise',0,$q$À Casablanca, des glaciers artisanaux se différencient par la recette : gelato à l'italienne avec parfums de pâtisserie française (La Glacerie, Racine), recettes allégées en sucre et en graisse (Lovely Sheep), parfums marocains (Dar Ice Cream : chebbakia, corne de gazelle, amlou) ou composition à la carte (Guana).$q$,false,'ogl','medium'),
 ('glacier-gelato','economics',0,$q$Ventes très saisonnières, plus faibles en hiver : la trésorerie de la basse saison est le point central. Les chiffres viennent de la famille café-brunch du moteur.$q$,true,null,'low'),
 ('glacier-gelato','operations',0,$q$Laboratoire de fabrication avec turbine, pasteurisateur et vitrine froide ; un maître glacier est la compétence clé. Le fondateur de La Glacerie s'est formé en Italie et à l'Institut Paul Bocuse à Paris.$q$,false,'ogl','medium'),
 ('glacier-gelato','success',0,$q$Amorino tient une boutique à Casablanca Anfa : gelati, sorbets, coupes, gaufres, crêpes et gâteaux glacés, ouverte tous les jours de midi à 22 h ou 23 h (page de la boutique, non datée).$q$,false,'amo','medium'),
 ('glacier-gelato','pitfalls',0,$q$Exemple ancien : en 2007, l'enseigne italienne G-Ice annonçait un premier point de vente dans le Triangle d'Or à plus de 11 millions de dirhams hors local, avec un atelier de 400 m² et une soixantaine d'embauches, et voulait couvrir les grandes villes dès 2008. Je n'ai pas trouvé la suite : un investissement lourd est un risque ancien et documenté (source de 2007).$q$,false,'gice','low'),
 ('glacier-gelato','pitfalls',1,$q$Les cafés et restaurants de la région Casablanca-Settat auraient fermé en nombre en 2023 (8 964 selon la fédération des propriétaires, contre 1 870 en 2022) ; causes citées : charges sociales et fiscales, hausse des matières premières, séquelles du Covid, cafés ambulants. Chiffre de fédération, non vérifié, toutes catégories confondues.$q$,false,'fnp','low'),
 ('glacier-gelato','profile_fit',0,$q$Exige un maître glacier (ou un associé) ; risque élevé en cas de saison faible pour un porteur sans expérience.$q$,true,null,'low'),
 ('glacier-gelato','district_types',0,$q$Archétypes D (front de mer, balade) et B (familles, résidentiel aisé) : lecture déduite.$q$,true,null,'low'),
 ('glacier-gelato','casablanca',0,$q$La Glacerie by Lahlou & Co (Racine, rue Ahmed Amine) ; Amorino (Anfa) ; Lovely Sheep, Dar Ice Cream et Guana cités sans quartier. Aucune ouverture ni aucun prix dans la source.$q$,false,'ogl','medium'),
 ('glacier-gelato','regulatory',0,$q$Chaîne du froid et hygiène des produits laitiers ; pas de licence d'alcool.$q$,true,null,'low'),
 ('glacier-gelato','gaps',0,$q$Aucun prix daté ; aucun cas d'échec marocain récent ; aucune donnée de saisonnalité chiffrée pour Casablanca.$q$,false,null,'medium'),
 -- JUS ET BOWLS
 ('jus-bowls','promise',0,$q$Jus pressés à la commande, café de spécialité et cuisine saine dans un lieu urbain à ambiance soignée, pensé pour la pause, le travail informel et les rendez-vous (Joe & The Juice).$q$,false,'jtjc','medium'),
 ('jus-bowls','economics',0,$q$Ticket moyen faible, forte part de boissons : la rotation et l'emplacement comptent plus que la carte. Les chiffres viennent de la famille café-brunch du moteur.$q$,true,null,'low'),
 ('jus-bowls','operations',0,$q$Presse à froid et préparation à la commande : formation du personnel et approvisionnement quotidien en fruits à prévoir.$q$,true,null,'low'),
 ('jus-bowls','success',0,$q$Joe & The Juice (Danemark, plus de 450 adresses) ouvre à Rabat en octobre 2025, première adresse en Afrique et 100e franchise de l'enseigne, puis à Casablanca Finance City début 2026 : le marché marocain est jugé mûr pour la restauration saine de marque.$q$,false,'jtjr','medium'),
 ('jus-bowls','success',1,$q$Chaque futur point de vente de Casablanca s'inspirerait d'un style emblématique différent de la ville ; le premier rend hommage à l'Art déco et expose quatre artistes marocains contemporains.$q$,false,'jtjc','medium'),
 ('jus-bowls','pitfalls',0,$q$Les jus frais sont une offre ancienne et locale (bars à jus de quartier) : le positionnement doit se justifier par le lieu et le service, pas par le produit seul.$q$,true,null,'low'),
 ('jus-bowls','profile_fit',0,$q$Accessible avec un franchiseur de marque ; en indépendant, dépend d'un emplacement de bureaux ou de salles de sport.$q$,true,null,'low'),
 ('jus-bowls','district_types',0,$q$Archétype A (bureaux, CFC) puis B : lecture déduite.$q$,true,null,'low'),
 ('jus-bowls','casablanca',0,$q$Joe & The Juice, Casablanca Finance City (annonce de janvier 2026).$q$,false,'jtjc','medium'),
 ('jus-bowls','gaps',0,$q$Aucun bar à jus indépendant de Casablanca trouvé avec une source datée ; aucun prix ; aucun cas d'échec.$q$,false,null,'medium'),
 -- POULET
 ('poulet','promise',0,$q$Chicken Street, enseigne française annoncée au Maroc en avril 2026 : poulet braisé, naans maison, 100 % halal, présenté comme de la street food moderne.$q$,false,'cs','medium'),
 ('poulet','economics',0,$q$Coût matière maîtrisé et forte part de vente à emporter et en livraison. Les chiffres viennent de la famille restauration rapide du moteur ; Chicken Street annonce 1,3 million d'euros de chiffre d'affaires potentiel après deux ans (chiffre du franchiseur, France, non transposable).$q$,false,'cs','low'),
 ('poulet','operations',0,$q$Friteuses ou four à braiser, chaîne du froid et fournisseur de volaille régulier ; salle, comptoir, drive et livraison selon l'emplacement.$q$,true,null,'low'),
 ('poulet','success',0,$q$KFC (au Maroc depuis 2001) ouvre son 47e restaurant au centre commercial Almaz à Casablanca le 17 novembre 2025 (salle, drive, livraison) ; plus de 850 salariés au Maroc et cinq ouvertures prévues d'ici fin 2025.$q$,false,'kfc','medium'),
 ('poulet','pitfalls',0,$q$Marché tenu par une enseigne internationale très implantée : un indépendant se heurte à son maillage et à ses prix.$q$,true,'kfc','low'),
 ('poulet','profile_fit',0,$q$Franchise (Chicken Street cherche des « bâtisseurs ») ou indépendant en vente à emporter : investissement modéré, exploitation standardisée.$q$,true,'cs','low'),
 ('poulet','district_types',0,$q$Archétypes A (déjeuner) et E (centres commerciaux, passage) : lecture déduite.$q$,true,null,'low'),
 ('poulet','casablanca',0,$q$KFC Almaz (Casablanca, ouverture du 17 novembre 2025) ; Chicken Street annonce Casablanca comme point de départ au Maghreb, sans adresse ni date d'ouverture.$q$,false,'cs','medium'),
 ('poulet','regulatory',0,$q$Viande halal ; hygiène, extraction des fumées et conditions de la livraison.$q$,true,null,'low'),
 ('poulet','gaps',0,$q$Aucun poulet indépendant de Casablanca trouvé avec une source datée ; aucun prix ; aucun cas d'échec ; ouverture de Chicken Street non confirmée.$q$,false,null,'medium'),
 -- TACOS ET STREET FOOD
 ('tacos-street-food','promise',0,$q$Le tacos français est une tendance installée du fast-food marocain : une source de 2019 le dit présent dans tous les quartiers de Rabat, avec Tacos de Lyon ouvert à Casablanca en 2012 et Tacos Avenue arrivé au Maroc en 2017 (source ancienne).$q$,false,'sag','low'),
 ('tacos-street-food','economics',0,$q$Ticket bas, volume élevé, coût matière faible : la marge dépend du loyer et de la livraison. Les chiffres viennent de la famille restauration rapide du moteur ; Enjoy Tacos cite un apport d'au moins 50 000 € et un chiffre d'affaires moyen de 900 000 € (chiffres de l'enseigne, France, non transposables).$q$,false,'etk','low'),
 ('tacos-street-food','operations',0,$q$Plaque, friteuse et préparation en quelques minutes ; adapté à la vente à emporter et à la livraison ; sauces et viande halal à standardiser.$q$,true,null,'low'),
 ('tacos-street-food','success',0,$q$O'Tacos tient trois restaurants au Maroc (Marrakech, Casablanca Californie et Casablanca Ziraoui) et annonce 15 ouvertures (Tanger, Fès, Agadir, Mohammedia et Casablanca) en juin 2025 ; son opérateur a repris Tacos de Lyon, ancien leader marocain du tacos.$q$,false,'otc','medium'),
 ('tacos-street-food','success',1,$q$Enjoy Tacos (France) cherche des franchisés au Maroc après le salon Franchise Exhibition Morocco des 15 au 17 avril 2026 ; aucun nombre de restaurants marocains n'est donné.$q$,false,'etk','medium'),
 ('tacos-street-food','pitfalls',0,$q$Marché encombré (chaînes françaises et marocaines) et facile à copier ; la reprise de Tacos de Lyon, ancien leader marocain, par l'opérateur d'O'Tacos suggère une concentration en cours (déduction).$q$,true,'otc','low'),
 ('tacos-street-food','profile_fit',0,$q$Accessible avec une franchise ou un indépendant discipliné sur les coûts ; la livraison est un canal majeur (commission des plateformes à prévoir).$q$,true,null,'low'),
 ('tacos-street-food','district_types',0,$q$Archétypes B (jeunes, résidentiel) et E (passage) : lecture déduite.$q$,true,null,'low'),
 ('tacos-street-food','casablanca',0,$q$O'Tacos à Californie et à Ziraoui (source de juin 2025).$q$,false,'otc','medium'),
 ('tacos-street-food','regulatory',0,$q$Viande halal ; hygiène, extraction et conditions de la livraison.$q$,true,null,'low'),
 ('tacos-street-food','gaps',0,$q$Aucun tacos indépendant de Casablanca avec une source datée ; aucun prix daté (la source de 2019 n'en donne pas) ; aucun cas d'échec.$q$,false,null,'medium');

update public.brain_concept_formats f set status='researched', definition_fr=d.def from (values
 ('creperie',$q$Crêperie : crêpes sucrées et salées (galettes) préparées à la minute, servies sur place ou à emporter.$q$),
 ('glacier-gelato',$q$Glacier artisanal : glaces et gelato fabriqués sur place, vendus en cornets, coupes et pâtisseries glacées.$q$),
 ('jus-bowls',$q$Bar à jus et cuisine saine : jus pressés, smoothies, bowls et café, dans un lieu de pause urbain.$q$),
 ('poulet',$q$Restauration rapide centrée sur le poulet (frit, rôti ou braisé), en salle, à emporter et en livraison.$q$),
 ('tacos-street-food',$q$Restauration rapide de tacos français et de street food : galettes garnies, frites et sauces, vente à emporter et livraison.$q$)
) d(slug,def) where f.slug=d.slug;

insert into public.brain_concept_lines (format_id, block, position, body_fr, inference, source_class, source_name, source_url, source_published_at, source_country, confidence)
select f.id, x.block, x.pos, x.body, x.inf, 'published', s.name, s.url, s.pub, s.country, x.conf
from x join public.brain_concept_formats f on f.slug=x.slug left join s on s.k=x.sk;

insert into public.brain_concept_examples (format_id, venue_name, city, country, opened_text, what_fr, proof_fr, source_name, source_url, source_published_at)
select f.id, v.venue, v.city, v.country, v.opened, v.what, v.proof, s.name, s.url, s.pub
from (values
 ('creperie','L''Atelier Artisan Crêpier','Paris (5e), Neuilly-sur-Seine, Annecy','FR','été 2024',$q$Crêpes sucrées, salées et sans gluten, produits frais et de saison.$q$,$q$Enseigne en franchise ; objectif de 50 restaurants d'ici 2030 (annonce de l'enseigne).$q$,'atc'),
 ('glacier-gelato','La Glacerie by Lahlou & Co','Casablanca (Racine)','MA','non indiqué',$q$Gelato artisanal à l'italienne avec parfums de pâtisserie française.$q$,$q$Fondateur formé en Italie et à l'Institut Paul Bocuse (Paris).$q$,'ogl'),
 ('glacier-gelato','Dar Ice Cream','Casablanca','MA','non indiqué',$q$Parfums marocains (chebbakia, corne de gazelle, amlou), recettes sans lactose, souvent véganes.$q$,null,'ogl'),
 ('glacier-gelato','Amorino (Anfa)','Casablanca (Anfa)','MA','non indiqué',$q$Gelato français en boutique : gelati, sorbets, coupes, gaufres, crêpes.$q$,null,'amo'),
 ('jus-bowls','Joe & The Juice (Rabat)','Rabat','MA','octobre 2025',$q$Première adresse en Afrique et 100e franchise de l'enseigne.$q$,$q$Enseigne née à Copenhague en 2002, plus de 450 adresses.$q$,'jtjr'),
 ('jus-bowls','Joe & The Juice (CFC)','Casablanca (Casablanca Finance City)','MA','janvier 2026',$q$Jus à la commande, café de spécialité, cuisine saine ; décor Art déco.$q$,null,'jtjc'),
 ('poulet','KFC Almaz','Casablanca','MA','17 novembre 2025',$q$47e restaurant de l'enseigne au Maroc ; salle, drive et livraison.$q$,$q$Enseigne présente au Maroc depuis 2001, plus de 850 salariés.$q$,'kfc'),
 ('poulet','Chicken Street','Casablanca (annoncé)','FR','annoncé en avril 2026',$q$Poulet braisé et naans maison, 100 % halal ; Casablanca comme point de départ au Maghreb.$q$,$q$110 restaurants (annonce de l'enseigne, France).$q$,'cs'),
 ('tacos-street-food','O''Tacos','Marrakech ; Casablanca (Californie, Ziraoui)','MA','non indiqué',$q$Tacos français en chaîne ; 15 ouvertures annoncées.$q$,null,'otc'),
 ('tacos-street-food','Enjoy Tacos','France (cherche des franchisés au Maroc)','FR','non indiqué',$q$Tacos en franchise ; présence au salon Franchise Exhibition Morocco, avril 2026.$q$,null,'etk')
) v(slug,venue,city,country,opened,what,proof,sk)
join public.brain_concept_formats f on f.slug=v.slug join s on s.k=v.sk;
commit;
