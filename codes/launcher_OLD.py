#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SWORD - Lanceur du jeu Twine
Version modifiée pour injection dynamique de JavaScript.js ET CSS.css
"""
import sys
import logging
import json  # Nécessaire pour encoder le CSS vers le JS en toute sécurité
from pathlib import Path

from PySide6.QtCore import Qt, QUrl, QPoint
from PySide6.QtGui import QGuiApplication, QKeySequence, QAction, QCursor, QColor
from PySide6.QtWidgets import QApplication, QMainWindow, QMessageBox
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineSettings, QWebEngineProfile, QWebEngineScript


# ------------------------------------------------------
# CAPTURE DES LOGS JAVASCRIPT
# ------------------------------------------------------
class JSPage(QWebEnginePage):
    def javaScriptConsoleMessage(self, level, message, line, sourceID):
        # On nettoie un peu les logs pour ne garder que le nom du fichier
        source = Path(sourceID).name if sourceID else "Internal"

        if level == QWebEnginePage.InfoMessageLevel:
            logging.info(f"[JS INFO] {message}")
        elif level == QWebEnginePage.WarningMessageLevel:
            logging.warning(f"[JS WARN] {message} ({source}:{line})")
        elif level == QWebEnginePage.ErrorMessageLevel:
            logging.error(f"[JS ERROR] {message} ({source}:{line})")
        else:
            logging.debug(f"[JS LOG] {message}")


# ------------------------------------------------------
# CONFIGURATION DU LOGGING AVEC COULEURS
# ------------------------------------------------------
class ColorFormatter(logging.Formatter):
    """Formatter pour ajouter des couleurs aux logs"""
    COLORS = {
        'DEBUG': '\033[36m',  # Cyan
        'INFO': '\033[32m',  # Vert
        'WARNING': '\033[33m',  # Jaune
        'ERROR': '\033[31m',  # Rouge
        'CRITICAL': '\033[41m',  # Fond rouge
        'RESET': '\033[0m'  # Reset
    }

    def format(self, record):
        log_message = super().format(record)
        if record.levelname in self.COLORS:
            return f"{self.COLORS[record.levelname]}{log_message}{self.COLORS['RESET']}"
        return log_message


# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

for handler in logging.getLogger().handlers:
    handler.setFormatter(ColorFormatter("%(asctime)s - %(levelname)s - %(message)s"))

logger = logging.getLogger("SWORD")


# ------------------------------------------------------
# CLASSE PRINCIPALE DU JEU
# ------------------------------------------------------
class SwordGame(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("SWORD - Dev Launcher")

        # Chemins des fichiers
        base_path = Path(__file__).resolve().parent
        self.html_path = base_path / "Game.html"
        self.js_path = base_path / "JavaScript.js"
        self.css_path = base_path / "CSS.css"  # Nouveau fichier CSS

        # Vue WebEngine + page JS custom
        self.view = QWebEngineView(self)
        self.js_page = JSPage(self.view)
        self.view.setPage(self.js_page)

        self.view.setContextMenuPolicy(Qt.NoContextMenu)
        self.js_page.setBackgroundColor(QColor("#111111"))  # Fond sombre
        self.view.setVisible(False)
        self.setCentralWidget(self.view)

        # Configuration WebEngine
        self._setup_web_engine()

        # Connexions
        self._connect_signals()

        # Injection initiale des scripts (JS + CSS) et chargement
        self.inject_game_scripts()
        self.load_game()

        # Raccourcis clavier
        self._add_shortcuts()

        # Centrage fenêtre
        self.center_on_active_screen()

        # Affichage
        self.show()

    # --------------------------------------------------
    def _setup_web_engine(self):
        """Configuration complète du moteur WebEngine"""
        profile = QWebEngineProfile.defaultProfile()
        profile.setHttpCacheType(QWebEngineProfile.NoCache)
        profile.setPersistentCookiesPolicy(QWebEngineProfile.NoPersistentCookies)

        # Paramètres globaux
        settings = profile.settings()
        settings.setAttribute(QWebEngineSettings.LocalContentCanAccessRemoteUrls, True)
        settings.setAttribute(QWebEngineSettings.LocalContentCanAccessFileUrls, True)
        settings.setAttribute(QWebEngineSettings.JavascriptEnabled, True)
        settings.setAttribute(QWebEngineSettings.LocalStorageEnabled, True)
        settings.setAttribute(QWebEngineSettings.PlaybackRequiresUserGesture, False)
        settings.setAttribute(QWebEngineSettings.WebGLEnabled, True)

        # Format fenêtre
        self.view.setZoomFactor(1.0)
        self.resize(1280, 960)

    # --------------------------------------------------
    def inject_game_scripts(self):
        """
        Lit JavaScript.js et CSS.css, prépare le code d'injection, et l'insère dans la page.
        """

        # --- 1. LECTURE DU FICHIER JAVASCRIPT ---
        raw_js_code = ""
        if self.js_path.exists():
            try:
                with open(self.js_path, "r", encoding="utf-8") as f:
                    raw_js_code = f.read()
            except Exception as e:
                logger.error(f"❌ Erreur lecture JavaScript.js : {e}")
        else:
            logger.error(f"❌ Fichier JavaScript.js introuvable : {self.js_path}")

        # --- 2. LECTURE DU FICHIER CSS ---
        css_injection_code = ""
        if self.css_path.exists():
            try:
                with open(self.css_path, "r", encoding="utf-8") as f:
                    raw_css = f.read()
                    # On transforme le CSS en chaîne JS valide (échappement des guillemets et sauts de ligne)
                    js_css_string = json.dumps(raw_css)

                    css_injection_code = f"""
                    try {{
                        var cssContent = {js_css_string};
                        var styleId = 'external-css-layer';
                        var existingStyle = document.getElementById(styleId);
                        if (existingStyle) {{ existingStyle.remove(); }}

                        var styleElement = document.createElement('style');
                        styleElement.id = styleId;
                        styleElement.type = 'text/css';
                        styleElement.textContent = cssContent;
                        document.head.appendChild(styleElement);
                        console.log("[Launcher] CSS injected successfully (" + cssContent.length + " chars).");
                    }} catch(e) {{
                        console.error("[Launcher] CSS Injection failed:", e);
                    }}
                    """
            except Exception as e:
                logger.error(f"❌ Erreur lecture CSS.css : {e}")
        else:
            logger.warning(f"⚠️ Fichier CSS.css introuvable : {self.css_path}")

        # --- 3. CONSTRUCTION DU WRAPPER FINAL ---
        try:
            # Nettoyage des scripts précédents
            self.view.page().scripts().clear()

            # Wrapper global qui attend SugarCube
            wrapped_code = f"""
            (function() {{
                console.log("[Launcher] Waiting for SugarCube engine...");
                var attempts = 0;

                var checkReady = setInterval(function() {{
                    if (window.SugarCube && window.SugarCube.Macro) {{
                        clearInterval(checkReady);
                        console.log("[Launcher] SugarCube detected. Starting injection sequence...");

                        // A. INJECTION DU CSS (En premier pour le visuel)
                        {css_injection_code}

                        // B. EXPORTATION DES GLOBALES (Polyfill critique pour Wikifier)
                        console.log("[Launcher] Polyfilling globals...");

                        window.Macro = window.SugarCube.Macro;
                        window.State = window.SugarCube.State;
                        window.Story = window.SugarCube.Story;
                        window.Engine = window.SugarCube.Engine;
                        window.Config = window.SugarCube.Config;
                        window.Wikifier = window.SugarCube.Wikifier;    // <--- CRUCIAL
                        window.Dialog = window.SugarCube.Dialog;        // Pour les popups
                        window.UI = window.SugarCube.UI;                // Pour l'interface
                        window.Save = window.SugarCube.Save;            // Pour les sauvegardes
                        window.Setting = window.SugarCube.Setting;      // Pour les réglages
                        window.SimpleAudio = window.SugarCube.SimpleAudio; // Pour l'audio

                        if (!window.setup) window.setup = {{}};

                        // C. EXÉCUTION DU CODE JAVASCRIPT UTILISATEUR
                        try {{
                            console.log("[Launcher] Executing JavaScript.js...");
                            {raw_js_code}
                            console.log("[Launcher] JavaScript.js executed successfully.");
                        }} catch (e) {{
                            console.error("[Launcher] CRITICAL ERROR executing user scripts:", e);
                        }}

                    }} else {{
                        attempts++;
                        if (attempts > 300) {{ 
                            clearInterval(checkReady);
                            console.error("[Launcher] TIMEOUT: SugarCube engine never loaded.");
                        }}
                    }}
                }}, 10); // Vérifie toutes les 10ms
            }})();
            """

            # Création et insertion du script
            script = QWebEngineScript()
            script.setSourceCode(wrapped_code)
            script.setName("InjectedGameLogicAndCSS")
            script.setWorldId(QWebEngineScript.ScriptWorldId.MainWorld)
            script.setInjectionPoint(QWebEngineScript.InjectionPoint.DocumentReady)
            script.setRunsOnSubFrames(False)

            self.view.page().scripts().insert(script)
            logger.info(f"💉 Scripts injectés (JS + CSS)")

        except Exception as e:
            logger.error(f"❌ Erreur fatale lors de l'injection : {e}")

    # --------------------------------------------------
    def _connect_signals(self):
        self.view.loadFinished.connect(self.on_load_finished)

    # --------------------------------------------------
    def center_on_active_screen(self):
        app = QGuiApplication.instance()
        screen = app.screenAt(QCursor.pos()) or app.primaryScreen()
        geometry = screen.availableGeometry()
        x = geometry.x() + (geometry.width() - self.width()) // 2
        y = geometry.y() + (geometry.height() - self.height()) // 2
        self.move(QPoint(x, y))

    # --------------------------------------------------
    def load_game(self):
        if not self.html_path.exists():
            QMessageBox.critical(self, "Erreur", f"Game.html introuvable :\n{self.html_path}")
            sys.exit(1)

        url = QUrl.fromLocalFile(str(self.html_path))
        self.view.load(url)
        logger.info(f"🎮 Chargement du fichier HTML : {self.html_path.name}")

    # --------------------------------------------------
    def on_load_finished(self, ok: bool):
        if ok:
            self.view.setVisible(True)
            logger.info("✅ Page chargée avec succès")
        else:
            logger.error("❌ Échec du chargement de la page")

    # --------------------------------------------------
    def reload_full_game(self):
        """Recharge le JS et le CSS depuis le disque et recharge la page"""
        logger.info("-" * 40)
        logger.info("🔄 RECHARGEMENT COMPLET (F5)")
        self.inject_game_scripts()
        self.view.page().profile().clearHttpCache()
        self.view.triggerPageAction(QWebEnginePage.Reload)

    # --------------------------------------------------
    def _add_shortcuts(self):
        # Échap → Quitter
        quit_act = QAction(self)
        quit_act.setShortcut(QKeySequence(Qt.Key_Escape))
        quit_act.triggered.connect(self.close)
        self.addAction(quit_act)

        # F5 → Reload (HTML + JS + CSS externes)
        reload_act = QAction(self)
        reload_act.setShortcut(QKeySequence(Qt.Key_F5))
        reload_act.triggered.connect(self.reload_full_game)
        self.addAction(reload_act)

        # F11 → Plein écran
        toggle_fs = QAction(self)
        toggle_fs.setShortcut(QKeySequence(Qt.Key_F11))
        toggle_fs.triggered.connect(self.toggle_fullscreen)
        self.addAction(toggle_fs)

        # F12 → Outils de dev
        dev_tools = QAction(self)
        dev_tools.setShortcut(QKeySequence(Qt.Key_F12))
        dev_tools.triggered.connect(lambda: self.view.page().setDevToolsPage(self.view.page()))
        self.addAction(dev_tools)

    # --------------------------------------------------
    def toggle_fullscreen(self):
        if self.isFullScreen():
            self.showNormal()
            self.resize(1280, 960)
            self.center_on_active_screen()
        else:
            self.showFullScreen()


# ------------------------------------------------------
# POINT D'ENTRÉE
# ------------------------------------------------------
def main():
    QGuiApplication.setAttribute(Qt.AA_UseHighDpiPixmaps)
    QGuiApplication.setAttribute(Qt.AA_EnableHighDpiScaling, True)
    QGuiApplication.setHighDpiScaleFactorRoundingPolicy(Qt.HighDpiScaleFactorRoundingPolicy.PassThrough)

    app = QApplication(sys.argv)
    app.setApplicationDisplayName("SWORD RPG")

    window = SwordGame()

    return app.exec()


if __name__ == "__main__":
    sys.exit(main())