#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pnj_server.py
==============
Serveur local pour les dialogues PNJ de SWORD / Twine.

- Lit l'univers (YAML) dans ./lore/
- Lit les fiches PNJ (JSON) dans ./pnj/
- Reconnaissance sémantique des intentions et émotions du joueur
- Construit un prompt "ultra solide" pour DeepSeek en incarnant complètement le PNJ
- Aucune référence au monde réel : le modèle doit jouer le rôle du PNJ, point.
- Expose :
    * GET  /health  → pour le launcher Qt
    * POST /chat    → pour le JavaScript du jeu (fenêtre de dialogue PNJ)

Dépendances à installer (une fois, côté Python) :
    pip install flask flask-cors pyyaml requests

Configuration DeepSeek via variables d'environnement :
    DEEPSEEK_API_KEY   = "votre_clef_api"
    DEEPSEEK_MODEL     = "deepseek-chat"  (ou autre modèle DeepSeek compatible chat)
"""

import os
import json
import logging
import re
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

import requests
import yaml
from flask import Flask, jsonify, request
from flask_cors import CORS

# ---------------------------------------------------------------------------
# LOGGING
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
)
log = logging.getLogger("pnj_server")

# ---------------------------------------------------------------------------
# CONSTANTES & CONFIG
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
LORE_DIR = BASE_DIR / "lore"
PNJ_DIR = BASE_DIR / "pnj"

DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "").strip()
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat").strip()
DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")

# ---------------------------------------------------------------------------
# CACHES EN MÉMOIRE (évite de relire les fichiers à chaque requête)
# ---------------------------------------------------------------------------
_LORE_CACHE: Dict[str, Dict[str, Any]] = {}
_LORE_RAW_CACHE: Dict[str, str] = {}
_PNJ_CACHE: Dict[str, Dict[str, Any]] = {}


# ---------------------------------------------------------------------------
# RECONNAISSANCE SÉMANTIQUE
# ---------------------------------------------------------------------------

def analyze_semantic_intent(user_message: str, pnj_context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analyse sémantique du message utilisateur pour comprendre l'intention,
    les émotions, et les références contextuelles.
    """
    semantic_prompt = f"""
ANALYSE SÉMANTIQUE - MESSAGE DU JOUEUR
---------------------------------------
PNJ: {pnj_context.get('nom_complet', 'Inconnu')}
Contexte: {pnj_context.get('metier_principal', '')} - {pnj_context.get('origine_geographique', {}).get('region', '')}

Message à analyser: "{user_message}"

INSTRUCTIONS D'ANALYSE:
1. INTENTION PRINCIPALE: [question/information/demande/accusation/compliment/menace/négociation/sociale]
2. ÉMOTION DETECTÉE: [curiosité/colère/joie/tristesse/méfiance/confiance/neutre/surprise/crainte]
3. RÉFÉRENCES IMPORTANTES: [personnes, lieux, objets, événements mentionnés]
4. URGENCE/NIVEAU D'IMPORTANCE: [faible/moyen/élevé]
5. RELATION IMPLIQUÉE: [neutre/amical/hostile/respectueux/méprisant/formel]

Réponds UNIQUEMENT au format JSON:
{{
    "intention": "valeur",
    "emotion": "valeur", 
    "references": ["liste", "d'éléments"],
    "urgence": "faible/moyen/élevé",
    "relation": "valeur"
}}
"""

    try:
        # Appel rapide à l'API pour l'analyse sémantique
        response = requests.post(
            f"{DEEPSEEK_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}"},
            json={
                "model": DEEPSEEK_MODEL,
                "messages": [
                    {"role": "system", "content": semantic_prompt},
                    {"role": "user", "content": "Analyse ce message sémantiquement."}
                ],
                "temperature": 0.1,
                "max_tokens": 300
            },
            timeout=15
        )

        if response.status_code == 200:
            result = response.json()
            analysis_text = result["choices"][0]["message"]["content"]

            # Extraction du JSON depuis la réponse
            json_match = re.search(r'\{.*\}', analysis_text, re.DOTALL)
            if json_match:
                json_str = json_match.group()
                semantic_data = json.loads(json_str)

                # Validation des champs requis
                required_fields = ["intention", "emotion", "urgence", "relation"]
                if all(field in semantic_data for field in required_fields):
                    if "references" not in semantic_data:
                        semantic_data["references"] = []
                    log.info(f"Analyse sémantique réussie: {semantic_data}")
                    return semantic_data

    except Exception as e:
        log.warning(f"Erreur analyse sémantique: {e}")

    # Fallback en cas d'erreur
    fallback_analysis = {
        "intention": "question",
        "emotion": "neutre",
        "references": [],
        "urgence": "moyen",
        "relation": "neutre"
    }
    log.info(f"Analyse sémantique fallback: {fallback_analysis}")
    return fallback_analysis


