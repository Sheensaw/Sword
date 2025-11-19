# ============================================================
#  REORGANIZE_JS_FAST.PY — Version rapide & fiable
#  Utilise une extraction ciblée uniquement sur les signatures du plan
# ============================================================

import re
from pathlib import Path

# ------------------------------------------------------------
# Fonction simple pour extraire un bloc { ... } sans casser JS
# ------------------------------------------------------------
def extract_block(js, start):
    open_pos = js.find("{", start)
    if open_pos == -1:
        return None, start
    depth = 1
    pos = open_pos + 1
    while pos < len(js) and depth > 0:
        if js[pos] == "{":
            depth += 1
        elif js[pos] == "}":
            depth -= 1
        pos += 1
    return js[start:pos], pos


# ------------------------------------------------------------
# Signatures → Catégories du plan
# ------------------------------------------------------------
SIGNATURES = {
    # I — CONSTANTES
    r"const ICONS":               ("I.CONSTANTES", "ICONS"),
    r"velkarumGeography":         ("I.CONSTANTES", "GEOGRAPHIE"),
    r"ChoiceIcons":               ("I.CONSTANTES", "CHOICEICONS"),

    # II — Initialisation
    r"\bfunction\s+V\s*\(":       ("II.INIT", "V"),
    r"ensureBaseStats":           ("II.INIT", "BASESTATS"),
    r"loadLootsSequentially":     ("II.INIT", "LOOTS"),
    r"loadAllPNJ":                ("II.INIT", "PNJLOAD"),

    # III — MACROS
    r"Macro\.add\(['\"]quest":                ("III.MACROS", "QUETES"),
    r"Macro\.add\(['\"]startquest":           ("III.MACROS", "QUETES"),
    r"Macro\.add\(['\"]markquest":            ("III.MACROS", "QUETES"),

    r"Macro\.add\(['\"]setenv":               ("III.MACROS", "ENVIRONNEMENT"),
    r"Macro\.add\(['\"]notifydialogue":       ("III.MACROS", "NOTIFICATIONS"),
    r"Macro\.add\(['\"]notify":               ("III.MACROS", "NOTIFICATIONS"),
    r"Macro\.add\(['\"]addExp":               ("III.MACROS", "XP"),
    r"Macro\.add\(['\"]losehealth":           ("III.MACROS", "SANTE"),
    r"Macro\.add\(['\"]death":                ("III.MACROS", "SANTE"),
    r"Macro\.add\(['\"]addItem":              ("III.MACROS", "OBJETS"),
    r"Macro\.add\(['\"]removeItem":           ("III.MACROS", "OBJETS"),

    # PNJ macros
    r"Macro\.add\(['\"]pnj":                  ("III.MACROS", "PNJ"),
    r"Macro\.add\(['\"]spawn":                ("III.MACROS", "PNJ"),
    r"Macro\.add\(['\"]movePnj":              ("III.MACROS", "PNJ"),
    r"Macro\.add\(['\"]pnjCoords":            ("III.MACROS", "PNJ"),
    r"Macro\.add\(['\"]pnjgive":              ("III.MACROS", "PNJ"),
    r"Macro\.add\(['\"]buddy":                ("III.MACROS", "PNJ"),
    r"Macro\.add\(['\"]setrelation":          ("III.MACROS", "PNJ"),

    r"Macro\.add\(['\"]setcoords":            ("III.MACROS", "COORDS"),
    r"Macro\.add\(['\"]displaylocation":      ("III.MACROS", "COORDS"),
    r"Macro\.add\(['\"]choiceicon":           ("III.MACROS", "CHOIX"),

    # IV — Quêtes
    r"addQuest":                   ("IV.QUETES", "GENERAL"),
    r"markQuestCompleted":         ("IV.QUETES", "GENERAL"),

    # V — Inventaire
    r"renderItemEncarts":          ("V.INVENTAIRE", "GENERAL"),
    r"equipItem":                  ("V.INVENTAIRE", "GENERAL"),
    r"unequipItem":                ("V.INVENTAIRE", "GENERAL"),
    r"showItemModal":              ("V.INVENTAIRE", "GENERAL"),

    # VI — PNJ
    r"npcEnsure":                  ("VI.PNJ", "GENERAL"),
    r"updateBuddyHUDVisibility":   ("VI.PNJ", "GENERAL"),
    r"renderBuddiesPanel":         ("VI.PNJ", "GENERAL"),

    # VII — UI
    r"updateHUD":                  ("VII.UI", "GENERAL"),
    r"showNotification":           ("VII.UI", "GENERAL"),

    # VIII — Localisation
    r"getLocationString":          ("VIII.LOCALISATION", "GENERAL"),

    # IX — Events
    r":storyready":                ("IX.EVENTS", "GENERAL"),
    r"passagestart":               ("IX.EVENTS", "GENERAL"),

    # X — Utils
    r"escapeHtml":                 ("X.UTILS", "GENERAL"),
    r"customConfirm":              ("X.UTILS", "GENERAL")
}


# ------------------------------------------------------------
# Réorganisation principale
# ------------------------------------------------------------
def reorganize_js(input_path, output_path):

    js = Path(input_path).read_text(encoding="utf-8")

    sections = {}
    for sec, sub in SIGNATURES.values():
        sections.setdefault(sec, {})
        sections[sec].setdefault(sub, [])

    # Extraction ciblée : rapide & simple
    for pattern, (sec, sub) in SIGNATURES.items():
        for m in re.finditer(pattern, js):
            block, end = extract_block(js, m.start())
            if block:
                sections[sec][sub].append(block)

    # Reconstruction dans ton ordre
    ORDER = [
        "I.CONSTANTES",
        "II.INIT",
        "III.MACROS",
        "IV.QUETES",
        "V.INVENTAIRE",
        "VI.PNJ",
        "VII.UI",
        "VIII.LOCALISATION",
        "IX.EVENTS",
        "X.UTILS"
    ]

    out = []

    for sec in ORDER:
        out.append(f"\n\n//////////////////// {sec} ////////////////////\n")
        for sub, blocks in sections.get(sec, {}).items():
            out.append(f"\n// ===== {sub} =====\n")
            out.extend(blocks)

    Path(output_path).write_text("".join(out), encoding="utf-8")
    print("✔ Fichier JS réorganisé avec succès :", output_path)


if __name__ == "__main__":
    reorganize_js("JavaScript.js", "JavaScript_reorganise.js")
