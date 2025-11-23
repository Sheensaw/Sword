import re
from pathlib import Path

INPUT = "deathstalker.srt"
OUTPUT = "deathstalker_clean.srt"

# Détection d'une ligne qui est uniquement un bruitage pur
PURE_BRACKET_LINE = re.compile(r"^-?\[[^]]+\]$")

# Détection D'UNE PARTIE entre crochets dans une ligne mixte : [ ... ]
BRACKET_CONTENT = re.compile(r"\[[^]]+\]")

def is_pure_bracket_line(line: str) -> bool:
    """Retourne True si la ligne est un bruitage pur entre crochets."""
    text = line.strip()
    if not text:
        return False
    return bool(PURE_BRACKET_LINE.fullmatch(text))


def parse_blocks(content: str):
    """Découpe un fichier SRT en blocs."""
    raw_blocks = re.split(r"\n{2,}", content.strip())
    blocks = []

    for raw in raw_blocks:
        lines = raw.split("\n")
        if len(lines) < 2:
            continue

        number = lines[0].strip()
        timecode = lines[1].strip()
        text_lines = lines[2:]
        blocks.append((number, timecode, text_lines))

    return blocks


def clean_block_lines(lines):
    """
    Nettoie un bloc :
    - Supprime seulement les parties entre crochets dans les lignes mixtes
    - Préserve le reste du texte intact (même les "-" ou indentation)
    """
    cleaned = []
    for line in lines:
        original = line.rstrip("\n")

        # si la ligne est un bruitage pur → on la retirera ailleurs
        if is_pure_bracket_line(original):
            continue

        # enlever seulement la partie [....] dans une ligne mixte
        new_line = BRACKET_CONTENT.sub("", original).strip()

        # si après nettoyage la ligne est vide → ignorer
        if not new_line:
            continue

        cleaned.append(new_line)

    return cleaned


def rebuild_srt(blocks):
    """Reconstruit le SRT avec renumérotation."""
    result = []
    counter = 1

    for (_, timecode, lines) in blocks:
        result.append(str(counter))
        result.append(timecode)
        result.extend(lines)
        result.append("")  # ligne vide entre blocs
        counter += 1

    return "\n".join(result).strip() + "\n"


def main():
    content = Path(INPUT).read_text(encoding="utf-8", errors="ignore")
    blocks = parse_blocks(content)
    cleaned_blocks = []

    for num, timecode, lines in blocks:

        # lignes non vides
        non_empty = [ln for ln in lines if ln.strip()]

        # SI toutes les lignes sont des bruitages purs → supprimer bloc entier
        if non_empty and all(is_pure_bracket_line(ln) for ln in non_empty):
            continue

        # SINON → nettoyer seulement les parties entre crochets
        new_lines = clean_block_lines(lines)

        # si après nettoyage il ne reste plus rien → ignorer
        if not new_lines:
            continue

        cleaned_blocks.append((num, timecode, new_lines))

    # Réécriture
    cleaned_content = rebuild_srt(cleaned_blocks)
    Path(OUTPUT).write_text(cleaned_content, encoding="utf-8")

    print(f"Nettoyage terminé → {OUTPUT}")
    print(f"Blocs conservés : {len(cleaned_blocks)}")


if __name__ == "__main__":
    main()
