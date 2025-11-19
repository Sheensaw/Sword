// SYSTÈME DE LOOT COMPLET
(function() {
  'use strict';

  console.log("🚀 INITIALISATION SYSTÈME LOOT...");

  // Cache des items
  window.setup.itemCache = {};
  window.setup.randomLoot = {};

  // Chargement séquentiel robuste avec fallback
  async function loadLootsSequentially() {
    if (window.setup.lootState.loading) {
      console.log("⚠️ Chargement loot déjà en cours");
      return;
    }

    window.setup.lootState.loading = true;
    window.setup.lootState.attempted = true;

    console.log("📦 DÉBUT CHARGEMENT LOOTS...");

    const lootFiles = [
      "loot/health.js",
      "loot/food.js",
      "loot/weapon_simple.js",
      "loot/weapon_mythique.js"
    ];

    let loadedCount = 0;

    for (const path of lootFiles) {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = path;
          script.async = false;

          script.onload = () => {
            console.log("✅ LOOT CHARGÉ:", path);
            loadedCount++;
            resolve();
          };

          script.onerror = () => {
            console.warn("⚠️ ÉCHEC CHARGEMENT:", path);
            loadedCount++;
            resolve(); // Continue malgré l'erreur
          };

          document.head.appendChild(script);
        });

        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        console.warn("Erreur lors du chargement:", path, error);
      }
    }

    console.log(`📊 ${loadedCount}/${lootFiles.length} fichiers traités`);
    initLootSystem();
  }

  // Initialisation robuste du système de loot
  function initLootSystem() {
    console.log("🔄 INITIALISATION CACHE LOOT...");

    const categories = window.lootCategories || {};
    window.setup.itemCache = window.setup.itemCache || {};
    window.setup.randomLoot = window.setup.randomLoot || {};

    // Fusion avec les objets de fallback
    Object.assign(window.setup.itemCache, window.setup.fallbackItems);

    let totalItems = 0;
    let categoryCount = 0;

    Object.keys(categories).forEach(cat => {
      if (Array.isArray(categories[cat])) {
        categoryCount++;
        categories[cat].forEach(item => {
          if (item && item.id && item.label) {
            window.setup.itemCache[item.id] = item;
            totalItems++;
            console.log(`📝 Item chargé: ${item.id} (${cat})`);
          }
        });
      }
    });

    // Génération des loots aléatoires
    Object.keys(categories).forEach(type => {
      const arr = categories[type];
      if (Array.isArray(arr) && arr.length > 0) {
        const randomItem = arr[Math.floor(Math.random() * arr.length)];
        window.setup.randomLoot[type] = randomItem.id;
        console.log(`🎲 Random ${type}: ${randomItem.id}`);
      }
    });

    window.setup.lootState.ready = true;
    window.setup.lootState.loading = false;

    console.log(`✅ SYSTÈME LOOT PRÊT: ${totalItems} objets, ${categoryCount} catégories`);
    console.log("📋 Cache complet:", Object.keys(window.setup.itemCache));
  }

  // Fonction pour obtenir un item de façon sécurisée
  window.setup.getItemFromCache = function(itemId) {
    if (!itemId) {
      console.warn("❌ Item ID manquant");
      return null;
    }

    if (!window.setup.lootState.ready) {
      console.warn("⚠️ Loot system pas prêt, utilisation du fallback pour:", itemId);
      return window.setup.fallbackItems[itemId] || null;
    }

    const item = window.setup.itemCache[itemId];

    if (!item) {
      console.warn(`❌ Item non trouvé: ${itemId}`);
      console.log("📋 Cache disponible:", Object.keys(window.setup.itemCache));

      // Créer un item de fallback dynamique
      return {
        id: itemId,
        label: itemId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        type: 'misc',
        description: `Objet ${itemId} - chargement en cours...`,
        bonus: {},
        isQuestItem: false
      };
    }

    return item;
  };

  // Vérification périodique de l'état du loot
  window.setup.ensureLootReady = function(callback, maxAttempts = 10) {
    let attempts = 0;

    function check() {
      attempts++;

      if (window.setup.lootState.ready) {
        callback(true);
        return;
      }

      if (attempts >= maxAttempts) {
        console.warn("❌ Timeout attente système loot");
        callback(false);
        return;
      }

      if (!window.setup.lootState.attempted) {
        loadLootsSequentially();
      }

      setTimeout(check, 200);
    }

    check();
  };

  // Export global
  window.loadLootsSequentially = loadLootsSequentially;
})();