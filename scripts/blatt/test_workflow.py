"""Waechter: Die Nachrechnung ist Pflicht-Schritt in den Workflows (Plan H2-1).

Reiner Textscan der Workflow-Dateien, keine YAML-Bibliothek. Der Waechter
scheitert, wenn der Schritt fehlt, mit `continue-on-error` optional ist oder
hinter einem `if:` haengt (Schritt oder Job).

Aufruf: python3 -m unittest discover -s scripts/blatt
"""
import os
import re
import unittest

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
WORKFLOWS = os.path.join(ROOT, ".github", "workflows")
SCHRITT = "scripts/blatt/nachrechnung.py"
# Shell-Wege, den Schritt still optional zu machen: `|| true`, `|| :`, `|| exit 0`,
# `set +e`, ein abschliessendes `exit 0`.
STILL_OPTIONAL = re.compile(r"\|\|\s*(true\b|:(\s|$)|exit\s+0\b)|\bset\s+\+e\b|(^|;|&&|\n)\s*exit\s+0\b")


def schritte(yaml_text):
    """Liefert [{name, run, bedingt, fehler_ignoriert}], je Schritt einen Eintrag.
    Die Zeilen vor `steps:` (Job-Kopf) stehen als Eintrag mit name None; ihre
    Flags gelten fuer alle Schritte des Jobs."""
    zeilen = yaml_text.splitlines()
    eintraege = []
    aktuell = {"name": None, "run": "", "bedingt": False, "fehler_ignoriert": False}
    eintraege.append(aktuell)
    schritt_einzug = None
    run_einzug = None
    for zeile in zeilen:
        roh = zeile.split("#", 1)[0].rstrip() if not zeile.lstrip().startswith("#") else ""
        if not roh.strip():
            continue
        einzug = len(roh) - len(roh.lstrip())
        text = roh.strip()
        if run_einzug is not None:
            if einzug > run_einzug:
                aktuell["run"] += text + "\n"
                continue
            run_einzug = None
        if text.startswith("- ") and (schritt_einzug is None or einzug == schritt_einzug):
            if schritt_einzug is None and not _in_steps(eintraege, zeilen, zeile):
                continue
            schritt_einzug = einzug
            aktuell = {"name": "", "run": "", "bedingt": False, "fehler_ignoriert": False}
            eintraege.append(aktuell)
            text = text[2:].strip()
            einzug += 2
        elif text == "steps:":
            schritt_einzug = None
            continue
        schluessel, _, wert = text.partition(":")
        wert = wert.strip()
        if schluessel == "name":
            aktuell["name"] = wert or aktuell["name"]
        elif schluessel == "uses" and not aktuell["name"]:
            aktuell["name"] = wert
        elif schluessel == "run":
            if wert in ("|", ">", "|-", ">-"):
                run_einzug = einzug
            else:
                aktuell["run"] += wert + "\n"
                if aktuell["name"] == "":
                    aktuell["name"] = wert
        elif schluessel == "if":
            aktuell["bedingt"] = True
        elif schluessel == "continue-on-error":
            aktuell["fehler_ignoriert"] = wert.lower() not in ("false", "")
    return eintraege


def _in_steps(eintraege, zeilen, aktuelle_zeile):
    """Wahr, sobald vor dieser Zeile ein `steps:` stand (Listenpunkte davor,
    etwa `branches: [..]`-Listen im Kopf, sind keine Schritte)."""
    for z in zeilen:
        if z is aktuelle_zeile:
            return False
        if z.strip() == "steps:":
            return True
    return False


def pruefe(yaml_text):
    """'ok', 'fehlt', 'bedingt' oder 'optional' fuer den Nachrechnungs-Schritt."""
    alle = schritte(yaml_text)
    kopf = alle[0]
    treffer = [s for s in alle[1:] if SCHRITT in s["run"]]
    if not treffer:
        return "fehlt"
    for s in treffer:
        if s["fehler_ignoriert"] or kopf["fehler_ignoriert"]:
            return "optional"
        if s["bedingt"] or kopf["bedingt"]:
            return "bedingt"
        if STILL_OPTIONAL.search(s["run"]):
            return "optional"
    return "ok"


