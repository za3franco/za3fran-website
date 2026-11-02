-- Concept catalogue (K3), lot 1 (researched 2 Nov 2026): café de spécialité, boulangerie-pâtisserie-café,
-- bistro-brasserie de quartier, comptoir japonais / sushi, bar à cocktails.
-- Same method as the wine-bar pilot (claude/catalogue-concepts-structure.md §3 and §6).
-- Every line: source + date, or flagged as a deduction; other-country sources carry their country and never
-- set a Casablanca figure; undated sources say so in their name. Status: researched.

------------------------------------------------------------------------------------------------
-- 1. CAFÉ DE SPÉCIALITÉ
------------------------------------------------------------------------------------------------
update public.brain_concept_formats set status='researched',
  definition_fr=$q$Café centré sur un café de qualité (grains d'origine identifiée, torréfaction récente, préparation par un barista : espresso et méthodes douces), souvent avec une offre courte de pâtisserie ou de brunch.$q$
 where slug='cafe-de-specialite';

with src(k,name,url,pub,country) as (values
 ('bm',$q$Barista Magazine — Exploring the specialty-coffee world of Marrakech, Morocco (Michaela Tomchek)$q$,'https://www.baristamagazine.com/exploring-the-specialty-coffee-world-of-marrakech-morocco/','2026-09-10'::date,'MA'),
 ('lm',$q$Le Matin — Coffee Berry s'installe à Casablanca$q$,'https://lematin.ma/lifestyle/coffee-berry-sinstalle-a-casablanca/260456','2025-01-20'::date,'MA'),
 ('ar',$q$% Arabica — page « first store in Morocco » (page non datée)$q$,'https://arabica.coffee/en/?p=3708',null::date,'MA'),
 ('bw',$q$Bewildered in Morocco — Best Neighborhoods to Live in Casablanca (blog de résidente, secondaire)$q$,null,'2026-09-04'::date,'MA'),
 ('osm',$q$OpenStreetMap via Overpass, relevé du 1 nov. 2026 (Maârif et Gauthier, cercles de 650 m)$q$,'https://www.openstreetmap.org/copyright','2026-11-01'::date,'MA'),
 ('wcp',$q$Tea & Coffee Trade Journal — Europe's coffee shop market: pinched yet promising (données World Coffee Portal, Project Café Europe 2025)$q$,'https://www.teaandcoffee.net/blog/36653/europes-coffee-shop-market-pinched-yet-promising/','2025-04-17'::date,'EU'),
 ('rl',$q$Roasters — State of specialty coffee in Lisbon 2026 (mai 2026)$q$,'https://roasters.app/journal/state-of-specialty-coffee-in-lisbon-2026','2026-05-01'::date,'PT'),
 ('pdg',$q$Perfect Daily Grind (ES) — ¿Por qué la apuesta por la comida en las cafeterías ya no es tan rentable? (Sarah Charles, données surtout américaines)$q$,'https://perfectdailygrind.com/es/2026/07/06/apuesta-comida-cafeterias-no-es-rentable/','2026-07-06'::date,'US'),
 ('ip',$q$iProfesional — Alertan que habrá una ola de cierres en el café de especialidad (Buenos Aires)$q$,'https://www.iprofesional.com/negocios/426449-atencion-emprendedores-alertan-que-habra-ola-cierres-cafe-especialidad','2025-04-18'::date,'AR')
), x(block,pos,body,inf,sk,conf) as (values
 ('promise',0,$q$À Marrakech, le café de spécialité se concentre à Guéliz ; clientèle de résidents et de touristes, qui viennent se détendre, travailler ou pour des événements.$q$,false,'bm','medium'),
 ('promise',1,$q$À Lisbonne, clientèle très internationale (télétravailleurs, touristes, Portugais de retour) ; cartes bilingues.$q$,false,'rl','medium'),
 ('economics',0,$q$Le café se vend cher mais rapporte peu une fois le loyer, l'énergie et les salaires payés ; le travail est la principale dépense.$q$,false,'pdg','medium'),
 ('economics',1,$q$La nourriture augmente le ticket moyen, mais ajoute du personnel, du gaspillage et ralentit le service au comptoir.$q$,false,'pdg','medium'),
 ('economics',2,$q$À Lisbonne, avec un flat white autour de 2 €, c'est la nourriture (brunch) qui rend beaucoup de cafés viables.$q$,false,'rl','medium'),
 ('economics',3,$q$Le prix du café vert a atteint des records ; les exploitants européens ont augmenté leurs prix (cappuccino moyen en hausse de 7,6 % sur un an).$q$,false,'wcp','medium'),
 ('economics',4,$q$Un exploitant de Buenos Aires décrit ses coûts en trois tiers : salaires ; matière première et emballages ; loyer, charges, services, marketing et administration.$q$,false,'ip','low'),
 ('operations',0,$q$Le grain vient soit d'un torréfacteur marocain (Intro, Tanger, chez HeiBai), soit d'un torréfacteur étranger (Pays-Bas, Australie) : chaîne d'importation à prévoir.$q$,false,'bm','medium'),
 ('operations',1,$q$La qualité inégale des baristas est citée comme une difficulté du métier.$q$,false,'ip','low'),
 ('operations',2,$q$Petite surface possible ; une offre de nourriture demande four et froid, donc plus de personnel et d'équipement (la famille café / brunch du moteur porte les chiffres).$q$,true,'pdg','low'),
 ('success',0,$q$Le fondateur d'un café de Marrakech décrit un écosystème jeune, pas encore développé : un marché à construire, pas encore saturé.$q$,false,'bm','medium'),
 ('success',1,$q$À Lisbonne, de 2–3 cafés de spécialité en 2015 à plus de 100 début 2026 ; les nouvelles ouvertures partent vers des quartiers aux loyers plus bas.$q$,false,'rl','medium'),
 ('success',2,$q$Les cafés haut de gamme, qui visent une clientèle aisée, semblent mieux résister.$q$,false,'ip','low'),
 ('success',3,$q$La rapidité reste la première raison de choisir un café de vente rapide (étude Technomic citée).$q$,false,'pdg','medium'),
 ('pitfalls',0,$q$Buenos Aires compte environ 150 cafés de spécialité ; des exploitants y annoncent un écrémage où seuls les meilleurs resteront.$q$,false,'ip','low'),
 ('pitfalls',1,$q$Une carte de nourriture trop large dilue l'offre, alourdit le travail et génère du gaspillage.$q$,false,'pdg','medium'),
 ('pitfalls',2,$q$Des chaînes internationales s'installent sur les grands boulevards de Casablanca (Coffee Berry, % Arabica) : concurrence de marque pour un indépendant.$q$,true,'lm','low'),
 ('profile_fit',0,$q$Accessible à un porteur sans expérience s'il s'entoure d'un barista confirmé et d'un torréfacteur ; un investisseur a besoin d'un exploitant.$q$,true,null,'low'),
 ('district_types',0,$q$Archétype B (résidentiel aisé : Racine, Palmier, cités pour leurs cafés et brunchs) et archétype A le matin en semaine : lecture déduite.$q$,true,'bw','low'),
 ('casablanca',0,$q$Coffee Berry, boulevard d'Anfa, premier café de la chaîne au Maroc (franchise marocaine) : quatre mélanges, neuf origines, petite restauration.$q$,false,'lm','medium'),
 ('casablanca',1,$q$% Arabica, boulevard d'Anfa, quartier Racine, premier café de la marque au Maroc (date d'ouverture non indiquée).$q$,false,'ar','low'),
 ('casablanca',2,$q$Racine et Palmier sont décrits comme riches en cafés et adresses de brunch.$q$,false,'bw','low'),
 ('casablanca',3,$q$OpenStreetMap compte 39 cafés au Maârif et 37 à Gauthier, sans distinguer les cafés de spécialité : la source ne mesure pas ce créneau.$q$,false,'osm','medium'),
 ('regulatory',0,$q$Pas d'alcool ; terrasse sur le domaine public à faire autoriser ; autorisation sanitaire si préparation alimentaire : à vérifier.$q$,true,null,'low'),
 ('gaps',0,$q$Aucune carte de prix datée d'un café de spécialité à Casablanca.$q$,false,null,'medium'),
 ('gaps',1,$q$Aucun prix d'achat du grain torréfié au Maroc, aucun cas d'échec marocain trouvé.$q$,false,null,'medium'),
 ('gaps',2,$q$Article TelQuel du 18 sept. 2025 sur le « third wave coffee » au Maroc non lisible par nos outils.$q$,false,null,'medium')
)
insert into public.brain_concept_lines (format_id, block, position, body_fr, inference, source_class, source_name, source_url, source_published_at, source_country, confidence)
select f.id, x.block, x.pos, x.body, x.inf, 'published', src.name, src.url, src.pub, src.country, x.conf
from x join public.brain_concept_formats f on f.slug='cafe-de-specialite' left join src on src.k=x.sk;

insert into public.brain_concept_examples (format_id, venue_name, city, country, opened_text, what_fr, proof_fr, source_name, source_url, source_published_at)
select f.id, v.venue, v.city, v.country, v.opened, v.what, v.proof, v.sname, v.surl, v.spub
from (values
 ('Gless Coffee','Marrakech','MA','décembre 2025',$q$Café centré sur les boissons, café filtre (rare à Marrakech), matcha importé du Japon, carte qui change souvent.$q$,$q$Cité parmi les adresses de référence de Guéliz moins d'un an après l'ouverture.$q$,'Barista Magazine — Marrakech specialty coffee (10 sept. 2026)','https://www.baristamagazine.com/exploring-the-specialty-coffee-world-of-marrakech-morocco/','2026-09-10'::date),
 ('HeiBai Specialty Coffee','Marrakech','MA','début 2025',$q$Café filtre et thé, dans un quartier plus local ; grains d'Intro (Tanger) et de Manhattan (Pays-Bas).$q$,$q$Connu pour son café filtre ; travaille avec un torréfacteur marocain.$q$,'Barista Magazine — Marrakech specialty coffee (10 sept. 2026)','https://www.baristamagazine.com/exploring-the-specialty-coffee-world-of-marrakech-morocco/','2026-09-10'::date),
 ('Kartell Kollektiv','Marrakech','MA','2022 (Guéliz), 2025 (Médina)',$q$Parmi les premiers cafés indépendants de troisième vague à Marrakech.$q$,$q$Deuxième adresse ouverte en 2025, dans la Médina.$q$,'Barista Magazine — Marrakech specialty coffee (10 sept. 2026)','https://www.baristamagazine.com/exploring-the-specialty-coffee-world-of-marrakech-morocco/','2026-09-10'::date),
 ('Coffee Berry','Casablanca','MA','janvier 2025',$q$Franchise grecque, première adresse au Maroc, boulevard d'Anfa ; mélanges maison, origines uniques, petite restauration.$q$,null,'Le Matin — Coffee Berry s''installe à Casablanca (20 janv. 2025)','https://lematin.ma/lifestyle/coffee-berry-sinstalle-a-casablanca/260456','2025-01-20'::date),
 ('Fabrica Coffee Roasters','Lisbonne','PT','2014',$q$Torréfacteur-café pionnier de la scène lisboète.$q$,$q$La ville est passée de 2–3 cafés de spécialité en 2015 à plus de 100 début 2026.$q$,'Roasters — State of specialty coffee in Lisbon 2026 (mai 2026)','https://roasters.app/journal/state-of-specialty-coffee-in-lisbon-2026','2026-05-01'::date),
 ('Ninina','Buenos Aires','AR','non indiqué',$q$Café de spécialité classé 64e des World's 100 Best Coffee Shops.$q$,$q$Ajustement : chiffre d'affaires 2024 en hausse surtout par l'inflation, clientèle en baisse d'environ 5 %.$q$,'iProfesional — ola de cierres café de especialidad (18 avr. 2025)','https://www.iprofesional.com/negocios/426449-atencion-emprendedores-alertan-que-habra-ola-cierres-cafe-especialidad','2025-04-18'::date)
) v(venue,city,country,opened,what,proof,sname,surl,spub)
join public.brain_concept_formats f on f.slug='cafe-de-specialite';

------------------------------------------------------------------------------------------------
-- 2. BOULANGERIE-PÂTISSERIE-CAFÉ
------------------------------------------------------------------------------------------------
update public.brain_concept_formats set status='researched',
  definition_fr=$q$Boulangerie et pâtisserie avec un espace café où l'on consomme sur place : pain, viennoiseries et gâteaux à emporter, café et petite restauration à table.$q$
 where slug='boulangerie-patisserie-cafe';

with src(k,name,url,pub,country) as (values
 ('h24',$q$H24info — Paul Maroc : 25 ans d'existence et des ambitions renouvelées$q$,'https://h24info.ma/?p=845023','2024-09-25'::date,'MA'),
 ('lpq',$q$World Coffee Portal — Le Pain Quotidien opens first store in Morocco (source de plus de 24 mois)$q$,'https://www.worldcoffeeportal.com/news/le-pain-quotidien-opens-first-store-in-morocco/','2023-11-14'::date,'MA'),
 ('ch',$q$Casablanca Holidays — Oasis (guide, secondaire)$q$,'https://www.casablancaholidays.com/areas/oasis','2026-07-03'::date,'MA'),
 ('fb',$q$Forbes España — Manolo Bakes cierra 2025 con 66 locales$q$,'https://forbes.es/economia/850017/manolo-bakes-cierra-2025-con-66-locales-en-espana-tras-una-nueva-apertura-en-murcia/','2025-12-23'::date,'ES'),
 ('dem',$q$El Demócrata — Levaduramadre culminates 2025 with record sales$q$,'https://www.democrata.es/en/agriculture-food/levaduramadre-culminates-2025-with-record-sales-approaching-50-million-a-16-increase/','2026-08-10'::date,'ES'),
 ('pdg',$q$Perfect Daily Grind (ES) — ¿Por qué la apuesta por la comida en las cafeterías ya no es tan rentable? (Sarah Charles, données surtout américaines)$q$,'https://perfectdailygrind.com/es/2026/07/06/apuesta-comida-cafeterias-no-es-rentable/','2026-07-06'::date,'US'),
 ('alt',$q$Altares — Défaillances d'entreprises en France, T4 et bilan 2025 (communiqué)$q$,'https://www.altares.com/wp-content/uploads/CP-ALTARES-DEFAILLANCES-T4-BILAN-2025.pdf','2026-01-20'::date,'FR')
), x(block,pos,body,inf,sk,conf) as (values
 ('promise',0,$q$Pain, pâtisseries et viennoiseries, avec un espace café : modèle de Paul au Maroc.$q$,false,'h24','medium'),
 ('promise',1,$q$Moments forts : petit-déjeuner, goûter et achats à emporter tout au long de la journée ; peu de soirée.$q$,true,null,'low'),
 ('economics',0,$q$Chez Levaduramadre (Espagne), le pain artisanal fait 52 % des ventes ; la marque vend aussi en ligne et en livraison.$q$,false,'dem','medium'),
 ('economics',1,$q$Paul Maroc a lancé sa propre application de livraison avec fidélité (2023), après Glovo et Jumia pendant le Covid.$q$,false,'h24','medium'),
 ('economics',2,$q$Les produits frais perdent leur valeur en fin de journée : le gaspillage pèse sur la marge et est souvent sous-estimé par les petits exploitants.$q$,false,'pdg','medium'),
 ('economics',3,$q$Des desserts produits dans son propre laboratoire, qui demandent peu de préparation au comptoir, limitent le travail en salle.$q$,false,'pdg','medium'),
 ('operations',0,$q$Compétence clé : un boulanger-pâtissier ; production tôt le matin, fournil et fours, donc puissance électrique et extraction à vérifier sur le local.$q$,true,null,'low'),
 ('operations',1,$q$Paul Maroc développe ses produits avec un centre de recherche de chefs marocains attentif aux goûts locaux ; Delior, issu de la même aventure, produit et distribue.$q$,false,'h24','medium'),
 ('success',0,$q$Croissance des chaînes en Espagne : Levaduramadre à 167 boutiques fin 2025, chiffre d'affaires de 49,3 M€ (+16 %), EBITDA en hausse de 26,1 %.$q$,false,'dem','medium'),
 ('success',1,$q$Un produit signature porte la marque : les « manolitos » de Manolo Bakes (66 boutiques fin 2025, dont deux à Lisbonne).$q$,false,'fb','medium'),
 ('success',2,$q$Les lieux de passage réussissent au format : Levaduramadre ouvre en stations-service (partenariat Repsol) et à l'aéroport de Madrid.$q$,false,'dem','medium'),
 ('success',3,$q$Paul Maroc : 35 points de vente dans sept villes, objectif de 70 en 2028.$q$,false,'h24','medium'),
 ('pitfalls',0,$q$Concurrence d'enseignes installées (Paul, Le Pain Quotidien) : un indépendant doit se distinguer par le produit.$q$,true,'h24','low'),
 ('pitfalls',1,$q$En France, les défaillances de boulangeries ont baissé de 5 % au 4e trimestre 2025, mais le contexte cite la hausse des coûts logistiques et énergétiques des PME.$q$,false,'alt','medium'),
 ('profile_fit',0,$q$Difficile sans savoir-faire de boulanger-pâtissier : un porteur sans expérience doit recruter ou s'associer avec un artisan ; un investisseur a besoin d'un exploitant.$q$,true,null,'low'),
 ('district_types',0,$q$Archétypes B (résidentiel aisé) et E (transit) : l'Oasis, avec un flux de gare et des familles, est signalé comme terrain possible. Lecture déduite.$q$,true,'ch','low'),
 ('casablanca',0,$q$Paul est présent dans les sept principales villes du Maroc (35 points de vente en sept. 2024).$q$,false,'h24','medium'),
 ('casablanca',1,$q$Le Pain Quotidien a ouvert sa première adresse au Maroc à Casablanca (fin 2023 ; présence actuelle à confirmer).$q$,false,'lpq','low'),
 ('casablanca',2,$q$La Fabbrica, café-restaurant-pâtisserie à l'Oasis.$q$,false,'ch','low'),
 ('regulatory',0,$q$Autorisation sanitaire pour un local de production alimentaire, horaires de nuit du fournil, nuisances (fours, extraction) : à vérifier.$q$,true,null,'low'),
 ('gaps',0,$q$Le relevé OpenStreetMap n'a pas compté les boulangeries (seulement restaurants, cafés, vente rapide, bars, glaciers) : aucune densité pour ce format.$q$,false,null,'medium'),
 ('gaps',1,$q$Aucun cas d'échec daté d'une boulangerie-café trouvé ; aucun prix de vente daté à Casablanca.$q$,false,null,'medium')
)
insert into public.brain_concept_lines (format_id, block, position, body_fr, inference, source_class, source_name, source_url, source_published_at, source_country, confidence)
select f.id, x.block, x.pos, x.body, x.inf, 'published', src.name, src.url, src.pub, src.country, x.conf
from x join public.brain_concept_formats f on f.slug='boulangerie-patisserie-cafe' left join src on src.k=x.sk;

insert into public.brain_concept_examples (format_id, venue_name, city, country, opened_text, what_fr, proof_fr, source_name, source_url, source_published_at)
select f.id, v.venue, v.city, v.country, v.opened, v.what, v.proof, v.sname, v.surl, v.spub
from (values
 ('Paul Maroc','Casablanca et six autres villes','MA','1999 (25 ans en 2024)',$q$Boulangerie-café française en réseau, avec franchisés ; application de livraison et fidélité.$q$,$q$35 points de vente, environ 1 600 personnes, objectif de 70 points de vente en 2028.$q$,'H24info — Paul Maroc : 25 ans (25 sept. 2024)','https://h24info.ma/?p=845023','2024-09-25'::date),
 ('Levaduramadre','Madrid et Espagne','ES','non indiqué',$q$Chaîne de boulangeries, pain artisanal au cœur des ventes, livraison et vente en ligne.$q$,$q$167 boutiques fin 2025 (31 ouvertures), 49,3 M€ de chiffre d'affaires (+16 %).$q$,'El Demócrata — Levaduramadre 2025 (10 août 2026)','https://www.democrata.es/en/agriculture-food/levaduramadre-culminates-2025-with-record-sales-approaching-50-million-a-16-increase/','2026-08-10'::date),
 ('Manolo Bakes','Espagne et Lisbonne','ES','non indiqué',$q$Boulangerie-café construite autour d'un produit signature, les « manolitos ».$q$,$q$66 boutiques fin 2025, dont deux à Lisbonne.$q$,'Forbes España — Manolo Bakes 2025 (23 déc. 2025)','https://forbes.es/economia/850017/manolo-bakes-cierra-2025-con-66-locales-en-espana-tras-una-nueva-apertura-en-murcia/','2025-12-23'::date)
) v(venue,city,country,opened,what,proof,sname,surl,spub)
join public.brain_concept_formats f on f.slug='boulangerie-patisserie-cafe';

------------------------------------------------------------------------------------------------
-- 3. BISTRO-BRASSERIE DE QUARTIER
------------------------------------------------------------------------------------------------
update public.brain_concept_formats set status='researched',
  definition_fr=$q$Restaurant de tous les jours sur les codes de la brasserie ou du bistrot français (plats classiques, service continu ou large, vin au verre), souvent ouvert du déjeuner au soir, parfois avec brunch.$q$
 where slug='bistro-brasserie';

with src(k,name,url,pub,country) as (values
 ('lnt',$q$La Nouvelle Tribune — Monsieur Moutarde ouvre une brasserie française à Gauthier$q$,'https://lnt.ma/casablanca-monsieur-moutarde-ouvre-une-nouvelle-brasserie-francaise-a-gauthier/','2026-05-06'::date,'MA'),
 ('ous',$q$Ousortir — Nouveaux restaurants Casablanca 2026$q$,'https://ousortir.ma/en/blog/nouveaux-restaurants-casablanca-2026/','2026-02-15'::date,'MA'),
 ('lm2',$q$Le Matin — Les nouvelles tables voyageuses du Sofitel Casablanca Tour Blanche (Majda Fadili)$q$,'https://lematin.ma/lifestyle/les-nouvelles-tables-voyageuses-du-sofitel-casablanca-tour-blanche/286677','2025-06-20'::date,'MA'),
 ('os',$q$Openshores — Vivre à Casablanca (guide d'expatriation, secondaire)$q$,null,'2026-05-11'::date,'MA'),
 ('osm',$q$OpenStreetMap via Overpass, relevé du 1 nov. 2026 (Maârif et Gauthier, cercles de 650 m)$q$,'https://www.openstreetmap.org/copyright','2026-11-01'::date,'MA'),
 ('yon',$q$Yonder — Notre avis sur Brass, brasserie à Paris (Florence Valencourt)$q$,'https://www.yonder.fr/gastronomie/restaurants/notre-avis-brass-brasserie-paris','2025-06-13'::date,'FR'),
 ('alt',$q$Altares — Défaillances d'entreprises en France, T4 et bilan 2025 (communiqué)$q$,'https://www.altares.com/wp-content/uploads/CP-ALTARES-DEFAILLANCES-T4-BILAN-2025.pdf','2026-01-20'::date,'FR')
), x(block,pos,body,inf,sk,conf) as (values
 ('promise',0,$q$Brasserie Flâneur (Sofitel) : classiques français revisités avec des plats locaux, plats internationaux et spécialités marocaines, brunch et heure du thé.$q$,false,'lm2','medium'),
 ('promise',1,$q$À Paris, Brass ouvre de midi à minuit, avec une formule déjeuner en semaine : un lieu de tous les moments.$q$,false,'yon','medium'),
 ('economics',0,$q$À Paris (Brass, juin 2025) : entrées dès 8 €, plats dès 19 €, formule déjeuner à 25 € — ordre de grandeur parisien, non transposable.$q$,false,'yon','medium'),
 ('economics',1,$q$Service large (midi, soir, parfois brunch) et vin au verre : le format se rattache à la famille bistro / bar à vin du moteur, qui porte les chiffres.$q$,true,null,'low'),
 ('operations',0,$q$Cuisine complète (chaude, en continu) : extraction et brigade à prévoir.$q$,true,null,'low'),
 ('operations',1,$q$Brasserie Flâneur a été conçue avec Paris Society, pour une soixantaine de couverts.$q$,false,'lm2','medium'),
 ('operations',2,$q$À Paris, Brass est porté par une équipe qui exploitait déjà deux adresses (Le Café de la Jatte, Le Galopin) : l'expérience de l'exploitant compte.$q$,false,'yon','medium'),
 ('success',0,$q$Brass a gagné ses habitués par le bouche-à-oreille et les concierges d'hôtels.$q$,false,'yon','medium'),
 ('success',1,$q$À Saint-Germain, le retour de la brasserie répond à des habitants lassés des brasseries prises par les touristes : la clientèle locale est le cœur du format.$q$,false,'yon','medium'),
 ('pitfalls',0,$q$À Paris, deux brasseries de la même vague (Brasserie des Arts, L'Atelier d'André) ont connu des résultats mitigés.$q$,false,'yon','medium'),
 ('pitfalls',1,$q$En France, les défaillances de la restauration traditionnelle ont augmenté de 7 % au 4e trimestre 2025.$q$,false,'alt','medium'),
 ('pitfalls',2,$q$À Casablanca, plusieurs ouvertures sur le créneau brasserie française en 2025–2026 (Flâneur, Monsieur Moutarde, Marcel Cerdan) : créneau qui se remplit, surtout à Gauthier.$q$,true,'lnt','low'),
 ('profile_fit',0,$q$Exige un exploitant de restauration expérimenté et une cuisine complète : difficile pour un porteur sans expérience ; un investisseur a besoin d'un chef-exploitant.$q$,true,null,'low'),
 ('district_types',0,$q$Archétype C (sortie du soir, centre animé : Gauthier, centre-ville) et A pour le déjeuner de semaine : lecture déduite.$q$,true,null,'low'),
 ('casablanca',0,$q$Monsieur Moutarde – Vin & Cuisine, Gauthier, brasserie française, ouverture 2026.$q$,false,'lnt','medium'),
 ('casablanca',1,$q$Brasserie Marcel Cerdan, centre-ville, brasserie française dans un bâtiment historique, ouverture 2026.$q$,false,'ous','medium'),
 ('casablanca',2,$q$Brasserie Flâneur, Sofitel Casablanca Tour Blanche, dévoilée en juin 2025.$q$,false,'lm2','medium'),
 ('casablanca',3,$q$Gauthier est décrit comme riche en cafés-brasseries « à la française ».$q$,false,'os','low'),
 ('casablanca',4,$q$OpenStreetMap compte 56 restaurants à Gauthier et 58 au Maârif, avec une cuisine indiquée pour environ un tiers : la source ne compte pas les brasseries.$q$,false,'osm','medium'),
 ('regulatory',0,$q$Licence d'alcool si vin servi (valeur du Brain à rattacher) ; terrasse sur le domaine public ; extraction de la cuisine.$q$,true,null,'low'),
 ('gaps',0,$q$Aucune carte datée pour les brasseries de Casablanca.$q$,false,null,'medium'),
 ('gaps',1,$q$Aucun cas d'échec marocain trouvé ; les cas de difficulté sont parisiens.$q$,false,null,'medium')
)
insert into public.brain_concept_lines (format_id, block, position, body_fr, inference, source_class, source_name, source_url, source_published_at, source_country, confidence)
select f.id, x.block, x.pos, x.body, x.inf, 'published', src.name, src.url, src.pub, src.country, x.conf
from x join public.brain_concept_formats f on f.slug='bistro-brasserie' left join src on src.k=x.sk;

insert into public.brain_concept_examples (format_id, venue_name, city, country, opened_text, what_fr, proof_fr, source_name, source_url, source_published_at)
select f.id, v.venue, v.city, v.country, v.opened, v.what, v.proof, v.sname, v.surl, v.spub
from (values
 ('Brasserie Flâneur','Casablanca','MA','juin 2025',$q$Brasserie d'hôtel (Sofitel), classiques français et plats marocains, brunch et heure du thé, une soixantaine de couverts.$q$,$q$Conçue avec Paris Society dans la rénovation de l'hôtel.$q$,'Le Matin — Sofitel Casablanca Tour Blanche (20 juin 2025)','https://lematin.ma/lifestyle/les-nouvelles-tables-voyageuses-du-sofitel-casablanca-tour-blanche/286677','2025-06-20'::date),
 ('Monsieur Moutarde – Vin & Cuisine','Casablanca','MA','2026',$q$Brasserie française avec vin, à Gauthier.$q$,null,'La Nouvelle Tribune — Monsieur Moutarde (6 mai 2026)','https://lnt.ma/casablanca-monsieur-moutarde-ouvre-une-nouvelle-brasserie-francaise-a-gauthier/','2026-05-06'::date),
 ('Brasserie Marcel Cerdan','Casablanca','MA','2026',$q$Brasserie française dans un bâtiment historique du centre-ville.$q$,null,'Ousortir — Nouveaux restaurants Casablanca 2026 (15 févr. 2026)','https://ousortir.ma/en/blog/nouveaux-restaurants-casablanca-2026/','2026-02-15'::date),
 ('Brass','Paris','FR','mai 2025',$q$Brasserie parisienne revisitée, ouverte de midi à minuit, formule déjeuner, cocktails et jazz.$q$,$q$Habitués gagnés par le bouche-à-oreille et les concierges d'hôtels.$q$,'Yonder — Brass (13 juin 2025)','https://www.yonder.fr/gastronomie/restaurants/notre-avis-brass-brasserie-paris','2025-06-13'::date),
 ('Brasserie des Arts','Paris','FR','non indiqué',$q$Brasserie de la même vague à Saint-Germain.$q$,$q$Ajustement : résultats décrits comme mitigés.$q$,'Yonder — Brass (13 juin 2025)','https://www.yonder.fr/gastronomie/restaurants/notre-avis-brass-brasserie-paris','2025-06-13'::date)
) v(venue,city,country,opened,what,proof,sname,surl,spub)
join public.brain_concept_formats f on f.slug='bistro-brasserie';

------------------------------------------------------------------------------------------------
-- 4. COMPTOIR JAPONAIS / SUSHI
------------------------------------------------------------------------------------------------
update public.brain_concept_formats set status='researched',
  definition_fr=$q$Restaurant japonais où le chef prépare devant le client (comptoir, sushi, omakase) ou izakaya à petites assiettes ; peu de places, souvent sur réservation.$q$
 where slug='comptoir-japonais-sushi';

with src(k,name,url,pub,country) as (values
 ('vh',$q$VH — Casablanca à table : les nouvelles adresses qui réveillent la ville$q$,'https://www.vh.ma/actualite-news-express-maroc/casablanca-a-table-les-nouvelles-adresses-qui-reveillent-la-ville/','2026-08-13'::date,'MA'),
 ('lm2',$q$Le Matin — Les nouvelles tables voyageuses du Sofitel Casablanca Tour Blanche (Majda Fadili)$q$,'https://lematin.ma/lifestyle/les-nouvelles-tables-voyageuses-du-sofitel-casablanca-tour-blanche/286677','2025-06-20'::date,'MA'),
 ('il',$q$50 Best Discovery — Iloli, Casablanca (page non datée ; classement MENA's 50 Best 2023)$q$,'https://www.the50.com/discovery/Establishments/Morocco/Casablanca/Iloli.html',null::date,'MA'),
 ('tob',$q$The Objective — 14 nuevos restaurantes de Madrid en la Guía Repsol 2025$q$,'https://theobjective.com/gastronomia/2025-03-18/14-nuevos-restaurantes-madrid-guia-repsol-2025/','2025-03-18'::date,'ES'),
 ('gq',$q$Green Queen — Planta to wind down despite revival attempts$q$,'https://www.greenqueen.com.hk/?p=84570','2026-03-17'::date,'US'),
 ('jde',$q$Le Journal de l'économie — Le plan de continuation de Planet Sushi sera-t-il validé ? (source ancienne, 2021)$q$,'https://www.journaldeleconomie.fr/le-plan-de-continuation-de-planet-sushi-sera-t-il-valide/','2021-10-12'::date,'FR')
), x(block,pos,body,inf,sk,conf) as (values
 ('promise',0,$q$Counter 11 (CIL) : comptoir intime, réservation indispensable.$q$,false,'vh','medium'),
 ('promise',1,$q$Min Koy (Sofitel) : esprit izakaya, sushi, sashimi et petites assiettes, cocktails créatifs ; déjeuner et dîner tous les jours.$q$,false,'lm2','medium'),
 ('promise',2,$q$À Madrid, des comptoirs où les plats sont préparés devant le client (Kappo) et un omakase pour 12 couverts (Sen Omakase).$q$,false,'tob','medium'),
 ('economics',0,$q$Peu de places, produit cher (poisson cru) et ticket élevé : modèle de faible volume, dont les chiffres viennent de la famille restaurant du moteur.$q$,true,null,'low'),
 ('economics',1,$q$Planet Sushi (France) est passé de 63 M€ de chiffre d'affaires en 2019 à 40 M€ en 2020, sous la concurrence des supermarchés et des plateformes de livraison.$q$,false,'jde','low'),
 ('operations',0,$q$Compétence clé : un chef formé à la cuisine japonaise ; Iloli est mené par le couple Furukawa, carte ou omakase, cuisine ouverte.$q$,false,'il','low'),
 ('operations',1,$q$Approvisionnement en poisson de qualité sashimi et chaîne du froid : condition d'exploitation à vérifier avant tout engagement.$q$,true,null,'low'),
 ('success',0,$q$À Madrid, trois comptoirs ou omakases récents sont distingués par le guide Repsol 2025 (Sen Omakase, Kyoshi Las Cortes, Kappo).$q$,false,'tob','medium'),
 ('success',1,$q$Iloli figurait au 37e rang du classement MENA's 50 Best Restaurants 2023 : le créneau peut être reconnu à Casablanca.$q$,false,'il','low'),
 ('pitfalls',0,$q$Planta (États-Unis, sushi sans poisson) : 12 ouvertures en trois ans, puis faillite en mai 2025 et liquidation en mars 2026 ; le fondateur cite l'inefficacité et la dépendance à des capitaux rapides.$q$,false,'gq','medium'),
 ('pitfalls',1,$q$Planet Sushi (France) : dette lourde, concurrence des supermarchés et des plateformes de livraison, redressement judiciaire depuis 2020.$q$,false,'jde','low'),
 ('pitfalls',2,$q$Le haut de gamme japonais se remplit à Casablanca (Iloli, Min Koy, Counter 11, Aïku) : un nouveau projet doit se distinguer.$q$,true,'vh','low'),
 ('profile_fit',0,$q$Très difficile sans chef japonais ou formé au Japon : un porteur sans expérience ou un investisseur doit s'associer avec un chef.$q$,true,null,'low'),
 ('district_types',0,$q$Archétypes B (CIL), C (Gauthier) et D (Aïn Diab) d'après les adresses connues : lecture déduite.$q$,true,'vh','low'),
 ('casablanca',0,$q$Counter 11, comptoir japonais au CIL ; Aïku, japonais face à la mer à Aïn Diab.$q$,false,'vh','medium'),
 ('casablanca',1,$q$Min Koy, Sofitel Casablanca Tour Blanche, dévoilé en juin 2025.$q$,false,'lm2','medium'),
 ('casablanca',2,$q$Iloli, Gauthier (rue Najib Mahfoud), cuisine ouverte, omakase possible.$q$,false,'il','low'),
 ('regulatory',0,$q$Licence d'alcool si cocktails ou saké ; hygiène et traçabilité du poisson cru : autorisation sanitaire à vérifier.$q$,true,null,'low'),
 ('gaps',0,$q$Aucune carte datée ni prix pour les comptoirs japonais de Casablanca ; aucune source sur le coût du poisson.$q$,false,null,'medium'),
 ('gaps',1,$q$Aucun cas d'échec marocain trouvé ; les cas d'échec sont français et américains, le français ancien (2021).$q$,false,null,'medium')
)
insert into public.brain_concept_lines (format_id, block, position, body_fr, inference, source_class, source_name, source_url, source_published_at, source_country, confidence)
select f.id, x.block, x.pos, x.body, x.inf, 'published', src.name, src.url, src.pub, src.country, x.conf
from x join public.brain_concept_formats f on f.slug='comptoir-japonais-sushi' left join src on src.k=x.sk;

insert into public.brain_concept_examples (format_id, venue_name, city, country, opened_text, what_fr, proof_fr, source_name, source_url, source_published_at)
select f.id, v.venue, v.city, v.country, v.opened, v.what, v.proof, v.sname, v.surl, v.spub
from (values
 ('Counter 11','Casablanca','MA','non indiqué',$q$Comptoir japonais intime au CIL.$q$,$q$Réservation indispensable.$q$,'VH — Casablanca à table (13 août 2026)','https://www.vh.ma/actualite-news-express-maroc/casablanca-a-table-les-nouvelles-adresses-qui-reveillent-la-ville/','2026-08-13'::date),
 ('Aïku','Casablanca','MA','non indiqué',$q$Restaurant japonais face à la mer, Aïn Diab.$q$,null,'VH — Casablanca à table (13 août 2026)','https://www.vh.ma/actualite-news-express-maroc/casablanca-a-table-les-nouvelles-adresses-qui-reveillent-la-ville/','2026-08-13'::date),
 ('Min Koy','Casablanca','MA','juin 2025',$q$Izakaya d'hôtel (Sofitel) : sushi, sashimi, petites assiettes, cocktails.$q$,$q$Conçu avec Paris Society.$q$,'Le Matin — Sofitel Casablanca Tour Blanche (20 juin 2025)','https://lematin.ma/lifestyle/les-nouvelles-tables-voyageuses-du-sofitel-casablanca-tour-blanche/286677','2025-06-20'::date),
 ('Iloli','Casablanca','MA','non indiqué',$q$Japonais à cuisine ouverte, carte ou omakase, Gauthier.$q$,$q$37e du classement MENA's 50 Best Restaurants 2023.$q$,'50 Best Discovery — Iloli (page non datée)','https://www.the50.com/discovery/Establishments/Morocco/Casablanca/Iloli.html',null::date),
 ('Kappo','Madrid','ES','non indiqué',$q$Kaiseki sans menu fixe, préparé devant les clients à un comptoir de bois.$q$,$q$Deuxième Soleil du guide Repsol 2025.$q$,'The Objective — Guía Repsol 2025 Madrid (18 mars 2025)','https://theobjective.com/gastronomia/2025-03-18/14-nuevos-restaurantes-madrid-guia-repsol-2025/','2025-03-18'::date),
 ('Sen Omakase','Madrid','ES','non indiqué',$q$Omakase pour 12 couverts, sushi et kaiseki.$q$,$q$Un Soleil du guide Repsol 2025.$q$,'The Objective — Guía Repsol 2025 Madrid (18 mars 2025)','https://theobjective.com/gastronomia/2025-03-18/14-nuevos-restaurantes-madrid-guia-repsol-2025/','2025-03-18'::date),
 ('Planta','New York, Toronto et autres','US','non indiqué',$q$Chaîne de sushi sans poisson, jusqu'à 18 restaurants.$q$,$q$Échec : expansion trop rapide, faillite en 2025, liquidation en mars 2026.$q$,'Green Queen — Planta wind down (17 mars 2026)','https://www.greenqueen.com.hk/?p=84570','2026-03-17'::date)
) v(venue,city,country,opened,what,proof,sname,surl,spub)
join public.brain_concept_formats f on f.slug='comptoir-japonais-sushi';

------------------------------------------------------------------------------------------------
-- 5. BAR À COCKTAILS
------------------------------------------------------------------------------------------------
update public.brain_concept_formats set status='researched',
  definition_fr=$q$Bar dont l'offre centrale est une carte de cocktails travaillés par des barmans, souvent avec une petite offre de nourriture ; à Casablanca, des lieux récents l'associent à un restaurant.$q$
 where slug='bar-a-cocktails';

with src(k,name,url,pub,country) as (values
 ('ous',$q$Ousortir — Nouveaux restaurants Casablanca 2026$q$,'https://ousortir.ma/en/blog/nouveaux-restaurants-casablanca-2026/','2026-02-15'::date,'MA'),
 ('gag',$q$50 Best Discovery — Gare aux Gorilles, Casablanca (page non datée, Alex Husic)$q$,'https://www.the50.com/discovery/Establishments/Morocco/Casablanca/Gare-aux-Gorilles.html',null::date,'MA'),
 ('osm',$q$OpenStreetMap via Overpass, relevé du 1 nov. 2026 (Maârif et Gauthier, cercles de 650 m)$q$,'https://www.openstreetmap.org/copyright','2026-11-01'::date,'MA'),
 ('tq',$q$TelQuel — Les bars et débits d'alcool fermés jusqu'au 20 juillet (source ancienne, 2015)$q$,'https://telquel.ma/2015/06/17/les-bars-debits-dalcool-fermes-jusquau-20-juillet_1452375','2015-06-17'::date,'MA'),
 ('cn',$q$Catalan News — Barcelona's Sips and Paradiso among best five bars worldwide$q$,'https://www.catalannews.com/life-style/item/barcelona-sips-paradiso-bars-best-worldwide-9-october-2025','2025-10-09'::date,'ES'),
 ('aol',$q$AOL / The Independent — British people drinking less alcohol than at any time on record (page non datée ; données IWSR et NTIA)$q$,'https://www.aol.com/news/british-people-drinking-less-alcohol-112012910.html',null::date,'GB')
), x(block,pos,body,inf,sk,conf) as (values
 ('promise',0,$q$Gare aux Gorilles : lieu convivial de journée plutôt que de nuit, terrasse-jardin, cocktails aux ingrédients marocains (menthe, agrumes, rose).$q$,false,'gag','low'),
 ('promise',1,$q$L'Octave (Gauthier) associe bar à cocktails et restaurant.$q$,false,'ous','medium'),
 ('economics',0,$q$Part d'alcool dominante, donc licence indispensable et activité suspendue pendant les fermetures réglementaires : le format se rattache à la famille bar / lounge du moteur, qui porte les chiffres.$q$,true,null,'low'),
 ('economics',1,$q$Cocktail moyen autour de 12 dollars chez Gare aux Gorilles (source non datée, ordre de grandeur seulement).$q$,false,'gag','low'),
 ('operations',0,$q$Compétence clé : un chef de bar qui crée la carte ; les meilleurs bars ont leur propre programme de recherche (Paradiso Lab, axé sur la durabilité).$q$,false,'cn','medium'),
 ('operations',1,$q$Glace, verrerie, préparations maison et horaires tardifs : équipe de bar et sécurité à prévoir.$q$,true,null,'low'),
 ('success',0,$q$Une identité forte : à Barcelone, Sips mise sur un comptoir en îlot qui casse les codes, Paradiso sur des cocktails multisensoriels à thème ; tous deux dans le top 5 mondial 2025.$q$,false,'cn','medium'),
 ('success',1,$q$À Casablanca, les lieux récents ajoutent la journée ou la restauration au cocktail (Gare aux Gorilles, L'Octave) : le bar seul n'est pas le modèle observé.$q$,true,'ous','low'),
 ('pitfalls',0,$q$Au Royaume-Uni, la consommation d'alcool est au plus bas depuis 1990 (10,2 verres par semaine), un pub a fermé chaque jour en 2025 et 61 % des sondés sortent moins.$q$,false,'aol','low'),
 ('pitfalls',1,$q$Au Maroc, les bars et débits d'alcool ferment pendant le Ramadan (exemple de 2015) : un mois sans chiffre d'affaires d'alcool à intégrer dans le choix Ramadan du projet.$q$,true,'tq','low'),
 ('profile_fit',0,$q$Exige un chef de bar et une licence : difficile pour un porteur sans expérience ; un investisseur a besoin d'un exploitant du métier.$q$,true,null,'low'),
 ('district_types',0,$q$Archétype C (sortie du soir, centre animé : Gauthier, Maârif) : lecture déduite.$q$,true,null,'low'),
 ('casablanca',0,$q$L'Octave, Gauthier, bar à cocktails et restaurant, ouvert en 2026.$q$,false,'ous','medium'),
 ('casablanca',1,$q$Gare aux Gorilles, avenue Hassan Souktani, référencé comme bar à cocktails (date d'ouverture non indiquée).$q$,false,'gag','low'),
 ('casablanca',2,$q$OpenStreetMap compte 9 bars à Gauthier et 5 au Maârif, sans distinguer les bars à cocktails.$q$,false,'osm','medium'),
 ('regulatory',0,$q$Licence d'alcool (procédure à Casablanca non encore documentée dans le Brain), fermeture pendant le Ramadan, horaires et nuisances sonores.$q$,true,'tq','low'),
 ('gaps',0,$q$Aucune source fiable et récente sur la procédure de licence d'alcool à Casablanca (presse ancienne seulement).$q$,false,null,'medium'),
 ('gaps',1,$q$Aucune carte datée ni prix des cocktails à Casablanca ; aucun cas d'échec marocain trouvé.$q$,false,null,'medium'),
 ('gaps',2,$q$Les données de baisse de consommation sont britanniques : rien d'équivalent trouvé pour le Maroc.$q$,false,null,'medium')
)
insert into public.brain_concept_lines (format_id, block, position, body_fr, inference, source_class, source_name, source_url, source_published_at, source_country, confidence)
select f.id, x.block, x.pos, x.body, x.inf, 'published', src.name, src.url, src.pub, src.country, x.conf
from x join public.brain_concept_formats f on f.slug='bar-a-cocktails' left join src on src.k=x.sk;

insert into public.brain_concept_examples (format_id, venue_name, city, country, opened_text, what_fr, proof_fr, source_name, source_url, source_published_at)
select f.id, v.venue, v.city, v.country, v.opened, v.what, v.proof, v.sname, v.surl, v.spub
from (values
 ('L''Octave','Casablanca','MA','2026',$q$Bar à cocktails et restaurant à Gauthier.$q$,null,'Ousortir — Nouveaux restaurants Casablanca 2026 (15 févr. 2026)','https://ousortir.ma/en/blog/nouveaux-restaurants-casablanca-2026/','2026-02-15'::date),
 ('Gare aux Gorilles','Casablanca','MA','non indiqué',$q$Bar de journée à terrasse-jardin, cocktails aux ingrédients marocains.$q$,$q$Référencé par 50 Best Discovery.$q$,'50 Best Discovery — Gare aux Gorilles (page non datée)','https://www.the50.com/discovery/Establishments/Morocco/Casablanca/Gare-aux-Gorilles.html',null::date),
 ('Sips','Barcelone','ES','2021',$q$Bar à comptoir en îlot, cocktails présentés comme un spectacle, Eixample.$q$,$q$3e des World's 50 Best Bars 2025, premier bar européen ; 1er en 2023.$q$,'Catalan News — Sips and Paradiso (9 oct. 2025)','https://www.catalannews.com/life-style/item/barcelona-sips-paradiso-bars-best-worldwide-9-october-2025','2025-10-09'::date),
 ('Paradiso','Barcelone','ES','non indiqué',$q$Cocktails multisensoriels à thème, laboratoire de recherche axé sur la durabilité, Born.$q$,$q$4e des World's 50 Best Bars 2025 ; 1er en 2022.$q$,'Catalan News — Sips and Paradiso (9 oct. 2025)','https://www.catalannews.com/life-style/item/barcelona-sips-paradiso-bars-best-worldwide-9-october-2025','2025-10-09'::date),
 ('Salmon Guru','Madrid','ES','non indiqué',$q$Bar à cocktails madrilène.$q$,$q$37e des World's 50 Best Bars 2025.$q$,'Catalan News — Sips and Paradiso (9 oct. 2025)','https://www.catalannews.com/life-style/item/barcelona-sips-paradiso-bars-best-worldwide-9-october-2025','2025-10-09'::date)
) v(venue,city,country,opened,what,proof,sname,surl,spub)
join public.brain_concept_formats f on f.slug='bar-a-cocktails';
