window.lootCategories = window.lootCategories || {};
window.lootCategories['health'] = [

  // ===========================================================================
  // TIER 1 : SOINS DE FORTUNE (Faible, Risqué, Gratuit ou presque)
  // ===========================================================================
  {
    "id": "bandage_sale",
    "label": "Bandage de fortune",
    "type": "health",
    "description": "Un morceau de tissu déchiré sur un vêtement usagé. Arrête le saignement, mais l'infection est probable.",
    "bonus": { "health": 2 },
    "value": 1,
    "origin": "Universel",
    "effects": ["risque_infection"]
  },
  {
    "id": "mousse_humide",
    "label": "Poignée de mousse",
    "type": "health",
    "description": "De la mousse gorgée d'eau récoltée dans les Marches du Nord. Appliquée sur une plaie, elle apaise la brûlure du froid.",
    "bonus": { "health": 3 },
    "value": 0,
    "origin": "Eldaron (Nord)",
    "effects": []
  },
  {
    "id": "pain_moisi_thaurgrim",
    "label": "Pain de pénitence",
    "type": "health",
    "description": "Un croûton de pain noir couvert de moisissure bleue. Les ouvriers de Thaurgrim le mangent pour lutter contre les infections pulmonaires.",
    "bonus": { "health": 4 },
    "value": 2,
    "origin": "Thaurgrim",
    "effects": ["gout_horrible"]
  },
  {
    "id": "cautere_poudre",
    "label": "Pincée de poudre noire",
    "type": "health",
    "description": "Une dose de poudre à canon. À verser sur la plaie et à allumer. Ça fait un mal de chien, mais ça cautérise instantanément.",
    "bonus": { "health": 5 },
    "value": 5,
    "origin": "Thaurgrim",
    "effects": ["douleur_intense"]
  },

  // ===========================================================================
  // TIER 2 : MÉDECINE DU PEUPLE (Moyen, Artisanal, Abordable)
  // ===========================================================================
  {
    "id": "cataplasme_ortie",
    "label": "Cataplasme d'orties",
    "type": "health",
    "description": "Une pâte verte et piquante préparée par les grands-mères d'Eldaron. Stimule la circulation et nettoie le sang.",
    "bonus": { "health": 8 },
    "value": 10,
    "origin": "Eldaron",
    "effects": []
  },
  {
    "id": "huile_baleine_brute",
    "label": "Gorgée d'huile brute",
    "type": "health",
    "description": "De la graisse de baleine liquide. C'est répugnant, mais c'est une bombe calorique qui sauve de l'hypothermie.",
    "bonus": { "health": 10 },
    "value": 15,
    "origin": "Helrun",
    "effects": ["rechauffement"]
  },
  {
    "id": "sel_purificateur",
    "label": "Sel d'Iskarion",
    "type": "health",
    "description": "Du sel gemme pur béni par les prêtres solaires. Frotter sur la plaie pour tuer la corruption. Brûle atrocement.",
    "bonus": { "health": 12 },
    "value": 20,
    "origin": "Iskarion",
    "effects": ["desinfection_brutale"]
  },
  {
    "id": "alcool_de_patate",
    "label": "Tord-Boyaux",
    "type": "health",
    "description": "Un alcool distillé illégalement à Eldaron. Sert autant à désinfecter les outils qu'à oublier la douleur (et son propre nom).",
    "bonus": { "health": 15 },
    "value": 12,
    "origin": "Eldaron",
    "effects": ["ivresse_legere"]
  },

  // ===========================================================================
  // TIER 3 : MÉDECINE DE GUERRE & ALCHIMIE (Fort, Cher, Professionnel)
  // ===========================================================================
  {
    "id": "onguent_gris",
    "label": "Onguent des tranchées",
    "type": "health",
    "description": "Une pâte grise à base de graisse minérale et de soufre utilisée par l'armée de Thaurgrim. Ferme les plaies ouvertes en quelques minutes.",
    "bonus": { "health": 20 },
    "value": 40,
    "origin": "Thaurgrim",
    "effects": []
  },
  {
    "id": "bandage_lin_fin",
    "label": "Bandage de lin chirurgical",
    "type": "health",
    "description": "Bandelettes de lin bouilli et repassé, importées d'Ardel. Propre, stérile, rassurant.",
    "bonus": { "health": 25 },
    "value": 50,
    "origin": "Eldaron (Ardel)",
    "effects": []
  },
  {
    "id": "baume_du_tigre_vert",
    "label": "Baume Varnalien",
    "type": "health",
    "description": "Une petite boîte en bois contenant une cire verte très odorante (menthol/eucalyptus). Débouche les bronches et apaise les muscles déchirés.",
    "bonus": { "health": 30 },
    "value": 60,
    "origin": "Varnäl",
    "effects": ["vivacite"]
  },
  {
    "id": "laudanum_noir",
    "label": "Laudanum Noir",
    "type": "health",
    "description": "Opium concentré dissous dans de l'alcool fort. Supprime totalement la douleur, permettant de courir avec une jambe cassée. Hautement addictif.",
    "bonus": { "health": 35 },
    "value": 80,
    "origin": "Varnäl / Eldaron",
    "effects": ["insensibilite", "risque_addiction"]
  },

  // ===========================================================================
  // TIER 4 : MÉDECINE D'ÉLITE & EXOTIQUE (Très Fort, Rare, Effets secondaires)
  // ===========================================================================
  {
    "id": "injection_adrenaline",
    "label": "Seringue de combat",
    "type": "health",
    "description": "Une seringue en verre et acier contenant un liquide rouge vif. Technologie interdite de Thaurgrim. Réveille un mort... ou tue un cardiaque.",
    "bonus": { "health": 50 },
    "value": 150,
    "origin": "Thaurgrim",
    "effects": ["coeur_bat_fort"]
  },
  {
    "id": "eau_de_lune",
    "label": "Fiole d'Eau de Lune",
    "type": "health",
    "description": "Eau puisée dans les oasis secrètes d'Iskarion lors de la pleine lune. Elle a un goût d'argent et referme les chairs sans laisser de cicatrice.",
    "bonus": { "health": 60 },
    "value": 200,
    "origin": "Iskarion",
    "effects": ["purete"]
  },
  {
    "id": "larve_chirurgienne",
    "label": "Larve suturale",
    "type": "health",
    "description": "Une grosse larve blanche vivante (Varnäl). On la pose sur la plaie, elle mange les tissus nécrosés et sécrète une soie cicatrisante. Dégoûtant mais miraculeux.",
    "bonus": { "health": 70 },
    "value": 180,
    "origin": "Varnäl",
    "effects": ["degout"]
  },
  {
    "id": "graisse_albinos",
    "label": "Pot de graisse albinos",
    "type": "health",
    "description": "Graisse pure de baleine blanche légendaire. Elle ne gèle jamais et brille faiblement. Une noisette suffit à soigner les pires engelures.",
    "bonus": { "health": 80 },
    "value": 300,
    "origin": "Helrun",
    "effects": ["lueur_interieure"]
  },

  // ===========================================================================
  // TIER 5 : OBJETS MYTHIQUES / UNIQUES (Soin Total ou presque)
  // ===========================================================================
  {
    "id": "sang_de_titan",
    "label": "Fiole de Sang de Titan",
    "type": "health",
    "description": "Un liquide visqueux et chaud, récupéré au plus profond des mines de Thaurgrim. Il a le goût du fer et de la cendre. Il régénère tout, même les membres perdus (selon la légende).",
    "bonus": { "health": 100 },
    "value": 1000,
    "origin": "Thaurgrim (Profond)",
    "isQuestItem": false,
    "effects": ["regeneration_totale"]
  },
  {
    "id": "panacee_mere_liane",
    "label": "Sève de la Mère-Liane",
    "type": "health",
    "description": "Une sève dorée qui pulse comme un cœur. Offerte uniquement par les matriarches de Varnäl aux alliés de sang. Soigne le corps et l'esprit.",
    "bonus": { "health": 999 },
    "value": 5000,
    "origin": "Varnäl (Rhaal)",
    "isQuestItem": true,
    "effects": ["miracle"]
  }
];