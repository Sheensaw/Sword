#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SWORD - Lanceur du jeu Twine (Fenêtre 4:3)
Version avec capture des logs JavaScript
Compatible PySide6 6.10.0 (Qt 6.10)
"""
import sys
import logging
from pathlib import Path

from PySide6.QtCore import Qt, QUrl, QPoint
from PySide6.QtGui import QGuiApplication, QKeySequence, QAction, QCursor, QColor
from PySide6.QtWidgets import QApplication, QMainWindow, QMessageBox
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebEngineCore import QWebEnginePage
from PySide6.QtWebEngineCore import QWebEngineSettings, QWebEngineProfile


# ------------------------------------------------------
# CAPTURE DES LOGS JAVASCRIPT
# ------------------------------------------------------
class JSPage(QWebEnginePage):
    def javaScriptConsoleMessage(self, level, message, line, sourceID):
        if level == QWebEnginePage.InfoMessageLevel:
            logging.info(f"[JS INFO] {message} ({sourceID}:{line})")
        elif level == QWebEnginePage.WarningMessageLevel:
            logging.warning(f"[JS WARN] {message} ({sourceID}:{line})")
        elif level == QWebEnginePage.ErrorMessageLevel:
            logging.error(f"[JS ERROR] {message} ({sourceID}:{line})")
        else:
            logging.debug(f"[JS LOG] {message} ({sourceID}:{line})")


# ------------------------------------------------------
# CONFIGURATION DU LOGGING AVEC COULEURS
# ------------------------------------------------------
class ColorFormatter(logging.Formatter):
    """Formatter pour ajouter des couleurs aux logs"""
    COLORS = {
        'DEBUG': '\033[36m',  # Cyan
        'INFO': '\033[32m',   # Vert
        'WARNING': '\033[33m',# Jaune
        'ERROR': '\033[31m',  # Rouge
        'CRITICAL': '\033[41m',  # Fond rouge
        'RESET': '\033[0m'    # Reset
    }

    def format(self, record):
        log_message = super().format(record)
        if record.levelname in self.COLORS:
            return f"{self.COLORS[record.levelname]}{log_message}{self.COLORS['RESET']}"
        return log_message


# Configuration du logging
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

# Application du formatter couleur
for handler in logging.getLogger().handlers:
    handler.setFormatter(ColorFormatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s"))

logger = logging.getLogger("SWORD_Launcher")


# ------------------------------------------------------
# CLASSE PRINCIPALE DU JEU
# ------------------------------------------------------
class SwordGame(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("SWORD - Debug Console")
        base_path = Path(__file__).resolve().parent
        self.html_path = base_path / "Game.html"

        # Vue WebEngine + page JS custom
        self.view = QWebEngineView(self)
        self.js_page = JSPage(self.view)           # <<< CAPTURE DES LOGS JS
        self.view.setPage(self.js_page)            # <<< ATTACH ICI

        self.view.setContextMenuPolicy(Qt.NoContextMenu)
        self.js_page.setBackgroundColor(QColor("#000000"))
        self.view.setVisible(False)
        self.setCentralWidget(self.view)

        # Configuration WebEngine
        self._setup_web_engine()

        # Connexions
        self._connect_signals()

        # Charger la page HTML
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

        # Paramètres vue
        vset = self.view.settings()
        vset.setAttribute(QWebEngineSettings.PlaybackRequiresUserGesture, False)
        vset.setAttribute(QWebEngineSettings.ShowScrollBars, False)
        vset.setAttribute(QWebEngineSettings.JavascriptEnabled, True)
        vset.setAttribute(QWebEngineSettings.LocalStorageEnabled, True)

        # Format fenêtre
        self.view.setZoomFactor(1.0)
        self.setFixedSize(1280, 960)

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
        logger.info(f"🎮 Chargement du jeu : {url.toString()}")

    # --------------------------------------------------
    def on_load_finished(self, ok: bool):
        if ok:
            self.view.setVisible(True)
            logger.info("✅ Jeu chargé avec succès - Affichage activé")
        else:
            logger.error("❌ Échec du chargement de Game.html")

    # --------------------------------------------------
    def reload_full_game(self):
        logger.info("🔄 Rechargement complet du jeu...")
        self.view.setVisible(False)
        page = self.view.page()
        page.profile().clearHttpCache()
        page.profile().clearAllVisitedLinks()
        self.view.page().runJavaScript("localStorage.clear(); sessionStorage.clear();")
        self.view.load(QUrl.fromLocalFile(str(self.html_path)))
        logger.info("✅ Cache nettoyé - Rechargement en cours")

    # --------------------------------------------------
    def _add_shortcuts(self):
        # Échap → Quitter
        quit_act = QAction(self)
        quit_act.setShortcut(QKeySequence(Qt.Key_Escape))
        quit_act.triggered.connect(self.close)
        self.addAction(quit_act)

        # F5 → Reload
        reload_act = QAction(self)
        reload_act.setShortcut(QKeySequence(Qt.Key_F5))
        reload_act.triggered.connect(self.reload_full_game)
        self.addAction(reload_act)

        # F11 → Plein écran
        toggle_fs = QAction(self)
        toggle_fs.setShortcut(QKeySequence(Qt.Key_F11))
        toggle_fs.triggered.connect(self.toggle_fullscreen)
        self.addAction(toggle_fs)

    # --------------------------------------------------
    def toggle_fullscreen(self):
        if self.isFullScreen():
            self.showNormal()
            self.setFixedSize(1280, 960)
            self.center_on_active_screen()
            logger.info("📺 Retour en mode fenêtre 4:3")
        else:
            self.showFullScreen()
            logger.info("📺 Passage en mode plein écran")


# ------------------------------------------------------
# POINT D'ENTRÉE
# ------------------------------------------------------
def main():
    QGuiApplication.setAttribute(Qt.AA_UseHighDpiPixmaps)
    QGuiApplication.setAttribute(Qt.AA_EnableHighDpiScaling, True)
    QGuiApplication.setHighDpiScaleFactorRoundingPolicy(Qt.HighDpiScaleFactorRoundingPolicy.PassThrough)

    app = QApplication(sys.argv)
    app.setApplicationDisplayName("SWORD")

    window = SwordGame()
    logger.info("🎮 Lancement du jeu SWORD...")

    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
