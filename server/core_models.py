import uuid
import logging
from enum import Enum
from typing import List, Dict, Optional, Any, Tuple
from pydantic import BaseModel, Field

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - [CORE] %(message)s')
logger = logging.getLogger("CoreSystems")


# --- ÉNUMÉRATIONS ET TYPES ---
class ItemType(str, Enum):
    WEAPON = "arme"
    ARMOR = "armure"
    CLOTHING = "vêtement"
    CONSUMABLE = "consommable"
    KEY = "clé"
    MISC = "divers"


class EquipmentSlot(str, Enum):
    HEAD = "tête"
    BODY = "corps"
    MAIN_HAND = "main_droite"
    OFF_HAND = "main_gauche"
    FEET = "pieds"
    NONE = "aucun"  # Pour les objets dans le sac


# --- MODÈLES DE DONNÉES (OBJETS) ---
class GameItem(BaseModel):
    """
    Représente un objet unique dans le monde du jeu.
    L'utilisation de Pydantic garantit que chaque objet créé respecte la structure.
    """
    item_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    item_type: ItemType
    valid_slots: List[EquipmentSlot] = Field(default_factory=list)
    weight: float = 1.0
    attributes: Dict[str, Any] = Field(default_factory=dict)
    durability: int = 100
    is_quest_item: bool = False

    def to_context_string(self) -> str:
        """Génère une description en langage naturel pour le prompt système."""
        details = []
        if self.attributes.get("damage"):
            details.append(f"Dégâts: {self.attributes['damage']}")
        if self.attributes.get("protection"):
            details.append(f"Protection: {self.attributes['protection']}")

        detail_str = f" ({', '.join(details)})" if details else ""
        return f"[{self.name}]{detail_str} : {self.description}"


class EquipmentLoadout(BaseModel):
    """
    Gère les emplacements actifs d'un personnage (PJ ou PNJ).
    Reflète ce qui est visible publiquement.
    """
    head: Optional[GameItem] = None
    body: Optional[GameItem] = None
    main_hand: Optional[GameItem] = None
    off_hand: Optional[GameItem] = None
    feet: Optional[GameItem] = None

    def get_visible_description(self) -> str:
        """Génère le contexte visuel pour les autres personnages."""
        parts = []
        if self.head: parts.append(f"porte {self.head.name} sur la tête")
        if self.body: parts.append(f"est vêtu de {self.body.name}")
        if self.main_hand: parts.append(f"tient {self.main_hand.name} dans la main droite")
        if self.off_hand: parts.append(f"tient {self.off_hand.name} dans la main gauche")

        if not parts:
            return "porte des vêtements simples sans équipement notable"
        return ", ".join(parts)


# --- GESTIONNAIRE D'INVENTAIRE ---
class InventoryManager:
    """
    Cerveau logique de la gestion d'objets.
    Empêche les actions illégales (poids négatif, double équipement).
    """

    def __init__(self, capacity: float = 50.0):
        self.capacity = capacity
        self.current_weight = 0.0
        self.backpack: List[GameItem] = []
        self.equipment = EquipmentLoadout()

    def add_item(self, item: GameItem) -> bool:
        if self.current_weight + item.weight > self.capacity:
            logger.warning(f"Inventaire plein. Impossible d'ajouter {item.name}")
            return False
        self.backpack.append(item)
        self.current_weight += item.weight
        return True

    def remove_item(self, item_id: str) -> Optional[GameItem]:
        for i, item in enumerate(self.backpack):
            if item.item_id == item_id:
                self.current_weight -= item.weight
                return self.backpack.pop(i)
        return None

    def equip_item(self, item_id: str, slot: EquipmentSlot) -> bool:
        """Transfère un objet du sac vers un slot d'équipement actif."""
        target_item = next((i for i in self.backpack if i.item_id == item_id), None)
        if not target_item:
            logger.error(f"Objet {item_id} non trouvé dans le sac.")
            return False

        if slot not in target_item.valid_slots:
            logger.warning(f"Impossible d'équiper {target_item.name} sur {slot}. Valides: {target_item.valid_slots}")
            return False

        field_name = slot.name.lower()
        if hasattr(self.equipment, field_name):
            current_equipped = getattr(self.equipment, field_name)
            if current_equipped:
                self.unequip_item(slot)

        if hasattr(self.equipment, field_name):
            setattr(self.equipment, field_name, target_item)
            self.backpack.remove(target_item)
            logger.info(f"Objet {target_item.name} équipé sur {slot.value}")
            return True
        return False

    def unequip_item(self, slot: EquipmentSlot) -> bool:
        field_name = slot.name.lower()
        if not hasattr(self.equipment, field_name): return False

        item = getattr(self.equipment, field_name)
        if item:
            if self.add_item(item):  # Remettre dans le sac (vérifie le poids)
                setattr(self.equipment, field_name, None)
                return True
            else:
                logger.warning("Pas assez de place dans le sac pour déséquiper.")
                return False
        return False

    def get_self_context_prompt(self) -> str:
        """Retourne la perception que le PNJ a de son propre équipement."""
        equipped = self.equipment.get_visible_description()

        if not self.backpack:
            bag_desc = "Votre sac à dos est vide."
        else:
            items_desc = ", ".join([i.name for i in self.backpack])
            bag_desc = f"Dans votre sac à dos, vous sentez le poids de : {items_desc}."

        return f"ÉTAT ÉQUIPEMENT : Vous {equipped}. {bag_desc}"


