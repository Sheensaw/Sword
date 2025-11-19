#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SWORD - Lanceur du jeu Twine (Fenêtre 4:3)
Compatible PySide6 6.10.0 (Qt 6.10)
Autorise les requêtes HTTP locales (CORS localhost) et ajoute un test backend.
"""
import sys
import logging
from pathlib import Path

from PySide6.QtCore import Qt, QUrl, QPoint
from PySide6.QtGui import QGuiApplication, QKeySequence, QAction, QCursor, QColor
from PySide6.QtWidgets import QApplication, QMainWindow, QMessageBox
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebEngineCore import QWebEngineSettings, QWebEngineProfile

# ------------------------------------------------------
# CONFIGURATION DU LOGGING
# ------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)


# ------------------------------------------------------
# CLASSE PRINCIPALE DU JEU
# ------------------------------------------------------
class SwordGame(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("SWORD")
        base_path = Path(__file__).resolve().parent
        self.html_path = base_path / "Game.html"

        # Vue WebEngine
        self.view = QWebEngineView(self)
        self.view.setContextMenuPolicy(Qt.NoContextMenu)
        self.view.page().setBackgroundColor(QColor("#000000"))
        self.view.setVisible(False)
        self.setCentralWidget(self.view)

        # Profil global WebEngine (Qt 6.10)
        profile = QWebEngineProfile.defaultProfile()
        profile.setHttpCacheType(QWebEngineProfile.NoCache)
        profile.setPersistentCookiesPolicy(QWebEngineProfile.NoPersistentCookies)

        # --- PARAMÈTRES GLOBAUX / CORS LOCALHOST ---
        settings = profile.settings()
        settings.setAttribute(QWebEngineSettings.LocalContentCanAccessRemoteUrls, True)
        settings.setAttribute(QWebEngineSettings.LocalContentCanAccessFileUrls, True)
        settings.setAttribute(QWebEngineSettings.JavascriptEnabled, True)
        settings.setAttribute(QWebEngineSettings.LocalStorageEnabled, True)
        settings.setAttribute(QWebEngineSettings.PlaybackRequiresUserGesture, False)
        logging.info("✅ CORS local (localhost) activé via profil global QtWebEngine.")

        # Paramètres spécifiques à la vue
        vset = self.view.settings()
        vset.setAttribute(QWebEngineSettings.PlaybackRequiresUserGesture, False)
        vset.setAttribute(QWebEngineSettings.ShowScrollBars, False)
        vset.setAttribute(QWebEngineSettings.JavascriptEnabled, True)
        vset.setAttribute(QWebEngineSettings.LocalStorageEnabled, True)

        # Zoom neutre + format fenêtre
        self.view.setZoomFactor(1.0)
        self.setFixedSize(1280, 960)

        # Connexion du signal de fin de chargement
        self.view.loadFinished.connect(self.on_load_finished)

        # Charger la page HTML
        self.load_game()

        # Raccourcis clavier
        self._add_shortcuts()

        # Centre la fenêtre
        self.center_on_active_screen()

        # Affiche
        self.show()

    # ------------------------------------------------------
    def center_on_active_screen(self):
        app = QGuiApplication.instance()
        screen = app.screenAt(QCursor.pos()) or app.primaryScreen()
        geometry = screen.availableGeometry()
        x = geometry.x() + (geometry.width() - self.width()) // 2
        y = geometry.y() + (geometry.height() - self.height()) // 2
        self.move(QPoint(x, y))

    # ------------------------------------------------------
    def load_game(self):
        if not self.html_path.exists():
            QMessageBox.critical(self, "Erreur", f"Game.html introuvable :\n{self.html_path}")
            sys.exit(1)
        url = QUrl.fromLocalFile(str(self.html_path))
        self.view.load(url)
        logging.info(f"Chargement du jeu : {url.toString()}")

    # ------------------------------------------------------
    def on_load_finished(self, ok: bool):
        if ok:
            self.view.setVisible(True)
            logging.info("Jeu chargé avec succès (affichage activé).")
            self._inject_backend_health_check()
        else:
            logging.error("Échec du chargement de Game.html.")

    def _inject_backend_health_check(self):
        """
        Test côté page pour vérifier la connexion au backend IA (http://127.0.0.1:5001/health)
        """
        js = r"""
        (async () => {
          try {
            const res = await fetch("http://127.0.0.1:5001/health", { method: "GET" });
            if (!res.ok) {
              console.error("[LAUNCHER] /health HTTP", res.status);
              return;
            }
            const data = await res.json();
            console.log("[LAUNCHER] Backend OK:", data);
          } catch (e) {
            console.error("[LAUNCHER] Échec accès backend:", e);
          }
        })();
        """
        self.view.page().runJavaScript(js)

    # ------------------------------------------------------
    def reload_full_game(self):
        logging.info("Rechargement complet (cache + localStorage vidé)...")
        self.view.setVisible(False)
        page = self.view.page()
        page.profile().clearHttpCache()
        page.profile().clearAllVisitedLinks()
        self.view.page().runJavaScript("localStorage.clear();")
        self.view.load(QUrl.fromLocalFile(str(self.html_path)))

    # ------------------------------------------------------
    def _add_shortcuts(self):
        quit_act = QAction(self)
        quit_act.setShortcut(QKeySequence(Qt.Key_Escape))
        quit_act.triggered.connect(self.close)
        self.addAction(quit_act)

        reload_act = QAction(self)
        reload_act.setShortcut(QKeySequence(Qt.Key_F5))
        reload_act.triggered.connect(self.reload_full_game)
        self.addAction(reload_act)

        toggle_fs = QAction(self)
        toggle_fs.setShortcut(QKeySequence(Qt.Key_F11))
        toggle_fs.triggered.connect(self.toggle_fullscreen)
        self.addAction(toggle_fs)

    # ------------------------------------------------------
    def toggle_fullscreen(self):
        if self.isFullScreen():
            self.showNormal()
            self.setFixedSize(1280, 960)
            self.center_on_active_screen()
            logging.info("Retour en mode fenêtre 4:3.")
        else:
            self.showFullScreen()
            logging.info("Passage en mode plein écran.")


# ------------------------------------------------------
# POINT D'ENTRÉE PRINCIPAL
# ------------------------------------------------------
def main():
    QGuiApplication.setAttribute(Qt.AA_UseHighDpiPixmaps)
    QGuiApplication.setAttribute(Qt.AA_EnableHighDpiScaling, True)
    QGuiApplication.setHighDpiScaleFactorRoundingPolicy(Qt.HighDpiScaleFactorRoundingPolicy.PassThrough)

    app = QApplication(sys.argv)
    app.setApplicationDisplayName("SWORD")

    window = SwordGame()
    logging.info("Lancement du jeu Twine SWORD...")
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
