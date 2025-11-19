// Initialisation du GameState et structure de base
(function() {
  'use strict'


  window.setup = window.setup || {};

  // Constantes globales
  const ICONS = {
    health: 'images/icons/health.png',
    strength: 'images/icons/strength.png',
    defense: 'images/icons/defense.png',
    magic: 'images/icons/magic.png',
    gold: 'images/icons/gold.png',
    inventory: 'images/icons/inventory.png',
    equipment: 'images/icons/equipment.png',
    speak: 'images/icons/speak.png',
    quest: 'images/icons/quest.png',
    buddy: 'images/icons/buddy.png'
  };
  window.ICONS = ICONS;

  // État du chargement PNJ
  window.setup.pnjState = {
    ready: false,
    loading: false,
    attempted: false,
    fallbackCache: {}
  };

  // État du chargement Loot
  window.setup.lootState = {
    ready: false,
    loading: false,
    attempted: false,
    fallbackCache: {}
  };

  // Cache d'objets par défaut
  window.setup.fallbackItems = {
    'viande_salee': {
      id: 'viande_salee',
      label: 'Viande Salée',
      type: 'food',
      bonus: { health: 5 },
      description: 'De la viande séchée et salée pour survivre en voyage.',
      isQuestItem: false
    },
    'essence_phoenix': {
      id: 'essence_phoenix',
      label: 'Essence de Phénix',
      type: 'usable',
      bonus: { health: 20 },
      description: 'Une essence rare aux propriétés régénératives.',
      isQuestItem: false
    }
  };

  // Cache de fallback PNJ
  window.setup.fallbackPNJs = {
    'cyndra': {
      id: 'cyndra',
      pnj: {
        identite: {
          nom: 'Cyndra',
          nom_complet: 'Cyndra d\'Arrowyn',
          peuple: 'Humaine Valnari',
          metier_principal: 'Chasseuse et guide'
        },
        description_narrative: 'Une guerrière expérimentée aux cheveux d\'argent et au regard perçant.',
        personnalite: 'Loyale et protectrice',
        contexte: 'Ancienne garde royale devenue mercenaire'
      }
    }
  };

  // Fonction utilitaire pour accéder aux variables SugarCube
  function V() {
    return State.variables;
  }

  // Initialisation des stats de base
  window.setup.ensureBaseStats = function() {
    const v = V();
    v.strength = Number(v.strength || 0);
    v.resistance = Number(v.resistance || 0);
    v.dexterity = Number(v.dexterity || 0);
    v.magic = Number(v.magic || 0);
    v.health = Number(v.health || 0);
    v.level = Number(v.level || 1);
    v.exp = Number(v.exp || 0);
    v.expToNextLevel = Number(v.expToNextLevel || 100);
    v.current_player_health = Number(v.current_player_health || 10);
    v.max_player_health = Number(v.max_player_health || 10);
  };

  // Logger basique
  window.setup.Logger = {
    log: function(msg, data) {
      console.log(`[LOG] ${msg}`, data || '');
    },
    warn: function(msg, data) {
      console.warn(`[WARN] ${msg}`, data || '');
    },
    error: function(msg, data) {
      console.error(`[ERROR] ${msg}`, data || '');
    }
  };

  // Système d'événements
  window.setup.Events = {
    listeners: {},
    on: function(event, callback) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(callback);
    },
    emit: function(event, data) {
      if (this.listeners[event]) {
        this.listeners[event].forEach(cb => cb(data));
      }
    }
  };

  // Base de données géographique
  window.velkarumGeography = {
    continents: {
      "Eldaron": {
        regions: [{
          name: "Royaume Central de Valnoria",
          bounds: { x_min: 30, x_max: 60, y_min: 40, y_max: 70 },
          capital: "Lorn"
        }],
        cities: [{ name: "Lorn", coords: { x: 45, y: 55 } }],
        points_of_interest: []
      }
    },
    strategic_locations: {},
    critical_infrastructure: {},
    intercontinental_connections: {}
  };
})();

// Tests de validation
window.Validation = {
  testLootSystem: function() {
    return window.setup.lootState.ready && Object.keys(window.setup.itemCache || {}).length > 0;
  },
  testAll: function() {
    return this.testLootSystem() && window.setup.pnjState.ready;
  }
};

/* Validations à passer :
- Tous les tests doivent passer
Validation.testAll() doit retourner true
*/