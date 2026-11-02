-- Concept catalogue (K3), lot 2b (researched 2 Nov 2026): grill et viande, poissons et fruits de mer, tapas ibériques,
-- salon de thé et pâtisserie, sandwich et shawarma premium, rooftop / lounge, dark kitchen. Method as lot 1. Status: researched.
-- Sources shared by several sheets are declared once in a temporary table.
begin;
create temporary table s(k text primary key, name text, url text, pub date, country text) on commit drop;
insert into s values
 ('yb',$q$Yonder — Beefbar ouvre à l'hôtel Barrière Le Naoura, Marrakech (Delphine Cooreman)$q$,'https://www.yonder.fr/news/restaurants/beefbar-hotel-barriere-naoura-marrakech','2026-09-22','MA'),
 ('fit',$q$Forbes Italia — Casablanca si candida a capitale gastronomica del Nordafrica (Federico Silvio Bellanca)$q$,'https://forbes.it/2026/09/25/casablanca-si-candida-a-capitale-gastronomica-del-nordafrica','2026-09-25','MA'),
 ('tqp',$q$TelQuel — Nouveau port de pêche de Casablanca : un levier stratégique$q$,'https://telquel.ma/instant-t/2025/09/19/nouveau-port-de-peche-de-casablanca-un-levier-strategique-pour-promouvoir-le-secteur-de-la-peche_1951490/','2025-09-19','MA'),
 ('ous',$q$Ousortir — Nouveaux restaurants Casablanca 2026$q$,'https://ousortir.ma/en/blog/nouveaux-restaurants-casablanca-2026/','2026-02-15','MA'),
 ('hesp',$q$Hespress — Démolitions sur le littoral d'Aïn Diab$q$,'https://fr.hespress.com/466627-466627.html','2026-03-21','MA'),
 ('vh',$q$VH — Casablanca à table : les nouvelles adresses qui réveillent la ville$q$,'https://www.vh.ma/actualite-news-express-maroc/casablanca-a-table-les-nouvelles-adresses-qui-reveillent-la-ville/','2026-08-13','MA'),
 ('bl',$q$Le Matin — Bliss Rooftop lance un nouveau rendez-vous brunch le week-end$q$,'https://lematin.ma/lifestyle/bliss-rooftop-lance-un-nouveau-rendez-vous-brunch-le-week-end/367913','2026-09-30','MA'),
 ('jdp',$q$Journal des Palaces — Cédric Grolet Monte-Carlo : la boutique et le salon de thé ont ouvert$q$,'https://www.journaldespalaces.com/communique-75502-Monaco-Gastronomie-Cedric-Grolet-Monte-Carlo-la-boutique-et-le-salon-de-the-ont-ouvert-leurs-portes-a-l-Hotel-de-Paris-Monte-Carlo.html','2025-08-05','MC'),
 ('l360p',$q$Le360 — Casablanca : engouement général pour les pâtisseries en cette fin d'année (source ancienne, 2023)$q$,'https://fr.le360.ma/societe/casablanca-engouement-general-pour-les-patisseries-en-cette-fin-dannee_6XJF64YSTZFPDOSV57XSF7VMWQ/','2023-12-30','MA'),
 ('mwn2',$q$Morocco World News — McDonald's opens 80th outlet at Casablanca airport as Bacha Coffee expands in Marrakech$q$,'https://www.moroccoworldnews.com/2025/12/272295/mcdonalds-opens-80th-outlet-at-casablanca-airport-as-bacha-coffee-expands-in-marrakech/','2025-12-18','MA'),
 ('cn',$q$Consonews — Dark kitchens au Maroc : la restauration sans salle qui change les habitudes (chiffres attribués au « Food Industry Monitor Maroc », non vérifiés)$q$,'https://consonews.ma/news/food-boissons/dark-kitchens-au-maroc-la-restauration-sans-salle-qui-change-les-habitudes','2025-10-21','MA'),
 ('wc',$q$Worldcrunch — Ghost kitchens are coming to Europe, why they might not last (article non daté)$q$,'https://worldcrunch.com/food-travel/ghost-kitchens-europe/',null,'EU'),
 ('osm',$q$OpenStreetMap via Overpass, relevé du 1 nov. 2026 (Maârif et Gauthier, cercles de 650 m)$q$,'https://www.openstreetmap.org/copyright','2026-11-01','MA');

create temporary table x(slug text, block text, pos int, body text, inf boolean, sk text, conf text) on commit drop;
insert into x values
 -- GRILL ET VIANDE
 ('grill-viande','promise',0,$q$Viandes d'exception, grill et street food raffinée : promesse de Beefbar à Marrakech.$q$,false,'yb','medium'),
 ('grill-viande','economics',0,$q$Viandes importées haut de gamme (Kobe, Wagyu, Black Angus) à côté de viandes locales : le coût matière est le levier principal. Les chiffres viennent de la famille restaurant du moteur.$q$,true,'yb','low'),
 ('grill-viande','operations',0,$q$Grill, maturation et chambre froide : extraction puissante et chaîne du froid à prévoir.$q$,true,null,'low'),
 ('grill-viande','success',0,$q$Une marque internationale de grill s'implante au Maroc : Beefbar (plus de 40 adresses dans le monde) ouvre à Marrakech en mai 2026, avec un décor mêlant codes des palais et style de la marque.$q$,false,'yb','medium'),
 ('grill-viande','pitfalls',0,$q$Le haut de gamme viande est occupé par des marques d'hôtel ; un indépendant doit se placer sur le prix ou sur la viande locale.$q$,true,'yb','low'),
 ('grill-viande','profile_fit',0,$q$Exige un fournisseur de viande fiable et un chef grillardin ; envisageable pour un investisseur en franchise.$q$,true,null,'low'),
 ('grill-viande','district_types',0,$q$Archétypes A (déjeuner d'affaires) et C : lecture déduite.$q$,true,null,'low'),
 ('grill-viande','regulatory',0,$q$Viande halal et traçabilité des viandes importées ; extraction et sécurité incendie.$q$,true,null,'low'),
 ('grill-viande','gaps',0,$q$Aucun grill ou steakhouse de Casablanca trouvé avec une source datée ; aucun cas d'échec ; aucun prix.$q$,false,null,'medium'),
 -- POISSONS ET FRUITS DE MER
 ('poissons-fruits-de-mer','promise',0,$q$Produits de l'Atlantique mis en avant par les grandes tables de Casablanca (huîtres d'Oualidia, homards de Mohammedia).$q$,false,'fit','medium'),
 ('poissons-fruits-de-mer','economics',0,$q$Coût matière élevé et variable selon la pêche ; prix au poids ou au marché. Les chiffres viennent de la famille restaurant du moteur.$q$,true,null,'low'),
 ('poissons-fruits-de-mer','operations',0,$q$Le nouveau port de pêche de Casablanca (inauguré en septembre 2025) a une halle au poisson de nouvelle génération et doit approvisionner le marché local en produits de qualité.$q$,false,'tqp','medium'),
 ('poissons-fruits-de-mer','operations',1,$q$Achat quotidien, vitrine froide et chaîne du froid : compétence d'acheteur indispensable.$q$,true,null,'low'),
 ('poissons-fruits-de-mer','success',0,$q$Kyúb (Four Seasons, Aïn Diab) : cuisine côtière marocaine avec techniques latino-américaines, signe d'une montée en gamme du poisson.$q$,false,'fit','medium'),
 ('poissons-fruits-de-mer','pitfalls',0,$q$Sur le front de mer d'Aïn Diab, des constructions illicites ont été démolies en 2026 : le statut juridique du local et de sa terrasse est à vérifier.$q$,false,'hesp','medium'),
 ('poissons-fruits-de-mer','profile_fit',0,$q$Exige un acheteur et un chef du poisson ; risque de perte élevé pour un porteur sans expérience.$q$,true,null,'low'),
 ('poissons-fruits-de-mer','district_types',0,$q$Archétype D (front de mer) et C : lecture déduite.$q$,true,null,'low'),
 ('poissons-fruits-de-mer','casablanca',0,$q$Casa Galicia, cuisine ibérique et fruits de mer, ouverture 2026 (Maârif selon la source, parfois placée à Gauthier).$q$,false,'ous','medium'),
 ('poissons-fruits-de-mer','regulatory',0,$q$Domaine public maritime pour un lieu en bord de mer ; hygiène des produits de la mer.$q$,true,'hesp','low'),
 ('poissons-fruits-de-mer','gaps',0,$q$Aucun prix daté ; aucun cas d'échec ; aucune donnée sur les prix de gros au nouveau port.$q$,false,null,'medium'),
 -- TAPAS IBÉRIQUES
 ('tapas-iberiques','promise',0,$q$Petites assiettes à partager, souvent avec vin ou bière : repas de groupe et sortie du soir.$q$,true,null,'low'),
 ('tapas-iberiques','economics',0,$q$Ticket fait de plusieurs petites assiettes ; part de boisson importante si alcool. Les chiffres viennent de la famille restaurant du moteur.$q$,true,null,'low'),
 ('tapas-iberiques','operations',0,$q$Charcuterie ibérique importée, conserves et produits de la mer : approvisionnement à organiser ; produits de porc exclus d'une partie de la clientèle.$q$,true,null,'low'),
 ('tapas-iberiques','profile_fit',0,$q$Accessible avec un chef de cuisine espagnole ; dépend de la licence d'alcool pour une bonne part du modèle.$q$,true,null,'low'),
 ('tapas-iberiques','district_types',0,$q$Archétype C (sortie du soir) : lecture déduite.$q$,true,null,'low'),
 ('tapas-iberiques','casablanca',0,$q$Casa Galicia, cuisine ibérique et fruits de mer, ouverture 2026.$q$,false,'ous','medium'),
 ('tapas-iberiques','regulatory',0,$q$Licence d'alcool ; importation de charcuterie (porc) : règles douanières et sanitaires à vérifier.$q$,true,null,'low'),
 ('tapas-iberiques','gaps',0,$q$Fiche mince : aucun exemple étranger récent retenu, aucun cas d'échec, aucun prix à Casablanca.$q$,false,null,'medium'),
 -- SALON DE THÉ ET PÂTISSERIE
 ('salon-de-the-patisserie','promise',0,$q$Salon de thé ouvert dès le petit-déjeuner, goûter et vente à emporter (Cédric Grolet, Monte-Carlo : 200 m², boutique et salon).$q$,false,'jdp','medium'),
 ('salon-de-the-patisserie','economics',0,$q$Ventes très saisonnières : forte demande de gâteaux, coffrets et plateaux de gâteaux marocains en fin d'année et pour les visites familiales.$q$,false,'l360p','low'),
 ('salon-de-the-patisserie','operations',0,$q$Compétence clé : un chef pâtissier ; laboratoire et vitrines réfrigérées.$q$,true,null,'low'),
 ('salon-de-the-patisserie','success',0,$q$Les signatures d'un chef (fruits sculptés de Grolet) portent la marque et se déclinent en boutique.$q$,false,'jdp','medium'),
 ('salon-de-the-patisserie','success',1,$q$Bacha Coffee, maison de café de luxe née à Marrakech, ouvre à l'aéroport de Marrakech : un concept de salon à identité marocaine s'exporte.$q$,false,'mwn2','medium'),
 ('salon-de-the-patisserie','pitfalls',0,$q$Concurrence des chaînes de boulangerie-pâtisserie (voir la fiche boulangerie-café) ; gaspillage des produits frais.$q$,true,null,'low'),
 ('salon-de-the-patisserie','profile_fit',0,$q$Exige un pâtissier ; adapté à un porteur qui en est un ou s'associe avec un.$q$,true,null,'low'),
 ('salon-de-the-patisserie','district_types',0,$q$Archétype B (résidentiel aisé) : lecture déduite.$q$,true,null,'low'),
 ('salon-de-the-patisserie','gaps',0,$q$Aucun salon de thé de Casablanca trouvé avec une source datée récente ; la source sur la saisonnalité date de 2023.$q$,false,null,'medium'),
 -- SANDWICH ET SHAWARMA PREMIUM
 ('sandwich-shawarma-premium','promise',0,$q$Repas rapide du midi et du soir, en livraison et à emporter.$q$,true,null,'low'),
 ('sandwich-shawarma-premium','economics',0,$q$Des marques de shawarma existent aussi comme marques virtuelles de dark kitchen (Mr. Shawarma partageant une cuisine avec d'autres marques).$q$,false,'cn','low'),
 ('sandwich-shawarma-premium','operations',0,$q$Broche et grill : extraction ; régularité de la viande et des sauces.$q$,true,null,'low'),
 ('sandwich-shawarma-premium','pitfalls',0,$q$Format très présent en vente rapide : la différence doit venir du produit et de la marque.$q$,true,'osm','low'),
 ('sandwich-shawarma-premium','profile_fit',0,$q$Accessible pour un porteur sans expérience avec une recette solide ; adapté à la franchise.$q$,true,null,'low'),
 ('sandwich-shawarma-premium','district_types',0,$q$Archétypes A (déjeuner de bureau), C et E : lecture déduite.$q$,true,null,'low'),
 ('sandwich-shawarma-premium','casablanca',0,$q$OpenStreetMap compte 23 lieux de vente rapide au Maârif et 13 à Gauthier, tous types confondus.$q$,false,'osm','medium'),
 ('sandwich-shawarma-premium','gaps',0,$q$Fiche mince : aucun shawarma premium de Casablanca trouvé avec une source datée ; aucun exemple étranger récent ; aucun cas d'échec.$q$,false,null,'medium'),
 -- ROOFTOP / LOUNGE
 ('rooftop-lounge','promise',0,$q$Vue et ambiance : Bliss Rooftop (Radisson Gauthier) combine déjeuner de semaine, afterwork et brunch du week-end.$q$,false,'bl','medium'),
 ('rooftop-lounge','economics',0,$q$Part de boisson élevée si licence d'alcool ; activité sensible à la météo et à la saison. Les chiffres viennent de la famille bar / lounge du moteur.$q$,true,null,'low'),
 ('rooftop-lounge','operations',0,$q$Accès à un toit : accord du propriétaire et de la copropriété, sécurité, charge du toit, nuisances sonores.$q$,true,null,'low'),
 ('rooftop-lounge','success',0,$q$Les rooftops récents de Casablanca sont adossés à un hôtel ou une villa (Bliss au Radisson, L'Aragosta à la Villa Sahraï).$q$,false,'vh','medium'),
 ('rooftop-lounge','pitfalls',0,$q$Sur le littoral d'Aïn Diab, les démolitions de 2026 visent des constructions illicites : tout aménagement en hauteur ou en terrasse doit être régulier.$q$,false,'hesp','medium'),
 ('rooftop-lounge','profile_fit',0,$q$Difficile hors hôtel : dépend de l'accès à un toit et d'une licence ; plutôt pour un investisseur propriétaire.$q$,true,null,'low'),
 ('rooftop-lounge','district_types',0,$q$Archétypes C et D : lecture déduite.$q$,true,null,'low'),
 ('rooftop-lounge','casablanca',0,$q$L'Aragosta, rooftop de la Villa Sahraï, Aïn Diab.$q$,false,'vh','medium'),
 ('rooftop-lounge','regulatory',0,$q$Urbanisme et sécurité (toit), licence d'alcool, domaine public maritime en front de mer.$q$,true,'hesp','low'),
 ('rooftop-lounge','gaps',0,$q$Aucun prix daté ; aucun cas d'échec trouvé.$q$,false,null,'medium'),
 -- DARK KITCHEN
 ('dark-kitchen','promise',0,$q$Cuisine sans salle, commandes uniquement par applications ; plusieurs marques virtuelles dans une même cuisine.$q$,false,'cn','medium'),
 ('dark-kitchen','economics',0,$q$Commissions des plateformes jusqu'à 30 %, critiquées par les restaurateurs.$q$,false,'cn','medium'),
 ('dark-kitchen','economics',1,$q$Plus de 40 % des nouveaux projets de restauration lancés depuis 2024 utiliseraient ce format et 60 % des commandes urbaines passeraient par une application (chiffres d'une source secondaire, non vérifiés).$q$,false,'cn','low'),
 ('dark-kitchen','operations',0,$q$Les plateformes (Glovo, Jumia Food) suivent les plats demandés et les zones actives ; les exploitants adaptent vite leur carte.$q$,false,'cn','medium'),
 ('dark-kitchen','pitfalls',0,$q$En Europe : commissions qui montent une fois l'exploitant installé, perte de la relation client, faible attrait chez les plus jeunes ; Barcelone a interdit les dark kitchens.$q$,false,'wc','low'),
 ('dark-kitchen','profile_fit',0,$q$Investissement réduit sans salle, mais marge dépendante des plateformes : à comparer avec une vente à emporter avec comptoir.$q$,true,null,'low'),
 ('dark-kitchen','district_types',0,$q$Le choix suit les zones de livraison des plateformes plus que les quartiers : lecture déduite.$q$,true,null,'low'),
 ('dark-kitchen','regulatory',0,$q$Statut entre restaurant et traiteur, cadre juridique flou ; l'ONSSA prévoit un registre numérique des cuisines partagées en 2026.$q$,false,'cn','medium'),
 ('dark-kitchen','gaps',0,$q$Aucun coût d'installation ni cas d'échec marocain ; chiffres d'adoption non vérifiés ; format hors moteur (pas de places).$q$,false,null,'medium');

update public.brain_concept_formats f set status='researched', definition_fr=d.def from (values
 ('grill-viande',$q$Restaurant centré sur la viande grillée (pièces de boucherie, maturation, grill), du grill populaire au steakhouse haut de gamme.$q$),
 ('poissons-fruits-de-mer',$q$Restaurant de poisson et de fruits de mer, souvent au poids ou selon la pêche du jour, fréquent en bord de mer.$q$),
 ('tapas-iberiques',$q$Restaurant de petites assiettes espagnoles à partager (tapas, raciones), avec produits ibériques et souvent vin.$q$),
 ('salon-de-the-patisserie',$q$Pâtisserie de chef avec salon de thé : gâteaux, viennoiseries, thé et café sur place, vente à emporter.$q$),
 ('sandwich-shawarma-premium',$q$Vente rapide de sandwichs ou de shawarma, avec un positionnement produit plus haut que la moyenne (pain, viande, sauces maison).$q$),
 ('rooftop-lounge',$q$Bar ou lounge sur un toit-terrasse, avec vue, cocktails et souvent petite restauration ; fréquent dans les hôtels.$q$),
 ('dark-kitchen',$q$Cuisine sans salle qui vend uniquement en livraison par applications, souvent avec plusieurs marques virtuelles.$q$)
) d(slug,def) where f.slug=d.slug;

insert into public.brain_concept_lines (format_id, block, position, body_fr, inference, source_class, source_name, source_url, source_published_at, source_country, confidence)
select f.id, x.block, x.pos, x.body, x.inf, 'published', s.name, s.url, s.pub, s.country, x.conf
from x join public.brain_concept_formats f on f.slug=x.slug left join s on s.k=x.sk;

insert into public.brain_concept_examples (format_id, venue_name, city, country, opened_text, what_fr, proof_fr, source_name, source_url, source_published_at)
select f.id, v.venue, v.city, v.country, v.opened, v.what, v.proof, s.name, s.url, s.pub
from (values
 ('grill-viande','Beefbar (hôtel Barrière Le Naoura)','Marrakech','MA','mai 2026',$q$Viandes d'exception, grill et street food raffinée.$q$,$q$Marque de plus de 40 adresses dans le monde.$q$,'yb'),
 ('poissons-fruits-de-mer','Kyúb (Four Seasons)','Casablanca','MA','non indiqué',$q$Cuisine côtière marocaine, techniques latino-américaines.$q$,null,'fit'),
 ('poissons-fruits-de-mer','Casa Galicia','Casablanca','MA','2026',$q$Cuisine ibérique et fruits de mer.$q$,null,'ous'),
 ('tapas-iberiques','Casa Galicia','Casablanca','MA','2026',$q$Cuisine ibérique et fruits de mer.$q$,null,'ous'),
 ('salon-de-the-patisserie','Cédric Grolet Monte-Carlo','Monaco','MC','juillet 2025',$q$Boutique et salon de thé de 200 m², ouverts dès le petit-déjeuner.$q$,$q$Le chef a aussi des adresses à Saint-Tropez, Londres et Singapour.$q$,'jdp'),
 ('salon-de-the-patisserie','Bacha Coffee (aéroport)','Marrakech','MA','décembre 2025',$q$Maison de café de luxe née à Marrakech en 1910.$q$,null,'mwn2'),
 ('rooftop-lounge','Bliss Rooftop (Radisson)','Casablanca','MA','non indiqué',$q$Rooftop d'hôtel à Gauthier : déjeuner, afterwork, brunch.$q$,null,'bl'),
 ('rooftop-lounge','L''Aragosta (Villa Sahraï)','Casablanca','MA','non indiqué',$q$Rooftop à Aïn Diab.$q$,null,'vh')
) v(slug,venue,city,country,opened,what,proof,sk)
join public.brain_concept_formats f on f.slug=v.slug join s on s.k=v.sk;
commit;
