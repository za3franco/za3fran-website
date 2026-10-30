-- District cards (K1) and first census venues (K2), Casablanca first wave — researched, 30 Oct 2026.
-- Source: claude/fiches-quartiers-pilote.md + claude/fiches-quartiers-avancement.md. Generated; rents stay in brain_parameter_values.
-- Applied 30 Oct 2026 from the chat (single statement with the same content); 88 card lines, 13 venues.

-- markets missing for the first wave (children of Casablanca)
insert into brain_markets (country_code, city, district, parent_id, currency, coverage)
select 'MA','Casablanca','Maârif',c.id,'MAD','researched' from brain_markets c
 where c.country_code='MA' and c.city='Casablanca' and c.district is null
   and not exists (select 1 from brain_markets m where m.parent_id=c.id and lower(m.district)=lower('Maârif'));
insert into brain_markets (country_code, city, district, parent_id, currency, coverage)
select 'MA','Casablanca','Gauthier',c.id,'MAD','researched' from brain_markets c
 where c.country_code='MA' and c.city='Casablanca' and c.district is null
   and not exists (select 1 from brain_markets m where m.parent_id=c.id and lower(m.district)=lower('Gauthier'));
insert into brain_markets (country_code, city, district, parent_id, currency, coverage)
select 'MA','Casablanca','Racine',c.id,'MAD','researched' from brain_markets c
 where c.country_code='MA' and c.city='Casablanca' and c.district is null
   and not exists (select 1 from brain_markets m where m.parent_id=c.id and lower(m.district)=lower('Racine'));
insert into brain_markets (country_code, city, district, parent_id, currency, coverage)
select 'MA','Casablanca','Bourgogne',c.id,'MAD','researched' from brain_markets c
 where c.country_code='MA' and c.city='Casablanca' and c.district is null
   and not exists (select 1 from brain_markets m where m.parent_id=c.id and lower(m.district)=lower('Bourgogne'));
insert into brain_markets (country_code, city, district, parent_id, currency, coverage)
select 'MA','Casablanca','Centre-ville',c.id,'MAD','researched' from brain_markets c
 where c.country_code='MA' and c.city='Casablanca' and c.district is null
   and not exists (select 1 from brain_markets m where m.parent_id=c.id and lower(m.district)=lower('Centre-ville'));
insert into brain_markets (country_code, city, district, parent_id, currency, coverage)
select 'MA','Casablanca','Anfa',c.id,'MAD','researched' from brain_markets c
 where c.country_code='MA' and c.city='Casablanca' and c.district is null
   and not exists (select 1 from brain_markets m where m.parent_id=c.id and lower(m.district)=lower('Anfa'));
insert into brain_markets (country_code, city, district, parent_id, currency, coverage)
select 'MA','Casablanca','Casa Finance City',c.id,'MAD','researched' from brain_markets c
 where c.country_code='MA' and c.city='Casablanca' and c.district is null
   and not exists (select 1 from brain_markets m where m.parent_id=c.id and lower(m.district)=lower('Casa Finance City'));
insert into brain_markets (country_code, city, district, parent_id, currency, coverage)
select 'MA','Casablanca','Aïn Diab',c.id,'MAD','researched' from brain_markets c
 where c.country_code='MA' and c.city='Casablanca' and c.district is null
   and not exists (select 1 from brain_markets m where m.parent_id=c.id and lower(m.district)=lower('Aïn Diab'));
insert into brain_markets (country_code, city, district, parent_id, currency, coverage)
select 'MA','Casablanca','Californie',c.id,'MAD','researched' from brain_markets c
 where c.country_code='MA' and c.city='Casablanca' and c.district is null
   and not exists (select 1 from brain_markets m where m.parent_id=c.id and lower(m.district)=lower('Californie'));
insert into brain_markets (country_code, city, district, parent_id, currency, coverage)
select 'MA','Casablanca','CIL',c.id,'MAD','researched' from brain_markets c
 where c.country_code='MA' and c.city='Casablanca' and c.district is null
   and not exists (select 1 from brain_markets m where m.parent_id=c.id and lower(m.district)=lower('CIL'));
