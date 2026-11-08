#!/usr/bin/env python3
"""Rewrites decks/greek-alphabet from a source folder of `{id, title, lang, blobs}` word files.

What a "letter" is in Ancient Greek lives here, and nowhere in the app: decomposed, accents and breathings dropped,
lowercased, final sigma folded into sigma. Each word practices itself fully and each of its letters by that letter's
share of the word.

Usage: build_greek_deck.py <source notes dir>   then   mise run publish-data sam-learns/alphabet-pronunciation-trainer/decks/greek-alphabet
"""

import hashlib
import json
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

DECK = Path(__file__).resolve().parent.parent / "decks" / "greek-alphabet"
ROOT_NAME = "grc:alphabet"


def letters(word: str) -> list[str]:
    decomposed = unicodedata.normalize("NFD", word)
    bare = "".join(c for c in decomposed if not unicodedata.combining(c)).lower().replace("ς", "σ")
    return [c for c in bare if c.isalpha()]


def concept_id(name: str) -> str:
    return "concept-" + hashlib.sha256(name.encode()).hexdigest()[:16]


def scalar(text: str) -> str:
    return json.dumps(text, ensure_ascii=False)


def strengths(word: str) -> dict[str, float]:
    found = letters(word)
    return {letter: round(count / len(found), 6) for letter, count in Counter(found).items()}


def read_word(path: Path) -> dict:
    """The few plain fields of a source file: one per line, blobs as a `- label:` / `file:` list."""
    word = {"blobs": []}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped.startswith("- label:"):
            word["blobs"].append({"label": stripped.split(":", 1)[1].strip()})
        elif stripped.startswith("file:"):
            word["blobs"][-1]["file"] = stripped.split(":", 1)[1].strip()
        elif not line.startswith((" ", "-")) and ":" in line and not line.startswith("blobs:"):
            key, value = line.split(":", 1)
            word[key] = value.strip()
    return word


def main(source: Path) -> None:
    notes = DECK / "notes"
    for old in notes.glob("*.yml"):
        old.unlink()
    words = sorted((read_word(p) for p in source.glob("*.yml")), key=lambda w: w["id"])

    practiced: dict[str, dict[str, float]] = defaultdict(dict)
    word_names = {}
    for w in words:
        name = f"grc:{w['title']}"
        word_names[w["id"]] = name
        practiced[name][w["id"]] = 1.0
        for letter, strength in strengths(w["title"]).items():
            practiced[f"grc:{letter}"][w["id"]] = strength

    root = concept_id(ROOT_NAME)
    names = sorted(practiced)
    for w in words:
        blobs = "".join(f"- {{label: {b['label']}, file: {b['file']}}}\n" for b in w["blobs"])
        text = f"id: {w['id']}\ngestalt: pronunciation-exercise@1\nword: {scalar(w['title'])}\nlang: {w['lang']}\nblobs:\n{blobs}"
        (notes / f"{w['id']}.yml").write_text(text, encoding="utf-8")
    for name in names:
        by = "".join(f"  {e}: {s}\n" for e, s in sorted(practiced[name].items()))
        text = f"id: {concept_id(name)}\ngestalt: concept@1\nname: {scalar(name)}\nparents: [{root}]\npracticed-by:\n{by}"
        (notes / f"{concept_id(name)}.yml").write_text(text, encoding="utf-8")
    children = "".join(f"- {concept_id(n)}\n" for n in names)
    (notes / f"{root}.yml").write_text(f"id: {root}\ngestalt: concept@1\nname: {scalar(ROOT_NAME)}\nchildren:\n{children}", encoding="utf-8")

    members = [w["id"] for w in words] + [concept_id(n) for n in names] + [root]
    listing = "".join(f"- {m}\n" for m in members)
    (notes / "deck-greek-alphabet.yml").write_text(f"id: deck-greek-alphabet\ngestalt: deck@1\nname: greek-alphabet\ntitle: Ancient Greek\nmembers:\n{listing}", encoding="utf-8")
    print(f"{len(words)} exercises, {len(names) + 1} concepts")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
