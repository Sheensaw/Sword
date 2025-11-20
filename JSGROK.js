(function() {
  'use strict';

  //#region Initialisation
  console.log("🎮 DÉMARRAGE SYSTÈME DE JEU...");

  window.setup = window.setup || {};
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

  // États de chargement unifiés
  const loadingStates = ['loot', 'pnj', 'geography'];
  loadingStates.forEach(state => {
    window.setup[`${state}State`] = {
      ready: false,
      loading: false,
      attempted: false,
      fallbackCache: {}
    };
  });

  // Variable globale pour le timer de rafraîchissement des PNJ
  let pnjTimerInterval = null;

  function V() {
    return State.variables;
  }

  // Fonction utilitaire pour formater les secondes en MM:SS
  window.setup.formatTime = function(totalSeconds) {
    if (totalSeconds <= 0) return '00:00';
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const pad = (num) => String(num).padStart(2, '0');
    return `${pad(minutes)}:${pad(seconds)}`;
  };

  window.setup.ensureBaseStats = function() {
    const v = V();
    const defaults = {
      strength: 0,
      resistance: 0,
      dexterity: 0,
      magic: 0,
      health: 0,
      maxHealth: 100,
      stamina: 0,
      maxStamina: 100,
      experience: 0,
      level: 1,
      gold: 0,
      inventory: [],
      equipment: {},
      npcs: {},
      visitedPassages: {},
      playerCoords: { x: 0, y: 0, continent: 'Eldaron' },
      playerTravelSpeed: 5
    };

    Object.keys(defaults).forEach(key => {
      if (v[key] === undefined || v[key] === null) {
        v[key] = defaults[key];
      } else if (typeof defaults[key] === 'number') {
        v[key] = Number(v[key]) || defaults[key];
      }
    });
  };
  //#endregion

  //#region SYSTÈME DE LOOT OPTIMISÉ
  console.log("🚀 INITIALISATION SYSTÈME LOOT...");

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

  // Chargement séquentiel robuste
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

    const loadPromises = lootFiles.map(async (path) => {
      const possiblePaths = [
        path,
        `./${path}`,
        `/server/${path}`,
        `./server/${path}`
      ];

      for (const currentPath of possiblePaths) {
        try {
          await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = currentPath;
            script.async = false;

            script.onload = () => {
              console.log(`✅ LOOT CHARGÉ: ${currentPath}`);
              resolve();
            };

            script.onerror = () => {
              reject(new Error(`Échec: ${currentPath}`));
            };

            document.head.appendChild(script);
          });
          break; // Succès, on sort de la boucle des chemins
        } catch (error) {
          console.warn(`❌ Échec chemin: ${currentPath}`);
          continue; // Essaye le chemin suivant
        }
      }
    });

    try {
      await Promise.allSettled(loadPromises);
      console.log("📊 CHARGEMENT LOOTS TERMINÉ");
    } catch (error) {
      console.error("❌ Erreur lors du chargement des loots:", error);
    } finally {
      initLootSystem();
    }
  }

  // Initialisation du système de loot
  function initLootSystem() {
    console.log("🔄 INITIALISATION CACHE LOOT...");

    const categories = window.lootCategories || {};
    window.setup.itemCache = { ...window.setup.fallbackItems };
    window.setup.randomLoot = window.setup.randomLoot || {};

    let totalItems = 0;
    let categoryCount = 0;

    Object.keys(categories).forEach(cat => {
      if (Array.isArray(categories[cat])) {
        categoryCount++;
        categories[cat].forEach(item => {
          if (item?.id && item.label) {
            window.setup.itemCache[item.id] = item;
            totalItems++;
          }
        });

        // Génération des loots aléatoires par catégorie
        const arr = categories[cat];
        if (arr.length > 0) {
          const randomItem = arr[Math.floor(Math.random() * arr.length)];
          window.setup.randomLoot[cat] = randomItem.id;
        }
      }
    });

    window.setup.lootState.ready = true;
    window.setup.lootState.loading = false;

    console.log(`✅ SYSTÈME LOOT PRÊT: ${totalItems} objets, ${categoryCount} catégories`);
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

  //#region MACROS SUGARCUBE OPTIMISÉES

  /* ---- MACRO : quest ---- */
  Macro.add('quest', {
    handler: function() {
      const [id, title, shortDesc, fullDesc = shortDesc, rewardStr = '{}'] = this.args;

      if (!id || !title || !shortDesc) {
        return this.error('<<quest id title shortDesc [fullDesc] [reward]>>');
      }

      const processQuest = (lootReady) => {
        const v = V();
        v.quests = v.quests || [];
        v.completedQuests = v.completedQuests || [];
        v.pendingQuests = v.pendingQuests || {};

        if (v.quests.some(q => q.id === id) || v.completedQuests.includes(id)) {
          return;
        }

        let reward = { gold: 0, items: [] };
        try {
          const parsed = JSON.parse(rewardStr);
          reward.gold = Number(parsed.gold) || 0;
          reward.items = Array.isArray(parsed.items) ? parsed.items : [];
        } catch (e) {
          console.warn("Récompense invalide:", rewardStr, e);
        }

        const finalItems = [];
        for (const item of reward.items) {
          if (typeof item === 'string' && item.startsWith('random:')) {
            const type = item.slice(7);
            const randomId = window.setup.randomLoot?.[type];
            const randomItem = randomId ? window.setup.getItemFromCache(randomId) : null;

            if (randomItem) {
              finalItems.push(randomItem);
            }
          } else if (typeof item === 'object' && item.id) {
            const cachedItem = window.setup.getItemFromCache(item.id);
            if (cachedItem) {
              finalItems.push(cachedItem);
            }
          }
        }

        v.pendingQuests[id] = {
          title,
          shortDesc,
          fullDesc,
          reward: {
            gold: reward.gold,
            items: finalItems
          }
        };

        showQuestProposalModal(id, v.pendingQuests[id]);
      };

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
      const saveToMessages = this.args.length > 3 ? this.args[3] : true;
      window.setup.showDialogueNotification(npc, shortText, fullText, saveToMessages);
    }
  });

  /* ---- MACRO : setcoords ---- */
  Macro.add('setcoords', {
    handler: function() {
      let x, y, continent;

      if (this.args.length === 1 && typeof this.args[0] === 'object') {
        const coords = this.args[0];
        x = Number(coords.x) || 0;
        y = Number(coords.y) || 0;
        continent = coords.continent || "Eldaron";
      } else if (this.args.length >= 2) {
        x = Number(this.args[0]) || 0;
        y = Number(this.args[1]) || 0;
        continent = this.args[2] || "Eldaron";
      } else {
        return this.error('Usage: <<setcoords x y [continent]>> ou <<setcoords {x:1, y:2, continent: "Eldaron"}>>');
      }

      const v = State.variables;
      const currentPassage = State.variables.currentPassage ||
                            (typeof State.passage === 'string' ? State.passage : State.passage?.title) ||
                            "Geole";

      if (!currentPassage) {
        console.error("❌ Impossible de déterminer le passage actuel dans setcoords");
        return;
      }

      v.passageCoords = v.passageCoords || {};
      v.playerCoordinates = v.playerCoordinates || {};

      v.passageCoords[currentPassage] = {
        x: Number(x),
        y: Number(y),
        continent: continent
      };

      v.playerCoordinates = {
        x: Number(x),
        y: Number(y),
        continent: continent,
        passage: currentPassage
      };

      console.log(`✅ Coordonnées définies pour "${currentPassage}": (${x}, ${y}, ${continent})`);

      window.setup.updateFollowersCoordinates();
      if (window.renderBuddiesPanel) window.renderBuddiesPanel();
      window.setup.updateHUD();
    }
  });

  /* ---- MACRO : displaylocation ---- */
  Macro.add('displaylocation', {
    handler: function() {
      const v = V();
      const currentPassage = State.passage;
      const passageCoords = (v.passageCoords || {})[currentPassage];

      if (!passageCoords) {
        this.output.appendChild(document.createTextNode("Position inconnue"));
        return;
      }

      const continent = passageCoords.continent || "Eldaron";
      const locationString = window.setup.getLocationString({
        x: passageCoords.x,
        y: passageCoords.y
      }, continent);

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

      const processAddItem = (lootReady) => {
        const v = V();
        v.inventory = v.inventory || [];
        v.inventoryNewItems = v.inventoryNewItems || [];
        v.has = v.has || {};

        const itemData = window.setup.getItemFromCache(id);

        if (!itemData) {
          console.error(`❌ ADDITEM ÉCHEC: ${id} non trouvé`);
          window.setup.showNotification('Erreur', `Objet ${id} non disponible`, 3000);
          return;
        }

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

        const existingIndex = v.inventory.findIndex(it => it.id === id);
        let notificationText = '';

        if (existingIndex === -1) {
          v.inventory.push(item);
          v.inventoryNewItems.push(id);
          notificationText = `${item.label} ajouté (${qty})`;
        } else {
          const existing = v.inventory[existingIndex];
          existing.qty += qty;
          existing.description = item.description || existing.description;

          ['isTwoHanded', 'requirements', 'damage', 'coeff', 'speed', 'critChance', 'critMultiplier', 'effects'].forEach(prop => {
            if (item[prop] !== undefined) {
              existing[prop] = item[prop];
            }
          });

          v.inventoryNewItems.push(id);
          notificationText = `Vous avez ${existing.qty} ${item.label}`;
        }

        v.has[id] = (v.has[id] || 0) + qty;

        const bonusText = Object.keys(item.bonus)
          .map(k => `+${item.bonus[k]} ${k}`)
          .join(' ');

        window.setup.showNotification(
          'Objet obtenu',
          notificationText + (bonusText ? ` ${bonusText}` : ''),
          3500
        );

        v.inventoryViewed = false;
        window.setup.updateInventoryCounter();
        window.setup.updateHUD();

        console.log(`✅ ADDITEM RÉUSSI: ${id} x${qty}`);
      };

      if (!window.setup.lootState.ready) {
        console.warn(`⏳ ADDITEM en attente du loot system: ${id}`);
        window.setup.ensureLootReady(processAddItem);
      } else {
        processAddItem(true);
      }
    }
  });

  // Version directe pour usage interne
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

      const currentPassage = State.passage || State.variables.currentPassage || 'PassageInconnu';
      npc.passage = currentPassage;

      const v = V();
      const passageCoords = (v.passageCoords || {})[currentPassage];
      if (passageCoords) {
        npc.coordinates = {
          x: passageCoords.x,
          y: passageCoords.y
        };
        npc.continent = passageCoords.continent || "Eldaron";
      } else {
        const playerCoords = v.playerCoordinates;
        if (playerCoords) {
          npc.coordinates = {
            x: playerCoords.x || 0,
            y: playerCoords.y || 0
          };
          npc.continent = playerCoords.continent || "Eldaron";
        } else {
          npc.coordinates = { x: 0, y: 0 };
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
          window.setup.showDialogueNotification(npc.name, `${npc.name} est mort.`, `${npc.name} est mort.`, false);
          break;
        case 'gone':
          npc.isActive = false;
          window.setup.showDialogueNotification(npc.name, `${npc.name} est parti.`, `${npc.name} est parti.`, false);
          break;
        default:
          npc.status = 'fixed';
          npc.passage = cmd;
          moveType = 'goto';
          break;
      }

      if (moveType) {
        window.setup.notifyPnjMove(name, moveType);
      }

      updateBuddyHUDVisibility();
    }
  });

  /* ---- MACRO : pnjfollow ---- */
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

      const currentPassage = State.variables.currentPassage ||
                            (typeof State.passage === 'string' ? State.passage : State.passage?.title) ||
                            'Geole';

      console.log(`📍 Passage actuel: "${currentPassage}"`);

      const v = V();
      window.setup.validatePNJCoordinates(name);

      const passageCoords = window.setup.ensurePassageCoords(currentPassage);
      console.log(`📍 Coordonnées destination:`, passageCoords);

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

      const currentPassage = State.passage || State.variables.currentPassage || 'PassageInconnu';
      npc.passage = currentPassage;
      npc.isAlive = true;
      npc.isActive = true;

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
      npc.coordinates = {
        x: x !== null ? x : (passageCoords ? passageCoords.x : 0),
        y: y !== null ? y : (passageCoords ? passageCoords.y : 0)
      };

      console.log(`PNJ ${pnjId} déplacé vers ${targetPassage} (${npc.coordinates.x}, ${npc.coordinates.y})`);

      window.setup.notifyPnjMove(pnjId, 'goto');

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

      if (!pnjId) {
        return this.error('Usage: <<pnjCoords "pnj_id" x y [continent]>>');
      }

      const npc = npcEnsure(pnjId);
      npc.coordinates = { x, y };
      npc.continent = continent;

      console.log(`Coordonnées de ${pnjId} mises à jour: (${x}, ${y}, ${continent})`);
    }
  });

  /* ---- MACRO : pnjgive ---- */
  Macro.add('pnjgive', {
    handler: function() {
      const pnjId = this.args[0];
      const itemId = this.args[1];
      const quantity = this.args[2] ? parseInt(this.args[2]) : 1;

      if (!pnjId || !itemId) {
        return this.error('Usage: <<pnjgive "compagnon_id" "item_id" [quantity]>>');
      }

      const v = V();
      const npc = v.npcs?.[pnjId];

      if (!npc || !npc.isBuddy) {
        return this.error(`Le PNJ "${pnjId}" n'est pas votre compagnon. Utilisez uniquement avec des compagnons.`);
      }

      const success = window.setup.giveItemToBuddy(pnjId, itemId, quantity);
      if (!success) {
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
        npc.status = 'fixed';
        npc.passage = currentPassage;
        npc.coordinates = { x: 0, y: 0 };
        npc.continent = "Eldaron";

        window.setup.notifyPnjMove(name, 'recall');
        window.renderBuddiesPanel?.();
        updateBuddyHUDVisibility();
        return;
      }

      const success = window.setup.startPNJTravel(
        name,
        currentPassage,
        passageCoords,
        passageCoords.continent || "Eldaron",
        'recall'
      );

      if (!success) {
        npc.status = 'fixed';
        npc.passage = currentPassage;
        npc.coordinates = { ...passageCoords };
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

      const testCoords = { x: 45, y: 55 };
      const location = window.setup.getLocationString(testCoords, "Eldaron");
      console.log("Test localisation:", location);
      console.groupEnd();

      this.output.appendChild(document.createTextNode(
        `Test géographie: ${location} | Continents: ${Object.keys(geoData.continents).join(', ')}`
      ));
    }
  });
  //#endregion

  //#region SYSTÈME GÉOGRAPHIE OPTIMISÉ
  console.log("🗺️ INITIALISATION SYSTÈME GÉOGRAPHIE...");

  window.setup.fallbackGeography = {
    continents: {
      "Eldaron": {
        regions: [{
          name: "Royaume Central de Valnoria",
          bounds: { x_min: 30, x_max: 60, y_min: 40, y_max: 70 },
          capital: "Lorn"
        }],
        cities: [{
          name: "Lorn",
          coords: { x: 45, y: 55 }
        }],
        points_of_interest: [{
          name: "Académie du Draen",
          type: "Centre de recherche",
          coords: { x: 45, y: 55 }
        }]
      }
    }
  };

  async function loadGeography() {
    if (window.setup.geographyState.loading) {
      console.log("⚠️ Chargement géographie déjà en cours");
      return;
    }

    window.setup.geographyState.loading = true;
    window.setup.geographyState.attempted = true;

    console.log("🗺️ DÉBUT CHARGEMENT GÉOGRAPHIE...");

    const possiblePaths = [
      './server/lore/velkarum.json',
      'server/lore/velkarum.json',
      './lore/velkarum.json',
      'lore/velkarum.json',
      'velkarum.json'
    ];

    let success = false;

    for (const path of possiblePaths) {
      try {
        console.log(`🔄 Tentative de chargement depuis: ${path}`);
        const response = await fetch(path);

        if (response.ok) {
          const geographyData = await response.json();
          window.setup.geographyState.data = geographyData;
          window.setup.geographyState.ready = true;
          success = true;
          console.log(`✅ GÉOGRAPHIE CHARGÉE depuis: ${path}`);
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (!success) {
      console.warn("❌ ÉCHEC CHARGEMENT GÉOGRAPHIE, utilisation du fallback");
      window.setup.geographyState.data = JSON.parse(JSON.stringify(window.setup.fallbackGeography));
      window.setup.geographyState.ready = true;
    }

    window.setup.geographyState.loading = false;
    console.log("✅ SYSTÈME GÉOGRAPHIE PRÊT");
  }

  window.setup.getGeographyData = function() {
    if (!window.setup.geographyState.ready || !window.setup.geographyState.data) {
      console.warn("⚠️ Géographie pas prêt, utilisation du fallback");
      return JSON.parse(JSON.stringify(window.setup.fallbackGeography));
    }

    return window.setup.geographyState.data;
  };

  window.setup.ensureGeographyReady = function(callback, maxAttempts = 10) {
    let attempts = 0;

    function check() {
      attempts++;

      if (window.setup.geographyState.ready) {
        callback(true);
        return;
      }

      if (attempts >= maxAttempts) {
        console.warn("❌ Timeout attente système géographie");
        callback(false);
        return;
      }

      if (!window.setup.geographyState.attempted) {
        loadGeography();
      }

      setTimeout(check, 200);
    }

    check();
  };
  //#endregion

  //#region SYSTÈME DE DÉPLACEMENT PNJ CORRIGÉ
  window.setup.updateFollowersCoordinates = function() {
    setTimeout(() => {
      const v = State.variables;
      const destinationPassage = State.passage;

      if (!destinationPassage) return;

      const destCoords = window.setup.ensurePassageCoords(destinationPassage);

      console.log(`📍 [CHECK] Arrivée à "${destinationPassage}" (${destCoords.x}, ${destCoords.y}). Vérification des suiveurs...`);

      v.playerCoordinates = {
        x: Number(destCoords.x),
        y: Number(destCoords.y),
        continent: destCoords.continent || "Eldaron",
        passage: destinationPassage
      };
      v.currentPassage = destinationPassage;

      Object.entries(v.npcs || {}).forEach(([pnjId, npc]) => {
        if (npc.status === 'follow' && npc.isBuddy && npc.isAlive && npc.isActive && npc.isSpawned) {
          if (npc.travelDestination && npc.travelDestination.passage === destinationPassage) {
            return;
          }

          const dist = window.setup.calculateDistance(
            npc.coordinates,
            destCoords,
            npc.continent,
            destCoords.continent || "Eldaron"
          );

          if (dist > 0.1) {
            console.log(`🚀 [DÉPART] ${npc.name} est à ${dist.toFixed(1)}m (Ancienne pos: ${npc.passage}) -> Doit rejoindre ${destinationPassage}.`);

            window.setup.startPNJTravel(
              pnjId,
              destinationPassage,
              destCoords,
              destCoords.continent || "Eldaron",
              'follow'
            );
          } else {
            npc.passage = destinationPassage;
            npc.coordinates = { ...destCoords };
          }
        }
      });

      if (window.setup.updateHUD) window.setup.updateHUD();
    }, 100);
  };

  window.setup.startPNJTravel = function(npcName, targetPassage, targetCoords, targetContinent, targetStatus = 'fixed') {
    const v = V();
    const npc = v.npcs[npcName];
    if (!npc) return false;

    const dist = window.setup.calculateDistance(
      npc.coordinates,
      targetCoords,
      npc.continent,
      targetContinent
    );

    const travelSpeed = v.playerTravelSpeed ?? 5;
    const travelTimeSeconds = dist / travelSpeed;
    const startTime = Date.now();
    const endTime = startTime + travelTimeSeconds * 1000;

    npc.status = 'traveling';
    npc.travelData = {
      startTime: startTime,
      endTime: endTime,
      targetPassage: targetPassage,
      targetCoords: targetCoords,
      targetContinent: targetContinent,
      targetStatus: targetStatus
    };

    console.log(`⏳ [VOYAGE] ${npc.name} : Trajet de ${dist.toFixed(1)}m en ${travelTimeSeconds.toFixed(1)}s`);

    startPNJTimer();
    window.renderBuddiesPanel();
    return true;
  };

  window.setup.calculateTravelTime = function(distance) {
    const msPerUnit = 1500;
    const minMs = 5000;
    const maxMs = 120000;

    let time = distance * msPerUnit;
    time = Math.max(minMs, Math.min(maxMs, time));
    time = time * (0.9 + Math.random() * 0.2);

    return Math.floor(time);
  };

  window.setup.calculateDistance = function(coord1, coord2, continent1, continent2) {
    if (continent1 !== continent2) {
      return 2000;
    }
    const dx = coord1.x - coord2.x;
    const dy = coord1.y - coord2.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  window.setup.ensurePassageCoords = function(passageName) {
    const v = State.variables;
    v.passageCoords = v.passageCoords || {};

    if (!v.passageCoords[passageName]) {
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

    delete npc.travelStartTime;
    delete npc.travelEndTime;
    delete npc.travelDestination;
    delete npc.travelTimeout;

    npc.status = 'fixed';
  };

  function startPNJTimer() {
    if (pnjTimerInterval) return;

    pnjTimerInterval = setInterval(() => {
      const v = V();
      const now = Date.now();
      let shouldRerender = false;
      let stillTraveling = false;

      Object.values(v.npcs || {}).forEach(npc => {
        if (npc.status === 'traveling' && npc.travelData) {
          stillTraveling = true;
          const travelData = npc.travelData;

          if (now >= travelData.endTime) {
            npc.status = travelData.targetStatus;
            npc.passage = travelData.targetPassage;
            npc.coordinates = { ...travelData.targetCoords };
            npc.continent = travelData.targetContinent;
            delete npc.travelData;

            console.log(`✅ [VOYAGE] ${npc.name} est arrivé à destination: ${npc.passage}`);
            window.setup.showDialogueNotificationShort(npc.name, "Je suis arrivé(e).", "Voyage terminé.");
            shouldRerender = true;
          } else {
            shouldRerender = true;
          }
        }
      });

      if (shouldRerender) {
        window.renderBuddiesPanel();
      }

      if (!stillTraveling && pnjTimerInterval) {
        clearInterval(pnjTimerInterval);
        pnjTimerInterval = null;
        console.log("⏱️ [TIMER] Arrêt du timer PNJ. Plus de voyage en cours.");
      }
    }, 1000);

    console.log("⏱️ [TIMER] Lancement du timer PNJ pour le suivi des voyages.");
  }
  //#endregion

  //#region GESTION PNJ OPTIMISÉE
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
      const newNPC = {
        name,
        isSpawned: false,
        isBuddy: false,
        status: 'fixed',
        passage: '',
        coordinates: { x: 0, y: 0 },
        continent: "Eldaron",
        isAlive: true,
        isActive: true,
        health: 20,
        maxHealth: 20,
        relation: 50,
        loyalty: 50,
        mood: 0,
        inventory: {},
        equipment: {
          weapon: null, armor: null, head: null, torso: null,
          arms: null, legs: null, feet: null, shield: null
        },
        hasWeapon: false,
        stats: { strength: 0, dexterity: 0, resistance: 0, level: 1 }
      };
      v.npcs[name] = newNPC;
    } else {
      const n = v.npcs[name];
      if (typeof n.stats === 'undefined') {
        n.stats = { strength: 0, dexterity: 0, resistance: 0, level: 1 };
      } else {
        n.stats.strength = n.stats.strength || 0;
        n.stats.dexterity = n.stats.dexterity || 0;
        n.stats.resistance = n.stats.resistance || 0;
        n.stats.level = n.stats.level || 1;
      }

      if (typeof n.continent === 'undefined') n.continent = "Eldaron";
      if (typeof n.inventory === 'undefined') n.inventory = {};
      if (typeof n.equipment === 'undefined') {
        n.equipment = {
          weapon: null, armor: null, head: null, torso: null,
          arms: null, legs: null, feet: null, shield: null
        };
      }
      if (typeof n.hasWeapon === 'undefined') n.hasWeapon = false;
      if (typeof n.coordinates === 'undefined') n.coordinates = { x: 0, y: 0 };
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

  function updateBuddyHUDVisibility() {
    const v = V();
    const count = Object.values(v.npcs || {}).filter(n => n.isBuddy && n.isSpawned && n.isAlive && n.isActive).length;
    $('#buddy-toggle').toggle(count > 0);
    const $c = $('#buddy-counter');
    if ($c.length) $c.text(count > 0 ? String(count) : '').toggle(count > 0);
    if (window.setup.updateHUD) window.setup.updateHUD();
  }

  function notifyBuddy(text) {
    if (window.setup && typeof window.setup.notifyBuddy === 'function') {
      window.setup.notifyBuddy(text);
    } else {
      window.setup?.showNotification?.('Compagnon', text, 3000);
    }
  }

  window.setup.validatePNJCoordinates = function(pnjId) {
    const npc = npcEnsure(pnjId);

    if (typeof npc.coordinates !== 'object' || npc.coordinates === null) {
      npc.coordinates = { x: 0, y: 0 };
    }

    npc.coordinates.x = Number(npc.coordinates.x) || 0;
    npc.coordinates.y = Number(npc.coordinates.y) || 0;

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

    if (!npc.passage && npc.isSpawned) {
      npc.passage = State.variables.currentPassage || (typeof State.passage === 'string' ? State.passage : State.passage?.title) || 'Geole';
    }

    console.log(`📍 Coordonnées validées pour ${pnjId}: (${npc.coordinates.x}, ${npc.coordinates.y}, ${npc.continent}) dans ${npc.passage}`);

    return npc.coordinates;
  };

  window.setup.isBuddy = function(pnjId) {
    const v = V();
    const npc = v.npcs?.[pnjId];
    return npc && npc.isBuddy === true;
  };

  window.setup.getBuddies = function() {
    const v = V();
    return Object.entries(v.npcs || {})
      .filter(([key, npc]) => npc.isBuddy && npc.isSpawned && npc.isActive && npc.isAlive)
      .map(([key, npc]) => ({ id: key, ...npc }));
  };

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
  //#endregion

  //#region INVENTAIRE ET ÉQUIPEMENT PNJ
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

    playerItem.qty -= quantity;
    if (playerItem.qty <= 0) {
      v.inventory = playerInventory.filter(item => item.id !== itemId);
      const equipped = v.equipped || {};
      Object.keys(equipped).forEach(slot => {
        if (equipped[slot] === itemId) {
          window.setup.unequipItem(itemId, slot, true);
        }
      });
    }

    v.has = v.has || {};
    v.has[itemId] = Math.max(0, (v.has[itemId] || 0) - quantity);
    if (v.has[itemId] === 0) delete v.has[itemId];

    if (npc.inventory[itemId]) {
      npc.inventory[itemId] += quantity;
    } else {
      npc.inventory[itemId] = quantity;
    }

    const itemData = window.setup.itemCache && window.setup.itemCache[itemId];
    if (itemData && itemData.type === 'weapon' && !npc.equipment.weapon) {
      if (window.setup.canPnjEquipItem(pnjId, itemId)) {
        const success = window.setup.equipItemForPnj(pnjId, itemId, 'weapon');
        if (success) {
          console.log(`Arme ${itemId} équipée automatiquement sur ${pnjId}`);
        }
      }
    }

    console.log(`Item donné à ${pnjId}: ${itemId} x${quantity}`);
    const itemName = itemData?.label || itemId;
    window.setup.showNotification('Don réussi', `${quantity} ${itemName} donné à ${npc.name}`, 3000);

    window.setup.updateHUD();
    if (window.renderBuddiesPanel) window.renderBuddiesPanel();
    return true;
  };

  window.setup.canPnjEquipItem = function(pnjId, itemId) {
    const npc = npcEnsure(pnjId);
    const itemData = window.setup.itemCache && window.setup.itemCache[itemId];
    if (!itemData || !itemData.requirements) {
      return true;
    }
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
      return false;
    }
    return true;
  };

  window.setup.equipItemForPnj = function(pnjId, itemId, slot) {
    const npc = npcEnsure(pnjId);
    if (!npc.inventory[itemId] || npc.inventory[itemId] <= 0) {
      console.warn(`PNJ ${pnjId} ne possède pas l'item ${itemId} dans son inventaire`);
      return false;
    }

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
        const msg = `Conditions non remplies : ${missing.join(' • ')}`;
        window.setup.showNotification('Impossible d\'équiper', msg, 3500);
        return false;
      }
    }

    if (npc.equipment[slot]) {
      window.setup.unequipItemForPnj(pnjId, slot);
    }

    npc.equipment[slot] = itemId;
    if (slot === 'weapon') {
      npc.hasWeapon = true;
    }

    console.log(`PNJ ${pnjId} équipe ${itemId} dans le slot ${slot}`);
    if (window.renderBuddiesPanel) window.renderBuddiesPanel();
    return true;
  };

  window.setup.giveItemToBuddy = function(pnjId, itemId, quantity = 1) {
    try {
      const v = V();
      const npc = npcEnsure(pnjId);
      console.log(`🎁 DON: Tentative de donner ${itemId} x${quantity} à ${pnjId}`);

      if (!npc.isBuddy) {
        window.setup.showNotification('Impossible', `${npc.name} n'est pas votre compagnon`, 3000);
        return false;
      }

      if (!npc.isSpawned || !npc.isActive || !npc.isAlive) {
        window.setup.showNotification('Impossible', `${npc.name} ne peut pas recevoir d'objets`, 3000);
        return false;
      }

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

      playerItem.qty -= quantity;
      if (playerItem.qty <= 0) {
        v.inventory.splice(playerItemIndex, 1);
        const equipped = v.equipped || {};
        Object.keys(equipped).forEach(slot => {
          if (equipped[slot] === itemId) {
            window.setup.unequipItem(itemId, slot, true);
          }
        });
      }

      v.has = v.has || {};
      v.has[itemId] = Math.max(0, (v.has[itemId] || 0) - quantity);
      if (v.has[itemId] === 0) {
        delete v.has[itemId];
      }

      if (npc.inventory[itemId]) {
        npc.inventory[itemId] += quantity;
      } else {
        npc.inventory[itemId] = quantity;
      }

      const itemData = window.setup.itemCache && window.setup.itemCache[itemId];
      if (itemData && itemData.type === 'weapon' && !npc.equipment.weapon) {
        if (window.setup.canPnjEquipItem(pnjId, itemId)) {
          window.setup.equipItemForPnj(pnjId, itemId, 'weapon');
        }
      }

      npc.relation = Math.min(100, (npc.relation || 50) + 2);
      npc.loyalty = Math.min(100, (npc.loyalty || 50) + 1);

      const pnjData = window.setup.loadPNJ(pnjId);
      const reactions = pnjData.pnj?.réaction_joueur?.addItem;

      let reactionText = `${quantity} ${itemLabel} donné à ${npc.name}`;

      if (reactions && itemData) {
        const itemType = itemData.type || 'misc';
        if (reactions[itemType] && Array.isArray(reactions[itemType]) && reactions[itemType].length > 0) {
          const randomIndex = Math.floor(Math.random() * reactions[itemType].length);
          reactionText = reactions[itemType][randomIndex];
        } else if (reactions['misc'] && Array.isArray(reactions['misc']) && reactions['misc'].length > 0) {
          const randomIndex = Math.floor(Math.random() * reactions['misc'].length);
          reactionText = reactions['misc'][randomIndex];
        }
      }

      window.setup.showDialogueNotificationShort(npc.name, reactionText, reactionText, false);

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

  window.setup.giveItemToPnj = window.setup.giveItemToBuddy;
  //#endregion

  //#region UTILITAIRES GÉNÉRAUX OPTIMISÉS
  window.setup.escapeHtml = function(str) {
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m]);
  };

  window.setup.renderItemEncarts = function(item) {
    if (!item) return "";
    const ICONS = window.ICONS || {};
    const tags = [];

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

    if (item.type === "weapon") {
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

      if (typeof item.coeff !== "undefined") {
        tags.push(`
          <span class="bonus-tag">
            <img class="icon-08em" src="images/icons/dexterity.png" alt="Rapidité">
            ${item.coeff}
          </span>
        `);
      }

      if (typeof item.speed !== "undefined" && typeof item.coeff === "undefined") {
        tags.push(`
          <span class="bonus-tag">
            <img class="icon-08em" src="images/icons/dexterity.png" alt="Vitesse">
            ${item.speed}
          </span>
        `);
      }

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

    if (item.effects && Array.isArray(item.effects)) {
      item.effects.forEach(e => {
        tags.push(`
          <span class="effect-tag">
            ${window.setup.escapeHtml(e)}
          </span>
        `);
      });
    }

    if (item.type === "weapon" && item.isTwoHanded) {
      tags.push(`<span class="twohanded-tag">2M</span>`);
    }

    return `<div class="item-tags">${tags.join("")}</div>`;
  };

  window.setup.applyEnvBackground = function(env) {
    const v = V();
    if (v.currentEnv === env) return;
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

  window.setup.getLocationString = function(coords, continent) {
    if (!coords || typeof coords !== 'object') {
      console.warn("❌ getLocationString: coords invalides", coords);
      return "Position inconnue";
    }

    if (typeof coords.x !== 'number' || isNaN(coords.x) ||
        typeof coords.y !== 'number' || isNaN(coords.y)) {
      console.warn("❌ getLocationString: x ou y invalide", coords);
      return "Position invalide";
    }

    const safeCoords = {
      x: Math.max(0, Math.min(100, Number(coords.x) || 0)),
      y: Math.max(0, Math.min(100, Number(coords.y) || 0))
    };

    const safeContinent = continent || "Eldaron";
    const geo = window.setup.getGeographyData();

    if (!geo.continents || !geo.continents[safeContinent]) {
      return `${safeContinent} - Position hors carte`;
    }

    const continentData = geo.continents[safeContinent];
    let regionName = "Zone sauvage";
    let nearestCity = null;
    let minDistance = Infinity;

    if (continentData.regions && Array.isArray(continentData.regions)) {
      for (const region of continentData.regions) {
        const bounds = region.bounds;
        if (safeCoords.x >= bounds.x_min && safeCoords.x <= bounds.x_max &&
            safeCoords.y >= bounds.y_min && safeCoords.y <= bounds.y_max) {
          regionName = region.name;
          break;
        }
      }
    }

    if (continentData.cities && Array.isArray(continentData.cities)) {
      for (const city of continentData.cities) {
        const distance = Math.sqrt(
          Math.pow(city.coords.x - safeCoords.x, 2) +
          Math.pow(city.coords.y - safeCoords.y, 2)
        );
        if (distance < minDistance && distance <= 15) {
          minDistance = distance;
          nearestCity = city.name;
        }
      }
    }

    if (nearestCity) {
      if (minDistance <= 5) {
        return `${safeContinent} - ${regionName} - ${nearestCity}`;
      } else {
        return `${safeContinent} - ${regionName} - Proche de ${nearestCity}`;
      }
    } else {
      return `${safeContinent} - ${regionName}`;
    }
  };
  //#endregion

  //#region NOTIFICATIONS ET INTERFACE OPTIMISÉES
  window.setup.showNotification = function(title, text, duration = 3000, x, y, textColor) {
    let $container = $('#notification-container');
    if (!$container.length) {
      $container = $('<div id="notification-container"></div>').appendTo('body');
    }
    const $n = $('<div class="notification border-medieval"></div>');

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

  window.setup.showDialogueNotification = function(npc, shortText, fullText, saveToMessages = true) {
    let $container = $('#notification-container');
    if (!$container.length) {
      $container = $('<div id="notification-container"></div>').appendTo('body');
    }
    const $n = $('<div class="notification border-medieval"></div>');
    const icon = `<img class="icon-1em" src="${ICONS.speak}" alt="Dialogue">`;

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

    $n.on('click', '.notif-btn', function(e) {
      e.stopPropagation();
      if (removed) return;
      opened = true;
      removed = true;

      if (saveToMessages) {
        window.setup.addMessage(npc, shortText, fullText, 'read');
      }
      window.setup.showMessageModal({ npc, fullText });
      $n.remove();
    });

    const autoClose = setTimeout(() => {
      if (removed) return;
      removed = true;
      if ($n.is(':visible')) {
        $n.addClass('hide');
        setTimeout(() => {
          $n.remove();
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

  window.setup.showDialogueNotificationShort = function(npc, shortText, fullText, saveToMessages = true) {
    let $container = $('#notification-container');
    if (!$container.length) {
      $container = $('<div id="notification-container"></div>').appendTo('body');
    }

    $('.dialogue-notification-short').remove();

    const $n = $('<div class="notification border-medieval dialogue-notification-short"></div>');
    const icon = `<img class="icon-1em" src="${ICONS.speak}" alt="Dialogue">`;

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
    setTimeout(() => $n.addClass('show'), 10);

    let removed = false;
    const autoClose = setTimeout(() => {
      if (removed) return;
      removed = true;
      if ($n.is(':visible')) {
        $n.addClass('hide');
        setTimeout(() => {
          $n.remove();
          if (saveToMessages) {
            window.setup.addMessage(npc, shortText, fullText, 'new');
          }
        }, 400);
      }
    }, 3000);

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

    try {
      new Wikifier(null, '<<audio "notif_dialogue" play volume 0.8>>');
    } catch (e) {
      console.warn('Audio notification failed:', e);
    }
  };

  window.setup.notifyPnjMove = function(pnjId, moveType) {
    const pnjData = window.setup.loadPNJ(pnjId);
    const reactions = pnjData.pnj?.réaction_joueur?.pnjmove;

    if (!reactions) {
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
      const text = reactions.follow?.[0] || `${pnjId} effectue une action`;
      window.setup.showDialogueNotificationShort(pnjId, text, text, false);
    }
  };
  //#endregion

  //#region SYSTÈME HUD COMPLET
  window.setup.updateHUD = (function() {
    let timeout;

    function icon(img) {
      return `<img class="icon-1em" src="${img}" alt="">`;
    }

    return function() {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        const $hud = $('#hud');
        if (!$hud.length) return;

        const v = V();
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

        if (!$hud.find('.hud-inner').length) {
          $hud.html(`
            <div class="hud-inner">
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
            <div id="inventory-panel" class="side-panel"></div>
            <div id="equipment-panel" class="side-panel"></div>
            <div id="messages-panel" class="side-panel"></div>
            <div id="quest-panel" class="side-panel"></div>
            <div id="buddies-panel" class="side-panel"></div>
          `);
          $(document).trigger('hudready');
        } else {
          $('.hud-health').html(`${icon(ICONS.health)} ${health}/${maxHealth}`);
          $('.hud-strength').html(`${icon(ICONS.strength)} ${strength}`);
          $('.hud-dexterity').html(`${icon('images/icons/dexterity.png')} ${dexterity}`);
          $('.hud-resistance').html(`${icon(ICONS.defense)} ${resistance}`);
          $('.hud-magic').html(`${icon(ICONS.magic)} ${magic}`);
          $('.hud-gold').html(`${icon(ICONS.gold)} ${gold}`);

          const $firstLevel = $('.hud-exp-bar .hud-level:first');
          const $lastLevel = $('.hud-exp-bar .hud-level:last');
          const $expFill = $('.hud-exp-fill');
          if ($firstLevel.length) $firstLevel.text(`Niv. ${level}`);
          if ($lastLevel.length) $lastLevel.text(`Niv. ${level + 1}`);
          if ($expFill.length) $expFill.css('width', `${expPercent}%`);
        }

        const $toggles = $('#hud .hud-toggles');

        if (!document.getElementById('inventory-toggle')) {
          $toggles.append(`
            <div id="inventory-toggle" title="Inventaire">
              ${icon(ICONS.inventory)}
              <span id="inventory-counter" class="counter">0</span>
            </div>
          `);
        }

        if (!document.getElementById('equipment-toggle')) {
          $toggles.append(`<div id="equipment-toggle" title="Équipement">${icon(ICONS.equipment)}</div>`);
        }

        const buddiesCount = Object.values(v.npcs || {}).filter(n => n.isBuddy && n.isSpawned).length;
        if (!document.getElementById('buddy-toggle')) {
          $toggles.prepend(`
            <div id="buddy-toggle" title="Compagnons" style="display:none;">
              <img class="icon-1em" src="${ICONS.buddy}" alt="Compagnons">
              <span id="buddy-counter" class="counter">0</span>
            </div>
          `);
        }

        $('#buddy-toggle').toggle(buddiesCount > 0);
        const $buddyCounter = $('#buddy-counter');
        if ($buddyCounter.length) {
          $buddyCounter.text(buddiesCount > 0 ? String(buddiesCount) : '').toggle(buddiesCount > 0);
        }

        window.setup.togglePanel = function(panelSelector) {
          const $panel = $(panelSelector);
          if (!$panel.length) return;
          const isVisible = $panel.hasClass('show');
          $('.side-panel').removeClass('show');
          if (!isVisible) $panel.addClass('show');
        };

        $('#inventory-toggle').off('click').on('click', (e) => {
          e.stopPropagation();
          window.setup.togglePanel('#inventory-panel');
          v.inventoryViewed = true;
          window.setup.updateInventoryCounter();
          renderInventory();
        });

        $('#equipment-toggle').off('click').on('click', (e) => {
          e.stopPropagation();
          window.setup.togglePanel('#equipment-panel');
          renderEquipment();
        });

        $('#buddy-toggle').off('click').on('click', (e) => {
          e.stopPropagation();
          window.setup.togglePanel('#buddies-panel');
          window.renderBuddiesPanel();
        });

        $(document).off('click.hudpanels').on('click.hudpanels', e => {
          const $target = $(e.target);
          const isInsidePanel = $target.closest('.side-panel').length > 0;
          const isToggle = $target.closest('#hud .hud-toggles > div').length > 0;
          const isContextMenu = $target.closest('#inventory-context-menu, #delete-confirm, #buddy-context-menu, #give-buddy-menu, .context-menu').length > 0;
          const isModal = $target.closest('#confirm-alert, #modal-overlay, #modal-overlay-msg, #dialogue-modal, #quest-modal, #modal-overlay-quest, #quest-proposal-modal, #modal-overlay-quest-proposal, #item-modal, #modal-overlay-item').length > 0;
          const isBuddyMenuOpen = $('#buddy-context-menu, #give-buddy-menu').length > 0;
          const isBuddyFilterArrow = $target.closest('.buddy-filter-arrow, .buddy-filter-arrow *').length > 0;

          if (!isInsidePanel && !isToggle && !isContextMenu && !isModal && !isBuddyMenuOpen && !isBuddyFilterArrow) {
            $('.side-panel').removeClass('show');
          }
        });

        function renderInventory() {
          const $panel = $('#inventory-panel').empty();
          const inventory = v.inventory || [];
          const equipped = v.equipped || {};
          const typeLabels = {
            usable: "Objet", health: "Soin", food: "Nourriture", weapon: "Arme",
            shield: "Bouclier", head: "Casque", torso: "Armure", arms: "Gants",
            legs: "Jambes", feet: "Pieds", material: "Matériau", key: "Clé", misc: "Objet"
          };

          if (inventory.length) {
            inventory.sort((a, b) =>
              (typeLabels[a.type] || "Objet").localeCompare(typeLabels[b.type] || "Objet")
            );

            const frag = document.createDocumentFragment();
            inventory.forEach(it => {
              const typeLabel = typeLabels[it.type] || "Objet";
              const qtyBadge = it.qty > 1 ? `<span class="inventory-qty">${it.qty}</span>` : '';
              const isEquipped = Object.values(equipped).includes(it.id);
              const eqBadge = isEquipped ? `<span class="inventory-equipped">ÉQUIPÉ</span>` : '';
              const isNew = v.inventoryNewItems?.includes(it.id);
              const newBadge = isNew ? `<span class="item-new">Nouveau</span>` : '';
              const encartsHTML = window.setup.renderItemEncarts ? window.setup.renderItemEncarts(it) : '';

              const $item = $(`
                <div class="inventory-item${isNew ? ' new' : ''}" data-id="${it.id}" data-type="${it.type}">
                  <div class="inventory-badges">
                    ${qtyBadge}${eqBadge}${newBadge}
                  </div>
                  <div>${window.setup.escapeHtml(it.label)}</div>
                  <span class="inventory-type">${typeLabel}</span>
                  ${encartsHTML}
                </div>
              `);

              $item.on('mouseenter', function() {
                if ($(this).hasClass('new')) {
                  const id = $(this).data('id');
                  v.inventoryNewItems = v.inventoryNewItems.filter(i => i !== id);
                  $(this).removeClass('new').find('.item-new').remove();
                  window.setup.updateInventoryCounter();
                  window.setup.updateHUD();
                }
              });

              $item.on('contextmenu', function(e) {
                e.preventDefault();
                const id = $(this).data('id');
                const label = $(this).find('div').first().text().trim();
                const type = $(this).data('type');
                window.setup.showItemMenu(e.pageX, e.pageY, id, label, type, $(this));
              });

              frag.appendChild($item[0]);
            });
            $panel[0].appendChild(frag);
          } else {
            $panel.append('<em style="opacity:.6;">Aucun objet.</em>');
          }
        }

        function renderEquipment() {
          const $panel = $('#equipment-panel').empty();
          const inventory = v.inventory || [];
          const equipped = v.equipped || {};
          const slots = ['head', 'torso', 'arms', 'legs', 'feet', 'weapon', 'shield'];
          const slotLabels = {
            head: 'Tête', torso: 'Torse', arms: 'Mains', legs: 'Jambes',
            feet: 'Pieds', weapon: 'Arme', shield: 'Bouclier'
          };
          const typeLabels = {
            weapon: "Arme", shield: "Bouclier", head: "Casque", torso: "Armure",
            arms: "Gants", legs: "Jambes", feet: "Pieds"
          };

          slots.forEach(slot => {
            const eqId = equipped[slot];
            const eqItem = eqId ? inventory.find(it => it.id === eqId) : null;

            let eqHTML = '';
            if (eqItem) {
              let encartsHTML = '';
              if (window.setup.renderItemEncarts && typeof window.setup.renderItemEncarts === 'function') {
                encartsHTML = window.setup.renderItemEncarts(eqItem);
              }

              eqHTML = `
                <div class="inventory-item equipped-item" data-id="${eqItem.id}" data-type="${eqItem.type}">
                  <div>${window.setup.escapeHtml(eqItem.label)}</div>
                  <span class="inventory-type">${typeLabels[eqItem.type] || "Objet"}</span>
                  ${encartsHTML}
                </div>
              `;
            } else {
              eqHTML = '<em class="equipment-empty" style="opacity:.6; cursor:pointer;">Rien équipé</em>';
            }

            $panel.append(`
              <div class="equipment-slot" data-slot="${slot}">
                <strong>${slotLabels[slot]} :</strong>
                ${eqHTML}
              </div>
            `);
          });

          $panel.find('.equipment-slot').off('click.equipSlot').on('click.equipSlot', function() {
            const $slotEl = $(this);
            const slot = $slotEl.data('slot');
            const hasEquipped = !!$slotEl.find('.inventory-item').length;
            const vLocal = V();

            if (!hasEquipped) {
              vLocal._pendingEquipSlot = slot;
              $('.side-panel').removeClass('show');
              $('#inventory-panel').addClass('show');
              vLocal.inventoryViewed = true;
              window.setup.updateInventoryCounter();
              renderInventory();
              window.setup.showNotification('Équipement', `Choisissez un objet de type "${slot}" à équiper.`, 2800);
            }
          });
        }

        if ($('#inventory-panel').hasClass('show')) renderInventory();
        if ($('#equipment-panel').hasClass('show')) renderEquipment();
        if ($('#buddies-panel').hasClass('show')) window.renderBuddiesPanel();
        window.setup.updateMessageCounter();
        window.setup.updateQuestCounter();
        window.setup.updateInventoryCounter();
      }, 40);
    };
  })();

  window.setup.updateQuestCounter = function() {
    const v = V();
    const hasNewQuest = v.quests?.some(q => !q.viewed);
    const $c = $('#quest-counter');
    if ($c.length) {
      if (hasNewQuest) {
        $c.text('1').show();
      } else {
        $c.text('').hide();
      }
    }
  };

  window.setup.updateInventoryCounter = function() {
    const v = V();
    const hasNewItem = (v.inventoryNewItems || []).length > 0 && !v.inventoryViewed;
    const $c = $('#inventory-counter');
    if ($c.length) {
      if (hasNewItem) {
        $c.text('1').show();
      } else {
        $c.text('').hide();
      }
    }
  };

  $(document).off('click.inventory').on('click.inventory', '#inventory-panel .inventory-item', function(e) {
    e.preventDefault();
    e.stopPropagation();
    const $t = $(this);
    const id = $t.data('id');
    const v = V();
    const item = (v.inventory || []).find(it => it.id === id);
    if (!item) return;

    const pendingSlot = v._pendingEquipSlot;
    if (pendingSlot) {
      if (item.type === pendingSlot) {
        window.setup.equipItem(id, pendingSlot);
        v._pendingEquipSlot = null;
        $('#inventory-panel').removeClass('show');
        window.setup.updateInventoryCounter();
        window.setup.updateHUD();
      } else {
        window.setup.showNotification('Impossible', 'Cet objet ne peut pas être équipé dans ce slot.', 2600);
        v._pendingEquipSlot = null;
        $('#inventory-panel').removeClass('show');
      }
      return;
    }
    window.setup.showItemModal(item);
  });

  $(document).off('click.equipment').on('click.equipment', '#equipment-panel .inventory-item', function(e) {
    e.preventDefault();
    e.stopPropagation();
    const id = $(this).data('id');
    const v = V();
    const item = (v.inventory || []).find(it => it.id === id);
    if (item) window.setup.showItemModal(item);
  });

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
    $('#inventory-context-menu').remove();
    const menu = $('<div id="inventory-context-menu" class="context-menu"></div>').appendTo('body');
    const v = V();
    const item = (v.inventory || []).find(it => it.id === id);
    if (!item) return;
    label = item.label;
    const qty = item.qty || 1;
    const equipped = v.equipped || {};
    const equipableSlots = ['head', 'torso', 'arms', 'legs', 'feet', 'weapon', 'shield'];

    function addOption(txt, fn) {
      $('<div class="context-option"></div>')
        .text(txt)
        .on('click', function(e) {
          e.stopPropagation();
          fn();
          menu.remove();
        })
        .appendTo(menu);
    }

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
        window.setup.showGiveToBuddyMenu(x, y, id, label, type);
      });
    }

    if (!item.isQuestItem) {
      addOption('Jeter', () => window.setup.showDeleteConfirm(id, label, false, $item));
      if (qty > 1) addOption('Tout jeter', () => window.setup.showDeleteConfirm(id, label, true, $item));
    }

    menu.css({
      position: 'absolute',
      top: `${y + 5}px`,
      left: `${x + 5}px`,
      background: 'rgba(0,0,0,0.92)',
      border: '1px solid #fff',
      borderRadius: '8px',
      padding: '0.4em 0',
      minWidth: '150px',
      zIndex: 9999,
      fontSize: '0.9em',
      boxShadow: '0 0 16px rgba(0,0,0,0.8)',
      animation: 'fadeMenu 0.2s ease forwards',
      pointerEvents: 'auto'
    });

    $(document).off('mousedown.inventorymenu').on('mousedown.inventorymenu', function(e) {
      if (!$(e.target).closest('#inventory-context-menu').length) {
        $('#inventory-context-menu').remove();
        $(document).off('mousedown.inventorymenu');
      }
    });
  };

  window.setup.equipItem = function(id, slot) {
    const v = State.variables;
    const inv = v.inventory || [];
    const item = inv.find(it => it.id === id);
    if (!item || item.type.toLowerCase() !== slot.toLowerCase()) {
      return window.setup.showNotification('Erreur', 'Incompatible.');
    }

    window.setup.ensureBaseStats();
    v.equipped = v.equipped || {};
    const equippedWeaponId = v.equipped.weapon;
    const equippedShieldId = v.equipped.shield;
    const equippedWeapon = equippedWeaponId ? inv.find(it => it.id === equippedWeaponId) : null;
    const equippedShield = equippedShieldId ? inv.find(it => it.id === equippedShieldId) : null;

    if (slot === 'weapon' && item.isTwoHanded && equippedShield) {
      return window.setup.showNotification("Impossible", "Impossible d'équiper : arme à deux mains", 3000);
    }
    if (slot === 'shield' && equippedWeapon && equippedWeapon.isTwoHanded) {
      return window.setup.showNotification("Impossible", "Impossible d'équiper : arme à deux mains.", 3000);
    }

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

    if (v.equipped[slot]) {
      window.setup.unequipItem(v.equipped[slot], slot, true);
    }

    v.equipped[slot] = id;

    for (const k in bonus) {
      v[k] = Number(v[k] || 0) + Number(bonus[k]);
    }

    if (slot === 'weapon') {
      v.hasWeapon = true;
    }

    const bonusText = Object.keys(bonus).map(k => `+${bonus[k]} ${k}`).join(' ');
    window.setup.showNotification('Équipé', `${item.label} (${slot}) ${bonusText}`);
    window.setup.updateHUD();
  };

  window.setup.unequipItem = function(id, slot, silent) {
    const v = State.variables;
    if (!v.equipped || v.equipped[slot] !== id) return;

    const inv = v.inventory || [];
    const item = inv.find(it => it.id === id);
    const bonus = item?.bonus || {};

    delete v.equipped[slot];

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
  //#endregion

  //#region SYSTÈME DE QUÊTES OPTIMISÉ
  (function() {
    "use strict";
    const EVT_NS = '.quests';
    const getV = () => V();
    const $doc = $(document);

    function sortQuests(a, b) {
      if (a.status === 'ready' && b.status !== 'ready') return -1;
      if (b.status === 'ready' && a.status !== 'ready') return 1;
      if (!a.viewed && b.viewed) return -1;
      if (!b.viewed && a.viewed) return 1;
      return (b.timestamp || 0) - (a.timestamp || 0);
    }

    function renderQuestPanel() {
      const v = getV();
      const $panel = $('#quest-panel');
      if (!$panel.length) return;

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
      $panel.off('click' + EVT_NS, '.quest-entry').on('click' + EVT_NS, '.quest-entry', function() {
        const id = $(this).data('id');
        const quest = (v.quests || []).find(q => q.id === id);
        if (!quest) return;
        quest.viewed = true;
        window.setup.updateQuestCounter && window.setup.updateQuestCounter();
        window.setup.showQuestModal && window.setup.showQuestModal(quest);
      });
    }

    window.setup.renderQuestPanel = renderQuestPanel;

    if (!window.questsInitialized) {
      $doc.one(':storyready' + EVT_NS, function() {
        window.questsInitialized = true;
        const v = getV();
        v.quests = Array.isArray(v.quests) ? v.quests : [];
        v.completedQuests = Array.isArray(v.completedQuests) ? v.completedQuests : [];
        v.pendingQuests = v.pendingQuests && typeof v.pendingQuests === 'object' ? v.pendingQuests : {};

        if (!$('#quest-panel').length) {
          $('body').append('<div id="quest-panel" class="side-panel"></div>');
        }

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

        $doc.off('click' + EVT_NS, '#quest-toggle').on('click' + EVT_NS, '#quest-toggle', function() {
          $('.side-panel').removeClass('show');
          $('#quest-panel').toggleClass('show');
          const v = getV();
          (v.quests || []).forEach(q => q.viewed = true);
          window.setup.updateQuestCounter && window.setup.updateQuestCounter();
          renderQuestPanel();
        });

        $doc.off('click.questclose' + EVT_NS).on('click.questclose' + EVT_NS, function(e) {
          if (!$(e.target).closest('#quest-panel, #quest-toggle').length) {
            $('#quest-panel').removeClass('show');
          }
        });
      });
    }

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

    window.setup.markQuestCompleted = function(id) {
      const v = V();
      const idx = (v.quests || []).findIndex(q => q.id === id);
      if (idx === -1 || v.quests[idx].status !== 'ready') return;

      const quest = v.quests[idx];
      const reward = quest.reward || {};
      const rewardLines = [];

      if (reward.gold) {
        v.gold = (v.gold || 0) + Number(reward.gold);
        rewardLines.push(`• ${Number(reward.gold || 0)} or`);
      }

      if (Array.isArray(reward.items) && reward.items.length > 0) {
        for (const item of reward.items) {
          const bonusStr = item.bonus ?
            Object.keys(item.bonus)
            .map(k => `${k}:${item.bonus[k]}`)
            .join(' ') :
            '';

          if (typeof window.setup.addItemDirect === 'function') {
            window.setup.addItemDirect(...[
              item.id,
              item.label,
              item.type || 'misc',
              1,
              bonusStr,
              false,
              '',
              item.description || '',
              item.isTwoHanded || false
            ]);
          } else {
            const m = Macro.get && Macro.get('addItem');
            if (m && m.handler) {
              const oldShowNotif = window.setup.showNotification;
              window.setup.showNotification = function() {};
              m.handler.call({ args: [
                item.id,
                item.label,
                item.type || 'misc',
                1,
                bonusStr,
                false,
                '',
                item.description || '',
                item.isTwoHanded || false
              ] });
              window.setup.showNotification = oldShowNotif;
            }
          }

          const bonusTxt = item.bonus ?
            ` (${Object.keys(item.bonus)
                .map(k => `${k}:${item.bonus[k]}`)
                .join(', ')})` :
            '';
          rewardLines.push(`• ${item.label}${bonusTxt}`);
        }
      }

      v.quests.splice(idx, 1);
      (v.completedQuests || (v.completedQuests = [])).push(id);

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

    window.setup.isQuestActive = id => (getV().quests || []).some(q => q.id === id && q.status === 'active');
    window.setup.isQuestReady = id => (getV().quests || []).some(q => q.id === id && q.status === 'ready');
    window.setup.isQuestCompleted = id => (getV().completedQuests || []).includes(id);

    window.setup.choiceIcons = Object.assign({
      move: "images/icons/move.png",
      look: "images/icons/look.png",
      interact: "images/icons/interact.png",
      speak: "images/icons/speak.png",
      attack: "images/icons/attack.png",
      back: "images/icons/back.png"
    }, window.setup.choiceIcons || {});
  })();
  //#endregion

  //#region PANNEAU COMPAGNONS OPTIMISÉ
  window.renderBuddiesPanel = function() {
    const v = V();
    const $panel = $('#buddies-panel');

    const $existingMenu = $('#buddy-context-menu');
    const hasMenu = $existingMenu.length > 0;
    const savedMenu = hasMenu ? $existingMenu.detach() : null;

    $panel.empty();

    const all = Object.values(v.npcs || {});
    const filters = [
      { id: 'all', label: 'Tous' },
      { id: 'follow', label: 'Suiveurs' },
      { id: 'traveling', label: 'En voyage' },
      { id: 'fixed', label: 'Sur place' },
      { id: 'dead', label: 'Morts' },
      { id: 'gone', label: 'Absents' }
    ];

    let currentFilter = v._buddyFilter || 'all';
    let currentIndex = filters.findIndex(f => f.id === currentFilter);
    if (currentIndex === -1) currentIndex = 0;
    v._buddyFilter = filters[currentIndex].id;

    const list = all.filter(n =>
      n.isSpawned && n.isBuddy &&
      (v._buddyFilter === 'all' ||
       (v._buddyFilter === 'follow' && n.status === 'follow') ||
       (v._buddyFilter === 'traveling' && n.status === 'traveling') ||
       (v._buddyFilter === 'fixed' && n.status === 'fixed' && n.isAlive && n.isActive) ||
       (v._buddyFilter === 'dead' && !n.isAlive) ||
       (v._buddyFilter === 'gone' && !n.isActive && n.isAlive))
    );

    const $bar = $('<div class="buddy-filter-bar"></div>').appendTo($panel);
    const $left = $('<button class="buddy-filter-arrow prev" title="Précédent">◄</button>').appendTo($bar);
    const $center = $('<div class="buddy-filter-label"></div>').appendTo($bar);
    const $right = $('<button class="buddy-filter-arrow next" title="Suivant">►</button>').appendTo($bar);
    $center.text(filters[currentIndex].label);

    function cycleFilter(dir) {
      window.ignoreNextBuddyMenuClose = true;
      setTimeout(() => { window.ignoreNextBuddyMenuClose = false; }, 200);
      currentIndex = (currentIndex + dir + filters.length) % filters.length;
      v._buddyFilter = filters[currentIndex].id;
      window.renderBuddiesPanel();
    }

    $left.on('click', () => cycleFilter(-1));
    $right.on('click', () => cycleFilter(1));

    if (!list.length) {
      $panel.append('<em style="opacity:.6;">Aucun compagnon dans cette catégorie.</em>');
      if (savedMenu) $('body').append(savedMenu);
      return;
    }

    list.forEach(b => {
      const health = Number(b.health ?? 0);
      const maxHealth = Math.max(1, Number(b.maxHealth ?? 1));
      const healthRatio = Math.max(0, Math.min(1, health / maxHealth));

      let badgeType = !b.isAlive ? 'dead' : (!b.isActive ? 'gone' : b.status);
      if (b.status === 'traveling') badgeType = 'traveling';

      const labels = { follow: 'Suit', fixed: 'Attend', dead: 'Mort', gone: 'Parti', traveling: 'Voyage' };
      const classes = { follow: 'buddy-follow', fixed: 'buddy-fixed', dead: 'buddy-dead', gone: 'buddy-gone', traveling: 'buddy-traveling' };

      const badgeHTML = `<span class="item-badge ${classes[badgeType] || ''}">${labels[badgeType] || badgeType}</span>`;
      const healthClass = !b.isAlive ? 'h-dead' : (healthRatio > 0.6 ? 'h-good' : healthRatio > 0.3 ? 'h-mid' : 'h-low');

      let locationHTML = window.setup.getLocationString(b.coordinates, b.continent);
      let timerHTML = '';

      if (b.status === 'traveling' && b.travelData) {
        const remainingTimeMs = b.travelData.endTime - Date.now();
        const remainingSeconds = Math.max(0, Math.floor(remainingTimeMs / 1000));

        if (remainingSeconds === 0 && remainingTimeMs > 0) {
          locationHTML = `<span class="timer-location">Arrivée imminente...</span>`;
        } else {
          timerHTML = `<span class="travel-timer">${window.setup.formatTime(remainingSeconds)}</span>`;
          locationHTML = `<span class="timer-location">Vers ${b.travelData.targetPassage}</span>`;
        }
      }

      const $entry = $(`
        <div class="buddy-entry" data-name="${b.name}">
          <div class="msg-header">
            <img class="icon-1em" src="${window.ICONS.buddy}" alt="">
            <strong>${window.setup.escapeHtml(b.name)}</strong>
            ${badgeHTML}
          </div>
          <div class="buddy-healthbar">
            <div class="buddy-healthfill ${healthClass}" style="width:${healthRatio * 100}%;"></div>
          </div>
          <div class="buddy-location-row">
            <div class="buddy-location">${locationHTML}</div>
            ${timerHTML}
          </div>
        </div>
      `);
      $panel.append($entry);
    });

    $panel.find('.buddy-entry').on('contextmenu', function(e) {
      e.preventDefault();
      e.stopPropagation();
      $('#buddy-context-menu').remove();

      const name = $(this).data('name');
      const npc = v.npcs[name];
      const $menu = $('<div id="buddy-context-menu" class="context-menu"></div>').appendTo('body');

      function addOption(text, fn, disabled = false) {
        const $opt = $('<div class="context-option"></div>').text(text);
        if (disabled) $opt.addClass('disabled');
        else $opt.on('click', ev => { ev.stopPropagation(); fn(); $menu.remove(); });
        $menu.append($opt);
      }

      if (!npc.isAlive) {
        addOption('Mort', () => {}, true);
      } else if (!npc.isActive) {
        addOption('Rappeler (Magie)', () => {
          npc.isActive = true;
          npc.passage = State.passage;
          window.renderBuddiesPanel();
        });
      } else if (npc.status === 'traveling') {
        addOption('Annuler voyage', () => {
          delete npc.travelData;
          npc.status = 'fixed';
          window.setup.showDialogueNotificationShort(npc.name, "Ordre de retour annulé.", "Annulation.");
          window.renderBuddiesPanel();
        });
      } else {
        if (npc.status === 'follow') {
          addOption('Attendre ici', () => {
            npc.status = 'fixed';
            npc.passage = State.passage;
            const pCoords = window.setup.ensurePassageCoords(State.passage);
            npc.coordinates = { ...pCoords };
            npc.continent = pCoords.continent;
            window.setup.showDialogueNotificationShort(npc.name, "Je vous attends ici.", "Ordre reçu.");
            window.renderBuddiesPanel();
          });
        } else {
          addOption('Me suivre', () => {
            const destPassage = State.passage;
            const destCoords = window.setup.ensurePassageCoords(destPassage);
            const destContinent = destCoords.continent || "Eldaron";

            const dist = window.setup.calculateDistance(
              npc.coordinates,
              destCoords,
              npc.continent,
              destContinent
            );

            console.log(`🖱️ [MENU] Ordre de suivre pour ${npc.name}. Distance: ${dist.toFixed(1)}m`);

            if (dist > 1) {
              window.setup.startPNJTravel(
                name,
                destPassage,
                destCoords,
                destContinent,
                'follow'
              );
              window.setup.showDialogueNotificationShort(npc.name, "J'arrive !", "Je me mets en route.");
            } else {
              npc.status = 'follow';
              npc.passage = destPassage;
              npc.coordinates = { ...destCoords };
              npc.continent = destContinent;
              window.setup.showDialogueNotificationShort(npc.name, "Je vous suis.", "Ordre reçu.");
              window.renderBuddiesPanel();
            }
          });
        }

        addOption('Parler', () => {
          window.setup.openChatModal(name);
        }, !npc || !npc.isAlive || !npc.isActive);

        {
          const healAmount = 5;
          const currentHP = Number(npc.health) || 0;
          const maxHP = Number(npc.maxHealth) || 1;
          if (npc.isAlive && npc.isActive && currentHP < maxHP) {
            addOption(`Soigner (+${healAmount} PV)`, () => {
              npc.health = Math.min(maxHP, currentHP + healAmount);
              window.setup.notifyBuddy(`${npc.name} est soigné (${npc.health}/${npc.maxHealth})`);
              window.renderBuddiesPanel();
            });
          }
        }

        addOption('Blesser (-5 PV)', () => {
          npc.health = Math.max(0, (Number(npc.health) || 0) - 5);
          if (npc.health <= 0) {
            npc.isAlive = false;
            npc.isActive = false;
            window.setup.notifyBuddy(`${npc.name} est mort.`);
          } else {
            window.setup.notifyBuddy(`${npc.name} blessé (${npc.health}/${npc.maxHealth})`);
          }
          window.renderBuddiesPanel();
        });

        addOption('Faire partir', () => {
          npc.isActive = false;
          window.setup.notifyBuddy(`${npc.name} s'éloigne…`);
          window.renderBuddiesPanel();
        });

        if (npc.equipment.weapon) {
          addOption('Reprendre l\'arme', () => {
            const success = window.setup.unequipItemForPnj(name, 'weapon');
            if (success) {
              window.setup.notifyBuddy(`Vous récupérez l'arme de ${npc.name}`);
            }
            window.renderBuddiesPanel();
          });
        }
      }

      const posX = Math.min(e.pageX, window.innerWidth - 160);
      const posY = Math.min(e.pageY, window.innerHeight - 200);
      $menu.css({ top: posY + 'px', left: posX + 'px' });

      $(document).one('click', function() {
        if (!window.ignoreNextBuddyMenuClose) {
          $('#buddy-context-menu').remove();
        }
      });
    });

    const isTraveling = list.some(b => b.status === 'traveling');
    if (isTraveling) {
      startPNJTimer();
    }

    if (savedMenu) $('body').append(savedMenu);
    window.setup.updateHUD();
  };

  window.setup.showGiveToBuddyMenu = function(x, y, id, label, type) {
    $('#give-buddy-menu').remove();
    const v = V();
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
        const success = window.setup.giveItemToBuddy(key, id, 1);
        if (!success) {
          console.error(`❌ Échec du don de ${id} à ${key}`);
        }
      });

      menu.append(option);
    });

    $(document).off('mousedown.givebuddy').on('mousedown.givebuddy', function(e) {
      if (!$(e.target).closest('#give-buddy-menu').length) {
        $('#give-buddy-menu').remove();
        $(document).off('mousedown.givebuddy');
      }
    });
  };
  //#endregion

  //#region FONCTIONS AUXILIAIRES MANQUANTES
  function showQuestProposalModal(id, questData) {
    $('#quest-proposal-modal, #modal-overlay-quest-proposal').remove();
    const $overlay = $('<div id="modal-overlay-quest-proposal"></div>').appendTo('body');
    const $modal = $('<div id="quest-proposal-modal" role="dialog"></div>').appendTo('body');

    let rewardHTML = '';
    if (questData.reward.gold) rewardHTML += `${questData.reward.gold} or<br>`;
    if (questData.reward.items.length)
      rewardHTML += questData.reward.items.map(i => window.setup.escapeHtml(i.label)).join('<br>');
    if (!rewardHTML) rewardHTML = 'Aucune';

    $modal.append(`
      <div class="modal-content">
        <div class="modal-header">
          <img class="icon-1em" src="${window.ICONS.quest}" alt="Quête">
          <span>Quête</span>
        </div>
        <div class="modal-body">
          <strong>${window.setup.escapeHtml(questData.title)}</strong><br>
          ${window.setup.escapeHtml(questData.fullDesc)}
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
  }

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

        if (currentHP >= maxHP) {
          window.setup.showNotification('Info', `${name} a déjà toute sa santé.`, 2500, x, y, '#fff');
          return;
        }

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

    if (used) {
      item.qty = Math.max(0, (item.qty || 1) - 1);
      if (item.qty <= 0) v.inventory = inv.filter(it => it.id !== id);
      v.has = v.has || {};
      v.has[id] = Math.max(0, (v.has[id] || 0) - 1);
      if (v.has[id] === 0) delete v.has[id];
    }

    window.setup.updateHUD();
  };

  window.setup.showDeleteConfirm = function(id, label, all, $item) {
    $('#delete-confirm').remove();
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

  window.setup.confirmDelete = function(id, label, all) {
    const v = V();
    const inv = v.inventory || [];
    const item = inv.find(it => it.id === id);
    if (!item || item.isQuestItem) {
      return window.setup.showNotification('Protégé', 'Impossible de jeter.', 3000);
    }

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

    v.has = v.has || {};
    v.has[id] = Math.max(0, (v.has[id] || 0) - removed);
    if (v.has[id] === 0) delete v.has[id];

    window.setup.showNotification('Jeté', `${label} retiré.`);
    window.setup.updateHUD();
  };

  window.setup.unequipItemForPnj = function(pnjId, slot) {
    const npc = npcEnsure(pnjId);
    const currentItem = npc.equipment[slot];
    if (!currentItem) return false;

    npc.equipment[slot] = null;

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

    v.has = v.has || {};
    v.has[currentItem] = (v.has[currentItem] || 0) + 1;

    if (slot === 'weapon') {
      npc.hasWeapon = false;
    }

    console.log(`PNJ ${pnjId} déséquipe ${currentItem} du slot ${slot} - item retourné au joueur`);
    window.setup.updateHUD();
    if (window.renderBuddiesPanel) window.renderBuddiesPanel();
    return true;
  };
  //#endregion

  //#region SYSTÈME PNJ OPTIMISÉ
  window.pnjData = window.pnjData || {};

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
        description_narrative: 'Une guerrière expérimentée aux cheveux d\'argent et au regard perçant. Elle porte une armure de cuir et une épée ancienne.',
        personnalite: 'Loyale et protectrice',
        contexte: 'Ancienne garde royale devenue mercenaire'
      }
    }
  };

  async function loadAllPNJ() {
    if (window.setup.pnjState.loading) {
      console.log("⚠️ Chargement PNJ déjà en cours");
      return;
    }

    window.setup.pnjState.loading = true;
    window.setup.pnjState.attempted = true;

    console.log("🔄 DÉBUT CHARGEMENT PNJ...");

    try {
      let pnjFiles = await loadPNJIndex();
      if (!pnjFiles || pnjFiles.length === 0) {
        console.warn("⚠️ Index des PNJs non trouvé, utilisation de la détection manuelle");
        pnjFiles = await detectAvailablePNJs();
      }

      let successCount = 0;

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
                }
              }
            } catch (pathError) {
              continue;
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
      window.setup.pnjState.ready = true;
      window.setup.pnjState.loading = false;
    }
  }

  async function loadPNJIndex() {
    try {
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

  async function detectAvailablePNJs() {
    console.log("🔍 Détection manuelle des PNJs disponibles...");

    const knownPNJs = ['Cyndra.json'];
    const availablePNJs = [];

    for (const pnjFile of knownPNJs) {
      try {
        const testPath = `./server/pnj/${pnjFile}`;
        const response = await fetch(testPath, { method: 'HEAD' });

        if (response.ok) {
          availablePNJs.push(pnjFile);
          console.log(`✅ PNJ détecté: ${pnjFile}`);
        }
      } catch (error) {
        console.log(`❌ PNJ non trouvé: ${pnjFile}`);
      }
    }

    if (availablePNJs.length === 0) {
      console.warn("⚠️ Aucun PNJ détecté, création d'un PNJ de secours en mémoire");
      window.pnjData['cyndra'] = window.setup.fallbackPNJs['cyndra'];
      availablePNJs.push('Cyndra.json');
    }

    console.log(`📂 PNJs détectés manuellement: ${availablePNJs.join(', ')}`);
    return availablePNJs;
  }

  window.setup.loadPNJ = function(id) {
    if (!id || typeof id !== 'string') {
      console.warn("❌ ID PNJ manquant ou invalide:", id);
      return createFallbackPNJ('inconnu');
    }

    if (!window.setup.pnjState.ready) {
      console.warn("⚠️ Système PNJ pas prêt, utilisation du fallback pour:", id);
      const fallbackId = id.toLowerCase();
      return window.setup.fallbackPNJs[fallbackId] || createFallbackPNJ(id);
    }

    const searchId = id.toLowerCase().trim();
    console.log(`🔍 RECHERCHE PNJ: "${searchId}"`);

    if (window.pnjData[searchId]) {
      console.log(`✅ PNJ trouvé par ID exact: ${searchId}`);
      return window.pnjData[searchId];
    }

    for (const [pnjId, pnjData] of Object.entries(window.pnjData)) {
      const searchStrings = [];

      if (pnjData.pnj?.identite) {
        const identite = pnjData.pnj.identite;
        if (identite.nom) searchStrings.push(identite.nom.toLowerCase());
        if (identite.nom_complet) searchStrings.push(identite.nom_complet.toLowerCase());
        if (identite.peuple) searchStrings.push(identite.peuple.toLowerCase());
        if (identite.metier_principal) searchStrings.push(identite.metier_principal.toLowerCase());
      }

      if (pnjData.nom) searchStrings.push(pnjData.nom.toLowerCase());
      if (pnjData.nom_complet) searchStrings.push(pnjData.nom_complet.toLowerCase());

      searchStrings.push(pnjId.toLowerCase());

      for (const searchString of searchStrings) {
        if (!searchString) continue;

        if (searchString === searchId) {
          console.log(`✅ PNJ trouvé par correspondance exacte: ${pnjId} (${searchString})`);
          return pnjData;
        }

        const normalizedSearch = searchId.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const normalizedString = searchString.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        if (normalizedString === normalizedSearch) {
          console.log(`✅ PNJ trouvé par correspondance normalisée: ${pnjId} (${searchString})`);
          return pnjData;
        }

        if (normalizedString.includes(normalizedSearch) || normalizedSearch.includes(normalizedString)) {
          console.log(`✅ PNJ trouvé par correspondance partielle: ${pnjId} (${searchString})`);
          return pnjData;
        }
      }
    }

    console.warn(`❌ AUCUN PNJ TROUVÉ POUR: "${id}"`);
    console.log("📋 PNJs disponibles:", Object.keys(window.pnjData));

    return createFallbackPNJ(id);
  };

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

  window.setup.getPnjData = function(pnjId) {
    const pnjData = window.setup.loadPNJ(pnjId);

    if (!pnjData) {
      console.error(`❌ Données PNJ non trouvées pour: ${pnjId}`);
      return createFallbackPNJ(pnjId).pnj;
    }

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
      personnalite: pnjData.pnj?.personnalite || "Personnalité inconnue",
      contexte: pnjData.pnj?.contexte || "Origine inconnue",
      réaction_joueur: pnjData.pnj?.réaction_joueur || pnjData.réaction_joueur || {
        addItem: {
          weapon: ["Merci pour cette arme.", "Je vais en prendre soin."],
          health: ["Merci pour ces soins.", "Je me sens mieux."],
          food: ["Merci pour la nourriture.", "J'avais faim."],
          misc: ["Merci.", "Je garde ça."]
        },
        pnjmove: {
          follow: ["Je vous suis.", "Je vous accompagne."],
          fixed: ["Je reste ici.", "Je vous attends."],
          goto: ["Je me déplace.", "Je vais là-bas."],
          recall: ["Je reviens.", "Je vous rejoins."]
        }
      }
    };
  };

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
  //#endregion

  //#region INITIALISATION FINALE
  window.setup.mapData = {
    'Geole': { x: 45, y: 55, continent: 'Eldaron' },
    'Manoir Abandonne': { x: 300, y: 120, continent: 'Eldaron' },
    'Cite des Ombres': { x: 800, y: 400, continent: 'Umbra' },
    'Port de l\'Ouest': { x: 10, y: 50, continent: 'Eldaron' }
  };

  window.setup.ensurePassageCoords = function(passageName) {
    if (passageName in window.setup.mapData) {
      return window.setup.mapData[passageName];
    }
    const v = V();
    const currentPassageData = window.setup.mapData[State.passage] || v.playerCoords;
    return {
      x: currentPassageData.x + Math.floor(Math.random() * 20 - 10),
      y: currentPassageData.y + Math.floor(Math.random() * 20 - 10),
      continent: currentPassageData.continent || 'Eldaron'
    };
  };

  $(document).one(':storyready', function() {
    console.log("🎮 STORY READY - INITIALISATION SÉCURISÉE");

    State.variables.currentPassage = (typeof State.passage === 'string' ? State.passage : State.passage?.title) || 'Geole';
    console.log(`🔧 State.variables.currentPassage = "${State.variables.currentPassage}"`);

    window.setup.ensureBaseStats();
    window.setup.ensurePassageCoords(State.variables.currentPassage);

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

    Promise.resolve()
      .then(() => loadGeography())
      .then(() => loadLootsSequentially())
      .then(() => loadAllPNJ())
      .catch(error => {
        console.error("❌ ERREUR D'INITIALISATION:", error);
        initLootSystem();
        window.setup.pnjState.ready = true;
        window.setup.geographyState.ready = true;
      });

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

    if (!document.getElementById('hud')) $('body').prepend('<div id="hud"></div>');
    if (!document.getElementById('notification-container')) $('body').append('<div id="notification-container"></div>');

    window.setup.updateHUD();
    console.log("✅ Initialisation storyready terminée");
  });

  $(document).on(':storyready', function(ev) {
    if (ev.eventPhase === 2) {
      const v = V();
      const isTraveling = Object.values(v.npcs || {}).some(
        npc => npc.isBuddy && npc.status === 'traveling'
      );
      if (isTraveling) {
        startPNJTimer();
      }
    }
  });

  $(document).off(':passagestart');
  $(document).on(':passagestart', function() {
    $('#passages').stop(true, true).animate({ opacity: 0 }, 200);
  });

  $(document).off(':passagedisplay');
  $(document).on(':passagedisplay', function() {
    console.log("🎬 [EVENT] Passage Display : Démarrage logique...");

    State.variables.currentPassage = (typeof State.passage === 'string' ? State.passage : State.passage?.title) || 'Geole';

    if (window.setup.updateFollowersCoordinates) {
      console.log("👣 [EVENT] Lancement updateFollowersCoordinates...");
      window.setup.updateFollowersCoordinates();
    }

    $('#passages').stop(true, true).animate({ opacity: 1 }, 400);

    if (window.setup.updateHUD) window.setup.updateHUD();

    const currentPassage = State.variables.currentPassage;
    if (currentPassage && window.setup.ensurePassageCoords) {
      window.setup.ensurePassageCoords(currentPassage);
    }

    const $choices = $('#choices-container a, #passages a.link-internal, #passages a');
    const $paragraphs = $('.fade-paragraph');
    const $divider = $('#choices-divider');

    $paragraphs.removeClass('visible').css('opacity', 0);
    $paragraphs.each((i, el) => setTimeout(() => $(el).addClass('visible'), i * 300));

    const baseDelay = $paragraphs.length * 180 + 300;
    if ($divider.length) setTimeout(() => $divider.addClass('visible'), baseDelay);

    $choices.removeClass('visible').css({
      'pointer-events': 'none',
      opacity: 0,
      filter: 'grayscale(80%)'
    });

    $('.choiceicon-marker').each(function() {
      const $marker = $(this);
      const type = $marker.data('type');
      const iconSrc = window.setup.choiceIcons ? window.setup.choiceIcons[type] : null;

      if (!iconSrc) return;

      const $link = $marker.nextAll('a').first();
      if (!$link.length) return;

      const $icon = $(`<img class="choice-icon" src="${iconSrc}" alt="${type}">`);
      const $wrapper = $('<span class="has-choice-icon"></span>').append($icon, $link.contents());
      $link.empty().append($wrapper);
      $marker.remove();
    });

    const linkStart = baseDelay + 500;
    $choices.each((i, el) => setTimeout(() => $(el).addClass('visible').animate({
      opacity: 1
    }, 300), linkStart + i * 200));

    const totalDelay = linkStart + $choices.length * 200 + 300;
    setTimeout(() => {
      $choices.css({ 'pointer-events': 'auto', filter: 'none' });

      const v = State.variables;
      v.visitedPassages = v.visitedPassages || {};
      v.visitedPassages[State.passage] = true;

      if (window.renderBuddiesPanel) window.renderBuddiesPanel();
    }, totalDelay);
  });
  //#endregion

})();