insert into brain_markets (country_code, city, district, parent_id, currency, coverage)
select 'MA','Casablanca','Palmier',c.id,'MAD','researched' from brain_markets c
 where c.country_code='MA' and c.city='Casablanca' and c.district is null
   and not exists (select 1 from brain_markets m where m.parent_id=c.id and lower(m.district)=lower('Palmier'));
insert into brain_markets (country_code, city, district, parent_id, currency, coverage)
select 'MA','Casablanca','Oasis',c.id,'MAD','researched' from brain_markets c
 where c.country_code='MA' and c.city='Casablanca' and c.district is null
   and not exists (select 1 from brain_markets m where m.parent_id=c.id and lower(m.district)=lower('Oasis'));
insert into brain_markets (country_code, city, district, parent_id, currency, coverage)
select 'MA','Casablanca','Sidi Maârouf',c.id,'MAD','researched' from brain_markets c
 where c.country_code='MA' and c.city='Casablanca' and c.district is null
   and not exists (select 1 from brain_markets m where m.parent_id=c.id and lower(m.district)=lower('Sidi Maârouf'));

-- district card lines
with src(k,name,url,pub) as (values
('le360','Le360 — Il était une fois le Maârif','https://fr.le360.ma/lifestyle/diapo-un-quartier-une-histoire-il-etait-une-fois-le-maarif-174533/','2018-09-17'::date),
('gv','Generation Voyage — Dans quel quartier loger à Casablanca (guide de voyage, secondaire)','https://generationvoyage.fr/?p=65991','2026-09-14'::date),
('os','Openshores — Vivre à Casablanca (guide d''expatriation, secondaire)','https://www.openshores.co/blog/maroc/casablanca/vivre-a-casablanca-guide-complet','2026-05-11'::date),
('bw','Bewildered in Morocco — Best Neighborhoods to Live in Casablanca (blog de résidente, secondaire)','https://bewilderedinmorocco.com/neighborhoods-live-casablanca/','2026-09-04'::date),
('heerby','Heerby — Nouveaux restaurants Casablanca 2026 (liste générée, fiabilité faible)','https://heerby.ma/fr/blog/nouveaux-restaurants-casablanca-2026','2026-03-20'::date),
('heerbyB','Heerby — Top 7 Bourgogne (liste générée, fiabilité faible)','https://heerby.ma/en/blog/top-7-cafes-bourgogne-casablanca','2026-03-21'::date),
('heerbyC','Heerby — Top 7 Californie (liste générée, fiabilité faible)','https://heerby.ma/fr/blog/top-7-cafes-californie-casablanca','2026-03-21'::date),
('ous','Ousortir — Nouveaux restaurants Casablanca 2026','https://ousortir.ma/en/blog/nouveaux-restaurants-casablanca-2026/','2026-02-15'::date),
('vh','VH — Casablanca à table : les nouvelles adresses','https://www.vh.ma/actualite-news-express-maroc/casablanca-a-table-les-nouvelles-adresses-qui-reveillent-la-ville/','2026-08-13'::date),
('lnt','La Nouvelle Tribune — Monsieur Moutarde ouvre à Gauthier','https://lnt.ma/casablanca-monsieur-moutarde-ouvre-une-nouvelle-brasserie-francaise-a-gauthier/','2026-05-06'::date),
('nouv','Le Nouvelliste — Braise Social Kitchen ouvre à Gauthier','https://www.lenouvelliste.ma/gastronomie-a-casablanca-braise-social-kitchen-ouvre-ses-portes-a-gauthier/','2026-10-15'::date),
('m24plan','Médias24 — Maârif, version finale du plan d''aménagement (titre seul, page illisible)','https://medias24.com/2026/10/27/maarif-ce-qui-a-change-dans-la-version-finale-du-plan-damenagement-1784663/','2026-10-27'::date),
('m24mc1','Médias24 — Marché central, nouvelle phase (titre seul, page illisible)','https://medias24.com/2026/03/14/la-rehabilitation-du-marche-central-de-casablanca-entame-une-nouvelle-phase-1642821/','2026-03-14'::date),
('m24mc2','Médias24 — Marché central, 366 MDH pour lancer les travaux (titre seul, page illisible)','https://medias24.com/2026/05/21/marche-central-de-casablanca-366-millions-de-dh-pour-lancer-les-travaux-de-rehabilitation-1683715/','2026-05-21'::date),
('telquel','TelQuel — Le marché central ne sera finalement pas gastronomique','https://telquel.ma/2019/10/23/le-marche-central-ne-sera-finalement-pas-gastronomique_1654954','2019-10-23'::date),
('hesp','Hespress — Démolitions sur le littoral d''Aïn Diab','https://fr.hespress.com/466627-466627.html','2026-03-21'::date),
('wafir','Wafir — CFC 2026, bilan (cite une étude HCP–CFC Authority de 2025, secondaire)','https://wafir.ma/fr/actu/casablanca-finance-city-cfc-2026-bilan-200-entreprises-statut-fiscal-hub-afrique','2026-05-18'::date),
('cnear','Médias24 — Casanearshore passe 20 000 emplois (chiffre ancien)','https://medias24.com/2015/02/16/casanearshore-a-franchi-le-cap-des-20-000-emplois/','2015-02-16'::date),
('ch','Casablanca Holidays — Oasis (guide, secondaire)','https://www.casablancaholidays.com/areas/oasis','2026-07-03'::date),
('asr','Discover ASR — Citadines Racine Casablanca (site de l''exploitant)','https://www.discoverasr.com/en/citadines/morocco/citadines-racine-casablanca',null::date),
('avito','Avito — annonces de fonds de commerce café-restaurant, Bourgogne (observation)','https://www.avito.ma/','2026-10-30'::date),
('jobsq','Jobsquare — offre de recrutement pour une ouverture au CIL (valable jusqu''au 23 nov. 2026)','https://www.jobsquare.ma/job/22611/commis-de-salle-h-f-ouverture-de-restaurant-cil-casablanca/','2026-10-30'::date)
), x(d,sec,pos,body,inf,sk,conf) as (values
('Maârif','character',0,'Présenté comme l''un des « centres » de Casablanca : quartier résidentiel et commercial dense, réputé pour le shopping et les affaires.',false,'gv','low'),
('Maârif','character',1,'Historiquement quartier d''immigration italienne et espagnole au début du XXe siècle.',false,'le360','low'),
('Maârif','audiences',2,'Résidents, dont une forte communauté d''expatriés francophones.',false,'os','low'),
('Maârif','audiences',3,'Jeunes Casablancais en sortie.',false,'gv','low'),
('Maârif','audiences',4,'Actifs et clientèle d''affaires.',false,'le360','low'),
('Maârif','footfall',5,'Tramway : arrêts Maârif et Omar Ibn Khattab.',false,'os','low'),
('Maârif','footfall',6,'Twin Center en bordure du quartier.',false,'gv','low'),
('Maârif','venue_landscape',7,'Restaurants français, libanais, marocains, pizzerias ; boulangeries et cafés.',false,'os','low'),
('Maârif','venue_landscape',8,'Ouvertures 2026 citées au Maârif : Mila Supper Club (supper club), Casa Galicia (cuisine ibérique, fruits de mer). La même source place parfois ces lieux à Gauthier.',false,'ous','medium'),
('Maârif','venue_landscape',9,'Gauthier, Maârif et le boulevard Zerktouni concentrent la plupart des ouvertures de 2026.',false,'heerby','low'),
('Maârif','urban_works',10,'Nouveau plan d''aménagement du Maârif arrêté en version finale ; effet sur les rez-de-chaussée commerciaux et la restauration non vérifié (page illisible par nos outils).',false,'m24plan','low'),
('Maârif','gaps',11,'Nombre de lieux par format · gamme de prix (aucune carte datée) · rythme jour/soir et week-end · stationnement · horaires de fermeture usuels.',false,null,'medium'),
('Gauthier','character',0,'Quartier central du protectorat, architecture Art déco, ambiance cosmopolite et calme ; entre la place de la Fraternité et le rond-point Mermoz, près de l''ancienne médina.',false,'os','low'),
('Gauthier','audiences',1,'Résidents cosmopolites.',false,'os','low'),
('Gauthier','audiences',2,'Professions libérales installées (cabinets médicaux, avocats, notaires) : clientèle de déjeuner probable.',true,'os','low'),
('Gauthier','audiences',3,'Sortie du soir : nombreux bars et restaurants.',false,'gv','low'),
('Gauthier','footfall',4,'Boulevard Zerktouni.',false,'heerby','low'),
('Gauthier','venue_landscape',5,'Cafés-brasseries « à la française ».',false,'os','low'),
('Gauthier','venue_landscape',6,'Monsieur Moutarde – Vin & Cuisine, brasserie française, ouverte en 2026.',false,'lnt','medium'),
('Gauthier','venue_landscape',7,'Braise Social Kitchen & Wine Bar : méditerranéen au feu, assiettes à partager, vins marocains et internationaux ; inauguré le 16 octobre 2026.',false,'nouv','medium'),
('Gauthier','venue_landscape',8,'L''Octave, bar à cocktails et restaurant, ouvert en 2026.',false,'ous','medium'),
('Gauthier','signals',9,'Deux ouvertures de 2026 se positionnent sur le vin et la cuisine (brasserie, wine bar) : un bar à vin à Gauthier arrive sur un créneau qui se remplit.',true,'nouv','low'),
('Gauthier','gaps',10,'Nombre de lieux par format · gamme de prix · rythme jour/soir et week-end · stationnement · transports.',false,null,'medium'),
('Racine','character',0,'Rangé avec Gauthier et Palmier : immeubles soignés, rues calmes, quartier cher, juste derrière Anfa.',false,'bw','low'),
('Racine','character',1,'Cité parmi les « centres » de la ville.',false,'gv','low'),
('Racine','audiences',2,'Étrangers, notamment expatriés français.',false,'bw','low'),
('Racine','venue_landscape',3,'Nombreux cafés et adresses de brunch tendance.',false,'bw','low'),
('Racine','footfall',4,'Résidence hôtelière Citadines Racine annoncée pour 2026 : clientèle de séjour, à vérifier sur place.',true,'asr','low'),
('Racine','gaps',5,'Loyer (absent des quartiers visibles de Mahaly) · densité · prix · rythmes · transports.',false,null,'medium'),
('Bourgogne','character',0,'Entre Maârif et le centre-ville ; immeubles anciens de caractère, état inégal (rues rénovées, d''autres vieillissantes).',false,'bw','low'),
('Bourgogne','character',1,'Ambiance détendue.',false,'heerbyB','low'),
('Bourgogne','venue_landscape',2,'Réputation culinaire construite discrètement ; adresses proches les unes des autres, à pied depuis Maârif ; déjeuners de semaine et soirées « verre puis dîner ».',false,'heerbyB','low'),
('Bourgogne','footfall',3,'Le haut du quartier est à pied de la mosquée Hassan II et du début de la Corniche.',false,'bw','low'),
('Bourgogne','signals',4,'Nombreuses annonces de fonds de commerce café-restaurant à vendre ou en gérance : ne prouve pas un taux de fermeture, à vérifier.',true,'avito','low'),
('Bourgogne','gaps',5,'Clientèles · densité · prix · rythmes.',false,null,'medium'),
('Centre-ville','character',0,'Autour de la place Mohammed V, avenues Art déco du protectorat ; animé, parfois bruyant et encombré.',false,'bw','low'),
('Centre-ville','footfall',1,'Tramway et gare de Casa Port (trains vers Rabat).',false,'bw','low'),
('Centre-ville','venue_landscape',2,'Brasserie Marcel Cerdan, brasserie française dans un bâtiment historique, ouverte en 2026.',false,'ous','medium'),
('Centre-ville','urban_works',3,'Réhabilitation du Marché central : nouvelle phase annoncée (contenu non vérifié, page illisible).',false,'m24mc1','low'),
('Centre-ville','urban_works',4,'Marché central : lancement de travaux annoncé pour 366 millions de dirhams (contenu non vérifié, page illisible).',false,'m24mc2','low'),
('Centre-ville','urban_works',5,'La reconversion du Marché central en marché gastronomique, annoncée en 2019, avait été abandonnée la même année.',false,'telquel','medium'),
('Centre-ville','gaps',6,'Loyer : Mahaly publie « Sidi Belyout » (175 MAD/m²/mois), rattachement au centre-ville à confirmer · clientèles · densité · prix · rythmes.',false,null,'medium'),
('Anfa','character',0,'Quartier le plus aisé : villas derrière de hauts murs, jardins, vues sur l''océan ; Anfa Supérieur, partie historique.',false,'os','low'),
('Anfa','audiences',1,'Ménages aisés, cadres dirigeants, diplomates, expatriés haut de gamme.',false,'os','low'),
('Anfa','footfall',2,'Anfa Place (centre commercial) et Royal Golf d''Anfa ; pas desservi par le tramway.',false,'os','low'),
('Anfa','gaps',3,'Offre de restauration propre au quartier · densité · prix · rythmes.',false,null,'medium'),
('Casa Finance City','character',0,'Tours de bureaux sur l''ancien aéroport d''Anfa (Casa Anfa), résidentiel haut de gamme en construction autour.',false,'bw','low'),
('Casa Finance City','audiences',1,'220 entreprises au statut CFC et 8 500 emplois directs en 2026.',false,'wafir','low'),
('Casa Finance City','audiences',2,'Forte clientèle de déjeuner en semaine, à vérifier.',true,'wafir','low'),
('Casa Finance City','venue_landscape',3,'Le Pavillon CFC, table gastronomique dans un jardin, ouverte de midi à 23 h.',false,'vh','medium'),
('Casa Finance City','gaps',4,'Rythme du soir et du week-end · densité · prix.',false,null,'medium'),
('Aïn Diab','character',0,'Front de mer, promenade de la Corniche, clubs de plage ; rythme détendu.',false,'os','low'),
('Aïn Diab','audiences',1,'Résidents locaux et internationaux, touristes.',false,'gv','low'),
('Aïn Diab','footfall',2,'Promenade de la Corniche et Morocco Mall.',false,'gv','low'),
('Aïn Diab','footfall',3,'Accès surtout en voiture, trafic contraignant.',false,'bw','low'),
('Aïn Diab','venue_landscape',4,'Aïku (japonais face à la mer) ; L''Aragosta (rooftop de la Villa Sahraï).',false,'vh','medium'),
('Aïn Diab','urban_works',5,'Campagne contre l''occupation illégale du domaine public maritime : démolitions d''installations d''un complexe hôtelier du front de mer ; objectif affiché de faire de la Corniche une vitrine touristique.',false,'hesp','medium'),
('Aïn Diab','signals',6,'Pour tout projet en front de mer (terrasse, plage, extension), le statut juridique du local et de sa terrasse est à vérifier avant tout engagement.',true,'hesp','low'),
('Aïn Diab','gaps',7,'Densité · prix · saisonnalité propre à la Corniche.',false,null,'medium'),
('Californie','character',0,'Sud de la ville : villas, jardins, rues calmes, grandes avenues.',false,'bw','low'),
('Californie','character',1,'Stationnement en général facile ; parcours en voiture.',false,'heerbyC','low'),
('Californie','audiences',2,'Familles, écoles internationales à proximité.',false,'bw','low'),
('Californie','audiences',3,'Clientèle d''habitués du quartier plutôt que de visiteurs.',false,'heerbyC','low'),
('Californie','gaps',4,'Lieux datés · densité · prix.',false,null,'medium'),
('CIL','character',0,'Calme, arboré, villas et petits immeubles.',false,'bw','low'),
('CIL','audiences',1,'Nombreuses familles françaises.',false,'bw','low'),
('CIL','audiences',2,'Clientèle familiale et de week-end, à vérifier.',true,'bw','low'),
('CIL','venue_landscape',3,'Counter 11, comptoir japonais intime, réservation indispensable ; La Crêperie du CIL, familiale.',false,'vh','medium'),
('CIL','venue_landscape',4,'Un restaurant italien en franchise recrute pour son ouverture au CIL.',false,'jobsq','medium'),
('CIL','signals',5,'Ouvertures récentes de formats de quartier (comptoir, crêperie, franchise) : signe d''une demande locale, à confirmer.',true,'vh','low'),
('CIL','gaps',6,'Loyer · densité · prix · rythmes.',false,null,'medium'),
('Palmier','character',0,'Rangé avec Gauthier et Racine : élégant, calme, cher ; populaire auprès des expatriés français.',false,'bw','low'),
('Palmier','character',1,'Cité parmi les « centres » de la ville.',false,'gv','low'),
('Palmier','venue_landscape',2,'Cafés et adresses de brunch tendance.',false,'bw','low'),
('Palmier','gaps',3,'Loyer · lieux datés · densité · prix · rythmes.',false,null,'medium'),
('Oasis','character',0,'Quartier résidentiel du sud, arboré, villas fermées et résidences basses ; pas de rue de restaurants, calme le soir.',false,'ch','low'),
('Oasis','audiences',1,'Familles et expatriés, attirés notamment par l''école Ernest-Renan.',false,'ch','low'),
('Oasis','audiences',2,'Navetteurs vers Rabat.',false,'os','low'),
('Oasis','footfall',3,'Gare Casa-Oasis (trains vers Rabat, Marrakech, El Jadida, liaison aéroport), point le plus fréquenté du quartier ; tramway T1 ; Marché solidaire en face de la gare.',false,'ch','low'),
('Oasis','venue_landscape',4,'OLEA, café-restaurant méditerranéen, 7 h–22 h ; La Fabbrica, café-restaurant-pâtisserie.',false,'ch','low'),
('Oasis','signals',5,'Sans rue de restaurants mais avec un flux de gare et des familles : terrain pour un café-boulangerie ou un format de jour de quartier, à vérifier.',true,'ch','low'),
('Oasis','gaps',6,'Loyer · densité · prix.',false,null,'medium'),
('Sidi Maârouf','character',0,'Zone de parcs d''affaires au sud, résidences récentes de milieu de gamme ; quartier de bureaux plus que quartier de vie.',false,'bw','low'),
('Sidi Maârouf','audiences',1,'Salariés de multinationales.',false,'bw','low'),
('Sidi Maârouf','audiences',2,'Casanearshore avait passé 20 000 emplois en 2015 (chiffre ancien, à actualiser).',false,'cnear','low'),
('Sidi Maârouf','footfall',3,'Parcs de bureaux, centres commerciaux.',false,'bw','low'),
('Sidi Maârouf','signals',4,'Clientèle de déjeuner en semaine probable, soirée et week-end faibles.',true,'bw','low'),
('Sidi Maârouf','gaps',5,'Offre existante · emplois actuels · densité · prix · rythmes.',false,null,'medium')
)
insert into brain_district_notes (market_id, section, position, body_fr, inference, source_class, source_name, source_url, source_published_at, observed_at, confidence)
select m.id, x.sec, x.pos, x.body, x.inf, 'published', src.name, src.url, src.pub, '2026-10-30', x.conf from x join brain_markets c on c.country_code='MA' and c.city='Casablanca' and c.district is null join brain_markets m on m.parent_id=c.id and lower(m.district)=lower(x.d) left join src on src.k=x.sk;

