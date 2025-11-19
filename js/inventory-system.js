// SYSTÈME D'INVENTAIRE ET ÉQUIPEMENT COMPLET
(function() {
  'use strict';

  // Rendu des encarts d'objets (bonus, effets, etc.)
  window.setup.renderItemEncarts = function(item) {
    if (!item) return "";
    const ICONS = window.ICONS || {};
    const tags = [];

    // BONUS CLASSIQUES
    if (item.bonus && typeof item.bonus === "object") {
      const bonusIcons = {
        strength: ICONS.strength,
        resistance: ICONS.defense,
        health: ICONS.health,
        magic: ICONS.magic
      };
      Object.keys(item.bonus).forEach(k => {
        const val = item.bonus[k];
        const ic = bonusIcons[k] ? `<img class="icon-08em" src="${bonusIcons[k]}" alt="">` : '';
        tags.push(`<span class="bonus-tag">${ic}${val}</span>`);
      });
    }

    // ARMES — dégâts, vitesse, critique
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

    // EFFETS SPÉCIAUX
    if (item.effects && Array.isArray(item.effects)) {
      item.effects.forEach(e => {
        tags.push(`<span class="effect-tag">${window.setup.escapeHtml(e)}</span>`);
      });
    }

    // Arme à deux mains
    if (item.type === "weapon" && item.isTwoHanded) {
      tags.push(`<span class="twohanded-tag">2M</span>`);
    }

    return `<div class="item-tags">${tags.join("")}</div>`;
  };

  // Modale objet/item
  window.setup.showItemModal = function(item) {
    if (!item) return;

    $('#item-modal, #modal-overlay-item').remove();
    const $overlay = $('<div id="modal-overlay-item"></div>').appendTo('body');
    const $modal = $('<div id="item-modal" role="dialog" aria-modal="true"></div>').appendTo('body');

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
    const iconSrc = ICON_MAP[item.type] || 'Images/icons/key.png';

    const innerHTML = window.setup.buildItemModalHTML(item);

    const modalContent = window.setup.buildModalHTML({
      title: item.label || 'Objet',
      icon: iconSrc,
      content: innerHTML,
      footer: '<button type="button" class="modal-close">Fermer</button>',
      className: 'item-modal'
    });

    $modal.append(modalContent);
    $('body').addClass('modal-open');

    $modal.find('.modal-close').on('click', () => {
      $modal.remove();
      $overlay.remove();
      $('body').removeClass('modal-open');
    });

    $(document).one('mousedown.itemmodal', function(e) {
      if (!$(e.target).closest('#item-modal').length) {
        $modal.remove();
        $overlay.remove();
        $('body').removeClass('modal-open');
      }
    });
  };

  // HTML interne modale item
  window.setup.buildItemModalHTML = function(item) {
    const safeLabel = window.setup.escapeHtml(item.label || '');
    const safeDesc = window.setup.escapeHtml(item.description || '');
    const encartsHTML = window.setup.renderItemEncarts ? window.setup.renderItemEncarts(item) : '';
    const hasEncarts = encartsHTML.trim().length > 0;

    let effectsHTML = '';
    if (item.type === 'weapon' && Array.isArray(item.effects) && item.effects.length > 0) {
      effectsHTML = '<ul>' + item.effects.map(e => `<li>${window.setup.escapeHtml(e)}</li>`).join('') + '</ul>';
    }

    let requirementsHTML = '';
    if (item.requirements && typeof item.requirements === 'object') {
      const req = item.requirements;
      const requirementsLines = [];
      if (req.levelMin) {
        requirementsLines.push(`
          <div class="requirement-line">
            <span class="requirement-label">Niveau</span>
            <span class="requirement-value">${req.levelMin}</span>
          </div>
        `);
      }
      if (req.forceMin) {
        requirementsLines.push(`
          <div class="requirement-line">
            <span class="requirement-label">Force</span>
            <span class="requirement-value">${req.forceMin}</span>
          </div>
        `);
      }
      if (req.dexMin) {
        requirementsLines.push(`
          <div class="requirement-line">
            <span class="requirement-label">Dextérité</span>
            <span class="requirement-value">${req.dexMin}</span>
          </div>
        `);
      }
      if (requirementsLines.length > 0) {
        requirementsHTML = `
          <div class="item-stats-divider"></div>
          <div>
            <div class="weapon-section-title">Niveaux requis :</div>
            <div class="requirements-container">${requirementsLines.join('')}</div>
          </div>
        `;
      }
    }

    return `
      <p>${safeDesc}</p>
      <div class="item-stats-divider"></div>
      <div>
        <div class="weapon-section-title">Caractéristiques :</div>
        ${hasEncarts ? encartsHTML : '<em style="opacity:0.75;">Aucune</em>'}
      </div>
      ${requirementsHTML}
      ${effectsHTML ? `
        <div style="margin-top:0.9em;">
          <div class="weapon-section-title">Effets :</div>
          ${effectsHTML}
        </div>
      ` : ''}
      <div class="item-stats-divider"></div>
    `;
  };

  // Utilisation d'un objet
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
          window.setup.showNotification('Info', `${name} a déjà toute sa santé.`, 2500, x, y);
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

  // Suppression d'objet
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

    v.has = v.has || {};
    v.has[id] = Math.max(0, (v.has[id] || 0) - removed);
    if (v.has[id] === 0) delete v.has[id];

    window.setup.showNotification('Jeté', `${label} retiré.`);
    window.setup.updateHUD();
  };

  // ÉQUIPER / DÉSÉQUIPER

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

    // Contraintes armes à deux mains
    if (slot === 'weapon' && item.isTwoHanded && equippedShield) {
      return window.setup.showNotification('Impossible', 'Impossible d\'équiper : arme à deux mains.', 3000);
    }
    if (slot === 'shield' && equippedWeapon && equippedWeapon.isTwoHanded) {
      return window.setup.showNotification('Impossible', 'Impossible d\'équiper : arme à deux mains.', 3000);
    }

    // Requirements
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

    // Déséquiper l'ancien objet du slot si nécessaire
    if (v.equipped[slot]) {
      window.setup.unequipItem(v.equipped[slot], slot, true);
    }

    v.equipped[slot] = id;

    // Application du bonus
    for (const k in bonus) {
      v[k] = Number(v[k] || 0) + Number(bonus[k]);
    }

    if (slot === 'weapon') v.hasWeapon = true;

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

  // Menus contextuels
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

  // Menu contextuel équipement
  window.setup.showEquipContextMenu = function(x, y, id, label, type, $item) {
    $('#inventory-context-menu').remove();
    const menu = $('<div id="inventory-context-menu"></div>').appendTo('body');
    const v = V();
    const equippedSlot = Object.keys(v.equipped || {}).find(k => v.equipped[k] === id);

    function addOption(txt, fn) {
      $('<div class="context-option"></div>')
        .text(txt)
        .on('mousedown', e => {
          e.stopPropagation();
          fn();
          menu.remove();
        })
        .appendTo(menu);
    }

    if (equippedSlot) addOption('Déséquiper', () => window.setup.unequipItem(id, equippedSlot));

    menu.css({
      position: 'absolute',
      top: `${y + 5}px`,
      left: `${x + 5}px`,
      background: 'rgba(0,0,0,0.92)',
      border: '1px solid #fff',
      borderRadius: '8px',
      padding: '0.4em 0',
      minWidth: '150px',
      zIndex: 3200,
      fontSize: '0.9em',
      boxShadow: '0 0 16px rgba(0,0,0,0.8)',
      animation: 'fadeMenu 0.2s ease forwards'
    });

    $(document).one('mousedown.equipmentmenu', function(e) {
      if (!$(e.target).closest('#inventory-context-menu').length) menu.remove();
    });
  };

  // Export menu don
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
        if (!success) console.error(`❌ Échec du don de ${id} à ${key}`);
      });

      menu.append(option);
    });

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

    $(document).off('mousedown.givebuddy').on('mousedown.givebuddy', function(e) {
      if (!$(e.target).closest('#give-buddy-menu').length) {
        $('#give-buddy-menu').remove();
        $(document).off('mousedown.givebuddy');
      }
    });
  };

  // Compteur inventaire
  window.setup.updateInventoryCounter = function() {
    const v = V();
    const hasNewItem = (v.inventoryNewItems || []).length > 0 && !v.inventoryViewed;
    const $c = $('#inventory-counter');
    if ($c.length) {
      $c.text(hasNewItem ? '1' : '').toggle(hasNewItem);
    }
  };

  // Validation
  window.Validation = window.Validation || {};
  window.Validation.testInventorySystem = function() {
    const v = V();
    return Array.isArray(v.inventory) && typeof v.equipped === 'object';
  };
})();