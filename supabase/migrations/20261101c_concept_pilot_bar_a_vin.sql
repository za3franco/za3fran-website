-- Pilot concept sheet: wine bar (researched 1 Nov 2026). Source: claude/catalogue-concepts-structure.md.
update public.brain_concept_formats set status='researched',
  definition_fr=$q$Lieu où le vin, souvent au verre, est le centre de l'offre, accompagné d'assiettes à partager ou d'une carte courte. À Casablanca, des lieux récents le combinent avec une cuisine (« restaurant et bar à vin »).$q$
 where slug='bar-a-vin';

with src(k,name,url,pub,country) as (values
 ('hesp',$q$Hespress — Braise Social Kitchen et Wine Bar ouvre ses portes à Casablanca$q$,'https://fr.hespress.com/492406-braise-social-kitchen-et-wine-bar-ouvre-ses-portes-a-casablanca.html','2026-10-15'::date,'MA'),
 ('db',$q$The Drinks Business — Food for thought: are pairing dishes the key to success for Hong Kong wine bars? (Joyce Yip)$q$,'https://www.thedrinksbusiness.com/2025/11/food-for-thought-are-pairing-dishes-the-key-to-success-for-hong-kong-wine-bars/','2025-11-27'::date,'HK'),
 ('sf',$q$SevenFifty Daily — Why restaurant groups are adding wine bars to their portfolios (article non daté ; ouvertures citées de 2016 à 2019)$q$,'https://daily-test.sevenfifty.com/why-restaurant-groups-are-adding-wine-bars-to-their-portfolios',null::date,'US'),
 ('lnt',$q$La Nouvelle Tribune — Monsieur Moutarde ouvre une brasserie française à Gauthier$q$,'https://lnt.ma/casablanca-monsieur-moutarde-ouvre-une-nouvelle-brasserie-francaise-a-gauthier/','2026-05-06'::date,'MA'),
 ('osm',$q$OpenStreetMap via Overpass, relevé du 1 nov. 2026 (Maârif et Gauthier, cercles de 650 m)$q$,'https://www.openstreetmap.org/copyright','2026-11-01'::date,'MA')
), x(block,pos,body,inf,sk,conf) as (values
 ('promise',0,$q$À Casablanca : afterworks, dîners entre amis et soirées prolongées.$q$,false,'hesp','medium'),
 ('promise',1,$q$À Hong Kong : en semaine, un verre avant ou après le dîner ; les repas complets plutôt en fin de semaine (Silène).$q$,false,'db','medium'),
 ('economics',0,$q$Marge plus élevée attendue grâce à la part d'alcool et à moins de personnel (dirigeant du groupe LEYE).$q$,false,'sf','low'),
 ('economics',1,$q$Cuisine réduite : un petit passe réduit le personnel d'appui ; serveurs, barmans et cuisiniers servent la nourriture.$q$,false,'sf','low'),
 ('economics',2,$q$Les boissons génèrent moins de gaspillage que la nourriture, qui périme vite.$q$,false,'sf','low'),
 ('economics',3,$q$La part de la nourriture varie beaucoup d'un lieu à l'autre : environ 65 % du chiffre d'affaires chez Crushed Wines, environ un quart chez Silène, avec un objectif de plus de 30 %. Le moteur ne doit pas supposer une part unique.$q$,false,'db','medium'),
 ('economics',4,$q$Quand les budgets se resserrent, les clients attendent un repas chaud, abordable et complet.$q$,false,'db','medium'),
 ('operations',0,$q$Un responsable du vin pilote la carte : directeurs de boissons dans les groupes américains.$q$,false,'sf','low'),
 ('operations',1,$q$À Casablanca, la cave de Braise a été élaborée avec le président de l'Association des Sommeliers du Maroc.$q$,false,'hesp','medium'),
 ('operations',2,$q$Une licence d'alcool est nécessaire : valeur réglementaire à rattacher du Brain (entrée sur la procédure à Casablanca encore à faire).$q$,true,null,'low'),
 ('operations',3,$q$Une cuisine à braise ou à feu (four Josper chez Braise) demande une extraction : à vérifier avant tout engagement de local.$q$,true,'hesp','low'),
 ('success',0,$q$Clarté de l'offre : à Hong Kong, un plat d'origine a été retiré après six mois parce que les clients ne comprenaient pas l'offre ; la carte est passée aux pâtes en janvier 2025.$q$,false,'db','medium'),
 ('success',1,$q$Le vin reste le centre ; une sélection au verre qui fait explorer est présentée comme le cœur de la valeur.$q$,false,'db','medium'),
 ('success',2,$q$Le bon emplacement a demandé du temps à un groupe américain.$q$,false,'sf','low'),
 ('success',3,$q$Double public : amateurs de vin et clients qui veulent un cadre décontracté.$q$,false,'sf','low'),
 ('pitfalls',0,$q$Concurrence : la restauration est un espace très concurrentiel, une des raisons citées d'ouvrir un bar plutôt qu'un restaurant.$q$,false,'sf','low'),
 ('pitfalls',1,$q$Cuisine trop ambitieuse ou illisible : voir le cas de Crushed Wines.$q$,false,'db','medium'),
 ('pitfalls',2,$q$Gauthier : deux ouvertures de 2026 sur le créneau vin et cuisine (Monsieur Moutarde, Braise) ; lecture de saturation à actualiser avec le recensement.$q$,true,'lnt','low'),
 ('profile_fit',0,$q$Difficulté élevée pour un porteur sans expérience : la carte des vins demande un responsable compétent ; un investisseur a besoin d'un exploitant ou d'un sommelier-associé.$q$,true,null,'low'),
 ('district_types',0,$q$Archétype C (sortie du soir, centre animé) : lecture déduite des fiches de Gauthier et Maârif.$q$,true,null,'low'),
 ('casablanca',0,$q$Braise Social Kitchen & Wine Bar, Gauthier, ouvert le 16 oct. 2026 : cuisine méditerranéenne à la braise, assiettes à partager, vins marocains et internationaux ; premier projet du chef au Maroc.$q$,false,'hesp','medium'),
 ('casablanca',1,$q$Monsieur Moutarde – Vin & Cuisine, Gauthier, brasserie française, ouverture 2026.$q$,false,'lnt','medium'),
 ('casablanca',2,$q$Aucun lieu du côté du vin repéré dans les zones Maârif et Gauthier ; Braise est présent, Monsieur Moutarde absent : la source ne voit pas ces concurrents.$q$,false,'osm','medium'),
 ('regulatory',0,$q$Licence d'alcool ; extraction pour une cuisine à feu ; bail et copropriété à vérifier.$q$,true,null,'low'),
 ('gaps',0,$q$Aucune carte ni gamme de prix datée pour Braise ou Monsieur Moutarde.$q$,false,null,'medium'),
 ('gaps',1,$q$Aucun exemple marocain de bar à vin en exploitation depuis plus d'un an.$q$,false,null,'medium'),
 ('gaps',2,$q$Aucune source sur le taux de survie des bars à vin à Casablanca.$q$,false,null,'medium'),
 ('gaps',3,$q$Chiffres américains anciens et chiffres de Hong Kong : non transposables à Casablanca sans validation.$q$,false,null,'medium')
)
insert into public.brain_concept_lines (format_id, block, position, body_fr, inference, source_class, source_name, source_url, source_published_at, source_country, confidence)
select f.id, x.block, x.pos, x.body, x.inf, 'published', src.name, src.url, src.pub, src.country, x.conf
from x join public.brain_concept_formats f on f.slug='bar-a-vin' left join src on src.k=x.sk;

insert into public.brain_concept_examples (format_id, venue_name, city, country, opened_text, what_fr, proof_fr, source_name, source_url, source_published_at)
select f.id, v.venue, v.city, v.country, v.opened, v.what, v.proof, v.sname, v.surl, v.spub
from (values
 ('Crushed Wines','Hong Kong','HK','août 2023',$q$Carte simplifiée puis centrée sur les pâtes (janv. 2025).$q$,$q$Nourriture environ 65 % du chiffre d'affaires ; un plat d'origine retiré après six mois.$q$,'The Drinks Business — Hong Kong wine bars (27 nov. 2025)','https://www.thedrinksbusiness.com/2025/11/food-for-thought-are-pairing-dishes-the-key-to-success-for-hong-kong-wine-bars/','2025-11-27'::date),
 ('Silène','Hong Kong','HK','2024',$q$Chef depuis août 2025, tartinades européennes ; huîtres et moules de France en saison.$q$,$q$Nourriture environ un quart du chiffre d'affaires, objectif de plus de 30 %.$q$,'The Drinks Business — Hong Kong wine bars (27 nov. 2025)','https://www.thedrinksbusiness.com/2025/11/food-for-thought-are-pairing-dishes-the-key-to-success-for-hong-kong-wine-bars/','2025-11-27'::date),
 ('Mato Coffee Wine','Hong Kong','HK','non indiqué',$q$Formules de dégustation de deux heures, thème tournant tous les deux à trois mois.$q$,$q$Programme destiné à faire explorer les amateurs « puristes ».$q$,'The Drinks Business — Hong Kong wine bars (27 nov. 2025)','https://www.thedrinksbusiness.com/2025/11/food-for-thought-are-pairing-dishes-the-key-to-success-for-hong-kong-wine-bars/','2025-11-27'::date),
 ('Verjus','San Francisco','US','janvier 2019',$q$Vente de bouteilles ajoutée, inspirée des bars à vin parisiens.$q$,null,'SevenFifty Daily (article non daté)','https://daily-test.sevenfifty.com/why-restaurant-groups-are-adding-wine-bars-to-their-portfolios',null::date),
 ('Bar Ramone','Chicago','US','août 2018',$q$Vin et petites assiettes, cuisine réduite, bar de quartier.$q$,null,'SevenFifty Daily (article non daté)','https://daily-test.sevenfifty.com/why-restaurant-groups-are-adding-wine-bars-to-their-portfolios',null::date),
 ('June''s All Day','Austin','US','juillet 2016',$q$Carte de vins tournante ; sert aussi de banc d'essai pour les achats du groupe.$q$,null,'SevenFifty Daily (article non daté)','https://daily-test.sevenfifty.com/why-restaurant-groups-are-adding-wine-bars-to-their-portfolios',null::date)
) v(venue,city,country,opened,what,proof,sname,surl,spub)
join public.brain_concept_formats f on f.slug='bar-a-vin';
