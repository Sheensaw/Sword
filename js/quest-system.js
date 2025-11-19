// SYSTÈME DE QUÊTES COMPLET
(function() {
  'use strict';

  // Namespace d'événements
  const EVT_NS = '.quests';
  const getV = () => State.variables;

  // Tri des quêtes
  function sortQuests(a, b) {
    if (a.status === 'ready' && b.status !== 'ready') return -1;
    if (b.status === 'ready' && a.status !== 'ready') return 1;
    if (!a.viewed && b.viewed) return -1;
    if (!b.viewed && a.viewed) return 1;
    return (b.timestamp || 0) - (a.timestamp || 0);
  }

  // Rendu du panneau de quêtes
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
      const newBadge = isNew ? `<span class="item-new">Non lu</span>` : '';
      const cls = `quest-entry${statusReady ? ' ready' : ''}${isNew ? ' new' : ''}`;

      rows.push(
        `<div class="${cls}" data-id="${q.id}">
          <div class="quest-header">
            <img class="icon-1em" src="${ICONS.quest}" alt="">
            <strong>${window.setup.escapeHtml(q.title)}</strong>
            <span class="${statusClass}">${statusText}</span>${newBadge}
          </div>
          <div class="quest-short">${window.setup.escapeHtml(q.shortDesc)}</div>
        </div>`
      );
    }

    $panel.html(rows.join(''));

    // Binding des événements
    $panel.off('click' + EVT_NS, '.quest-entry').on('click' + EVT_NS, '.quest-entry', function() {
      const id = $(this).data('id');
      const quest = (v.quests || []).find(q => q.id === id);
      if (!quest) return;
      quest.viewed = true;
      window.setup.updateQuestCounter();
      window.setup.showQuestModal(quest);
    });
  }

  // API Publique
  window.setup = window.setup || {};
  window.setup.renderQuestPanel = renderQuestPanel;

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
    window.setup.showQuestNotification('Nouvelle quête', title);
    window.setup.updateQuestCounter();
    renderQuestPanel();
  };

  window.setup.markQuestReady = function(id) {
    const v = getV();
    const quest = (v.quests || []).find(q => q.id === id);
    if (quest && quest.status === 'active') {
      quest.status = 'ready';
      quest.viewed = false;
      window.setup.showQuestNotification('Quête terminée', quest.title);
      window.setup.updateQuestCounter();
      renderQuestPanel();
    }
  };

  // Parsing robuste des récompenses
  window.setup.parseReward = function(str) {
    if (!str) return { gold: 0, items: [] };
    const s = String(str).trim();
    if (!s) return { gold: 0, items: [] };

    // Tentative JSON
    try {
      const parsed = JSON.parse(s);
      return {
        gold: Number(parsed.gold) || 0,
        items: Array.isArray(parsed.items) ? parsed.items : []
      };
    } catch (e) { /* continue */ }

    // Format texte
    const out = { gold: 0, items: [] };
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
            return trimmed;
          }
          const [id, label, type = 'misc', desc = ''] = trimmed.split(',').map(p => p.trim());
          return id ? { id, label: label || id, type, description: desc } : null;
        }).filter(Boolean);
      }
    }
    return out;
  };

  // Notifications et modales
  window.setup.showQuestNotification = function(title, text) {
    let $container = $('#notification-container');
    if (!$container.length) $container = $('<div id="notification-container"></div>').appendTo('body');

    const $n = $('<div class="notification quest-notification border-medieval"></div>');
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

  window.setup.showQuestModal = function(quest) {
    $('#quest-modal, #modal-overlay-quest').remove();
    const $overlay = $('<div id="modal-overlay-quest"></div>').appendTo('body');
    const $modal = $('<div id="quest-modal" role="dialog"></div>').appendTo('body');

    const rewardHTML = window.setup.renderRewardHTML(quest.reward);
    const statusText = quest.status === 'ready' ? 'Terminée' : 'En cours';

    $modal.html(`
      <div class="modal-content">
        <div class="modal-header">
          <img class="icon-1em" src="${ICONS.quest}" alt="">
          <span>${window.setup.escapeHtml(quest.title)}</span>
        </div>
        <div class="modal-body">
          <div class="quest-status-badge ${quest.status}">${statusText}</div>
          <p>${window.setup.escapeHtml(quest.fullDesc || quest.shortDesc)}</p>
          <div class="item-stats-divider"></div>
          <div class="quest-rewards">
            <div class="weapon-section-title">Récompenses :</div>
            ${rewardHTML}
          </div>
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

    $(document).one('mousedown.questmodal', e => {
      if (!$(e.target).closest('#quest-modal').length) {
        $modal.remove();
        $overlay.remove();
        $('body').removeClass('modal-open');
      }
    });
  };

  window.setup.renderRewardHTML = function(reward) {
    if (!reward) return '<em>Aucune récompense</em>';
    let html = '';

    if (reward.gold) {
      html += `<div class="reward-item"><img class="icon-1em" src="${ICONS.gold}" alt=""> ${reward.gold} or</div>`;
    }

    if (Array.isArray(reward.items)) {
      reward.items.forEach(item => {
        let itemHTML = '';
        if (typeof item === 'object' && item.id) {
          const cached = window.setup.getItemFromCache(item.id);
          if (cached) {
            itemHTML = `<div class="reward-item">${window.setup.escapeHtml(cached.label)}</div>`;
          } else if (item.label) {
            itemHTML = `<div class="reward-item">${window.setup.escapeHtml(item.label)}</div>`;
          }
        }
        html += itemHTML;
      });
    }

    return html || '<em>Aucune récompense</em>';
  };

  // Flags d'état
  window.setup.isQuestActive = id => (getV().quests || []).some(q => q.id === id && q.status === 'active');
  window.setup.isQuestReady = id => (getV().quests || []).some(q => q.id === id && q.status === 'ready');
  window.setup.isQuestCompleted = id => (getV().completedQuests || []).includes(id);

  // Compteur de quêtes
  window.setup.updateQuestCounter = function() {
    const v = getV();
    const hasNewQuest = v.quests?.some(q => !q.viewed);
    const $c = $('#quest-counter');
    if ($c.length) {
      $c.text(hasNewQuest ? '1' : '').toggle(hasNewQuest);
    }
  };

  // Initialisation
  if (!window.questsInitialized) {
    $(document).one(':storyready' + EVT_NS, function() {
      window.questsInitialized = true;
      const v = getV();
      v.quests = Array.isArray(v.quests) ? v.quests : [];
      v.completedQuests = Array.isArray(v.completedQuests) ? v.completedQuests : [];
      v.pendingQuests = v.pendingQuests && typeof v.pendingQuests === 'object' ? v.pendingQuests : {};

      if (!$('#quest-panel').length) $('body').append('<div id="quest-panel" class="side-panel"></div>');

      $(document).on('hudready' + EVT_NS, function() {
        const $toggles = $('#hud .hud-toggles');
        if ($toggles.length && !$('#quest-toggle').length) {
          $toggles.prepend(`
            <div id="quest-toggle" title="Quêtes">
              <img class="icon-1em" src="${ICONS.quest}" alt="Quêtes">
              <span id="quest-counter" class="counter">0</span>
            </div>
          `);
        }
        window.setup.updateQuestCounter();
      });

      $(document).off('click' + EVT_NS, '#quest-toggle').on('click' + EVT_NS, '#quest-toggle', function() {
        $('.side-panel').removeClass('show');
        $('#quest-panel').toggleClass('show');
        (v.quests || []).forEach(q => q.viewed = true);
        window.setup.updateQuestCounter();
        renderQuestPanel();
      });

      $(document).off('click.questclose' + EVT_NS).on('click.questclose' + EVT_NS, function(e) {
        if (!$(e.target).closest('#quest-panel, #quest-toggle').length) {
          $('#quest-panel').removeClass('show');
        }
      });
    });
  }
})();