def hat_discover_im_schritt(yaml_text):
    """Wahr, wenn `unittest discover -s scripts/blatt` im run-Text desselben
    Schritts steht wie die Nachrechnung."""
    return any(SCHRITT in s["run"] and "unittest discover -s scripts/blatt" in s["run"]
               for s in schritte(yaml_text)[1:])


def lies(name):
    with open(os.path.join(WORKFLOWS, name), encoding="utf-8") as f:
        return f.read()


OHNE_SCHRITT = """
jobs:
  validate:
    steps:
      - uses: actions/checkout@v4
      - name: Schema validation
        run: npm run validate
"""

OPTIONAL = """
jobs:
  validate:
    steps:
      - name: Selbstpruefung
        continue-on-error: true
        run: python3 scripts/blatt/nachrechnung.py
"""

OPTIONAL_OR_TRUE = """
jobs:
  validate:
    steps:
      - name: Selbstpruefung
        run: python3 scripts/blatt/nachrechnung.py || true
"""

OHNE_DISCOVER_IM_SCHRITT = """
jobs:
  validate:
    steps:
      - name: Anderer Schritt
        run: python3 -m unittest discover -s scripts/blatt
      - name: Selbstpruefung
        run: python3 scripts/blatt/nachrechnung.py
"""


class Workflows(unittest.TestCase):
    def test_validateYmlRuftDieNachrechnungAuf(self):
        text = lies("validate.yml")
        self.assertTrue(
            any(s["run"] and SCHRITT in s["run"] for s in schritte(text) if s["name"] is not None),
            "validate.yml hat keinen Schritt mit " + SCHRITT,
        )
        # Die Unittests des Werkzeugs gehoeren zum selben Pflicht-Schritt.
        self.assertTrue(hat_discover_im_schritt(text),
                        "unittest discover -s scripts/blatt steht nicht im Nachrechnungs-Schritt")

    def test_nachrechnungIstNichtBedingtUndNichtOptional(self):
        for datei in ("validate.yml", "ios-bundle.yml"):
            with self.subTest(datei=datei):
                self.assertEqual(pruefe(lies(datei)), "ok")

    def test_gegentest_ohneSchrittFaelltDerWaechter(self):
        self.assertEqual(pruefe(OHNE_SCHRITT), "fehlt")

    def test_gegentest_mitContinueOnErrorFaelltDerWaechter(self):
        self.assertEqual(pruefe(OPTIONAL), "optional")
        self.assertEqual(pruefe(OPTIONAL.replace("continue-on-error: true", "if: always()")), "bedingt")
        self.assertEqual(pruefe(OPTIONAL.replace("continue-on-error: true", "continue-on-error: false")), "ok")

    def test_gegentest_orTrueMachtDenSchrittOptional(self):
        self.assertEqual(pruefe(OPTIONAL_OR_TRUE), "optional")
        for ersatz in ("|| :", "||true", "|| exit 0"):
            with self.subTest(ersatz=ersatz):
                self.assertEqual(pruefe(OPTIONAL_OR_TRUE.replace("|| true", ersatz)), "optional")

    def test_gegentest_setPlusEUndExit0MachenDenSchrittOptional(self):
        mit_set = OPTIONAL_OR_TRUE.replace(
            "run: python3 scripts/blatt/nachrechnung.py || true",
            "run: |\n          set +e\n          python3 scripts/blatt/nachrechnung.py")
        self.assertEqual(pruefe(mit_set), "optional")
        mit_exit = OPTIONAL_OR_TRUE.replace(
            "run: python3 scripts/blatt/nachrechnung.py || true",
            "run: |\n          python3 scripts/blatt/nachrechnung.py\n          exit 0")
        self.assertEqual(pruefe(mit_exit), "optional")

    def test_gegentest_discoverAnderswoZaehltNicht(self):
        self.assertFalse(hat_discover_im_schritt(OHNE_DISCOVER_IM_SCHRITT))
        self.assertTrue(hat_discover_im_schritt(lies("validate.yml")))


if __name__ == "__main__":
    unittest.main()
