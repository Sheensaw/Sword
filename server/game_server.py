import time
import logging
import json
import os
from pathlib import Path
from typing import Dict, Any, Optional

from core_models import GameItem, ItemType, EquipmentSlot, InventoryManager, Location, WorldGraph
from npc_agent import GameAwareNPC, PlayerEntity, NPCState

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - [SERVER] %(message)s')
logger = logging.getLogger("NPCServer")

BASE_DIR = Path(__file__).resolve().parent
PNJ_DIR = BASE_DIR / "pnj"
LORE_DIR = BASE_DIR / "lore"


class NPCServer:
    def __init__(self):
        self.world = WorldGraph()
        self.npcs: Dict[str, GameAwareNPC] = {}
        self.players: Dict[str, PlayerEntity] = {}
        self._load_real_world_data()

    def _load_real_world_data(self):
        logger.info("--- CHARGEMENT DES DONNÉES RÉELLES ---")
        self._load_geography()
        self._load_npcs()
        self._create_player()

    def _load_geography(self):
        if not LORE_DIR.exists():
            logger.warning(f"Dossier Lore introuvable : {LORE_DIR}")
            self.world.add_location(Location(loc_id="world_default", name="Le Néant", description="Un espace vide."))
            return

        node_count = 0
        for file_path in LORE_DIR.glob("*.json"):
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                if not isinstance(data, dict): continue

                # Chargement des Nodes avec Coordonnées X/Y
                if "nodes" in data and isinstance(data["nodes"], dict):
                    for node_id, node_data in data["nodes"].items():
                        loc = Location(
                            loc_id=node_id,
                            name=node_data.get("name", "Lieu Inconnu"),
                            description=node_data.get("description", "Pas de description."),
                            x=float(node_data.get("x", 0.0)),
                            y=float(node_data.get("y", 0.0)),
                            continent=node_data.get("continent", "Eldaron")
                        )
                        self.world.add_location(loc)
                        node_count += 1

                # Chargement des Routes
                if "routes" in data and isinstance(data["routes"], list):
                    for route in data["routes"]:
                        start_id = route.get("start")
                        end_id = route.get("end")
                        dist = route.get("distance_km", 1)
                        time_cost = int(dist * 10)
                        if start_id and end_id:
                            loc_a = self.world.get_location(start_id)
                            loc_b = self.world.get_location(end_id)
                            if loc_a: loc_a.add_connection(end_id, time_cost)
                            if loc_b: loc_b.add_connection(start_id, time_cost)

            except Exception as e:
                logger.error(f"Erreur lecture géo {file_path.name}: {e}")

        if node_count == 0:
            self.world.add_location(Location(loc_id="world_default", name="Monde Par Défaut", description="Vide."))
        else:
            logger.info(f"🌍 Géographie chargée : {node_count} lieux.")

    def _load_npcs(self):
        if not PNJ_DIR.exists(): os.makedirs(PNJ_DIR, exist_ok=True)
        default_spawn = next(iter(self.world.locations.keys()), "world_default")
        loaded_count = 0

        for file_path in PNJ_DIR.glob("*.json"):
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                if not isinstance(data, dict): continue

                pnj_root = data.get('pnj', {})
                identite = pnj_root.get('identite', {})
                nom = identite.get('nom_complet') or identite.get('nom') or file_path.stem
                metier = identite.get('metier_principal', 'Inconnu')
                persona = pnj_root.get('personnalite', 'Une personne de ce monde.')

                # Tentative de placement initial
                spawn_loc = default_spawn
                json_loc = pnj_root.get('localisation_actuelle')
                if json_loc and self.world.get_location(json_loc):
                    spawn_loc = json_loc

                npc = GameAwareNPC(
                    name=nom,
                    start_loc_id=spawn_loc,
                    world=self.world,
                    inventory=InventoryManager(),
                    persona=f"{metier}. {persona}"
                )
                self.npcs[nom] = npc
                # Ajout par nom de fichier pour compatibilité
                if file_path.stem != nom: self.npcs[file_path.stem] = npc
                loaded_count += 1
            except Exception as e:
                logger.error(f"Erreur chargement PNJ {file_path.name}: {e}")

        logger.info(f"👥 PNJ Chargés : {loaded_count}")

    def _create_player(self):
        self.players["player_1"] = PlayerEntity(name="Le Joueur", inventory=InventoryManager())

    def server_tick(self):
        for npc in self.npcs.values():
            try:
                npc.update()
            except:
                pass

    def get_safe_system_prompt(self, npc_identifier: str, player_id: str, client_context: Dict[str, Any] = None) -> str:
        """
        Génère le prompt système.
        Accepte maintenant 'client_context' pour synchroniser la réalité JS avec l'IA.
        """
        target_npc = self.npcs.get(npc_identifier)
        if not target_npc:
            for name, npc in self.npcs.items():
                if npc_identifier.lower() in name.lower():
                    target_npc = npc
                    break

        if not target_npc:
            return f"SYSTEM: PNJ '{npc_identifier}' introuvable. Incarne un esprit confus."

        player = self.players.get("player_1")

        try:
            # On passe le contexte client à l'agent (Mise à jour critique)
            return target_npc.construct_context_prompt(nearby_player=player, client_context=client_context)
        except Exception as e:
            logger.error(f"CRASH CONTEXTE {target_npc.name}: {e}")
            return f"SYSTEM: Erreur sensorielle ({str(e)}). Agis normalement mais signale un vertige."

    def command_npc_move(self, npc_id: str, target_loc: str) -> str:
        npc = self.npcs.get(npc_id)
        if npc: return npc.start_travel(target_loc)
        return "PNJ inconnu."