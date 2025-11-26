import time
import uuid
import logging
from enum import Enum
from typing import Optional, Dict, Any
from pydantic import BaseModel

# Import des systèmes Core
from core_models import InventoryManager, WorldGraph, GameItem

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - [AGENT] %(message)s')
logger = logging.getLogger("NPCAgent")


class NPCState(str, Enum):
    IDLE = "inactif"
    MOVING = "en_mouvement"
    COMBAT = "combat"
    TALKING = "en_conversation"
    SLEEPING = "dort"


class PlayerEntity(BaseModel):
    """
    Représentation du Joueur vue par le système.
    Sert à injecter les infos du joueur dans le contexte du PNJ.
    """
    name: str
    inventory: InventoryManager

    class Config:
        arbitrary_types_allowed = True  # Nécessaire pour inclure InventoryManager complexe


class GameAwareNPC:
    """
    L'Agent PNJ complet.
    Intègre la Machine à États, l'Inventaire et la Localisation.
    """

    def __init__(self, name: str, start_loc_id: str, world: WorldGraph, inventory: InventoryManager, persona: str):
        self.id = str(uuid.uuid4())
        self.name = name
        self.persona = persona  # La personnalité de base (ex: "Un garde bourru mais loyal")
        self.world = world
        self.inventory = inventory

        # État Interne
        self.current_location_id = start_loc_id
        self.state = NPCState.IDLE

        # Gestion du Voyage
        self.destination_id: Optional[str] = None
        self.arrival_time: float = 0.0
        self.last_update_tick: float = time.time()

    def update(self):
        """
        La boucle de pulsation (Tick) du PNJ.
        Doit être appelée à chaque cycle serveur.
        """
        now = time.time()
        self.last_update_tick = now

        if self.state == NPCState.MOVING:
            if now >= self.arrival_time:
                self._complete_travel()

    def start_travel(self, target_loc_id: str) -> str:
        """
        Commande impérative de voyage.
        Retourne un message système décrivant l'action.
        """
        if self.state != NPCState.IDLE:
            return f"SYSTEM: {self.name} est occupé ({self.state.value}) et ne peut pas voyager."

        cost = self.world.get_travel_cost(self.current_location_id, target_loc_id)

        if cost is None:
            # Vérification si c'est verrouillé
            loc = self.world.get_location(self.current_location_id)
            conn = loc.connections.get(target_loc_id)
            if conn and conn.is_locked:
                return "SYSTEM: La voie est verrouillée."
            return f"SYSTEM: Pas de chemin direct vers {target_loc_id}."

        # Transition d'État
        target_loc = self.world.get_location(target_loc_id)
        self.state = NPCState.MOVING
        self.destination_id = target_loc_id
        self.arrival_time = time.time() + cost

        logger.info(f"{self.name} commence à marcher vers {target_loc.name} (Durée: {cost}s).")
        return f"ACTION: Vous commencez à marcher vers {target_loc.name}. Cela prendra {cost} secondes."

    def _complete_travel(self):
        """Finalisation interne du voyage."""
        self.current_location_id = self.destination_id
        self.state = NPCState.IDLE
        self.destination_id = None
        logger.info(f"{self.name} est arrivé à destination.")

    def construct_context_prompt(self, nearby_player: Optional[PlayerEntity] = None,
                                 client_context: Dict[str, Any] = None) -> str:
        """
        Génère le contexte. UTILISE LA GÉOMÉTRIE SERVEUR POUR VALIDER LE LIEU.
        """
        loc_context = ""

        # 1. GESTION DE LA LOCALISATION (HYBRIDE CLIENT/SERVEUR)
        if client_context and "location" in client_context:
            c_loc = client_context["location"]

            # Données brutes client
            client_x = c_loc.get("coords", {}).get("x", 0)
            client_y = c_loc.get("coords", {}).get("y", 0)
            continent = c_loc.get("continent", "Eldaron")

            # CALCUL GÉOMÉTRIQUE SERVEUR (La Vérité Terrain)
            nearest_loc, dist = self.world.find_nearest_location(client_x, client_y, continent)

            geo_description = f"Coordonnées GPS: X={client_x}, Y={client_y} ({continent})."

            if nearest_loc:
                # 1 Unité = 10 km (Convention Velkarum)
                dist_km = int(dist * 10)
                if dist < 1.0:  # Très proche (<10km)
                    geo_description += f" Tu es À {nearest_loc.name}."
                    # On met à jour l'état interne
                    self.current_location_id = nearest_loc.loc_id
                else:
                    # En pleine nature
                    direction = ""
                    if nearest_loc.x > client_x:
                        direction += "Ouest"
                    else:
                        direction += "Est"
                    if nearest_loc.y > client_y:
                        direction += "-Sud"
                    else:
                        direction += "-Nord"

                    geo_description += f" Tu es en ZONE SAUVAGE, à environ {dist_km}km de {nearest_loc.name}."
            else:
                geo_description += " Zone totalement inconnue."

            loc_context = (f"ANALYSE GÉOGRAPHIQUE: {geo_description}\n"
                           f"DESCRIPTION VISUELLE (CLIENT): {c_loc.get('description_sensorielle', 'Rien de particulier')}")

        else:
            # Fallback : Simulation Serveur
            loc = self.world.get_location(self.current_location_id)
            if not loc:
                loc_context = f"LIEU ACTUEL: Inconnu (ID: {self.current_location_id})."
            elif self.state == NPCState.MOVING:
                dest = self.world.get_location(self.destination_id)
                dest_name = dest.name if dest else "Destination inconnue"
                remaining = int(self.arrival_time - time.time())
                loc_context = f"SITUATION: En voyage vers {dest_name}. Arrivée dans {remaining}s."
            else:
                exits = []
                for lid in loc.connections:
                    t = self.world.get_location(lid)
                    exits.append(t.name if t else lid)
                loc_context = (f"LIEU ACTUEL: {loc.name}. DESCRIPTION: {loc.description}. "
                               f"SORTIES: {', '.join(exits)}.")

        # 2. INVENTAIRE & ÉQUIPEMENT (CLIENT FIRST)
        # Le serveur a son propre inventaire, mais le client a la vérité de l'UI
        inv_context = self.inventory.get_self_context_prompt()

        if client_context and "npc" in client_context:
            c_npc = client_context["npc"]

            # Équipement porté
            if "equipement_reelle" in c_npc:
                inv_context += f"\nCE QUE TU PORTES (VÉRITÉ): {c_npc['equipement_reelle']}"

            # Contenu du sac (NEW)
            if "inventaire_contenu" in c_npc:
                inv_context += f"\nDANS TON SAC (VÉRITÉ): {c_npc['inventaire_contenu']}"

        # 3. JOUEUR
        player_context = "INTERLOCUTEUR: Personne en vue."
        if client_context and "player" in client_context:
            c_player = client_context["player"]

            # Construction détaillée du joueur
            details_joueur = []
            if "equipement_visible" in c_player:
                details_joueur.append(f"Apparence: {c_player['equipement_visible']}")
            if "arme_principale" in c_player:
                details_joueur.append(f"Arme en main: {c_player['arme_principale']}")
            if "sante" in c_player:
                details_joueur.append(f"Santé: {c_player['sante']}")

            player_context = (f"INTERLOCUTEUR: Le joueur est face à vous.\n" + "\n".join(details_joueur))

        elif nearby_player:
            # Fallback serveur
            p_equip = nearby_player.inventory.equipment.get_visible_description()
            player_context = f"INTERLOCUTEUR: Le joueur {nearby_player.name}. Il {p_equip}."

        # 4. Assemblage Final
        return f"""
### VÉRITÉ TERRAIN (Priorité Absolue) ###
IDENTITÉ: {self.name} ({self.persona})
ÉTAT: {self.state.value.upper()}
{loc_context}
{inv_context}
{player_context}
### FIN DES DONNÉES ###
INSTRUCTION: Incarne le personnage. Base ta réponse STRICTEMENT sur l'ANALYSE GÉOGRAPHIQUE et l'INVENTAIRE ci-dessus.
"""