# --- SYSTÈME SPATIAL ET GRAPHE ---
class LocationConnection(BaseModel):
    target_loc_id: str
    travel_time_seconds: int
    is_locked: bool = False
    key_id_required: Optional[str] = None


class Location(BaseModel):
    loc_id: str
    name: str
    description: str
    # AJOUT : Coordonnées physiques pour synchronisation avec JS
    x: float = 0.0
    y: float = 0.0
    continent: str = "Eldaron"

    connections: Dict[str, LocationConnection] = Field(default_factory=dict)
    ground_items: List[GameItem] = Field(default_factory=list)

    def add_connection(self, target_id: str, time_sec: int, locked: bool = False, key_id: str = None):
        self.connections[target_id] = LocationConnection(
            target_loc_id=target_id,
            travel_time_seconds=time_sec,
            is_locked=locked,
            key_id_required=key_id
        )


class WorldGraph:
    """
    La Vérité Terrain de la géographie du jeu.
    Gère le pathfinding (recherche de chemin) et la validation des déplacements.
    """

    def __init__(self):
        self.locations: Dict[str, Location] = {}

    def add_location(self, loc: Location):
        self.locations[loc.loc_id] = loc

    def get_location(self, loc_id: str) -> Optional[Location]:
        return self.locations.get(loc_id)

    def get_travel_cost(self, start_id: str, end_id: str) -> Optional[int]:
        """
        Vérifie si un voyage direct est possible et retourne le coût en temps.
        Retourne None si pas de connexion directe.
        """
        start_node = self.locations.get(start_id)
        if not start_node: return None

        conn = start_node.connections.get(end_id)
        if conn and not conn.is_locked:
            return conn.travel_time_seconds
        return None

    def unlock_path(self, start_id: str, end_id: str, key_item: GameItem) -> bool:
        """Tentative de déverrouillage d'un passage."""
        loc = self.locations.get(start_id)
        if loc and end_id in loc.connections:
            conn = loc.connections[end_id]
            if conn.is_locked and conn.key_id_required == key_item.item_id:
                conn.is_locked = False
                return True
        return False

    def find_nearest_location(self, x: float, y: float, continent: str) -> Tuple[Optional[Location], float]:
        """
        Trouve le lieu connu le plus proche des coordonnées données (GPS Serveur).
        C'est CRITIQUE pour ancrer le PNJ quand le client est dans une zone 'vide'.
        """
        best_loc = None
        min_dist = float('inf')

        for loc in self.locations.values():
            # On filtre grossièrement par continent pour éviter les aberrations
            if loc.continent.lower() != continent.lower():
                continue

            # Distance euclidienne simple
            dist = ((loc.x - x) ** 2 + (loc.y - y) ** 2) ** 0.5

            if dist < min_dist:
                min_dist = dist
                best_loc = loc

        return best_loc, min_dist