# ---------------------------------------------------------------------------
# OUTILS DE CHARGEMENT DES FICHIERS
# ---------------------------------------------------------------------------

def _load_yaml_file(path: Path) -> Tuple[Dict[str, Any], str]:
    """
    Charge un fichier YAML et renvoie (données_python, texte_brut).
    Si le YAML est invalide, renvoie {} et le texte brut pour ne pas perdre d'infos.
    """
    try:
        text = path.read_text(encoding="utf-8")
    except Exception as e:
        log.error(f"Erreur lecture YAML {path}: {e}")
        return {}, ""

    try:
        data = yaml.safe_load(text) or {}
    except Exception as e:
        log.error(f"Erreur parse YAML {path}: {e}")
        data = {}

    return data, text


def load_lore() -> Tuple[Dict[str, Dict[str, Any]], Dict[str, str]]:
    """
    Charge tous les fichiers de lore (YAML) du dossier ./lore/

    Retourne :
        (lore_structuré, lore_brut)
        - lore_structuré : {nom_fichier: données_python}
        - lore_brut      : {nom_fichier: texte_complet}
    """
    global _LORE_CACHE, _LORE_RAW_CACHE

    if _LORE_CACHE and _LORE_RAW_CACHE:
        return _LORE_CACHE, _LORE_RAW_CACHE

    lore_structured: Dict[str, Dict[str, Any]] = {}
    lore_raw: Dict[str, str] = {}

    if not LORE_DIR.exists():
        log.warning(f"Dossier lore inexistant : {LORE_DIR}")
        _LORE_CACHE, _LORE_RAW_CACHE = lore_structured, lore_raw
        return lore_structured, lore_raw

    for path in sorted(LORE_DIR.glob("*.yml")) + sorted(LORE_DIR.glob("*.yaml")):
        data, text = _load_yaml_file(path)
        key = path.name
        lore_structured[key] = data
        lore_raw[key] = text

    _LORE_CACHE, _LORE_RAW_CACHE = lore_structured, lore_raw
    log.info(f"Lore chargé : {len(lore_structured)} fichier(s) YAML.")
    return lore_structured, lore_raw


def load_pnj(pnj_id: str) -> Dict[str, Any]:
    """
    Charge la fiche PNJ JSON correspondante dans ./pnj/

    - pnj_id est insensible à la casse.
    - Si aucun fichier ne correspond, lève une ValueError.
    """
    global _PNJ_CACHE
    key = pnj_id.lower()
    if key in _PNJ_CACHE:
        return _PNJ_CACHE[key]

    # Essaye explicitement pnj_id.json puis variations de casse
    candidates = [
        PNJ_DIR / f"{pnj_id}.json",
        PNJ_DIR / f"{pnj_id.lower()}.json",
        PNJ_DIR / f"{pnj_id.capitalize()}.json",
    ]

    chosen: Optional[Path] = None
    for c in candidates:
        if c.exists():
            chosen = c
            break

    if chosen is None:
        # Fallback : scan des fichiers JSON pour un match sans casse
        if not PNJ_DIR.exists():
            raise ValueError(f"Dossier PNJ introuvable : {PNJ_DIR}")

        for path in PNJ_DIR.glob("*.json"):
            if path.stem.lower() == key:
                chosen = path
                break

    if chosen is None or not chosen.exists():
        raise ValueError(f"Aucun fichier PNJ JSON trouvé pour '{pnj_id}' dans {PNJ_DIR}")

    try:
        data = json.loads(chosen.read_text(encoding="utf-8"))
    except Exception as e:
        raise ValueError(f"Erreur lecture JSON PNJ '{pnj_id}': {e}") from e

    _PNJ_CACHE[key] = data
    log.info(f"PNJ chargé : {pnj_id} ({chosen})")
    return data


