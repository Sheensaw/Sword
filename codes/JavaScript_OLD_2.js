(function () {
    'use strict';

    //#region Initialisation
    // ------------------------------------------------------
    // Espace global unique
    // ------------------------------------------------------
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

    // ------------------------------------------------------
    // Raccourci sûr vers les variables SugarCube
    // ------------------------------------------------------
    function V() {
        return State.variables;
    }

    // ------------------------------------------------------
    // Initialisation des stats de base
    // ------------------------------------------------------
    window.setup.ensureBaseStats = function () {
        const v = V();
        // Stats de base
        v.strength = Number(v.strength || 0);
        v.resistance = Number(v.resistance || 0);
        v.dexterity = Number(v.dexterity || 0);
        v.magic = Number(v.magic || 0);
        v.health = Number(v.health || 0);
        // Système de niveau et XP
        v.level = Number(v.level || 1);
        v.exp = Number(v.exp || 0);
        v.expToNextLevel = Number(v.expToNextLevel || 100);
        // Santé du joueur
        v.current_player_health = Number(v.current_player_health || 10);
        v.max_player_health = Number(v.max_player_health || 10);
    };
//#endregion

    //#region CHARGEMENT SYNCHRONE DES LOOTS
        /* ==========================================================
            CHARGEMENT SYNCHRONE DES LOOTS + SÉCURITÉ <<quest>>
            → Garantit que toutes les catégories sont disponibles avant toute quête
            ========================================================== */
        console.log("DÉBUT CHARGEMENT DES FICHIERS LOOT...");
        // --- 1. LISTE DES FICHIERS À CHARGER ---
        const lootFiles = [
            "loot/health.js",
            "loot/food.js",
            "loot/weapon_simple.js",
            "loot/weapon_mythique.js"
        ];
        let lootReady = false;

        // --- CHARGEMENT BLOQUANT (SÉQUENTIEL) ---
        async function loadLootsSequentially() {
            console.log("DÉBUT CHARGEMENT DES FICHIERS LOOT...");

            // Liste des fichiers à charger
            const lootFiles = [
                "loot/health.js",
                "loot/food.js",
                "loot/weapon_simple.js",
                "loot/weapon_mythique.js"
            ];

            for (const path of lootFiles) {
                try {
                    await new Promise((resolve, reject) => {
                        const s = document.createElement("script");
                        s.src = path;
                        s.async = false;
                        s.onload = () => {
                            console.log("LOOT CHARGÉ :", path);
                            resolve();
                        };
                        s.onerror = () => {
                            console.error("⚠️ ÉCHEC CHARGEMENT :", path);
                            resolve(); // On résout quand même pour continuer
                        };
                        document.head.appendChild(s);
                    });
                } catch (e) {
                    console.warn("Erreur de chargement loot :", e);
                }
            }
            initLootSystem();
        }

        // --- INITIALISATION DES LOOTS ---
        function initLootSystem() {
            const categories = window.lootCategories || {};
            window.setup.itemCache = window.setup.itemCache || {};
            window.setup.randomLoot = window.setup.randomLoot || {};

            if (Object.keys(categories).length === 0) {
                console.error("AUCUN LOOT TROUVÉ DANS LES FICHIERS");
                // Créer des catégories vides par défaut pour éviter les crashs
                window.lootCategories = {
                    health: [],
                    food: [],
                    weapon_simple: [],
                    weapon_mythique: []
                };
                return;
            }

            let total = 0;
            Object.keys(categories).forEach(cat => {
                if (!Array.isArray(categories[cat])) return;
                categories[cat].forEach(item => {
                    if (item.id && item.label) {
                        window.setup.itemCache[item.id] = item;
                        total++;
                    }
                });
            });

            // --- GÉNÉRATION ALÉATOIRE POUR TOUTES LES CATÉGORIES ---
            for (const type of Object.keys(categories)) {
                const arr = categories[type];
                if (Array.isArray(arr) && arr.length > 0) {
                    const rand = arr[Math.floor(Math.random() * arr.length)];
                    window.setup.randomLoot[type] = rand.id;
                    console.log(`🎲 random:${type} →`, rand.id);
                }
            }

            lootReady = true;
            console.log(`✅ ${total} objets chargés, système loot prêt.`);
        }
        // --- 4. LANCEMENT IMMÉDIAT (AVANT QUE TWINE CHARGE LES PASSAGES) ---
        loadLootsSequentially();
//#endregion

    //#region MACROS SUGARCUBE
/* Toutes les macros regroupées automatiquement */
/* ---- MACRO : quest ---- */
Macro.add('quest', {
            handler: function () {
                // Sécurité : si le loot n’est pas encore prêt, réessaie après un court délai
                if (!lootReady) {
                    console.warn("⚠️ QUÊTE BLOQUÉE : loots pas encore prêts, réessai dans 300ms...");
                    const self = this;
                    const args = this.args.map(a => JSON.stringify(a)).join(' ');
                    setTimeout(() => new Wikifier(null, `<<quest ${args}>>`), 300);
                    return;
                }
                const [id, title, shortDesc, fullDesc = shortDesc, rewardStr = '{}'] = this.args;
                if (!id || !title || !shortDesc)
                    return this.error('<<quest id title short [full] [reward]>>');
                const v = State.variables;
                v.quests = v.quests || [];
                v.completedQuests = v.completedQuests || [];
                v.pendingQuests = v.pendingQuests || {};
                if (v.quests.some(q => q.id === id) || v.completedQuests.includes(id)) return;
                // --- PARSING DE LA RÉCOMPENSE ---
                let reward = { gold: 0, items: [] };
                try {
                    const parsed = JSON.parse(rewardStr);
                    reward.gold = Number(parsed.gold) || 0;
                    reward.items = Array.isArray(parsed.items) ? parsed.items : [];
                } catch (e) {
                    console.warn("⚠️ Récompense invalide :", rewardStr);
                }
                // --- RÉSOLUTION DES random: ---
                const finalItems = [];
                for (const item of reward.items) {
                    if (typeof item === 'string' && item.startsWith('random:')) {
                        const type = item.slice(7);
                        const randomId = window.setup.randomLoot?.[type];
                        const obj = randomId ? window.setup.itemCache?.[randomId] : null;
                        if (obj) finalItems.push(obj);
                        else console.warn("⚠️ Type de loot aléatoire introuvable :", type);
                    } else if (typeof item === 'object' && item.id && window.setup.itemCache[item.id]) {
                        finalItems.push(window.setup.itemCache[item.id]);
                    } else if (typeof item === 'object') {
                        finalItems.push(item);
                    }
                }
                // --- ENREGISTREMENT TEMPORAIRE ---
                v.pendingQuests[id] = {
                    title,
                    shortDesc,
                    fullDesc,
                    reward: { gold: reward.gold, items: finalItems }
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
                    $modal.remove(); $overlay.remove();
                    $('body').removeClass('modal-open');
                });
                $modal.find('.accept-quest').on('click', () => {
                    new Wikifier(null, `<<startquest "${id}">>`);
                    $modal.remove(); $overlay.remove();
                    $('body').removeClass('modal-open');
                });
            }
        });
/* ---- MACRO : setenv ---- */
Macro.add('setenv', {
            handler: function () {
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
            handler: function () {
                const title = this.args[0] || '';
                const text = this.args[1] || '';
                const duration = parseInt(this.args[2], 10) || 3000;
                window.setup.showNotification(title, text, duration);
            }
        });
/* ---- MACRO : addExp ---- */
Macro.add('addExp', {
        handler: function () {
        const amount = Number(this.args[0]) || 0;
        if (amount <= 0) return this.error('Quantité positive requise.');
        const v = V();
        v.exp = (v.exp || 0) + amount;
        // Vérification de montée de niveau
        const expNeeded = v.expToNextLevel || (v.level * 100);
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
            handler: function () {
                const npc = this.args[0] || 'Inconnu';
                const shortText = this.args[1] || '...';
                const fullText = this.args[2] || shortText;
                window.setup.showDialogueNotification(npc, shortText, fullText);
            }
        });
/* ---- MACRO : setcoords ---- */
Macro.add('setcoords', {
            handler: function () {
                let x, y, continent;
                if (this.args.length === 1 && typeof this.args[0] === 'object') {
                    // Format objet : <<setcoords {x:1, y:2, continent: "Eldaron"}>>
                    const coords = this.args[0];
                    x = Number(coords.x) || 0;
                    y = Number(coords.y) || 0;
                    continent = coords.continent || "Eldaron";
                } else if (this.args.length >= 2) {
                    // Format séparé : <<setcoords 100 200 "Eldaron">>
                    x = Number(this.args[0]) || 0;
                    y = Number(this.args[1]) || 0;
                    continent = this.args[2] || "Eldaron";
                } else {
                    return this.error('Usage: <<setcoords x y [continent]>> ou <<setcoords {x:1, y:2, continent: "Eldaron"}>>');
                }
                const v = V();
                const currentPassage = State.passage.title;
                v.passageCoords = v.passageCoords || {};
                v.passageCoords[currentPassage] = { x, y, continent };
                // ==========================================================
                // CORRECTION : METTRE À JOUR LES PNJ SUIVEURS IMMÉDIATEMENT
                // ==========================================================
                Object.values(v.npcs || {}).forEach(npc => {
                    if (npc.status === 'follow' && npc.isBuddy && npc.isAlive && npc.isActive && npc.isSpawned) {
                        npc.coordinates = { x, y };
                        npc.continent = continent;
                        console.log(`👥 ${npc.name} déplacé aux nouvelles coordonnées: (${x}, ${y}, ${continent})`);
                    }
                });
                // Mettre à jour les coordonnées du joueur
                v.playerCoordinates = v.playerCoordinates || {};
                v.playerCoordinates.x = x;
                v.playerCoordinates.y = y;
                v.playerCoordinates.continent = continent;
                console.log(`🎯 Coordonnées du passage "${currentPassage}" définies: (${x}, ${y}, ${continent})`);
                // Rafraîchir l'interface
                if (window.renderBuddiesPanel) {
                    window.renderBuddiesPanel();
                }
            }
        });
/* ---- MACRO : displaylocation ---- */
Macro.add('displaylocation', {
            handler: function() {
                const v = V();
                const currentPassage = State.passage.title;
                // Récupérer les coordonnées du passage actuel
                const passageCoords = (v.passageCoords || {})[currentPassage];
                if (!passageCoords) {
                    this.output.appendChild(document.createTextNode("Position inconnue"));
                    return;
                }
                // Récupérer le continent (vous devrez peut-être le stocker séparément)
                // Pour l'instant, on suppose qu'il est stocké dans passageCoords
                const continent = passageCoords.continent || "Eldaron"; // Valeur par défaut
                const locationString = window.setup.getLocationString(
                    { x: passageCoords.x, y: passageCoords.y },
                    continent
                );
                this.output.appendChild(document.createTextNode(locationString));
            }
        });
/* ---- MACRO : addItem ---- */
Macro.add('addItem', {
            handler: function () {
                /* ===========================
                   1) ARGUMENTS SIMPLIFIÉS
                   =========================== */
                let id = this.args[0];
                let qty = Number(this.args[1] || 1);
                if (!id) {
                    return this.error('<<addItem "id" quantité>>');
                }
                /* ===========================
                   2) CHARGEMENT DU CACHE LOOT
                   =========================== */
                const v = State.variables;
                v.inventory = v.inventory || [];
                v.inventoryNewItems = v.inventoryNewItems || [];
                const cache = (window.setup.itemCache && window.setup.itemCache[id])
                    ? window.setup.itemCache[id]
                    : null;
                if (!cache) {
                    return this.error('Objet introuvable dans itemCache : ' + id);
                }
                const label = cache.label || id;
                const type = cache.type || "misc";
                const bonus = cache.bonus || {};
                const description = cache.description || "";
                const isTwoHanded = Boolean(cache.isTwoHanded);
                const requirements = cache.requirements || undefined;
                const damage = cache.damage || undefined;
                const coeff = (typeof cache.coeff === "number") ? cache.coeff : undefined;
                const speed = (typeof cache.speed === "number") ? cache.speed : undefined;
                const critChance = (typeof cache.critChance === "number") ? cache.critChance : undefined;
                const critMultiplier = (typeof cache.critMultiplier === "number") ? cache.critMultiplier : undefined;
                const effects = cache.effects || undefined;
                /* ===========================
                   3) AJOUT / FUSION INVENTAIRE
                   =========================== */
                const exists = v.inventory.find(it => it.id === id);
                let notifText = "";
                if (!exists) {
                    const newItem = {
                        id,
                        label,
                        type,
                        qty,
                        bonus,
                        isQuestItem: Boolean(cache.isQuestItem),
                        description,
                        isTwoHanded
                    };
                    if (requirements) newItem.requirements = requirements;
                    if (damage) newItem.damage = damage;
                    if (typeof coeff !== "undefined") newItem.coeff = coeff;
                    if (typeof speed !== "undefined") newItem.speed = speed;
                    if (typeof critChance !== "undefined") newItem.critChance = critChance;
                    if (typeof critMultiplier !== "undefined") newItem.critMultiplier = critMultiplier;
                    if (effects) newItem.effects = effects;
                    v.inventory.push(newItem);
                    v.inventoryNewItems.push(id);
                    notifText = `${label} ajouté (${qty})`;
                } else {
                    exists.qty = (exists.qty || 1) + qty;
                    exists.description = description || exists.description;
                    exists.isTwoHanded = isTwoHanded;
                    if (requirements) exists.requirements = requirements;
                    if (damage) exists.damage = damage;
                    if (typeof coeff !== "undefined") exists.coeff = coeff;
                    if (typeof speed !== "undefined") exists.speed = speed;
                    if (typeof critChance !== "undefined") exists.critChance = critChance;
                    if (typeof critMultiplier !== "undefined") exists.critMultiplier = critMultiplier;
                    if (effects) exists.effects = effects;
                    v.inventoryNewItems.push(id);
                    notifText = `Vous avez ${exists.qty} ${label}(s)`;
                }
                /* ===========================
                   4) DICTIONNAIRE "has"
                   =========================== */
                v.has = v.has || {};
                v.has[id] = (v.has[id] || 0) + qty;
                /* ===========================
                   5) NOTIFICATION
                   =========================== */
                const bonusTxt = Object.keys(bonus)
                    .map(k => `+${bonus[k]} ${k}`)
                    .join(' ');
                window.setup.showNotification(
                    'Objet obtenu',
                    notifText + (bonusTxt ? ` ${bonusTxt}` : ''),
                    3500
                );
                /* ===========================
                   6) REFRESH UI
                   =========================== */
                v.inventoryViewed = false;
                window.setup.updateInventoryCounter();
                window.setup.updateHUD();
            }
        });
/* ---- MACRO : removeItem ---- */
Macro.add('removeItem', {
            handler: function () {
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
            handler: function () {
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
            handler: function () {
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
                handler: function () {
                    const type = this.args[0];
                    if (!window.setup.choiceIcons[type]) return this.error('Type invalide : move, look, interact, speak, attack, back');
                    new Wikifier(this.output, `<span class="choiceicon-marker" data-type="${type}"></span>`);
                }
            });
/* ---- MACRO : startquest ---- */
Macro.add('startquest', {
                handler: function () {
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
                handler: function () { window.setup.markQuestCompleted(this.args[0]); }
            });
/* ---- MACRO : markquestready ---- */
Macro.add('markquestready', {
                handler: function () { window.setup.markQuestReady(this.args[0]); }
            });
/* ---- MACRO : spawn ---- */
Macro.add('spawn', {
            handler: function () {
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
                npc.passage = State.passage.title;
                // Utiliser les coordonnées du passage actuel
                const v = V();
                const passageCoords = (v.passageCoords || {})[State.passage.title];
                if (passageCoords) {
                    npc.coordinates = { ...passageCoords };
                } else {
                    npc.coordinates = { x: 0, y: 0 };
                }
                console.log(`PNJ ${name} spawné dans ${State.passage.title} aux coordonnées (${npc.coordinates.x}, ${npc.coordinates.y})`);
                updateBuddyHUDVisibility();
            }
        });
/* ---- MACRO : pnj ---- */
Macro.add('pnj', {
            handler: function () {
                const name = this.args[0];
                const cmd = this.args[1];
                if (!name || !cmd) return this.error('Usage : <<pnj "Nom" "commande|passage">>');
                const npc = npcEnsure(name);
                if (!npc.isSpawned) npc.isSpawned = true;
                npc.isActive = true;
                const lc = String(cmd).toLowerCase();
                switch (lc) {
                    case 'buddy':
                        npc.isBuddy = true;
                        break;
                    case 'follow':
                        npc.status = 'follow';
                        npc.isBuddy = true;
                        notifyBuddy(`${npc.name} vous suit`);
                        break;
                    case 'fix':
                    case 'fixed':
                        npc.status = 'fixed';
                        npc.passage = State.passage.title;
                        npc.isBuddy = true;
                        notifyBuddy(`${npc.name} restera ici`);
                        break;
                    case 'dead':
                        npc.isAlive = false;
                        npc.isActive = false;
                        notifyBuddy(`${npc.name} est mort.`);
                        break;
                    case 'gone':
                        npc.isActive = false;
                        notifyBuddy(`${npc.name} est parti.`);
                        break;
                    default:
                        npc.status = 'fixed';
                        npc.passage = cmd;
                        break;
                }
                updateBuddyHUDVisibility();
            }
        });
/* ---- MACRO : pnjfollow ---- */
Macro.add('pnjfollow', {
            handler: function () {
                const name = this.args[0];
                if (!name) return this.error('Usage : <<pnjfollow "Nom">>');
                const npc = npcEnsure(name);
                npc.isBuddy = true;
                npc.status = 'follow';
                npc.isAlive = true;
                npc.isActive = true;
                npc.isSpawned = true;
                // ==========================================================
                // CORRECTION : SYNCHRONISATION IMMÉDIATE DES COORDONNÉES
                // ==========================================================
                const v = V();
                const currentPassage = State.passage.title;
                const passageCoords = (v.passageCoords || {})[currentPassage];
                if (passageCoords) {
                    npc.coordinates = {
                        x: passageCoords.x,
                        y: passageCoords.y
                    };
                    if (passageCoords.continent) {
                        npc.continent = passageCoords.continent;
                    }
                } else {
                    npc.coordinates = { x: 0, y: 0 };
                    npc.continent = "Eldaron";
                }
                npc.passage = currentPassage;
                console.log(`👥 ${npc.name} commence à suivre le joueur dans ${currentPassage} (${npc.coordinates.x}, ${npc.coordinates.y})`);
                notifyBuddy(`${npc.name} vous suit`);
                updateBuddyHUDVisibility();
                // Rafraîchir l'interface
                if (window.renderBuddiesPanel) {
                    window.renderBuddiesPanel();
                }
            }
        });
/* ---- MACRO : pnjfix ---- */
Macro.add('pnjfix', {
            handler: function () {
                const name = this.args[0];
                if (!name) return this.error('Usage : <<pnjfix "Nom">>');
                const npc = npcEnsure(name);
                npc.isBuddy = true;
                npc.status = 'fixed';
                npc.passage = State.passage.title;
                npc.isAlive = true;
                npc.isActive = true;
                notifyBuddy(`${npc.name} restera ici`);
                updateBuddyHUDVisibility();
            }
        });
/* ---- MACRO : movePnj ---- */
Macro.add('movePnj', {
            handler: function () {
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
                // Mettre à jour l'affichage si le PNJ est dans le même passage
                if (State.passage.title === targetPassage) {
                    window.renderBuddiesPanel && window.renderBuddiesPanel();
                }
            }
        });
/* ---- MACRO : pnjCoords ---- */
Macro.add('pnjCoords', {
            handler: function () {
                const pnjId = this.args[0];
                const x = parseInt(this.args[1]) || 0;
                const y = parseInt(this.args[2]) || 0;
                if (!pnjId) {
                    return this.error('Usage: <<pnjCoords "pnj_id" x y>>');
                }
                const npc = npcEnsure(pnjId);
                npc.coordinates = {x, y};
                console.log(`Coordonnées de ${pnjId} mises à jour: (${x}, ${y})`);
            }
        });
/* ---- MACRO : pnjgive ---- */
Macro.add('pnjgive', {
            handler: function () {
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
            handler: function () {
                const name = this.args[0];
                const value = Number(this.args[1] || 0);
                if (!name) return this.error('Usage : <<pnjsetstrength "Nom" valeur>>');
                window.npcSetStrength(name, value);
                window.setup.showNotification('Force modifiée', `${name} a maintenant ${value} de force.`, 3000);
            }
        });
/* ---- MACRO : pnjsetdexterity ---- */
Macro.add('pnjsetdexterity', {
            handler: function () {
                const name = this.args[0];
                const value = Number(this.args[1] || 0);
                if (!name) return this.error('Usage : <<pnjsetdexterity "Nom" valeur>>');
                window.npcSetDexterity(name, value);
                window.setup.showNotification('Dextérité modifiée', `${name} a maintenant ${value} de dextérité.`, 3000);
            }
        });
/* ---- MACRO : pnjsetlevel ---- */
Macro.add('pnjsetlevel', {
            handler: function () {
                const name = this.args[0];
                const value = Number(this.args[1] || 1);
                if (!name) return this.error('Usage : <<pnjsetlevel "Nom" valeur>>');
                window.npcSetLevel(name, value);
                window.setup.showNotification('Niveau modifié', `${name} est maintenant niveau ${value}.`, 3000);
            }
        });
/* ---- MACRO : buddyhurt ---- */
Macro.add('buddyhurt', {
            handler: function () {
                const [name, amt = 1] = this.args;
                if (!name) return this.error('<<buddyhurt "Nom" [amt]>>');
                window.npcApplyDamage(name, Number(amt) || 1);
            }
        });
/* ---- MACRO : buddyheal ---- */
Macro.add('buddyheal', {
            handler: function () {
                const [name, amt = 1] = this.args;
                if (!name) return this.error('<<buddyheal "Nom" [amt]>>');
                window.npcApplyHeal(name, Number(amt) || 1);
            }
        });
/* ---- MACRO : pnjheal ---- */
Macro.add('pnjheal', {
            handler: function () {
                const name = this.args[0];
                const amount = Number(this.args[1] || 0);
                if (!name || !amount) return this.error('Usage : <<pnjheal "Nom" montant>>');
                window.setup.healBuddy(name, amount);
            }
        });
/* ---- MACRO : pnjdamage ---- */
Macro.add('pnjdamage', {
            handler: function () {
                const name = this.args[0];
                const amount = Number(this.args[1] || 0);
                if (!name || !amount) return this.error('Usage : <<pnjdamage "Nom" montant>>');
                window.setup.damageBuddy(name, amount);
            }
        });
/* ---- MACRO : pnjkill ---- */
Macro.add('pnjkill', {
            handler: function () {
                const name = this.args[0];
                if (!name) return this.error('Usage : <<pnjkill "Nom">>');
                const npc = npcEnsure(name);
                npc.isAlive = false;
                npc.isActive = true; // cadavre présent
                notifyBuddy(`${npc.name} est mort.`);
                window.renderBuddiesPanel?.(); updateBuddyHUDVisibility();
            }
        });
/* ---- MACRO : pnjdismiss ---- */
Macro.add('pnjdismiss', {
            handler: function () {
                const name = this.args[0];
                if (!name) return this.error('Usage : <<pnjdismiss "Nom">>');
                const npc = npcEnsure(name);
                npc.isActive = false;
                npc.isBuddy = true;
                notifyBuddy(`${npc.name} s'éloigne pour un temps.`);
                window.renderBuddiesPanel?.(); updateBuddyHUDVisibility();
            }
        });
/* ---- MACRO : pnjresurrect ---- */
Macro.add('pnjresurrect', {
            handler: function () {
                const name = this.args[0];
                if (!name) return this.error('Usage : <<pnjresurrect "Nom">>');
                const npc = npcEnsure(name);
                npc.isAlive = true;
                if (npc.health <= 0) npc.health = Math.max(1, Math.floor(npc.maxHealth * 0.25));
                notifyBuddy(`${npc.name} reprend vie.`);
                window.renderBuddiesPanel?.(); updateBuddyHUDVisibility();
            }
        });
/* ---- MACRO : pnjrecall ---- */
Macro.add('pnjrecall', {
            handler: function () {
                const name = this.args[0];
                if (!name) return this.error('Usage : <<pnjrecall "Nom">>');
                const npc = npcEnsure(name);
                npc.isActive = true;
                npc.passage = State.passage.title;
                notifyBuddy(`${npc.name} est de retour.`);
                window.renderBuddiesPanel?.(); updateBuddyHUDVisibility();
            }
        });
/* ---- MACRO : setrelation ---- */
Macro.add('setrelation', { handler() { const [name, val] = this.args; if (!name) return this.error('<<setrelation "Nom" valeur>>'); window.npcSetRelation(name, val); } });
/* ---- MACRO : changerelation ---- */
Macro.add('changerelation', { handler() { const [name, d] = this.args; if (!name) return this.error('<<changerelation "Nom" delta>>'); window.npcChangeRelation(name, d); } });
/* ---- MACRO : setloyalty ---- */
Macro.add('setloyalty', { handler() { const [name, val] = this.args; if (!name) return this.error('<<setloyalty "Nom" valeur>>'); window.npcSetLoyalty(name, val); } });
/* ---- MACRO : changeloyalty ---- */
Macro.add('changeloyalty', { handler() { const [name, d] = this.args; if (!name) return this.error('<<changeloyalty "Nom" delta>>'); window.npcChangeLoyalty(name, d); } });
/* ---- MACRO : setmood ---- */
Macro.add('setmood', { handler() { const [name, val] = this.args; if (!name) return this.error('<<setmood "Nom" (-2..2)>>'); window.npcSetMood(name, val); } });
/* ---- MACRO : changemood ---- */
Macro.add('changemood', { handler() { const [name, d] = this.args; if (!name) return this.error('<<changemood "Nom" delta>>'); window.npcChangeMood(name, d); } });
//#endregion

    //#region BASE DE DONNÉES GÉOGRAPHIQUE VELKARUM
        // ==========================================================
        // BASE DE DONNÉES GÉOGRAPHIQUE VELKARUM - ÉDITION COMPLÈTE
        // ==========================================================
        window.velkarumGeography = {
            continents: {
                "Eldaron": {
                    regions: [
                        {
                            name: "Royaume Central de Valnoria",
                            bounds: { x_min: 30, x_max: 60, y_min: 40, y_max: 70 },
                            capital: "Lorn"
                        },
                        {
                            name: "Marches du Dalen",
                            bounds: { x_min: 15, x_max: 45, y_min: 65, y_max: 85 },
                            capital: "Dalen"
                        },
                        {
                            name: "Confédération Méridionale d'Ardel",
                            bounds: { x_min: 45, x_max: 80, y_min: 20, y_max: 45 },
                            capital: "Ardel"
                        },
                        {
                            name: "Principauté de Ferharn",
                            bounds: { x_min: 65, x_max: 90, y_min: 45, y_max: 70 },
                            capital: "Ferharn"
                        },
                        {
                            name: "Ligues Côtières de Lirn",
                            bounds: { x_min: 5, x_max: 30, y_min: 30, y_max: 60 },
                            capital: "Lirn"
                        },
                        {
                            name: "Terres Tribales du Nord",
                            bounds: { x_min: 20, x_max: 50, y_min: 80, y_max: 95 },
                            capital: "Aucune (nomadisme)"
                        },
                        {
                            name: "Marches Orientales",
                            bounds: { x_min: 75, x_max: 95, y_min: 70, y_max: 90 },
                            capital: "Khar-Ghul"
                        },
                        {
                            name: "Delta du Draen",
                            bounds: { x_min: 25, x_max: 45, y_min: 10, y_max: 25 },
                            capital: "Draenport"
                        }
                    ],
                    cities: [
                        { name: "Lorn", coords: { x: 45, y: 55 } },
                        { name: "Ardel", coords: { x: 60, y: 35 } },
                        { name: "Dorr", coords: { x: 50, y: 60 } },
                        { name: "Lirn", coords: { x: 15, y: 45 } },
                        { name: "Ferharn", coords: { x: 75, y: 55 } },
                        { name: "Dalen", coords: { x: 30, y: 75 } },
                        { name: "Khar-Ghul", coords: { x: 85, y: 80 } },
                        { name: "Draenport", coords: { x: 35, y: 15 } }
                    ],
                    points_of_interest: [
                        { name: "Académie du Draen", type: "Centre de recherche", coords: { x: 45, y: 55 } },
                        { name: "Conseil des Royaumes de Lorn", type: "Gouvernement continental", coords: { x: 45, y: 55 } },
                        { name: "Bourse Maritime de Lirn", type: "Marché financier international", coords: { x: 15, y: 45 } },
                        { name: "Trésor Royal de Lorn", type: "Banque centrale", coords: { x: 45, y: 55 } },
                        { name: "Guilde des Changeurs d'Ardel", type: "Bureau de change international", coords: { x: 60, y: 35 } },
                        { name: "Brigade Anti-Crime d'Ardel", type: "Forces de l'ordre", coords: { x: 60, y: 35 } },
                        { name: "Maison des Plaisirs Ombragés", type: "Établissement clandestin", coords: { x: 45, y: 55 } },
                        { name: "Les Cendres Rouges", type: "Établissement clandestin", coords: { x: 60, y: 35 } },
                        { name: "Forge des Ombres", type: "Atelier clandestin", coords: { x: 62, y: 32 } },
                        { name: "Marché de Khar-Ghul", type: "Marché noir", coords: { x: 85, y: 80 } },
                        { name: "Caravansérail des Ombres", type: "Réseau criminel", coords: { x: 45, y: 20 } },
                        { name: "Guilde des Talents", type: "Réseau criminel", coords: { x: 75, y: 55 } },
                        { name: "Marché des Compétences", type: "Réseau criminel", coords: { x: 55, y: 45 } }
                    ]
                },
                "Varnäl": {
                    regions: [
                        {
                            name: "Forêts Primaires de Rhaal",
                            bounds: { x_min: 20, x_max: 50, y_min: 60, y_max: 85 },
                            capital: "Rhaal"
                        },
                        {
                            name: "Bassins Marécageux de Marael",
                            bounds: { x_min: 40, x_max: 70, y_min: 30, y_max: 60 },
                            capital: "Marael"
                        },
                        {
                            name: "Savanes de Cenra",
                            bounds: { x_min: 60, x_max: 90, y_min: 40, y_max: 70 },
                            capital: "Cenra"
                        },
                        {
                            name: "Massif Central de Velkar",
                            bounds: { x_min: 30, x_max: 65, y_min: 10, y_max: 35 },
                            capital: "Velkar"
                        },
                        {
                            name: "Côtes Océaniques de Tarran",
                            bounds: { x_min: 5, x_max: 25, y_min: 20, y_max: 50 },
                            capital: "Tarran"
                        }
                    ],
                    cities: [
                        { name: "Rhaal", coords: { x: 35, y: 72 } },
                        { name: "Marael", coords: { x: 55, y: 45 } },
                        { name: "Velkar", coords: { x: 45, y: 20 } },
                        { name: "Tarran", coords: { x: 15, y: 35 } },
                        { name: "Falaar", coords: { x: 25, y: 25 } },
                        { name: "Cenra", coords: { x: 75, y: 55 } }
                    ],
                    points_of_interest: [
                        { name: "Observatoire Atmosphérique de Velkar", type: "Centre climatologique", coords: { x: 45, y: 20 } },
                        { name: "Laboratoires Alchimiques de Marael", type: "Centre de recherche", coords: { x: 55, y: 45 } },
                        { name: "Banque Génétique de Rhaal", type: "Réserve biodiversité", coords: { x: 35, y: 75 } },
                        { name: "Temple du Souffle", type: "Lieu sacré", coords: { x: 35, y: 72 } },
                        { name: "Marais de la Voix", type: "Lieu sacré", coords: { x: 54, y: 44 } },
                        { name: "Arbrena de Rhaal", type: "Lieu de divertissement", coords: { x: 35, y: 75 } },
                        { name: "Marché aux Senteurs", type: "Marché expérientiel", coords: { x: 55, y: 45 } },
                        { name: "Refuge des Brumes", type: "Laboratoire clandestin", coords: { x: 54, y: 44 } }
                    ]
                },
                "Thaurgrim": {
                    regions: [
                        {
                            name: "Royaume Volcanique du Vulkar",
                            bounds: { x_min: 60, x_max: 90, y_min: 60, y_max: 85 },
                            capital: "Vulkar"
                        },
                        {
                            name: "Plaines Fertiles du Drav",
                            bounds: { x_min: 40, x_max: 70, y_min: 40, y_max: 60 },
                            capital: "Drav"
                        },
                        {
                            name: "Hauts Plateaux de Derna",
                            bounds: { x_min: 20, x_max: 50, y_min: 50, y_max: 75 },
                            capital: "Derna"
                        },
                        {
                            name: "Côtes Géothermiques du Thun'ar",
                            bounds: { x_min: 30, x_max: 60, y_min: 20, y_max: 40 },
                            capital: "Thun'ar"
                        },
                        {
                            name: "Domaine Maritime d'Ashraal",
                            bounds: { x_min: 50, x_max: 80, y_min: 10, y_max: 30 },
                            capital: "Ashraal"
                        }
                    ],
                    cities: [
                        { name: "Vulkar", coords: { x: 75, y: 70 } },
                        { name: "Derna", coords: { x: 35, y: 60 } },
                        { name: "Kaar", coords: { x: 85, y: 40 } },
                        { name: "Thun'ar", coords: { x: 45, y: 30 } },
                        { name: "Drav", coords: { x: 55, y: 50 } }
                    ],
                    points_of_interest: [
                        { name: "Complexe Industriel de Thun'ar", type: "Centre énergétique", coords: { x: 45, y: 30 } },
                        { name: "Observatoire Volcanique du Ghaarn", type: "Centre sismique", coords: { x: 80, y: 75 } },
                        { name: "Port International de Kaar", type: "Hub commercial", coords: { x: 85, y: 40 } },
                        { name: "Temples du Feu Profond", type: "Lieu sacré", coords: { x: 75, y: 70 } },
                        { name: "Forges sacrées du Ghaarn", type: "Lieu sacré", coords: { x: 80, y: 75 } },
                        { name: "Grande Forge de Vulkar", type: "Forge spectacle", coords: { x: 75, y: 70 } },
                        { name: "Arène des Cendres", type: "Stade volcanique", coords: { x: 55, y: 50 } },
                        { name: "Champs de Soufre", type: "Zone d'extraction", coords: { x: 50, y: 25 } },
                        { name: "Caverne Acide", type: "Laboratoire clandestin", coords: { x: 58, y: 42 } }
                    ]
                },
                "Helrün": {
                    regions: [
                        {
                            name: "Territoire des Clans du Nerr",
                            bounds: { x_min: 10, x_max: 40, y_min: 5, y_max: 30 },
                            capital: "Nerr"
                        },
                        {
                            name: "Domaine des Tribus du Nar",
                            bounds: { x_min: 35, x_max: 75, y_min: 15, y_max: 45 },
                            capital: "Narvik"
                        },
                        {
                            name: "Royaume Montagnard du Skarnheim",
                            bounds: { x_min: 60, x_max: 95, y_min: 40, y_max: 70 },
                            capital: "Skarnheim"
                        },
                        {
                            name: "Territoires des Nautes du Draen",
                            bounds: { x_min: 5, x_max: 25, y_min: 40, y_max: 60 },
                            capital: "Aucune (nomadisme maritime)"
                        },
                        {
                            name: "Sanctuaires des Ermites du Drann",
                            bounds: { x_min: 45, x_max: 65, y_min: 65, y_max: 85 },
                            capital: "Ygral"
                        }
                    ],
                    cities: [
                        { name: "Skarnheim", coords: { x: 75, y: 55 } },
                        { name: "Nerr", coords: { x: 25, y: 15 } },
                        { name: "Narvik", coords: { x: 55, y: 30 } },
                        { name: "Ygral", coords: { x: 55, y: 75 } }
                    ],
                    points_of_interest: [
                        { name: "Station Polaire Internationale d'Ygral", type: "Centre de recherche", coords: { x: 55, y: 75 } },
                        { name: "Port International de Nerr", type: "Hub commercial polaire", coords: { x: 25, y: 15 } },
                        { name: "Sanctuaire d'Ygral", type: "Lieu sacré", coords: { x: 55, y: 75 } },
                        { name: "Sources du Drann", type: "Lieu sacré", coords: { x: 65, y: 80 } },
                        { name: "Hall des Brumes de Skarnheim", type: "Centre communautaire", coords: { x: 75, y: 55 } },
                        { name: "Arène de Nerr", type: "Stade polaire", coords: { x: 25, y: 15 } },
                        { name: "Grottes du Drann", type: "Stockage illégal", coords: { x: 50, y: 60 } },
                        { name: "Caverne du Silence", type: "Mine clandestine", coords: { x: 48, y: 62 } }
                    ]
                },
                "Iskarion": {
                    regions: [
                        {
                            name: "Royaume Solaire du Zhaïr",
                            bounds: { x_min: 20, x_max: 50, y_min: 60, y_max: 85 },
                            capital: "Zhaïr"
                        },
                        {
                            name: "Territoires du Rift Shaar",
                            bounds: { x_min: 40, x_max: 70, y_min: 30, y_max: 60 },
                            capital: "Shaar-Keth"
                        },
                        {
                            name: "Confédération des Plateaux de Surn",
                            bounds: { x_min: 60, x_max: 90, y_min: 40, y_max: 70 },
                            capital: "Vethar"
                        },
                        {
                            name: "Sultanat du Désert de Korra",
                            bounds: { x_min: 30, x_max: 65, y_min: 10, y_max: 35 },
                            capital: "Korra"
                        },
                        {
                            name: "Ligue Maritimes d'Asuren",
                            bounds: { x_min: 5, x_max: 25, y_min: 20, y_max: 50 },
                            capital: "Asuren"
                        }
                    ],
                    cities: [
                        { name: "Zhaïr", coords: { x: 35, y: 75 } },
                        { name: "Asuren", coords: { x: 15, y: 35 } },
                        { name: "Shaar-Keth", coords: { x: 55, y: 45 } },
                        { name: "Vethar", coords: { x: 75, y: 55 } },
                        { name: "Korra", coords: { x: 45, y: 20 } }
                    ],
                    points_of_interest: [
                        { name: "Station de Transfert Solaire d'Asuren", type: "Centrale énergétique", coords: { x: 15, y: 35 } },
                        { name: "Observatoire Climatique de Zhaïr", type: "Centre de recherche", coords: { x: 35, y: 75 } },
                        { name: "Grand Autel du Zhaïr", type: "Lieu sacré", coords: { x: 35, y: 75 } },
                        { name: "Sanctuaire du Shaar", type: "Lieu sacré", coords: { x: 56, y: 46 } },
                        { name: "Théâtre Solaire de Zhaïr", type: "Théâtre sacré", coords: { x: 35, y: 75 } },
                        { name: "Jardin des Reflets", type: "Parc contemplatif", coords: { x: 15, y: 35 } },
                        { name: "Jardins de Zhaïr Cachés", type: "Établissement clandestin", coords: { x: 35, y: 75 } },
                        { name: "Geyser Principal", type: "Site de recherche", coords: { x: 60, y: 40 } },
                        { name: "Source Acide", type: "Laboratoire naturel", coords: { x: 65, y: 35 } }
                    ]
                }
            },
            // LIEUX STRATÉGIQUES ET RESSOURCES
            strategic_locations: {
                mines_clandestines: [
                    { name: "Mine de l'Ombre", coords: { x: 88, y: 78 }, region: "Marches Orientales" },
                    { name: "Puits des Perdus", coords: { x: 52, y: 22 }, region: "Désert de Korra" },
                    { name: "Caverne du Silence", coords: { x: 48, y: 62 }, region: "Grottes du Drann" }
                ],
                ateliers_clandestins: [
                    { name: "Forge des Ombres", coords: { x: 62, y: 32 }, region: "Ardel" },
                    { name: "Enclume Noire", coords: { x: 78, y: 68 }, region: "Vulkar" }
                ],
                sites_production_stupefiants: [
                    { name: "Bassins Marécageux de Marael", produit: "Poudre de Brume", coords: { x: 55, y: 45 } },
                    { name: "Forêts Primaires de Rhaal", produit: "Sève de Rhaal Corrompue", coords: { x: 35, y: 75 } },
                    { name: "Sanctuaires des Ermites du Drann", produit: "Larmes d'Ygral", coords: { x: 55, y: 75 } },
                    { name: "Territoires du Rift Shaar", produit: "Sang Volcanique", coords: { x: 55, y: 45 } }
                ],
                repaires_pirates: [
                    { name: "Embouchure du Drann", type: "Repaire caché", coords: { x: 20, y: 25 } },
                    { name: "Confluence Surn-Brumes", type: "Zone d'embuscades", coords: { x: 25, y: 20 } },
                    { name: "Golfe de Thun'ar", type: "Trafic maritime", coords: { x: 70, y: 25 } }
                ]
            },
            // INFRASTRUCTURES CRITIQUES
            critical_infrastructure: {
                centres_financiers: [
                    { name: "Trésor Royal de Lorn", type: "Banque centrale", coords: { x: 45, y: 55 } },
                    { name: "Bourse Maritime de Lirn", type: "Marché financier", coords: { x: 15, y: 45 } },
                    { name: "Guilde des Changeurs d'Ardel", type: "Bureau de change", coords: { x: 60, y: 35 } }
                ],
                centres_recherche: [
                    { name: "Académie du Draen", type: "Recherche avancée", coords: { x: 45, y: 55 } },
                    { name: "Observatoire Atmosphérique de Velkar", type: "Climatologie", coords: { x: 45, y: 20 } },
                    { name: "Station Polaire Internationale d'Ygral", type: "Recherche polaire", coords: { x: 55, y: 75 } },
                    { name: "Observatoire Volcanique du Ghaarn", type: "Sismologie", coords: { x: 80, y: 75 } },
                    { name: "Observatoire Climatique de Zhaïr", type: "Recherche atmosphérique", coords: { x: 35, y: 75 } }
                ],
                ports_internationaux: [
                    { name: "Port International de Nerr", type: "Hub polaire", coords: { x: 25, y: 15 } },
                    { name: "Port International de Kaar", type: "Hub continental", coords: { x: 85, y: 40 } },
                    { name: "Station de Transfert Solaire d'Asuren", type: "Centrale énergétique", coords: { x: 15, y: 35 } }
                ]
            },
            // POINTS DE CONNEXION INTERCONTINENTAUX
            intercontinental_connections: {
                maritime: [
                    { name: "Ligne Lirn-Nerr", distance: "300 km", points: [{x: 15, y: 45}, {x: 25, y: 15}] },
                    { name: "Ligne Lirn-Tarran", distance: "400 km", points: [{x: 15, y: 45}, {x: 15, y: 35}] },
                    { name: "Ligne Ardel-Kaar", distance: "350 km", points: [{x: 60, y: 35}, {x: 85, y: 40}] }
                ],
                terrestre: [
                    { name: "Route des Cendres", points: [{x: 60, y: 35}, {x: 90, y: 35}] },
                    { name: "Voie du Nord", points: [{x: 45, y: 55}, {x: 40, y: 95}] }
                ],
                souterrain: [
                    { name: "Canal du Drann", points: [{x: 65, y: 80}, {x: 50, y: 60}, {x: 20, y: 25}] }
                ]
            }
        };
        //#endregion

    //#region ENVIRONNEMENT — fond, ambiance sonore
        // ------------------------------------------------------
        // ENVIRONNEMENT — fond, ambiance sonore
        // ------------------------------------------------------
        window.setup.applyEnvBackground = function (env) {
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
        window.setup.escapeHtml = function (str) {
            return String(str).replace(/[&<>"']/g, m => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            })[m]);
        };
       /* ==========================================================
       FONCTION UNIQUE — ENCARTS D’OBJETS (ARMES, SOINS, BONUS)
       Compatible CSS existant (bonus-tag, effect-tag, twohanded-tag)
       ========================================================== */
        window.setup.renderItemEncarts = function (item) {
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
                    const ic = bonusIcons[k]
                        ? `<img class="icon-08em" src="${bonusIcons[k]}" alt="">`
                        : '';
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
                            <img class="icon-08em" src="images/icons/damages.png" alt="">
                            ${dmgText}
                        </span>
                    `);
                }
                // --- VITESSE ---
                if (typeof item.speed !== "undefined") {
                    tags.push(`
                        <span class="bonus-tag">
                            <img class="icon-08em" src="images/icons/dexterity.png" alt="">
                            ${item.speed}
                        </span>
                    `);
                }
                // --- CRITIQUE ---
                if (typeof item.critChance !== "undefined") {
                    const cc = item.critChance;
                    const cm = (typeof item.critMultiplier !== "undefined") ? ` x${item.critMultiplier}` : '';
                    tags.push(`
                        <span class="bonus-tag">
                            <img class="icon-08em" src="images/icons/critical.png" alt="">
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
               4) Arme à deux mains
               ------------------------------------------------------ */
            if (item.isTwoHanded) {
                tags.push(`<span class="twohanded-tag">2M</span>`);
            }
            return `<div class="item-tags">${tags.join("")}</div>`;
        };
        window.setup.renderBonusTags = function (bonus, isTwoHanded) {
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
        window.setup.customConfirm = function (message, callback, x, y) {
            $('#confirm-alert, #modal-overlay').remove();
            const $overlay = $('<div id="modal-overlay"></div>').appendTo('body');
            const $alert = $(`
                <div id="confirm-alert" class="border-medieval">
                    <p>${message}</p>
                    <div class="btns"></div>
                </div>
            `).appendTo('body');
            $('<button type="button">Oui</button>').on('click', () => {
                callback(true); $alert.remove(); $overlay.remove();
            }).appendTo($alert.find('.btns'));
            $('<button type="button">Non</button>').on('click', () => {
                callback(false); $alert.remove(); $overlay.remove();
            }).appendTo($alert.find('.btns'));
            $alert.css({
                top: (y || window.innerHeight / 2 - 100) + 'px',
                left: (x ? x - 150 : window.innerWidth / 2 - 150) + 'px'
            });
        };
        // ------------------------------------------------------
        // NOTIFICATIONS GÉNÉRALES
        // ------------------------------------------------------
        window.setup.showNotification = function (title, text, duration = 3000, x, y, textColor) {
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
                        ${(title && text) ? `<div class="notification-divider"></div>` : ''}
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
    window.setup.notifyBuddy = function (text, duration = 3500) {
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
        try { new Wikifier(null, '<<audio "notif_dialogue" play volume 0.8>>'); } catch (e) {}
    };
    // ------------------------------------------------------
    // NOTIFICATIONS DE DIALOGUE + BOÎTE DE MESSAGES PNJ
    // ------------------------------------------------------
    if (!window.messagesInitialized) {
        $(document).one(':storyready', function () {
            // Lancement du chargement des loots uniquement après que Twine soit prêt
            loadLootsSequentially().catch(e => {
                console.error("Erreur lors du chargement des loots:", e);
            });
            window.messagesInitialized = true;
            const v = V();
            v.messages = v.messages || [];
            if (!$('#messages-panel').length) {
                $('body').append('<div id="messages-panel" class="side-panel"></div>');
            }
            $(document).on('hudready', function () {
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
            $(document).off('click', '#messages-toggle').on('click', '#messages-toggle', function () {
                $('.side-panel').removeClass('show');
                $('#messages-panel').toggleClass('show');
                window.setup.renderMessagesPanel();
            });
            $(document).off('click.msgclose').on('click.msgclose', function (e) {
                if (!$(e.target).closest('#messages-panel, #messages-toggle').length) {
                    $('#messages-panel').removeClass('show');
                }
            });
        });
    }
    // ------------------------------------------------------
    // AJOUT MESSAGE PNJ
    // ------------------------------------------------------
    window.setup.addMessage = function (npc, shortText, fullText, status = 'new') {
        const v = V();
        v.messages = v.messages || [];
        const id = 'msg-' + Date.now();
        v.messages.push({ id, npc, shortText, fullText, timestamp: Date.now(), status });
        window.setup.updateMessageCounter();
        window.setup.renderMessagesPanel();
    };
        // ------------------------------------------------------
        // NOTIFICATIONS DE DIALOGUE
        // ------------------------------------------------------
        window.setup.showDialogueNotification = function (npc, shortText, fullText) {
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
            // --- Clic sur le bouton “Ouvrir”
            $n.on('click', '.notif-btn', function (e) {
                e.stopPropagation();
                if (removed) return;
                opened = true;
                removed = true;
                // message ajouté en lu directement
                window.setup.addMessage(npc, shortText, fullText, 'read');
                window.setup.showMessageModal({ npc, fullText });
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
                        if (!opened) {
                            window.setup.addMessage(npc, shortText, fullText, 'new');
                        }
                    }, 400);
                }
            }, 5000);
            $n.on('remove', function () {
                removed = true;
                clearTimeout(autoClose);
            });
            try {
                new Wikifier(null, '<<audio "notif_dialogue" play volume 0.8>>');
            } catch (e) {}
        };
        // ------------------------------------------------------
        // MACRO XP JOUEUR
        // ------------------------------------------------------
        // ------------------------------------------------------
        // MACRO TWINE — NOTIFYDIALOGUE
        // ------------------------------------------------------
        // ------------------------------------------------------
        // MISE À JOUR DU COMPTEUR DE MESSAGES
        // ------------------------------------------------------
        window.setup.updateMessageCounter = function () {
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
        window.setup.renderMessagesPanel = function () {
            const v = V();
            const $panel = $('#messages-panel').empty();
            if (!v.messages || !v.messages.length) {
                $panel.html('<em style="opacity:.6; font-style:italic;">Aucun message reçu.</em>');
                return;
            }
            v.messages
                .slice()
                .sort((a, b) => (a.status === 'new' ? -1 : 1))
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
            $panel.find('.message-entry').off('click').on('click', function () {
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
        window.setup.showQuestNotification = function (title, text) {
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
            try { new Wikifier(null, '<<audio "notif_quest" play volume 0.8>>'); } catch (e) {}
        };
        // ——————————————————————————————————————
        // MODALE DIALOGUE (PNJ)
        // ——————————————————————————————————————
        window.setup.showMessageModal = function (msg) {
            $('#dialogue-modal, #modal-overlay-msg').remove();
            const $overlay = $('<div id="modal-overlay-msg"></div>').appendTo('body');
            const $modal = $('<div id="dialogue-modal" role="dialog" aria-modal="true"></div>').appendTo('body');
            $modal.append(`
                <div class="modal-content">
                    <div class="modal-header">
                        <img class="icon-1em" src="${ICONS.speak}" alt="">
                        <span>Message</span>
                    </div>
                    <div class="modal-body">
                        <strong>${window.setup.escapeHtml(msg.npc)}</strong><br>
                        ${window.setup.escapeHtml(msg.fullText)}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="modal-close">Compris</button>
                    </div>
                </div>
            `);
            $('body').addClass('modal-open');
            $modal.find('.modal-close').on('click', () => {
                $modal.remove(); $overlay.remove();
                $('body').removeClass('modal-open');
            });
        };
        // ——————————————————————————————————————
        // MODALE QUÊTE (détail)
        // ——————————————————————————————————————
        window.setup.showQuestModal = function (quest) {
            $('#quest-modal, #modal-overlay-quest').remove();
            const $overlay = $('<div id="modal-overlay-quest"></div>').appendTo('body');
            const $modal = $('<div id="quest-modal" role="dialog" aria-modal="true"></div>').appendTo('body');
            let rewardHTML = '';
            if (quest.reward.gold) rewardHTML += `${quest.reward.gold} or<br>`;
            if (quest.reward.items?.length) {
                rewardHTML += quest.reward.items.map(i => window.setup.escapeHtml(i.label)).join('<br>');
            }
            if (!rewardHTML) rewardHTML = 'Aucune';
            $modal.append(`
                <div class="modal-content">
                    <div class="modal-header">
                        <img class="icon-1em" src="${ICONS.quest}" alt="">
                        <span>Quête</span>
                    </div>
                    <div class="modal-body">
                        <strong>${window.setup.escapeHtml(quest.title)}</strong><br>
                        ${window.setup.escapeHtml(quest.fullDesc)}
                        <hr>
                        <strong>Récompense :</strong><br>
                        ${rewardHTML}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="modal-close">Fermer</button>
                    </div>
                </div>
            `);
            $('body').addClass('modal-open');
            $modal.find('.modal-close').on('click', () => {
                $modal.remove(); $overlay.remove();
                $('body').removeClass('modal-open');
            });
        };
        /* =========================================================================
           FONCTION UNIQUE — MODALE OBJET/ARME (version icône seule dans l'en-tête)
           ========================================================================= */
        window.setup.buildItemModalHTML = function (item) {
            const safeLabel = window.setup.escapeHtml(item.label || '');
            const safeDesc = window.setup.escapeHtml(item.description || '');
            /* ---------- Icône ---------- */
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
            /* ---------- Caractéristiques (encarts) ---------- */
            let encartsHTML = '';
            if (typeof window.setup.renderItemEncarts === 'function') {
                encartsHTML = window.setup.renderItemEncarts(item) || '';
            }
            const hasEncarts = encartsHTML.trim().length > 0;
            /* ---------- Effets (armes) ---------- */
            let effectsHTML = '';
            if (item.type === 'weapon' && Array.isArray(item.effects) && item.effects.length > 0) {
                effectsHTML =
                    '<ul>' +
                    item.effects.map(e => `<li>${window.setup.escapeHtml(e)}</li>`).join('') +
                    '</ul>';
            }
            /* ---------- Requirements (niveaux requis) ---------- */
            let requirementsHTML = '';
            if (item.requirements && typeof item.requirements === 'object') {
                const req = item.requirements;
                const requirementsLines = [];
                if (req.levelMin) {
                    requirementsLines.push(`<div class="requirement-line">
                        <span class="requirement-label">Niveau</span>
                        <span class="requirement-value">${req.levelMin}</span>
                    </div>`);
                }
                if (req.forceMin) {
                    requirementsLines.push(`<div class="requirement-line">
                        <span class="requirement-label">Force</span>
                        <span class="requirement-value">${req.forceMin}</span>
                    </div>`);
                }
                if (req.dexMin) {
                    requirementsLines.push(`<div class="requirement-line">
                        <span class="requirement-label">Dextérité</span>
                        <span class="requirement-value">${req.dexMin}</span>
                    </div>`);
                }
                if (requirementsLines.length > 0) {
                    requirementsHTML = `
                        <div class="item-stats-divider"></div>
                        <div>
                            <div class="weapon-section-title">Niveaux requis :</div>
                            <div class="requirements-container">
                                ${requirementsLines.join('')}
                            </div>
                        </div>
                    `;
                }
            }
            /* =========================================================
               HTML FINAL — TYPE RETIRÉ, ICÔNE SEULE + LABEL
               ========================================================= */
            return `
                <div class="modal-header">
                    <img class="icon-2em" src="${iconSrc}" alt="">
                    <span>${safeLabel}</span>
                </div>
       
                <div class="modal-body">
                    <p>${safeDesc}</p>
       
                    <div class="item-stats-divider"></div>
       
                    <div>
                        <div class="weapon-section-title">Caractéristiques :</div>
                        ${
                            hasEncarts
                                ? encartsHTML
                                : '<em style="opacity:0.75;">Aucune</em>'
                        }
                    </div>
       
                    ${requirementsHTML}
       
                    ${
                        effectsHTML
                            ? `
                            <div style="margin-top:0.9em;">
                                <div class="weapon-section-title">Effets :</div>
                                ${effectsHTML}
                            </div>
                            `
                            : ''
                    }
       
                    <div class="item-stats-divider"></div>
                </div>
            `;
        };
        /* =========================================================================
        MODALE OBJET/ARME — utilise buildItemModalHTML()
        ========================================================================= */
        window.setup.showItemModal = function (item) {
            // Sécurité
            if (!item) return;
            // Supprimer l’ancienne modale si elle existe
            $('#item-modal, #modal-overlay-item').remove();
            // Overlay
            const $overlay = $('<div id="modal-overlay-item"></div>').appendTo('body');
            // Conteneur principal
            const $modal = $('<div id="item-modal" role="dialog" aria-modal="true"></div>').appendTo('body');
            // Construction du contenu via buildItemModalHTML()
            const innerHTML = window.setup.buildItemModalHTML(item);
            $modal.append(`
                <div class="modal-content border-medieval">
                    ${innerHTML}
                    <div class="modal-footer">
                        <button type="button" class="modal-close">Fermer</button>
                    </div>
                </div>
            `);
            // Activation mode modale
            $('body').addClass('modal-open');
            // Fermeture
            $modal.find('.modal-close').on('click', () => {
                $modal.remove();
                $overlay.remove();
                $('body').removeClass('modal-open');
            });
            // Clic hors modale → fermer
            $(document).one('mousedown.itemmodal', function (e) {
                if (!$(e.target).closest('#item-modal').length) {
                    $modal.remove();
                    $overlay.remove();
                    $('body').removeClass('modal-open');
                }
            });
        };
        // ------------------------------------------------------
        // HUD + INVENTAIRE + ÉQUIPEMENT + (BUDDIES) - VERSION CORRIGÉE
        // ------------------------------------------------------
        window.setup.updateHUD = (function () {
            let timeout;
            function icon(img) { return `<img class="icon-1em" src="${img}" alt="">`; }
            return function () {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    const $hud = $('#hud');
                    if (!$hud.length) return;
                    const v = V();
                    const health = v.current_player_health ?? 10;
                    const maxHealth = v.max_player_health ?? 10;
                    const strength = v.strength || 0;
                    const dexterity = v.dexterity || 0; // ← DEXTÉRITÉ
                    const resistance = v.resistance || 0;
                    const magic = v.magic || 0;
                    const gold = v.gold || 0;
                    const level = v.level || 1; // ← NIVEAU
                    const exp = v.exp || 0; // ← EXP
                    const expToNextLevel = v.expToNextLevel || 100;
                    const expPercent = Math.min(100, (exp / expToNextLevel) * 100); // ← POURCENTAGE XP
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
                        // Mise à jour barre XP
                        const $firstLevel = $('.hud-exp-bar .hud-level:first');
                        const $lastLevel = $('.hud-exp-bar .hud-level:last');
                        const $expFill = $('.hud-exp-fill');
                        if ($firstLevel.length) $firstLevel.text(`Niv. ${level}`);
                        if ($lastLevel.length) $lastLevel.text(`Niv. ${level + 1}`);
                        if ($expFill.length) $expFill.css('width', `${expPercent}%`);
                    }
            // ... le reste du code HUD existant (toggles, panneaux, etc.) ...
                    const $toggles = $('#hud .hud-toggles');
                    // INVENTAIRE
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
                    // BUDDIES — icône visible seulement s’il existe ≥ 1 compagnon
                    const buddiesCount = Object.values(v.npcs || {}).filter(n => n.isBuddy && n.isSpawned).length;
                    if (!document.getElementById('buddy-toggle')) {
                        // placé à gauche des messages
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
                    // ------------------------------------------------------
                    // Gestion centralisée des panneaux (stable)
                    // ------------------------------------------------------
                    window.setup.togglePanel = function (panelSelector) {
                        const $panel = $(panelSelector);
                        if (!$panel.length) return;
                        const isVisible = $panel.hasClass('show');
                        $('.side-panel').removeClass('show');
                        if (!isVisible) $panel.addClass('show');
                    };
                    // Événements des toggles
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
                    // ⚠️ IMPORTANT : utiliser la version GLOBALE qui gère le menu contextuel
                    $('#buddy-toggle').off('click').on('click', (e) => {
                        e.stopPropagation();
                        window.setup.togglePanel('#buddies-panel');
                        window.renderBuddiesPanel();
                    });
                    // fermeture des panneaux si clic hors zone — whitelist étendue (context menus & modales)
                    $(document).off('click.hudpanels').on('click.hudpanels', e => {
                        const $target = $(e.target);
                        const isInsidePanel = $target.closest('.side-panel').length > 0;
                        const isToggle = $target.closest('#hud .hud-toggles > div').length > 0;
                        const isContextMenu = $target.closest('#inventory-context-menu, #delete-confirm, #buddy-context-menu, #give-buddy-menu, .context-menu').length > 0;
                        const isModal = $target.closest('#confirm-alert, #modal-overlay, #modal-overlay-msg, #dialogue-modal, #quest-modal, #modal-overlay-quest, #quest-proposal-modal, #modal-overlay-quest-proposal, #item-modal, #modal-overlay-item').length > 0;
                        const isBuddyMenuOpen = $('#buddy-context-menu, #give-buddy-menu').length > 0;
                        const isBuddyFilterArrow = $target.closest('.buddy-filter-arrow, .buddy-filter-arrow *').length > 0;
                        // Ne ferme pas le panneau si clic sur la barre de filtre des compagnons
                        if (!isInsidePanel && !isToggle && !isContextMenu && !isModal && !isBuddyMenuOpen && !isBuddyFilterArrow) {
                            $('.side-panel').removeClass('show');
                        }
                    });
                    function renderInventory() {
                        const $panel = $('#inventory-panel').empty();
                        const inventory = v.inventory || [];
                        const equipped = v.equipped || {};
                        const typeLabels = {
                            usable: "Objet", health: "Soin", food: "Nourriture", weapon: "Arme", shield: "Bouclier",
                            head: "Casque", torso: "Armure", arms: "Gants", legs: "Jambes", feet: "Pieds",
                            material: "Matériau", key: "Clé", misc: "Objet"
                        };
                        const bonusIcons = {
                            strength: ICONS.strength,
                            resistance: ICONS.defense,
                            health: ICONS.health,
                            magic: ICONS.magic
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
                                const $item = $(`
                                    <div class="inventory-item${isNew ? ' new' : ''}" data-id="${it.id}" data-type="${it.type}">
                                        <div class="inventory-badges">
                                            ${qtyBadge}${eqBadge}${newBadge}
                                        </div>
                                        <div>${window.setup.escapeHtml(it.label)}</div>
                                        <span class="inventory-type">${typeLabel}</span>
                                        ${window.setup.renderItemEncarts(it)}
                                    </div>
                                `);
                                $item.on('mouseenter', function () {
                                    if ($(this).hasClass('new')) {
                                        const id = $(this).data('id');
                                        v.inventoryNewItems = v.inventoryNewItems.filter(i => i !== id);
                                        $(this).removeClass('new').find('.item-new').remove();
                                        window.setup.updateInventoryCounter();
                                        window.setup.updateHUD();
                                    }
                                });
                                $item.on('contextmenu', function (e) {
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
                    // Vérifie si le pNJ peut équipper l'arme
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
                    function renderEquipment() {
                        const $panel = $('#equipment-panel').empty();
                        const inventory = v.inventory || [];
                        const equipped = v.equipped || {};
                        const slots = ['head', 'torso', 'arms', 'legs', 'feet', 'weapon', 'shield'];
                        const slotLabels = { head:'Tête', torso:'Torse', arms:'Mains', legs:'Jambes', feet:'Pieds', weapon:'Arme', shield:'Bouclier' };
                        const typeLabels = { weapon: "Arme", shield: "Bouclier", head: "Casque", torso: "Armure", arms: "Gants", legs: "Jambes", feet: "Pieds" };
                        const bonusIcons = { strength: ICONS.strength, resistance: ICONS.defense, health: ICONS.health, magic: ICONS.magic };
                        slots.forEach(slot => {
                            const eqId = equipped[slot];
                            const eqItem = eqId ? inventory.find(it => it.id === eqId) : null;
                            const eqHTML = eqItem ? `
                                <div class="inventory-item" data-id="${eqItem.id}" data-type="${eqItem.type}">
                                    <div>${window.setup.escapeHtml(eqItem.label)}</div>
                                    <span class="inventory-type">${typeLabels[eqItem.type] || "Objet"}</span>
                                    ${window.setup.renderItemEncarts(eqItem)}
                                </div>` : '<em class="equipment-empty" style="opacity:.6; cursor:pointer;">Rien équipé</em>';
                            $panel.append(`
                                <div class="equipment-slot" data-slot="${slot}">
                                    <strong>${slotLabels[slot]} :</strong>
                                    ${eqHTML}
                                </div>
                            `);
                        });
                        $panel.find('.equipment-slot').off('click.equipSlot').on('click.equipSlot', function () {
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
                                if (typeof renderInventory === 'function') renderInventory();
                                window.setup.showNotification('Équipement', `Choisissez un objet de type "${slot}" à équiper.`, 2800);
                            }
                        });
                    }
                    // rafraîchissements conditionnels
                    if ($('#inventory-panel').hasClass('show')) renderInventory();
                    if ($('#equipment-panel').hasClass('show')) renderEquipment();
                    if ($('#buddies-panel').hasClass('show')) window.renderBuddiesPanel();
                    window.setup.updateMessageCounter();
                    window.setup.updateQuestCounter();
                    window.setup.updateInventoryCounter();
                }, 40);
            };
        })();
        // ------------------------------------------------------
        // COMPTEURS — NOUVEAUX COMPORTEMENTS
        // ------------------------------------------------------
        window.setup.updateQuestCounter = function () {
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
        window.setup.updateInventoryCounter = function () {
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
        // ------------------------------------------------------
    // MENUS CONTEXTUELS — CLIC GAUCHE = MODALE, CLIC DROIT = MENU
    // ------------------------------------------------------
    // CLIC GAUCHE : ouvrir modale objet / gérer équipement si sélection
    $(document).off('click.inventory').on('click.inventory', '#inventory-panel .inventory-item', function (e) {
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
    // CLIC GAUCHE sur équipement → modale d'information
    $(document).off('click.equipment').on('click.equipment', '#equipment-panel .inventory-item', function (e) {
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
    $(document).off('contextmenu.inventory').on('contextmenu.inventory', '#inventory-panel .inventory-item', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const $item = $(this);
        const id = $item.data('id');
        const label = $item.find('div').first().text().trim();
        const type = $item.data('type');
        window.setup.showItemMenu(e.pageX, e.pageY, id, label, type, $item);
    });
    window.setup.showItemMenu = function (x, y, id, label, type, $item) {
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
                .on('click', function (e) {
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
        // OPTION "UTILISER" UNIQUEMENT POUR LES TYPES SPÉCIFIQUES
        if (['usable', 'health', 'food'].includes(type)) {
            addOption('Utiliser', () => window.setup.useItem(id, label, type, x, y));
        }
        // OPTION "DONNER À UN COMPAGNON" POUR TOUS LES TYPES D'OBJETS (sauf quest)
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
        $(document).off('mousedown.inventorymenu').on('mousedown.inventorymenu', function (e) {
            if (!$(e.target).closest('#inventory-context-menu').length) {
                $('#inventory-context-menu').remove();
                $(document).off('mousedown.inventorymenu');
            }
        });
    };
    // ------------------------------------------------------
    // MENU CONTEXTUEL ÉQUIPEMENT
    // ------------------------------------------------------
    $(document).off('contextmenu.equipment').on('contextmenu.equipment', '#equipment-panel .inventory-item', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const id = $(this).data('id');
        const label = $(this).find('div').first().text().trim();
        const type = $(this).data('type');
        window.setup.showEquipContextMenu(e.pageX, e.pageY, id, label, type, $(this));
    });
    window.setup.showEquipContextMenu = function (x, y, id, label, type, $item) {
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
        $(document).one('mousedown.equipmentmenu', function (e) {
            if (!$(e.target).closest('#inventory-context-menu').length) menu.remove();
        });
    };
        // ------------------------------------------------------
        // UTILISATION D’OBJET — AJOUT DU CONTRÔLE SANTÉ COMPAGNON
        // ------------------------------------------------------
        window.setup.useItem = function (id, label, type, x, y, target = 'player') {
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
        window.setup.showDeleteConfirm = function (id, label, all, $item) {
            $('#delete-confirm').remove();
            // ✔ On force le label correct depuis l’objet
            const item = (V().inventory || []).find(it => it.id === id);
            if (item) label = item.label;
            const x = ($item?.offset()?.left || window.innerWidth / 2) + 20;
            const y = ($item?.offset()?.top || window.innerHeight / 2) - 20;
            const $box = $('<div id="delete-confirm"></div>').appendTo('body');
            const question = all
                ? `Jeter <strong>toute votre quantité de "${window.setup.escapeHtml(label)}"</strong> ?`
                : `Jeter "${window.setup.escapeHtml(label)}" ?`;
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
            $box.find('.confirm-yes').on('click', function (e) {
                e.stopPropagation();
                window.setup.confirmDelete(id, label, all);
                $box.remove();
            });
            $box.find('.confirm-no').on('click', function (e) {
                e.stopPropagation();
                $box.remove();
            });
            $(document).one('mousedown.deleteconfirm', function (e) {
                if (!$(e.target).closest('#delete-confirm').length) $box.remove();
            });
        };
        // ------------------------------------------------------
        // CONFIRMATION ACTION — identique, inchangé
        // ------------------------------------------------------
        window.setup.confirmDelete = function (id, label, all) {
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
        window.setup.equipItem = function (id, slot) {
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
        window.setup.unequipItem = function (id, slot, silent) {
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
        // FONCTION DE CONVERSION COORDONNÉES → LOCALISATION
        // ==========================================================
        window.setup.getLocationString = function(coords, continent) {
            // Validation des paramètres
            if (!coords || typeof coords !== 'object') {
                return "Position inconnue";
            }
            if (typeof coords.x !== 'number' || isNaN(coords.x) ||
                typeof coords.y !== 'number' || isNaN(coords.y)) {
                return "Position invalide";
            }
            const safeCoords = {
                x: Math.max(0, Math.min(100, coords.x)), // Clamp entre 0-100
                y: Math.max(0, Math.min(100, coords.y))
            };
            const safeContinent = continent || "Eldaron";
            const geo = window.velkarumGeography;
            if (!geo.continents[safeContinent]) {
                return `${safeContinent} - Position inconnue`;
            }
            const continentData = geo.continents[safeContinent];
            let regionName = "Zone sauvage";
            let nearestCity = null;
            let minDistance = Infinity;
            // Trouver la région
            for (const region of continentData.regions) {
                const bounds = region.bounds;
                if (safeCoords.x >= bounds.x_min && safeCoords.x <= bounds.x_max &&
                    safeCoords.y >= bounds.y_min && safeCoords.y <= bounds.y_max) {
                    regionName = region.name;
                    break;
                }
            }
            // Trouver la ville la plus proche (dans un rayon de 15 unités)
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
            // Formater la localisation
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
        // ==========================================================
        // MACRO POUR AFFICHER LA LOCALISATION ACTUELLE
        // ==========================================================
        /* ------------------------------------------------------
           MACRO ADDITEM — VERSION SIMPLIFIÉE (ID + QTY)
           Tous les champs viennent de window.setup.itemCache[id]
        ------------------------------------------------------ */
        // ------------------------------------------------------
        // SANTÉ / MORT
        // ------------------------------------------------------
        // ==========================================================
        // SYSTÈME DE QUÊTES — "EN COURS" (GRIS) / "TERMINÉ" (BLANC)
        // ==========================================================
        (function () {
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
                                <img class="icon-1em" src="${(window.ICONS && window.ICONS.quest) ? window.ICONS.quest : 'images/icons/quest.png'}" alt="">
                                <strong>${title}</strong>
                                <span class="${statusClass}">${statusText}</span>${newBadge}
                            </div>
                            <div class="quest-short">${shortDesc}</div>
                        </div>`
                    );
                }
                $panel.html(rows.join(''));
                // Binding click (délégué) — on nettoie puis on rebinde proprement
                $panel.off('click' + EVT_NS, '.quest-entry').on('click' + EVT_NS, '.quest-entry', function () {
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
                $doc.one(':storyready' + EVT_NS, function () {
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
                    $doc.on('hudready' + EVT_NS, function () {
                        const $toggles = $('#hud .hud-toggles');
                        if ($toggles.length && !$('#quest-toggle').length) {
                            $toggles.prepend(`
                                <div id="quest-toggle" title="Quêtes">
                                    <img class="icon-1em" src="${(window.ICONS && window.ICONS.quest) ? window.ICONS.quest : 'images/icons/quest.png'}" alt="Quêtes">
                                    <span id="quest-counter" class="counter">0</span>
                                </div>
                            `);
                        }
                        window.setup.updateQuestCounter && window.setup.updateQuestCounter();
                    });
                    // Toggle panneau quêtes
                    $doc.off('click' + EVT_NS, '#quest-toggle').on('click' + EVT_NS, '#quest-toggle', function () {
                        $('.side-panel').removeClass('show');
                        $('#quest-panel').toggleClass('show');
                        const v = getV();
                        (v.quests || []).forEach(q => q.viewed = true);
                        window.setup.updateQuestCounter && window.setup.updateQuestCounter();
                        renderQuestPanel();
                    });
                    // Fermer en cliquant hors panneau
                    $doc.off('click.questclose' + EVT_NS).on('click.questclose' + EVT_NS, function (e) {
                        if (!$(e.target).closest('#quest-panel, #quest-toggle').length) {
                            $('#quest-panel').removeClass('show');
                        }
                    });
                });
            }
            // -----------------------------------------
            // API publique inchangée (add/ready/complete)
            // -----------------------------------------
            window.setup.addQuest = function (id, title, shortDesc, fullDesc, reward = {}) {
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
            window.setup.markQuestReady = function (id) {
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
            window.setup.markQuestCompleted = function (id) {
                const v = V();
                const idx = (v.quests || []).findIndex(q => q.id === id);
                if (idx === -1 || v.quests[idx].status !== 'ready') return;
                const quest = v.quests[idx];
                const reward = quest.reward || {};
                const rewardLines = [];
                // --- Récompense en or ---
                if (reward.gold) {
                    v.gold = (v.gold || 0) + Number(reward.gold || 0);
                    rewardLines.push(`• ${Number(reward.gold || 0)} or`);
                }
                // --- Récompenses objets ---
                if (Array.isArray(reward.items) && reward.items.length > 0) {
                    for (const item of reward.items) {
                        const bonusStr = item.bonus
                            ? Object.keys(item.bonus)
                                .map(k => `${k}:${item.bonus[k]}`)
                                .join(' ')
                            : '';
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
                                m.handler.call({ args });
                                window.setup.showNotification = oldShowNotif;
                            }
                        }
                        // Liste des objets pour la notif finale
                        const bonusTxt = item.bonus
                            ? ` (${Object.keys(item.bonus)
                                .map(k => `${k}:${item.bonus[k]}`)
                                .join(', ')})`
                            : '';
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
                window.setup.showNotificationHTML = function (title, html, duration = 3000, x, y) {
                let $container = $('#notification-container');
                if (!$container.length) $container = $('<div id="notification-container"></div>').appendTo('body');
                const $n = $('<div class="notification border-medieval"></div>');
                $n.append(`
                    <div class="notification-content">
                        <img class="icon-1em" src="${ICONS.quest}" alt="Notification">
                        <div class="notification-text">
                            ${title ? `<div class="notification-title"><strong>${window.setup.escapeHtml(title)}</strong></div>` : ''}
                            ${(title && html) ? `<div class="notification-divider"></div>` : ''}
                            ${html ? `<div class="notification-message">${html}</div>` : ''}
                        </div>
                    </div>
                `);
                $container.append($n);
                setTimeout(() => $n.addClass('show'), 10);
                setTimeout(() => { $n.addClass('hide'); setTimeout(() => $n.remove(), 400); }, duration);
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
            window.setup.parseReward = function (str) {
                if (!str) return { gold: 0, items: [] };
                const s = String(str).trim();
                if (!s) return { gold: 0, items: [] };
                // JSON direct
                try {
                    const parsed = JSON.parse(s);
                    return {
                        gold: Number(parsed.gold) || 0,
                        items: Array.isArray(parsed.items) ? parsed.items : []
                    };
                } catch (e) { /* continue */ }
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
                } catch (e) { /* continue */ }
                // Format texte : gold:50; items:random:health|random:food
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
                                return trimmed; // garde "random:health"
                            }
                            // Format id,label,type,desc
                            const [id, label, type = 'misc', desc = ''] = trimmed.split(',').map(p => p.trim());
                            return id ? { id, label: label || id, type, description: desc } : null;
                        }).filter(Boolean);
                    }
                }
                return out;
            };
})();
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
                    coordinates: {x: 0, y: 0},
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
                // Initialisation des autres champs manquants
                if (typeof n.inventory === 'undefined') n.inventory = {};
                if (typeof n.equipment === 'undefined') {
                    n.equipment = {
                        weapon: null, armor: null, head: null, torso: null,
                        arms: null, legs: null, feet: null, shield: null
                    };
                }
                if (typeof n.hasWeapon === 'undefined') n.hasWeapon = false;
                if (typeof n.coordinates === 'undefined') n.coordinates = {x: 0, y: 0};
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

        function npcGet(name) { return npcEnsure(name); }

        function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

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
            // Validation robuste des coordonnées
            if (typeof npc.coordinates !== 'object' || npc.coordinates === null) {
                npc.coordinates = { x: 0, y: 0 };
            }
            if (typeof npc.coordinates.x !== 'number' || isNaN(npc.coordinates.x)) {
                npc.coordinates.x = 0;
            }
            if (typeof npc.coordinates.y !== 'number' || isNaN(npc.coordinates.y)) {
                npc.coordinates.y = 0;
            }
            // Assurer la présence du continent
            if (!npc.continent) {
                npc.continent = "Eldaron"; // Continent par défaut
            }
            // Assurer la présence du passage
            if (!npc.passage && npc.isSpawned) {
                npc.passage = State.passage.title;
            }
            return npc.coordinates;
        };
        // ==========================================================
        // FONCTION : Mise à jour des coordonnées des PNJ suiveurs
        // ==========================================================
        window.setup.updateFollowersCoordinates = function() {
            const v = V();
            const currentPassage = State.passage.title;
            const passageCoords = (v.passageCoords || {})[currentPassage];
            if (!passageCoords) {
                console.warn(`⚠️ Aucunes coordonnées définies pour le passage "${currentPassage}"`);
                return;
            }
            // Mettre à jour tous les PNJ qui suivent le joueur
            Object.values(v.npcs || {}).forEach(npc => {
                if (npc.status === 'follow' && npc.isBuddy && npc.isAlive && npc.isActive && npc.isSpawned) {
                    // Mettre à jour le passage ET les coordonnées
                    npc.passage = currentPassage;
                    npc.coordinates = {
                        x: passageCoords.x,
                        y: passageCoords.y
                    };
                    // Mettre à jour le continent si disponible
                    if (passageCoords.continent) {
                        npc.continent = passageCoords.continent;
                    }
                    console.log(`👥 ${npc.name} suit le joueur vers ${currentPassage} (${npc.coordinates.x}, ${npc.coordinates.y})`);
                }
            });
            // Mettre à jour les coordonnées du joueur
            v.playerCoordinates = v.playerCoordinates || {};
            v.playerCoordinates.x = passageCoords.x;
            v.playerCoordinates.y = passageCoords.y;
            if (passageCoords.continent) {
                v.playerCoordinates.continent = passageCoords.continent;
            }
        };
        // ------------------------------
        // Macros PNJ principales
        // ------------------------------
        // Macro pour mettre à jour seulement les coordonnées
        // ------------------------------------------------------
        // MACRO PNJGIVE - MAINTENANT UNIQUEMENT POUR LES COMPAGNONS
        // ------------------------------------------------------
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
                .map(([key, npc]) => ({ id: key, ...npc }));
        };
        // ------------------------------
        // Macros pour les stats PNJ
        // ------------------------------
        window.npcSetStrength = function (name, value) {
            const n = npcGet(name);
            n.stats = n.stats || {};
            n.stats.strength = Math.max(0, Number(value) || 0);
            window.renderBuddiesPanel?.();
            return n;
        };
        window.npcSetDexterity = function (name, value) {
            const n = npcGet(name);
            n.stats = n.stats || {};
            n.stats.dexterity = Math.max(0, Number(value) || 0);
            window.renderBuddiesPanel?.();
            return n;
        };
        window.npcSetLevel = function (name, value) {
            const n = npcGet(name);
            n.stats = n.stats || {};
            n.stats.level = Math.max(1, Number(value) || 1);
            window.renderBuddiesPanel?.();
            return n;
        };
        // ------------------------------
        // Santé compagnon (APIs + Macros)
        // ------------------------------
        window.npcApplyDamage = function (name, amount = 1) {
            const n = npcGet(name);
            if (!n.isAlive) return n;
            n.health = Math.max(0, (n.health || 0) - Math.max(0, amount));
            if (n.health <= 0) { n.isAlive = false; n.isActive = false; notifyBuddy(`${n.name} est mort.`); }
            window.renderBuddiesPanel?.(); window.setup.updateHUD?.();
            return n;
        };
        window.npcApplyHeal = function (name, amount = 1) {
            const n = npcGet(name);
            if (!n.isAlive) return n;
            n.health = Math.min(n.maxHealth, (n.health || 0) + Math.max(0, amount));
            notifyBuddy(`${n.name} est soigné (${n.health}/${n.maxHealth})`);
            window.renderBuddiesPanel?.(); window.setup.updateHUD?.();
            return n;
        };
        // APIs directes
        window.setup.healBuddy = function (name, amount) {
            const npc = npcGet(name);
            if (!npc.isAlive || !npc.isActive) return window.setup.showNotification?.('Impossible', `${npc.name} ne peut pas être soigné.`);
            const before = npc.health;
            npc.health = Math.min(npc.maxHealth, npc.health + Math.max(0, amount));
            const delta = npc.health - before;
            if (delta > 0) notifyBuddy(`${npc.name} récupère ${delta} PV.`);
            window.renderBuddiesPanel?.();
        };
        window.setup.damageBuddy = function (name, amount) {
            const npc = npcGet(name);
            if (!npc.isActive) return window.setup.showNotification?.('Absent', `${npc.name} est absent.`);
            const before = npc.health;
            npc.health = Math.max(0, npc.health - Math.max(0, amount));
            const delta = before - npc.health;
            if (delta > 0) notifyBuddy(`${npc.name} perd ${delta} PV.`);
            if (npc.health <= 0) { npc.isAlive = false; notifyBuddy(`${npc.name} succombe.`); }
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
            // Vérifier si l'item existe dans l'inventaire du joueur
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
                // Supprimer l'objet si la quantité devient 0
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
        window.npcSetRelation = function (name, value) { const n = npcGet(name); n.relation = clamp(Number(value) || 0, 0, 100); window.renderBuddiesPanel?.(); return n; };
        window.npcChangeRelation = function (name, delta) { const n = npcGet(name); n.relation = clamp((n.relation || 0) + Number(delta || 0), 0, 100); window.renderBuddiesPanel?.(); return n; };
        window.npcSetLoyalty = function (name, value) { const n = npcGet(name); n.loyalty = clamp(Number(value) || 0, 0, 100); window.renderBuddiesPanel?.(); return n; };
        window.npcChangeLoyalty= function (name, delta) { const n = npcGet(name); n.loyalty = clamp((n.loyalty || 0) + Number(delta || 0), 0, 100); window.renderBuddiesPanel?.(); return n; };
        window.npcSetMood = function (name, value) { const n = npcGet(name); n.mood = clamp(Number(value) || 0, -2, 2); window.renderBuddiesPanel?.(); return n; };
        window.npcChangeMood = function (name, delta) { const n = npcGet(name); n.mood = clamp((n.mood || 0) + Number(delta || 0), -2, 2); window.renderBuddiesPanel?.(); return n; };
        // ==========================================================
        // PANNEAU COMPAGNONS + MENU CONTEXTUEL (corrigé)
        // — version stable : le menu reste ouvert même avec filtres / interactions UI
        // ==========================================================
        window.renderBuddiesPanel = function () {
            const v = V();
            const $panel = $('#buddies-panel');
            if (!$panel.length) return;
            // --- Sauvegarde du menu si ouvert ---
            const $existingMenu = $('#buddy-context-menu');
            const hasMenu = $existingMenu.length > 0;
            const savedMenu = hasMenu ? $existingMenu.detach() : null;
            // On vide le contenu sans supprimer le panel
            $panel.empty();
            const all = Object.values(v.npcs || {});
            const filters = [
                { id: 'all', label: 'Tous' },
                { id: 'follow', label: 'Suiveurs' },
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
                    (v._buddyFilter === 'fixed' && n.status === 'fixed' && n.isAlive && n.isActive) ||
                    (v._buddyFilter === 'dead' && !n.isAlive) ||
                    (v._buddyFilter === 'gone' && !n.isActive && n.isAlive))
            );
            // Barre de filtres avec flèches
            const $bar = $('<div class="buddy-filter-bar"></div>').appendTo($panel);
            const $left = $('<button class="buddy-filter-arrow prev" title="Précédent">◄</button>').appendTo($bar);
            const $center = $('<div class="buddy-filter-label"></div>').appendTo($bar);
            const $right = $('<button class="buddy-filter-arrow next" title="Suivant">►</button>').appendTo($bar);
            $center.text(filters[currentIndex].label);
            function cycleFilter(dir) {
                // Bloque temporairement la fermeture du menu compagnon
                window.ignoreNextBuddyMenuClose = true;
                setTimeout(() => { window.ignoreNextBuddyMenuClose = false; }, 200);
                currentIndex = (currentIndex + dir + filters.length) % filters.length;
                v._buddyFilter = filters[currentIndex].id;
                window.renderBuddiesPanel();
            }
            $left.off('click.buddycycle').on('click.buddycycle', () => cycleFilter(-1));
            $right.off('click.buddycycle').on('click.buddycycle', () => cycleFilter(1));
            if (!list.length) {
                $panel.append('<em style="opacity:.6;">Aucun compagnon dans cette catégorie.</em>');
                if (savedMenu) $('body').append(savedMenu);
                return;
            }
            // Liste des compagnons
            list.forEach(b => {
                const health = Number(b.health ?? 0);
                const maxHealth = Math.max(1, Number(b.maxHealth ?? 1));
                const safeHealth = isNaN(health) ? 0 : health;
                const safeMax = isNaN(maxHealth) ? 1 : maxHealth;
                const healthRatio = Math.max(0, Math.min(1, safeHealth / safeMax));
                const badgeType =
                    !b.isAlive ? 'dead' :
                    (!b.isActive ? 'gone' :
                    (b.status === 'follow' ? 'follow' : 'fixed'));
                const badgeLabel = {
                    follow: 'Vous suit',
                    fixed: 'Sur place',
                    dead: 'Mort',
                    gone: 'Absent'
                }[badgeType];
                const badgeClass = {
                    follow: 'item-badge buddy-follow',
                    fixed: 'item-badge buddy-fixed',
                    dead: 'item-badge buddy-dead',
                    gone: 'item-badge buddy-gone'
                }[badgeType];
                const healthClass =
                    !b.isAlive ? 'h-dead' :
                    !b.isActive ? 'h-gone' :
                    (healthRatio > 0.6 ? 'h-good' :
                    healthRatio > 0.3 ? 'h-mid' : 'h-low');
                const healthWidth = Math.max(2, Math.min(100, healthRatio * 100));
                const healthText = b.isAlive ? `${safeHealth}/${safeMax}` : 'Mort';
                const badgeHTML = `<span class="${badgeClass}">${badgeLabel}</span>`;
                // Récupérer l'arme équipée si elle existe
                let weaponHTML = '';
                if (b.equipment.weapon) {
                    const weaponId = b.equipment.weapon;
                    const weaponData = window.setup.itemCache && window.setup.itemCache[weaponId];
                    if (weaponData) {
                        weaponHTML = `
                            <div class="buddy-weapon">
                                <strong>Arme équipée :</strong>
                                <div class="inventory-item" data-id="${weaponId}" data-type="weapon">
                                    <div>${window.setup.escapeHtml(weaponData.label)}</div>
                                    <span class="inventory-type">Arme</span>
                                    ${window.setup.renderItemEncarts(weaponData)}
                                </div>
                            </div>
                        `;
                    } else {
                        weaponHTML = `<div class="buddy-weapon"><strong>Arme :</strong> ${weaponId}</div>`;
                    }
                } else {
                    weaponHTML = '<div class="buddy-weapon"><strong>Arme :</strong> Aucune</div>';
                }
                // Affichage des stats du PNJ
                const strength = b.stats.strength || 0;
                const dexterity = b.stats.dexterity || 0;
                const resistance = b.stats.resistance || 0;
                const level = b.stats.level || 1;
                const statsHTML = `
                    <div class="buddy-stats">
                        <span class="bonus-tag">
                            <img class="icon-08em" src="${ICONS.strength}" alt="Force">
                            ${strength}
                        </span>
                        <span class="bonus-tag">
                            <img class="icon-08em" src="images/icons/dexterity.png" alt="Dextérité">
                            ${dexterity}
                        </span>
                        <span class="bonus-tag">
                            <img class="icon-08em" src="${ICONS.defense}" alt="Résistance">
                            ${resistance}
                        </span>
                        <span class="bonus-tag">
                            Niv ${level}
                        </span>
                    </div>
                `;
                const $entry = $(`
                    <div class="buddy-entry" data-name="${b.name}">
                        <div class="msg-header">
                            <img class="icon-1em" src="${ICONS.buddy}" alt="Compagnon">
                            <strong>${window.setup.escapeHtml(b.name)}</strong>
                            ${badgeHTML}
                            ${statsHTML}
                        </div>
                        <div class="buddy-healthbar">
                            <div class="buddy-healthfill ${healthClass}" style="width:${healthWidth}%;"></div>
                        </div>
                        <div class="buddy-healthtext">${healthText}</div>
                        ${weaponHTML}
                        <!-- Affichage localisation -->
                        <div class="buddy-location">
                        <strong>Position :</strong>
                        ${window.setup.getLocationString(b.coordinates, b.continent || "Eldaron")}
                        </div>
                    </div>
                `);
                $panel.append($entry);
            });
            // Interaction : clic droit → menu contextuel
            $panel.find('.buddy-entry').off('contextmenu.buddymenu').on('contextmenu.buddymenu', function (e) {
                e.preventDefault();
                e.stopPropagation();
                $('#buddy-context-menu, #give-buddy-menu').remove();
                const name = $(this).data('name');
                const npc = (V().npcs || {})[name];
                const $menu = $('<div id="buddy-context-menu" class="context-menu"></div>').appendTo('body');
                function addOption(text, fn, disabled = false) {
                    const $opt = $('<div class="context-option"></div>').text(text);
                    if (disabled) {
                        $opt.addClass('disabled');
                    } else {
                        $opt.on('click', ev => { ev.stopPropagation(); fn(); $menu.remove(); });
                    }
                    $menu.append($opt);
                }
                if (!npc.isAlive) {
                    addOption('Impossible — mort', () => {}, true);
                } else if (!npc.isActive) {
                    addOption('Rappeler', () => {
                        npc.isActive = true;
                        npc.passage = State.passage.title;
                        window.setup.notifyBuddy(`${npc.name} revient.`);
                        window.renderBuddiesPanel();
                    });
                } else {
                    if (npc.status === 'follow') {
                        addOption('Rester ici', () => {
                            npc.status = 'fixed';
                            npc.passage = State.passage.title;
                            // Mettre à jour les coordonnées avec le passage actuel
                            const v = V();
                            const passageCoords = (v.passageCoords || {})[State.passage.title];
                            if (passageCoords) {
                                npc.coordinates = {
                                    x: passageCoords.x,
                                    y: passageCoords.y
                                };
                                if (passageCoords.continent) {
                                    npc.continent = passageCoords.continent;
                                }
                            }
                            window.setup.notifyBuddy(`${npc.name} restera ici`);
                            window.renderBuddiesPanel();
                        });
                    } else {
                        addOption('Vous suivre', () => {
                            npc.status = 'follow';
                            // CORRECTION : Mettre à jour les coordonnées avec le passage actuel
                            const v = V();
                            const currentPassage = State.passage.title;
                            const passageCoords = (v.passageCoords || {})[currentPassage];
                            if (passageCoords) {
                                npc.coordinates = {
                                    x: passageCoords.x,
                                    y: passageCoords.y
                                };
                                if (passageCoords.continent) {
                                    npc.continent = passageCoords.continent;
                                }
                            } else {
                                npc.coordinates = { x: 0, y: 0 };
                                npc.continent = "Eldaron";
                            }
                            npc.passage = currentPassage;
                            console.log(`👥 ${npc.name} commence à suivre le joueur dans ${currentPassage} (${npc.coordinates.x}, ${npc.coordinates.y})`);
                            window.setup.notifyBuddy(`${npc.name} vous suit`);
                            window.renderBuddiesPanel();
                        });
                    }
                    // === Parler ===
                    addOption('Parler', () => {
                        window.setup.openChatModal(name);
                    }, !npc || !npc.isAlive || !npc.isActive);
                    // === Soigner (+5 PV) ===
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
                    // === Soigner (objet) ===
                    {
                        const inv = v.inventory || [];
                        const healItems = inv.filter(it => ['health','food'].includes(it.type));
                        const currentHP = Number(npc.health) || 0;
                        const maxHP = Number(npc.maxHealth) || 1;
                        if (npc.isAlive && npc.isActive && currentHP < maxHP && healItems.length > 0) {
                            addOption('Soigner (objet)', () => {
                                $('#buddy-context-menu').remove();
                                const $menu2 = $('<div id="give-buddy-menu" class="context-menu give-buddy-menu"></div>').appendTo('body');
                                $menu2.append(`<div class="context-title">Choisir un objet à donner :</div>`);
                                healItems.forEach(it => {
                                    const $slot = $(`
                                        <div class="inventory-item" data-id="${it.id}" data-type="${it.type}">
                                            ${it.qty > 1 ? `<span class="inventory-qty">${it.qty}</span>` : ''}
                                            <div>${window.setup.escapeHtml(it.label)}</div>
                                            <span class="inventory-type">${window.setup.escapeHtml(it.type)}</span>
                                            ${window.setup.renderItemEncarts(it)}
                                        </div>
                                    `);
                                    $slot.on('click', ev => {
                                        ev.stopPropagation();
                                        $('#give-item-context-menu').remove();
                                        const posX3 = Math.min(ev.pageX + 10, window.innerWidth - 200);
                                        const posY3 = Math.min(ev.pageY + 10, window.innerHeight - 150);
                                        const $sub = $(`<div id="give-item-context-menu" class="context-menu"></div>`).appendTo('body');
                                        function addSubOption(txt, fn) {
                                            const $opt2 = $('<div class="context-option"></div>').text(txt);
                                            $opt2.on('click', e2 => { e2.stopPropagation(); fn(); $sub.remove(); $menu2.remove(); });
                                            $sub.append($opt2);
                                        }
                                        addSubOption('Donner 1', () => {
                                            window.setup.useItem(it.id, it.label, it.type, ev.pageX, ev.pageY, name);
                                        });
                                        if ((it.qty || 1) > 1) {
                                            addSubOption('Tout donner', () => {
                                                for (let i = 0; i < it.qty; i++) {
                                                    window.setup.useItem(it.id, it.label, it.type, ev.pageX, ev.pageY, name);
                                                }
                                            });
                                        }
                                        $sub.css({ top: `${posY3}px`, left: `${posX3}px` });
                                        $(document).one('mousedown.subgivemenu', e2 => {
                                            if (!$(e2.target).closest('#give-item-context-menu').length) {
                                                $sub.remove();
                                            }
                                        });
                                    });
                                    const $wrapper = $('<div class="give-item-entry"></div>').append($slot);
                                    $menu2.append($wrapper);
                                });
                                const posX2 = Math.min(e.pageX + 20, window.innerWidth - 300);
                                const posY2 = Math.min(e.pageY + 20, window.innerHeight - 300);
                                $menu2.css({ top: `${posY2}px`, left: `${posX2}px` });
                                $(document).one('mousedown.givemenu', ev2 => {
                                    if (!$(ev2.target).closest('#give-buddy-menu').length) $menu2.remove();
                                });
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
                    // === Reprendre l'arme ===
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
                const posX = Math.min(e.pageX + 10, window.innerWidth - 240);
                const posY = Math.min(e.pageY + 10, window.innerHeight - 240);
                $menu.css({ top: `${posY}px`, left: `${posX}px` });
                // Fermeture intelligente
                $(document).off('mousedown.buddymenuclose').on('mousedown.buddymenuclose', ev => {
                    setTimeout(() => {
                        const $t = $(ev.target);
                        const isInsideMenu = $t.closest('#buddy-context-menu').length > 0;
                        const isInsidePanel = $t.closest('#buddies-panel').length > 0;
                        const isFilterArrow = $t.closest('.buddy-filter-arrow, .buddy-filter-arrow *').length > 0;
                        if (!isInsideMenu && !isInsidePanel && !isFilterArrow && !window.ignoreNextBuddyMenuClose) {
                            $('#buddy-context-menu').remove();
                            $(document).off('mousedown.buddymenuclose');
                        }
                    }, 10);
                });
            });
            // Réattache le menu existant si présent
            if (savedMenu) $('body').append(savedMenu);
        };
        // ------------------------------------------------------
        // MENU "DONNER À UN COMPAGNON" — VERSION AMÉLIORÉE ET UNIFIÉE
        // ------------------------------------------------------
        window.setup.showGiveToBuddyMenu = function (x, y, id, label, type) {
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
                option.on('click', function (e) {
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
            $(document).off('mousedown.givebuddy').on('mousedown.givebuddy', function (e) {
                if (!$(e.target).closest('#give-buddy-menu').length) {
                    $('#give-buddy-menu').remove();
                    $(document).off('mousedown.givebuddy');
                }
            });
        };
        // ==========================================================
        // FONCTION UNIFIÉE : DONNER AUX COMPAGNONS - VERSION COMPLÈTEMENT CORRIGÉE
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
                console.log("📦 Inventaire avant:", playerInventory.map(i => `${i.id}:${i.qty}`));
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
                // === CORRECTION CRITIQUE : RETRAIT DE L'INVENTAIRE ===
                playerItem.qty -= quantity;
                // Si la quantité devient 0, supprimer complètement l'objet
                if (playerItem.qty <= 0) {
                    console.log(`🗑️ Suppression de l'objet ${itemId} de l'inventaire`);
                    v.inventory.splice(playerItemIndex, 1);
                    // Déséquiper l'objet si il était équipé
                    const equipped = v.equipped || {};
                    Object.keys(equipped).forEach(slot => {
                        if (equipped[slot] === itemId) {
                            console.log(`🔧 Déséquipement de ${itemId} du slot ${slot}`);
                            window.setup.unequipItem(itemId, slot, true);
                        }
                    });
                }
                // Mettre à jour le dictionnaire "has" du joueur
                v.has = v.has || {};
                v.has[itemId] = Math.max(0, (v.has[itemId] || 0) - quantity);
                if (v.has[itemId] === 0) {
                    delete v.has[itemId];
                    console.log(`✅ v.has[${itemId}] supprimé`);
                }
                console.log("📦 Inventaire après:", v.inventory.map(i => `${i.id}:${i.qty}`));
                // Ajouter à l'inventaire du compagnon
                if (npc.inventory[itemId]) {
                    npc.inventory[itemId] += quantity;
                } else {
                    npc.inventory[itemId] = quantity;
                }
                console.log(`🎒 Inventaire ${pnjId}:`, npc.inventory);
                // Équipement automatique si c'est une arme et que le compagnon n'en a pas
                const itemData = window.setup.itemCache && window.setup.itemCache[itemId];
                if (itemData && itemData.type === 'weapon' && !npc.equipment.weapon) {
                    if (window.setup.canPnjEquipItem(pnjId, itemId)) {
                        const success = window.setup.equipItemForPnj(pnjId, itemId, 'weapon');
                        if (success) {
                            window.setup.showNotification('Équipement', `${npc.name} équipe ${itemData.label}`, 3000);
                        }
                    }
                }
                // Améliorer la relation et la loyauté
                npc.relation = Math.min(100, (npc.relation || 50) + 2);
                npc.loyalty = Math.min(100, (npc.loyalty || 50) + 1);
                // Notification de succès
                window.setup.showNotification('Don réussi', `${quantity} ${itemLabel} donné à ${npc.name}`, 3000);
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
        CHARGEMENT PNJ — JSON DYNAMIQUE (dossier /pnj/)
        ========================================================== */
        window.pnjData = window.pnjData || {};
        async function loadAllPNJ() {
            const pnjDir = 'pnj/';
            try {
                // Liste manuelle des fichiers JSON (si file:// pas de listing)
                const pnjFiles = [
                    'Cyndra.json', // <----- OBLIGATOIRE
                    // ajoute tes autres PNJ JSON ici
                ];
                for (const file of pnjFiles) {
                    try {
                        const res = await fetch(`${pnjDir}${file}`);
                        if (!res.ok) {
                            console.warn('PNJ introuvable :', file);
                            continue;
                        }
                        const data = await res.json();
                        const id = (data.id || file.replace('.json','')).toLowerCase();
                        window.pnjData[id] = data;
                        console.log("[PNJ] Chargé dans le jeu :", id, data.nom);
                    } catch (err) {
                        console.error("Erreur chargement PNJ JSON :", file, err);
                    }
                }
            } catch (e) {
                console.error("Impossible de charger les PNJ JSON :", e);
            }
        }
        /* ==========================================================
        FONCTION D’ACCÈS
        ========================================================== */
        window.setup.loadPNJ = function (id) {
            id = id.toLowerCase();
            if (window.pnjData[id]) return window.pnjData[id];
            return {
                id,
                nom: id.toUpperCase(),
                personnalité: "neutre",
                contexte: "silencieux"
            };
        };
        /* ==========================================================
        INIT AUTO SUR STORYREADY
        ========================================================== */
        $(document).one(':storyready', () => loadAllPNJ());
        window.setup.openChatModal = async function (pnjId) {
            $('#chat-modal, #modal-overlay-chat').remove();
            const $overlay = $('<div id="modal-overlay-chat"></div>').appendTo('body');
            const $modal = $('<div id="chat-modal"></div>').appendTo('body');
            // PNJ Data
            const pnj = window.setup.loadPNJ(pnjId);
            const safeName = window.setup.escapeHtml(pnj.nom || pnjId);
            const raceJob = `${pnj.race || ''} ${pnj.métier || ''}`.trim();
            // Chat History
            const v = V();
            v.chatHistory = v.chatHistory || {};
            const history = v.chatHistory[pnjId] = v.chatHistory[pnjId] || [];
            // STRUCTURE MODALE STANDARD (zéro inline)
            $modal.html(`
                <div class="modal-content">
                    <div class="modal-header">
                        <img class="icon-1em" src="${ICONS.speak}" alt="">
                        <span>🗡️ Discussion</span>
                        <small>${raceJob}</small>
                    </div>
                    <div class="modal-body">
                        <div id="chat-log" class="chat-log"></div>
                        <textarea id="chat-input" placeholder="Parlez à ${safeName}..."></textarea>
                    </div>
                    <div class="modal-footer">
                        <button id="chat-send" type="button">Envoyer</button>
                        <button id="chat-close" type="button" class="modal-close">Fermer</button>
                    </div>
                </div>
            `);
            $('body').addClass('modal-open');
            const $log = $('#chat-log');
            const $input = $('#chat-input');
            // Afficher historique (sans jitter)
            history.slice(-12).forEach(msg => {
                const cls = msg.role === 'user' ? 'chat-player' : 'chat-pnj';
                $log.append(`<div class="${cls}">${window.setup.escapeHtml(msg.content)}</div>`);
            });
            $log[0].scrollTop = $log[0].scrollHeight;
            // Événements
            $('#chat-close').on('click', () => {
                $modal.remove(); $overlay.remove();
                $('body').removeClass('modal-open');
            });
            // Ollama (inchangé, optimisé)
            async function sendToOllama(userMsg) {
                try {
                    const res = await fetch('http://127.0.0.1:5001/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            pnj_id: pnjId,
                            player_message: userMsg,
                            history: history.slice(-8)
                        })
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const data = await res.json();
                    if (!data.ok) {
                        console.error('Erreur PNJ server:', data.error);
                        return `[${pnj.nom} reste silencieux…]`;
                    }
                    return data.reply || `[${pnj.nom} reste silencieux…]`;
                } catch (err) {
                    console.error('Erreur connexion PNJ server :', err);
                    return `[${pnj.nom} reste silencieux…]`;
                }
            }
            async function sendMessage() {
                const msg = $input.val().trim();
                if (!msg) return;
                // UI Loading (anti-freeze)
                $input.val('').prop('disabled', true);
                const $sendBtn = $('#chat-send').prop('disabled', true).text('⏳');
                // Joueur
                $log.append(`<div class="chat-player">${window.setup.escapeHtml(msg)}</div>`);
                history.push({ role: 'user', content: msg, timestamp: Date.now() });
                $log[0].scrollTop = $log[0].scrollHeight;
                // IA
                const reply = await sendToOllama(msg);
                $log.append(`<div class="chat-pnj">${window.setup.escapeHtml(reply)}</div>`);
                history.push({ role: 'assistant', content: reply, timestamp: Date.now() });
                $log[0].scrollTop = $log[0].scrollHeight;
                // Reset UI
                $input.prop('disabled', false).focus();
                $sendBtn.prop('disabled', false).text('Envoyer');
                // Update relation
                const pnjLive = npcEnsure(pnjId);
                pnjLive.relation = Math.min(100, (pnjLive.relation || 30) + 1);
            }
            $('#chat-send').on('click', sendMessage);
            $input.on('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
            // Focus auto (smooth)
            setTimeout(() => $input.focus(), 200);
        };
        // ------------------------------------------------------
        // INITIALISATION + TRANSITIONS
        // ------------------------------------------------------
        $(document).one(':storyready', function () {
            const v = V();
            // Initialisation des variables critiques avec valeurs par défaut
            v.inventory = v.inventory || [];
            v.equipped = v.equipped || {};
            v.current_player_health = v.current_player_health ?? 10;
            v.max_player_health = v.max_player_health ?? 10;
            v.strength = v.strength || 0;
            v.resistance = v.resistance || 0;
            v.magic = v.magic || 0;
            v.gold = v.gold || 0;
            v.dexterity = v.dexterity || 0; // ← IMPORTANT: initialisation dextérité
            v.level = v.level || 1; // ← IMPORTANT: initialisation niveau
            v.exp = v.exp || 0; // ← IMPORTANT: initialisation expérience
            v.inventoryNewItems = v.inventoryNewItems || [];
            v.inventoryViewed = v.inventoryViewed !== false;
            v.messages = v.messages || [];
            v.quests = v.quests || [];
            v.completedQuests = v.completedQuests || [];
            v.pendingQuests = v.pendingQuests || {};
            v.npcs = v.npcs || {}; // ← stockage PNJ
            v.passageCoords = v.passageCoords || {}; // ← coordonnées des passages
            v.playerCoordinates = v.playerCoordinates || {}; // ← coordonnées joueur
            if (!document.getElementById('hud')) $('body').prepend('<div id="hud"></div>');
            if (!document.getElementById('notification-container')) $('body').append('<div id="notification-container"></div>');
            window.setup.updateHUD();
            $(document).on(':passagestart', () => {
                $('#passages').stop(true, true).animate({ opacity: 0 }, 200);
            });
            $(document).on(':passagedisplay', () => {
                $('#passages').stop(true, true).animate({ opacity: 1 }, 400);
                window.setup.updateHUD();
                // ==========================================================
                // CORRECTION : MISE À JOUR COORDONNÉES JOUEUR ET PNJ SUIVEURS
                // ==========================================================
                const v = V();
                const currentPassage = State.passage.title;
                // Récupérer les coordonnées du passage actuel
                const passageCoords = (v.passageCoords || {})[currentPassage];
                if (passageCoords) {
                    console.log(`🎯 Passage "${currentPassage}" - Coordonnées: (${passageCoords.x}, ${passageCoords.y})`);
                    // Mettre à jour les PNJ qui suivent le joueur
                    Object.values(v.npcs || {}).forEach(npc => {
                        if (npc.status === 'follow' && npc.isBuddy && npc.isAlive && npc.isActive && npc.isSpawned) {
                            // Mettre à jour le passage ET les coordonnées
                            npc.passage = currentPassage;
                            npc.coordinates = {
                                x: passageCoords.x,
                                y: passageCoords.y
                            };
                            // Mettre à jour le continent si disponible
                            if (passageCoords.continent) {
                                npc.continent = passageCoords.continent;
                            }
                            console.log(`👥 ${npc.name} suit le joueur vers ${currentPassage} (${npc.coordinates.x}, ${npc.coordinates.y})`);
                        }
                    });
                    // Mettre à jour les coordonnées du joueur dans une variable dédiée
                    v.playerCoordinates = v.playerCoordinates || {};
                    v.playerCoordinates.x = passageCoords.x;
                    v.playerCoordinates.y = passageCoords.y;
                    if (passageCoords.continent) {
                        v.playerCoordinates.continent = passageCoords.continent;
                    }
                } else {
                    console.warn(`⚠️ Aucunes coordonnées définies pour le passage "${currentPassage}"`);
                    // Coordonnées par défaut pour éviter les erreurs
                    Object.values(v.npcs || {}).forEach(npc => {
                        if (npc.status === 'follow' && npc.isBuddy && npc.isAlive && npc.isActive) {
                            npc.passage = currentPassage;
                            npc.coordinates = npc.coordinates || { x: 0, y: 0 };
                            console.log(`👥 ${npc.name} suit vers ${currentPassage} (coordonnées par défaut)`);
                        }
                    });
                }
                if (window.setup.updateFollowersCoordinates) {
                    window.setup.updateFollowersCoordinates();
                }
                // Le reste du code d'animation...
                const $choices = $('#choices-container a, #passages a.link-internal, #passages a');
                const $paragraphs = $('.fade-paragraph');
                const $divider = $('#choices-divider');
                $paragraphs.removeClass('visible').css('opacity', 0);
                $paragraphs.each((i, el) => setTimeout(() => $(el).addClass('visible'), i * 300));
                const baseDelay = $paragraphs.length * 180 + 300;
                if ($divider.length) setTimeout(() => $divider.addClass('visible'), baseDelay);
                $choices.removeClass('visible').css({ 'pointer-events': 'none', opacity: 0, filter: 'grayscale(80%)' });
                $('.choiceicon-marker').each(function () {
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
                $choices.each((i, el) => setTimeout(() => $(el).addClass('visible').animate({ opacity: 1 }, 300), linkStart + i * 200));
                const totalDelay = linkStart + $choices.length * 200 + 300;
                setTimeout(() => {
                    $choices.css({ 'pointer-events': 'auto', filter: 'none' });
                    v.visitedPassages = v.visitedPassages || {};
                    v.visitedPassages[State.passage.title] = true;
                    // Rafraîchir l'affichage des compagnons après le déplacement
                    if (window.renderBuddiesPanel) {
                        window.renderBuddiesPanel();
                    }
                }, totalDelay);
            });
        });
    })();