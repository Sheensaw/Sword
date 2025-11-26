#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os
import sys
import logging
import traceback
from flask import Flask, jsonify, request, make_response
from flask_cors import CORS
import requests

# ---------------------------------------------------------------------------
# 1. CONFIGURATION LOGGING & CHEMINS
# ---------------------------------------------------------------------------
# On s'assure que le dossier courant est dans le PATH pour les imports
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s – %(message)s"
)
log = logging.getLogger("pnj_server")

# ---------------------------------------------------------------------------
# 2. CHARGEMENT SÉCURISÉ DU MOTEUR DE JEU
# ---------------------------------------------------------------------------
GAME_ENGINE = None
ENGINE_ERROR = None

try:
    log.info(f"📂 Dossier de travail : {current_dir}")

    # Vérification des dépendances critiques avant l'import
    import pydantic

    log.info(f"✅ Pydantic version: {pydantic.VERSION}")

    # Import du moteur
    log.info("🔄 Tentative d'import de game_server...")
    from game_server import NPCServer

    log.info("🚀 Initialisation du NPCServer...")
    GAME_ENGINE = NPCServer()
    log.info(f"✅ Moteur de jeu DÉMARRÉ avec succès. ({len(GAME_ENGINE.npcs)} PNJ chargés)")

except ImportError as e:
    ENGINE_ERROR = f"Erreur d'import : {e}"
    log.critical("❌ IMPOSSIBLE D'IMPORTER LE MOTEUR DE JEU")
    log.critical("Vérifiez que 'game_server.py', 'core_models.py' et 'npc_agent.py' sont dans le même dossier.")
    log.critical(f"Détail: {e}")

except Exception as e:
    ENGINE_ERROR = f"Crash au démarrage : {e}"
    log.critical("❌ CRASH CRITIQUE DU MOTEUR")
    log.critical(traceback.format_exc())

# ---------------------------------------------------------------------------
# 3. CONFIGURATION CLIENT IA
# ---------------------------------------------------------------------------
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "").strip()
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat").strip()
DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")


class DeepSeekClient:
    def __init__(self, api_key, base_url, model):
        self.api_key = api_key
        self.base_url = base_url
        self.model = model

    def chat_completion(self, system_prompt, user_message, history):
        if not self.api_key:
            return "⚠️ IA non configurée (API Key manquante dans les variables d'environnement)."

        messages = [{"role": "system", "content": system_prompt}]
        if history:
            for msg in history:
                if msg.get("content"):
                    messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": user_message})

        try:
            resp = requests.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={"model": self.model, "messages": messages, "temperature": 0.7, "max_tokens": 350},
                timeout=30
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"].strip()
        except Exception as e:
            log.error(f"Erreur IA: {e}")
            return f"(Erreur de connexion IA: {str(e)})"


_client = DeepSeekClient(DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL)

# ---------------------------------------------------------------------------
# 4. SERVEUR FLASK
# ---------------------------------------------------------------------------
app = Flask(__name__)
# CORS permissif pour éviter les erreurs "Failed to fetch"
CORS(app, resources={r"/*": {"origins": "*"}})


@app.route("/", methods=["GET"])
def index():
    """Page d'accueil de diagnostic"""
    status_color = "green" if GAME_ENGINE else "red"
    status_text = "EN LIGNE" if GAME_ENGINE else "ERREUR"

    html = f"""
    <div style="font-family:sans-serif; padding:20px;">
        <h1>Serveur PNJ : <span style="color:{status_color}">{status_text}</span></h1>
        <p><strong>Moteur de jeu :</strong> {'Chargé' if GAME_ENGINE else 'Non chargé'}</p>
    """

    if GAME_ENGINE:
        html += f"<p><strong>PNJ Actifs :</strong> {len(GAME_ENGINE.npcs)}</p>"
        html += "<ul>"
        for pid, npc in list(GAME_ENGINE.npcs.items())[:10]:
            html += f"<li>{npc.name} ({npc.current_location_id})</li>"
        html += "</ul>"
        if len(GAME_ENGINE.npcs) > 10: html += "<p>...</p>"
    else:
        html += f"<div style='background:#fee; border:1px solid red; padding:10px; white-space:pre-wrap;'>{ENGINE_ERROR}</div>"
        html += "<p>Vérifiez la console Python pour les détails du crash.</p>"

    html += "</div>"
    return html


@app.route("/ping", methods=["GET"])
def ping():
    return jsonify({
        "status": "pong",
        "engine_ready": GAME_ENGINE is not None,
        "error": ENGINE_ERROR
    })


@app.route("/health", methods=["GET"])
def health():
    if not GAME_ENGINE:
        return jsonify({"status": "error", "message": ENGINE_ERROR}), 500
    return jsonify({"status": "ok", "npcs": len(GAME_ENGINE.npcs)})


@app.route("/chat", methods=["POST"])
def chat():
    # Si le moteur n'est pas prêt, on renvoie une erreur JSON propre au lieu de laisser la connexion mourir
    if not GAME_ENGINE:
        return jsonify({
            "ok": False,
            "error": f"Serveur de jeu non démarré: {ENGINE_ERROR}"
        }), 500

    try:
        data = request.get_json(force=True)
    except Exception:
        return jsonify({"ok": False, "error": "JSON invalide"}), 400

    pnj_id = data.get("pnj_id")
    msg = data.get("player_message")
    history = data.get("history", [])
    game_context = data.get("game_context") or {}

    if not pnj_id or not msg:
        return jsonify({"ok": False, "error": "Paramètres manquants"}), 400

    try:
        # 1. Mise à jour du temps
        GAME_ENGINE.server_tick()

        # 2. Génération du prompt (Avec le contexte client)
        system_prompt = GAME_ENGINE.get_safe_system_prompt(
            pnj_id,
            "player_1",
            client_context=game_context
        )

        # Log
        loc_info = game_context.get('location', {}).get('nom_visuel', 'Inconnu')
        log.info(f"💬 Chat avec {pnj_id} @ {loc_info}")

        # 3. Appel IA
        reply = _client.chat_completion(system_prompt, msg, history)

        return jsonify({
            "ok": True,
            "reply": reply,
            "debug_context": system_prompt
        })

    except Exception as e:
        log.error(f"ERREUR ROUTE CHAT: {e}")
        log.error(traceback.format_exc())
        return jsonify({"ok": False, "error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PNJ_SERVER_PORT", 5001))
    print(f"\n{'=' * 40}")
    print(f"✅ SERVEUR PNJ DÉMARRÉ SUR LE PORT {port}")
    print(f"👉 DIAGNOSTIC : http://127.0.0.1:{port}/")
    print(f"{'=' * 40}\n")

    # use_reloader=False pour éviter les boucles de redémarrage infinies en cas d'erreur d'import
    try:
        app.run(host="0.0.0.0", port=port, threaded=True, use_reloader=False)
    except Exception as e:
        print(f"❌ ERREUR FATALE FLASK: {e}")