-- census venues (dated sources < 18 months)
with src(k,name,url,pub) as (values
('le360','Le360 — Il était une fois le Maârif','https://fr.le360.ma/lifestyle/diapo-un-quartier-une-histoire-il-etait-une-fois-le-maarif-174533/','2018-09-17'::date),
('gv','Generation Voyage — Dans quel quartier loger à Casablanca (guide de voyage, secondaire)','https://generationvoyage.fr/?p=65991','2026-09-14'::date),
('os','Openshores — Vivre à Casablanca (guide d''expatriation, secondaire)','https://www.openshores.co/blog/maroc/casablanca/vivre-a-casablanca-guide-complet','2026-05-11'::date),
('bw','Bewildered in Morocco — Best Neighborhoods to Live in Casablanca (blog de résidente, secondaire)','https://bewilderedinmorocco.com/neighborhoods-live-casablanca/','2026-09-04'::date),
('heerby','Heerby — Nouveaux restaurants Casablanca 2026 (liste générée, fiabilité faible)','https://heerby.ma/fr/blog/nouveaux-restaurants-casablanca-2026','2026-03-20'::date),
('heerbyB','Heerby — Top 7 Bourgogne (liste générée, fiabilité faible)','https://heerby.ma/en/blog/top-7-cafes-bourgogne-casablanca','2026-03-21'::date),
('heerbyC','Heerby — Top 7 Californie (liste générée, fiabilité faible)','https://heerby.ma/fr/blog/top-7-cafes-californie-casablanca','2026-03-21'::date),
('ous','Ousortir — Nouveaux restaurants Casablanca 2026','https://ousortir.ma/en/blog/nouveaux-restaurants-casablanca-2026/','2026-02-15'::date),
('vh','VH — Casablanca à table : les nouvelles adresses','https://www.vh.ma/actualite-news-express-maroc/casablanca-a-table-les-nouvelles-adresses-qui-reveillent-la-ville/','2026-08-13'::date),
('lnt','La Nouvelle Tribune — Monsieur Moutarde ouvre à Gauthier','https://lnt.ma/casablanca-monsieur-moutarde-ouvre-une-nouvelle-brasserie-francaise-a-gauthier/','2026-05-06'::date),
('nouv','Le Nouvelliste — Braise Social Kitchen ouvre à Gauthier','https://www.lenouvelliste.ma/gastronomie-a-casablanca-braise-social-kitchen-ouvre-ses-portes-a-gauthier/','2026-10-15'::date),
('m24plan','Médias24 — Maârif, version finale du plan d''aménagement (titre seul, page illisible)','https://medias24.com/2026/10/27/maarif-ce-qui-a-change-dans-la-version-finale-du-plan-damenagement-1784663/','2026-10-27'::date),
('m24mc1','Médias24 — Marché central, nouvelle phase (titre seul, page illisible)','https://medias24.com/2026/03/14/la-rehabilitation-du-marche-central-de-casablanca-entame-une-nouvelle-phase-1642821/','2026-03-14'::date),
('m24mc2','Médias24 — Marché central, 366 MDH pour lancer les travaux (titre seul, page illisible)','https://medias24.com/2026/05/21/marche-central-de-casablanca-366-millions-de-dh-pour-lancer-les-travaux-de-rehabilitation-1683715/','2026-05-21'::date),
('telquel','TelQuel — Le marché central ne sera finalement pas gastronomique','https://telquel.ma/2019/10/23/le-marche-central-ne-sera-finalement-pas-gastronomique_1654954','2019-10-23'::date),
('hesp','Hespress — Démolitions sur le littoral d''Aïn Diab','https://fr.hespress.com/466627-466627.html','2026-03-21'::date),
('wafir','Wafir — CFC 2026, bilan (cite une étude HCP–CFC Authority de 2025, secondaire)','https://wafir.ma/fr/actu/casablanca-finance-city-cfc-2026-bilan-200-entreprises-statut-fiscal-hub-afrique','2026-05-18'::date),
('cnear','Médias24 — Casanearshore passe 20 000 emplois (chiffre ancien)','https://medias24.com/2015/02/16/casanearshore-a-franchi-le-cap-des-20-000-emplois/','2015-02-16'::date),
('ch','Casablanca Holidays — Oasis (guide, secondaire)','https://www.casablancaholidays.com/areas/oasis','2026-07-03'::date),
('asr','Discover ASR — Citadines Racine Casablanca (site de l''exploitant)','https://www.discoverasr.com/en/citadines/morocco/citadines-racine-casablanca',null::date),
('avito','Avito — annonces de fonds de commerce café-restaurant, Bourgogne (observation)','https://www.avito.ma/','2026-10-30'::date),
('jobsq','Jobsquare — offre de recrutement pour une ouverture au CIL (valable jusqu''au 23 nov. 2026)','https://www.jobsquare.ma/job/22611/commis-de-salle-h-f-ouverture-de-restaurant-cil-casablanca/','2026-10-30'::date)
), x(d,name,vtype,fam,cui,alc,opened,sk,note) as (values
('Maârif','Mila Supper Club','restaurant_casual','restaurant','supper club',null::boolean,null::date,'ous','Source places it alternately in Maârif and Gauthier.'),
('Maârif','Casa Galicia','restaurant_casual','restaurant','ibérique, fruits de mer',null::boolean,null::date,'ous','Source places it alternately in Maârif and Gauthier.'),
('Gauthier','Monsieur Moutarde – Vin & Cuisine','bistro','bistro_wine_bar','brasserie française',true,'2026-05-01'::date,'lnt',null),
('Gauthier','Braise Social Kitchen & Wine Bar','wine_bar','bistro_wine_bar','méditerranéen, cuisine au feu',true,'2026-10-01'::date,'nouv','Opened 16 Oct 2026.'),
('Gauthier','L''Octave','bar_lounge','bar_lounge','bar à cocktails et restaurant',true,null::date,'ous',null),
('Centre-ville','Brasserie Marcel Cerdan','restaurant_casual','restaurant','brasserie française',null::boolean,null::date,'ous',null),
('Casa Finance City','Le Pavillon CFC','restaurant_fine','restaurant','gastronomique',null::boolean,null::date,'vh','Open noon–11 pm.'),
('Aïn Diab','Aïku','restaurant_casual','restaurant','japonais',null::boolean,null::date,'vh','Seafront.'),
('Aïn Diab','L''Aragosta','rooftop','bar_lounge',null,null::boolean,null::date,'vh','Rooftop of the Villa Sahraï.'),
('CIL','Counter 11','restaurant_casual','restaurant','japonais (comptoir)',null::boolean,null::date,'vh','Booking essential.'),
('CIL','La Crêperie du CIL','cafe_brunch','cafe_brunch','crêperie',null::boolean,null::date,'vh',null),
('Oasis','OLEA','cafe_brunch','cafe_brunch','méditerranéen',null::boolean,null::date,'ch','Open 7 am–10 pm.'),
('Oasis','La Fabbrica','cafe_brunch','cafe_brunch','café-restaurant-pâtisserie',null::boolean,null::date,'ch',null)
)
insert into brain_venues (market_id, name, venue_type, family, cuisine, alcohol, opened_on, venue_status, source_class, source_name, source_url, source_published_at, observed_at, note)
select m.id, x.name, x.vtype, x.fam, x.cui, x.alc, x.opened, 'open', 'published', src.name, src.url, src.pub, '2026-10-30', x.note from x join brain_markets c on c.country_code='MA' and c.city='Casablanca' and c.district is null join brain_markets m on m.parent_id=c.id and lower(m.district)=lower(x.d) join src on src.k=x.sk;
