// POINT D'ENTRÉE PRINCIPAL ET INTÉGRATION
(function() {
  'use strict';

  // Inclure tous les systèmes
  // (Dans votre HTML: <script src="game-state.js"></script>
  //                    <script src="loot-system.js"></script>
  //                    <script src="quest-system.js"></script>
  //                    <script src="pnj-system.js"></script>
  //                    <script src="inventory-system.js"></script>
  //                    <script src="main.js"></script>)

  // Utilitaires généraux
  window.setup.escapeHtml = function(str) {
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m]);
  };

  // Notifications générales
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
    setTimeout(() => $n.addClass('show'), 10);
    setTimeout(() => {
      $n.removeClass('show').addClass('hide');
      setTimeout(() => {
        $n.remove();
        window.setup.activeNotifications = window.setup.activeNotifications || [];
        window.setup.activeNotifications = window.setup.activeNotifications.filter(el => el !== $n);
      }, 500);
    }, duration);
  };

  // Modale standard
  window.setup.buildModalHTML = function(options) {
    const { title, icon = ICONS.misc, content, footer = '', className = '' } = options;
    const safeTitle = window.setup.escapeHtml(title || '');
    const iconHTML = icon ? `<img class="icon-1em" src="${icon}" alt="">` : '';

    return `
      <div class="modal-content border-medieval ${className}">
        <div class="modal-header">
          ${iconHTML}
          <span>${safeTitle}</span>
        </div>
        <div class="modal-body">${content}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    `;
  };

  // Modale message
  window.setup.showMessageModal = function(msg) {
    $('#dialogue-modal, #modal-overlay-msg').remove();
    const $overlay = $('<div id="modal-overlay-msg"></div>').appendTo('body');
    const $modal = $('<div id="dialogue-modal" role="dialog"></div>').appendTo('body');

    $modal.html(`
      <div class="modal-content">
        <div class="modal-header">
          <img class="icon-1em" src="${ICONS.speak}" alt="">
          <span>${window.setup.escapeHtml(msg.npc)}</span>
        </div>
        <div class="modal-body">
          <p>${window.setup.escapeHtml(msg.fullText)}</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="modal-close">Fermer</button>
        </div>
      </div>
    `);

    $('body').addClass('modal-open');

    $modal.find('.modal-close').on('click', () => {
      $modal.remove();
      $overlay.remove();
      $('body').removeClass('modal-open');
    });

    $(document).one('mousedown.msgmodal', e => {
      if (!$(e.target).closest('#dialogue-modal').length) {
        $modal.remove();
        $overlay.remove();
        $('body').removeClass('modal-open');
      }
    });
  };

  // Modale de confirmation
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

  // Notifications PNJ
  window.setup.notifyBuddy = function(text, duration = 3500) {
    let $container = $('#notification-container');
    if (!$container.length) {
      $container = $('<div id="notification-container"></div>').appendTo('body');
    }

    const $n = $('<div class="notification border-medieval"></div>');
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

  // Notification de mouvement PNJ
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

  // Donner à un compagnon
  window.setup.giveItemToBuddy = function(pnjId, itemId, quantity = 1) {
    try {
      const v = V();
      const npc = window.npcEnsure(pnjId);
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

      // Retrait de l'inventaire
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

      // Mise à jour du dictionnaire "has"
      v.has = v.has || {};
      v.has[itemId] = Math.max(0, (v.has[itemId] || 0) - quantity);
      if (v.has[itemId] === 0) delete v.has[itemId];

      // Ajout à l'inventaire du PNJ
      if (npc.inventory[itemId]) {
        npc.inventory[itemId] += quantity;
      } else {
        npc.inventory[itemId] = quantity;
      }

      // Équipement automatique si c'est une arme
      const itemData = window.setup.itemCache && window.setup.itemCache[itemId];
      if (itemData && itemData.type === 'weapon' && !npc.equipment.weapon) {
        if (window.setup.canPnjEquipItem(pnjId, itemId)) {
          window.setup.equipItemForPnj(pnjId, itemId, 'weapon');
        }
      }

      // Amélioration relation / loyauté
      npc.relation = Math.min(100, (npc.relation || 50) + 2);
      npc.loyalty = Math.min(100, (npc.loyalty || 50) + 1);

      // Notification de dialogue
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

      // Mise à jour UI
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

  // Alias pour compatibilité
  window.setup.giveItemToPnj = window.setup.giveItemToBuddy;

  // INITIALISATION FINALE
  $(document).one(':storyready', function() {
    console.log("🎮 STORY READY - INITIALISATION SYSTÈMES");

    // Initialisation des variables de base
    window.setup.ensureBaseStats();

    // Démarrer les chargements asynchrones
    loadLootsSequentially().catch(error => {
      console.error("❌ ERREUR CHARGEMENT LOOTS:", error);
      initLootSystem();
    });

    loadAllPNJ().catch(error => {
      console.error("❌ ERREUR CHARGEMENT PNJ:", error);
      window.setup.pnjState.ready = true;
    });

    // Initialisation des variables du jeu
    const v = V();
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
    v.playerCoordinates = v.playerCoordinates || {};

    if (!document.getElementById('hud')) $('body').prepend('<div id="hud"></div>');
    if (!document.getElementById('notification-container')) $('body').append('<div id="notification-container"></div>');

    window.setup.updateHUD();
  });

  // Transitions de passage
  $(document).on(':passagestart', () => {
    $('#passages').stop(true, true).animate({ opacity: 0 }, 200);
  });

  $(document).on(':passagedisplay', () => {
    $('#passages').stop(true, true).animate({ opacity: 1 }, 400);
    window.setup.updateHUD();

    const v = V();
    const currentPassage = State.passage.title;
    const passageCoords = (v.passageCoords || {})[currentPassage];

    if (passageCoords) {
      console.log(`🎯 Passage "${currentPassage}" - Coordonnées: (${passageCoords.x}, ${passageCoords.y})`);

      window.setup.updateFollowersCoordinates();

      v.playerCoordinates = v.playerCoordinates || {};
      v.playerCoordinates.x = passageCoords.x;
      v.playerCoordinates.y = passageCoords.y;
      if (passageCoords.continent) {
        v.playerCoordinates.continent = passageCoords.continent;
      }
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
      const iconSrc = window.setup.choiceIcons[type];
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
      $choices.css({
        'pointer-events': 'auto',
        filter: 'none'
      });
      v.visitedPassages = v.visitedPassages || {};
      v.visitedPassages[State.passage.title] = true;

      if (window.renderBuddiesPanel) {
        window.renderBuddiesPanel();
      }
    }, totalDelay);
  });
})();