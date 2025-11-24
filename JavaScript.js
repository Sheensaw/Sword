(function() {
  'use strict';

  /* =========================================================================
     1. INITIALISATION & CONFIGURATION
     ========================================================================= */
  window.setup = window.setup || {};

  // Configuration des Icônes (Source de vérité)
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
    buddy: 'images/icons/buddy.png',
    map: 'images/icons/map.png',
    misc: 'images/icons/key.png' // Fallback
  };
  window.ICONS = ICONS;

  // Helper pour accéder aux variables SugarCube
  function V() {
    return State.variables;
  }

  // Initialisation des stats de base (Sécurité anti-undefined)
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

    // Initialisation structures
    v.inventory = v.inventory || [];
    v.equipped = v.equipped || {};
    v.npcs = v.npcs || {};
    v.quests = v.quests || [];
  };
  //#endregion

  //#region SYSTÈME DE LOOT ROBUSTE
  console.log("🚀 INITIALISATION SYSTÈME LOOT...");

  // État du chargement
  window.setup.lootState = {
    ready: false,
    loading: false,
    attempted: false,
    fallbackCache: {}
  };

  // Cache d'objets par défaut pour les objets manquants
  window.setup.fallbackItems = {
    'viande_salee': {
      id: 'viande_salee',
      label: 'Viande Salée',
      type: 'food',
      bonus: {
        health: 5
      },
      description: 'De la viande séchée et salée pour survivre en voyage.',
      isQuestItem: false
    },
    'essence_phoenix': {
      id: 'essence_phoenix',
      label: 'Essence de Phénix',
      type: 'usable',
      bonus: {
        health: 20
      },
      description: 'Une essence rare aux propriétés régénératives.',
      isQuestItem: false
    }
  };

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
    let failedCount = 0;

    for (const path of lootFiles) {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");

          // CORRECTION : Chemins alternatifs
          const possiblePaths = [
            path,
            `./${path}`,
            `/server/${path}`,
            `./server/${path}`
          ];

          let currentPathIndex = 0;

          function tryNextPath() {
            if (currentPathIndex >= possiblePaths.length) {
              console.warn(`❌ Tous les chemins échoués pour: ${path}`);
              loadedCount++;
              resolve();
              return;
            }

            const currentPath = possiblePaths[currentPathIndex];
            script.src = currentPath;
            script.async = false;

            script.onload = () => {
              console.log(`✅ LOOT CHARGÉ: ${currentPath}`);
              loadedCount++;
              resolve();
            };

            script.onerror = () => {
              console.warn(`⚠️ Échec: ${currentPath}`);
              currentPathIndex++;
              tryNextPath();
            };

            document.head.appendChild(script);
          }

          tryNextPath();
        });

        await new Promise(resolve => setTimeout(resolve, 50));

      } catch (error) {
        console.warn("Erreur lors du chargement:", path, error);
        failedCount++;
      }
    }

    console.log(`📊 ${loadedCount}/${lootFiles.length} fichiers traités, ${failedCount} échecs`);

    // INITIALISATION MALGRÉ LES ÉCHECS
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

    // Parcours sécurisé des catégories
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

    // Si le système de loot n'est pas prêt, utiliser le cache de fallback
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
  //#endregion

  //#region MACROS SUGARCUBE

  /* ---- MACRO : quest ---- */
  Macro.add('quest', {
    handler: function() {
      const [id, title, shortDesc, fullDesc = shortDesc, rewardStr = '{}'] = this.args;

      if (!id || !title || !shortDesc) {
        return this.error('<<quest id title shortDesc [fullDesc] [reward]>>');
      }

      // Fonction de traitement une fois le loot prêt
      const processQuest = (lootReady) => {
        const v = V();
        v.quests = v.quests || [];
        v.completedQuests = v.completedQuests || [];
        v.pendingQuests = v.pendingQuests || {};

        if (v.quests.some(q => q.id === id) || v.completedQuests.includes(id)) {
          return; // Quête déjà existante
        }

        // Parsing de la récompense
        let reward = {
          gold: 0,
          items: []
        };
        try {
          const parsed = JSON.parse(rewardStr);
          reward.gold = Number(parsed.gold) || 0;
          reward.items = Array.isArray(parsed.items) ? parsed.items : [];
        } catch (e) {
          console.warn("Récompense invalide:", rewardStr, e);
        }

        // Résolution des items random
        const finalItems = [];
        for (const item of reward.items) {
          if (typeof item === 'string' && item.startsWith('random:')) {
            const type = item.slice(7);
            const randomId = window.setup.randomLoot?.[type];
            const randomItem = randomId ? window.setup.getItemFromCache(randomId) : null;

            if (randomItem) {
              finalItems.push(randomItem);
            } else {
              console.warn("Loot aléatoire introuvable:", type);
            }
          } else if (typeof item === 'object' && item.id) {
            const cachedItem = window.setup.getItemFromCache(item.id);
            if (cachedItem) {
              finalItems.push(cachedItem);
            }
          }
        }

        // Stockage temporaire
        v.pendingQuests[id] = {
          title,
          shortDesc,
          fullDesc,
          reward: {
            gold: reward.gold,
            items: finalItems
          }
        };

        // --- AFFICHAGE MODAL ---
        $('#quest-proposal-modal, #modal-overlay-quest-proposal').remove();
        const $overlay = $('<div id="modal-overlay-quest-proposal"></div>').appendTo('body');
        const $modal = $('<div id="quest-proposal-modal" role="dialog"></div>').appendTo('body');

        let rewardHTML = '';
        if (reward.gold) rewardHTML += `${reward.gold} or<br>`;
        if (finalItems.length)
          rewardHTML += finalItems.map(i => window.setup.escapeHtml(i.label)).join('<br>');
        if (!rewardHTML) rewardHTML = 'Aucune';

        $modal.append(`
                <div class="modal-content">
                    <div class="modal-header">
                        <img class="icon-1em" src="${window.ICONS.quest}" alt="Quête">
                        <span>Quête</span>
                    </div>
                    <div class="modal-body">
                        <strong>${window.setup.escapeHtml(title)}</strong><br>
                        ${window.setup.escapeHtml(fullDesc)}
                        <hr>
                        <strong>Récompense :</strong><br>${rewardHTML}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="modal-btn accept-quest">Accepter</button>
                        <button type="button" class="modal-close">Refuser</button>
                    </div>
                </div>
            `);

        $('body').addClass('modal-open');

        $modal.find('.modal-close').on('click', () => {
          $modal.remove();
          $overlay.remove();
          $('body').removeClass('modal-open');
        });

        $modal.find('.accept-quest').on('click', () => {
          new Wikifier(null, `<<startquest "${id}">>`);
          $modal.remove();
          $overlay.remove();
          $('body').removeClass('modal-open');
        });
      };

      // Attendre que le loot soit prêt si nécessaire
      if (!window.setup.lootState.ready) {
        window.setup.ensureLootReady(processQuest);
      } else {
        processQuest(true);
      }
    }
  });

  /* ---- MACRO : setenv ---- */
  Macro.add('setenv', {
    handler: function() {
      const env = this.args[0];
      const v = V();
      if (!env) return this.error('Environnement manquant : <<setenv "nom_env">>.');
      const sndMap = v.envSounds || {};
      const loopMap = v.envLoop || {};
      const sound = sndMap[env];
      if (v.currentSound) {
        new Wikifier(this.output, `<<audio "${v.currentSound}" stop>>`);
        v.isAmbiancePlaying = false;
      }
      if (sound) {
        const shouldLoop = loopMap[env] !== false;
        const loopFlag = shouldLoop ? 'loop ' : '';
        new Wikifier(this.output, `<<audio "${sound}" ${loopFlag}play volume 0.5>>`);
        v.currentSound = sound;
        v.isAmbiancePlaying = true;
      } else {
        v.currentSound = '';
        v.isAmbiancePlaying = false;
      }
      window.setup.applyEnvBackground(env);
    }
  });
  /* ---- MACRO : notify ---- */
  Macro.add('notify', {
    handler: function() {
      const title = this.args[0] || '';
      const text = this.args[1] || '';
      const duration = parseInt(this.args[2], 10) || 3000;
      window.setup.showNotification(title, text, duration);
    }
  });
  /* ---- MACRO : addExp ---- */
  Macro.add('addExp', {
    handler: function() {
      const amount = Number(this.args[0]) || 0;
      if (amount <= 0) return this.error('Quantité positive requise.');
      const v = V();
      v.exp = (v.exp || 0) + amount;
      // Vérification de montée de niveau
      const expNeeded = v.expToNextLevel || v.level * 100;
      while (v.exp >= expNeeded) {
        v.exp -= expNeeded;
        v.level++;
        v.expToNextLevel = v.level * 100;
        window.setup.showNotification(
          'Niveau supérieur !',
          `Vous êtes maintenant niveau ${v.level}`,
          4000,
          undefined,
          undefined,
          '#4CAF50'
        );
      }
      window.setup.updateHUD();
    }
  });
  /* ---- MACRO : notifydialogue ---- */
  Macro.add('notifydialogue', {
    handler: function() {
      const npc = this.args[0] || 'Inconnu';
      const shortText = this.args[1] || '...';
      const fullText = this.args[2] || shortText;
      const saveToMessages = this.args.length > 3 ? this.args[3] : true; // Nouvel argument - true par défaut
      window.setup.showDialogueNotification(npc, shortText, fullText, saveToMessages);
    }
  });

  /* ---- MACRO : setcoords ---- */
  Macro.add('setcoords', {
    handler: function() {
      let x, y, continent;

      // 1. Parsing flexible des arguments
      if (this.args.length === 1 && typeof this.args[0] === 'object') {
        const coords = this.args[0];
        x = Number(coords.x);
        y = Number(coords.y);
        continent = coords.continent;
      } else if (this.args.length >= 2) {
        x = Number(this.args[0]);
        y = Number(this.args[1]);
        continent = this.args[2];
      } else {
        return this.error('Usage: <<setcoords x y [continent]>> ou <<setcoords {x:1, y:2, continent: "Eldaron"}>>');
      }

      // 2. Sécurisation des valeurs
      const v = State.variables;
      // Si le continent n'est pas fourni, on essaie de garder l'actuel, sinon fallback Eldaron
      const currentContinent = v.playerCoordinates?.continent || "Eldaron";

      // Mise à jour immédiate de la "Vérité Terrain" du passage actuel
      // On utilise State.passage directement pour éviter les désynchronisations
      const currentPassage = State.passage;

      v.passageCoords = v.passageCoords || {};
      v.passageCoords[currentPassage] = {
        x: x,
        y: y,
        continent: continent || currentContinent,
        source: 'macro' // Marqueur pour le debug
      };

      // 3. Force la synchronisation immédiate du joueur
      window.setup.syncPlayerPosition();
    }
  });

  window.setup.syncPlayerPosition = function() {
    const v = State.variables;
    const currentPassage = State.passage; // Source de vérité absolue

    // 1. Initialisation des structures si manquantes
    v.passageCoords = v.passageCoords || {};
    v.playerCoordinates = v.playerCoordinates || { x: 45, y: 55, continent: "Eldaron" }; // Valeurs par défaut (Lorn)

    // 2. Tentative de récupération des coordonnées pour ce passage
    let coords = v.passageCoords[currentPassage];

    // 3. STRATÉGIE DE FALLBACK INTELLIGENT (Auto-Detection via Velkarum)
    if (!coords) {
        const geo = window.setup.getGeographyData();

        // Si le nom du passage correspond exactement à un noeud (ex: "Lorn", "Taverne_Dragon_Borgne")
        if (geo && geo.nodes && geo.nodes[currentPassage]) {
            const node = geo.nodes[currentPassage];
            coords = {
                x: node.x,
                y: node.y,
                continent: node.continent || "Eldaron",
                source: 'velkarum_auto'
            };
            console.log(`🗺️ [AUTO-GEO] Passage "${currentPassage}" reconnu dans Velkarum. Coords appliquées.`);
        }
    }

    // 4. STRATÉGIE DE PERSISTANCE (Si toujours rien, on garde la dernière position connue)
    if (!coords) {
        // On suppose que le joueur est toujours au même endroit géographique
        // (ex: il entre dans une sous-pièce non cartographiée d'un bâtiment)
        coords = {
            x: v.playerCoordinates.x,
            y: v.playerCoordinates.y,
            continent: v.playerCoordinates.continent,
            source: 'persistence'
        };
        // On ne log pas trop pour éviter le spam, mais c'est une info utile
        // console.log(`⚓ [PERSIST] Pas de coords pour "${currentPassage}", maintien de la position précédente.`);
    }

    // 5. Sauvegarde et Mise à jour
    // On stocke le résultat pour ne pas recalculer à chaque milliseconde
    v.passageCoords[currentPassage] = coords;

    // Mise à jour officielle de la position du joueur
    v.playerCoordinates = {
        x: Number(coords.x),
        y: Number(coords.y),
        continent: coords.continent,
        passage: currentPassage,
        lastUpdate: Date.now() // Utile pour le debug
    };

    v.currentPassage = currentPassage; // Redondant mais sécurisant pour les scripts tiers

    return v.playerCoordinates;
  };

  // REMPLACER window.setup.ensurePassageCoords
  window.setup.ensurePassageCoords = function(passageName) {
    // Cette fonction est maintenant un wrapper pour garantir la rétrocompatibilité
    // mais elle force une synchronisation propre.
    if (passageName === State.passage) {
        return window.setup.syncPlayerPosition();
    }

    // Si on demande des coords d'un autre passage que l'actuel (rare)
    const v = State.variables;
    if (v.passageCoords && v.passageCoords[passageName]) {
        return v.passageCoords[passageName];
    }
    return { x: 0, y: 0, continent: "Eldaron", isDefault: true };
  };

  /* ---- MACRO : displaylocation ---- */
  Macro.add('displaylocation', {
    handler: function() {
      const v = V();
      const currentPassage = State.passage;
      // Récupérer les coordonnées du passage actuel
      const passageCoords = (v.passageCoords || {})[currentPassage];
      if (!passageCoords) {
        this.output.appendChild(document.createTextNode("Position inconnue"));
        return;
      }
      // Récupérer le continent (vous devrez peut-être le stocker séparément)
      // Pour l'instant, on suppose qu'il est stocké dans passageCoords
      const continent = passageCoords.continent || "Eldaron"; // Valeur par défaut
      const locationString = window.setup.getLocationString({
          x: passageCoords.x,
          y: passageCoords.y
        },
        continent
      );
      this.output.appendChild(document.createTextNode(locationString));
    }
  });
  /* ---- MACRO : addItem ---- */
  Macro.add('addItem', {
    handler: function() {
      const id = this.args[0];
      let qty = Number(this.args[1] || 1);

      if (!id) {
        return this.error('<<addItem "id" [quantité]>> - ID manquant');
      }

      if (qty <= 0) {
        return this.error('Quantité doit être positive');
      }

      console.log(`🎯 ADDITEM: ${id} x${qty}`);

      // Fonction pour traiter l'ajout une fois le loot prêt
      const processAddItem = (lootReady) => {
        const v = V();
        v.inventory = v.inventory || [];
        v.inventoryNewItems = v.inventoryNewItems || [];
        v.has = v.has || {};

        // Obtenir l'item de façon sécurisée
        const itemData = window.setup.getItemFromCache(id);

        if (!itemData) {
          console.error(`❌ ADDITEM ÉCHEC: ${id} non trouvé`);
          window.setup.showNotification('Erreur', `Objet ${id} non disponible`, 3000);
          return;
        }

        // Données de l'item avec valeurs par défaut
        const item = {
          id: itemData.id,
          label: itemData.label || id,
          type: itemData.type || 'misc',
          qty: qty,
          bonus: itemData.bonus || {},
          description: itemData.description || '',
          isQuestItem: Boolean(itemData.isQuestItem),
          isTwoHanded: Boolean(itemData.isTwoHanded),
          requirements: itemData.requirements,
          damage: itemData.damage,
          coeff: itemData.coeff,
          speed: itemData.speed,
          critChance: itemData.critChance,
          critMultiplier: itemData.critMultiplier,
          effects: itemData.effects
        };

        // Recherche d'un item existant
        const existingIndex = v.inventory.findIndex(it => it.id === id);
        let notificationText = '';

        if (existingIndex === -1) {
          // Nouvel item
          v.inventory.push(item);
          v.inventoryNewItems.push(id);
          notificationText = `${item.label} ajouté (${qty})`;
        } else {
          // Item existant - mise à jour
          const existing = v.inventory[existingIndex];
          existing.qty += qty;
          existing.description = item.description || existing.description;

          // Mise à jour des propriétés si nécessaire
          ['isTwoHanded', 'requirements', 'damage', 'coeff', 'speed', 'critChance', 'critMultiplier', 'effects'].forEach(prop => {
            if (item[prop] !== undefined) {
              existing[prop] = item[prop];
            }
          });

          v.inventoryNewItems.push(id);
          notificationText = `Vous avez ${existing.qty} ${item.label}`;
        }

        // Mise à jour du dictionnaire has
        v.has[id] = (v.has[id] || 0) + qty;

        // Notification
        const bonusText = Object.keys(item.bonus)
          .map(k => `+${item.bonus[k]} ${k}`)
          .join(' ');

        window.setup.showNotification(
          'Objet obtenu',
          notificationText + (bonusText ? ` ${bonusText}` : ''),
          3500
        );

        // Mise à jour UI
        v.inventoryViewed = false;
        window.setup.updateInventoryCounter();
        window.setup.updateHUD();

        console.log(`✅ ADDITEM RÉUSSI: ${id} x${qty}`);
      };

      // Vérifier que le système de loot est prêt
      if (!window.setup.lootState.ready) {
        console.warn(`⏳ ADDITEM en attente du loot system: ${id}`);
        window.setup.ensureLootReady(processAddItem);
      } else {
        processAddItem(true);
      }
    }
  });

  // Version directe pour usage interne (sans notification)
  window.setup.addItemDirect = function(id, qty = 1) {
    const v = V();
    const itemData = window.setup.getItemFromCache(id);

    if (!itemData) {
      console.warn(`Item non trouvé: ${id}`);
      return false;
    }

    v.inventory = v.inventory || [];
    v.has = v.has || {};

    const existing = v.inventory.find(it => it.id === id);

    if (existing) {
      existing.qty += qty;
    } else {
      v.inventory.push({
        id: itemData.id,
        label: itemData.label,
        type: itemData.type,
        qty: qty,
        bonus: itemData.bonus || {},
        description: itemData.description || '',
        isQuestItem: Boolean(itemData.isQuestItem),
        isTwoHanded: Boolean(itemData.isTwoHanded)
      });
    }

    v.has[id] = (v.has[id] || 0) + qty;
    return true;
  };
  /* ---- MACRO : removeItem ---- */
  Macro.add('removeItem', {
    handler: function() {
      const id = this.args[0];
      const qty = Number(this.args[1]) || 1;
      if (!id) return this.error('<<removeItem id [qty]>>');
      const v = V();
      const inv = v.inventory || [];
      const item = inv.find(it => it.id === id);
      if (!item) return;
      item.qty = Math.max(0, (item.qty || 0) - qty);
      if (item.qty <= 0) v.inventory = inv.filter(it => it.id !== id);
      window.setup.showNotification('Retiré', `${item.label} retiré (${qty})`);
      v.has = v.has || {};
      v.has[id] = Math.max(0, (v.has[id] || 0) - qty);
      if (v.has[id] === 0) delete v.has[id];
      window.setup.updateHUD();
    }
  });
  /* ---- MACRO : losehealth ---- */
  Macro.add('losehealth', {
    handler: function() {
      const amount = Number(this.args[0]) || 0;
      if (amount <= 0) return this.error('Quantité positive requise.');
      const v = V();
      v.current_player_health = Math.max(0, (v.current_player_health || 0) - amount);
      window.setup.showNotification('Santé', `Vous perdez ${amount} PV.`, 3000, undefined, undefined, '#ff6b6b');
      if (v.current_player_health <= 0) {
        v.VariableTexteMort = 'Vous êtes mort.';
        setTimeout(() => Engine.play('Mort'), 0);
      }
      window.setup.updateHUD();
    }
  });
  /* ---- MACRO : death ---- */
  Macro.add('death', {
    handler: function() {
      const v = V();
      const text = this.args[0] || v.texteMort || "Vous êtes mort.";
      v.current_player_health = 0;
      v.VariableTexteMort = text;
      if (v.currentSound) {
        new Wikifier(null, `<<audio "${v.currentSound}" stop>>`);
        v.currentSound = '';
      }
      if (v.envSounds?.mort) {
        new Wikifier(null, `<<audio "${v.envSounds.mort}" play volume 0.6>>`);
      }
      setTimeout(() => Engine.play('Mort'), 0);
      window.setup.updateHUD();
    }
  });
  /* ---- MACRO : choiceicon ---- */
  Macro.add('choiceicon', {
    handler: function() {
      const type = this.args[0];
      if (!window.setup.choiceIcons[type]) return this.error('Type invalide : move, look, interact, speak, attack, back');
      new Wikifier(this.output, `<span class="choiceicon-marker" data-type="${type}"></span>`);
    }
  });
  /* ---- MACRO : startquest ---- */
  Macro.add('startquest', {
    handler: function() {
      const id = this.args[0];
      if (!id) return this.error('ID de quête manquant');
      const v = V();
      const p = v.pendingQuests && v.pendingQuests[id];
      if (!p) return;
      window.setup.addQuest(id, p.title, p.shortDesc, p.fullDesc, p.reward);
      delete v.pendingQuests[id];
    }
  });
  /* ---- MACRO : markquestcompleted ---- */
  Macro.add('markquestcompleted', {
    handler: function() {
      window.setup.markQuestCompleted(this.args[0]);
    }
  });
  /* ---- MACRO : markquestready ---- */
  Macro.add('markquestready', {
    handler: function() {
      window.setup.markQuestReady(this.args[0]);
    }
  });
  /* ---- MACRO : spawn ---- */
  Macro.add('spawn', {
    handler: function() {
      const type = (this.args[0] || '').toLowerCase();
      const name = this.args[1];
      if (type !== 'pnj' || !name) {
        return this.error('Usage: <<spawn pnj "Nom">>');
      }
      const npc = npcEnsure(name);
      if (npc.isSpawned) return;

      npc.isSpawned = true;
      npc.isActive = true;
      npc.isAlive = true;
      npc.health = npc.maxHealth || 20;

      // CORRECTION CRITIQUE : Utiliser State.currentPassage si disponible
      const currentPassage = State.passage || State.variables.currentPassage || 'PassageInconnu';
      npc.passage = currentPassage;

      // CORRECTION : Utiliser les coordonnées du passage actuel
      const v = V();
      const passageCoords = (v.passageCoords || {})[currentPassage];
      if (passageCoords) {
        npc.coordinates = {
          x: passageCoords.x,
          y: passageCoords.y
        };
        npc.continent = passageCoords.continent || "Eldaron";
      } else {
        // Fallback sur les coordonnées du joueur si disponibles
        const playerCoords = v.playerCoordinates;
        if (playerCoords) {
          npc.coordinates = {
            x: playerCoords.x || 0,
            y: playerCoords.y || 0
          };
          npc.continent = playerCoords.continent || "Eldaron";
        } else {
          npc.coordinates = {
            x: 0,
            y: 0
          };
          npc.continent = "Eldaron";
        }
      }

      console.log(`PNJ ${name} spawné dans ${currentPassage} aux coordonnées (${npc.coordinates.x}, ${npc.coordinates.y}, ${npc.continent})`);
      updateBuddyHUDVisibility();
    }
  });
  /* ---- MACRO : pnj ---- */
  Macro.add('pnj', {
    handler: function() {
      const name = this.args[0];
      const cmd = this.args[1];
      if (!name || !cmd) return this.error('Usage : <<pnj "Nom" "commande|passage">>');
      const npc = npcEnsure(name);
      if (!npc.isSpawned) npc.isSpawned = true;
      npc.isActive = true;
      const lc = String(cmd).toLowerCase();

      let moveType = null;

      switch (lc) {
        case 'buddy':
          npc.isBuddy = true;
          break;
        case 'follow':
          npc.status = 'follow';
          npc.isBuddy = true;
          moveType = 'follow';
          break;
        case 'fix':
        case 'fixed':
          npc.status = 'fixed';
          npc.passage = State.passage;
          npc.isBuddy = true;
          moveType = 'fixed';
          break;
        case 'dead':
          npc.isAlive = false;
          npc.isActive = false;
          // Pas de notification de mouvement pour la mort
          window.setup.showDialogueNotification(npc.name, `${npc.name} est mort.`, `${npc.name} est mort.`, false);
          break;
        case 'gone':
          npc.isActive = false;
          // Pas de notification de mouvement pour le départ
          window.setup.showDialogueNotification(npc.name, `${npc.name} est parti.`, `${npc.name} est parti.`, false);
          break;
        default:
          npc.status = 'fixed';
          npc.passage = cmd;
          moveType = 'goto'; // Considérer comme un déplacement
          break;
      }

      // Notification de mouvement si applicable
      if (moveType) {
        window.setup.notifyPnjMove(name, moveType);
      }

      updateBuddyHUDVisibility();
    }
  });

  Macro.add('pnjfollow', {
    handler: function() {
      const name = this.args[0];
      if (!name) return this.error('Usage : <<pnjfollow "Nom">>');

      console.group(`👥 PNJFOLLOW CORRIGÉ: ${name}`);

      const npc = npcEnsure(name);
      npc.isBuddy = true;
      npc.isAlive = true;
      npc.isActive = true;
      npc.isSpawned = true;

      // SOURCE DE VÉRITÉ FIABLE
      const currentPassage = State.variables.currentPassage ||
        (typeof State.passage === 'string' ? State.passage : State.passage?.title) ||
        'Geole';

      console.log(`📍 Passage actuel: "${currentPassage}"`);

      const v = V();

      // VALIDER les coordonnées actuelles
      window.setup.validatePNJCoordinates(name);

      // Obtenir les coordonnées de destination
      const passageCoords = window.setup.ensurePassageCoords(currentPassage);

      console.log(`📍 Coordonnées destination:`, passageCoords);

      // Démarrer le voyage
      const success = window.setup.startPNJTravel(
        name,
        currentPassage,
        passageCoords,
        passageCoords.continent || "Eldaron",
        'follow'
      );

      if (!success) {
        console.warn(`❌ Échec voyage, rejoindre immédiatement`);
        npc.status = 'follow';
        npc.passage = currentPassage;
        npc.coordinates = {
          x: Number(passageCoords.x),
          y: Number(passageCoords.y)
        };
        npc.continent = passageCoords.continent || "Eldaron";

        // Ajouter notification d'arrivée immédiate
        const pnjData = window.setup.loadPNJ(name);
        const joinReactions = pnjData.pnj?.réaction_joueur?.has_join_player;
        let arrivalText = `${npc.name} vous suit.`;
        if (joinReactions && Array.isArray(joinReactions) && joinReactions.length > 0) {
          const randomIndex = Math.floor(Math.random() * joinReactions.length);
          arrivalText = joinReactions[randomIndex];
        }
        window.setup.showDialogueNotificationShort(npc.name, arrivalText, arrivalText, false);
      }

      updateBuddyHUDVisibility();
      if (window.renderBuddiesPanel) window.renderBuddiesPanel();

      console.groupEnd();
    }
  });

  /* ---- MACRO : pnjfix ---- */
  Macro.add('pnjfix', {
    handler: function() {
      const name = this.args[0];
      if (!name) return this.error('Usage : <<pnjfix "Nom">>');
      const npc = npcEnsure(name);
      npc.isBuddy = true;
      npc.status = 'fixed';

      // CORRECTION : Utiliser State.currentPassage
      const currentPassage = State.passage || State.variables.currentPassage || 'PassageInconnu';
      npc.passage = currentPassage;
      npc.isAlive = true;
      npc.isActive = true;

      // Mise à jour des coordonnées
      const v = V();
      const passageCoords = (v.passageCoords || {})[currentPassage];
      if (passageCoords) {
        npc.coordinates = {
          x: passageCoords.x,
          y: passageCoords.y
        };
        npc.continent = passageCoords.continent || "Eldaron";
      }

      window.setup.notifyPnjMove(name, 'fixed');
      updateBuddyHUDVisibility();
    }
  });
  /* ---- MACRO : movePnj ---- */
  Macro.add('movePnj', {
    handler: function() {
      const pnjId = this.args[0];
      const targetPassage = this.args[1];
      const x = this.args[2] ? parseInt(this.args[2]) : null;
      const y = this.args[3] ? parseInt(this.args[3]) : null;
      if (!pnjId || !targetPassage) {
        return this.error('Usage: <<movePnj "pnj_id" "passage" [x] [y]>>');
      }
      const npc = npcEnsure(pnjId);
      npc.passage = targetPassage;
      const v = V();
      const passageCoords = (v.passageCoords || {})[targetPassage];
      // Utiliser les coordonnées fournies ou celles du passage
      npc.coordinates = {
        x: x !== null ? x : (passageCoords ? passageCoords.x : 0),
        y: y !== null ? y : (passageCoords ? passageCoords.y : 0)
      };
      console.log(`PNJ ${pnjId} déplacé vers ${targetPassage} (${npc.coordinates.x}, ${npc.coordinates.y})`);

      // AJOUT : Notification de dialogue avec réaction JSON
      window.setup.notifyPnjMove(pnjId, 'goto');

      // Mettre à jour l'affichage si le PNJ est dans le même passage
      if (State.passage === targetPassage) {
        window.renderBuddiesPanel && window.renderBuddiesPanel();
      }
    }
  });
  /* ---- MACRO : pnjCoords ---- */
  Macro.add('pnjCoords', {
    handler: function() {
      const pnjId = this.args[0];
      const x = parseInt(this.args[1]) || 0;
      const y = parseInt(this.args[2]) || 0;
      const continent = this.args[3] || "Eldaron";

      if (!pnjId) return this.error('Usage: <<pnjCoords "ID" x y "Continent">>');

      // Mise à jour des données
      // On utilise la fonction utilitaire si elle existe, sinon accès direct
      let npc = null;
      if (window.npcEnsure) npc = window.npcEnsure(pnjId);
      else if (State.variables.npcs) npc = State.variables.npcs[pnjId];

      if (npc) {
        npc.coordinates = {
          x,
          y
        };
        npc.continent = continent;
        console.log(`📍 [GEO] ${pnjId} placé à (${x}, ${y}) sur ${continent}`);

        // Force le rafraîchissement du panneau compagnons pour voir le changement de lieu
        if (window.renderBuddiesPanel) window.renderBuddiesPanel();
      }
    }
  })
  /* ---- MACRO : pnjgive ---- */
  /* ---- MACRO : pnjgive ---- */
  Macro.add('pnjgive', {
    handler: function() {
      const pnjId = this.args[0];
      const itemId = this.args[1];
      const quantity = this.args[2] ? parseInt(this.args[2]) : 1;

      if (!pnjId || !itemId) {
        return this.error('Usage: <<pnjgive "compagnon_id" "item_id" [quantity]>>');
      }

      // Vérifier que le PNJ est bien un compagnon
      const v = V();
      const npc = v.npcs?.[pnjId];

      if (!npc || !npc.isBuddy) {
        return this.error(`Le PNJ "${pnjId}" n'est pas votre compagnon. Utilisez uniquement avec des compagnons.`);
      }

      const success = window.setup.giveItemToBuddy(pnjId, itemId, quantity);
      if (!success) {
        // La notification d'erreur est déjà gérée dans giveItemToBuddy
        return;
      }
    }
  });
  /* ---- MACRO : pnjsetstrength ---- */
  Macro.add('pnjsetstrength', {
    handler: function() {
      const name = this.args[0];
      const value = Number(this.args[1] || 0);
      if (!name) return this.error('Usage : <<pnjsetstrength "Nom" valeur>>');
      window.npcSetStrength(name, value);
      window.setup.showNotification('Force modifiée', `${name} a maintenant ${value} de force.`, 3000);
    }
  });
  /* ---- MACRO : pnjsetdexterity ---- */
  Macro.add('pnjsetdexterity', {
    handler: function() {
      const name = this.args[0];
      const value = Number(this.args[1] || 0);
      if (!name) return this.error('Usage : <<pnjsetdexterity "Nom" valeur>>');
      window.npcSetDexterity(name, value);
      window.setup.showNotification('Dextérité modifiée', `${name} a maintenant ${value} de dextérité.`, 3000);
    }
  });
  /* ---- MACRO : pnjsetlevel ---- */
  Macro.add('pnjsetlevel', {
    handler: function() {
      const name = this.args[0];
      const value = Number(this.args[1] || 1);
      if (!name) return this.error('Usage : <<pnjsetlevel "Nom" valeur>>');
      window.npcSetLevel(name, value);
      window.setup.showNotification('Niveau modifié', `${name} est maintenant niveau ${value}.`, 3000);
    }
  });
  /* ---- MACRO : buddyhurt ---- */
  Macro.add('buddyhurt', {
    handler: function() {
      const [name, amt = 1] = this.args;
      if (!name) return this.error('<<buddyhurt "Nom" [amt]>>');
      window.npcApplyDamage(name, Number(amt) || 1);
    }
  });
  /* ---- MACRO : buddyheal ---- */
  Macro.add('buddyheal', {
    handler: function() {
      const [name, amt = 1] = this.args;
      if (!name) return this.error('<<buddyheal "Nom" [amt]>>');
      window.npcApplyHeal(name, Number(amt) || 1);
    }
  });
  /* ---- MACRO : pnjheal ---- */
  Macro.add('pnjheal', {
    handler: function() {
      const name = this.args[0];
      const amount = Number(this.args[1] || 0);
      if (!name || !amount) return this.error('Usage : <<pnjheal "Nom" montant>>');
      window.setup.healBuddy(name, amount);
    }
  });
  /* ---- MACRO : pnjdamage ---- */
  Macro.add('pnjdamage', {
    handler: function() {
      const name = this.args[0];
      const amount = Number(this.args[1] || 0);
      if (!name || !amount) return this.error('Usage : <<pnjdamage "Nom" montant>>');
      window.setup.damageBuddy(name, amount);
    }
  });
  /* ---- MACRO : pnjkill ---- */
  Macro.add('pnjkill', {
    handler: function() {
      const name = this.args[0];
      if (!name) return this.error('Usage : <<pnjkill "Nom">>');
      const npc = npcEnsure(name);

      // Annuler le voyage en cours
      window.setup.cancelPNJTravel(name);

      npc.isAlive = false;
      npc.isActive = true;
      notifyBuddy(`${npc.name} est mort.`);
      window.renderBuddiesPanel?.();
      updateBuddyHUDVisibility();
    }
  });
  /* ---- MACRO : pnjresurrect ---- */
  Macro.add('pnjresurrect', {
    handler: function() {
      const name = this.args[0];
      if (!name) return this.error('Usage : <<pnjresurrect "Nom">>');
      const npc = npcEnsure(name);
      npc.isAlive = true;
      if (npc.health <= 0) npc.health = Math.max(1, Math.floor(npc.maxHealth * 0.25));
      notifyBuddy(`${npc.name} reprend vie.`);
      window.renderBuddiesPanel?.();
      updateBuddyHUDVisibility();
    }
  });
  /* ---- MACRO : pnjrecall ---- */
  Macro.add('pnjrecall', {
    handler: function() {
      const name = this.args[0];
      if (!name) return this.error('Usage : <<pnjrecall "Nom">>');
      const npc = npcEnsure(name);
      npc.isActive = true;

      const v = V();
      const currentPassage = State.passage;
      const passageCoords = (v.passageCoords || {})[currentPassage];

      if (!passageCoords) {
        console.warn(`Aucunes coordonnées pour le passage ${currentPassage}, le PNJ revient immédiatement`);
        // Fallback: revenir immédiatement
        npc.status = 'fixed';
        npc.passage = currentPassage;
        npc.coordinates = {
          x: 0,
          y: 0
        };
        npc.continent = "Eldaron";

        window.setup.notifyPnjMove(name, 'recall');
        window.renderBuddiesPanel?.();
        updateBuddyHUDVisibility();
        return;
      }

      // Démarrer le voyage
      const success = window.setup.startPNJTravel(
        name,
        currentPassage,
        passageCoords,
        passageCoords.continent || "Eldaron",
        'recall'
      );

      if (!success) {
        // En cas d'échec du voyage, revenir immédiatement
        npc.status = 'fixed';
        npc.passage = currentPassage;
        npc.coordinates = {
          ...passageCoords
        };
        npc.continent = passageCoords.continent || "Eldaron";
      }

      window.renderBuddiesPanel?.();
      updateBuddyHUDVisibility();
    }
  });

  /* ---- MACRO : setrelation ---- */
  Macro.add('setrelation', {
    handler() {
      const [name, val] = this.args;
      if (!name) return this.error('<<setrelation "Nom" valeur>>');
      window.npcSetRelation(name, val);
    }
  });
  /* ---- MACRO : changerelation ---- */
  Macro.add('changerelation', {
    handler() {
      const [name, d] = this.args;
      if (!name) return this.error('<<changerelation "Nom" delta>>');
      window.npcChangeRelation(name, d);
    }
  });
  /* ---- MACRO : setloyalty ---- */
  Macro.add('setloyalty', {
    handler() {
      const [name, val] = this.args;
      if (!name) return this.error('<<setloyalty "Nom" valeur>>');
      window.npcSetLoyalty(name, val);
    }
  });
  /* ---- MACRO : changeloyalty ---- */
  Macro.add('changeloyalty', {
    handler() {
      const [name, d] = this.args;
      if (!name) return this.error('<<changeloyalty "Nom" delta>>');
      window.npcChangeLoyalty(name, d);
    }
  });
  /* ---- MACRO : setmood ---- */
  Macro.add('setmood', {
    handler() {
      const [name, val] = this.args;
      if (!name) return this.error('<<setmood "Nom" (-2..2)>>');
      window.npcSetMood(name, val);
    }
  });
  /* ---- MACRO : changemood ---- */
  Macro.add('changemood', {
    handler() {
      const [name, d] = this.args;
      if (!name) return this.error('<<changemood "Nom" delta>>');
      window.npcChangeMood(name, d);
    }
  });
  /* ---- MACRO : testgeography ---- */
  Macro.add('testgeography', {
    handler: function() {
      const geoData = window.setup.getGeographyData();
      const v = V();

      console.group("🧪 TEST GÉOGRAPHIE");
      console.log("Données géo:", geoData);
      console.log("Continents disponibles:", Object.keys(geoData.continents));

      // Tester la fonction de localisation
      const testCoords = {
        x: 45,
        y: 55
      };
      const location = window.setup.getLocationString(testCoords, "Eldaron");
      console.log("Test localisation:", location);

      console.groupEnd();

      this.output.appendChild(document.createTextNode(
        `Test géographie: ${location} | Continents: ${Object.keys(geoData.continents).join(', ')}`
      ));
    }
  });
  //#endregion

  //#region SYSTÈME DE CHARGEMENT GÉOGRAPHIE VELKARUM
  console.log("🗺️ INITIALISATION SYSTÈME GÉOGRAPHIE...");

  // État du chargement de la géographie
  window.setup.geographyState = {
    ready: false,
    loading: false,
    attempted: false,
    data: null
  };

  // Cache par défaut pour la géographie
  window.setup.fallbackGeography = {
    continents: {
      "Eldaron": {
        id: "eldaron",
        name: "Eldaron (Secours)",
        regions: [],
        bounds: { x_min: 0, x_max: 100, y_min: 0, y_max: 100 }
      }
    },
    nodes: {},
    routes: []
  };

  // REMPLACER loadGeography complètement
  async function loadGeography() {
    if (window.setup.geographyState.loading) return;

    window.setup.geographyState.loading = true;
    window.setup.geographyState.attempted = true;

    console.log("🗺️ DÉBUT CHARGEMENT GÉOGRAPHIE MULTI-ÉCHELLES...");

    // Ordre de chargement : Macro -> Micro (Le dernier écrase les détails du premier)
    const geoFiles = [
      'velkarum.json', // Niveau 0 : Monde
      'eldaron.json',  // Niveau 1 : Continents & Villes
      'thaurgrim.json',
      'iskarion.json',
      'helrun.json',
      'varnal.json'
    ];

    const basePaths = ['./server/lore/', 'server/lore/', './lore/', 'lore/', './', ''];

    // Structure de données fusionnée
    let mergedData = {
      continents: {},
      nodes: {},
      routes: []
    };

    let successCount = 0;

    const loadFile = async (filename) => {
      for (const basePath of basePaths) {
        try {
          const response = await fetch(basePath + filename);
          if (response.ok) {
            const json = await response.json();
            return { filename, json };
          }
        } catch (e) { /* continue */ }
      }
      console.warn(`❌ Fichier introuvable : ${filename}`);
      return null;
    };

    // Chargement parallèle
    const results = await Promise.all(geoFiles.map(f => loadFile(f)));

    results.forEach(res => {
      if (!res) return;
      const { filename, json } = res;
      successCount++;

      // 1. Fusion Continents
      if (json.continents) Object.assign(mergedData.continents, json.continents);

      // 2. Fusion Noeuds (Micro écrase Macro pour le même ID)
      if (json.nodes) {
        Object.entries(json.nodes).forEach(([id, node]) => {
          // On marque la source pour le debug
          node._sourceFile = filename;
          mergedData.nodes[id] = node;
        });
      }

      // 3. Aggrégation Routes (On garde tout, pas d'écrasement)
      if (json.routes && Array.isArray(json.routes)) {
        // On évite les doublons par ID de route
        const existingIds = new Set(mergedData.routes.map(r => r.id));
        json.routes.forEach(r => {
          if (!existingIds.has(r.id)) {
            mergedData.routes.push(r);
          }
        });
      }
      console.log(`✅ Chargé: ${filename} (${Object.keys(json.nodes || {}).length} lieux)`);
    });

    if (successCount > 0) {
      window.setup.geographyState.data = mergedData;
      window.setup.geographyState.ready = true;
      console.log(`✅ GÉOGRAPHIE PRÊTE. Total: ${Object.keys(mergedData.nodes).length} lieux.`);

      // Reconstruire le graphe immédiatement
      if (window.setup.buildNavigationGraph) {
          window.setup.buildNavigationGraph();
      }
    } else {
      console.error("⚠️ ÉCHEC CRITIQUE GÉOGRAPHIE. Fallback activé.");
      window.setup.geographyState.data = JSON.parse(JSON.stringify(window.setup.fallbackGeography));
      window.setup.geographyState.ready = true;
    }

    window.setup.geographyState.loading = false;
  }

  // REMPLACER window.setup.getGeographyData
  window.setup.getGeographyData = function() {
    if (!window.setup.geographyState.ready || !window.setup.geographyState.data) {
      return JSON.parse(JSON.stringify(window.setup.fallbackGeography));
    }
    return window.setup.geographyState.data;
  };

  // Vérification périodique de l'état de la géographie
  window.setup.ensureGeographyReady = function(callback, maxAttempts = 20) {
    let attempts = 0;
    const check = () => {
      attempts++;
      if (window.setup.geographyState.ready) return callback(true);
      if (attempts >= maxAttempts) return callback(false);
      if (!window.setup.geographyState.attempted) loadGeography();
      setTimeout(check, 200);
    };
    check();
  };

  // Fonction de diagnostic
  window.setup.debugGeography = function() {
    console.group("🔍 DIAGNOSTIC GÉOGRAPHIE");
    console.log("État:", window.setup.geographyState);
    console.log("Données chargées:", window.setup.geographyState.data);
    console.log("Fallback:", window.setup.fallbackGeography);
    console.log("Données retournées par getGeographyData():", window.setup.getGeographyData());
    console.groupEnd();
  };

  // Appeler cette fonction pour voir l'état actuel
  setTimeout(() => {
    window.setup.debugGeography();
  }, 2000);

  // =========================================================================
  // SYSTÈME DE DÉPLACEMENT PNJ - COMPLET & VISUEL (MODIFIÉ)
  // =========================================================================

  // Constantes de Géographie et de Temps
  window.setup.GEO_SCALE = 10; // 1 unité de coordonnée = 10 km
  window.setup.TRAVEL_SPEED_KMH = 5; // Vitesse de marche moyenne 5 km/h
  window.setup.MS_PER_KM = 200; // 200ms de temps réel = 1 km parcouru (Ajustez pour accélérer/ralentir le jeu)
  window.setup.REST_DURATION = 30000; // 10 secondes de pause par auberge/relais

  // MULTIPLICATEURS DE VITESSE PAR TYPE DE ROUTE
  // Plus le facteur est élevé, plus le trajet est RAPIDE (divise le temps)
  window.setup.TRAVEL_SPEEDS = {
      'road': 1.0,          // Marche
      'path': 0.8,          // Sentier (plus lent)
      'forest_path': 0.8,
      'mountain_path': 0.7,
      'swamp_path': 0.6,
      'badlands': 0.6,
      'desert_path': 0.7,
      'wild_path': 0.6,
      'tunnel': 0.8,

      // Véhicules & Montures (Plus rapides)
      'carriage': 2.5,      // Diligence / Chariot (x2.5 vitesse)
      'boat': 2.0,          // Bateau fluvial
      'sea': 3.0,           // Navire haute mer
      'sled': 3.5,          // Traîneau sur glace (très rapide)
      'sand_skiff': 4.0,    // Char à voile (très rapide)
      'beetle': 2.0,        // Scarabée géant (Varnäl)
      'cable_car': 2.0,     // Téléphérique
      'air': 8.0,           // Dirigeable / Vol (Ultra rapide)
      'ice_road': 1.2       // Route glacée (marche difficile)
  };

  // Exemple : 300km = 60 secondes d'attente réelle avec ce réglage.

  // Cache pour le graphe de navigation
  window.setup.navGraph = null;


  // -------------------------------------------------------------------------
  // 1. CONSTRUCTION DU GRAPHE DE NAVIGATION
  // -------------------------------------------------------------------------
  window.setup.buildNavigationGraph = function() {
    const geo = window.setup.getGeographyData();
    if (!geo || !geo.nodes) return null;

    const graph = {};
    let isolatedNodes = 0;

    // 1. Initialisation des noeuds
    Object.entries(geo.nodes).forEach(([id, node]) => {
      graph[id] = {
        id: id,
        data: node,
        connections: [],
        continent: node.continent || "Inconnu"
      };
    });

    // 2. Création des arcs (routes)
    geo.routes.forEach(route => {
      const from = route.start;
      const to = route.end;

      if (graph[from] && graph[to]) {
        let dist = route.distance_km;

        // Calcul automatique distance si manquante (Vol d'oiseau)
        if (typeof dist !== 'number') {
          const n1 = geo.nodes[from];
          const n2 = geo.nodes[to];
          const dx = n1.x - n2.x;
          const dy = n1.y - n2.y;
          dist = Math.sqrt(dx * dx + dy * dy) * window.setup.GEO_SCALE;
        }

        // Coût du trajet (Distance * Multiplicateur terrain)
        // Les liens "Link" (Macro->Micro) ont souvent 0km, coût minime pour Dijkstra
        const cost = Math.max(0.1, dist * (route.cost_multiplier || 1.0));

        graph[from].connections.push({ target: to, cost, dist, routeData: route });
        graph[to].connections.push({ target: from, cost, dist, routeData: route });
      } else {
        console.warn(`⚠️ Route brisée: ${route.id} (${from} -> ${to}). Un noeud manque.`);
      }
    });

    // 3. Diagnostic Orphelins (Micro zones non reliées)
    Object.values(graph).forEach(node => {
      if (node.connections.length === 0) {
        // console.debug(`🔍 Info: Noeud isolé (Orphelin) : ${node.id}`);
        isolatedNodes++;
      }
    });

    window.setup.navGraph = graph;
    console.log(`🗺️ Graphe construit: ${Object.keys(graph).length} noeuds, ${isolatedNodes} isolés.`);
    return graph;
  };

  // -------------------------------------------------------------------------
  // 2. ALGORITHME DE DIJKSTRA (Calcul du chemin le plus court)
  // -------------------------------------------------------------------------
  window.setup.findPathInGraph = function(startNodeId, endNodeId) {
    if (!window.setup.navGraph) window.setup.buildNavigationGraph();
    const graph = window.setup.navGraph;

    if (!graph[startNodeId] || !graph[endNodeId]) {
      console.error(`❌ Pathfinding impossible: Noeud inconnu (${startNodeId} ou ${endNodeId})`);
      return null;
    }

    const distances = {};
    const previous = {};
    const pq = new Set(); // File de priorité simple

    // Init
    Object.keys(graph).forEach(id => {
      distances[id] = Infinity;
      pq.add(id);
    });
    distances[startNodeId] = 0;

    while (pq.size > 0) {
      // Extraction min
      let minNode = null;
      let minDist = Infinity;

      // Optimisation: ne scanner que si nécessaire (limite recherche ?)
      // Pour <2000 noeuds, le scan complet est acceptable en JS moderne (~2ms)
      for (const node of pq) {
        if (distances[node] < minDist) {
          minDist = distances[node];
          minNode = node;
        }
      }

      if (minNode === null || minNode === endNodeId) break; // Trouvé ou inaccessible
      if (minDist === Infinity) break; // Reste inaccessible

      pq.delete(minNode);

      // Relâchement des voisins
      for (const edge of graph[minNode].connections) {
        const alt = distances[minNode] + edge.cost;
        if (alt < distances[edge.target]) {
          distances[edge.target] = alt;
          previous[edge.target] = { prevNode: minNode, edge };
        }
      }
    }

    // Reconstruction
    if (distances[endNodeId] === Infinity) return null;

    const path = [];
    let current = endNodeId;
    while (current !== startNodeId) {
      const step = previous[current];
      path.unshift({
        nodeId: current,
        coords: graph[current].data,
        route: step.edge.routeData,
        segmentDist: step.edge.dist
      });
      current = step.prevNode;
    }
    // Ajout départ
    path.unshift({
      nodeId: startNodeId,
      coords: graph[startNodeId].data,
      route: null, // Pas de route pour arriver au départ
      segmentDist: 0
    });

    return path;
  };

  // -------------------------------------------------------------------------
  // 3. GÉNÉRATEUR D'ITINÉRAIRE NARRATIF (Travel & Rest)
  // -------------------------------------------------------------------------
  window.setup.generateItinerary = function(pathResult, destPassage) {
    // Cas 1 : Trajet direct hors réseau (vol d'oiseau)
    if (pathResult.type !== 'network' || !pathResult.pathNodes) {
      return [{
        type: 'travel',
        desc: "Voyage à travers les terres sauvages...",
        startCoords: pathResult.path[0],
        endCoords: pathResult.path[1],
        dist: pathResult.totalDistance,
        duration: window.setup.calculateTravelTime(pathResult.totalDistance, 1.0), // Vitesse marche par défaut
        locationName: "Terres Sauvages"
      }];
    }

    const steps = [];
    const nodes = pathResult.pathNodes;

    // Liste exhaustive des types de lieux permettant le repos (Basé sur velkarum.json)
    const validRestTypes = [
      'Auberge', 'Taverne', 'Relais', 'Bivouac', 'Oasis',
      'Refuge', 'Caravanserail', 'Station', 'Cantine',
      'Ville', 'Village', 'Port', 'Capitale', 'Forteresse', 'Sanctuaire'
    ];

    // On parcourt chaque segment du chemin (de noeud i à i+1)
    for (let i = 0; i < nodes.length - 1; i++) {
      const currentNode = nodes[i];
      const nextNode = nodes[i + 1];
      const routeInfo = nextNode.route;
      const dist = nextNode.segmentDist;

      // --- A. ÉTAPE DE VOYAGE (De A vers B) ---

      // Détermination de la vitesse et du type de route
      const rType = routeInfo ? routeInfo.type : 'road';
      const speedMult = window.setup.TRAVEL_SPEEDS[rType] || 1.0;

      const travelStep = {
        type: 'travel',
        startCoords: {
          x: currentNode.coords.x,
          y: currentNode.coords.y
        },
        endCoords: {
          x: nextNode.coords.x,
          y: nextNode.coords.y
        },
        dist: dist,
        // Calcul du temps basé sur le type de route (Plus speedMult est haut, plus duration est court)
        duration: window.setup.calculateTravelTime(dist, speedMult),
        routeType: rType,
        routeName: routeInfo ? routeInfo.name : 'Piste inconnue',
        targetName: nextNode.coords.name || nextNode.nodeId,
        locationName: "En route"
      };

      // Calcul de la direction cardinale
      const dx = nextNode.coords.x - currentNode.coords.x;
      const dy = nextNode.coords.y - currentNode.coords.y;
      let dir = "";
      if (Math.abs(dy) > Math.abs(dx)) dir = dy > 0 ? "le Sud" : "le Nord";
      else dir = dx > 0 ? "l'Est" : "l'Ouest";

      // Verbe narratif selon le terrain et le moyen de transport
      let verb = "Marche vers";

      // Vocabulaire spécifique selon le type de route
      if (['sea', 'boat'].includes(rType)) verb = "Navigue vers";
      if (['air'].includes(rType)) verb = "Vole vers";
      if (['mountain_path'].includes(rType)) verb = "Grimpe vers";
      if (['tunnel'].includes(rType)) verb = "S'enfonce vers";
      if (['ice_road', 'sled'].includes(rType)) verb = "Glisse vers";
      if (['sand_skiff'].includes(rType)) verb = "File vers";
      if (['carriage'].includes(rType)) verb = "Roule vers";
      if (['beetle'].includes(rType)) verb = "Chevauche vers";

      // Si c'est une route rapide et qu'on quitte une station, c'est plus immersif
      if (routeInfo && routeInfo.name) {
          travelStep.desc = `${verb} ${dir} via ${travelStep.routeName}`;
      } else {
          travelStep.desc = `${verb} ${dir}`;
      }

      steps.push(travelStep);

      // --- B. ÉTAPE DE REPOS (Arrivé à B) ---
      // On ne se repose que si :
      // 1. Le nœud d'arrivée est un type valide (Auberge, Relais...).
      // 2. Ce n'est PAS la destination finale du voyage entier (car à la fin, le PNJ redevient 'fixed').
      const nodeType = nextNode.coords.type;
      const isFinalDestination = (i === nodes.length - 2);

      if (!isFinalDestination && validRestTypes.includes(nodeType)) {
        let restVerb = "Se repose";
        // Ambiance selon le lieu
        if (['Taverne', 'Cantine'].includes(nodeType)) restVerb = "Boit un verre";
        if (['Bivouac', 'Refuge'].includes(nodeType)) restVerb = "Monte le camp";
        if (['Ville', 'Capitale', 'Village'].includes(nodeType)) restVerb = "Fait une halte";
        if (nodeType === 'Sanctuaire') restVerb = "Prie";
        if (nodeType === 'Station') restVerb = "Change de monture";
        if (nodeType === 'Caravanserail') restVerb = "Ravitaille";

        steps.push({
          type: 'rest',
          desc: `${restVerb} à ${nextNode.coords.name}`,
          locationName: nextNode.coords.name,
          duration: window.setup.REST_DURATION, // Durée fixe pour le repos
          coords: {
            x: nextNode.coords.x,
            y: nextNode.coords.y
          },
          dist: 0 // Le repos n'avance pas les km
        });
      }
    }

    return steps;
  };

  // -------------------------------------------------------------------------
  // 4. DÉMARRAGE DU VOYAGE SÉQUENTIEL
  // -------------------------------------------------------------------------
  window.setup.startPNJTravel = function(pnjId, destPassage, destCoords, destContinent, type) {
    const v = State.variables;
    const npc = v.npcs[pnjId];
    if (!npc) return false;

    const startCoords = npc.coordinates || {
      x: 0,
      y: 0
    };

    // 1. Calcul de la route complexe (Graph)
    const pathData = window.setup.calculateComplexRoute(startCoords, destCoords);
    // 2. Génération des étapes (Voyage -> Repos -> Voyage)
    const itinerary = window.setup.generateItinerary(pathData, destPassage);

    // 3. Initialisation
    npc.status = 'traveling';
    npc.travelItinerary = itinerary;
    npc.travelStepIndex = 0;

    // Calcul des totaux pour l'UI
    let totalItineraryDist = 0;
    let totalItineraryTime = 0;

    // --- NOUVEAU : LOG DÉTAILLÉ DES ÉTAPES ---
    console.group(`✈️ [VOYAGE] DÉTAILS : ${npc.name} part pour ${destPassage}`);
    console.log(`📍 Départ : (${startCoords.x}, ${startCoords.y}) -> Arrivée : (${destCoords.x}, ${destCoords.y})`);

    itinerary.forEach((step, index) => {
      totalItineraryDist += (step.dist || 0);
      totalItineraryTime += (step.duration || 0);

      // Log de chaque étape
      const durationSec = (step.duration / 1000).toFixed(1);
      const icon = step.type === 'rest' ? '💤' : '🚶';
      console.log(`   [Étape ${index + 1}] ${icon} ${step.type.toUpperCase()} | Durée: ${durationSec}s | Dist: ${step.dist ? step.dist.toFixed(1) : 0}km | Desc: "${step.desc}"`);
    });

    console.log(`🏁 TOTAL : ${itinerary.length} étapes | ${(totalItineraryTime/1000).toFixed(1)}s | ${totalItineraryDist.toFixed(1)} km`);
    console.groupEnd();
    // -----------------------------------------

    npc.travelTotalDistance = totalItineraryDist;

    npc.travelDestination = {
      passage: destPassage,
      coordinates: {
        ...destCoords
      },
      continent: destContinent,
      type: type
    };

    // 4. Lancer la première étape
    window.setup.executeTravelStep(npc);

    if (window.renderBuddiesPanel) window.renderBuddiesPanel();

    return true;
  };

  // -------------------------------------------------------------------------
  // 5. EXÉCUTION D'UNE ÉTAPE (Récursive via Timeout)
  // -------------------------------------------------------------------------
  window.setup.executeTravelStep = function(npc) {
    // Vérification : Voyage terminé ?
    if (!npc.travelItinerary || npc.travelStepIndex >= npc.travelItinerary.length) {
      window.setup.completePNJTravel(npc.name);
      return;
    }

    const step = npc.travelItinerary[npc.travelStepIndex];
    const now = Date.now();

    // Configuration de l'étape actuelle
    npc.travelCurrentStep = {
      ...step,
      startTime: now,
      endTime: now + step.duration
    };

    // Mise à jour immédiate des coordonnées "logiques" (pour save)
    // (L'interpolation visuelle se fait dans updatePNJPositionDuringTravel)
    if (step.type === 'rest') {
      npc.coordinates = {
        ...step.coords
      };
    } else if (step.type === 'travel') {
      npc.coordinates = {
        ...step.startCoords
      };
    }

    // Planification de la prochaine étape
    if (npc.travelTimeout) clearTimeout(npc.travelTimeout);

    npc.travelTimeout = setTimeout(() => {
      npc.travelStepIndex++;
      window.setup.executeTravelStep(npc); // Appel récursif
    }, step.duration);

    // Rafraîchir le panneau pour afficher la description actuelle (ex: "Se repose à...")
    if (window.renderBuddiesPanel) window.renderBuddiesPanel();
  };

  // -------------------------------------------------------------------------
  // 6. INTERPOLATION FLUIDE (Appelé par la boucle de rendu UI)
  // -------------------------------------------------------------------------
  window.setup.updatePNJPositionDuringTravel = function(npc) {
    if (npc.status !== 'traveling' || !npc.travelCurrentStep) return;

    const step = npc.travelCurrentStep;

    // Pendant un repos, on ne bouge pas
    if (step.type === 'rest') return;

    // Pendant un voyage, on interpole entre start et end
    if (step.type === 'travel') {
      const now = Date.now();
      const elapsed = now - step.startTime;
      const duration = step.endTime - step.startTime;
      // Clamp entre 0 et 1 pour éviter de dépasser
      const progress = Math.min(1, Math.max(0, elapsed / duration));

      npc.coordinates.x = step.startCoords.x + (step.endCoords.x - step.startCoords.x) * progress;
      npc.coordinates.y = step.startCoords.y + (step.endCoords.y - step.startCoords.y) * progress;
    }
  };

  // -------------------------------------------------------------------------
  // 7. UTILITAIRES DE ROUTAGE
  // -------------------------------------------------------------------------
  window.setup.calculateComplexRoute = function(startCoords, endCoords, startContinent, endContinent) {
    if (!window.setup.navGraph) window.setup.buildNavigationGraph();
    const graph = window.setup.navGraph;

    // Normalisation
    const sCont = (startContinent || "Eldaron").trim();
    const eCont = (endContinent || "Eldaron").trim();

    // Trouver les noeuds d'ancrage les plus proches
    const getClosestNode = (coords, continent) => {
      let bestNode = null;
      let bestDist = Infinity;

      Object.values(graph).forEach(node => {
        // Filtre par continent pour éviter de lier Eldaron à Varnal par magie
        if (node.continent !== continent && continent !== 'Ocean') return;

        const dx = node.data.x - coords.x;
        const dy = node.data.y - coords.y;
        const d2 = dx*dx + dy*dy;

        // Priorité aux noeuds "exacts" (Micro) si on est dessus (dist < 0.01)
        if (d2 < 0.0001) {
           bestDist = d2;
           bestNode = node.id;
           return; // Trouvé exact !
        }

        if (d2 < bestDist) {
          bestDist = d2;
          bestNode = node.id;
        }
      });
      return { id: bestNode, dist: Math.sqrt(bestDist) * window.setup.GEO_SCALE };
    };

    const startAnchor = getClosestNode(startCoords, sCont);
    const endAnchor = getClosestNode(endCoords, eCont);

    // Si pas de noeuds trouvés (ex: au milieu de l'océan sans waypoints)
    if (!startAnchor.id || !endAnchor.id) {
      console.warn("⚠️ Hors réseau: Voyage direct forcé.");
      return {
        type: 'direct',
        pathNodes: [],
        totalDistance: window.setup.calculateDistance(startCoords, endCoords)
      };
    }

    // Calcul itinéraire réseau
    const graphPath = window.setup.findPathInGraph(startAnchor.id, endAnchor.id);

    if (!graphPath) {
      // Si même continent, on autorise le "Hors Piste" (Direct)
      if (sCont === eCont) {
        return {
          type: 'direct',
          pathNodes: [],
          totalDistance: window.setup.calculateDistance(startCoords, endCoords) * 1.5 // Pénalité terrain
        };
      }
      console.error(`❌ Aucun chemin entre ${sCont} et ${eCont}`);
      return { type: 'error', totalDistance: 0 };
    }

    // Calcul distance totale (Marche vers Ancre A + Trajet Réseau + Marche depuis Ancre B)
    let totalDist = startAnchor.dist + endAnchor.dist;
    graphPath.forEach(step => totalDist += (step.segmentDist || 0));

    return {
      type: 'network',
      pathNodes: graphPath,
      totalDistance: totalDist
    };
  };

  window.setup.calculateTravelTime = function(distanceKm, speedMultiplier = 1.0) {
    // Minimum 2 secondes pour éviter les glitches sur courtes distances
    // Le temps est divisé par le multiplicateur de vitesse
    const baseTime = distanceKm * window.setup.MS_PER_KM;
    const finalTime = baseTime / speedMultiplier;

    return Math.floor(Math.max(2000, finalTime));
  };

  window.setup.completePNJTravel = function(pnjId) {
    const v = State.variables;
    const npc = v.npcs[pnjId];
    if (!npc) return;

    const dest = npc.travelDestination;
    if (dest) {
      npc.passage = dest.passage;
      npc.coordinates = {
        ...dest.coordinates
      };
      npc.continent = dest.continent;
      npc.status = (dest.type === 'follow') ? 'follow' : 'fixed';
    }

    // Nettoyage
    delete npc.travelItinerary;
    delete npc.travelStepIndex;
    delete npc.travelCurrentStep;
    delete npc.travelDestination;
    if (npc.travelTimeout) clearTimeout(npc.travelTimeout);

    // Notification d'arrivée discrète
    window.setup.showDialogueNotificationShort(npc.name, "Je suis arrivé.", "Arrivée à destination", false);

    if (window.renderBuddiesPanel) window.renderBuddiesPanel();
  };

  // Mise à jour des suiveurs
  window.setup.updateFollowersCoordinates = function() {
    // On attend un tout petit peu que le moteur Twine ait fini de rendre le passage
    setTimeout(() => {
      const v = State.variables;

      // 1. On s'assure que le joueur est bien localisé avant de bouger les PNJ
      const playerPos = window.setup.syncPlayerPosition();
      const destinationPassage = playerPos.passage;
      const destCoords = { x: playerPos.x, y: playerPos.y };
      const destContinent = playerPos.continent;

      // Debug optionnel
      // console.log(`👥 [FOLLOW] Update followers vers (${destCoords.x}, ${destCoords.y}) sur ${destContinent}`);

      Object.entries(v.npcs || {}).forEach(([pnjId, npc]) => {
        // Vérifications de base : doit être un compagnon, vivant, actif, spawned
        if (npc.status === 'follow' && npc.isBuddy && npc.isAlive && npc.isActive && npc.isSpawned) {

          // Si le PNJ est déjà au bon endroit (même passage), on ne fait rien
          if (npc.passage === destinationPassage && !npc.travelDestination) return;

          // Reroutage si le PNJ était déjà en voyage vers une autre destination
          if (npc.status === 'traveling') {
            // On met à jour sa position virtuelle actuelle avant de changer de cap
            window.setup.updatePNJPositionDuringTravel(npc);
            if (npc.travelTimeout) clearTimeout(npc.travelTimeout);
          }

          // Calcul de distance
          const distDirect = window.setup.calculateDistance(
              npc.coordinates,
              destCoords,
              npc.continent,
              destContinent
          );

          // LOGIQUE DE DÉPLACEMENT
          // Si distance > 0.5km (pour éviter les micro-mouvements dans une pièce)
          // ET que c'est sur le même continent (ou géré par le pathfinding complexe)
          if (distDirect > 0.5) {
             // Le PNJ voyage vers le joueur
             window.setup.startPNJTravel(
                 pnjId,
                 destinationPassage,
                 destCoords,
                 destContinent,
                 'follow'
             );
          } else {
             // Trop proche : Téléportation discrète (ex: entrer dans une auberge depuis la rue devant)
             window.setup.stopPNJTravelAndTeleport(npc, destinationPassage, destCoords);
             npc.continent = destContinent; // Important : sync le continent
          }
        }
      });

      if (window.setup.updateHUD) window.setup.updateHUD();
    }, 50); // Délai court (50ms)
  };


  window.setup.stopPNJTravelAndTeleport = function(npc, passage, coords) {
    npc.status = 'follow';
    npc.passage = passage;
    npc.coordinates = {
      ...coords
    };
    delete npc.travelDestination;
    delete npc.travelItinerary;
    delete npc.travelCurrentStep;
    if (npc.travelTimeout) clearTimeout(npc.travelTimeout);
  };

    window.setup.calculateDistance = function(c1, c2) {
    const dx = c1.x - c2.x;
    const dy = c1.y - c2.y;
    return Math.sqrt(dx*dx + dy*dy) * window.setup.GEO_SCALE;
  };

  // 6. SÉCURITÉ COORDONNÉES
  window.setup.ensurePassageCoords = function(passageName) {
    const v = State.variables;
    v.passageCoords = v.passageCoords || {};

    if (!v.passageCoords[passageName]) {
      // Si le passage n'a pas de coords (pas de <<setcoords>>), on crée un point par défaut
      // Pour éviter les bugs, on utilise une position neutre ou celle du joueur,
      // mais marquée comme "défaut".
      const defX = v.playerCoordinates ? v.playerCoordinates.x : 0;
      const defY = v.playerCoordinates ? v.playerCoordinates.y : 0;

      v.passageCoords[passageName] = {
        x: defX,
        y: defY,
        continent: "Eldaron",
        isDefault: true
      };
    }
    return v.passageCoords[passageName];
  };

  window.setup.cancelPNJTravel = function(pnjId) {
    const npc = npcEnsure(pnjId);

    if (npc.travelTimeout) {
      clearTimeout(npc.travelTimeout);
      console.log(`✈️ Voyage de ${pnjId} annulé`);
    }

    // Nettoyer les données de voyage
    delete npc.travelStartTime;
    delete npc.travelEndTime;
    delete npc.travelDestination;
    delete npc.travelTimeout;

    // Remettre le statut précédent
    npc.status = 'fixed';
  };

  // FONCTION DE DIAGNOSTIC DES VOYAGES PNJ
  window.setup.debugPNJTravel = function(pnjId = null) {
    console.group("🔍 DIAGNOSTIC VOYAGES PNJ");

    const v = V();
    const npcs = pnjId ? {
      [pnjId]: v.npcs[pnjId]
    } : v.npcs;

    Object.entries(npcs || {}).forEach(([id, npc]) => {
      console.log(`--- ${id} ---`);
      console.log(`• Statut: ${npc.status}`);
      console.log(`• Coordonnées: (${npc.coordinates?.x}, ${npc.coordinates?.y})`);
      console.log(`• Continent: ${npc.continent}`);
      console.log(`• Passage: ${npc.passage}`);
      console.log(`• En vie: ${npc.isAlive}`);
      console.log(`• Actif: ${npc.isActive}`);
      console.log(`• Compagnon: ${npc.isBuddy}`);

      if (npc.status === 'traveling') {
        const remaining = npc.travelEndTime ? npc.travelEndTime - Date.now() : 0;
        console.log(`• En voyage: ${remaining > 0 ? `${(remaining/1000).toFixed(1)}s restantes` : 'EN RETARD'}`);
        console.log(`• Destination:`, npc.travelDestination);

        if (npc.travelDestination) {
          const distance = window.setup.calculateDistance(
            npc.coordinates,
            npc.travelDestination.coordinates,
            npc.continent,
            npc.travelDestination.continent
          );
          console.log(`• Distance restante: ${distance.toFixed(1)}`);
        }
      }
    });

    console.log("📍 Coordonnées joueur:", v.playerCoordinates);
    console.log("📍 Passage actuel:", State.passage);
    console.log("📍 Coordonnées passage actuel:", v.passageCoords?.[State.passage]);
    console.groupEnd();
  };

  // À appeler dans la console : setup.debugPNJTravel()

  //#endregion

  //#region ENVIRONNEMENT — fond, ambiance sonore
  // ------------------------------------------------------
  // ENVIRONNEMENT — fond, ambiance sonore
  // ------------------------------------------------------
  window.setup.applyEnvBackground = function(env) {
    const v = V();
    if (v.currentEnv === env) return; // éviter flicker si même fond
    v.currentEnv = env;
    const bg = (v.envBackgrounds || {})[env];
    if (bg) {
      const currentBg = $('body').css('background-image');
      const newBg = `url("${bg}")`;
      if (currentBg !== newBg) {
        $('body').css({
          'background-image': newBg,
          'background-size': 'cover',
          'background-position': 'center',
          'background-repeat': 'no-repeat',
          'transition': 'background-image .6s ease-in-out'
        });
      }
    }
  };
  //#endregion

  //#region UTILITAIRES GÉNÉRAUX
  // ------------------------------------------------------
  // UTILITAIRES GÉNÉRAUX
  // ------------------------------------------------------
  window.setup.escapeHtml = function(str) {
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m]);
  };
  /* ==========================================================
  FONCTION UNIQUE — ENCARTS D’OBJETS (ARMES, SOINS, BONUS)
  Compatible CSS existant (bonus-tag, effect-tag, twohanded-tag)
  ========================================================== */
  window.setup.renderItemEncarts = function(item) {
    if (!item) return "";
    const ICONS = window.ICONS || {};
    const tags = [];

    /* ------------------------------------------------------
       1) BONUS CLASSIQUES (force, santé, magie, résistance…)
       ------------------------------------------------------ */
    if (item.bonus && typeof item.bonus === "object") {
      const bonusIcons = {
        strength: ICONS.strength,
        resistance: ICONS.defense,
        health: ICONS.health,
        magic: ICONS.magic
      };
      Object.keys(item.bonus).forEach(k => {
        const val = item.bonus[k];
        const ic = bonusIcons[k] ?
          `<img class="icon-08em" src="${bonusIcons[k]}" alt="">` :
          '';
        tags.push(`
                        <span class="bonus-tag">
                            ${ic}${val}
                        </span>
                    `);
      });
    }

    /* ------------------------------------------------------
       2) ARMES — dégâts, vitesse, critique
       ------------------------------------------------------ */
    if (item.type === "weapon") {
      // --- DÉGÂTS ---
      if (item.damage) {
        const dmg = item.damage;
        let dmgText = '';
        if (typeof dmg.min !== "undefined" && typeof dmg.max !== "undefined") {
          dmgText = `${dmg.min}-${dmg.max}`;
        } else if (typeof dmg.min !== "undefined") {
          dmgText = `${dmg.min}`;
        } else if (typeof dmg.max !== "undefined") {
          dmgText = `${dmg.max}`;
        } else {
          dmgText = '?';
        }
        tags.push(`
                        <span class="bonus-tag">
                            <img class="icon-08em" src="images/icons/damages.png" alt="Dégâts">
                            ${dmgText}
                        </span>
                    `);
      }

      // --- COEFFICIENT DE RAPIDITÉ ---
      if (typeof item.coeff !== "undefined") {
        tags.push(`
                        <span class="bonus-tag">
                            <img class="icon-08em" src="images/icons/dexterity.png" alt="Rapidité">
                            ${item.coeff}
                        </span>
                    `);
      }

      // --- VITESSE --- (affichage alternatif si coeff n'existe pas)
      if (typeof item.speed !== "undefined" && typeof item.coeff === "undefined") {
        tags.push(`
                        <span class="bonus-tag">
                            <img class="icon-08em" src="images/icons/dexterity.png" alt="Vitesse">
                            ${item.speed}
                        </span>
                    `);
      }

      // --- CRITIQUE ---
      if (typeof item.critChance !== "undefined") {
        const cc = item.critChance;
        const cm = typeof item.critMultiplier !== "undefined" ? ` x${item.critMultiplier}` : '';
        tags.push(`
                        <span class="bonus-tag">
                            <img class="icon-08em" src="images/icons/critical.png" alt="Critique">
                            ${cc}%${cm}
                        </span>
                    `);
      }
    }

    /* ------------------------------------------------------
       3) EFFETS SPÉCIAUX (poison, feu, givre…)
       ------------------------------------------------------ */
    if (item.effects && Array.isArray(item.effects)) {
      item.effects.forEach(e => {
        tags.push(`
                        <span class="effect-tag">
                            ${window.setup.escapeHtml(e)}
                        </span>
                    `);
      });
    }

    /* ------------------------------------------------------
       4) Arme à deux mains (UNIQUEMENT pour les armes)
       ------------------------------------------------------ */
    if (item.type === "weapon" && item.isTwoHanded) {
      tags.push(`<span class="twohanded-tag">2M</span>`);
    }

    return `<div class="item-tags">${tags.join("")}</div>`;
  };
  window.setup.renderBonusTags = function(bonus, isTwoHanded) {
    const ICONS = window.ICONS || {};
    const bonusIcons = {
      strength: ICONS.strength,
      resistance: ICONS.defense,
      health: ICONS.health,
      magic: ICONS.magic
    };
    let html = '<span class="item-bonus">';
    if (bonus) {
      Object.keys(bonus).forEach(k => {
        const val = bonus[k];
        const ic = bonusIcons[k] ? `<img class="icon-08em" src="${bonusIcons[k]}" alt="">` : '';
        html += `<span class="bonus-tag">${ic}+${val}</span>`;
      });
    }
    if (isTwoHanded) {
      html += `<span class="twohanded-tag">2M</span>`;
    }
    html += '</span>';
    return html;
  };
  window.setup.customConfirm = function(message, callback, x, y) {
    $('#confirm-alert, #modal-overlay').remove();
    const $overlay = $('<div id="modal-overlay"></div>').appendTo('body');
    const $alert = $(`
                <div id="confirm-alert" class="border-medieval">
                    <p>${message}</p>
                    <div class="btns"></div>
                </div>
            `).appendTo('body');
    $('<button type="button">Oui</button>').on('click', () => {
      callback(true);
      $alert.remove();
      $overlay.remove();
    }).appendTo($alert.find('.btns'));
    $('<button type="button">Non</button>').on('click', () => {
      callback(false);
      $alert.remove();
      $overlay.remove();
    }).appendTo($alert.find('.btns'));
    $alert.css({
      top: (y || window.innerHeight / 2 - 100) + 'px',
      left: (x ? x - 150 : window.innerWidth / 2 - 150) + 'px'
    });
  };
  // ------------------------------------------------------
  // NOTIFICATIONS GÉNÉRALES
  // ------------------------------------------------------
  window.setup.showNotification = function(title, text, duration = 3000, x, y, textColor) {
    let $container = $('#notification-container');
    if (!$container.length) {
      $container = $('<div id="notification-container"></div>').appendTo('body');
    }
    const $n = $('<div class="notification border-medieval"></div>');
    // Structure harmonisée : titre + divider + message
    $n.append(`
                <div class="notification-content">
                    <img class="icon-1em" src="${ICONS.inventory}" alt="Notification">
                    <div class="notification-text">
                        ${title ? `<div class="notification-title"><strong>${window.setup.escapeHtml(title)}</strong></div>` : ''}
                        ${title && text ? `<div class="notification-divider"></div>` : ''}
                        ${text ? `<div class="notification-message" style="color:${textColor || '#fff'}">${window.setup.escapeHtml(text)}</div>` : ''}
                    </div>
                </div>
            `);
    $container.append($n);
    window.setup.activeNotifications = window.setup.activeNotifications || [];
    window.setup.activeNotifications.push($n);
    setTimeout(() => $n.addClass('show'), 10);
    setTimeout(() => {
      $n.removeClass('show').addClass('hide');
      setTimeout(() => {
        $n.remove();
        window.setup.activeNotifications = window.setup.activeNotifications.filter(el => el !== $n);
      }, 500);
    }, duration);
  };
  // ------------------------------------------------------
  // NOTIFICATIONS COMPAGNON (PNJ / BUDDY) — AVEC ICÔNE
  // ------------------------------------------------------
  window.setup.notifyBuddy = function(text, duration = 3500) {
    let $container = $('#notification-container');
    if (!$container.length) {
      $container = $('<div id="notification-container"></div>').appendTo('body');
    }
    const $n = $('<div class="notification border-medieval"></div>');
    // Structure complète et cohérente : icône + texte
    $n.append(`
            <div class="notification-content">
                <img class="icon-1em" src="${ICONS.buddy}" alt="Compagnon">
                <div class="notification-text">
                    <div class="notification-title"><strong>Compagnon</strong></div>
                    <div class="notification-divider"></div>
                    <div class="notification-message">${window.setup.escapeHtml(text)}</div>
                </div>
            </div>
        `);
    $container.append($n);
    setTimeout(() => $n.addClass('show'), 10);
    setTimeout(() => {
      $n.addClass('hide');
      setTimeout(() => $n.remove(), 400);
    }, duration);
    try {
      new Wikifier(null, '<<audio "notif_dialogue" play volume 0.8>>');
    } catch (e) {}
  };
  // ------------------------------------------------------
  // NOTIFICATIONS DE DIALOGUE + BOÎTE DE MESSAGES PNJ
  // ------------------------------------------------------
  if (!window.messagesInitialized) {
    $(document).one(':storyready', function() {
      window.messagesInitialized = true;
      const v = V();
      v.messages = v.messages || [];
      if (!$('#messages-panel').length) {
        $('body').append('<div id="messages-panel" class="side-panel"></div>');
      }
      $(document).on('hudready', function() {
        const $toggles = $('#hud .hud-toggles');
        if ($toggles.length && !$('#messages-toggle').length) {
          $toggles.prepend(`
                        <div id="messages-toggle" title="Messages">
                            <img class="icon-1em" src="${ICONS.speak}" alt="Messages">
                            <span id="messages-counter" class="counter">0</span>
                        </div>
                    `);
        }
        window.setup.updateMessageCounter();
      });
      $(document).off('click', '#messages-toggle').on('click', '#messages-toggle', function() {
        $('.side-panel').removeClass('show');
        $('#messages-panel').toggleClass('show');
        window.setup.renderMessagesPanel();
      });
      $(document).off('click.msgclose').on('click.msgclose', function(e) {
        if (!$(e.target).closest('#messages-panel, #messages-toggle').length) {
          $('#messages-panel').removeClass('show');
        }
      });
    });
  }
  // ------------------------------------------------------
  // AJOUT MESSAGE PNJ
  // ------------------------------------------------------
  window.setup.addMessage = function(npc, shortText, fullText, status = 'new') {
    const v = V();
    v.messages = v.messages || [];
    const id = 'msg-' + Date.now();
    v.messages.push({
      id,
      npc,
      shortText,
      fullText,
      timestamp: Date.now(),
      status
    });
    window.setup.updateMessageCounter();
    window.setup.renderMessagesPanel();
  };

  // ------------------------------------------------------
  // NOTIFICATIONS DE DIALOGUE
  // ------------------------------------------------------
  window.setup.showDialogueNotification = function(npc, shortText, fullText, saveToMessages = true) {
    let $container = $('#notification-container');
    if (!$container.length) {
      $container = $('<div id="notification-container"></div>').appendTo('body');
    }
    const $n = $('<div class="notification border-medieval"></div>');
    const icon = `<img class="icon-1em" src="${ICONS.speak}" alt="Dialogue">`;

    // Structure visuelle : nom PNJ → divider → message → bouton
    $n.append(`
                <div class="notification-content">
                    ${icon}
                    <div class="notification-text">
                        <div class="notification-title"><strong>${window.setup.escapeHtml(npc)}</strong></div>
                        <div class="notification-divider"></div>
                        <div class="notification-message">${window.setup.escapeHtml(shortText)}</div>
                        <div class="notification-divider"></div>
                        <button class="notif-btn">Ouvrir</button>
                    </div>
                </div>
            `);

    $container.append($n);
    setTimeout(() => $n.addClass('show'), 10);

    let opened = false;
    let removed = false;

    // --- Clic sur le bouton "Ouvrir"
    $n.on('click', '.notif-btn', function(e) {
      e.stopPropagation();
      if (removed) return;
      opened = true;
      removed = true;

      // Sauvegarde du message seulement si saveToMessages = true
      if (saveToMessages) {
        window.setup.addMessage(npc, shortText, fullText, 'read');
      }
      window.setup.showMessageModal({
        npc,
        fullText
      });
      $n.remove();
    });

    // --- Fermeture automatique (non ouverte)
    const autoClose = setTimeout(() => {
      if (removed) return;
      removed = true;
      if ($n.is(':visible')) {
        $n.addClass('hide');
        setTimeout(() => {
          $n.remove();
          // Sauvegarde du message seulement si saveToMessages = true ET non ouvert
          if (!opened && saveToMessages) {
            window.setup.addMessage(npc, shortText, fullText, 'new');
          }
        }, 400);
      }
    }, 5000);

    $n.on('remove', function() {
      removed = true;
      clearTimeout(autoClose);
    });

    try {
      new Wikifier(null, '<<audio "notif_dialogue" play volume 0.8>>');
    } catch (e) {}
  };

  /* ==========================================================
   NOTIFICATION DE DIALOGUE COURTE - sans bouton, non-empilable, durée réduite
  ========================================================== */
  window.setup.showDialogueNotificationShort = function(npc, shortText, fullText, saveToMessages = true) {
    let $container = $('#notification-container');
    if (!$container.length) {
      $container = $('<div id="notification-container"></div>').appendTo('body');
    }

    // Supprimer toute notification de dialogue courte existante pour éviter l'empilement
    $('.dialogue-notification-short').remove();

    const $n = $('<div class="notification border-medieval dialogue-notification-short"></div>');
    const icon = `<img class="icon-1em" src="${ICONS.speak}" alt="Dialogue">`;

    // Structure simplifiée : nom PNJ → message (sans bouton)
    $n.append(`
            <div class="notification-content">
                ${icon}
                <div class="notification-text">
                    <div class="notification-title"><strong>${window.setup.escapeHtml(npc)}</strong></div>
                    <div class="notification-divider"></div>
                    <div class="notification-message">${window.setup.escapeHtml(shortText)}</div>
                </div>
            </div>
        `);

    $container.append($n);

    // Animation d'apparition
    setTimeout(() => $n.addClass('show'), 10);

    let removed = false;

    // Fermeture automatique après durée réduite (2000ms au lieu de 5000ms)
    const autoClose = setTimeout(() => {
      if (removed) return;
      removed = true;
      if ($n.is(':visible')) {
        $n.addClass('hide');
        setTimeout(() => {
          $n.remove();
          // Sauvegarde optionnelle dans les messages
          if (saveToMessages) {
            window.setup.addMessage(npc, shortText, fullText, 'new');
          }
        }, 400);
      }
    }, 3000); // Durée réduite à 2 secondes

    // Gestion du clic pour fermer immédiatement
    $n.on('click', function() {
      if (removed) return;
      removed = true;
      clearTimeout(autoClose);
      $n.addClass('hide');
      setTimeout(() => {
        $n.remove();
        if (saveToMessages) {
          window.setup.addMessage(npc, shortText, fullText, 'new');
        }
      }, 400);
    });

    $n.on('remove', function() {
      removed = true;
      clearTimeout(autoClose);
    });

    // Son de notification (optionnel)
    try {
      new Wikifier(null, '<<audio "notif_dialogue" play volume 0.8>>');
    } catch (e) {
      console.warn('Audio notification failed:', e);
    }
  };

  // ------------------------------------------------------
  // MISE À JOUR DU COMPTEUR DE MESSAGES
  // ------------------------------------------------------
  window.setup.updateMessageCounter = function() {
    const v = V();
    const unread = (v.messages || []).filter(m => m.status === 'new').length;
    const $c = $('#messages-counter');
    if ($c.length) {
      $c.text(unread > 0 ? unread : '').toggle(unread > 0);
    }
  };
  // ------------------------------------------------------
  // RENDU DU PANNEAU DE MESSAGES
  // ------------------------------------------------------
  window.setup.renderMessagesPanel = function() {
    const v = V();
    const $panel = $('#messages-panel').empty();
    if (!v.messages || !v.messages.length) {
      $panel.html('<em style="opacity:.6; font-style:italic;">Aucun message reçu.</em>');
      return;
    }
    v.messages
      .slice()
      .sort((a, b) => a.status === 'new' ? -1 : 1)
      .forEach(m => {
        const isNew = m.status === 'new';
        const cls = `message-entry${isNew ? ' new' : ''}`;
        const badge = isNew ? '<span class="item-new">Non lu</span>' : '';
        $panel.append(`
                        <div class="${cls}" data-id="${m.id}">
                            <div class="msg-header">
                                <img class="icon-1em" src="${ICONS.speak}" alt="">
                                <strong>${window.setup.escapeHtml(m.npc)}</strong>
                                ${badge}
                            </div>
                            <div class="msg-short">${window.setup.escapeHtml(m.shortText)}</div>
                        </div>
                    `);
      });
    $panel.find('.message-entry').off('click').on('click', function() {
      const id = $(this).data('id');
      const msg = v.messages.find(m => m.id === id);
      if (!msg) return;
      msg.status = 'read';
      window.setup.showMessageModal(msg);
      window.setup.updateMessageCounter();
      window.setup.renderMessagesPanel();
    });
  };
  // ------------------------------------------------------
  // NOTIFICATIONS DE QUÊTE
  // ------------------------------------------------------
  window.setup.showQuestNotification = function(title, text) {
    let $container = $('#notification-container');
    if (!$container.length) {
      $container = $('<div id="notification-container"></div>').appendTo('body');
    }
    const $n = $('<div class="notification quest-notification border-medieval"></div>');
    // Structure unifiée : icône → titre → divider → texte
    $n.append(`
                <div class="notification-content">
                    <img class="icon-1em" src="${ICONS.quest}" alt="Quête">
                    <div class="notification-text">
                        <div class="notification-title"><strong>${window.setup.escapeHtml(title)}</strong></div>
                        <div class="notification-divider"></div>
                        <div class="notification-message">${window.setup.escapeHtml(text)}</div>
                    </div>
                </div>
            `);
    $container.append($n);
    setTimeout(() => $n.addClass('show'), 10);
    setTimeout(() => {
      $n.addClass('hide');
      setTimeout(() => $n.remove(), 400);
    }, 5000);
    try {
      new Wikifier(null, '<<audio "notif_quest" play volume 0.8>>');
    } catch (e) {}
  };

  /* =========================================================================
     FONCTION UNIFIÉE — CONSTRUCTION MODALE STANDARD
     ========================================================================= */
  window.setup.buildModalHTML = function(options) {
    const { title, icon, content, footer = '', className = '' } = options;
    const safeTitle = window.setup.escapeHtml(title || '');
    // Gestion de l'icône : on s'assure qu'elle existe avant de créer la balise img
    const iconHTML = icon ? `<img class="icon-1em" src="${icon}" alt="" onerror="this.style.display='none'">` : '';

    return `
        <div class="modal-content border-medieval ${className}">
            <div class="modal-header">
                ${iconHTML}
                <span>${safeTitle}</span>
            </div>
            <div class="modal-body">
                ${content}
            </div>
            ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
        </div>
    `;
  };


  /* =========================================================================
     FONCTION UNIFIÉE — CONSTRUCTION MODALE ITEM (SANS EN-TÊTE INTERNE)
     ========================================================================= */
  window.setup.buildItemModalHTML = function(item) {
    const safeDesc = window.setup.escapeHtml(item.description || '');

    /* ---------- Caractéristiques (encarts bonus/tags) ---------- */
    let encartsHTML = '';
    if (typeof window.setup.renderItemEncarts === 'function') {
      encartsHTML = window.setup.renderItemEncarts(item) || '';
    }
    const hasEncarts = encartsHTML.trim().length > 0;

    /* ---------- Effets Spéciaux (Armes/Magie) ---------- */
    let effectsHTML = '';
    if (item.effects && Array.isArray(item.effects) && item.effects.length > 0) {
      effectsHTML =
        '<ul style="margin-top:0.5em; padding-left:1.2em; color:#aaa; font-style:italic;">' +
        item.effects.map(e => `<li>${window.setup.escapeHtml(e)}</li>`).join('') +
        '</ul>';
    }

    /* ---------- Requirements (Pré-requis) ---------- */
    let requirementsHTML = '';
    if (item.requirements && typeof item.requirements === 'object') {
      const req = item.requirements;
      const requirementsLines = [];

      // Fonction helper pour formater une ligne de pré-requis
      const addReq = (label, val) => {
          requirementsLines.push(`
            <div style="display:flex; justify-content:space-between; font-size:0.9em; color:#ccc; border-bottom:1px dashed rgba(255,255,255,0.1); padding:2px 0;">
                <span>${label}</span>
                <span style="font-weight:bold; color:#fff;">${val}</span>
            </div>
          `);
      };

      if (req.levelMin) addReq("Niveau requis", req.levelMin);
      if (req.forceMin) addReq("Force requise", req.forceMin);
      if (req.dexMin)   addReq("Dextérité requise", req.dexMin);

      if (requirementsLines.length > 0) {
        requirementsHTML = `
            <div class="item-stats-divider" style="margin:1em 0; border-top:1px solid rgba(255,255,255,0.2);"></div>
            <div style="background:rgba(0,0,0,0.2); padding:0.5em; border-radius:4px;">
                <div style="color:#f2d675; font-weight:bold; font-size:0.9em; margin-bottom:0.3em; text-transform:uppercase;">Pré-requis</div>
                ${requirementsLines.join('')}
            </div>
        `;
      }
    }

    /* =========================================================
       ASSEMBLAGE DU CORPS DE L'OBJET
       ========================================================= */
    return `
        <div style="font-style:italic; color:#ddd; margin-bottom:1em; line-height:1.4;">
            ${safeDesc || "<em style='opacity:0.5'>Aucune description.</em>"}
        </div>

        ${hasEncarts ? 
          `<div style="margin-bottom:0.5em;">${encartsHTML}</div>` : 
          ''
        }

        ${requirementsHTML}

        ${effectsHTML ? 
          `<div class="item-stats-divider" style="margin:1em 0; border-top:1px solid rgba(255,255,255,0.2);"></div>
           <div style="color:#f2d675; font-weight:bold; font-size:0.9em; text-transform:uppercase;">Effets</div>
           ${effectsHTML}` 
          : ''
        }
    `;
  };

  /* =========================================================================
     MODALE OBJET/ARME — utilise buildModalHTML() avec titre et icône corrects
     ========================================================================= */
  window.setup.showItemModal = function(item) {
    if (!item) return;

    // Nettoyage
    $('#item-modal, #modal-overlay-item').remove();

    // Overlay & Conteneur
    const $overlay = $('<div id="modal-overlay-item"></div>').appendTo('body');
    // Note: opacity:1 important pour contrer d'éventuelles animations CSS lentes
    const $modal = $('<div id="item-modal" role="dialog" aria-modal="true" style="opacity:1;"></div>').appendTo('body');

    // Choix de l'icône
    const ICON_MAP = {
      usable: 'Images/icons/usable.png',
      health: 'Images/icons/heal.png',
      food: 'Images/icons/food.png',
      weapon: 'Images/icons/weapon.png',
      shield: 'Images/icons/shield.png',
      head: 'Images/icons/head.png',
      torso: 'Images/icons/torso.png',
      arms: 'Images/icons/arms.png',
      legs: 'Images/icons/legs.png',
      feet: 'Images/icons/feet.png',
      material: 'Images/icons/material.png',
      key: 'Images/icons/key.png',
      misc: 'Images/icons/key.png'
    };
    // Fallback sur misc si type inconnu
    const iconSrc = ICON_MAP[item.type] || ICON_MAP['misc'];

    // Génération du contenu
    const innerHTML = window.setup.buildItemModalHTML(item);

    // Construction finale via le builder standard
    const modalContent = window.setup.buildModalHTML({
      title: item.label || 'Objet',
      icon: iconSrc,
      content: innerHTML,
      footer: '<button type="button" class="modal-close">Fermer</button>',
      className: 'item-modal'
    });

    $modal.append(modalContent);
    $('body').addClass('modal-open');
    $modal.addClass('visible'); // Pour les animations CSS si présentes

    // Gestion fermeture
    const close = () => {
        $modal.remove();
        $overlay.remove();
        $('body').removeClass('modal-open');
    };

    $modal.find('.modal-close').on('click', close);
    $overlay.on('click', close); // Clic sur le fond gris ferme aussi
  };

  /* ==========================================================
     FONCTION : AFFICHER MODALE PNJ - VERSION CORRIGÉE POUR VOTRE STRUCTURE JSON
     ========================================================== */
  window.setup.showPnjModal = function(pnjId) {
    console.log(`🖼️ [showPnjModal] Ouverture modale pour: "${pnjId}"`);

    // Nettoyage préalable de toute modale existante
    $('#pnj-modal, #modal-overlay-pnj').remove();

    // Création overlay et conteneur
    const $overlay = $('<div id="modal-overlay-pnj"></div>').appendTo('body');
    const $modal = $('<div id="pnj-modal" role="dialog" aria-modal="true" style="opacity:1;"></div>').appendTo('body');

    // Récupération des données dynamiques (Santé, Inventaire réel)
    const npc = npcEnsure(pnjId);

    // Fonction de traitement principale
    const processPnjModal = () => {
      // 1. RÉCUPERATION DES DONNÉES DE LORE (JSON statique)
      const pnjData = window.setup.getPnjData(pnjId);
      const identite = pnjData.identite;

      // Extraction sécurisée des textes
      const displayName = identite.nom_complet || identite.nom || npc.name || pnjId;
      const safeName = window.setup.escapeHtml(displayName);
      const race = identite.peuple || "Inconnu";
      const metier = identite.metier_principal || "Voyageur";
      const safeDescription = window.setup.escapeHtml(pnjData.description || "Aucune description disponible.");

      // 2. DONNÉES DYNAMIQUES (Stats actuelles)
      const strength = npc.stats?.strength || 0;
      const dexterity = npc.stats?.dexterity || 0;
      const resistance = npc.stats?.resistance || 0;
      const level = npc.stats?.level || 1;
      const currentHP = npc.health || 0;
      const maxHP = npc.maxHealth || 20;

      // 3. CORPS HTML : Sous-titre (Rôle/Race)
      const subHeaderHTML = `
        <div style="text-align:center; margin-bottom:1.2em; padding-bottom:0.8em; border-bottom:1px solid rgba(255,255,255,0.1);">
            <div style="font-size:0.95em; color:#f2d675; font-style:italic; letter-spacing:0.5px;">
                ${window.setup.escapeHtml(race)} &bull; ${window.setup.escapeHtml(metier)}
            </div>
            <div style="font-size:0.8em; color:#888; margin-top:0.2em;">
                Niveau ${level}
            </div>
        </div>
      `;

      // 4. CORPS HTML : Description
      const descHTML = `
        <div style="background:rgba(255,255,255,0.03); padding:0.8em; border-radius:4px; margin-bottom:1.2em; font-size:0.9em; line-height:1.5; font-style:italic; color:#ccc; border-left:3px solid rgba(255,255,255,0.2);">
            ${safeDescription}
        </div>
      `;

      // 5. CORPS HTML : Stats Grid
      const statsHTML = `
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:0.5em; margin-bottom:1.5em; text-align:center;">
            <div style="background:rgba(0,0,0,0.3); padding:0.5em; border-radius:4px; border:1px solid #444;">
                <img src="${window.ICONS.health}" style="height:1.4em; display:block; margin:0 auto 0.3em;">
                <span style="font-weight:bold; color:#ff8888; font-size:0.9em;">${currentHP}/${maxHP}</span>
            </div>
            <div style="background:rgba(0,0,0,0.3); padding:0.5em; border-radius:4px; border:1px solid #444;">
                <img src="${window.ICONS.strength}" style="height:1.4em; display:block; margin:0 auto 0.3em;">
                <span style="font-weight:bold; color:#fff; font-size:0.9em;">${strength}</span>
            </div>
            <div style="background:rgba(0,0,0,0.3); padding:0.5em; border-radius:4px; border:1px solid #444;">
                <img src="images/icons/dexterity.png" style="height:1.4em; display:block; margin:0 auto 0.3em;" onerror="this.style.display='none'">
                <span style="font-weight:bold; color:#fff; font-size:0.9em;">${dexterity}</span>
            </div>
            <div style="background:rgba(0,0,0,0.3); padding:0.5em; border-radius:4px; border:1px solid #444;">
                <img src="${window.ICONS.defense}" style="height:1.4em; display:block; margin:0 auto 0.3em;">
                <span style="font-weight:bold; color:#fff; font-size:0.9em;">${resistance}</span>
            </div>
        </div>
      `;

      // 6. CORPS HTML : ÉQUIPEMENT (Style Slot Identique Joueur)
      let equipmentHTML = '';
      const slotNames = { weapon: 'Arme', shield: 'Bouclier', head: 'Tête', torso: 'Torse', arms: 'Bras', legs: 'Jambes', feet: 'Pieds' };
      const slotsOrder = ['head', 'torso', 'arms', 'legs', 'feet', 'weapon', 'shield'];

      let equipListHTML = '';

      slotsOrder.forEach(slot => {
         const itemId = npc.equipment ? npc.equipment[slot] : null;
         let content = ' <em style="opacity:.5; font-size:0.9em;">Vide</em>';
         let itemClass = 'empty-slot'; // Classe CSS de base

         if (itemId) {
             const itemData = window.setup.getItemFromCache(itemId);
             const label = itemData ? itemData.label : itemId;
             // On utilise 'filled-slot inventory-item' pour récupérer le style exact des items
             content = ` <span class="equipped-name" style="color:#f2d675; font-weight:bold;">${window.setup.escapeHtml(label)}</span>`;
             itemClass = 'filled-slot inventory-item';
         }

         // Construction du slot HTML identique à renderEquipment
         equipListHTML += `
            <div class="equipment-slot ${itemClass}" style="margin-bottom:0.4em; padding:0.4em 0.6em;">
                <strong style="color:#aaa; text-transform:uppercase; font-size:0.8em; margin-right:0.5em;">${slotNames[slot]}:</strong>
                ${content}
            </div>
         `;
      });

      if (equipListHTML) {
          equipmentHTML = `
            <div class="pnj-equipment-section" style="margin-bottom:1.5em;">
                <div class="section-title" style="color:#f2d675; font-weight:bold; font-size:0.85em; text-transform:uppercase; margin-bottom:0.4em; border-bottom:1px solid #444; padding-bottom:2px;">Équipement</div>
                <div class="equipment-grid">
                    ${equipListHTML}
                </div>
            </div>
          `;
      }

      // 7. CORPS HTML : INVENTAIRE (Style Slot Identique Joueur)
      let inventoryHTML = '';
      const inventory = npc.inventory || {};
      const invIds = Object.keys(inventory);

      if (invIds.length > 0) {
          let invItemsHTML = '';
          const typeLabels = { usable: "Objet", health: "Soin", food: "Nourriture", weapon: "Arme", shield: "Bouclier", head: "Casque", torso: "Armure", arms: "Gants", legs: "Jambes", feet: "Pieds", material: "Matériau", key: "Clé", misc: "Objet" };

          invIds.forEach(itemId => {
              const qty = inventory[itemId];
              if (qty > 0) {
                  const itemData = window.setup.getItemFromCache(itemId);
                  const label = itemData ? itemData.label : itemId;
                  const type = itemData ? itemData.type : 'misc';

                  // Génération des encarts (bonus stats, etc.)
                  const encartsHTML = window.setup.renderItemEncarts ? window.setup.renderItemEncarts(itemData) : '';

                  // Structure EXACTE de .inventory-item
                  invItemsHTML += `
                    <div class="inventory-item" data-id="${itemId}" data-type="${type}" style="height:100%;">
                        <div class="item-header">
                            <span class="item-name">${window.setup.escapeHtml(label)}</span>
                            <span class="item-qty">x${qty}</span>
                        </div>
                        <span class="inventory-type">${typeLabels[type] || "Objet"}</span>
                        ${encartsHTML}
                    </div>
                  `;
              }
          });

          inventoryHTML = `
            <div class="pnj-inventory-section">
                <div class="section-title" style="color:#f2d675; font-weight:bold; font-size:0.85em; text-transform:uppercase; margin-bottom:0.4em; border-bottom:1px solid #444; padding-bottom:2px;">Sac</div>
                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:0.5em;">
                    ${invItemsHTML}
                </div>
            </div>
          `;
      } else {
           inventoryHTML = `
            <div class="pnj-inventory-section">
                <div class="section-title" style="color:#f2d675; font-weight:bold; font-size:0.85em; text-transform:uppercase; margin-bottom:0.4em; border-bottom:1px solid #444; padding-bottom:2px;">Sac</div>
                <em style="opacity:0.5; font-size:0.85em; display:block; padding:0.5em;">Le sac est vide.</em>
            </div>
          `;
      }

      // 8. ASSEMBLAGE FINAL
      const modalContent = window.setup.buildModalHTML({
        title: safeName,
        icon: window.ICONS.buddy,
        content: `
            ${subHeaderHTML}
            ${descHTML}
            ${statsHTML}
            ${equipmentHTML}
            ${inventoryHTML}
        `,
        footer: '<button type="button" class="modal-close">Fermer</button>',
        className: 'pnj-modal'
      });

      $modal.append(modalContent);
      $('body').addClass('modal-open');

      // Gestion fermeture
      const close = () => {
        $modal.remove();
        $overlay.remove();
        $('body').removeClass('modal-open');
      };
      $modal.find('.modal-close').on('click', close);
      $overlay.on('click', close);
    };

    // Vérification disponibilité système PNJ avant affichage
    if (!window.setup.pnjState.ready) {
       window.setup.ensurePNJReady(processPnjModal);
    } else {
       processPnjModal();
    }
  };
  // ------------------------------------------------------
  // HUD + INVENTAIRE + ÉQUIPEMENT + (BUDDIES) - VERSION CORRIGÉE
  // ------------------------------------------------------
  window.setup.updateHUD = (function() {
    let timeout;
    // Variables pour détecter les changements et éviter le re-rendu inutile (Anti-Lag)
    let lastInventoryState = "";
    let lastEquipmentState = "";
    let lastLocationString = "";

    function icon(img) {
      const src = img || 'images/icons/map.png';
      return `<img class="icon-1em" src="${src}" alt="" onerror="this.style.display='none';">`;
    }

    return function() {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        const $hud = $('#hud');
        if (!$hud.length) return;

        const v = V();
        // Récupération des valeurs
        const health = v.current_player_health ?? 10;
        const maxHealth = v.max_player_health ?? 10;
        const strength = v.strength || 0;
        const dexterity = v.dexterity || 0;
        const resistance = v.resistance || 0;
        const magic = v.magic || 0;
        const gold = v.gold || 0;
        const level = v.level || 1;
        const exp = v.exp || 0;
        const expToNextLevel = v.expToNextLevel || 100;
        const expPercent = Math.min(100, (exp / expToNextLevel) * 100);

        // Calcul localisation
        let locationString = "Position inconnue";
        if (v.playerCoordinates) {
             locationString = window.setup.getLocationString(v.playerCoordinates, v.playerCoordinates.continent);
        } else {
             const currentPassage = State.variables.currentPassage || State.passage;
             const pCoords = window.setup.ensurePassageCoords(currentPassage);
             locationString = window.setup.getLocationString(pCoords, pCoords.continent);
        }

        // Construction initiale
        if (!$hud.find('.hud-inner').length) {
            $hud.html(`
            <div class="hud-inner">
                <div class="hud-row-top">
                    <div class="hud-stats">
                        <div class="hud-block hud-health">${icon(ICONS.health)} ${health}/${maxHealth}</div>
                        <div class="hud-block hud-strength">${icon(ICONS.strength)} ${strength}</div>
                        <div class="hud-block hud-dexterity">${icon('images/icons/dexterity.png')} ${dexterity}</div>
                        <div class="hud-block hud-resistance">${icon(ICONS.defense)} ${resistance}</div>
                        <div class="hud-block hud-magic">${icon(ICONS.magic)} ${magic}</div>
                        <div class="hud-block hud-gold">${icon(ICONS.gold)} ${gold}</div>
                    </div>
                    <div class="hud-exp-bar">
                        <span class="hud-level">${level}</span>
                        <div class="hud-exp-container">
                            <div class="hud-exp-fill" style="width: ${expPercent}%;"></div>
                        </div>
                        <span class="hud-level">${level + 1}</span>
                    </div>
                    <div class="hud-toggles"></div>
                </div>
                <div class="hud-location" title="${window.setup.escapeHtml(locationString)}">
                    ${icon(ICONS.map)} <span class="location-text">${locationString}</span>
                </div>
            </div>
            <div id="inventory-panel" class="side-panel"></div>
            <div id="equipment-panel" class="side-panel"></div>
            <div id="messages-panel" class="side-panel"></div>
            <div id="quest-panel" class="side-panel"></div>
            <div id="buddies-panel" class="side-panel"></div>
          `);
          $(document).trigger('hudready');
        } else {
          // MISE À JOUR CIBLÉE
          const $locText = $('.hud-location .location-text');
          if($locText.text() !== locationString) {
              $locText.text(locationString);
              $('.hud-location').attr('title', locationString);
          }

          const updateStat = (cls, html) => {
              const $el = $(cls);
              if($el.html() !== html) $el.html(html);
          };

          updateStat('.hud-health', `${icon(ICONS.health)} ${health}/${maxHealth}`);
          updateStat('.hud-strength', `${icon(ICONS.strength)} ${strength}`);
          updateStat('.hud-dexterity', `${icon('images/icons/dexterity.png')} ${dexterity}`);
          updateStat('.hud-resistance', `${icon(ICONS.defense)} ${resistance}`);
          updateStat('.hud-magic', `${icon(ICONS.magic)} ${magic}`);
          updateStat('.hud-gold', `${icon(ICONS.gold)} ${gold}`);

          const $expFill = $('.hud-exp-fill');
          if ($expFill.length) $expFill.css('width', `${expPercent}%`);
        }

        // Gestion des boutons Toggles
        const $toggles = $('#hud .hud-toggles');
        if (!document.getElementById('inventory-toggle')) {
          $toggles.append(`<div id="inventory-toggle" title="Inventaire">${icon(ICONS.inventory)}<span id="inventory-counter" class="counter">0</span></div>`);
        }
        if (!document.getElementById('equipment-toggle')) {
          $toggles.append(`<div id="equipment-toggle" title="Équipement">${icon(ICONS.equipment)}</div>`);
        }

        const buddiesCount = Object.values(v.npcs || {}).filter(n => n.isBuddy && n.isSpawned).length;
        if (!document.getElementById('buddy-toggle')) {
          $toggles.prepend(`<div id="buddy-toggle" title="Compagnons" style="display:none;"><img class="icon-1em" src="${ICONS.buddy}" alt=""><span id="buddy-counter" class="counter">0</span></div>`);
        }
        $('#buddy-toggle').toggle(buddiesCount > 0);
        $('#buddy-counter').text(buddiesCount > 0 ? String(buddiesCount) : '').toggle(buddiesCount > 0);

        // --- ÉVÉNEMENTS PANNEAUX ---
        window.setup.togglePanel = function(panelSelector) {
          const $panel = $(panelSelector);
          if (!$panel.length) return;
          const isVisible = $panel.hasClass('show');

          // Ferme tous les panneaux
          $('.side-panel').removeClass('show');

          // Supprime les menus contextuels actifs
          $('.context-menu').remove();

          if (!isVisible) {
              $panel.addClass('show');
              // Force le rendu immédiat à l'ouverture
              if(panelSelector === '#inventory-panel') {
                  lastInventoryState = ""; // Force refresh
                  renderInventory();
              }
              if(panelSelector === '#equipment-panel') {
                  lastEquipmentState = ""; // Force refresh
                  renderEquipment();
              }
              if(panelSelector === '#buddies-panel') window.renderBuddiesPanel();
          }
        };

        // Binding des clics
        $('#inventory-toggle').off('click').on('click', (e) => { e.stopPropagation(); window.setup.togglePanel('#inventory-panel'); v.inventoryViewed = true; window.setup.updateInventoryCounter(); window.setup.updateHUD(); });
        $('#equipment-toggle').off('click').on('click', (e) => { e.stopPropagation(); window.setup.togglePanel('#equipment-panel'); });
        $('#buddy-toggle').off('click').on('click', (e) => { e.stopPropagation(); window.setup.togglePanel('#buddies-panel'); });

        // Fermeture au clic extérieur
        $(document).off('click.hudpanels').on('click.hudpanels', e => {
             if (!$(e.target).closest('.side-panel, #hud .hud-toggles > div, .context-menu, .modal-content').length) {
               $('.side-panel').removeClass('show');
               $('.context-menu').remove();
             }
        });

        // --- FONCTION RENDU INVENTAIRE OPTIMISÉE ---
        function renderInventory() {
            const $panel = $('#inventory-panel');
            const inventory = v.inventory || [];

            // Génération d'une empreinte simple pour détecter les changements
            // On utilise JSON.stringify pour voir si les items ou quantités ont changé
            // Pour optimisation, on pourrait juste faire une map des IDs et Qtés
            const currentInventoryState = JSON.stringify(inventory.map(i => ({id: i.id, qty: i.qty})));

            // Si l'état n'a pas changé depuis le dernier rendu, ON NE FAIT RIEN (Stop Lag)
            if (currentInventoryState === lastInventoryState && $panel.children().length > 0) {
                return;
            }

            // Mise à jour de l'état
            lastInventoryState = currentInventoryState;
            $panel.empty();

            if (inventory.length) {
                 const typeLabels = { usable: "Objet", health: "Soin", food: "Nourriture", weapon: "Arme", shield: "Bouclier", head: "Casque", torso: "Armure", arms: "Gants", legs: "Jambes", feet: "Pieds", material: "Matériau", key: "Clé", misc: "Objet" };
                 const frag = document.createDocumentFragment();

                 inventory.forEach(it => {
                     const encartsHTML = window.setup.renderItemEncarts ? window.setup.renderItemEncarts(it) : '';
                     const isNew = v.inventoryNewItems?.includes(it.id);

                     const $item = $(`
                        <div class="inventory-item${isNew?' new':''}" data-id="${it.id}" data-type="${it.type}">
                            <div class="item-header">
                                <span class="item-name">${window.setup.escapeHtml(it.label)}</span>
                                <span class="item-qty">x${it.qty}</span>
                            </div>
                            <span class="inventory-type">${typeLabels[it.type]||"Objet"}</span>
                            ${encartsHTML}
                        </div>
                     `);

                     // Événements directement attachés à l'élément (plus fiable que delegate pour le drag/drop futur)
                     $item.on('contextmenu', function(e) {
                         e.preventDefault();
                         e.stopPropagation();
                         window.setup.showItemMenu(e.pageX, e.pageY, it.id, it.label, it.type, $(this));
                     });

                     $item.on('mouseenter', function() {
                         if($(this).hasClass('new')){
                             // Retire le statut "Nouveau" visuellement
                             $(this).removeClass('new');
                             // Logique métier
                             if (v.inventoryNewItems) {
                                 v.inventoryNewItems = v.inventoryNewItems.filter(nid => nid !== it.id);
                             }
                             window.setup.updateInventoryCounter();
                             window.setup.updateHUD();
                         }
                     });

                     frag.appendChild($item[0]);
                 });
                 $panel[0].appendChild(frag);
            } else {
                 $panel.append('<div class="empty-msg"><em style="opacity:.6;">Votre sac est vide.</em></div>');
            }
        }

        function renderEquipment() {
             const $panel = $('#equipment-panel');
             // Check changement
             const currentEqState = JSON.stringify(v.equipped);
             if (currentEqState === lastEquipmentState && $panel.children().length > 0) return;

             lastEquipmentState = currentEqState;
             $panel.empty();

             const slots = ['head', 'torso', 'arms', 'legs', 'feet', 'weapon', 'shield'];
             const slotNames = { head: 'Tête', torso: 'Torse', arms: 'Bras', legs: 'Jambes', feet: 'Pieds', weapon: 'Arme', shield: 'Bouclier' };

             slots.forEach(slot => {
                const itemId = v.equipped[slot];
                let content = ' <em style="opacity:.6">Vide</em>';
                let itemClass = 'empty-slot';

                if (itemId) {
                    // Trouve l'item dans l'inventaire ou cache pour avoir le label
                    const itemCache = window.setup.itemCache?.[itemId];
                    // Si l'item est équipé, il n'est parfois plus dans l'inventaire (selon votre logique),
                    // donc on regarde le cache global, sinon l'ID
                    const label = itemCache ? itemCache.label : itemId;
                    content = ` <span class="equipped-name">${window.setup.escapeHtml(label)}</span>`;
                    itemClass = 'filled-slot inventory-item'; // inventory-item pour réutiliser le style
                }

                const $slotDiv = $(`<div class="equipment-slot ${itemClass}" data-slot="${slot}" data-id="${itemId || ''}" data-type="${slot}">
                    <strong>${slotNames[slot]}:</strong>${content}
                </div>`);

                if (itemId) {
                    $slotDiv.on('contextmenu', function(e) {
                        e.preventDefault();
                        window.setup.showEquipContextMenu(e.pageX, e.pageY, itemId, "", slot, $(this));
                    });
                     $slotDiv.on('click', function(e) {
                        e.preventDefault();
                        // Affiche modale item si besoin
                        const itemData = window.setup.itemCache?.[itemId];
                        if(itemData) window.setup.showItemModal(itemData);
                    });
                }

                $panel.append($slotDiv);
             });
        }

        // LOGIQUE DE MISE À JOUR
        // Si les panneaux sont ouverts, on vérifie s'il faut re-rendu
        if ($('#inventory-panel').hasClass('show')) renderInventory();
        if ($('#equipment-panel').hasClass('show')) renderEquipment();
        if ($('#buddies-panel').hasClass('show')) window.renderBuddiesPanel(); // Buddies gère son propre timer

        // Mises à jour compteurs
        window.setup.updateMessageCounter();
        window.setup.updateQuestCounter();
        window.setup.updateInventoryCounter();

      }, 40);
    };
  })();
  // ------------------------------------------------------
  // COMPTEURS — NOUVEAUX COMPORTEMENTS
  // ------------------------------------------------------
  window.setup.updateQuestCounter = function() {
    const v = V();
    const hasNewQuest = v.quests?.some(q => !q.viewed);
    const $c = $('#quest-counter');
    if ($c.length) {
        $c.text('!').toggle(!!hasNewQuest); // Affiche '!' ou nombre
    }
  };
  window.setup.updateInventoryCounter = function() {
    const v = V();
    const hasNewItem = (v.inventoryNewItems || []).length > 0 && !v.inventoryViewed;
    const $c = $('#inventory-counter');
    if ($c.length) {
       $c.text(v.inventoryNewItems.length || '!').toggle(hasNewItem);
    }
  };
  // ------------------------------------------------------
  // MENUS CONTEXTUELS — CLIC GAUCHE = MODALE, CLIC DROIT = MENU
  // ------------------------------------------------------
  // CLIC GAUCHE : ouvrir modale objet / gérer équipement si sélection
  $(document).off('click.inventory').on('click.inventory', '#inventory-panel .inventory-item', function(e) {
    e.preventDefault();
    e.stopPropagation();
    const $t = $(this);
    const id = $t.data('id');
    const v = V();
    const item = (v.inventory || []).find(it => it.id === id);
    if (!item) return;

    // Si on est en mode "choix de slot" (gestion avancée)
    const pendingSlot = v._pendingEquipSlot;
    if (pendingSlot) {
      if (item.type === pendingSlot) {
        window.setup.equipItem(id, pendingSlot);
        v._pendingEquipSlot = null;
        $('#inventory-panel').removeClass('show');
      } else {
        window.setup.showNotification('Impossible', 'Cet objet ne peut pas être équipé ici.', 2000);
      }
      return;
    }
    window.setup.showItemModal(item);
  });
  // CLIC GAUCHE sur équipement → modale d'information
  $(document).off('click.equipment').on('click.equipment', '#equipment-panel .inventory-item', function(e) {
    e.preventDefault();
    e.stopPropagation();
    const id = $(this).data('id');
    const v = V();
    const item = (v.inventory || []).find(it => it.id === id);
    if (item) window.setup.showItemModal(item);
  });
  // ------------------------------------------------------
  // MODIFIER : MENU CONTEXTUEL INVENTAIRE - VERSION STABLE
  // ------------------------------------------------------
  $(document).off('contextmenu.inventory').on('contextmenu.inventory', '#inventory-panel .inventory-item', function(e) {
    e.preventDefault();
    e.stopPropagation();
    const $item = $(this);
    const id = $item.data('id');
    const label = $item.find('div').first().text().trim();
    const type = $item.data('type');
    window.setup.showItemMenu(e.pageX, e.pageY, id, label, type, $item);
  });
  window.setup.showItemMenu = function(x, y, id, label, type, $item) {
    $('.context-menu').remove(); // Ferme les autres menus

    const menu = $('<div id="inventory-context-menu" class="context-menu"></div>').appendTo('body');
    const v = V();
    const item = (v.inventory || []).find(it => it.id === id);
    if (!item) return;

    label = item.label; // Sécurité
    const qty = item.qty || 1;
    const equipped = v.equipped || {};

    // Ajustement position pour ne pas sortir de l'écran
    const winW = $(window).width();
    const winH = $(window).height();
    let posX = x + 5;
    let posY = y + 5;

    if (posX + 160 > winW) posX = winW - 170;
    if (posY + 200 > winH) posY = winH - 210;

    menu.css({
      position: 'absolute',
      top: `${posY}px`,
      left: `${posX}px`,
      zIndex: 10000 // Très haut pour être au dessus des modales
    });

    function addOption(txt, fn) {
      $('<div class="context-option"></div>')
        .text(txt)
        .on('click', function(e) {
          e.stopPropagation(); // Empêche la fermeture immédiate par le document click
          menu.remove();
          fn();
        })
        .appendTo(menu);
    }

    // Logique d'équipement
    const equipableSlots = ['head', 'torso', 'arms', 'legs', 'feet', 'weapon', 'shield'];
    const isEquipped = Object.values(equipped).includes(id);
    const equippedSlot = Object.keys(equipped).find(k => equipped[k] === id);

    if (isEquipped && equipableSlots.includes(type)) {
      addOption('Déséquiper', () => window.setup.unequipItem(id, equippedSlot));
    } else if (equipableSlots.includes(type)) {
      addOption('Équiper', () => window.setup.equipItem(id, type));
    }

    if (['usable', 'health', 'food'].includes(type)) {
      addOption('Utiliser', () => window.setup.useItem(id, label, type, x, y));
    }

    if (!item.isQuestItem) {
      addOption('Donner à un compagnon', () => {
        // Petit délai pour laisser le menu actuel se fermer proprement
        setTimeout(() => window.setup.showGiveToBuddyMenu(posX, posY, id, label, type), 50);
      });

      addOption('Jeter', () => window.setup.showDeleteConfirm(id, label, false, $item));
      if (qty > 1) addOption('Tout jeter', () => window.setup.showDeleteConfirm(id, label, true, $item));
    }

    // Fermeture au clic ailleurs (géré aussi par updateHUD mais sécurité ici)
    setTimeout(() => {
        $(document).one('click.closecontext', function() {
            menu.remove();
        });
    }, 10);
  };
  // ------------------------------------------------------
  // MENU CONTEXTUEL ÉQUIPEMENT
  // ------------------------------------------------------
  $(document).off('contextmenu.equipment').on('contextmenu.equipment', '#equipment-panel .inventory-item', function(e) {
    e.preventDefault();
    e.stopPropagation();
    const id = $(this).data('id');
    const label = $(this).find('div').first().text().trim();
    const type = $(this).data('type');
    window.setup.showEquipContextMenu(e.pageX, e.pageY, id, label, type, $(this));
  });
  window.setup.showEquipContextMenu = function(x, y, id, label, type, $item) {
    $('.context-menu').remove();
    const menu = $('<div id="inventory-context-menu" class="context-menu"></div>').appendTo('body');
    const v = V();

    // Positionnement intelligent
    const winW = $(window).width();
    let posX = x + 5;
    if (posX + 150 > winW) posX = x - 155;

    menu.css({
      top: `${y + 5}px`,
      left: `${posX}px`,
      zIndex: 10000
    });

    const equippedSlot = Object.keys(v.equipped || {}).find(k => v.equipped[k] === id);

    function addOption(txt, fn) {
      $('<div class="context-option"></div>')
        .text(txt)
        .on('click', e => {
          e.stopPropagation();
          menu.remove();
          fn();
        })
        .appendTo(menu);
    }

    if (equippedSlot) {
        addOption('Déséquiper', () => window.setup.unequipItem(id, equippedSlot));
    } else {
        addOption('Fermer', () => {});
    }

    setTimeout(() => {
        $(document).one('click.closecontext', function() {
            menu.remove();
        });
    }, 10);
  };
  // ------------------------------------------------------
  // UTILISATION D’OBJET — AJOUT DU CONTRÔLE SANTÉ COMPAGNON
  // ------------------------------------------------------
  window.setup.useItem = function(id, label, type, x, y, target = 'player') {
    const v = V();
    const inv = v.inventory || [];
    const item = inv.find(it => it.id === id);
    if (!item) return window.setup.showNotification('Erreur', 'Objet non trouvé.', 3000, x, y);
    let used = false;
    switch (type) {
      case 'usable':
        window.setup.showNotification('Objet utilisé', `${label} a été utilisé.`, 3000, x, y);
        used = true;
        break;
      case 'health':
      case 'food': {
        const heal = item.bonus?.health ? Number(item.bonus.health) : 10;
        // --- Détermination de la cible ---
        let currentHP, maxHP, name;
        if (target === 'player') {
          currentHP = v.current_player_health;
          maxHP = v.max_player_health;
          name = 'Vous';
        } else if (v.npcs?.[target]) {
          currentHP = v.npcs[target].health ?? 0;
          maxHP = v.npcs[target].maxHealth ?? 0;
          name = v.npcs[target].name || 'Votre compagnon';
        } else {
          return window.setup.showNotification('Erreur', 'Cible invalide.', 3000, x, y);
        }
        // --- Vérification santé pleine ---
        if (currentHP >= maxHP) {
          window.setup.showNotification('Info', `${name} a déjà toute sa santé.`, 2500, x, y, '#fff');
          return; // ❗ Empêche toute consommation d’objet
        }
        // --- Application du soin ---
        const newHP = Math.min(maxHP, currentHP + heal);
        const gain = newHP - currentHP;
        if (target === 'player') {
          v.current_player_health = newHP;
        } else {
          v.npcs[target].health = newHP;
        }
        window.setup.showNotification('Soin', `${label} soigne ${name} de +${gain} PV.`, 3000, x, y);
        used = true;
        break;
      }
      default:
        window.setup.showNotification('Erreur', 'Action impossible.', 3000, x, y);
        return;
    }
    // --- Consommation de l’objet (uniquement si utilisé) ---
    if (used) {
      item.qty = Math.max(0, (item.qty || 1) - 1);
      if (item.qty <= 0) v.inventory = inv.filter(it => it.id !== id);
      v.has = v.has || {};
      v.has[id] = Math.max(0, (v.has[id] || 0) - 1);
      if (v.has[id] === 0) delete v.has[id];
    }
    window.setup.updateHUD();
  };
  // ------------------------------------------------------
  // CONFIRMATION DE SUPPRESSION D’OBJET — VERSION CONTEXT-MENU
  // ------------------------------------------------------
  window.setup.showDeleteConfirm = function(id, label, all, $item) {
    $('#delete-confirm').remove();
    // ✔ On force le label correct depuis l’objet
    const item = (V().inventory || []).find(it => it.id === id);
    if (item) label = item.label;
    const x = ($item?.offset()?.left || window.innerWidth / 2) + 20;
    const y = ($item?.offset()?.top || window.innerHeight / 2) - 20;
    const $box = $('<div id="delete-confirm"></div>').appendTo('body');
    const question = all ?
      `Jeter <strong>toute votre quantité de "${window.setup.escapeHtml(label)}"</strong> ?` :
      `Jeter "${window.setup.escapeHtml(label)}" ?`;
    $box.html(`
                <p>${question}</p>
                <div class="btns">
                    <button class="confirm-yes">Oui</button>
                    <button class="confirm-no">Non</button>
                </div>
            `);
    $box.css({
      position: 'absolute',
      top: y + 'px',
      left: x + 'px',
      zIndex: 99999
    });
    $box.find('.confirm-yes').on('click', function(e) {
      e.stopPropagation();
      window.setup.confirmDelete(id, label, all);
      $box.remove();
    });
    $box.find('.confirm-no').on('click', function(e) {
      e.stopPropagation();
      $box.remove();
    });
    $(document).one('mousedown.deleteconfirm', function(e) {
      if (!$(e.target).closest('#delete-confirm').length) $box.remove();
    });
  };
  // ------------------------------------------------------
  // CONFIRMATION ACTION — identique, inchangé
  // ------------------------------------------------------
  window.setup.confirmDelete = function(id, label, all) {
    const v = V();
    const inv = v.inventory || [];
    const item = inv.find(it => it.id === id);
    if (!item || item.isQuestItem) {
      return window.setup.showNotification('Protégé', 'Impossible de jeter.', 3000);
    }
    // Déséquiper si nécessaire
    const equipped = Object.keys(v.equipped || {}).find(k => v.equipped[k] === id);
    if (equipped) window.setup.unequipItem(id, equipped, true);
    let removed = 0;
    if (all || item.qty <= 1) {
      removed = item.qty || 1;
      v.inventory = inv.filter(it => it.id !== id);
    } else {
      removed = 1;
      item.qty--;
    }
    // Mise à jour de "has"
    v.has = v.has || {};
    v.has[id] = Math.max(0, (v.has[id] || 0) - removed);
    if (v.has[id] === 0) delete v.has[id];
    // Toujours lisible : label dans la notification
    window.setup.showNotification('Jeté', `${label} retiré.`);
    window.setup.updateHUD();
  };
  // ==========================================================
  // ÉQUIPER OBJET — AVEC REQUIREMENTS (forceMin, dexMin, levelMin)
  // ==========================================================
  window.setup.equipItem = function(id, slot) {
    const v = State.variables;
    const inv = v.inventory || [];
    const item = inv.find(it => it.id === id);
    if (!item || item.type.toLowerCase() !== slot.toLowerCase()) {
      return window.setup.showNotification('Erreur', 'Incompatible.');
    }
    // Initialiser les statistiques de base (force, dextérité, niveau, etc.)
    window.setup.ensureBaseStats();
    v.equipped = v.equipped || {};
    const equippedWeaponId = v.equipped.weapon;
    const equippedShieldId = v.equipped.shield;
    const equippedWeapon = equippedWeaponId ? inv.find(it => it.id === equippedWeaponId) : null;
    const equippedShield = equippedShieldId ? inv.find(it => it.id === equippedShieldId) : null;
    // --- Gestion des contraintes d’armes à deux mains ---
    if (slot === 'weapon' && item.isTwoHanded && equippedShield) {
      return window.setup.showNotification('Impossible', 'Impossible d’équiper : arme à deux mains.', 3000);
    }
    if (slot === 'shield' && equippedWeapon && equippedWeapon.isTwoHanded) {
      return window.setup.showNotification('Impossible', 'Impossible d’équiper : arme à deux mains.', 3000);
    }
    // --- Requirements (forceMin, dexMin, levelMin) si présents sur l’objet ---
    // Ces champs sont censés venir des loot JS (weapon_simple / weapon_mythique)
    if (item.requirements && typeof item.requirements === 'object') {
      const req = item.requirements;
      const reqForce = Number(req.forceMin || 0);
      const reqDex = Number(req.dexMin || 0);
      const reqLevel = Number(req.levelMin || 0);
      const missing = [];
      if (reqForce && v.strength < reqForce) {
        missing.push(`Force ${v.strength}/${reqForce}`);
      }
      if (reqDex && v.dexterity < reqDex) {
        missing.push(`Dextérité ${v.dexterity}/${reqDex}`);
      }
      if (reqLevel && v.level < reqLevel) {
        missing.push(`Niveau ${v.level}/${reqLevel}`);
      }
      if (missing.length) {
        const msg = `Conditions non remplies : ${missing.join(' • ')}`;
        return window.setup.showNotification('Impossible', msg, 3500);
      }
    }
    const bonus = item.bonus || {};
    const equipped = v.equipped || {};
    // --- Équipement normal (on déséquipe l’ancien objet du slot si nécessaire) ---
    if (v.equipped[slot]) {
      window.setup.unequipItem(v.equipped[slot], slot, true);
    }
    v.equipped[slot] = id;
    // Application du bonus (force, résistance, etc.) avec protection
    // ensureBaseStats a déjà initialisé v.strength / v.resistance / v.magic / v.health
    for (const k in bonus) {
      v[k] = Number(v[k] || 0) + Number(bonus[k]);
    }
    // --- Mise à jour statut d’arme ---
    if (slot === 'weapon') {
      v.hasWeapon = true;
    }
    const bonusText = Object.keys(bonus).map(k => `+${bonus[k]} ${k}`).join(' ');
    window.setup.showNotification('Équipé', `${item.label} (${slot}) ${bonusText}`);
    window.setup.updateHUD();
  };
  // ==========================================================
  // DÉSÉQUIPER OBJET — VERSION CORRIGÉE AVEC PROTECTION
  // ==========================================================
  window.setup.unequipItem = function(id, slot, silent) {
    const v = State.variables;
    if (!v.equipped || v.equipped[slot] !== id) return;
    const inv = v.inventory || [];
    const item = inv.find(it => it.id === id);
    const bonus = item?.bonus || {};
    delete v.equipped[slot];
    // ✅ Initialisation et retrait protégé
    for (const k in bonus) {
      v[k] = Math.max(0, Number(v[k] || 0) - Number(bonus[k]));
    }
    if (slot === 'weapon') v.hasWeapon = false;
    if (!silent) {
      const bonusText = Object.keys(bonus).map(k => `-${bonus[k]} ${k}`).join(' ');
      window.setup.showNotification('Déséquipé', `Objet retiré ${bonusText}`);
    }
    window.setup.updateHUD();
  };
  // ==========================================================
  // FONCTION DE CONVERSION COORDONNÉES → LOCALISATION (VERSION CORRIGÉE)
  // ==========================================================
  window.setup.getLocationString = function(coords, continent) {
    // 1. Validation des entrées
    if (!coords || typeof coords !== 'object') return "Position inconnue";
    const x = Number(coords.x);
    const y = Number(coords.y);
    if (isNaN(x) || isNaN(y)) return "Coordonnées invalides";

    const safeContinent = continent || "Eldaron";

    // 2. Récupération des données géographiques
    const geo = window.setup.getGeographyData();

    // Si les données ne sont pas encore chargées
    if (!geo || (!geo.continents && !geo.nodes)) return `${safeContinent}`;

    // 3. Recherche du LIEU (NODE) le plus proche dans la liste globale 'nodes'
    let nearestNode = null;
    let minDistance = Infinity;

    if (geo.nodes) {
      Object.values(geo.nodes).forEach(node => {
        // On vérifie que le lieu est sur le même continent
        // Normalisation pour éviter les bugs d'accents (Helrün vs Helrun)
        const nodeCont = (node.continent || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const targetCont = safeContinent.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        if (nodeCont === targetCont) {
          const dist = Math.sqrt(Math.pow(node.x - x, 2) + Math.pow(node.y - y, 2));
          if (dist < minDistance) {
            minDistance = dist;
            nearestNode = node;
          }
        }
      });
    }

    // 4. Construction du texte
    let detail = "";

    if (nearestNode) {
      // Echelle : 1 unité = 10 km
      // Distance critique pour être "sur place" (0.5 unité = 5km, suffisant pour les micro-déplacements taverne->ville)
      if (minDistance <= 0.5) {
        detail = ` - À ${nearestNode.name}`;
      } else if (minDistance < 8) {
        // < 80 km : On est "Proche de"
        detail = ` - Proche de ${nearestNode.name} (${(minDistance * 10).toFixed(0)} km)`;
      } else {
        // > 80 km : Zone sauvage
        detail = " - Zone sauvage";
      }
    } else {
      detail = " - Terres inexplorées";
    }

    return `${safeContinent}${detail}`;
  };

  // ==========================================================
  // SYSTÈME DE QUÊTES — "EN COURS" (GRIS) / "TERMINÉ" (BLANC)
  // ==========================================================
  (function() {
    "use strict";
    // Namespace d'événements pour éviter les doublons
    const EVT_NS = '.quests';
    // Petits helpers
    const getV = () => V();
    const $doc = $(document);
    // Tri : "ready" d'abord, puis non-vues, puis timestamp (récent en premier)
    function sortQuests(a, b) {
      if (a.status === 'ready' && b.status !== 'ready') return -1;
      if (b.status === 'ready' && a.status !== 'ready') return 1;
      if (!a.viewed && b.viewed) return -1;
      if (!b.viewed && a.viewed) return 1;
      return (b.timestamp || 0) - (a.timestamp || 0);
    }
    // Rendu paneau : batching DOM pour limiter les reflows
    function renderQuestPanel() {
      const v = getV();
      const $panel = $('#quest-panel');
      if (!$panel.length) return; // si HUD pas prêt
      const active = (v.quests || []).filter(q => q.status === 'active' || q.status === 'ready');
      if (!active.length) {
        $panel.html('<em style="opacity:.6; font-style:italic;">Aucune quête en cours.</em>');
        return;
      }
      active.sort(sortQuests);
      const rows = [];
      for (const q of active) {
        const isNew = !q.viewed;
        const statusReady = q.status === 'ready';
        const statusText = statusReady ? 'Terminé' : 'En cours';
        const statusClass = statusReady ? 'quest-status-ready' : 'quest-status-active';
        const newBadge = isNew ? `<span class="item-new">Nouveau</span>` : '';
        const cls = `quest-entry${statusReady ? ' ready' : ''}${isNew ? ' new' : ''}`;
        const title = window.setup.escapeHtml ? window.setup.escapeHtml(q.title) : String(q.title ?? '');
        const shortDesc = window.setup.escapeHtml ? window.setup.escapeHtml(q.shortDesc) : String(q.shortDesc ?? '');
        rows.push(
          `<div class="${cls}" data-id="${q.id}">
                            <div class="quest-header">
                                <img class="icon-1em" src="${window.ICONS && window.ICONS.quest ? window.ICONS.quest : 'images/icons/quest.png'}" alt="">
                                <strong>${title}</strong>
                                <span class="${statusClass}">${statusText}</span>${newBadge}
                            </div>
                            <div class="quest-short">${shortDesc}</div>
                        </div>`
        );
      }
      $panel.html(rows.join(''));
      // Binding click (délégué) — on nettoie puis on rebinde proprement
      $panel.off('click' + EVT_NS, '.quest-entry').on('click' + EVT_NS, '.quest-entry', function() {
        const id = $(this).data('id');
        const quest = (v.quests || []).find(q => q.id === id);
        if (!quest) return;
        quest.viewed = true;
        window.setup.updateQuestCounter && window.setup.updateQuestCounter();
        window.setup.showQuestModal && window.setup.showQuestModal(quest);
      });
    }
    // Expose pour appels externes identiques à votre code
    window.setup = window.setup || {};
    window.setup.renderQuestPanel = renderQuestPanel;
    // Initialisation unique après storyready
    if (!window.questsInitialized) {
      $doc.one(':storyready' + EVT_NS, function() {
        window.questsInitialized = true;
        const v = getV();
        v.quests = Array.isArray(v.quests) ? v.quests : [];
        v.completedQuests = Array.isArray(v.completedQuests) ? v.completedQuests : [];
        v.pendingQuests = v.pendingQuests && typeof v.pendingQuests === 'object' ? v.pendingQuests : {};
        // Panneau latéral quêtes
        if (!$('#quest-panel').length) {
          $('body').append('<div id="quest-panel" class="side-panel"></div>');
        }
        // Attente HUD puis ajout du toggle (éviter doublons)
        $doc.on('hudready' + EVT_NS, function() {
          const $toggles = $('#hud .hud-toggles');
          if ($toggles.length && !$('#quest-toggle').length) {
            $toggles.prepend(`
                                <div id="quest-toggle" title="Quêtes">
                                    <img class="icon-1em" src="${window.ICONS && window.ICONS.quest ? window.ICONS.quest : 'images/icons/quest.png'}" alt="Quêtes">
                                    <span id="quest-counter" class="counter">0</span>
                                </div>
                            `);
          }
          window.setup.updateQuestCounter && window.setup.updateQuestCounter();
        });
        // Toggle panneau quêtes
        $doc.off('click' + EVT_NS, '#quest-toggle').on('click' + EVT_NS, '#quest-toggle', function() {
          $('.side-panel').removeClass('show');
          $('#quest-panel').toggleClass('show');
          const v = getV();
          (v.quests || []).forEach(q => q.viewed = true);
          window.setup.updateQuestCounter && window.setup.updateQuestCounter();
          renderQuestPanel();
        });
        // Fermer en cliquant hors panneau
        $doc.off('click.questclose' + EVT_NS).on('click.questclose' + EVT_NS, function(e) {
          if (!$(e.target).closest('#quest-panel, #quest-toggle').length) {
            $('#quest-panel').removeClass('show');
          }
        });
      });
    }
    // -----------------------------------------
    // API publique inchangée (add/ready/complete)
    // -----------------------------------------
    window.setup.addQuest = function(id, title, shortDesc, fullDesc, reward = {}) {
      const v = getV();
      if (!id) return;
      if ((v.quests || []).some(q => q.id === id) || (v.completedQuests || []).includes(id)) return;
      const quest = {
        id,
        title,
        shortDesc,
        fullDesc,
        reward: reward || {},
        status: 'active',
        timestamp: Date.now(),
        viewed: false
      };
      v.quests.push(quest);
      window.setup.showQuestNotification && window.setup.showQuestNotification('Nouvelle quête', title);
      window.setup.updateQuestCounter && window.setup.updateQuestCounter();
      renderQuestPanel();
    };
    window.setup.markQuestReady = function(id) {
      const v = getV();
      const quest = (v.quests || []).find(q => q.id === id);
      if (quest && quest.status === 'active') {
        quest.status = 'ready';
        quest.viewed = false;
        window.setup.showQuestNotification && window.setup.showQuestNotification('Quête terminée', quest.title);
        window.setup.updateQuestCounter && window.setup.updateQuestCounter();
        renderQuestPanel();
      }
    };
    // ------------------------------------------------------
    // QUÊTES — Validation complète sans doublons de notification
    // ------------------------------------------------------
    window.setup.markQuestCompleted = function(id) {
      const v = V();
      const idx = (v.quests || []).findIndex(q => q.id === id);
      if (idx === -1 || v.quests[idx].status !== 'ready') return;
      const quest = v.quests[idx];
      const reward = quest.reward || {};
      const rewardLines = [];
      // --- Récompense en or ---
      if (reward.gold) {
        v.gold = (v.gold || 0) + Number(reward.gold);
        rewardLines.push(`• ${Number(reward.gold || 0)} or`);
      }
      // --- Récompenses objets ---
      if (Array.isArray(reward.items) && reward.items.length > 0) {
        for (const item of reward.items) {
          const bonusStr = item.bonus ?
            Object.keys(item.bonus)
            .map(k => `${k}:${item.bonus[k]}`)
            .join(' ') :
            '';
          // Appel silencieux : pas de notification d'objet obtenu
          const args = [
            item.id,
            item.label,
            item.type || 'misc',
            1,
            bonusStr,
            false, // pas un objet de quête
            '', // aucune notification
            item.description || '',
            item.isTwoHanded || false
          ];
          // Appel direct à la macro addItem sans afficher la notif
          if (typeof window.setup.addItemDirect === 'function') {
            window.setup.addItemDirect(...args);
          } else {
            const m = Macro.get && Macro.get('addItem');
            if (m && m.handler) {
              // Neutralisation de showNotification pendant l'ajout
              const oldShowNotif = window.setup.showNotification;
              window.setup.showNotification = function() {};
              m.handler.call({
                args
              });
              window.setup.showNotification = oldShowNotif;
            }
          }
          // Liste des objets pour la notif finale
          const bonusTxt = item.bonus ?
            ` (${Object.keys(item.bonus)
                                .map(k => `${k}:${item.bonus[k]}`)
                                .join(', ')})` :
            '';
          rewardLines.push(`• ${item.label}${bonusTxt}`);
        }
      }
      // --- Passage en “terminée” ---
      v.quests.splice(idx, 1);
      (v.completedQuests || (v.completedQuests = [])).push(id);
      // --- Notification synthétique unique ---
      const rewardText = rewardLines.length ? rewardLines.join('<br>') : 'Aucune récompense';
      window.setup.showQuestNotification &&
        window.setup.showNotificationHTML('Quête rendue', `${quest.title}<br>${rewardText}`);
      window.setup.updateHUD();
    };
    window.setup.showNotificationHTML = function(title, html, duration = 3000, x, y) {
      let $container = $('#notification-container');
      if (!$container.length) $container = $('<div id="notification-container"></div>').appendTo('body');
      const $n = $('<div class="notification border-medieval"></div>');
      $n.append(`
                    <div class="notification-content">
                        <img class="icon-1em" src="${ICONS.quest}" alt="Notification">
                        <div class="notification-text">
                            ${title ? `<div class="notification-title"><strong>${window.setup.escapeHtml(title)}</strong></div>` : ''}
                            ${title && html ? `<div class="notification-divider"></div>` : ''}
                            ${html ? `<div class="notification-message">${html}</div>` : ''}
                        </div>
                    </div>
                `);
      $container.append($n);
      setTimeout(() => $n.addClass('show'), 10);
      setTimeout(() => {
        $n.addClass('hide');
        setTimeout(() => $n.remove(), 400);
      }, duration);
    };
    // -----------------------------------------
    // Flags d'état (inchangés)
    // -----------------------------------------
    window.setup.isQuestActive = id => (getV().quests || []).some(q => q.id === id && q.status === 'active');
    window.setup.isQuestReady = id => (getV().quests || []).some(q => q.id === id && q.status === 'ready');
    window.setup.isQuestCompleted = id => (getV().completedQuests || []).includes(id);
    // ------------------------------------------------------
    // ICÔNES DE CHOIX (inchangé, avec garde-fou)
    // ------------------------------------------------------
    window.setup.choiceIcons = Object.assign({
      move: "images/icons/move.png",
      look: "images/icons/look.png",
      interact: "images/icons/interact.png",
      speak: "images/icons/speak.png",
      attack: "images/icons/attack.png",
      back: "images/icons/back.png"
    }, window.setup.choiceIcons || {});
    // ------------------------------------------------------
    // Macros de quêtes (inchangées)
    // ------------------------------------------------------
    // ------------------------------------------------------
    // parseReward — tolérante, robuste, sans crash
    // ------------------------------------------------------
    window.setup.parseReward = function(str) {
      if (!str) return {
        gold: 0,
        items: []
      };
      const s = String(str).trim();
      if (!s) return {
        gold: 0,
        items: []
      };
      // JSON direct
      try {
        const parsed = JSON.parse(s);
        return {
          gold: Number(parsed.gold) || 0,
          items: Array.isArray(parsed.items) ? parsed.items : []
        };
      } catch (e) {
        /* continue */
      }
      // JSON "souple" : guillemets simples, etc.
      try {
        const step1 = s.replace(/(['`])/g, '"');
        const step2 = step1.replace(/([^{,\s"]+?)\s*:/g, (m, p1) => {
          return /^".*"$/.test(p1) ? m : `"${p1}":`;
        });
        const parsed = JSON.parse(step2);
        return {
          gold: Number(parsed.gold) || 0,
          items: Array.isArray(parsed.items) ? parsed.items : []
        };
      } catch (e) {
        /* continue */
      }
      // Format texte : gold:50; items:random:health|random:food
      const out = {
        gold: 0,
        items: []
      };
      for (const part of s.split(';')) {
        const idx = part.indexOf(':');
        if (idx === -1) continue;
        const key = part.slice(0, idx).trim().toLowerCase();
        const value = part.slice(idx + 1).trim();
        if (key === 'gold') {
          out.gold = Number(value) || 0;
        } else if (key === 'items') {
          out.items = value.split('|').filter(Boolean).map(it => {
            const trimmed = it.trim();
            if (trimmed.startsWith('random:')) {
              return trimmed; // garde "random:health"
            }
            // Format id,label,type,desc
            const [id, label, type = 'misc', desc = ''] = trimmed.split(',').map(p => p.trim());
            return id ? {
              id,
              label: label || id,
              type,
              description: desc
            } : null;
          }).filter(Boolean);
        }
      }
      return out;
    };
  })();

  /* ==========================================================
     Notification de mouvement PNJ avec réactions JSON
  ========================================================== */

  window.setup.notifyPnjMove = function(pnjId, moveType) {
    const pnjData = window.setup.loadPNJ(pnjId);
    const reactions = pnjData.pnj?.réaction_joueur?.pnjmove;

    if (!reactions) {
      // Fallback si pas de réactions définies
      const fallbackTexts = {
        follow: `${pnjId} vous suit`,
        fixed: `${pnjId} reste sur place`,
        goto: `${pnjId} se déplace`,
        recall: `${pnjId} revient vers vous`
      };
      const text = fallbackTexts[moveType] || `${pnjId} effectue une action`;

      window.setup.showDialogueNotificationShort(pnjId, text, text, false);
      return;
    }

    const reactionArray = reactions[moveType];
    if (reactionArray && Array.isArray(reactionArray) && reactionArray.length > 0) {
      const randomIndex = Math.floor(Math.random() * reactionArray.length);
      const reactionText = reactionArray[randomIndex];

      window.setup.showDialogueNotificationShort(pnjId, reactionText, reactionText, false);
    } else {
      // Fallback si le type spécifique n'existe pas
      const text = reactions.follow?.[0] || `${pnjId} effectue une action`;

      window.setup.showDialogueNotificationShort(pnjId, text, text, false);
    }
  };

  /* ==========================================================
  SYSTÈME PNJ / COMPAGNONS — intégral, unifié et autonome
  ========================================================== */

  function ensureNPCStore() {
    const v = V();
    if (!v.npcs) {
      v.npcs = {};
    }
  }

  function npcEnsure(name) {
    ensureNPCStore();
    const v = V();
    if (!v.npcs[name]) {
      // CRÉATION d'un nouveau PNJ
      const newNPC = {
        name,
        isSpawned: false,
        isBuddy: false,
        status: 'fixed',
        passage: '',
        coordinates: {
          x: 0,
          y: 0
        },
        continent: "Eldaron", // AJOUT: continent par défaut
        isAlive: true,
        isActive: true,
        health: 20,
        maxHealth: 20,
        relation: 50,
        loyalty: 50,
        mood: 0,
        inventory: {},
        equipment: {
          weapon: null,
          armor: null,
          head: null,
          torso: null,
          arms: null,
          legs: null,
          feet: null,
          shield: null
        },
        hasWeapon: false,
        stats: {
          strength: 0,
          dexterity: 0,
          resistance: 0,
          level: 1
        }
      };
      v.npcs[name] = newNPC;
    } else {
      // MISE À JOUR CRITIQUE - Initialiser stats si manquant
      const n = v.npcs[name];
      if (typeof n.stats === 'undefined') {
        n.stats = {
          strength: 0,
          dexterity: 0,
          resistance: 0,
          level: 1
        };
      } else {
        n.stats.strength = n.stats.strength || 0;
        n.stats.dexterity = n.stats.dexterity || 0;
        n.stats.resistance = n.stats.resistance || 0;
        n.stats.level = n.stats.level || 1;
      }

      // AJOUT: Initialisation du continent si manquant
      if (typeof n.continent === 'undefined') n.continent = "Eldaron";

      // Initialisation des autres champs manquants
      if (typeof n.inventory === 'undefined') n.inventory = {};
      if (typeof n.equipment === 'undefined') {
        n.equipment = {
          weapon: null,
          armor: null,
          head: null,
          torso: null,
          arms: null,
          legs: null,
          feet: null,
          shield: null
        };
      }
      if (typeof n.hasWeapon === 'undefined') n.hasWeapon = false;
      if (typeof n.coordinates === 'undefined') n.coordinates = {
        x: 0,
        y: 0
      };
      if (typeof n.isAlive === 'undefined') n.isAlive = true;
      if (typeof n.isActive === 'undefined') n.isActive = true;
      if (typeof n.health === 'undefined') n.health = 20;
      if (typeof n.maxHealth === 'undefined') n.maxHealth = 20;
      if (typeof n.relation === 'undefined') n.relation = 50;
      if (typeof n.loyalty === 'undefined') n.loyalty = 50;
      if (typeof n.mood === 'undefined') n.mood = 0;
      if (!n.status) n.status = 'fixed';
      if (typeof n.isBuddy === 'undefined') n.isBuddy = false;
      if (typeof n.isSpawned === 'undefined') n.isSpawned = false;
      if (!n.passage) n.passage = '';
    }
    return v.npcs[name];
  }

  function npcGet(name) {
    return npcEnsure(name);
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  // Visibilité du toggle "Compagnons" + compteur
  function updateBuddyHUDVisibility() {
    const v = V();
    const count = Object.values(v.npcs || {}).filter(n => n.isBuddy && n.isSpawned && n.isAlive && n.isActive).length;
    $('#buddy-toggle').toggle(count > 0);
    const $c = $('#buddy-counter');
    if ($c.length) $c.text(count > 0 ? String(count) : '').toggle(count > 0);
    if (window.setup.updateHUD) window.setup.updateHUD();
  }

  // Wrapper de notif compagnon
  function notifyBuddy(text) {
    if (window.setup && typeof window.setup.notifyBuddy === 'function') {
      window.setup.notifyBuddy(text);
    } else {
      window.setup?.showNotification?.('Compagnon', text, 3000);
    }
  }
  window.setup.validatePNJCoordinates = function(pnjId) {
    const npc = npcEnsure(pnjId);

    // VALIDATION ROBUSTE des coordonnées
    if (typeof npc.coordinates !== 'object' || npc.coordinates === null) {
      npc.coordinates = {
        x: 0,
        y: 0
      };
    }

    // CASTING EXPLICITE et validation
    npc.coordinates.x = Number(npc.coordinates.x) || 0;
    npc.coordinates.y = Number(npc.coordinates.y) || 0;

    // Validation du continent
    if (!npc.continent || typeof npc.continent !== 'string') {
      const geoData = window.setup.getGeographyData();
      let continentFound = false;

      if (geoData.continents) {
        for (const [continentName, continentData] of Object.entries(geoData.continents)) {
          if (continentData.regions && Array.isArray(continentData.regions)) {
            for (const region of continentData.regions) {
              const bounds = region.bounds;
              if (npc.coordinates.x >= bounds.x_min && npc.coordinates.x <= bounds.x_max &&
                npc.coordinates.y >= bounds.y_min && npc.coordinates.y <= bounds.y_max) {
                npc.continent = continentName;
                continentFound = true;
                break;
              }
            }
          }
          if (continentFound) break;
        }
      }

      if (!continentFound) {
        npc.continent = "Eldaron";
      }
    }

    // Validation du passage
    if (!npc.passage && npc.isSpawned) {
      npc.passage = State.variables.currentPassage || (typeof State.passage === 'string' ? State.passage : State.passage?.title) || 'Geole';
    }

    console.log(`📍 Coordonnées validées pour ${pnjId}: (${npc.coordinates.x}, ${npc.coordinates.y}, ${npc.continent}) dans ${npc.passage}`);

    return npc.coordinates;
  };

  // ------------------------------------------------------
  // FONCTION UTILITAIRE : VÉRIFIER SI UN PNJ EST UN COMPAGNON
  // ------------------------------------------------------
  window.setup.isBuddy = function(pnjId) {
    const v = V();
    const npc = v.npcs?.[pnjId];
    return npc && npc.isBuddy === true;
  };
  // ------------------------------------------------------
  // FONCTION : OBTENIR LA LISTE DES COMPAGNONS
  // ------------------------------------------------------
  window.setup.getBuddies = function() {
    const v = V();
    return Object.entries(v.npcs || {})
      .filter(([key, npc]) => npc.isBuddy && npc.isSpawned && npc.isActive && npc.isAlive)
      .map(([key, npc]) => ({
        id: key,
        ...npc
      }));
  };
  // ------------------------------
  // Macros pour les stats PNJ
  // ------------------------------
  window.npcSetStrength = function(name, value) {
    const n = npcGet(name);
    n.stats = n.stats || {};
    n.stats.strength = Math.max(0, Number(value) || 0);
    window.renderBuddiesPanel?.();
    return n;
  };
  window.npcSetDexterity = function(name, value) {
    const n = npcGet(name);
    n.stats = n.stats || {};
    n.stats.dexterity = Math.max(0, Number(value) || 0);
    window.renderBuddiesPanel?.();
    return n;
  };
  window.npcSetLevel = function(name, value) {
    const n = npcGet(name);
    n.stats = n.stats || {};
    n.stats.level = Math.max(1, Number(value) || 1);
    window.renderBuddiesPanel?.();
    return n;
  };
  // ------------------------------
  // Santé compagnon (APIs + Macros)
  // ------------------------------
  window.npcApplyDamage = function(name, amount = 1) {
    const n = npcGet(name);
    if (!n.isAlive) return n;
    n.health = Math.max(0, (n.health || 0) - Math.max(0, amount));
    if (n.health <= 0) {
      n.isAlive = false;
      n.isActive = false;
      notifyBuddy(`${n.name} est mort.`);
    }
    window.renderBuddiesPanel?.();
    window.setup.updateHUD?.();
    return n;
  };
  window.npcApplyHeal = function(name, amount = 1) {
    const n = npcGet(name);
    if (!n.isAlive) return n;
    n.health = Math.min(n.maxHealth, (n.health || 0) + Math.max(0, amount));
    notifyBuddy(`${n.name} est soigné (${n.health}/${n.maxHealth})`);
    window.renderBuddiesPanel?.();
    window.setup.updateHUD?.();
    return n;
  };
  // APIs directes
  window.setup.healBuddy = function(name, amount) {
    const npc = npcGet(name);
    if (!npc.isAlive || !npc.isActive) return window.setup.showNotification?.('Impossible', `${npc.name} ne peut pas être soigné.`);
    const before = npc.health;
    npc.health = Math.min(npc.maxHealth, npc.health + Math.max(0, amount));
    const delta = npc.health - before;
    if (delta > 0) notifyBuddy(`${npc.name} récupère ${delta} PV.`);
    window.renderBuddiesPanel?.();
  };
  window.setup.damageBuddy = function(name, amount) {
    const npc = npcGet(name);
    if (!npc.isActive) return window.setup.showNotification?.('Absent', `${npc.name} est absent.`);
    const before = npc.health;
    npc.health = Math.max(0, npc.health - Math.max(0, amount));
    const delta = before - npc.health;
    if (delta > 0) notifyBuddy(`${npc.name} perd ${delta} PV.`);
    if (npc.health <= 0) {
      npc.isAlive = false;
      notifyBuddy(`${npc.name} succombe.`);
    }
    window.renderBuddiesPanel?.();
  };
  // ------------------------------
  // Présence / Mort / Rappel — Macros utilitaires
  // ------------------------------
  // ==========================================================
  // FONCTIONS DE GESTION D'INVENTAIRE PNJ - VERSION CORRIGÉE
  // ==========================================================
  window.setup.giveItemToPnj = function(pnjId, itemId, quantity = 1) {
    const v = V();
    const npc = npcEnsure(pnjId);
    if (!npc.isSpawned || !npc.isActive) {
      console.warn(`PNJ ${pnjId} non disponible pour recevoir des items`);
      window.setup.showNotification('Impossible', `${npc.name} ne peut pas recevoir d'objets`, 3000);
      return false;
    }
    const playerInventory = v.inventory || [];
    const playerItem = playerInventory.find(item => item.id === itemId);
    if (!playerItem || playerItem.qty < quantity) {
      console.warn(`Item ${itemId} non disponible en quantité ${quantity} dans l'inventaire du joueur`);
      window.setup.showNotification('Erreur', `Vous n'avez pas assez de ${playerItem?.label || itemId}`, 3000);
      return false;
    }
    // CORRECTION : RETIRER L'OBJET DE L'INVENTAIRE DU JOUEUR
    playerItem.qty -= quantity;
    if (playerItem.qty <= 0) {
      v.inventory = playerInventory.filter(item => item.id !== itemId);
      // Déséquiper l'objet si il était équipé
      const equipped = v.equipped || {};
      Object.keys(equipped).forEach(slot => {
        if (equipped[slot] === itemId) {
          window.setup.unequipItem(itemId, slot, true);
        }
      });
    }
    // Mettre à jour le dictionnaire "has" du joueur
    v.has = v.has || {};
    v.has[itemId] = Math.max(0, (v.has[itemId] || 0) - quantity);
    if (v.has[itemId] === 0) delete v.has[itemId];
    // Ajouter à l'inventaire du PNJ
    if (npc.inventory[itemId]) {
      npc.inventory[itemId] += quantity;
    } else {
      npc.inventory[itemId] = quantity;
    }
    // Équipement automatique si c'est une arme et que le PNJ n'en a pas
    const itemData = window.setup.itemCache && window.setup.itemCache[itemId];
    if (itemData && itemData.type === 'weapon' && !npc.equipment.weapon) {
      // Vérifier d'abord si le PNJ peut équiper l'arme
      if (window.setup.canPnjEquipItem(pnjId, itemId)) {
        const success = window.setup.equipItemForPnj(pnjId, itemId, 'weapon');
        if (success) {
          console.log(`Arme ${itemId} équipée automatiquement sur ${pnjId}`);
          window.setup.showNotification('Équipement', `${npc.name} équipe ${itemData.label}`, 3000);
        }
      } else {
        // Afficher notification d'erreur pour requirements non remplis
        const req = itemData.requirements || {};
        const missing = [];
        if (req.forceMin && (npc.stats.strength || 0) < req.forceMin) {
          missing.push(`Force ${npc.stats.strength || 0}/${req.forceMin}`);
        }
        if (req.dexMin && (npc.stats.dexterity || 0) < req.dexMin) {
          missing.push(`Dextérité ${npc.stats.dexterity || 0}/${req.dexMin}`);
        }
        if (req.levelMin && (npc.stats.level || 1) < req.levelMin) {
          missing.push(`Niveau ${npc.stats.level || 1}/${req.levelMin}`);
        }
        const msg = `${npc.name} ne peut pas équiper ${itemData.label} : ${missing.join(' • ')}`;
        window.setup.showNotification('Requirements non remplis', msg, 3500);
        console.log(`PNJ ${pnjId} ne peut pas équiper ${itemId} - requirements non remplis: ${missing.join(', ')}`);
      }
    }
    console.log(`Item donné à ${pnjId}: ${itemId} x${quantity}`);
    // Notification de succès
    const itemName = itemData?.label || itemId;
    window.setup.showNotification('Don réussi', `${quantity} ${itemName} donné à ${npc.name}`, 3000);
    // Mettre à jour l'interface
    window.setup.updateHUD();
    if (window.renderBuddiesPanel) window.renderBuddiesPanel();
    return true;
  };
  // Vérifie si le PNJ peut équiper l'arme (avec notification d'erreur)
  window.setup.canPnjEquipItem = function(pnjId, itemId) {
    const npc = npcEnsure(pnjId);
    const itemData = window.setup.itemCache && window.setup.itemCache[itemId];
    if (!itemData || !itemData.requirements) {
      return true; // Pas de requirements, équipable
    }
    const req = itemData.requirements;
    const missing = [];
    // Vérifier les requirements
    if (req.forceMin && (npc.stats.strength || 0) < req.forceMin) {
      missing.push(`Force ${npc.stats.strength || 0}/${req.forceMin}`);
    }
    if (req.dexMin && (npc.stats.dexterity || 0) < req.dexMin) {
      missing.push(`Dextérité ${npc.stats.dexterity || 0}/${req.dexMin}`);
    }
    if (req.levelMin && (npc.stats.level || 1) < req.levelMin) {
      missing.push(`Niveau ${npc.stats.level || 1}/${req.levelMin}`);
    }
    if (missing.length > 0) {
      console.warn(`PNJ ${pnjId} ne remplit pas les requirements pour ${itemId}: ${missing.join(', ')}`);
      return false;
    }
    return true;
  };
  window.setup.isWeaponItem = function(itemId) {
    // Vérifier d'abord dans le cache d'items
    const itemData = window.setup.itemCache && window.setup.itemCache[itemId];
    if (itemData) {
      return itemData.type === 'weapon';
    }
    // Fallback: vérifier par le nom de l'ID
    return itemId.includes('weapon_') ||
      itemId.includes('sword_') ||
      itemId.includes('axe_') ||
      itemId.includes('bow_') ||
      itemId.includes('dagger_') ||
      itemId.includes('mace_') ||
      itemId.includes('spear_');
  };
  window.setup.equipItemForPnj = function(pnjId, itemId, slot) {
    const npc = npcEnsure(pnjId);
    // Vérifier que l'item est bien dans l'inventaire du PNJ
    if (!npc.inventory[itemId] || npc.inventory[itemId] <= 0) {
      console.warn(`PNJ ${pnjId} ne possède pas l'item ${itemId} dans son inventaire`);
      return false;
    }
    // Vérifier les requirements (force, dextérité, niveau)
    const itemData = window.setup.itemCache && window.setup.itemCache[itemId];
    if (itemData && itemData.requirements) {
      const req = itemData.requirements;
      const missing = [];
      if (req.forceMin && (npc.stats.strength || 0) < req.forceMin) {
        missing.push(`Force ${npc.stats.strength || 0}/${req.forceMin}`);
      }
      if (req.dexMin && (npc.stats.dexterity || 0) < req.dexMin) {
        missing.push(`Dextérité ${npc.stats.dexterity || 0}/${req.dexMin}`);
      }
      if (req.levelMin && (npc.stats.level || 1) < req.levelMin) {
        missing.push(`Niveau ${npc.stats.level || 1}/${req.levelMin}`);
      }
      if (missing.length > 0) {
        console.warn(`PNJ ${pnjId} ne remplit pas les requirements pour ${itemId}: ${missing.join(', ')}`);
        // Afficher notification d'erreur
        const msg = `Conditions non remplies : ${missing.join(' • ')}`;
        window.setup.showNotification('Impossible d\'équiper', msg, 3500);
        return false;
      }
    }
    // Déséquiper l'item actuel si présent
    if (npc.equipment[slot]) {
      window.setup.unequipItemForPnj(pnjId, slot);
    }
    // Équiper le nouvel item
    npc.equipment[slot] = itemId;
    // Mettre à jour hasWeapon si c'est une arme
    if (slot === 'weapon') {
      npc.hasWeapon = true;
    }
    console.log(`PNJ ${pnjId} équipe ${itemId} dans le slot ${slot}`);
    // Mettre à jour l'affichage
    if (window.renderBuddiesPanel) window.renderBuddiesPanel();
    return true;
  };
  window.setup.unequipItemForPnj = function(pnjId, slot) {
    const npc = npcEnsure(pnjId);
    const currentItem = npc.equipment[slot];
    if (!currentItem) return false;
    // Retirer l'item de l'équipement du PNJ
    npc.equipment[slot] = null;
    // Remettre l'item dans l'inventaire du joueur
    const v = V();
    const inv = v.inventory || [];
    const existingItem = inv.find(it => it.id === currentItem);
    if (existingItem) {
      existingItem.qty = (existingItem.qty || 1) + 1;
    } else {
      const itemData = window.setup.itemCache && window.setup.itemCache[currentItem];
      if (itemData) {
        const newItem = {
          id: currentItem,
          label: itemData.label,
          type: itemData.type,
          qty: 1,
          bonus: itemData.bonus,
          isQuestItem: Boolean(itemData.isQuestItem),
          description: itemData.description,
          isTwoHanded: itemData.isTwoHanded,
          requirements: itemData.requirements,
          damage: itemData.damage,
          coeff: itemData.coeff,
          speed: itemData.speed,
          critChance: itemData.critChance,
          critMultiplier: itemData.critMultiplier,
          effects: itemData.effects
        };
        inv.push(newItem);
      }
    }
    // Mettre à jour le dictionnaire "has" du joueur
    v.has = v.has || {};
    v.has[currentItem] = (v.has[currentItem] || 0) + 1;
    if (slot === 'weapon') {
      npc.hasWeapon = false;
    }
    console.log(`PNJ ${pnjId} déséquipe ${currentItem} du slot ${slot} - item retourné au joueur`);
    // Mettre à jour l'interface
    window.setup.updateHUD();
    if (window.renderBuddiesPanel) window.renderBuddiesPanel();
    return true;
  };
  // ------------------------------
  // Relations / Loyauté / Humeur — APIs + Macros
  // ------------------------------
  window.npcSetRelation = function(name, value) {
    const n = npcGet(name);
    n.relation = clamp(Number(value) || 0, 0, 100);
    window.renderBuddiesPanel?.();
    return n;
  };
  window.npcChangeRelation = function(name, delta) {
    const n = npcGet(name);
    n.relation = clamp((n.relation || 0) + Number(delta || 0), 0, 100);
    window.renderBuddiesPanel?.();
    return n;
  };
  window.npcSetLoyalty = function(name, value) {
    const n = npcGet(name);
    n.loyalty = clamp(Number(value) || 0, 0, 100);
    window.renderBuddiesPanel?.();
    return n;
  };
  window.npcChangeLoyalty = function(name, delta) {
    const n = npcGet(name);
    n.loyalty = clamp((n.loyalty || 0) + Number(delta || 0), 0, 100);
    window.renderBuddiesPanel?.();
    return n;
  };
  window.npcSetMood = function(name, value) {
    const n = npcGet(name);
    n.mood = clamp(Number(value) || 0, -2, 2);
    window.renderBuddiesPanel?.();
    return n;
  };
  window.npcChangeMood = function(name, delta) {
    const n = npcGet(name);
    n.mood = clamp((n.mood || 0) + Number(delta || 0), -2, 2);
    window.renderBuddiesPanel?.();
    return n;
  };
  // ==========================================================
  // PANNEAU COMPAGNONS + MENU CONTEXTUEL (corrigé)
  // — version stable : le menu reste ouvert même avec filtres / interactions UI
  // ==========================================================
  window.renderBuddiesPanel = function() {
    const v = State.variables;
    const $panel = $('#buddies-panel');

    // Nettoyage timer existant
    if (window.setup.buddiesPanelInterval) {
      clearInterval(window.setup.buddiesPanelInterval);
      window.setup.buddiesPanelInterval = null;
    }

    // Filtrage des compagnons actifs
    const all = Object.values(v.npcs || {});
    const list = all.filter(n => n.isSpawned && n.isBuddy);

    if (!list.length) {
      $panel.html('<em style="opacity:.6; font-style:italic; padding:10px; display:block;">Aucun compagnon.</em>');
      return;
    }

    // Marquer les entrées existantes pour nettoyage
    $panel.find('.buddy-entry').addClass('to-remove');

    list.forEach(b => {
      const safeId = b.name.replace(/["\\]/g, '\\$&');
      let $entry = $panel.find(`.buddy-entry[data-name="${safeId}"]`);

      const healthRatio = (b.health || 0) / (b.maxHealth || 1);
      const healthClass = healthRatio > 0.6 ? 'h-good' : healthRatio > 0.3 ? 'h-mid' : 'h-low';

      // Textes de base
      let locationText = window.setup.getLocationString(b.coordinates, b.continent);
      let travelHTML = '';

      // --- LOGIQUE VOYAGE AVANCÉE ---
      if (b.status === 'traveling' && b.travelCurrentStep && b.travelItinerary) {
        const step = b.travelCurrentStep;
        const isResting = step.type === 'rest';

        // Calcul des étapes et distances futures pour un affichage global
        const currentStepIdx = (b.travelStepIndex || 0) + 1;
        const totalSteps = b.travelItinerary.length;

        // Calcul distance restante FUTURE (hors étape en cours)
        let futureDist = 0;
        for(let i = (b.travelStepIndex || 0) + 1; i < totalSteps; i++) {
            futureDist += (b.travelItinerary[i].dist || 0);
        }

        const actionText = isResting
            ? `<span style="color:#ffd700; font-weight:bold;">💤 ${window.setup.escapeHtml(step.desc)}</span>`
            : `<span style="color:#eee;">🏃 ${window.setup.escapeHtml(step.desc)}</span>`;

        // Construction du bloc Voyage
        travelHTML = `
          <div class="buddy-travel-wrapper ${isResting ? 'resting' : ''}" 
               data-name="${window.setup.escapeHtml(b.name)}"
               data-end="${step.endTime}" 
               data-total="${step.duration}"
               data-type="${step.type}"
               data-dist="${Number(step.dist) || 0}"
               data-future="${futureDist}">
              
              <div class="travel-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <span class="travel-step-badge" style="background:rgba(255,255,255,0.1); padding:1px 4px; border-radius:3px; font-size:0.7em; color:#aaa;">
                      Étape ${currentStepIdx}/${totalSteps}
                  </span>
                  <span class="travel-timer-text" style="font-size:0.8em; font-family:monospace; color:#f2d675;">--:--</span>
              </div>

              <div class="travel-text-primary" style="font-size:0.85em; margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                  ${actionText}
              </div>
              
              <div class="travel-progress-bg">
                <div class="travel-progress-fill" style="width: 0%;"></div>
              </div>
              
              <div class="travel-total-line" style="margin-top:2px; font-size:0.75em; color:#888; text-align:right;">
                   Reste : <span class="travel-total-km" style="color:#fff;">Calcul...</span>
              </div>
          </div>
        `;
        locationText = isResting ? `Pause à ${step.locationName}` : `En transit`;
      }

      // === MISE À JOUR DOM (DIFF) ===
      if ($entry.length > 0) {
        $entry.removeClass('to-remove');

        // Update Health
        $entry.find('.buddy-healthfill')
              .removeClass('h-good h-mid h-low')
              .addClass(healthClass)
              .css('width', `${healthRatio * 100}%`);

        // Update Status Badge
        $entry.find('.item-badge')
              .attr('class', `item-badge buddy-${b.status}`)
              .text(b.status === 'traveling' ? 'Voyage' : b.status);

        // Update Location Text
        const $loc = $entry.find('.buddy-location');
        if ($loc.text() !== locationText) $loc.text(locationText);

        // Update Travel Block
        const $existingTravel = $entry.find('.buddy-travel-wrapper');
        if (b.status === 'traveling') {
            if ($existingTravel.length === 0) {
                // Insertion si nouveau voyage
                $entry.find('.buddy-healthbar').after(travelHTML);
            } else {
                // Mise à jour attributs si voyage en cours
                // On remplace tout le HTML du wrapper pour être sûr de mettre à jour les textes d'étapes
                $existingTravel.replaceWith(travelHTML);
            }
        } else {
            $existingTravel.remove();
        }
      }
      // === CRÉATION ===
      else {
        const newEntryHTML = `
          <div class="buddy-entry" data-name="${window.setup.escapeHtml(b.name)}">
              <div class="msg-header">
                  <img class="icon-1em" src="${window.ICONS.buddy}" alt="">
                  <strong>${window.setup.escapeHtml(b.name)}</strong>
                  <span class="item-badge buddy-${b.status}">${b.status === 'traveling' ? 'Voyage' : b.status}</span>
              </div>
              <div class="buddy-healthbar"><div class="buddy-healthfill ${healthClass}" style="width:${healthRatio * 100}%;"></div></div>
              ${travelHTML}
              <div class="buddy-location">${locationText}</div>
          </div>
        `;
        const $newEl = $(newEntryHTML);

        // Events
        $newEl.on('click', function(e) {
           e.preventDefault(); e.stopPropagation();
           window.setup.showPnjModal($(this).data('name'));
        });
        $newEl.on('contextmenu', function(e) {
           e.preventDefault(); e.stopPropagation();
           window.setup.showBuddyContextMenu(e, $(this).data('name'));
        });

        $panel.append($newEl);
      }
    });

    // Nettoyage éléments supprimés
    $panel.find('.to-remove').remove();

    // === ANIMATION TIMER (Intervalle) ===
    if ($panel.find('.buddy-travel-wrapper').length > 0) {
      const updateTimers = () => {
        const now = Date.now();
        let active = false;

        $panel.find('.buddy-travel-wrapper').each(function() {
          const $wrapper = $(this);
          const endTime = Number($wrapper.data('end'));
          const totalTime = Number($wrapper.data('total'));
          const stepDist = Number($wrapper.data('dist')) || 0;
          const futureDist = Number($wrapper.data('future')) || 0; // Distance des étapes SUIVANTES

          const remaining = endTime - now;
          let percent = 0;

          if (remaining <= 0) {
            percent = 100;
            $wrapper.find('.travel-timer-text').text("Fin...");
            $wrapper.find('.travel-total-km').text(futureDist > 0 ? `${futureDist.toFixed(1)} km` : "Arrivé");
          } else {
            active = true;
            // Progression barre (Step actuel)
            percent = Math.min(100, Math.max(0, ((totalTime - remaining) / totalTime) * 100));

            // Temps restant (Step actuel)
            const secs = Math.ceil(remaining / 1000);
            const timeStr = secs > 60
                ? `${Math.floor(secs / 60)}m ${(secs % 60).toString().padStart(2, '0')}s`
                : `${secs}s`;
            $wrapper.find('.travel-timer-text').text(timeStr);

            // Distance restante TOTALE (Reste du step + Futur)
            // Règle de trois sur le temps pour la distance du step courant
            const ratio = remaining / totalTime;
            const distLeftInStep = stepDist * ratio;
            const totalDistLeft = distLeftInStep + futureDist;

            $wrapper.find('.travel-total-km').text(`${totalDistLeft.toFixed(1)} km`);
          }

          $wrapper.find('.travel-progress-fill').css('width', `${percent}%`);
        });

        if (!active && window.setup.buddiesPanelInterval) {
          clearInterval(window.setup.buddiesPanelInterval);
          window.setup.buddiesPanelInterval = null;
        }
      };

      updateTimers(); // Premier appel immédiat
      window.setup.buddiesPanelInterval = setInterval(updateTimers, 100);
    }
  };


  window.setup.showBuddyContextMenu = function(e, name) {
    const v = State.variables;
    const npc = v.npcs[name];
    if(!npc) return;

    const $menu = $('<div id="buddy-context-menu" class="context-menu"></div>').appendTo('body');

    function addOption(text, fn) {
      $('<div class="context-option"></div>').text(text).on('click', ev => {
        ev.stopPropagation();
        fn();
        $menu.remove();
      }).appendTo($menu);
    }

    if (npc.status === 'traveling') {
      addOption('Annuler voyage', () => window.setup.cancelPNJTravel(name));
    } else {
      addOption('Me suivre', () => {
        const destPassage = State.passage;
        const destCoords = window.setup.ensurePassageCoords(destPassage);
        const destCont = destCoords.continent || "Eldaron";
        window.setup.startPNJTravel(name, destPassage, destCoords, destCont, 'follow');
      });
      addOption('Attendre ici', () => {
        npc.status = 'fixed';
        npc.passage = State.passage;
        npc.coordinates = { ...window.setup.ensurePassageCoords(State.passage) };
        window.renderBuddiesPanel();
      });
      addOption('Parler', () => window.setup.openChatModal(name));

      if ((npc.health || 0) < (npc.maxHealth || 20)) {
        addOption('Soigner (+5 PV)', () => window.setup.healBuddy(name, 5));
      }
      addOption('Faire partir', () => {
        npc.isActive = false;
        window.renderBuddiesPanel();
      });
    }

    const posX = Math.min(e.pageX + 10, window.innerWidth - 240);
    const posY = Math.min(e.pageY + 10, window.innerHeight - 240);
    $menu.css({ top: `${posY}px`, left: `${posX}px` });

    $(document).one('mousedown.buddymenuclose', ev => {
      if (!$(ev.target).closest('#buddy-context-menu').length) $menu.remove();
    });
  };

  // ------------------------------------------------------
  // MENU "DONNER À UN COMPAGNON" — VERSION AMÉLIORÉE ET UNIFIÉE
  // ------------------------------------------------------
  window.setup.showGiveToBuddyMenu = function(x, y, id, label, type) {
    $('#give-buddy-menu').remove();
    const v = V();
    // UNIQUEMENT les compagnons (isBuddy = true)
    const buddies = Object.entries(v.npcs || {}).filter(([key, npc]) =>
      npc.isBuddy && npc.isSpawned && npc.isActive && npc.isAlive
    );
    if (!buddies.length) {
      window.setup.showNotification('Info', 'Aucun compagnon disponible.', 3000, x, y);
      return;
    }
    const menu = $('<div id="give-buddy-menu" class="context-menu"></div>').appendTo('body');
    menu.css({
      position: 'absolute',
      top: `${y + 5}px`,
      left: `${x + 5}px`,
      background: 'rgba(0,0,0,0.92)',
      border: '1px solid #fff',
      borderRadius: '8px',
      padding: '0.4em 0',
      minWidth: '180px',
      zIndex: 9999,
      fontSize: '0.9em',
      boxShadow: '0 0 16px rgba(0,0,0,0.8)',
      animation: 'fadeMenu 0.2s ease forwards'
    });
    menu.append('<div class="context-title">Donner à un compagnon :</div>');
    buddies.forEach(([key, buddy]) => {
      const healthInfo = buddy.isAlive ?
        ` — ${buddy.health || 0}/${buddy.maxHealth || 1} PV` :
        ' — ❌ Mort';
      const statusInfo = buddy.status === 'follow' ? ' 👥' : ' 📍';
      const option = $(`<div class="context-option">${buddy.name}${statusInfo}${healthInfo}</div>`);
      option.on('click', function(e) {
        e.stopPropagation();
        menu.remove();
        console.log(`🎯 Don de ${id} (${label}) à ${buddy.name}`);
        // CORRECTION : POUR TOUS LES OBJETS, utiliser giveItemToBuddy
        // Même les objets de soin sont maintenant donnés via giveItemToBuddy
        const success = window.setup.giveItemToBuddy(key, id, 1);
        if (!success) {
          console.error(`❌ Échec du don de ${id} à ${key}`);
        }
      });
      menu.append(option);
    });
    // Fermeture si clic ailleurs
    $(document).off('mousedown.givebuddy').on('mousedown.givebuddy', function(e) {
      if (!$(e.target).closest('#give-buddy-menu').length) {
        $('#give-buddy-menu').remove();
        $(document).off('mousedown.givebuddy');
      }
    });
  };

  // ==========================================================
  // DONNER AUX COMPAGNONS
  // ==========================================================
  window.setup.giveItemToBuddy = function(pnjId, itemId, quantity = 1) {
    try {
      const v = V();
      const npc = npcEnsure(pnjId);
      console.log(`🎁 DON: Tentative de donner ${itemId} x${quantity} à ${pnjId}`);

      // Vérifier que c'est bien un compagnon
      if (!npc.isBuddy) {
        window.setup.showNotification('Impossible', `${npc.name} n'est pas votre compagnon`, 3000);
        return false;
      }

      if (!npc.isSpawned || !npc.isActive || !npc.isAlive) {
        window.setup.showNotification('Impossible', `${npc.name} ne peut pas recevoir d'objets`, 3000);
        return false;
      }

      // Vérifier si l'item existe dans l'inventaire du joueur
      const playerInventory = v.inventory || [];
      const playerItemIndex = playerInventory.findIndex(item => item.id === itemId);

      if (playerItemIndex === -1) {
        console.error(`❌ Item ${itemId} non trouvé dans l'inventaire`);
        window.setup.showNotification('Erreur', `Objet non trouvé dans l'inventaire`, 3000);
        return false;
      }

      const playerItem = playerInventory[playerItemIndex];
      const itemLabel = playerItem.label || itemId;

      if (playerItem.qty < quantity) {
        console.error(`❌ Quantité insuffisante: ${playerItem.qty} < ${quantity}`);
        window.setup.showNotification('Erreur', `Vous n'avez pas assez de ${itemLabel}`, 3000);
        return false;
      }

      // === RETRAIT DE L'INVENTAIRE ===
      playerItem.qty -= quantity;

      if (playerItem.qty <= 0) {
        v.inventory.splice(playerItemIndex, 1);
        // Déséquiper l'objet si il était équipé
        const equipped = v.equipped || {};
        Object.keys(equipped).forEach(slot => {
          if (equipped[slot] === itemId) {
            window.setup.unequipItem(itemId, slot, true);
          }
        });
      }

      // Mettre à jour le dictionnaire "has" du joueur
      v.has = v.has || {};
      v.has[itemId] = Math.max(0, (v.has[itemId] || 0) - quantity);
      if (v.has[itemId] === 0) {
        delete v.has[itemId];
      }

      // Ajouter à l'inventaire du compagnon
      if (npc.inventory[itemId]) {
        npc.inventory[itemId] += quantity;
      } else {
        npc.inventory[itemId] = quantity;
      }

      // Équipement automatique si c'est une arme et que le compagnon n'en a pas
      const itemData = window.setup.itemCache && window.setup.itemCache[itemId];
      if (itemData && itemData.type === 'weapon' && !npc.equipment.weapon) {
        if (window.setup.canPnjEquipItem(pnjId, itemId)) {
          const success = window.setup.equipItemForPnj(pnjId, itemId, 'weapon');
          if (success) {
            // Supprimer la notification d'équipement qui doublait
            // window.setup.showNotification('Équipement', `${npc.name} équipe ${itemData.label}`, 3000);
          }
        }
      }

      // Améliorer la relation et la loyauté
      npc.relation = Math.min(100, (npc.relation || 50) + 2);
      npc.loyalty = Math.min(100, (npc.loyalty || 50) + 1);

      // ==========================================================
      // CORRECTION : REMPLACER LA NOTIFICATION PAR UNE NOTIFICATION DE DIALOGUE
      // ==========================================================

      // Charger les données du PNJ pour obtenir ses réactions
      const pnjData = window.setup.loadPNJ(pnjId);
      const reactions = pnjData.pnj?.réaction_joueur?.addItem;

      let reactionText = `${quantity} ${itemLabel} donné à ${npc.name}`; // Texte par défaut

      if (reactions && itemData) {
        // Déterminer le type d'item
        const itemType = itemData.type || 'misc';

        // Vérifier si le type existe dans les réactions
        if (reactions[itemType] && Array.isArray(reactions[itemType]) && reactions[itemType].length > 0) {
          // Choisir une phrase aléatoire
          const randomIndex = Math.floor(Math.random() * reactions[itemType].length);
          reactionText = reactions[itemType][randomIndex];
        } else if (reactions['misc'] && Array.isArray(reactions['misc']) && reactions['misc'].length > 0) {
          // Fallback sur 'misc'
          const randomIndex = Math.floor(Math.random() * reactions['misc'].length);
          reactionText = reactions['misc'][randomIndex];
        }
      }

      // Afficher UNIQUEMENT la notification de dialogue (plus la notification normale)
      window.setup.showDialogueNotificationShort(npc.name, reactionText, reactionText, false);

      // Mettre à jour l'interface IMMÉDIATEMENT
      window.setup.updateHUD();
      if (window.renderBuddiesPanel) window.renderBuddiesPanel();

      console.log(`✅ DON RÉUSSI: ${itemId} x${quantity} donné à ${pnjId}`);
      return true;

    } catch (error) {
      console.error("❌ ERREUR CRITIQUE dans giveItemToBuddy:", error);
      window.setup.showNotification('Erreur', 'Problème lors du don de l\'objet', 3000);
      return false;
    }
  };
  // Alias pour compatibilité avec l'ancien code
  window.setup.giveItemToPnj = window.setup.giveItemToBuddy;
  /* ==========================================================
     CHARGEMENT PNJ — JSON DYNAMIQUE (CORRIGÉ)
  ========================================================== */

  // Réinitialisation de l'état PNJ
  window.setup.pnjState = {
    ready: false,
    loading: false,
    attempted: false,
    fallbackCache: {}
  };

  window.pnjData = window.pnjData || {};

  // Cache de fallback pour les PNJ non chargés
  window.setup.fallbackPNJs = {
    'cyndra': {
      id: 'cyndra',
      pnj: {
        identite: {
          nom: 'Cyndra',
          nom_complet: 'Cyndra d\'Arrowyn',
          peuple: 'Humaine Valnari', // Utilise "peuple" comme dans votre JSON
          metier_principal: 'Chasseuse et guide' // Utilise "metier_principal"
        },
        description_narrative: 'Une guerrière expérimentée aux cheveux d\'argent et au regard perçant. Elle porte une armure de cuir et une épée ancienne.',
        personnalite: 'Loyale et protectrice',
        contexte: 'Ancienne garde royale devenue mercenaire'
      }
    }
  };

  // CHARGEMENT ASYNCHRONE AVEC INDEX
  async function loadAllPNJ() {
    if (window.setup.pnjState.loading) {
      console.log("⚠️ Chargement PNJ déjà en cours");
      return;
    }

    window.setup.pnjState.loading = true;
    window.setup.pnjState.attempted = true;

    console.log("🔄 DÉBUT CHARGEMENT PNJ...");

    try {
      // 1. Charger l'index des PNJs
      let pnjFiles = await loadPNJIndex();

      // 2. Fallback si l'index échoue
      if (!pnjFiles || pnjFiles.length === 0) {
        console.warn("⚠️ Index des PNJs non trouvé, utilisation de la détection manuelle");
        pnjFiles = await detectAvailablePNJs();
      }

      let successCount = 0;

      // 3. Charger chaque PNJ listé
      for (const file of pnjFiles) {
        try {
          const pathsToTry = [
            `./server/pnj/${file}`,
            `server/pnj/${file}`,
            `./pnj/${file}`
          ];

          let loaded = false;

          for (const path of pathsToTry) {
            try {
              console.log(`📁 Tentative de chargement: ${path}`);
              const response = await fetch(path);

              if (response.ok) {
                const data = await response.json();
                const id = file.replace('.json', '').toLowerCase();

                if (data && data.pnj && data.pnj.identite) {
                  window.pnjData[id] = data;
                  console.log(`✅ PNJ CHARGÉ: ${id}`, data.pnj.identite.nom);
                  successCount++;
                  loaded = true;
                  break;
                } else {
                  console.warn(`⚠️ Structure PNJ invalide pour: ${file}`);
                }
              }
            } catch (pathError) {
              continue; // Essayer le chemin suivant
            }
          }

          if (!loaded) {
            console.warn(`⚠️ Aucun chemin valide pour: ${file}, utilisation du fallback`);
            const fallbackId = file.replace('.json', '').toLowerCase();
            if (window.setup.fallbackPNJs[fallbackId]) {
              window.pnjData[fallbackId] = window.setup.fallbackPNJs[fallbackId];
              successCount++;
            }
          }

          await new Promise(resolve => setTimeout(resolve, 50));

        } catch (error) {
          console.error(`❌ Erreur lors du traitement de ${file}:`, error);
        }
      }

      window.setup.pnjState.ready = true;
      window.setup.pnjState.loading = false;

      console.log(`📊 CHARGEMENT PNJ TERMINÉ: ${successCount}/${pnjFiles.length} succès`);
      console.log("📋 PNJs disponibles:", Object.keys(window.pnjData));

    } catch (error) {
      console.error("❌ ERREUR CRITIQUE lors du chargement des PNJs:", error);
      window.setup.pnjState.ready = true; // Marquer comme prêt même en cas d'erreur
      window.setup.pnjState.loading = false;
    }
  }

  // REMPLACER loadPNJIndex
  async function loadPNJIndex() {
    try {
      // 🔴 CORRECTION : Chemins prioritaires pour environnement Twine
      const indexPaths = [
        './server/pnj/index.json',
        'server/pnj/index.json',
        './pnj/index.json',
        'pnj/index.json'
      ];

      for (const path of indexPaths) {
        try {
          console.log(`📂 Tentative de chargement de l'index: ${path}`);
          const response = await fetch(path);

          if (response.ok) {
            const indexData = await response.json();
            console.log("✅ Index des PNJs chargé:", indexData);

            // 🔴 CORRECTION : Vérifier que files existe et est un tableau
            if (Array.isArray(indexData.files)) {
              return indexData.files;
            } else {
              console.warn("⚠️ Structure d'index invalide, files n'est pas un tableau");
              return null;
            }
          }
        } catch (error) {
          console.log(`❌ Index non trouvé à: ${path}`);
          continue;
        }
      }

      console.warn("❌ Aucun index des PNJs trouvé");
      return null;

    } catch (error) {
      console.error("❌ Erreur lors du chargement de l'index:", error);
      return null;
    }
  }

  // REMPLACER detectAvailablePNJs
  async function detectAvailablePNJs() {
    console.log("🔍 Détection manuelle des PNJs disponibles...");

    // 🔴 CORRECTION : Liste minimum garantie
    const knownPNJs = [
      'Cyndra.json'
    ];

    const availablePNJs = [];

    // Tester chaque PNJ connu
    for (const pnjFile of knownPNJs) {
      try {
        const testPath = `./server/pnj/${pnjFile}`;
        const response = await fetch(testPath, {
          method: 'HEAD'
        });

        if (response.ok) {
          availablePNJs.push(pnjFile);
          console.log(`✅ PNJ détecté: ${pnjFile}`);
        }
      } catch (error) {
        console.log(`❌ PNJ non trouvé: ${pnjFile}`);
      }
    }

    // 🔴 CORRECTION : Fallback ultime si rien n'est trouvé
    if (availablePNJs.length === 0) {
      console.warn("⚠️ Aucun PNJ détecté, création d'un PNJ de secours en mémoire");
      window.pnjData['cyndra'] = window.setup.fallbackPNJs['cyndra'];
      availablePNJs.push('Cyndra.json');
    }

    console.log(`📂 PNJs détectés manuellement: ${availablePNJs.join(', ')}`);
    return availablePNJs;
  }

  // FONCTION FALLBACK AMÉLIORÉE
  function createFallbackPNJ(id) {
    const name = id.split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    return {
      id: id,
      pnj: {
        identite: {
          nom: name,
          nom_complet: name,
          peuple: 'Inconnu',
          metier_principal: 'Voyageur'
        },
        description_narrative: `${name} est un personnage mystérieux. Son apparence et son histoire restent à découvrir.`,
        personnalite: 'Neutre',
        contexte: 'Origine inconnue',
        réaction_joueur: {
          addItem: {
            weapon: ["Merci pour cette arme.", "Je vais en prendre soin.", "Utile."],
            health: ["Merci pour ces soins.", "Je me sens mieux.", "Bonne idée."],
            food: ["Merci pour la nourriture.", "J'avais faim.", "Bon repas."],
            misc: ["Merci.", "Je garde ça.", "Utile."]
          }
        }
      }
    };
  }

  // REMPLACER window.setup.getPnjData
  window.setup.getPnjData = function(pnjId) {
    const pnjData = window.setup.loadPNJ(pnjId);

    // Fallback si loadPNJ échoue
    if (!pnjData) {
      return {
          identite: { nom: pnjId, peuple: 'Inconnu', metier_principal: 'Inconnu' },
          description: "Données non trouvées."
      };
    }

    // Normalisation des données pour éviter les erreurs undefined
    const identite = pnjData.pnj?.identite || pnjData.identite || {};

    return {
      identite: {
        nom: identite.nom || pnjId,
        nom_complet: identite.nom_complet || identite.nom || pnjId,
        peuple: identite.peuple || 'Inconnu',
        metier_principal: identite.metier_principal || 'Voyageur'
      },
      description: pnjData.pnj?.description_narrative ||
        pnjData.description_narrative ||
        pnjData.description ||
        "Description non disponible",
      // On préserve les autres champs utiles
      personnalite: pnjData.pnj?.personnalite || "Inconnue",
      contexte: pnjData.pnj?.contexte || "Inconnu"
    };
  };

  // ==========================================================
  // FONCTION DE RECHERCHE PNJ — VERSION AMÉLIORÉE POUR VOTRE STRUCTURE
  // ==========================================================
  window.setup.loadPNJ = function(id) {
    if (!id || typeof id !== 'string') {
      console.warn("❌ ID PNJ manquant ou invalide:", id);
      return createFallbackPNJ('inconnu');
    }

    // Si le système PNJ n'est pas prêt, utiliser le cache de fallback
    if (!window.setup.pnjState.ready) {
      console.warn("⚠️ Système PNJ pas prêt, utilisation du fallback pour:", id);
      const fallbackId = id.toLowerCase();
      return window.setup.fallbackPNJs[fallbackId] || createFallbackPNJ(id);
    }

    const searchId = id.toLowerCase().trim();
    console.log(`🔍 RECHERCHE PNJ: "${searchId}"`);

    // 1. Recherche directe par ID exact
    if (window.pnjData[searchId]) {
      console.log(`✅ PNJ trouvé par ID exact: ${searchId}`);
      return window.pnjData[searchId];
    }

    // 2. Recherche dans tous les PNJs avec différentes clés
    for (const [pnjId, pnjData] of Object.entries(window.pnjData)) {
      // Extraire toutes les chaînes de caractères possibles pour la recherche
      const searchStrings = [];

      // Depuis pnj.identite (VOTRE STRUCTURE)
      if (pnjData.pnj?.identite) {
        const identite = pnjData.pnj.identite;
        if (identite.nom) searchStrings.push(identite.nom.toLowerCase());
        if (identite.nom_complet) searchStrings.push(identite.nom_complet.toLowerCase());
        if (identite.peuple) searchStrings.push(identite.peuple.toLowerCase()); // Ajout de peuple
        if (identite.metier_principal) searchStrings.push(identite.metier_principal.toLowerCase()); // Ajout de metier_principal
      }

      // Depuis la racine
      if (pnjData.nom) searchStrings.push(pnjData.nom.toLowerCase());
      if (pnjData.nom_complet) searchStrings.push(pnjData.nom_complet.toLowerCase());

      // ID du PNJ lui-même
      searchStrings.push(pnjId.toLowerCase());

      // Recherche avec tolérance
      for (const searchString of searchStrings) {
        if (!searchString) continue;

        // Correspondance exacte
        if (searchString === searchId) {
          console.log(`✅ PNJ trouvé par correspondance exacte: ${pnjId} (${searchString})`);
          return pnjData;
        }

        // Correspondance partielle (sans accents et caractères spéciaux)
        const normalizedSearch = searchId.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const normalizedString = searchString.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        if (normalizedString === normalizedSearch) {
          console.log(`✅ PNJ trouvé par correspondance normalisée: ${pnjId} (${searchString})`);
          return pnjData;
        }

        // Correspondance partielle (contient le terme)
        if (normalizedString.includes(normalizedSearch) || normalizedSearch.includes(normalizedString)) {
          console.log(`✅ PNJ trouvé par correspondance partielle: ${pnjId} (${searchString})`);
          return pnjData;
        }
      }
    }

    // 3. Aucun PNJ trouvé - création d'un fallback
    console.warn(`❌ AUCUN PNJ TROUVÉ POUR: "${id}"`);
    console.log("📋 PNJs disponibles:", Object.keys(window.pnjData));

    return createFallbackPNJ(id);
  };

  // Vérification périodique de l'état du chargement PNJ
  window.setup.ensurePNJReady = function(callback, maxAttempts = 15) {
    let attempts = 0;

    function check() {
      attempts++;

      if (window.setup.pnjState.ready) {
        callback(true);
        return;
      }

      if (attempts >= maxAttempts) {
        console.warn("❌ Timeout attente système PNJ");
        callback(false);
        return;
      }

      if (!window.setup.pnjState.attempted) {
        loadAllPNJ();
      }

      setTimeout(check, 300);
    }

    check();
  };
  /* ==========================================================
           MODALE CHAT PNJ — VERSION 100% CONFORME AU CSS CORRIGÉ
           ========================================================== */
  window.setup.openChatModal = function(pnjId) {
    $('#chat-modal, #modal-overlay-chat').remove();

    const $overlay = $('<div id="modal-overlay-chat"></div>').appendTo('body');
    const $modal = $('<div id="chat-modal" role="dialog" aria-modal="true"></div>').appendTo('body');

    const pnj = window.setup.loadPNJ(pnjId);
    const v = V();

    const safeName = window.setup.escapeHtml(
      pnj.pnj?.identite?.nom_complet ||
      pnj.pnj?.identite?.nom ||
      pnj.nom_complet ||
      pnj.nom ||
      pnjId
    );

    const race = pnj.pnj?.identite?.peuple || pnj.pnj?.identite?.race || '';
    const metier = pnj.pnj?.identite?.metier_principal || pnj.pnj?.identite?.metier || '';
    const subtitle = [race, metier].filter(Boolean).join(' - ');

    v.chatHistory = v.chatHistory || {};
    const history = v.chatHistory[pnjId] = v.chatHistory[pnjId] || [];

    $modal.html(`
                            <div class="modal-content">
                                <div class="modal-header">
                                    <img class="icon-1em" src="${ICONS.speak}" alt="">
                                    <div>
                                        <span>${safeName}</span>
                                        ${subtitle ? `<span style="font-size:0.78em; opacity:0.8; display:block; margin-top:3px;">${window.setup.escapeHtml(subtitle)}</span>` : ''}
                                    </div>
                                </div>
            
                                <div class="modal-body">
                                    <div id="chat-log">
                                        ${history.slice(-20).map(m => 
                                            `<div class="${m.role==='user'?'chat-player':'chat-pnj'}">
                                                ${window.setup.escapeHtml(m.content)}
                                            </div>`
                                        ).join('')}
                                    </div>
                                    <textarea id="chat-input" placeholder="Écrivez votre message..."></textarea>
                                </div>
            
                                <div class="modal-footer">
                                    <button id="chat-send">Envoyer</button>
                                    <button id="chat-close" class="modal-close">Fermer</button>
                                </div>
                            </div>
                        `);

    $('body').addClass('modal-open');

    const $log = $('#chat-log');
    const $input = $('#chat-input');
    const $send = $('#chat-send');

    setTimeout(() => $log.scrollTop($log[0].scrollHeight), 50);

    $overlay.add('#chat-close').on('click', () => {
      $modal.remove();
      $overlay.remove();
      $('body').removeClass('modal-open');
    });

    async function send() {
      const text = $input.val().trim();
      if (!text) return;

      $input.val('').prop('disabled', true);
      $send.prop('disabled', true).text('Envoi...');

      $log.append(`<div class="chat-player">${window.setup.escapeHtml(text)}</div>`);
      history.push({
        role: 'user',
        content: text,
        timestamp: Date.now()
      });
      $log.scrollTop($log[0].scrollHeight);

      try {
        const res = await fetch('http://127.0.0.1:5001/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            pnj_id: pnjId,
            player_message: text,
            player_history: history.slice(-12),
            pnj_data: pnj
          })
        });

        const data = await res.json();
        const reply = data.ok ? data.reply : `[${safeName} ne répond pas…]`;

        $log.append(`<div class="chat-pnj">${window.setup.escapeHtml(reply)}</div>`);
        history.push({
          role: 'assistant',
          content: reply,
          timestamp: Date.now()
        });
      } catch (err) {
        $log.append(`<div class="chat-error">Erreur serveur</div>`);
        console.error(err);
      }

      $log.scrollTop($log[0].scrollHeight);
      $input.prop('disabled', false).focus();
      $send.prop('disabled', false).text('Envoyer');

      const npc = npcEnsure(pnjId);
      npc.relation = Math.min(100, (npc.relation || 40) + 1);
    }

    $send.on('click', send);
    $input.on('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });

    setTimeout(() => $input.focus(), 100);
  };

  // ==========================================================
  // DEBUG IMMÉDIAT
  // ==========================================================
  // Remplacer TOUTES les références à v dans window.setup.debugImmediate
  window.setup.debugImmediate = function() {
    console.group("🚨 DIAGNOSTIC URGENT");

    // État des systèmes
    console.log("📦 Loot State:", window.setup.lootState);
    console.log("👥 PNJ State:", window.setup.pnjState);
    console.log("🗺️ Geography State:", window.setup.geographyState);

    // Passage actuel - CORRECTION CRITIQUE
    console.log("📍 State.passage:", State.passage);
    console.log("📍 State.passage.title:", State.passage?.title);

    // Variables - CORRECTION : Utiliser State.variables directement
    const variables = State.variables;
    console.log("📊 Variables:", {
      passageCoords: variables.passageCoords,
      playerCoordinates: variables.playerCoordinates,
      currentPassage: State.currentPassage
    });

    // PNJs - CORRECTION : Utiliser State.variables directement
    console.log("👥 PNJs:", variables.npcs);

    console.groupEnd();
  };

  // Exécuter immédiatement
  setTimeout(() => {
    window.setup.debugImmediate();
  }, 1000);

  window.setup.debugLocationSystem = function() {
    console.group("🔍 DIAGNOSTIC SYSTÈME LOCALISATION");

    const v = State.variables;

    console.log("📍 Passage actuel:");
    console.log("  - State.passage:", State.passage);
    console.log("  - State.passage.title:", State.passage?.title);
    console.log("  - State.variables.currentPassage:", v.currentPassage);

    console.log("🗺️ Coordonnées:");
    console.log("  - v.playerCoordinates:", v.playerCoordinates);
    console.log("  - v.passageCoords:", v.passageCoords);

    console.log("👥 PNJs:");
    Object.entries(v.npcs || {}).forEach(([id, npc]) => {
      console.log(`  - ${id}:`, {
        passage: npc.passage,
        coordinates: npc.coordinates,
        continent: npc.continent,
        status: npc.status,
        isBuddy: npc.isBuddy,
        isSpawned: npc.isSpawned
      });
    });

    console.groupEnd();
  };

  // À appeler dans la console : setup.debugLocationSystem()

  $(document).one(':storyready', function() {
    console.log("🎮 STORY READY - INITIALISATION SÉCURISÉE");

    // 🔴 CORRECTION CRITIQUE : Synchroniser IMMÉDIATEMENT currentPassage
    State.variables.currentPassage = (typeof State.passage === 'string' ? State.passage : State.passage?.title) || 'Geole';
    console.log(`🔧 State.variables.currentPassage = "${State.variables.currentPassage}"`);

    // Initialiser les variables de base
    window.setup.ensureBaseStats();

    // Initialiser les coordonnées du passage de départ
    window.setup.ensurePassageCoords(State.variables.currentPassage);

    // Initialiser les coordonnées du joueur si manquantes
    const v = State.variables;
    if (!v.playerCoordinates) {
      const initialCoords = window.setup.ensurePassageCoords(State.variables.currentPassage);
      v.playerCoordinates = {
        x: Number(initialCoords.x),
        y: Number(initialCoords.y),
        continent: initialCoords.continent,
        passage: State.variables.currentPassage
      };
    }

    // Démarrer les chargements asynchrones
    Promise.resolve()
      .then(() => loadGeography())
      .then(() => loadLootsSequentially())
      .then(() => loadAllPNJ())
      .catch(error => {
        console.error("❌ ERREUR D'INITIALISATION:", error);
        // Fallbacks sécurisés
        initLootSystem();
        window.setup.pnjState.ready = true;
        window.setup.geographyState.ready = true;
      });

    // Initialiser les variables du jeu
    v.inventory = v.inventory || [];
    v.equipped = v.equipped || {};
    v.current_player_health = v.current_player_health ?? 10;
    v.max_player_health = v.max_player_health ?? 10;
    v.strength = v.strength || 0;
    v.resistance = v.resistance || 0;
    v.magic = v.magic || 0;
    v.gold = v.gold || 0;
    v.dexterity = v.dexterity || 0;
    v.level = v.level || 1;
    v.exp = v.exp || 0;
    v.inventoryNewItems = v.inventoryNewItems || [];
    v.inventoryViewed = v.inventoryViewed !== false;
    v.messages = v.messages || [];
    v.quests = v.quests || [];
    v.completedQuests = v.completedQuests || [];
    v.pendingQuests = v.pendingQuests || {};
    v.npcs = v.npcs || {};
    v.passageCoords = v.passageCoords || {};

    // Créer le HUD si nécessaire
    if (!document.getElementById('hud')) $('body').prepend('<div id="hud"></div>');
    if (!document.getElementById('notification-container')) $('body').append('<div id="notification-container"></div>');

    // Mise à jour initiale du HUD
    window.setup.updateHUD();

    console.log("✅ Initialisation storyready terminée");
  });

  // ------------------------------------------------------
  // 5. SÉCURISATION DES COORDONNÉES
  // ------------------------------------------------------
  window.setup.ensurePassageCoords = function(passageName) {
    const v = State.variables;
    v.passageCoords = v.passageCoords || {};

    // Si pas de coords, on en crée (mais on ne les utilise pas pour téléporter le joueur)
    if (!v.passageCoords[passageName]) {
      // On utilise les coords du joueur comme "fallback" temporaire
      // MAIS c'est ce qui causait le bug.
      // Le setTimeout dans updateFollowersCoordinates permet d'attendre que le vrai <<setcoords>> écrase ça.
      const playerPos = v.playerCoordinates || {
        x: 0,
        y: 0
      };

      v.passageCoords[passageName] = {
        x: playerPos.x,
        y: playerPos.y,
        continent: playerPos.continent || "Eldaron",
        isDefault: true // Marqueur pour dire "ce n'est pas précis"
      };
    }
    return v.passageCoords[passageName];
  };

  /* ==========================================================
     GESTIONNAIRES D'ÉVÉNEMENTS ET INITIALISATION (INIT)
     Ce bloc doit être placé TOUT À LA FIN du fichier JavaScript
     ========================================================== */

  // 1. INITIALISATION AU CHARGEMENT DE L'HISTOIRE
  $(document).one(':storyready', function() {
    console.log("🎮 [INIT] Story Ready : Chargement initial...");
    // Charger les données externes (PNJ, Loot, Géo)
    if (typeof loadAllPNJ === 'function') loadAllPNJ();
    if (window.setup.ensureLootReady) window.setup.ensureLootReady(() => console.log("📦 Loot prêt"));
    if (window.setup.ensureGeographyReady) window.setup.ensureGeographyReady(() => console.log("🗺️ Géo prête"));
    setTimeout(() => {
      window.setup.buildNavigationGraph();
    }, 1000); // Attendre que le JSON soit chargé
  });

  // 2. DÉBUT DU PASSAGE (S'exécute AVANT l'affichage)
  // Nettoyage préventif pour éviter les doublons lors des rechargements
  $(document).off(':passagestart');
  $(document).on(':passagestart', function() {
    // Animation de sortie (Fade Out)
    $('#passages').stop(true, true).animate({
      opacity: 0
    }, 200);

    // ⚠️ CRITIQUE : NE JAMAIS LANCER DE CALCULS PNJ ICI.
    // Les coordonnées du nouveau passage (<<setcoords>>) ne sont pas encore lues.
  });

  // 3. AFFICHAGE DU PASSAGE (S'exécute UNE FOIS le passage rendu)
  $(document).off(':passagedisplay');
  $(document).on(':passagedisplay', function() {
    console.log("🎬 [EVENT] Passage Display : Démarrage logique...");

    // A. SÉCURISATION DU PASSAGE ACTUEL
    // On met à jour la variable de référence immédiatement
    State.variables.currentPassage = (typeof State.passage === 'string' ? State.passage : State.passage?.title) || 'Geole';

    // B. SYNCHRONISATION CRITIQUE DU JOUEUR (NOUVEAU)
    // C'est ici que la magie opère : on verrouille la position du joueur (Macro ou Auto-détection)
    // Cela garantit que v.playerCoordinates est correct AVANT de bouger les PNJ.
    if (window.setup.syncPlayerPosition) {
        window.setup.syncPlayerPosition();
    } else {
        // Fallback de sécurité si la fonction n'est pas encore chargée
        window.setup.ensurePassageCoords(State.variables.currentPassage);
    }

    // C. GESTION DU DÉPLACEMENT PNJ
    // Les PNJ réagissent maintenant à la position VALIDÉE du joueur
    if (window.setup.updateFollowersCoordinates) {
      console.log("👣 [EVENT] Lancement updateFollowersCoordinates...");
      window.setup.updateFollowersCoordinates();
    }

    // D. Animation d'entrée (Fade In)
    $('#passages').stop(true, true).animate({
      opacity: 1
    }, 400);

    // E. Mise à jour de l'interface (HUD)
    if (window.setup.updateHUD) window.setup.updateHUD();

    // F. Animations d'interface (Choix, Paragraphes progressifs)
    const $choices = $('#choices-container a, #passages a.link-internal, #passages a');
    const $paragraphs = $('.fade-paragraph');
    const $divider = $('#choices-divider');

    // Masquer initialement pour l'effet d'apparition
    $paragraphs.removeClass('visible').css('opacity', 0);

    // Apparition en cascade des paragraphes
    $paragraphs.each((i, el) => setTimeout(() => $(el).addClass('visible'), i * 300));

    // Apparition du séparateur
    const baseDelay = $paragraphs.length * 180 + 300;
    if ($divider.length) setTimeout(() => $divider.addClass('visible'), baseDelay);

    // Masquer les choix initialement
    $choices.removeClass('visible').css({
      'pointer-events': 'none',
      opacity: 0,
      filter: 'grayscale(80%)'
    });

    // Gestion des icônes devant les choix (Macro <<choiceicon>>)
    $('.choiceicon-marker').each(function() {
      const $marker = $(this);
      const type = $marker.data('type');
      const iconSrc = window.setup.choiceIcons ? window.setup.choiceIcons[type] : null;

      if (!iconSrc) return;

      const $link = $marker.nextAll('a').first();
      if (!$link.length) return;

      // Injection de l'icône
      const $icon = $(`<img class="choice-icon" src="${iconSrc}" alt="${type}">`);
      const $wrapper = $('<span class="has-choice-icon"></span>').append($icon, $link.contents());
      $link.empty().append($wrapper);
      $marker.remove();
    });

    // Apparition en cascade des choix
    const linkStart = baseDelay + 500;
    $choices.each((i, el) => setTimeout(() => $(el).addClass('visible').animate({
      opacity: 1
    }, 300), linkStart + i * 200));

    // Finalisation (réactivation des clics)
    const totalDelay = linkStart + $choices.length * 200 + 300;
    setTimeout(() => {
      $choices.css({
        'pointer-events': 'auto',
        filter: 'none'
      });

      // Marquer le passage comme visité
      const v = State.variables;
      v.visitedPassages = v.visitedPassages || {};
      v.visitedPassages[State.passage] = true;

      // Rafraîchir panneau compagnons une dernière fois pour être sûr
      if (window.renderBuddiesPanel) window.renderBuddiesPanel();

    }, totalDelay);
  });
})();