#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SWORD - Lanceur du jeu Twine (Mode Fenêtré 4:3 Strict)
"""
import sys
import logging
import json
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
# CONFIGURATION DU LOGGING
# ------------------------------------------------------
class ColorFormatter(logging.Formatter):
    COLORS = {
        'DEBUG': '\033[36m', 'INFO': '\033[32m', 'WARNING': '\033[33m',
        'ERROR': '\033[31m', 'CRITICAL': '\033[41m', 'RESET': '\033[0m'
    }

    def format(self, record):
        log_message = super().format(record)
        if record.levelname in self.COLORS:
            return f"{self.COLORS[record.levelname]}{log_message}{self.COLORS['RESET']}"
        return log_message


logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s",
                    handlers=[logging.StreamHandler(sys.stdout)])
for handler in logging.getLogger().handlers:
    handler.setFormatter(ColorFormatter("%(asctime)s - %(levelname)s - %(message)s"))
logger = logging.getLogger("SWORD")


# ------------------------------------------------------
# CLASSE PRINCIPALE DU JEU
# ------------------------------------------------------
class SwordGame(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("SWORD RPG - 4:3 Windowed")

        # Chemins des fichiers
        base_path = Path(__file__).resolve().parent
        self.html_path = base_path / "Game.html"
        self.js_path = base_path / "JavaScript.js"
        self.css_path = base_path / "CSS.css"

        # Vue WebEngine
        self.view = QWebEngineView(self)
        self.js_page = JSPage(self.view)
        self.view.setPage(self.js_page)
        self.view.setContextMenuPolicy(Qt.NoContextMenu)
        self.js_page.setBackgroundColor(QColor("#111111"))
        self.view.setVisible(False)
        self.setCentralWidget(self.view)

        self._setup_web_engine()
        self._connect_signals()
        self.inject_game_scripts()
        self.load_game()
        self._add_shortcuts()
        self.center_on_active_screen()
        self.show()

    def _setup_web_engine(self):
        profile = QWebEngineProfile.defaultProfile()
        profile.setHttpCacheType(QWebEngineProfile.NoCache)
        profile.setPersistentCookiesPolicy(QWebEngineProfile.NoPersistentCookies)

        settings = profile.settings()
        settings.setAttribute(QWebEngineSettings.LocalContentCanAccessRemoteUrls, True)
        settings.setAttribute(QWebEngineSettings.LocalContentCanAccessFileUrls, True)
        settings.setAttribute(QWebEngineSettings.JavascriptEnabled, True)
        settings.setAttribute(QWebEngineSettings.LocalStorageEnabled, True)
        settings.setAttribute(QWebEngineSettings.WebGLEnabled, True)

        # 🔒 FORCE LE RATIO 4:3 (1280x960) ET EMPÊCHE LE REDIMENSIONNEMENT
        self.setFixedSize(1280, 960)
        self.view.setZoomFactor(1.0)

    def inject_game_scripts(self):
        raw_js_code = ""
        if self.js_path.exists():
            try:
                with open(self.js_path, "r", encoding="utf-8") as f:
                    raw_js_code = f.read()
            except Exception as e:
                logger.error(f"❌ Erreur lecture JS: {e}")

        css_injection_code = ""
        if self.css_path.exists():
            try:
                with open(self.css_path, "r", encoding="utf-8") as f:
                    js_css_string = json.dumps(f.read())
                    css_injection_code = f"""
                    try {{
                        var cssContent = {js_css_string};
                        var styleElement = document.createElement('style');
                        styleElement.type = 'text/css';
                        styleElement.textContent = cssContent;
                        document.head.appendChild(styleElement);
                        console.log("[Launcher] CSS injected.");
                    }} catch(e) {{ console.error("CSS Error:", e); }}
                    """
            except Exception as e:
                logger.error(f"❌ Erreur lecture CSS: {e}")

        try:
            self.view.page().scripts().clear()
            wrapped_code = f"""
            (function() {{
                var checkReady = setInterval(function() {{
                    if (window.SugarCube && window.SugarCube.Macro) {{
                        clearInterval(checkReady);
                        {css_injection_code}
                        window.Macro = window.SugarCube.Macro;
                        window.State = window.SugarCube.State;
                        window.Story = window.SugarCube.Story;
                        window.Engine = window.SugarCube.Engine;
                        window.Wikifier = window.SugarCube.Wikifier;
                        if (!window.setup) window.setup = {{}};
                        try {{ {raw_js_code} }} catch (e) {{ console.error("JS Error:", e); }}
                    }}
                }}, 10);
            }})();
            """
            script = QWebEngineScript()
            script.setSourceCode(wrapped_code)
            script.setInjectionPoint(QWebEngineScript.InjectionPoint.DocumentReady)
            script.setWorldId(QWebEngineScript.ScriptWorldId.MainWorld)
            self.view.page().scripts().insert(script)
            logger.info("💉 Scripts injectés")
        except Exception as e:
            logger.error(f"❌ Erreur injection: {e}")

    def _connect_signals(self):
        self.view.loadFinished.connect(self.on_load_finished)

    def center_on_active_screen(self):
        app = QGuiApplication.instance()
        screen = app.screenAt(QCursor.pos()) or app.primaryScreen()
        geometry = screen.availableGeometry()
        x = geometry.x() + (geometry.width() - self.width()) // 2
        y = geometry.y() + (geometry.height() - self.height()) // 2
        self.move(QPoint(x, y))

    def load_game(self):
        if not self.html_path.exists():
            QMessageBox.critical(self, "Erreur", f"Game.html introuvable")
            sys.exit(1)
        self.view.load(QUrl.fromLocalFile(str(self.html_path)))

    def on_load_finished(self, ok):
        if ok: self.view.setVisible(True)

    def reload_full_game(self):
        self.inject_game_scripts()
        self.view.page().profile().clearHttpCache()
        self.view.triggerPageAction(QWebEnginePage.Reload)

    def _add_shortcuts(self):
        # Échap pour quitter
        QAction(self, shortcut=QKeySequence(Qt.Key_Escape), triggered=self.close).setParent(self)
        # F5 pour recharger
        QAction(self, shortcut=QKeySequence(Qt.Key_F5), triggered=self.reload_full_game).setParent(self)
        # F12 pour DevTools
        QAction(self, shortcut=QKeySequence(Qt.Key_F12),
                triggered=lambda: self.view.page().setDevToolsPage(self.view.page())).setParent(self)
        # 🚫 F11 (Plein écran) SUPPRIMÉ


def main():
    QGuiApplication.setAttribute(Qt.AA_UseHighDpiPixmaps)
    QGuiApplication.setAttribute(Qt.AA_EnableHighDpiScaling, True)
    app = QApplication(sys.argv)
    window = SwordGame()
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())