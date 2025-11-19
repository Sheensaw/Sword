import jsbeautifier
from pathlib import Path


def reindent_js_file(
    input_path: str,
    output_path: str | None = None,
    indent_size: int = 2,
    max_preserve_newlines: int = 2,
) -> str:
    """
    Réindente et reformate complètement un fichier JavaScript.

    :param input_path: Chemin du fichier JS source.
    :param output_path: Chemin du fichier JS de sortie.
                        - Si None: écrase le fichier d'origine.
    :param indent_size: Nombre d'espaces par niveau d'indentation.
    :param max_preserve_newlines: Nombre max de sauts de lignes consécutifs.
    :return: Chemin du fichier de sortie sous forme de chaîne.
    """
    input_path = Path(input_path)

    if output_path is None:
        output_path = input_path
    else:
        output_path = Path(output_path)

    if not input_path.is_file():
        raise FileNotFoundError(f"Fichier introuvable : {input_path}")

    # Lecture
    raw_code = input_path.read_text(encoding="utf-8")

    # Options JS Beautifier
    opts = jsbeautifier.default_options()
    opts.indent_size = indent_size
    opts.max_preserve_newlines = max_preserve_newlines
    opts.space_in_empty_paren = False
    opts.end_with_newline = True

    # Formatage
    beautified_code = jsbeautifier.beautify(raw_code, opts)

    # Écriture
    output_path.write_text(beautified_code, encoding="utf-8")

    return str(output_path)


# -----------------------------------------------------------
# Exécution automatique : formater JavaScript.js dans le même dossier
# -----------------------------------------------------------

if __name__ == "__main__":
    js_file = Path(__file__).parent / "JavaScript.js"
    output = reindent_js_file(js_file)
    print(f"✔ Réindentation terminée : {output}")
