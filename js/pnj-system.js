// SYSTÈME PNJ / COMPAGNONS COMPLET
(function() {
  'use strict';

  // Initialisation du store PNJ
  function ensureNPCStore() {
    const v = V();
    if (!v.npcs) v.npcs = {};
  }

  // Assurer l'existence d'un PNJ
  function npcEnsure(name) {
    ensureNPCStore();
    const v = V();

    if (!v.npcs[name]) {
      v.npcs[name] = {
        name,
        isSpawned: false,
        isBuddy: false,
        status: 'fixed',
        passage: '',
        coordinates: { x: 0, y: 0 },
        continent: 'Eldaron',
        isAlive: true,
        isActive: true,
        health: 20,
        maxHealth: 20,
        relation: 50,
        loyalty: 50,
        mood: 0,
        inventory: {},
        equipment: {
          weapon: null, armor: null, head: null,
          torso: null, arms: null, legs: null, feet: null, shield: null
        },
        hasWeapon: false,
        stats: { strength: 0, dexterity: 0, resistance: 0, level: 1 }
      };
    } else {
      // Mise à jour des champs manquants
      const n = v.npcs[name];
      n.stats = n.stats || { strength: 0, dexterity: 0, resistance: 0, level: 1 };
      n.inventory = n.inventory || {};
      n.equipment = n.equipment || {
        weapon: null, armor: null, head: null,
        torso: null, arms: null, legs: null, feet: null, shield: null
      };
      n.hasWeapon = n.hasWeapon || false;
      n.coordinates = n.coordinates || { x: 0, y: 0 };
      n.continent = n.continent || 'Eldaron';
    }

    return v.npcs[name];
  }

  function npcGet(name) {
    return npcEnsure(name);
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  // Chargement des données PNJ
  window.pnjData = window.pnjData || {};

  async function loadAllPNJ() {
    if (window.setup.pnjState.loading) {
      console.log("⚠️ Chargement PNJ déjà en cours");
      return;
    }

    window.setup.pnjState.loading = true;
    window.setup.pnjState.attempted = true;

    console.log("🔄 DÉBUT CHARGEMENT PNJ...");

    try {
      const pnjFiles = await detectAvailablePNJs();
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
              const response = await fetch(path);
              if (response.ok) {
                const data = await response.json();
                const id = file.replace('.json', '').toLowerCase();

                if (data && data.pnj && data.pnj.identite) {
                  window.pnjData[id] = data;
                  console.log(`✅ PNJ CHARGÉ: ${id}`);
                  successCount++;
                  loaded = true;
                  break;
                }
              }
            } catch (e) { continue; }
          }

          if (!loaded && window.setup.fallbackPNJs[file.replace('.json', '').toLowerCase()]) {
            const fallbackId = file.replace('.json', '').toLowerCase();
            window.pnjData[fallbackId] = window.setup.fallbackPNJs[fallbackId];
            successCount++;
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

  // Détection manuelle des PNJ disponibles
  async function detectAvailablePNJs() {
    console.log("🔍 Détection manuelle des PNJs disponibles...");
    const knownPNJs = [
      'Cyndra.json', 'Kaelen.json', 'Lyra.json', 'Brak.json',
      'Garde.json', 'Marchand.json', 'Forgeron.json'
    ];

    const availablePNJs = [];
    for (const pnjFile of knownPNJs) {
      try {
        const testPath = `./server/pnj/${pnjFile}`;
        const response = await fetch(testPath, { method: 'HEAD' });
        if (response.ok) {
          availablePNJs.push(pnjFile);
          console.log(`✅ PNJ détecté: ${pnjFile}`);
        }
      } catch (error) {}
    }

    if (availablePNJs.length === 0) {
      console.warn("⚠️ Aucun PNJ détecté, utilisation de Cyndra comme fallback");
      availablePNJs.push('Cyndra.json');
    }

    return availablePNJs;
  }

  // Fonction de recherche PNJ
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

    // Recherche directe
    if (window.pnjData[searchId]) {
      console.log(`✅ PNJ trouvé par ID exact: ${searchId}`);
      return window.pnjData[searchId];
    }

    // Recherche avancée
    for (const [pnjId, pnjData] of Object.entries(window.pnjData)) {
      const searchStrings = [];

      if (pnjData.pnj?.identite) {
        const identite = pnjData.pnj.identite;
        if (identite.nom) searchStrings.push(identite.nom.toLowerCase());
        if (identite.nom_complet) searchStrings.push(identite.nom_complet.toLowerCase());
        if (identite.peuple) searchStrings.push(identite.peuple.toLowerCase());
        if (identite.metier_principal) searchStrings.push(identite.metier_principal.toLowerCase());
      }

      searchStrings.push(pnjId.toLowerCase());

      for (const searchString of searchStrings) {
        if (!searchString) continue;
        if (searchString === searchId) return pnjData;

        const normalizedSearch = searchId.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const normalizedString = searchString.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        if (normalizedString.includes(normalizedSearch) || normalizedSearch.includes(normalizedString)) {
          console.log(`✅ PNJ trouvé par correspondance partielle: ${pnjId}`);
          return pnjData;
        }
      }
    }

    // Fallback
    console.warn(`❌ AUCUN PNJ TROUVÉ POUR: "${id}"`);
    return createFallbackPNJ(id);
  }

  // Création fallback PNJ
  function createFallbackPNJ(id) {
    const name = id.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

    return {
      id: id,
      pnj: {
        identite: {
          nom: name,
          nom_complet: name,
          peuple: 'Inconnu',
          metier_principal: 'Voyageur'
        },
        description_narrative: `${name} est un personnage mystérieux.`,
        personnalite: 'Neutre',
        contexte: 'Origine inconnue',
        réaction_joueur: {
          addItem: {
            weapon: ["Merci pour cette arme.", "Je vais en prendre soin."],
            health: ["Merci pour ces soins.", "Je me sens mieux."],
            food: ["Merci pour la nourriture.", "J'avais faim."],
            misc: ["Merci.", "Je garde ça."]
          }
        }
      }
    };
  }

  // Extraction sécurisée des données PNJ
  window.setup.getPnjData = function(pnjId) {
    const pnjData = window.setup.loadPNJ(pnjId);

    return {
      identite: pnjData.pnj?.identite || pnjData.identite || {},
      description: pnjData.pnj?.description_narrative || pnjData.description_narrative || pnjData.description || "Description non disponible",
      personnalite: pnjData.pnj?.personnalite || pnjData.personnalite || "Personnalité inconnue",
      reactions: pnjData.pnj?.réaction_joueur || pnjData.réaction_joueur || {}
    };
  }

  // API Publique PNJ
  window.setup.updateFollowersCoordinates = function() {
    const v = V();
    const currentPassage = State.passage.title;
    const passageCoords = (v.passageCoords || {})[currentPassage];
    if (!passageCoords) {
      console.warn(`⚠️ Aucunes coordonnées définies pour le passage "${currentPassage}"`);
      return;
    }

    Object.values(v.npcs || {}).forEach(npc => {
      if (npc.status === 'follow' && npc.isBuddy && npc.isAlive && npc.isActive && npc.isSpawned) {
        npc.passage = currentPassage;
        npc.coordinates = { x: passageCoords.x, y: passageCoords.y };
        if (passageCoords.continent) npc.continent = passageCoords.continent;
        console.log(`👥 ${npc.name} suit le joueur vers ${currentPassage} (${npc.coordinates.x}, ${npc.coordinates.y})`);
      }
    });

    v.playerCoordinates = v.playerCoordinates || {};
    v.playerCoordinates.x = passageCoords.x;
    v.playerCoordinates.y = passageCoords.y;
    if (passageCoords.continent) v.playerCoordinates.continent = passageCoords.continent;
  }

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
      if (!window.setup.pnjState.attempted) loadAllPNJ();
      setTimeout(check, 300);
    }

    check();
  }

  // Modale PNJ
  window.setup.showPnjModal = function(pnjId) {
    console.log(`🖼️ [showPnjModal] Ouverture modale pour: "${pnjId}"`);

    $('#pnj-modal, #modal-overlay-pnj').remove();
    const $overlay = $('<div id="modal-overlay-pnj"></div>').appendTo('body');
    const $modal = $('<div id="pnj-modal" role="dialog" aria-modal="true"></div>').appendTo('body');

    const v = V();
    const npc = npcEnsure(pnjId);

    const processPnjModal = (pnjReady) => {
      const pnjData = window.setup.getPnjData(pnjId);
      const identite = pnjData.identite;

      console.log("📦 [showPnjModal] Données PNJ chargées:", pnjData);

      const displayName = identite.nom_complet || identite.nom || pnjId;
      const safeName = window.setup.escapeHtml(displayName);
      const race = identite.peuple || '';
      const metier = identite.metier_principal || '';
      let raceJobHTML = '';
      if (race && metier) {
        raceJobHTML = `<div class="pnj-race-job">${race} - ${metier}</div>`;
      } else if (race || metier) {
        raceJobHTML = `<div class="pnj-race-job">${race || metier}</div>`;
      }

      const safeDescription = window.setup.escapeHtml(pnjData.description);

      // Stats du PNJ
      const strength = npc.stats?.strength || 0;
      const dexterity = npc.stats?.dexterity || 0;
      const resistance = npc.stats?.resistance || 0;
      const level = npc.stats?.level || 1;

      // Inventaire du PNJ
      let inventoryHTML = '';
      const inventory = npc.inventory || {};
      const hasItems = Object.keys(inventory).length > 0;

      if (hasItems) {
        inventoryHTML = `
          <div class="pnj-inventory-section">
            <div class="weapon-section-title">Inventaire :</div>
            <div class="pnj-inventory-grid">
        `;

        Object.entries(inventory).forEach(([itemId, quantity]) => {
          const itemData = window.setup.getItemFromCache(itemId);
          if (itemData) {
            const itemLabel = window.setup.escapeHtml(itemData.label || itemId);
            const itemType = window.setup.escapeHtml(itemData.type || 'misc');
            const encartsHTML = window.setup.renderItemEncarts ? window.setup.renderItemEncarts(itemData) : '';

            inventoryHTML += `
              <div class="pnj-inventory-item" data-id="${itemId}">
                <div class="pnj-item-header">
                  <strong>${itemLabel}</strong>
                  <span class="pnj-item-qty">x${quantity}</span>
                </div>
                <div class="pnj-item-type">${itemType}</div>
                ${encartsHTML}
              </div>
            `;
          }
        });

        inventoryHTML += `
            </div>
          </div>
        `;
      } else {
        inventoryHTML = `
          <div class="pnj-inventory-section">
            <div class="weapon-section-title">Inventaire :</div>
            <em style="opacity:0.75;">Aucun objet</em>
          </div>
        `;
      }

      // Équipement du PNJ
      let equipmentHTML = '';
      const equipment = npc.equipment || {};
      const slots = {
        weapon: 'Arme', armor: 'Armure', head: 'Tête', torso: 'Torse',
        arms: 'Bras', legs: 'Jambes', feet: 'Pieds', shield: 'Bouclier'
      };

      let hasEquipment = false;
      Object.entries(slots).forEach(([slot, label]) => {
        const itemId = equipment[slot];
        if (itemId) {
          hasEquipment = true;
          const itemData = window.setup.getItemFromCache(itemId);
          if (itemData) {
            const itemLabel = window.setup.escapeHtml(itemData.label || itemId);
            equipmentHTML += `
              <div class="pnj-equipment-slot">
                <strong>${label} :</strong>
                <span class="pnj-equipped-item">${itemLabel}</span>
              </div>
            `;
          }
        }
      });

      if (!hasEquipment) {
        equipmentHTML = '<em style="opacity:0.75;">Aucun équipement</em>';
      }

      // Construction du contenu modal
      const modalContent = window.setup.buildModalHTML({
        title: `Compagnon - ${safeName}`,
        icon: ICONS.buddy,
        content: `
          ${raceJobHTML}
          
          <div class="pnj-description-section">
            <p>${safeDescription}</p>
          </div>
          
          <div class="item-stats-divider"></div>
          
          <div class="pnj-stats-section">
            <div class="weapon-section-title">Statistiques :</div>
            <div class="pnj-stats-grid">
              <div class="pnj-stat">
                <img class="icon-08em" src="${ICONS.strength}" alt="Force">
                <span class="pnj-stat-label">Force :</span>
                <span class="pnj-stat-value">${strength}</span>
              </div>
              <div class="pnj-stat">
                <img class="icon-08em" src="images/icons/dexterity.png" alt="Dextérité">
                <span class="pnj-stat-label">Dextérité :</span>
                <span class="pnj-stat-value">${dexterity}</span>
              </div>
              <div class="pnj-stat">
                <img class="icon-08em" src="${ICONS.defense}" alt="Résistance">
                <span class="pnj-stat-label">Résistance :</span>
                <span class="pnj-stat-value">${resistance}</span>
              </div>
              <div class="pnj-stat">
                <span class="pnj-stat-label">Niveau :</span>
                <span class="pnj-stat-value">${level}</span>
              </div>
            </div>
          </div>
          
          ${inventoryHTML}
          
          <div class="item-stats-divider"></div>
          
          <div class="pnj-equipment-section">
            <div class="weapon-section-title">Équipement :</div>
            ${equipmentHTML}
          </div>
        `,
        footer: '<button type="button" class="modal-close">Fermer</button>',
        className: 'pnj-modal'
      });

      $modal.append(modalContent);
      $('body').addClass('modal-open');

      // Gestion de la fermeture
      $modal.find('.modal-close').on('click', () => {
        $modal.remove();
        $overlay.remove();
        $('body').removeClass('modal-open');
      });

      $(document).one('mousedown.pnjmodal', function(e) {
        if (!$(e.target).closest('#pnj-modal').length) {
          $modal.remove();
          $overlay.remove();
          $('body').removeClass('modal-open');
        }
      });
    };

    // Vérifier que le système PNJ est prêt
    if (!window.setup.pnjState.ready) {
      console.warn("⏳ showPnjModal en attente du système PNJ");
      window.setup.ensurePNJReady(processPnjModal);
    } else {
      processPnjModal(true);
    }
  }

  // Export global
  window.loadAllPNJ = loadAllPNJ;
  window.npcEnsure = npcEnsure;
  window.npcGet = npcGet;
})();