# ---------------------------------------------------------------------------
# CONSTRUCTION DU PROMPT "ULTRA SOLIDE" POUR UN PNJ
# ---------------------------------------------------------------------------

def _extract_pnj_identity(pnj_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extrait quelques infos clefs de la fiche PNJ (comme dans l'exemple Cyndra.json)
    sans rien supprimer de la structure originale (qui sera de toute façon envoyée en brut).
    """
    pnj = pnj_data.get("pnj", {})
    identite = pnj.get("identite", {})
    perso = pnj.get("personnalite", {})
    meta_jeu = pnj.get("meta_jeu", {})
    histoire = pnj.get("histoire_personnelle", {})
    opinions = pnj.get("opinions_et_croyances", {})
    description = pnj.get("description_narrative", "")

    return {
        "nom": identite.get("nom"),
        "nom_complet": identite.get("nom_complet"),
        "age": identite.get("age"),
        "sexe": identite.get("sexe"),
        "peuple": identite.get("peuple"),
        "origine_geographique": identite.get("origine_geographique"),
        "metier_principal": identite.get("metier_principal"),
        "statut_social": identite.get("statut_social"),
        "traits_principaux": perso.get("traits_principaux"),
        "moralite": perso.get("moralite"),
        "caractere": perso.get("caractere"),
        "humour": perso.get("humour"),
        "reactions_typiques": perso.get("reactions_typiques"),
        "motivations": pnj.get("motivations"),
        "peurs_et_traumas": pnj.get("peurs_et_traumas"),
        "relations": pnj.get("relations"),
        "competences": pnj.get("competences"),
        "opinions_et_croyances": opinions,
        "histoire_personnelle": histoire,
        "description_narrative": description,
        "meta_jeu": meta_jeu,
        "coherence_univers": pnj.get("coherence_univers"),
    }


def build_system_prompt(
        pnj_data: Dict[str, Any],
        lore_structured: Dict[str, Dict[str, Any]],
        lore_raw: Dict[str, str],
        semantic_analysis: Dict[str, Any]
) -> str:
    """
    Construit le prompt système DeepSeek pour incarner *complètement* le PNJ.

    - Inclut TOUTES les données de l'univers (YAML) telles quelles (texte complet).
    - Inclut la fiche PNJ entière (JSON complet) + un extrait synthétique pour aider le modèle.
    - Inclut l'analyse sémantique du message du joueur.
    - Interdit explicitement toute référence au monde réel et toute sortie hors rôle.
    - Style : réponses immersives, 1 à 4 phrases, ton cohérent avec le PNJ.
    """
    pnj_core = _extract_pnj_identity(pnj_data)
    pnj_full_json = json.dumps(pnj_data, ensure_ascii=False, indent=2)
    lore_struct_json = json.dumps(lore_structured, ensure_ascii=False, indent=2)

    nom = pnj_core.get("nom_complet") or pnj_core.get("nom") or "PNJ"
    peuple = pnj_core.get("peuple") or ""
    metier = pnj_core.get("metier_principal") or ""
    origine_geo = pnj_core.get("origine_geographique") or {}
    continent = origine_geo.get("continent") or ""
    region = origine_geo.get("region") or ""
    ville = origine_geo.get("ville_origine") or ""

    meta_jeu = pnj_core.get("meta_jeu") or {}
    role_campagne = meta_jeu.get("role_campagne") or ""
    points_attachement = meta_jeu.get("points_attachement") or []
    conditions_alliance = meta_jeu.get("conditions_alliance") or ""
    secrets_revelables = meta_jeu.get("secrets_revelables") or []

    description_narrative = pnj_core.get("description_narrative") or ""

    # Lore brut : on concatène chaque fichier en gardant l'intégralité
    lore_raw_sections: List[str] = []
    for filename, text in lore_raw.items():
        sep = f"\n\n=== FICHIER LORE : {filename} ===\n"
        lore_raw_sections.append(sep + text.strip() + "\n")

    lore_raw_block = "\n".join(lore_raw_sections)

    # Section analyse sémantique
    semantic_section = f"""
ANALYSE SÉMANTIQUE DU MESSAGE DU JOUEUR
----------------------------------------
Cette analyse te permet de mieux comprendre le contexte émotionnel et l'intention du joueur :

- INTENTION DÉTECTÉE : {semantic_analysis.get('intention', 'question')}
- ÉMOTION PERÇUE : {semantic_analysis.get('emotion', 'neutre')}
- URGENCE : {semantic_analysis.get('urgence', 'moyen')}
- TON DE LA RELATION : {semantic_analysis.get('relation', 'neutre')}
- RÉFÉRENCES MENTIONNÉES : {', '.join(semantic_analysis.get('references', [])) or 'Aucune spécifique'}

UTILISATION DE CETTE ANALYSE :
- Adapte ton ton et ton attitude en fonction de l'émotion détectée
- Réponds à l'intention principale sans forcément la mentionner explicitement
- Prends en compte le niveau d'urgence dans ta réponse
- Utilise les références pour contextualiser ta réponse si nécessaire
"""

    # Prompt très structuré, tout en restant lisible pour le modèle
    system_prompt = f"""
Tu es désormais un personnage non joueur (PNJ) dans un jeu narratif sombre de fantasy médiévale nommé « Velkarum ».

TON RÔLE (IDENTITÉ)
-------------------
Tu incarnes exclusivement le personnage suivant, de manière totale et définitive :

- Nom complet : {nom}
- Peuple : {peuple}
- Métier / rôle : {metier}
- Origine : continent « {continent} », région « {region} », ville d'origine « {ville} »
- Rôle dans la campagne : {role_campagne}
- Points d'attachement majeurs : {points_attachement}
- Conditions d'alliance avec le joueur : {conditions_alliance}
- Secrets potentiellement révélables (progressivement, jamais tous d'un coup) : {secrets_revelables}

DESCRIPTION NARRATIVE DU PERSONNAGE
-----------------------------------
{description_narrative}

{semantic_section}

FICHE PNJ COMPLÈTE (RÉFÉRENCE STRICTE, À RESPECTER)
---------------------------------------------------
Les informations suivantes décrivent intégralement le personnage, sa psychologie, son histoire, ses compétences, ses opinions, ses traumas, son équipement, sa place dans l'univers, etc.
Tu dois t'y conformer strictement. Tu ne dois pas inventer d'éléments qui contredisent explicitement ces données.

[PNJ_JSON_COMPLET]
{pnj_full_json}

UNIVERS DU JEU VELKARUM (LORE STRUCTURÉ)
----------------------------------------
Ces données structurées décrivent la géographie, les peuples, la culture, l'économie, la géopolitique, les mythes et légendes, les aspects sombres, etc. de Velkarum.

[LORE_STRUCTURE]
{lore_struct_json}

UNIVERS DU JEU VELKARUM (LORE BRUT – FICHIERS YAML ENTIER)
----------------------------------------------------------
Tu dois considérer ces fichiers comme la vérité absolue sur l'univers. Tout ce qui n'apparaît pas ici ou dans la fiche PNJ est soit inconnu de ton personnage, soit en dehors de son domaine de connaissance.

[LORE_BRUT_COMPLET]
{lore_raw_block}

CONTRAINTE FONDAMENTALE : AUCUNE RÉFÉRENCE AU MONDE RÉEL
--------------------------------------------------------
Tu ignores totalement l'existence :
- de la Terre, de l'Internet, des pays modernes, des guerres mondiales, des technologies modernes, des IA, de DeepSeek, d'OpenAI, de ChatGPT, etc.
- des lois, religions ou systèmes politiques réels.

Pour toi, seul l'univers de Velkarum existe. Tu ne parles QUE depuis le point de vue de {nom} dans cet univers.
Tu ne mentionnes jamais que tu es une IA, un modèle de langage ou un programme.
Tu ne mentionnes jamais l'existence d'un "joueur" en tant qu'entité réelle : tu t'adresses à lui comme à une personne présente dans ton monde.

STYLE DE RÉPONSE
----------------
- Langue : toujours en français.
- Adresse : tu vouvoies le joueur (« vous »), sauf si la fiche PNJ impose autre chose explicitement.
- Ton : cohérent avec la personnalité, le tempérament, les traumatismes, les motivations et le niveau social du PNJ.
- Longueur : 1 à 4 phrases par réponse, concises mais immersives. Tu peux exceptionnellement faire plus si la situation le justifie vraiment (explication complexe ou scène dramatique).
- Tu parles à la première personne (« je »), comme le ferait le PNJ.
- Tu peux décrire des micro-gestes ou attitudes (soupir, regard, posture) mais toujours à travers ce que le joueur perçoit, pas en voix de narrateur omniscient.

COHÉRENCE, MÉMOIRE & LIMITES
-----------------------------
- Tu respectes toujours :
  - la psyché du personnage (forces, faiblesses, peurs, traumas, humour, réactions typiques) ;
  - ses compétences et limites (pas de puissance magique ou martiale s'il n'en possède pas dans sa fiche) ;
  - son niveau de connaissance du monde (tu ne sais pas tout, tu n'es pas omniscient).
- Si le joueur pose une question à laquelle le PNJ ne peut pas répondre (par manque d'information ou de compétence), tu l'indiques clairement en restant dans le personnage.
- Tu peux faire évoluer progressivement la relation avec le joueur en fonction de l'historique de conversation (confiance, méfiance, agacement, complicité) mais toujours dans les bornes fixées par la fiche PNJ.
- Tu ne révèles pas immédiatement tous les secrets : tu les donnes par fragments, en fonction de la confiance et du contexte.
- Tu restes immersif : pas de méta-commentaires, pas de retour sur les règles du jeu ou sur le système.

GESTION DES DEMANDES "HORS UNIVERS"
-----------------------------------
Si le joueur te pose des questions manifestement hors univers (ex : parle d'Internet, d'IA, de DeepSeek, de la Chine, d'un jeu vidéo, du code, de la programmation, etc.) :
- tu restes dans le personnage ;
- tu peux considérer que ce sont des paroles incohérentes, des visions, ou des notions qui n'existent pas dans ton monde ;
- tu réponds en restant in-universe, en détournant la discussion vers des éléments cohérents pour ton personnage.

HISTORIQUE DE CONVERSATION
--------------------------
L'historique suivant contient les derniers échanges entre toi (le PNJ) et le joueur.
Tu dois t'en servir pour garder la continuité du ton, des non-dits, des promesses, des tensions et de l'évolution de la relation.

[REMARQUE IMPORTANTE]
- Cet historique est déjà intégré dans les messages précédents de la conversation envoyés à l'API.
- Tu dois simplement continuer la conversation de manière cohérente.

RÉSUMÉ FINAL DE TON OBJECTIF
----------------------------
Tu es {nom}, un PNJ complet et cohérent de l'univers de Velkarum.
Tu réponds au joueur comme si vous étiez en face à face dans cet univers, en respectant :
- la fiche PNJ complète,
- l'intégralité du lore fourni,
- l'analyse sémantique du message du joueur,
- l'historique de la conversation,
- le ton et les limites de tes connaissances.

Tu réponds maintenant au joueur, dans le style et le rôle de {nom}, sans jamais sortir de ce personnage.
""".strip()

    return system_prompt


# ---------------------------------------------------------------------------
# APPEL API DEEPSEEK
# ---------------------------------------------------------------------------

class DeepSeekClient:
    """
    Client minimal pour l'API DeepSeek /chat/completions (format OpenAI-like).
    """

    def __init__(self, api_key: str, base_url: str, model: str):
        if not api_key:
            raise RuntimeError(
                "DEEPSEEK_API_KEY manquante. "
                "Définissez la variable d'environnement DEEPSEEK_API_KEY."
            )
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model

    def chat_completion(
            self,
            system_prompt: str,
            user_message: str,
            history: Optional[List[Dict[str, str]]] = None,
            temperature: float = 0.7,
            top_p: float = 0.9,
            max_tokens: int = 256,
    ) -> str:
        """
        Envoie une requête de chat à DeepSeek.

        history (optionnelle) : liste [{role: "user"/"assistant", content: "..."}]
        Ces messages sont injectés entre le système et le dernier message de l'utilisateur.
        """
        messages: List[Dict[str, str]] = [
            {"role": "system", "content": system_prompt}
        ]

        # Historique éventuel (déjà compressé côté jeu)
        if history:
            for msg in history:
                r = msg.get("role")
                c = msg.get("content")
                if not r or not c:
                    continue
                if r not in ("user", "assistant"):
                    continue
                messages.append({"role": r, "content": c})

        # Dernier message du joueur
        messages.append({"role": "user", "content": user_message})

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": float(temperature),
            "top_p": float(top_p),
            "max_tokens": int(max_tokens),
        }

        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        log.debug("Appel DeepSeek: %s", url)
        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=60)
        except requests.RequestException as e:
            log.error(f"Erreur réseau DeepSeek: {e}")
            raise RuntimeError(f"Erreur réseau vers DeepSeek: {e}") from e

        if resp.status_code >= 400:
            log.error("Erreur DeepSeek (%s): %s", resp.status_code, resp.text)
            raise RuntimeError(f"Erreur API DeepSeek {resp.status_code}: {resp.text}")

        try:
            data = resp.json()
        except Exception as e:
            log.error("Réponse JSON invalide DeepSeek: %s", e)
            raise RuntimeError("Réponse DeepSeek invalide (JSON).") from e

        try:
            reply = data["choices"][0]["message"]["content"]
        except Exception:
            log.error("Structure de réponse inattendue: %s", data)
            raise RuntimeError("Structure de réponse DeepSeek inattendue.")

        return reply.strip()


# ---------------------------------------------------------------------------
# FLASK APP
# ---------------------------------------------------------------------------

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# Client DeepSeek global (créé au démarrage si possible)
_deepseek_client: Optional[DeepSeekClient] = None
_deepseek_init_error: Optional[str] = None

try:
    _deepseek_client = DeepSeekClient(
        api_key=DEEPSEEK_API_KEY,
        base_url=DEEPSEEK_BASE_URL,
        model=DEEPSEEK_MODEL,
    )
    log.info("Client DeepSeek initialisé avec le modèle '%s'.", DEEPSEEK_MODEL)
except Exception as e:
    _deepseek_init_error = str(e)
    log.error("Impossible d'initialiser DeepSeekClient: %s", e)


# ---------------------------------------------------------------------------
# ROUTE /health – utilisée par le launcher Qt (Game.html)
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    lore_struct, lore_raw = load_lore()
    pnj_files = []
    if PNJ_DIR.exists():
        pnj_files = [p.name for p in PNJ_DIR.glob("*.json")]

    return jsonify({
        "status": "ok" if _deepseek_client and not _deepseek_init_error else "degraded",
        "deepseek_model": DEEPSEEK_MODEL,
        "deepseek_ready": _deepseek_client is not None and not _deepseek_init_error,
        "deepseek_error": _deepseek_init_error,
        "lore_files_count": len(lore_struct),
        "lore_files": list(lore_struct.keys()),
        "pnj_files": pnj_files,
        "semantic_analysis": True,  # Indique que la reconnaissance sémantique est active
    })


# ---------------------------------------------------------------------------
# ROUTE /chat – pour parler à un PNJ
# ---------------------------------------------------------------------------
"""
Contrat JSON attendu (POST /chat):

Request (application/json) :
{
  "pnj_id": "Cyndra",                // ID logique du PNJ (assoc. au fichier Cyndra.json)
  "player_message": "votre texte",   // Dernier message du joueur
  "history": [                       // (optionnel) historique compressé côté jeu
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ],
  "temperature": 0.7,                // (optionnel)
  "top_p": 0.9,                      // (optionnel)
  "max_tokens": 256                  // (optionnel)
}

Response (application/json) :
{
  "ok": true,
  "pnj_id": "Cyndra",
  "reply": "réponse du PNJ en texte brut",
  "semantic_analysis": { ... },      // Analyse sémantique du message
  "error": null
}

En cas d'erreur :
{
  "ok": false,
  "pnj_id": "Cyndra",
  "reply": null,
  "semantic_analysis": null,
  "error": "message d'erreur lisible"
}
"""


@app.post("/chat")
def chat():
    if not request.is_json:
        return jsonify({
            "ok": False,
            "pnj_id": None,
            "reply": None,
            "semantic_analysis": None,
            "error": "Corps de requête JSON attendu."
        }), 400

    data = request.get_json(force=True) or {}

    pnj_id = data.get("pnj_id")
    player_message = data.get("player_message")
    history = data.get("history") or []
    temperature = data.get("temperature", 0.7)
    top_p = data.get("top_p", 0.9)
    max_tokens = data.get("max_tokens", 256)

    if not pnj_id or not isinstance(pnj_id, str):
        return jsonify({
            "ok": False,
            "pnj_id": pnj_id,
            "reply": None,
            "semantic_analysis": None,
            "error": "Champ 'pnj_id' manquant ou invalide."
        }), 400

    if not player_message or not isinstance(player_message, str):
        return jsonify({
            "ok": False,
            "pnj_id": pnj_id,
            "reply": None,
            "semantic_analysis": None,
            "error": "Champ 'player_message' manquant ou invalide."
        }), 400

    if _deepseek_client is None:
        return jsonify({
            "ok": False,
            "pnj_id": pnj_id,
            "reply": None,
            "semantic_analysis": None,
            "error": _deepseek_init_error or "Client DeepSeek non initialisé."
        }), 500

    try:
        # 1. Charger le lore complet (structuré + brut)
        lore_struct, lore_raw = load_lore()

        # 2. Charger les données complètes du PNJ
        pnj_data = load_pnj(pnj_id)
        pnj_core = _extract_pnj_identity(pnj_data)

        # 3. ANALYSE SÉMANTIQUE du message du joueur
        semantic_analysis = analyze_semantic_intent(player_message, pnj_core)

        # 4. Construire le prompt système avec l'analyse sémantique
        system_prompt = build_system_prompt(pnj_data, lore_struct, lore_raw, semantic_analysis)

        # 5. Appeler DeepSeek
        reply = _deepseek_client.chat_completion(
            system_prompt=system_prompt,
            user_message=player_message,
            history=history,
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
        )

        return jsonify({
            "ok": True,
            "pnj_id": pnj_id,
            "reply": reply,
            "semantic_analysis": semantic_analysis,  # Retourne l'analyse au client
            "error": None
        })

    except ValueError as e:
        # Erreur liée au PNJ (fichier manquant, JSON invalide, etc.)
        log.error("Erreur PNJ '%s': %s", pnj_id, e)
        return jsonify({
            "ok": False,
            "pnj_id": pnj_id,
            "reply": None,
            "semantic_analysis": None,
            "error": f"Erreur PNJ '{pnj_id}': {e}"
        }), 400

    except RuntimeError as e:
        # Erreur DeepSeek ou interne "contrôlée"
        log.error("Erreur runtime pour PNJ '%s': %s", pnj_id, e)
        return jsonify({
            "ok": False,
            "pnj_id": pnj_id,
            "reply": None,
            "semantic_analysis": None,
            "error": str(e)
        }), 502

    except Exception as e:
        # Erreur inattendue
        log.exception("Erreur inattendue /chat pour PNJ '%s': %s", pnj_id, e)
        return jsonify({
            "ok": False,
            "pnj_id": pnj_id,
            "reply": None,
            "semantic_analysis": None,
            "error": "Erreur interne serveur."
        }), 500


# ---------------------------------------------------------------------------
# POINT D'ENTRÉE
# ---------------------------------------------------------------------------

def main():
    """
    Lance le serveur Flask sur 127.0.0.1:5001 (port attendu par le launcher / Twine).
    """
    host = os.environ.get("PNJ_SERVER_HOST", "127.0.0.1")
    port_str = os.environ.get("PNJ_SERVER_PORT", "5001")

    try:
        port = int(port_str)
    except ValueError:
        port = 5001

    log.info("Démarrage pnj_server sur %s:%s (DeepSeek modèle: %s) - Reconnaissance sémantique ACTIVÉE", host, port,
             DEEPSEEK_MODEL)
    app.run(host=host, port=port)


if __name__ == "__main__":
    main()