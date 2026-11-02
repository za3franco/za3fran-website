-- Concept catalogue (K3), lot 2a (researched 2 Nov 2026): table marocaine contemporaine, trattoria / pizzeria
-- napolitaine, cuisine libanaise et méditerranéenne, café-resto / brunch, burger. Method as lot 1. Status: researched.
begin;

-- helper: one insert pattern per format (CTE src + x), as in 20261101c and 20261102.

------------------------------------------------------------------ TABLE MAROCAINE CONTEMPORAINE
update public.brain_concept_formats set status='researched',
  definition_fr=$q$Restaurant de cuisine marocaine qui revisite les classiques (produits, présentation, service), souvent dans un lieu à forte identité ; à Casablanca, surtout porté aujourd'hui par les palaces et quelques maisons de la médina.$q$
 where slug='table-marocaine-contemporaine';
with src(k,name,url,pub,country) as (values
 ('fit',$q$Forbes Italia — Casablanca si candida a capitale gastronomica del Nordafrica (Federico Silvio Bellanca)$q$,'https://forbes.it/2026/09/25/casablanca-si-candida-a-capitale-gastronomica-del-nordafrica','2026-09-25'::date,'MA'),
 ('l360',$q$Le360 — MENA's 50 Best Restaurants 2026 : plusieurs tables marocaines distinguées$q$,'https://fr.le360.ma/lifestyle/menas-50-best-restaurants-2026-plusieurs-tables-marocaines-distinguees_PWTIE5JKFVFUHJU2ZYCDV46GJA/','2026-02-05'::date,'MA'),
 ('mwn',$q$MWN Lifestyle — Dar El Kaid Casablanca: a culinary journey into Morocco's heritage$q$,'https://mwnlifestyle.com/2025/08/29/dar-el-kaid-casablanca-a-culinary-journey-into-moroccos-heritage/','2025-08-29'::date,'MA')
), x(block,pos,body,inf,sk,conf) as (values
 ('promise',0,$q$La classe moyenne urbaine de Casablanca sort souvent au restaurant, en bonne partie pour le travail.$q$,false,'fit','medium'),
 ('promise',1,$q$Expérience de lieu : Dar El Kaid occupe une demeure du XVIIIe siècle de l'ancienne médina, avec terrasse, musique et danse marocaines.$q$,false,'mwn','medium'),
 ('promise',2,$q$La Grande Table Marocaine (Royal Mansour) associe classiques marocains et plats de la côte (m'quila, homard bleu d'Oualidia).$q$,false,'fit','medium'),
 ('economics',0,$q$Le haut de gamme marocain est surtout tenu par des palaces, qui portent un décor et un service coûteux ; un indépendant doit tenir un ticket plus bas ou une expérience forte. Les chiffres viennent de la famille restaurant du moteur.$q$,true,'fit','low'),
 ('operations',0,$q$Compétence clé : un chef qui maîtrise la cuisine familiale marocaine (Dar El Kaid : chef Marouane, recettes de famille).$q$,false,'mwn','medium'),
 ('operations',1,$q$Produits de l'Atlantique mis en avant (huîtres d'Oualidia, homards de Mohammedia) : chaîne d'approvisionnement en produits de la mer à organiser.$q$,false,'fit','medium'),
 ('success',0,$q$Table 3 (Casablanca) est 11e du classement MENA's 50 Best 2026 et meilleure table du Maroc ; cuisine contemporaine aux influences françaises et japonaises sur produits locaux.$q$,false,'l360','high'),
 ('success',1,$q$Table 3 est le premier restaurant indépendant de Casablanca à obtenir une distinction de ce poids : la ville gagne en reconnaissance face à Marrakech et Fès.$q$,false,'fit','medium'),
 ('success',2,$q$Cinq des six tables marocaines du classement 2026 sont à Marrakech : la reconnaissance gastronomique reste concentrée là-bas.$q$,false,'l360','high'),
 ('pitfalls',0,$q$Concurrence des palaces (Royal Mansour, Four Seasons) sur le haut de gamme marocain ; dépendance aux touristes pour un lieu de médina.$q$,true,'fit','low'),
 ('profile_fit',0,$q$Accessible à un porteur qui a un chef de cuisine marocaine ; le lieu (bâtiment, décor) pèse lourd dans l'investissement, intéressant pour un investisseur propriétaire d'un bien de caractère.$q$,true,null,'low'),
 ('district_types',0,$q$Archétypes D (front de mer, hôtels d'Aïn Diab) et centre-ville / médina (tourisme, patrimoine) : lecture déduite.$q$,true,null,'low'),
 ('casablanca',0,$q$La Grande Table Marocaine, 23e étage du Royal Mansour Casablanca (palace rouvert en avril 2024).$q$,false,'fit','medium'),
 ('casablanca',1,$q$Dar El Kaid, ancienne médina, cuisine marocaine traditionnelle avec touches internationales.$q$,false,'mwn','medium'),
 ('casablanca',2,$q$Kyúb (Four Seasons, Aïn Diab) : cuisine côtière marocaine avec des techniques d'Amérique latine (ceviche, tiradito).$q$,false,'fit','medium'),
 ('regulatory',0,$q$Travaux dans un bâtiment ancien ou classé : autorisations à vérifier ; licence d'alcool si vin servi.$q$,true,null,'low'),
 ('gaps',0,$q$Aucune table marocaine contemporaine indépendante récente trouvée à Casablanca hors médina ; aucun prix daté ; aucun cas d'échec.$q$,false,null,'medium')
)
insert into public.brain_concept_lines (format_id, block, position, body_fr, inference, source_class, source_name, source_url, source_published_at, source_country, confidence)
select f.id, x.block, x.pos, x.body, x.inf, 'published', src.name, src.url, src.pub, src.country, x.conf
from x join public.brain_concept_formats f on f.slug='table-marocaine-contemporaine' left join src on src.k=x.sk;
insert into public.brain_concept_examples (format_id, venue_name, city, country, opened_text, what_fr, proof_fr, source_name, source_url, source_published_at)
select f.id, v.* from (values
 ('La Grande Table Marocaine (Royal Mansour)','Casablanca','MA','avril 2024 (réouverture du palace)',$q$Classiques marocains et plats de la côte atlantique, au sommet du palace.$q$,null,'Forbes Italia — Casablanca capitale gastronomica (25 sept. 2026)','https://forbes.it/2026/09/25/casablanca-si-candida-a-capitale-gastronomica-del-nordafrica','2026-09-25'::date),
 ('Dar El Kaid','Casablanca','MA','non indiqué',$q$Cuisine marocaine dans une demeure du XVIIIe siècle de la médina, terrasse, musique.$q$,null,'MWN Lifestyle — Dar El Kaid (29 août 2025)','https://mwnlifestyle.com/2025/08/29/dar-el-kaid-casablanca-a-culinary-journey-into-moroccos-heritage/','2025-08-29'::date),
 ('Kyúb (Four Seasons)','Casablanca','MA','non indiqué',$q$Cuisine côtière marocaine avec techniques latino-américaines, au bord de la piscine.$q$,null,'Forbes Italia — Casablanca capitale gastronomica (25 sept. 2026)','https://forbes.it/2026/09/25/casablanca-si-candida-a-capitale-gastronomica-del-nordafrica','2026-09-25'::date),
 ('La Grande Table Marocaine (Royal Mansour)','Marrakech','MA','non indiqué',$q$Classiques marocains réinterprétés.$q$,$q$19e du classement MENA's 50 Best 2026, prix de l'hospitalité.$q$,'Le360 — MENA''s 50 Best 2026 (5 févr. 2026)','https://fr.le360.ma/lifestyle/menas-50-best-restaurants-2026-plusieurs-tables-marocaines-distinguees_PWTIE5JKFVFUHJU2ZYCDV46GJA/','2026-02-05'::date)
) v(venue,city,country,opened,what,proof,sname,surl,spub)
join public.brain_concept_formats f on f.slug='table-marocaine-contemporaine';

------------------------------------------------------------------ TRATTORIA / PIZZERIA NAPOLITAINE
update public.brain_concept_formats set status='researched',
  definition_fr=$q$Restaurant italien centré sur la pizza napolitaine (pâte longue fermentation, four très chaud) et une carte courte de plats de trattoria.$q$
 where slug='trattoria-pizzeria-napolitaine';
with src(k,name,url,pub,country) as (values
 ('to26',$q$Time Out — Europe's best pizzerias have been crowned for 2026 (classement 50 Top Pizza Europa 2026)$q$,'https://www.timeout.com/news/europes-best-pizzerias-have-been-crowned-for-2026-heres-the-full-top-10-070326','2026-07-03'::date,'EU'),
 ('tom',$q$Time Out Madrid — Grosso Napoletano, une des meilleures chaînes de pizza artisanale 2025$q$,'https://www.timeout.es/madrid/es/noticias/una-de-las-mejores-cadenas-de-pizza-artesanal-de-2025-esta-madrid-tienen-al-pizzaiolo-del-ano-y-restaurantes-en-malasana-lavapies-o-arguelles-112825','2025-11-28'::date,'ES'),
 ('dap',$q$Directo al Paladar — Mola Pizza va a echar el cierre (source ancienne, 2023)$q$,'https://www.directoalpaladar.com/viajes/mejores-pizzerias-madrid-va-a-echar-cierre-tienes-solo-diez-dias-para-visitarla','2023-10-19'::date,'ES'),
 ('os',$q$Openshores — Vivre à Casablanca (guide d'expatriation, secondaire)$q$,null,'2026-05-11'::date,'MA'),
 ('js',$q$Jobsquare — offre de recrutement pour une ouverture au CIL (valable jusqu'au 23 nov. 2026)$q$,null,'2026-10-30'::date,'MA'),
 ('osm',$q$OpenStreetMap via Overpass, relevé du 1 nov. 2026 (Maârif et Gauthier, cercles de 650 m)$q$,'https://www.openstreetmap.org/copyright','2026-11-01'::date,'MA')
), x(block,pos,body,inf,sk,conf) as (values
 ('promise',0,$q$Format familial et de groupe, midi et soir, compatible avec la livraison et la vente à emporter.$q$,true,null,'low'),
 ('economics',0,$q$À Madrid, un chef a constaté que la clientèle refusait de payer environ 60 € pour un repas italien, puis sa pizzeria moins chère (pizzas de 10,50 à 18,50 €) a aussi fermé en 2023.$q$,false,'dap','low'),
 ('economics',1,$q$La pâte coûte peu ; la marge dépend du volume et de la rotation des tables. Les chiffres viennent de la famille restaurant du moteur.$q$,true,null,'low'),
 ('operations',0,$q$Compétence clé : un pizzaiolo formé ; Grosso Napoletano a un responsable produit et le « pizzaiolo de l'année » 2025.$q$,false,'tom','medium'),
 ('operations',1,$q$Four à très haute température (bois ou gaz) : extraction, sécurité incendie et accord de la copropriété à vérifier.$q$,true,null,'low'),
 ('success',0,$q$L'Europe du Sud est bien placée au classement 2026 : Baldoria (Madrid) 2e, Sartoria Panatieri (Barcelone) 5e, Forno d'Oro (Lisbonne) 9e.$q$,false,'to26','high'),
 ('success',1,$q$Grosso Napoletano, fondé en 2017 à Madrid, compte environ 50 points de vente en Espagne et figure parmi les trois meilleures chaînes de pizza artisanale du monde.$q$,false,'tom','medium'),
 ('pitfalls',0,$q$Mola Pizza (Madrid), saluée par la critique, a fermé en 2023 faute de résultats : la qualité ne suffit pas sans le bon prix.$q$,false,'dap','low'),
 ('pitfalls',1,$q$Le Maârif compte déjà des pizzerias : un nouveau projet doit se distinguer par le produit ou le lieu.$q$,true,'os','low'),
 ('profile_fit',0,$q$Format parmi les plus lisibles pour un porteur sans expérience, à condition de recruter un pizzaiolo confirmé ; adapté à une franchise pour un investisseur.$q$,true,null,'low'),
 ('district_types',0,$q$Archétypes B (familles) et C (sortie) : lecture déduite.$q$,true,null,'low'),
 ('casablanca',0,$q$Le Maârif est décrit avec des restaurants français, libanais, marocains et des pizzerias.$q$,false,'os','low'),
 ('casablanca',1,$q$Un restaurant italien en franchise recrute pour son ouverture au CIL.$q$,false,'js','medium'),
 ('casablanca',2,$q$OpenStreetMap compte 58 restaurants au Maârif, avec une cuisine indiquée pour environ un tiers : pas de compte fiable des pizzerias.$q$,false,'osm','medium'),
 ('regulatory',0,$q$Four et extraction ; licence d'alcool si vin servi.$q$,true,null,'low'),
 ('gaps',0,$q$Aucune pizzeria napolitaine de Casablanca trouvée avec une source datée de moins de 24 mois ; aucun prix daté.$q$,false,null,'medium')
)
insert into public.brain_concept_lines (format_id, block, position, body_fr, inference, source_class, source_name, source_url, source_published_at, source_country, confidence)
select f.id, x.block, x.pos, x.body, x.inf, 'published', src.name, src.url, src.pub, src.country, x.conf
from x join public.brain_concept_formats f on f.slug='trattoria-pizzeria-napolitaine' left join src on src.k=x.sk;
insert into public.brain_concept_examples (format_id, venue_name, city, country, opened_text, what_fr, proof_fr, source_name, source_url, source_published_at)
select f.id, v.* from (values
 ('Grosso Napoletano','Madrid et Espagne','ES','2017',$q$Chaîne de pizza napolitaine.$q$,$q$Environ 50 points de vente ; 3e chaîne de pizza artisanale au monde en 2025, 1re les deux années précédentes.$q$,'Time Out Madrid — Grosso Napoletano (28 nov. 2025)','https://www.timeout.es/madrid/es/noticias/una-de-las-mejores-cadenas-de-pizza-artesanal-de-2025-esta-madrid-tienen-al-pizzaiolo-del-ano-y-restaurantes-en-malasana-lavapies-o-arguelles-112825','2025-11-28'::date),
 ('Baldoria','Madrid','ES','non indiqué',$q$Pizzeria.$q$,$q$2e de 50 Top Pizza Europa 2026.$q$,'Time Out — 50 Top Pizza Europa 2026 (3 juil. 2026)','https://www.timeout.com/news/europes-best-pizzerias-have-been-crowned-for-2026-heres-the-full-top-10-070326','2026-07-03'::date),
 ('Sartoria Panatieri','Barcelone','ES','non indiqué',$q$Pizzeria.$q$,$q$5e de 50 Top Pizza Europa 2026.$q$,'Time Out — 50 Top Pizza Europa 2026 (3 juil. 2026)','https://www.timeout.com/news/europes-best-pizzerias-have-been-crowned-for-2026-heres-the-full-top-10-070326','2026-07-03'::date),
 ('Forno d''Oro','Lisbonne','PT','non indiqué',$q$Pizzeria.$q$,$q$9e de 50 Top Pizza Europa 2026.$q$,'Time Out — 50 Top Pizza Europa 2026 (3 juil. 2026)','https://www.timeout.com/news/europes-best-pizzerias-have-been-crowned-for-2026-heres-the-full-top-10-070326','2026-07-03'::date),
 ('Mola Pizza','Madrid','ES','non indiqué',$q$Pizzeria d'un chef reconnu, pizzas de 10,50 à 18,50 €.$q$,$q$Échec : fermée en octobre 2023 faute de résultats.$q$,'Directo al Paladar — Mola Pizza (19 oct. 2023, ancien)','https://www.directoalpaladar.com/viajes/mejores-pizzerias-madrid-va-a-echar-cierre-tienes-solo-diez-dias-para-visitarla','2023-10-19'::date)
) v(venue,city,country,opened,what,proof,sname,surl,spub)
join public.brain_concept_formats f on f.slug='trattoria-pizzeria-napolitaine';

------------------------------------------------------------------ LIBANAIS ET MÉDITERRANÉEN
update public.brain_concept_formats set status='researched',
  definition_fr=$q$Restaurant de mezzés à partager, grillades et plats libanais ou de Méditerranée orientale ; repas de groupe et de famille.$q$
 where slug='libanais-mediterraneen';
with src(k,name,url,pub,country) as (values
 ('sp',$q$Sortir à Paris — Em Sherif, Monaco's Lebanese restaurant opens in Paris$q$,'https://www.sortiraparis.com/en/where-to-eat-in-paris/restaurant/articles/322481-em-sherif-monaco-s-lebanese-restaurant-opens-in-paris','2024-12-13'::date,'FR'),
 ('hn',$q$Hospitality News — Em Sherif Sea Café opens in Bahrain (source ancienne, 2022)$q$,'https://www.hospitalitynewsmag.com/em-sherif-sea-cafe-opens-in-bahrain-slated-to-open-in-abu-dhabi-and-riyadh-later-this-year/','2022-05-18'::date,'BH'),
 ('os',$q$Openshores — Vivre à Casablanca (guide d'expatriation, secondaire)$q$,null,'2026-05-11'::date,'MA')
), x(block,pos,body,inf,sk,conf) as (values
 ('promise',0,$q$Une histoire de famille portée par la carte : chez Em Sherif, recettes de la fondatrice retravaillées par sa fille, cheffe.$q$,false,'sp','medium'),
 ('promise',1,$q$Mezzés froids et chauds, pêche du jour choisie au comptoir, café et chicha (Em Sherif Sea Café, Bahreïn).$q$,false,'hn','low'),
 ('economics',0,$q$Repas de partage et de groupe ; beaucoup de préparations froides faites à l'avance. Les chiffres viennent de la famille restaurant du moteur.$q$,true,null,'low'),
 ('operations',0,$q$Compétence clé : un chef formé à la cuisine libanaise ; cuisine froide importante et grill.$q$,true,null,'low'),
 ('success',0,$q$Expansion par franchise dans le Golfe (Bahreïn, Abou Dhabi, Riyad) pour la marque Em Sherif.$q$,false,'hn','low'),
 ('success',1,$q$La marque est passée de Monaco à Paris (ouverture annoncée pour janvier 2025).$q$,false,'sp','medium'),
 ('profile_fit',0,$q$Accessible avec un chef libanais ; format de partage adapté aux groupes et aux familles.$q$,true,null,'low'),
 ('district_types',0,$q$Archétypes B et C : lecture déduite.$q$,true,null,'low'),
 ('casablanca',0,$q$Le Maârif est décrit avec des restaurants libanais parmi d'autres cuisines.$q$,false,'os','low'),
 ('regulatory',0,$q$Chicha : réglementation à vérifier ; licence d'alcool si arak ou vin.$q$,true,null,'low'),
 ('gaps',0,$q$Aucun restaurant libanais de Casablanca trouvé avec une source datée ; aucun cas d'échec trouvé ; fiche à compléter.$q$,false,null,'medium')
)
insert into public.brain_concept_lines (format_id, block, position, body_fr, inference, source_class, source_name, source_url, source_published_at, source_country, confidence)
select f.id, x.block, x.pos, x.body, x.inf, 'published', src.name, src.url, src.pub, src.country, x.conf
from x join public.brain_concept_formats f on f.slug='libanais-mediterraneen' left join src on src.k=x.sk;
insert into public.brain_concept_examples (format_id, venue_name, city, country, opened_text, what_fr, proof_fr, source_name, source_url, source_published_at)
select f.id, v.* from (values
 ('Em Sherif','Paris','FR','janvier 2025 (annoncé)',$q$Restaurant libanais de Monaco transféré à Paris, recettes de famille.$q$,null,'Sortir à Paris — Em Sherif (13 déc. 2024)','https://www.sortiraparis.com/en/where-to-eat-in-paris/restaurant/articles/322481-em-sherif-monaco-s-lebanese-restaurant-opens-in-paris','2024-12-13'::date),
 ('Em Sherif Sea Café','Bahreïn','BH','2022',$q$Poisson et mezzés, franchise.$q$,$q$Ouvertures annoncées à Abou Dhabi et Riyad.$q$,'Hospitality News — Em Sherif Sea Café (18 mai 2022, ancien)','https://www.hospitalitynewsmag.com/em-sherif-sea-cafe-opens-in-bahrain-slated-to-open-in-abu-dhabi-and-riyadh-later-this-year/','2022-05-18'::date)
) v(venue,city,country,opened,what,proof,sname,surl,spub)
join public.brain_concept_formats f on f.slug='libanais-mediterraneen';

------------------------------------------------------------------ CAFÉ-RESTO / BRUNCH
update public.brain_concept_formats set status='researched',
  definition_fr=$q$Café-restaurant de quartier ouvert toute la journée (petit-déjeuner, déjeuner, goûter), avec une offre de brunch le week-end.$q$
 where slug='cafe-resto-brunch';
with src(k,name,url,pub,country) as (values
 ('bl',$q$Le Matin — Bliss Rooftop lance un nouveau rendez-vous brunch le week-end$q$,'https://lematin.ma/lifestyle/bliss-rooftop-lance-un-nouveau-rendez-vous-brunch-le-week-end/367913','2026-09-30'::date,'MA'),
 ('lm2',$q$Le Matin — Les nouvelles tables voyageuses du Sofitel Casablanca Tour Blanche (Majda Fadili)$q$,'https://lematin.ma/lifestyle/les-nouvelles-tables-voyageuses-du-sofitel-casablanca-tour-blanche/286677','2025-06-20'::date,'MA'),
 ('ch',$q$Casablanca Holidays — Oasis (guide, secondaire)$q$,'https://www.casablancaholidays.com/areas/oasis','2026-07-03'::date,'MA'),
 ('bw',$q$Bewildered in Morocco — Best Neighborhoods to Live in Casablanca (blog de résidente, secondaire)$q$,null,'2026-09-04'::date,'MA'),
 ('rl',$q$Roasters — State of specialty coffee in Lisbon 2026 (mai 2026)$q$,'https://roasters.app/journal/state-of-specialty-coffee-in-lisbon-2026','2026-05-01'::date,'PT'),
 ('pdg',$q$Perfect Daily Grind (ES) — ¿Por qué la apuesta por la comida en las cafeterías ya no es tan rentable? (Sarah Charles, données surtout américaines)$q$,'https://perfectdailygrind.com/es/2026/07/06/apuesta-comida-cafeterias-no-es-rentable/','2026-07-06'::date,'US')
), x(block,pos,body,inf,sk,conf) as (values
 ('promise',0,$q$Brunch du week-end pensé pour les retrouvailles entre amis et les sorties en famille (Bliss Rooftop, samedi et dimanche de 10 h 30 à 14 h).$q$,false,'bl','medium'),
 ('promise',1,$q$Ouverture toute la journée : OLEA (Oasis) ouvre de 7 h à 22 h.$q$,false,'ch','low'),
 ('economics',0,$q$Formules de brunch à 250 DH et 290 DH (café ou thé et jus compris) au Bliss Rooftop, septembre 2026 : ordre de grandeur hôtelier.$q$,false,'bl','medium'),
 ('economics',1,$q$À Lisbonne, c'est le brunch qui rend beaucoup de cafés viables.$q$,false,'rl','medium'),
 ('economics',2,$q$La nourriture augmente le ticket mais ajoute du personnel et du gaspillage.$q$,false,'pdg','medium'),
 ('operations',0,$q$Cuisine de jour (œufs, tartines, pâtisserie) et amplitude horaire longue : deux équipes à prévoir.$q$,true,null,'low'),
 ('success',0,$q$Les hôtels ajoutent un brunch du week-end à leurs déjeuners de semaine et afterworks pour remplir le lieu toute la semaine.$q$,false,'bl','medium'),
 ('success',1,$q$Brasserie Flâneur (Sofitel) propose brunch et heure du thé en plus des repas.$q$,false,'lm2','medium'),
 ('pitfalls',0,$q$Demande concentrée sur le week-end ; concurrence des brunchs d'hôtels.$q$,true,'bl','low'),
 ('profile_fit',0,$q$Un des formats les plus accessibles pour un porteur sans expérience, avec un bon chef de cuisine de jour.$q$,true,null,'low'),
 ('district_types',0,$q$Archétypes B (Racine, Palmier, cités pour leurs cafés et brunchs) et E (Oasis) : lecture déduite.$q$,true,'bw','low'),
 ('casablanca',0,$q$Racine et Palmier sont décrits comme riches en cafés et adresses de brunch.$q$,false,'bw','low'),
 ('casablanca',1,$q$OLEA, café-restaurant méditerranéen à l'Oasis ; Bliss Rooftop (Radisson Gauthier La Citadelle) lance un brunch en septembre 2026.$q$,false,'ch','low'),
 ('regulatory',0,$q$Terrasse sur le domaine public à faire autoriser.$q$,true,null,'low'),
 ('gaps',0,$q$Aucun prix daté d'un café-resto indépendant ; aucun cas d'échec trouvé.$q$,false,null,'medium')
)
insert into public.brain_concept_lines (format_id, block, position, body_fr, inference, source_class, source_name, source_url, source_published_at, source_country, confidence)
select f.id, x.block, x.pos, x.body, x.inf, 'published', src.name, src.url, src.pub, src.country, x.conf
from x join public.brain_concept_formats f on f.slug='cafe-resto-brunch' left join src on src.k=x.sk;
insert into public.brain_concept_examples (format_id, venue_name, city, country, opened_text, what_fr, proof_fr, source_name, source_url, source_published_at)
select f.id, v.* from (values
 ('Bliss Rooftop','Casablanca','MA','brunch lancé en septembre 2026',$q$Rooftop d'hôtel : déjeuner de semaine, afterwork, brunch du week-end à 250 et 290 DH.$q$,null,'Le Matin — Bliss Rooftop brunch (30 sept. 2026)','https://lematin.ma/lifestyle/bliss-rooftop-lance-un-nouveau-rendez-vous-brunch-le-week-end/367913','2026-09-30'::date),
 ('OLEA','Casablanca','MA','non indiqué',$q$Café-restaurant méditerranéen à l'Oasis, ouvert de 7 h à 22 h.$q$,null,'Casablanca Holidays — Oasis (3 juil. 2026, secondaire)','https://www.casablancaholidays.com/areas/oasis','2026-07-03'::date)
) v(venue,city,country,opened,what,proof,sname,surl,spub)
join public.brain_concept_formats f on f.slug='cafe-resto-brunch';

------------------------------------------------------------------ BURGER
update public.brain_concept_formats set status='researched',
  definition_fr=$q$Restaurant de burgers en vente rapide ou au comptoir, sur place, à emporter et en livraison ; marché dominé au Maroc par les chaînes internationales.$q$
 where slug='burger';
with src(k,name,url,pub,country) as (values
 ('bk',$q$Bladi — Burger King Maroc dévoile ses nouvelles ambitions$q$,'https://www.bladi.net/burger-king-maroc-devoile-nouvelles-ambitions,113271.html','2025-02-22'::date,'MA'),
 ('bm',$q$Morocco World News — French halal burger chain BiG M enters Moroccan market (Adil Faouzi)$q$,'https://www.moroccoworldnews.com/2026/03/282341/french-halal-burger-chain-big-m-enters-moroccan-market-with-first-restaurant-in-tangier/','2026-03-11'::date,'MA'),
 ('m2',$q$Merca2 — Goiko se reinventa: apuesta por la venta callejera$q$,'https://www.merca2.es/2025/11/28/goiko-estrategia-puestos-2328586/','2025-11-28'::date,'ES'),
 ('ali',$q$Alimarket — Las pérdidas de Goiko en 2025 superaron los 36 M$q$,'https://www.alimarket.es/restauracion/noticia_amp/430505/las-perdidas-de-goiko-en-2025-superaron-los-36-m','2026-09-03'::date,'ES'),
 ('osm',$q$OpenStreetMap via Overpass, relevé du 1 nov. 2026 (Maârif et Gauthier, cercles de 650 m)$q$,'https://www.openstreetmap.org/copyright','2026-11-01'::date,'MA')
), x(block,pos,body,inf,sk,conf) as (values
 ('promise',0,$q$Repas rapide et abordable, clientèle jeune, forte part de livraison et de vente à emporter.$q$,true,null,'low'),
 ('economics',0,$q$BiG M (franchise française) : droit d'entrée de 30 000 € HT et apport personnel minimum de 130 000 € ; prix marocains adaptés au pouvoir d'achat local.$q$,false,'bm','medium'),
 ('economics',1,$q$Chez Goiko (Espagne), les ouvertures ont comprimé les marges : amortissements en hausse de 37 %, investissements supérieurs au flux de trésorerie d'exploitation en 2022–2023.$q$,false,'m2','medium'),
 ('operations',0,$q$Plancha et friteuses : extraction indispensable ; viande halal et régularité des produits.$q$,true,null,'low'),
 ('success',0,$q$Burger King Maroc : 42 restaurants, plus de 1 200 salariés, objectif de 100 restaurants en 2030 ; premier restaurant au Morocco Mall en 2010.$q$,false,'bk','medium'),
 ('success',1,$q$BiG M ouvre à Tanger en 2026 avec des investisseurs marocains et prévoit Casablanca et Rabat.$q$,false,'bm','medium'),
 ('pitfalls',0,$q$Goiko (burger gourmet, Espagne) : pertes de plus de 36 M€ en 2025 et chiffre d'affaires en baisse de 11 %.$q$,false,'ali','medium'),
 ('pitfalls',1,$q$Goiko se tourne vers les stands et camions de rue pour relancer les ventes : ajustement du modèle.$q$,false,'m2','medium'),
 ('pitfalls',2,$q$Marché tenu par des chaînes à forte puissance d'achat et de marketing : un indépendant doit se distinguer par le produit.$q$,true,'bk','low'),
 ('profile_fit',0,$q$Accessible en franchise pour un investisseur ; en indépendant, risque fort face aux chaînes.$q$,true,null,'low'),
 ('district_types',0,$q$Archétypes C (centre animé) et E (transit), et centres commerciaux : lecture déduite.$q$,true,null,'low'),
 ('casablanca',0,$q$OpenStreetMap compte 23 lieux de vente rapide au Maârif et 13 à Gauthier, tous types confondus.$q$,false,'osm','medium'),
 ('casablanca',1,$q$Burger King est implanté à Casablanca depuis 2010 (Morocco Mall).$q$,false,'bk','medium'),
 ('regulatory',0,$q$Extraction et sécurité incendie ; traçabilité halal.$q$,true,null,'low'),
 ('gaps',0,$q$Aucun burger gourmet indépendant de Casablanca trouvé avec une source datée ; aucun prix daté.$q$,false,null,'medium')
)
insert into public.brain_concept_lines (format_id, block, position, body_fr, inference, source_class, source_name, source_url, source_published_at, source_country, confidence)
select f.id, x.block, x.pos, x.body, x.inf, 'published', src.name, src.url, src.pub, src.country, x.conf
from x join public.brain_concept_formats f on f.slug='burger' left join src on src.k=x.sk;
insert into public.brain_concept_examples (format_id, venue_name, city, country, opened_text, what_fr, proof_fr, source_name, source_url, source_published_at)
select f.id, v.* from (values
 ('Burger King Maroc','Casablanca et grandes villes','MA','2010',$q$Chaîne internationale, 42 restaurants.$q$,$q$Objectif de 100 restaurants en 2030.$q$,'Bladi — Burger King Maroc (22 févr. 2025)','https://www.bladi.net/burger-king-maroc-devoile-nouvelles-ambitions,113271.html','2025-02-22'::date),
 ('BiG M','Tanger','MA','2026',$q$Chaîne française de burgers halal, premier restaurant au Maroc.$q$,$q$Casablanca et Rabat annoncés.$q$,'Morocco World News — BiG M (11 mars 2026)','https://www.moroccoworldnews.com/2026/03/282341/french-halal-burger-chain-big-m-enters-moroccan-market-with-first-restaurant-in-tangier/','2026-03-11'::date),
 ('Goiko','Madrid et Espagne','ES','non indiqué',$q$Chaîne de burgers gourmet.$q$,$q$Ajustement : pertes de plus de 36 M€ en 2025, passage aux stands de rue.$q$,'Alimarket — pertes de Goiko 2025 (3 sept. 2026)','https://www.alimarket.es/restauracion/noticia_amp/430505/las-perdidas-de-goiko-en-2025-superaron-los-36-m','2026-09-03'::date)
) v(venue,city,country,opened,what,proof,sname,surl,spub)
join public.brain_concept_formats f on f.slug='burger';

commit;
