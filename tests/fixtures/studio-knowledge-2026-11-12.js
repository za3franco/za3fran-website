/* Concept Studio knowledge — snapshot of the LIVE Brain read in Supabase on 12 Nov 2026 (lot 1), in the shape
 * lib/studio-brain.js buildKnowledge() returns. Real research rows, all *researched* (traits and district types are
 * deductions until Arnaud's review); one pitfall and one gap line per format (the first by position), examples
 * reduced to their count and top two. No range (A9) is filled yet: ranges are {}. Venue -> format by the examples
 * that name the venue (same rule as matchVenueFormats). Do not edit by hand: re-read the Brain and regenerate. */
'use strict';
module.exports = {
 "version": "sb-1.0.0",
 "as_of": "2026-11-12",
 "city": "Casablanca",
 "ids": {
  "country": "6e6218db-0e40-4fc9-9528-30465935d145",
  "city": "746b3105-984f-448f-a886-db4d725e31bc"
 },
 "city_rent": {
  "m2": 140,
  "low": 95.05,
  "high": 186.97,
  "source": "Casablanca median (published)",
  "observed_at": "2026-10-03",
  "status": "researched"
 },
 "formats": [
  {
   "slug": "bar-a-cocktails",
   "name_fr": "Bar à cocktails",
   "name_en": "Cocktail bar",
   "family": "bar_lounge",
   "seat_based": true,
   "priority": 1,
   "traits": {
    "archetypes": [
     "C"
    ],
    "key_skill": "bar",
    "beginner_difficulty": "high",
    "investor_needs_operator": "yes",
    "extraction": "no",
    "alcohol": "core",
    "services": [
     "dinner"
    ],
    "thin_sheet": false,
    "proposable": true,
    "regulatory_flag": "watch"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "Au Royaume-Uni, la consommation d'alcool est au plus bas depuis 1990 (10,2 verres par semaine), un pub a fermé chaque jour en 2025 et 61 % des sondés sortent moins."
    }
   ],
   "gaps": [
    {
     "text": "Aucune source fiable et récente sur la procédure de licence d'alcool à Casablanca (presse ancienne seulement)."
    }
   ],
   "regulatory": [],
   "casa_lines": 3,
   "examples": {
    "total": 5,
    "casa_recent": 1,
    "top": [
     {
      "name": "L'Octave",
      "city": "Casablanca",
      "country": "MA",
      "date": "2026-02-15"
     },
     {
      "name": "Gare aux Gorilles",
      "city": "Casablanca",
      "country": "MA",
      "date": null
     }
    ]
   }
  },
  {
   "slug": "bar-a-vin",
   "name_fr": "Bar à vin",
   "name_en": "Wine bar",
   "family": "bistro_wine_bar",
   "seat_based": true,
   "priority": 1,
   "traits": {
    "archetypes": [
     "C"
    ],
    "key_skill": "bar",
    "beginner_difficulty": "high",
    "investor_needs_operator": "yes",
    "extraction": "desirable",
    "alcohol": "core",
    "services": [
     "dinner"
    ],
    "thin_sheet": false,
    "proposable": true,
    "regulatory_flag": "watch"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "Concurrence : la restauration est un espace très concurrentiel, une des raisons citées d'ouvrir un bar plutôt qu'un restaurant."
    }
   ],
   "gaps": [
    {
     "text": "Aucune carte ni gamme de prix datée pour Braise ou Monsieur Moutarde."
    }
   ],
   "regulatory": [],
   "casa_lines": 3,
   "examples": {
    "total": 6,
    "casa_recent": 0,
    "top": [
     {
      "name": "Silène",
      "city": "Hong Kong",
      "country": "HK",
      "date": "2025-11-27"
     },
     {
      "name": "Crushed Wines",
      "city": "Hong Kong",
      "country": "HK",
      "date": "2025-11-27"
     }
    ]
   }
  },
  {
   "slug": "bistro-brasserie",
   "name_fr": "Bistro-brasserie",
   "name_en": "Bistro-brasserie",
   "family": "bistro_wine_bar",
   "seat_based": true,
   "priority": 1,
   "traits": {
    "archetypes": [
     "C",
     "A"
    ],
    "key_skill": "kitchen",
    "beginner_difficulty": "high",
    "investor_needs_operator": "yes",
    "extraction": "required",
    "alcohol": "possible",
    "services": [
     "lunch",
     "dinner"
    ],
    "thin_sheet": false,
    "proposable": true,
    "regulatory_flag": "watch"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "À Paris, deux brasseries de la même vague (Brasserie des Arts, L'Atelier d'André) ont connu des résultats mitigés."
    }
   ],
   "gaps": [
    {
     "text": "Aucune carte datée pour les brasseries de Casablanca."
    }
   ],
   "regulatory": [],
   "casa_lines": 5,
   "examples": {
    "total": 5,
    "casa_recent": 3,
    "top": [
     {
      "name": "Monsieur Moutarde – Vin & Cuisine",
      "city": "Casablanca",
      "country": "MA",
      "date": "2026-05-06"
     },
     {
      "name": "Brasserie Marcel Cerdan",
      "city": "Casablanca",
      "country": "MA",
      "date": "2026-02-15"
     }
    ]
   }
  },
  {
   "slug": "boulangerie-patisserie-cafe",
   "name_fr": "Boulangerie-pâtisserie-café",
   "name_en": "Bakery-pastry café",
   "family": "cafe_brunch",
   "seat_based": true,
   "priority": 1,
   "traits": {
    "archetypes": [
     "B",
     "E"
    ],
    "key_skill": "kitchen",
    "beginner_difficulty": "high",
    "investor_needs_operator": "yes",
    "extraction": "desirable",
    "alcohol": "no",
    "services": [
     "breakfast",
     "lunch"
    ],
    "thin_sheet": false,
    "proposable": true,
    "regulatory_flag": "none"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "Concurrence d'enseignes installées (Paul, Le Pain Quotidien) : un indépendant doit se distinguer par le produit."
    }
   ],
   "gaps": [
    {
     "text": "Le relevé OpenStreetMap n'a pas compté les boulangeries (seulement restaurants, cafés, vente rapide, bars, glaciers) : aucune densité pour ce format."
    }
   ],
   "regulatory": [],
   "casa_lines": 3,
   "examples": {
    "total": 3,
    "casa_recent": 0,
    "top": [
     {
      "name": "Paul Maroc",
      "city": "Casablanca et six autres villes",
      "country": "MA",
      "date": "2024-09-25"
     },
     {
      "name": "Levaduramadre",
      "city": "Madrid et Espagne",
      "country": "ES",
      "date": "2026-08-10"
     }
    ]
   }
  },
  {
   "slug": "cafe-de-specialite",
   "name_fr": "Café de spécialité",
   "name_en": "Specialty coffee",
   "family": "cafe_brunch",
   "seat_based": true,
   "priority": 1,
   "traits": {
    "archetypes": [
     "B",
     "A"
    ],
    "key_skill": "floor",
    "beginner_difficulty": "low",
    "investor_needs_operator": "yes",
    "extraction": "no",
    "alcohol": "no",
    "services": [
     "breakfast",
     "lunch"
    ],
    "thin_sheet": false,
    "proposable": true,
    "regulatory_flag": "none"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "Buenos Aires compte environ 150 cafés de spécialité ; des exploitants y annoncent un écrémage où seuls les meilleurs resteront."
    }
   ],
   "gaps": [
    {
     "text": "Aucune carte de prix datée d'un café de spécialité à Casablanca."
    }
   ],
   "regulatory": [],
   "casa_lines": 4,
   "examples": {
    "total": 6,
    "casa_recent": 0,
    "top": [
     {
      "name": "HeiBai Specialty Coffee",
      "city": "Marrakech",
      "country": "MA",
      "date": "2026-09-10"
     },
     {
      "name": "Gless Coffee",
      "city": "Marrakech",
      "country": "MA",
      "date": "2026-09-10"
     }
    ]
   }
  },
  {
   "slug": "comptoir-japonais-sushi",
   "name_fr": "Comptoir japonais / sushi",
   "name_en": "Japanese counter / sushi",
   "family": "restaurant",
   "seat_based": true,
   "priority": 1,
   "traits": {
    "archetypes": [
     "B",
     "C",
     "D"
    ],
    "key_skill": "kitchen",
    "beginner_difficulty": "very_high",
    "investor_needs_operator": "yes",
    "extraction": "no",
    "alcohol": "possible",
    "services": [
     "lunch",
     "dinner"
    ],
    "thin_sheet": false,
    "proposable": true,
    "regulatory_flag": "none"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "Planta (États-Unis, sushi sans poisson) : 12 ouvertures en trois ans, puis faillite en mai 2025 et liquidation en mars 2026 ; le fondateur cite l'inefficacité et la dépendance à des capitaux rapides."
    }
   ],
   "gaps": [
    {
     "text": "Aucune carte datée ni prix pour les comptoirs japonais de Casablanca ; aucune source sur le coût du poisson."
    }
   ],
   "regulatory": [],
   "casa_lines": 3,
   "examples": {
    "total": 7,
    "casa_recent": 3,
    "top": [
     {
      "name": "Aïku",
      "city": "Casablanca",
      "country": "MA",
      "date": "2026-08-13"
     },
     {
      "name": "Counter 11",
      "city": "Casablanca",
      "country": "MA",
      "date": "2026-08-13"
     }
    ]
   }
  },
  {
   "slug": "burger",
   "name_fr": "Burger",
   "name_en": "Burger",
   "family": "fast_casual",
   "seat_based": true,
   "priority": 2,
   "traits": {
    "archetypes": [
     "C",
     "E"
    ],
    "key_skill": "management",
    "beginner_difficulty": "medium",
    "investor_needs_operator": "franchise_ok",
    "extraction": "required",
    "alcohol": "no",
    "services": [
     "lunch",
     "dinner"
    ],
    "thin_sheet": false,
    "proposable": true,
    "regulatory_flag": "none"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "Goiko (burger gourmet, Espagne) : pertes de plus de 36 M€ en 2025 et chiffre d'affaires en baisse de 11 %."
    }
   ],
   "gaps": [
    {
     "text": "Aucun burger gourmet indépendant de Casablanca trouvé avec une source datée ; aucun prix daté."
    }
   ],
   "regulatory": [],
   "casa_lines": 2,
   "examples": {
    "total": 3,
    "casa_recent": 0,
    "top": [
     {
      "name": "BiG M",
      "city": "Tanger",
      "country": "MA",
      "date": "2026-03-11"
     },
     {
      "name": "Burger King Maroc",
      "city": "Casablanca et grandes villes",
      "country": "MA",
      "date": "2025-02-22"
     }
    ]
   }
  },
  {
   "slug": "cafe-resto-brunch",
   "name_fr": "Café-resto / brunch",
   "name_en": "Café-restaurant / brunch",
   "family": "cafe_brunch",
   "seat_based": true,
   "priority": 2,
   "traits": {
    "archetypes": [
     "B",
     "E"
    ],
    "key_skill": "kitchen",
    "beginner_difficulty": "low",
    "extraction": "desirable",
    "alcohol": "possible",
    "services": [
     "breakfast",
     "lunch"
    ],
    "thin_sheet": false,
    "proposable": true,
    "regulatory_flag": "none"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "Demande concentrée sur le week-end ; concurrence des brunchs d'hôtels."
    }
   ],
   "gaps": [
    {
     "text": "Aucun prix daté d'un café-resto indépendant ; aucun cas d'échec trouvé."
    }
   ],
   "regulatory": [],
   "casa_lines": 2,
   "examples": {
    "total": 2,
    "casa_recent": 2,
    "top": [
     {
      "name": "Bliss Rooftop",
      "city": "Casablanca",
      "country": "MA",
      "date": "2026-09-30"
     },
     {
      "name": "OLEA",
      "city": "Casablanca",
      "country": "MA",
      "date": "2026-07-03"
     }
    ]
   }
  },
  {
   "slug": "dark-kitchen",
   "name_fr": "Dark kitchen",
   "name_en": "Dark kitchen",
   "family": null,
   "seat_based": false,
   "priority": 2,
   "traits": {
    "archetypes": [],
    "key_skill": "management",
    "beginner_difficulty": "medium",
    "extraction": "required",
    "alcohol": "no",
    "services": [
     "lunch",
     "dinner"
    ],
    "thin_sheet": false,
    "proposable": true,
    "regulatory_flag": "watch"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "En Europe : commissions qui montent une fois l'exploitant installé, perte de la relation client, faible attrait chez les plus jeunes ; Barcelone a interdit les dark kitchens."
    }
   ],
   "gaps": [
    {
     "text": "Aucun coût d'installation ni cas d'échec marocain ; chiffres d'adoption non vérifiés ; format hors moteur (pas de places)."
    }
   ],
   "regulatory": [],
   "casa_lines": 0,
   "examples": {
    "total": 0,
    "casa_recent": 0,
    "top": []
   }
  },
  {
   "slug": "grill-viande",
   "name_fr": "Grill / viande",
   "name_en": "Grill / steakhouse",
   "family": "restaurant",
   "seat_based": true,
   "priority": 2,
   "traits": {
    "archetypes": [
     "A",
     "C"
    ],
    "key_skill": "kitchen",
    "beginner_difficulty": "high",
    "investor_needs_operator": "franchise_ok",
    "extraction": "required",
    "alcohol": "possible",
    "services": [
     "lunch",
     "dinner"
    ],
    "thin_sheet": false,
    "proposable": true,
    "regulatory_flag": "none"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "Le haut de gamme viande est occupé par des marques d'hôtel ; un indépendant doit se placer sur le prix ou sur la viande locale."
    }
   ],
   "gaps": [
    {
     "text": "Aucun grill ou steakhouse de Casablanca trouvé avec une source datée ; aucun cas d'échec ; aucun prix."
    }
   ],
   "regulatory": [],
   "casa_lines": 0,
   "examples": {
    "total": 1,
    "casa_recent": 0,
    "top": [
     {
      "name": "Beefbar (hôtel Barrière Le Naoura)",
      "city": "Marrakech",
      "country": "MA",
      "date": "2026-09-22"
     }
    ]
   }
  },
  {
   "slug": "libanais-mediterraneen",
   "name_fr": "Libanais / méditerranéen",
   "name_en": "Lebanese / Mediterranean",
   "family": "restaurant",
   "seat_based": true,
   "priority": 2,
   "traits": {
    "archetypes": [
     "B",
     "C"
    ],
    "key_skill": "kitchen",
    "beginner_difficulty": "medium",
    "extraction": "desirable",
    "alcohol": "possible",
    "services": [
     "lunch",
     "dinner"
    ],
    "thin_sheet": true,
    "proposable": true,
    "regulatory_flag": "watch"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [],
   "gaps": [
    {
     "text": "Aucun restaurant libanais de Casablanca trouvé avec une source datée ; aucun cas d'échec trouvé ; fiche à compléter."
    }
   ],
   "regulatory": [],
   "casa_lines": 1,
   "examples": {
    "total": 2,
    "casa_recent": 0,
    "top": [
     {
      "name": "Em Sherif",
      "city": "Paris",
      "country": "FR",
      "date": "2024-12-13"
     },
     {
      "name": "Em Sherif Sea Café",
      "city": "Bahreïn",
      "country": "BH",
      "date": "2022-05-18"
     }
    ]
   }
  },
  {
   "slug": "poissons-fruits-de-mer",
   "name_fr": "Poissons et fruits de mer",
   "name_en": "Fish and seafood",
   "family": "restaurant",
   "seat_based": true,
   "priority": 2,
   "traits": {
    "archetypes": [
     "D",
     "C"
    ],
    "key_skill": "kitchen",
    "beginner_difficulty": "very_high",
    "investor_needs_operator": "yes",
    "extraction": "desirable",
    "alcohol": "possible",
    "services": [
     "lunch",
     "dinner"
    ],
    "thin_sheet": false,
    "proposable": true,
    "regulatory_flag": "watch"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "Sur le front de mer d'Aïn Diab, des constructions illicites ont été démolies en 2026 : le statut juridique du local et de sa terrasse est à vérifier."
    }
   ],
   "gaps": [
    {
     "text": "Aucun prix daté ; aucun cas d'échec ; aucune donnée sur les prix de gros au nouveau port."
    }
   ],
   "regulatory": [],
   "casa_lines": 1,
   "examples": {
    "total": 2,
    "casa_recent": 2,
    "top": [
     {
      "name": "Kyúb (Four Seasons)",
      "city": "Casablanca",
      "country": "MA",
      "date": "2026-09-25"
     },
     {
      "name": "Casa Galicia",
      "city": "Casablanca",
      "country": "MA",
      "date": "2026-02-15"
     }
    ]
   }
  },
  {
   "slug": "rooftop-lounge",
   "name_fr": "Rooftop / lounge",
   "name_en": "Rooftop / lounge",
   "family": "bar_lounge",
   "seat_based": true,
   "priority": 2,
   "traits": {
    "archetypes": [
     "C",
     "D"
    ],
    "key_skill": "bar",
    "beginner_difficulty": "high",
    "investor_needs_operator": "yes",
    "extraction": "no",
    "alcohol": "core",
    "services": [
     "dinner"
    ],
    "thin_sheet": false,
    "proposable": true,
    "regulatory_flag": "watch"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "Sur le littoral d'Aïn Diab, les démolitions de 2026 visent des constructions illicites : tout aménagement en hauteur ou en terrasse doit être régulier."
    }
   ],
   "gaps": [
    {
     "text": "Aucun prix daté ; aucun cas d'échec trouvé."
    }
   ],
   "regulatory": [],
   "casa_lines": 1,
   "examples": {
    "total": 2,
    "casa_recent": 2,
    "top": [
     {
      "name": "Bliss Rooftop (Radisson)",
      "city": "Casablanca",
      "country": "MA",
      "date": "2026-09-30"
     },
     {
      "name": "L'Aragosta (Villa Sahraï)",
      "city": "Casablanca",
      "country": "MA",
      "date": "2026-08-13"
     }
    ]
   }
  },
  {
   "slug": "salon-de-the-patisserie",
   "name_fr": "Salon de thé-pâtisserie",
   "name_en": "Tea room-pastry",
   "family": "cafe_brunch",
   "seat_based": true,
   "priority": 2,
   "traits": {
    "archetypes": [
     "B"
    ],
    "key_skill": "kitchen",
    "beginner_difficulty": "medium",
    "investor_needs_operator": "yes",
    "extraction": "no",
    "alcohol": "no",
    "services": [
     "breakfast",
     "lunch"
    ],
    "thin_sheet": false,
    "proposable": true,
    "regulatory_flag": "none"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "Concurrence des chaînes de boulangerie-pâtisserie (voir la fiche boulangerie-café) ; gaspillage des produits frais."
    }
   ],
   "gaps": [
    {
     "text": "Aucun salon de thé de Casablanca trouvé avec une source datée récente ; la source sur la saisonnalité date de 2023."
    }
   ],
   "regulatory": [],
   "casa_lines": 0,
   "examples": {
    "total": 2,
    "casa_recent": 0,
    "top": [
     {
      "name": "Bacha Coffee (aéroport)",
      "city": "Marrakech",
      "country": "MA",
      "date": "2025-12-18"
     },
     {
      "name": "Cédric Grolet Monte-Carlo",
      "city": "Monaco",
      "country": "MC",
      "date": "2025-08-05"
     }
    ]
   }
  },
  {
   "slug": "sandwich-shawarma-premium",
   "name_fr": "Sandwich et shawarma premium",
   "name_en": "Premium sandwich and shawarma",
   "family": "fast_casual",
   "seat_based": true,
   "priority": 2,
   "traits": {
    "archetypes": [
     "A",
     "C",
     "E"
    ],
    "key_skill": "kitchen",
    "beginner_difficulty": "low",
    "investor_needs_operator": "franchise_ok",
    "extraction": "required",
    "alcohol": "no",
    "services": [
     "lunch",
     "dinner"
    ],
    "thin_sheet": true,
    "proposable": true,
    "regulatory_flag": "none"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "Format très présent en vente rapide : la différence doit venir du produit et de la marque."
    }
   ],
   "gaps": [
    {
     "text": "Fiche mince : aucun shawarma premium de Casablanca trouvé avec une source datée ; aucun exemple étranger récent ; aucun cas d'échec."
    }
   ],
   "regulatory": [],
   "casa_lines": 1,
   "examples": {
    "total": 0,
    "casa_recent": 0,
    "top": []
   }
  },
  {
   "slug": "table-marocaine-contemporaine",
   "name_fr": "Table marocaine contemporaine",
   "name_en": "Contemporary Moroccan table",
   "family": "restaurant",
   "seat_based": true,
   "priority": 2,
   "traits": {
    "archetypes": [
     "D",
     "C"
    ],
    "key_skill": "kitchen",
    "beginner_difficulty": "medium",
    "investor_needs_operator": "yes",
    "extraction": "desirable",
    "alcohol": "possible",
    "services": [
     "lunch",
     "dinner"
    ],
    "thin_sheet": false,
    "proposable": true,
    "regulatory_flag": "watch"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "Concurrence des palaces (Royal Mansour, Four Seasons) sur le haut de gamme marocain ; dépendance aux touristes pour un lieu de médina."
    }
   ],
   "gaps": [
    {
     "text": "Aucune table marocaine contemporaine indépendante récente trouvée à Casablanca hors médina ; aucun prix daté ; aucun cas d'échec."
    }
   ],
   "regulatory": [],
   "casa_lines": 3,
   "examples": {
    "total": 4,
    "casa_recent": 3,
    "top": [
     {
      "name": "La Grande Table Marocaine (Royal Mansour)",
      "city": "Casablanca",
      "country": "MA",
      "date": "2026-09-25"
     },
     {
      "name": "Kyúb (Four Seasons)",
      "city": "Casablanca",
      "country": "MA",
      "date": "2026-09-25"
     }
    ]
   }
  },
  {
   "slug": "tapas-iberiques",
   "name_fr": "Tapas ibériques",
   "name_en": "Iberian tapas",
   "family": "restaurant",
   "seat_based": true,
   "priority": 2,
   "traits": {
    "archetypes": [
     "C"
    ],
    "key_skill": "kitchen",
    "beginner_difficulty": "medium",
    "extraction": "desirable",
    "alcohol": "core",
    "services": [
     "dinner"
    ],
    "thin_sheet": true,
    "proposable": true,
    "regulatory_flag": "watch"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [],
   "gaps": [
    {
     "text": "Fiche mince : aucun exemple étranger récent retenu, aucun cas d'échec, aucun prix à Casablanca."
    }
   ],
   "regulatory": [],
   "casa_lines": 1,
   "examples": {
    "total": 1,
    "casa_recent": 1,
    "top": [
     {
      "name": "Casa Galicia",
      "city": "Casablanca",
      "country": "MA",
      "date": "2026-02-15"
     }
    ]
   }
  },
  {
   "slug": "trattoria-pizzeria-napolitaine",
   "name_fr": "Trattoria-pizzeria napolitaine",
   "name_en": "Trattoria-Neapolitan pizzeria",
   "family": "restaurant",
   "seat_based": true,
   "priority": 2,
   "traits": {
    "archetypes": [
     "B",
     "C"
    ],
    "key_skill": "kitchen",
    "beginner_difficulty": "low",
    "investor_needs_operator": "franchise_ok",
    "extraction": "required",
    "alcohol": "possible",
    "services": [
     "lunch",
     "dinner"
    ],
    "thin_sheet": false,
    "proposable": true,
    "regulatory_flag": "none"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "Mola Pizza (Madrid), saluée par la critique, a fermé en 2023 faute de résultats : la qualité ne suffit pas sans le bon prix."
    }
   ],
   "gaps": [
    {
     "text": "Aucune pizzeria napolitaine de Casablanca trouvée avec une source datée de moins de 24 mois ; aucun prix daté."
    }
   ],
   "regulatory": [],
   "casa_lines": 3,
   "examples": {
    "total": 5,
    "casa_recent": 0,
    "top": [
     {
      "name": "Baldoria",
      "city": "Madrid",
      "country": "ES",
      "date": "2026-07-03"
     },
     {
      "name": "Sartoria Panatieri",
      "city": "Barcelone",
      "country": "ES",
      "date": "2026-07-03"
     }
    ]
   }
  },
  {
   "slug": "bar-de-quartier",
   "name_fr": "Bar de quartier",
   "name_en": "Neighbourhood bar",
   "family": "bar_lounge",
   "seat_based": true,
   "priority": 3,
   "traits": {
    "archetypes": [
     "C",
     "B"
    ],
    "key_skill": "bar",
    "beginner_difficulty": "high",
    "investor_needs_operator": "yes",
    "extraction": "no",
    "alcohol": "core",
    "services": [
     "dinner"
    ],
    "thin_sheet": false,
    "proposable": true,
    "regulatory_flag": "watch"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "Dépend de la licence d'alcool et de l'accord du voisinage ; la clientèle de quartier est fidèle mais limitée en nombre."
    }
   ],
   "gaps": [
    {
     "text": "Aucun bar de quartier indépendant (hors restaurant-bar) trouvé avec une source datée ; aucun prix ; aucun cas d'échec ; procédure de licence d'alcool à Casablanca non documentée."
    }
   ],
   "regulatory": [],
   "casa_lines": 1,
   "examples": {
    "total": 2,
    "casa_recent": 2,
    "top": [
     {
      "name": "Braise Social Kitchen & Wine Bar",
      "city": "Casablanca (Gauthier)",
      "country": "MA",
      "date": "2026-10-15"
     },
     {
      "name": "L'Octave",
      "city": "Casablanca (Gauthier)",
      "country": "MA",
      "date": "2026-02-15"
     }
    ]
   }
  },
  {
   "slug": "beach-club",
   "name_fr": "Beach club",
   "name_en": "Beach club",
   "family": "bar_lounge",
   "seat_based": true,
   "priority": 3,
   "traits": {
    "archetypes": [
     "D"
    ],
    "key_skill": "management",
    "beginner_difficulty": "very_high",
    "investor_needs_operator": "yes",
    "extraction": "no",
    "alcohol": "possible",
    "services": [
     "lunch",
     "dinner"
    ],
    "thin_sheet": false,
    "proposable": false,
    "regulatory_flag": "strong"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "Cas d'échec : le Tahiti Beach Club est fermé depuis le 29 février 2024, après la saisie de son matériel par les autorités pour impôts impayés ; il exploitait une concession maritime qui n'a pas été renouvelée à son échéance."
    }
   ],
   "gaps": [
    {
     "text": "Aucun beach club de Casablanca en activité régulière confirmé par une source datée ; aucun prix ; statut des concessions existantes et décision pour l'été 2027 inconnus ; format à très fort risque réglementaire."
    }
   ],
   "regulatory": [],
   "casa_lines": 1,
   "examples": {
    "total": 1,
    "casa_recent": 0,
    "top": [
     {
      "name": "Tahiti Beach Club",
      "city": "Casablanca (Aïn Diab)",
      "country": "MA",
      "date": "2024-03-05"
     }
    ]
   }
  },
  {
   "slug": "bowls-poke",
   "name_fr": "Bowls / poké",
   "name_en": "Bowls / poke",
   "family": "fast_casual",
   "seat_based": true,
   "priority": 3,
   "traits": {
    "archetypes": [
     "A"
    ],
    "key_skill": "kitchen",
    "beginner_difficulty": "low",
    "extraction": "no",
    "alcohol": "no",
    "services": [
     "lunch"
    ],
    "thin_sheet": true,
    "proposable": true,
    "regulatory_flag": "none"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "Format porté par la mode du « healthy » et concurrencé par les bols des cafés sains et des bars à jus (voir la fiche jus et bowls)."
    }
   ],
   "gaps": [
    {
     "text": "Aucun restaurant de poké de Casablanca trouvé avec une source datée."
    }
   ],
   "regulatory": [],
   "casa_lines": 0,
   "examples": {
    "total": 0,
    "casa_recent": 0,
    "top": []
   }
  },
  {
   "slug": "creperie",
   "name_fr": "Crêperie",
   "name_en": "Crêperie",
   "family": "cafe_brunch",
   "seat_based": true,
   "priority": 3,
   "traits": {
    "archetypes": [
     "B",
     "D"
    ],
    "key_skill": "kitchen",
    "beginner_difficulty": "low",
    "extraction": "required",
    "alcohol": "no",
    "services": [
     "breakfast",
     "lunch"
    ],
    "thin_sheet": true,
    "proposable": true,
    "regulatory_flag": "none"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "Concept saisonnier et facile à copier ; à Casablanca, la crêpe se vend déjà comme produit annexe dans les glaciers, salons de thé et cafés-brunch (voir leurs fiches)."
    }
   ],
   "gaps": [
    {
     "text": "Aucune crêperie de Casablanca trouvée avec une source datée ; aucun prix daté ; aucun cas d'échec ; fiche mince."
    }
   ],
   "regulatory": [],
   "casa_lines": 0,
   "examples": {
    "total": 1,
    "casa_recent": 0,
    "top": [
     {
      "name": "L'Atelier Artisan Crêpier",
      "city": "Paris (5e), Neuilly-sur-Seine, Annecy",
      "country": "FR",
      "date": "2024-04-29"
     }
    ]
   }
  },
  {
   "slug": "food-hall",
   "name_fr": "Food hall",
   "name_en": "Food hall",
   "family": "fast_casual",
   "seat_based": true,
   "priority": 3,
   "traits": {
    "archetypes": [
     "E"
    ],
    "key_skill": "management",
    "beginner_difficulty": "medium",
    "investor_needs_operator": "yes",
    "extraction": "desirable",
    "alcohol": "possible",
    "services": [
     "lunch",
     "dinner"
    ],
    "thin_sheet": true,
    "proposable": true,
    "regulatory_flag": "none"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "Dépend du flux du centre ou du lieu qui l'accueille ; un porteur seul ne crée pas la fréquentation d'une halle."
    }
   ],
   "gaps": [
    {
     "text": "Aucune halle gourmande de Casablanca vérifiée avec une source datée."
    }
   ],
   "regulatory": [],
   "casa_lines": 0,
   "examples": {
    "total": 1,
    "casa_recent": 0,
    "top": [
     {
      "name": "Marché d'Eden (Carré Eden)",
      "city": "Marrakech",
      "country": "MA",
      "date": "2024-09-28"
     }
    ]
   }
  },
  {
   "slug": "glacier-gelato",
   "name_fr": "Glacier / gelato",
   "name_en": "Ice cream / gelato",
   "family": "cafe_brunch",
   "seat_based": true,
   "priority": 3,
   "traits": {
    "archetypes": [
     "D",
     "B"
    ],
    "key_skill": "kitchen",
    "beginner_difficulty": "high",
    "investor_needs_operator": "yes",
    "extraction": "no",
    "alcohol": "no",
    "services": [],
    "thin_sheet": false,
    "proposable": true,
    "regulatory_flag": "none"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "Exemple ancien : en 2007, l'enseigne italienne G-Ice annonçait un premier point de vente dans le Triangle d'Or à plus de 11 millions de dirhams hors local."
    }
   ],
   "gaps": [
    {
     "text": "Aucun prix daté ; aucun cas d'échec marocain récent ; aucune donnée de saisonnalité chiffrée pour Casablanca."
    }
   ],
   "regulatory": [],
   "casa_lines": 1,
   "examples": {
    "total": 3,
    "casa_recent": 2,
    "top": [
     {
      "name": "La Glacerie by Lahlou & Co",
      "city": "Casablanca (Racine)",
      "country": "MA",
      "date": "2025-08-01"
     },
     {
      "name": "Dar Ice Cream",
      "city": "Casablanca",
      "country": "MA",
      "date": "2025-08-01"
     }
    ]
   }
  },
  {
   "slug": "jus-bowls",
   "name_fr": "Jus et bowls",
   "name_en": "Juices and bowls",
   "family": "cafe_brunch",
   "seat_based": true,
   "priority": 3,
   "traits": {
    "archetypes": [
     "A",
     "B"
    ],
    "key_skill": "floor",
    "beginner_difficulty": "low",
    "investor_needs_operator": "franchise_ok",
    "extraction": "no",
    "alcohol": "no",
    "services": [
     "breakfast",
     "lunch"
    ],
    "thin_sheet": false,
    "proposable": true,
    "regulatory_flag": "none"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "Les jus frais sont une offre ancienne et locale (bars à jus de quartier) : le positionnement doit se justifier par le lieu et le service, pas par le produit seul."
    }
   ],
   "gaps": [
    {
     "text": "Aucun bar à jus indépendant de Casablanca trouvé avec une source datée ; aucun prix ; aucun cas d'échec."
    }
   ],
   "regulatory": [],
   "casa_lines": 1,
   "examples": {
    "total": 2,
    "casa_recent": 1,
    "top": [
     {
      "name": "Joe & The Juice (CFC)",
      "city": "Casablanca (Casablanca Finance City)",
      "country": "MA",
      "date": "2026-01-20"
     },
     {
      "name": "Joe & The Juice (Rabat)",
      "city": "Rabat",
      "country": "MA",
      "date": "2025-10-04"
     }
    ]
   }
  },
  {
   "slug": "poulet",
   "name_fr": "Poulet",
   "name_en": "Chicken",
   "family": "fast_casual",
   "seat_based": true,
   "priority": 3,
   "traits": {
    "archetypes": [
     "A",
     "E"
    ],
    "key_skill": "kitchen",
    "beginner_difficulty": "low",
    "investor_needs_operator": "franchise_ok",
    "extraction": "required",
    "alcohol": "no",
    "services": [
     "lunch",
     "dinner"
    ],
    "thin_sheet": false,
    "proposable": true,
    "regulatory_flag": "none"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "Marché tenu par une enseigne internationale très implantée : un indépendant se heurte à son maillage et à ses prix."
    }
   ],
   "gaps": [
    {
     "text": "Aucun poulet indépendant de Casablanca trouvé avec une source datée ; aucun prix ; aucun cas d'échec ; ouverture de Chicken Street non confirmée."
    }
   ],
   "regulatory": [],
   "casa_lines": 1,
   "examples": {
    "total": 2,
    "casa_recent": 2,
    "top": [
     {
      "name": "KFC Almaz",
      "city": "Casablanca",
      "country": "MA",
      "date": "2025-11-17"
     },
     {
      "name": "Chicken Street",
      "city": "Casablanca (annoncé)",
      "country": "FR",
      "date": "2026-04-09"
     }
    ]
   }
  },
  {
   "slug": "supper-club",
   "name_fr": "Supper club",
   "name_en": "Supper club",
   "family": "restaurant",
   "seat_based": true,
   "priority": 3,
   "traits": {
    "archetypes": [
     "C"
    ],
    "key_skill": "floor",
    "beginner_difficulty": "high",
    "investor_needs_operator": "yes",
    "extraction": "desirable",
    "alcohol": "core",
    "services": [
     "dinner"
    ],
    "thin_sheet": false,
    "proposable": true,
    "regulatory_flag": "watch"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "Dépend de l'ambiance, de la programmation et d'horaires tardifs ; une mode de sortie peut vieillir vite."
    }
   ],
   "gaps": [
    {
     "text": "Aucun prix de carte daté ; aucune date d'ouverture ; aucun cas d'échec ; le quartier de Mila diffère selon les sources."
    }
   ],
   "regulatory": [],
   "casa_lines": 1,
   "examples": {
    "total": 2,
    "casa_recent": 2,
    "top": [
     {
      "name": "Mila Supper Club",
      "city": "Casablanca (Oasis-Maârif)",
      "country": "MA",
      "date": "2026-10-07"
     },
     {
      "name": "Ruby Supper Club",
      "city": "Casablanca (boulevard Driss Slaoui)",
      "country": "MA",
      "date": "2026-08-24"
     }
    ]
   }
  },
  {
   "slug": "tacos-street-food",
   "name_fr": "Tacos et street food",
   "name_en": "Tacos and street food",
   "family": "fast_casual",
   "seat_based": true,
   "priority": 3,
   "traits": {
    "archetypes": [
     "B",
     "E"
    ],
    "key_skill": "kitchen",
    "beginner_difficulty": "low",
    "investor_needs_operator": "franchise_ok",
    "extraction": "required",
    "alcohol": "no",
    "services": [
     "lunch",
     "dinner"
    ],
    "thin_sheet": false,
    "proposable": true,
    "regulatory_flag": "none"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "Marché encombré (chaînes françaises et marocaines) et facile à copier."
    }
   ],
   "gaps": [
    {
     "text": "Aucun tacos indépendant de Casablanca avec une source datée ; aucun prix daté ; aucun cas d'échec."
    }
   ],
   "regulatory": [],
   "casa_lines": 1,
   "examples": {
    "total": 2,
    "casa_recent": 0,
    "top": [
     {
      "name": "O'Tacos",
      "city": "Marrakech ; Casablanca (Californie, Ziraoui)",
      "country": "MA",
      "date": "2025-06-17"
     },
     {
      "name": "Enjoy Tacos",
      "city": "France",
      "country": "FR",
      "date": "2026-05-25"
     }
    ]
   }
  },
  {
   "slug": "traiteur",
   "name_fr": "Traiteur",
   "name_en": "Caterer",
   "family": null,
   "seat_based": false,
   "priority": 3,
   "traits": {
    "archetypes": [],
    "key_skill": "management",
    "beginner_difficulty": "medium",
    "alcohol": "no",
    "services": [],
    "thin_sheet": true,
    "proposable": true,
    "regulatory_flag": "none"
   },
   "trait_inference": {},
   "ranges": {},
   "pitfalls": [
    {
     "text": "Cas d'ancienneté : en octobre 2020, l'événementiel marocain était à l'arrêt depuis mars (mariages interdits)."
    }
   ],
   "gaps": [
    {
     "text": "Aucun traiteur indépendant de Casablanca trouvé avec une source datée ; aucun prix par couvert ; format hors moteur."
    }
   ],
   "regulatory": [],
   "casa_lines": 0,
   "examples": {
    "total": 1,
    "casa_recent": 1,
    "top": [
     {
      "name": "Newrest Morocco (restaurant d'entreprise)",
      "city": "Casablanca",
      "country": "MA",
      "date": "2025-09-22"
     }
    ]
   }
  }
 ],
 "districts": [
  {
   "id": "e011dfab-aac4-48a0-8592-8cd7226d77b4",
   "name": "Aïn Diab",
   "archetypes": [
    {
     "code": "D",
     "rank": 1,
     "inference": true
    }
   ],
   "rent": {
    "m2": 174,
    "low": 139,
    "high": 203,
    "source": "Mahaly.ma, Prix de l'immobilier commercial à Casablanca (calcul d'octobre 2026)",
    "observed_at": "2026-10-30",
    "status": "researched"
   },
   "venues": [
    {
     "name": "L'Aragosta",
     "family": "bar_lounge",
     "source_published_at": "2026-08-13",
     "formats": [
      "rooftop-lounge"
     ]
    },
    {
     "name": "Aïku",
     "family": "restaurant",
     "source_published_at": "2026-08-13",
     "formats": [
      "comptoir-japonais-sushi"
     ]
    }
   ],
   "notes": 8,
   "density": null
  },
  {
   "id": "9ad6897c-2479-4c41-a5d9-64054a29c3a6",
   "name": "Anfa",
   "archetypes": [
    {
     "code": "B",
     "rank": 1,
     "inference": true
    }
   ],
   "rent": {
    "m2": 173,
    "low": 133,
    "high": 225,
    "source": "Mahaly.ma, Prix de l'immobilier commercial à Casablanca (calcul d'octobre 2026)",
    "observed_at": "2026-10-30",
    "status": "researched"
   },
   "venues": [],
   "notes": 4,
   "density": null
  },
  {
   "id": "e42a02cb-04a1-4c5a-a5d9-6e2a464d64cd",
   "name": "Bourgogne",
   "archetypes": [
    {
     "code": "C",
     "rank": 1,
     "inference": true
    }
   ],
   "rent": {
    "m2": 145,
    "low": 118,
    "high": 184,
    "source": "Mahaly.ma, Prix de l'immobilier commercial à Casablanca (calcul d'octobre 2026)",
    "observed_at": "2026-10-30",
    "status": "verified"
   },
   "venues": [],
   "notes": 6,
   "density": null
  },
  {
   "id": "1c6bb88a-9aa7-4b2c-92c8-52586d18a869",
   "name": "Californie",
   "archetypes": [
    {
     "code": "B",
     "rank": 1,
     "inference": true
    }
   ],
   "rent": {
    "m2": 167,
    "low": 126,
    "high": 200,
    "source": "Mahaly.ma, Prix de l'immobilier commercial à Casablanca (calcul d'octobre 2026)",
    "observed_at": "2026-10-30",
    "status": "researched"
   },
   "venues": [],
   "notes": 5,
   "density": null
  },
  {
   "id": "c75211b7-ac24-4b81-b7ea-eb21f2d1c536",
   "name": "Casa Finance City",
   "archetypes": [
    {
     "code": "A",
     "rank": 1,
     "inference": true
    }
   ],
   "rent": {
    "m2": 211,
    "low": 186,
    "high": 254,
    "source": "Mahaly.ma, Prix de l'immobilier commercial à Casablanca (calcul d'octobre 2026)",
    "observed_at": "2026-10-30",
    "status": "researched"
   },
   "venues": [
    {
     "name": "Le Pavillon CFC",
     "family": "restaurant",
     "source_published_at": "2026-08-13",
     "formats": []
    }
   ],
   "notes": 5,
   "density": null
  },
  {
   "id": "ccbe8b58-520b-4ab6-a6d5-b4a800215800",
   "name": "Centre-ville",
   "archetypes": [
    {
     "code": "C",
     "rank": 1,
     "inference": true
    },
    {
     "code": "E",
     "rank": 2,
     "inference": true
    }
   ],
   "rent": null,
   "venues": [
    {
     "name": "Brasserie Marcel Cerdan",
     "family": "restaurant",
     "source_published_at": "2026-02-15",
     "formats": [
      "bistro-brasserie"
     ]
    }
   ],
   "notes": 7,
   "density": null
  },
  {
   "id": "f11aa7e9-acbc-430c-bf1f-b6aabb9f7e78",
   "name": "CIL",
   "archetypes": [
    {
     "code": "B",
     "rank": 1,
     "inference": true
    }
   ],
   "rent": null,
   "venues": [
    {
     "name": "Counter 11",
     "family": "restaurant",
     "source_published_at": "2026-08-13",
     "formats": [
      "comptoir-japonais-sushi"
     ]
    },
    {
     "name": "La Crêperie du CIL",
     "family": "cafe_brunch",
     "source_published_at": "2026-08-13",
     "formats": []
    }
   ],
   "notes": 7,
   "density": null
  },
  {
   "id": "258db599-2e4c-43ea-8fda-9e27ebc6514d",
   "name": "Gauthier",
   "archetypes": [
    {
     "code": "C",
     "rank": 1,
     "inference": true
    },
    {
     "code": "A",
     "rank": 2,
     "inference": true
    }
   ],
   "rent": {
    "m2": 150,
    "low": 120,
    "high": 182,
    "source": "Mahaly.ma, Prix de l'immobilier commercial à Casablanca (calcul d'octobre 2026)",
    "observed_at": "2026-10-30",
    "status": "researched"
   },
   "venues": [
    {
     "name": "Monsieur Moutarde – Vin & Cuisine",
     "family": "bistro_wine_bar",
     "source_published_at": "2026-05-06",
     "formats": [
      "bistro-brasserie"
     ]
    },
    {
     "name": "Braise Social Kitchen & Wine Bar",
     "family": "bistro_wine_bar",
     "source_published_at": "2026-10-15",
     "formats": [
      "bar-de-quartier"
     ]
    },
    {
     "name": "L'Octave",
     "family": "bar_lounge",
     "source_published_at": "2026-02-15",
     "formats": [
      "bar-a-cocktails",
      "bar-de-quartier"
     ]
    }
   ],
   "notes": 11,
   "density": {
    "total": 115,
    "radius_m": 650,
    "observed_at": "2026-11-01",
    "attribution": "© OpenStreetMap contributors (ODbL)"
   }
  },
  {
   "id": "a60b8774-8df3-47fd-8e2a-10d3ed380572",
   "name": "Maârif",
   "archetypes": [
    {
     "code": "C",
     "rank": 1,
     "inference": true
    },
    {
     "code": "A",
     "rank": 2,
     "inference": true
    }
   ],
   "rent": {
    "m2": 140,
    "low": 104,
    "high": 173,
    "source": "Mahaly.ma, Prix de l'immobilier commercial à Casablanca (calcul d'octobre 2026)",
    "observed_at": "2026-10-30",
    "status": "researched"
   },
   "venues": [
    {
     "name": "Mila Supper Club",
     "family": "restaurant",
     "source_published_at": "2026-02-15",
     "formats": [
      "supper-club"
     ]
    },
    {
     "name": "Casa Galicia",
     "family": "restaurant",
     "source_published_at": "2026-02-15",
     "formats": [
      "poissons-fruits-de-mer",
      "tapas-iberiques"
     ]
    }
   ],
   "notes": 12,
   "density": {
    "total": 131,
    "radius_m": 650,
    "observed_at": "2026-11-01",
    "attribution": "© OpenStreetMap contributors (ODbL)"
   }
  },
  {
   "id": "9db66317-29ce-4999-98f4-31a465fbeaa5",
   "name": "Oasis",
   "archetypes": [
    {
     "code": "B",
     "rank": 1,
     "inference": true
    },
    {
     "code": "E",
     "rank": 2,
     "inference": true
    }
   ],
   "rent": null,
   "venues": [
    {
     "name": "OLEA",
     "family": "cafe_brunch",
     "source_published_at": "2026-07-03",
     "formats": [
      "cafe-resto-brunch"
     ]
    },
    {
     "name": "La Fabbrica",
     "family": "cafe_brunch",
     "source_published_at": "2026-07-03",
     "formats": []
    }
   ],
   "notes": 7,
   "density": null
  },
  {
   "id": "62ebfbcc-ce14-45e1-b3be-f68535f57435",
   "name": "Palmier",
   "archetypes": [
    {
     "code": "B",
     "rank": 1,
     "inference": true
    }
   ],
   "rent": null,
   "venues": [],
   "notes": 4,
   "density": null
  },
  {
   "id": "332d78da-18e7-4eaa-a505-0024382e805c",
   "name": "Racine",
   "archetypes": [
    {
     "code": "B",
     "rank": 1,
     "inference": true
    }
   ],
   "rent": null,
   "venues": [],
   "notes": 6,
   "density": null
  },
  {
   "id": "66ff2eb7-7b69-4998-9203-b3d7b8478403",
   "name": "Sidi Belyout",
   "archetypes": [],
   "rent": {
    "m2": 175,
    "low": 103,
    "high": 195,
    "source": "Mahaly.ma, Prix de l'immobilier commercial à Casablanca (calcul d'octobre 2026)",
    "observed_at": "2026-10-30",
    "status": "researched"
   },
   "venues": [],
   "notes": 0,
   "density": null
  },
  {
   "id": "7e3c820f-b3a3-4318-83be-9c9f2aea1940",
   "name": "Sidi Maârouf",
   "archetypes": [
    {
     "code": "A",
     "rank": 1,
     "inference": true
    }
   ],
   "rent": {
    "m2": 134,
    "low": 100,
    "high": 159,
    "source": "Mahaly.ma, Prix de l'immobilier commercial à Casablanca (calcul d'octobre 2026)",
    "observed_at": "2026-10-30",
    "status": "verified"
   },
   "venues": [],
   "notes": 6,
   "density": null
  }
 ]
};
