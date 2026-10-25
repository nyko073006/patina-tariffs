"""Tests zu quote.py: Belegquote aus den Daten, Abbruch bei Abweichung."""
import contextlib
import glob
import io
import json
import os
import tempfile
import unittest

import quote

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")


def tarif(i, kategorie="Klassische Versicherer", belegt=False):
    t = {"id": i, "anbieter": "A", "tarifName": i, "kategorie": kategorie}
    if belegt:
        t["beleg"] = {"dokumente": [], "felder": {}, "pruefung": []}
    return t


def bundle_eintrag(i, belegt=False):
    t = {"id": i}
    if belegt:
        t["belegteFelder"] = {"betaRate": "bib"}
    return t


class Umgebung:
    """Legt Quelle und Bundle in ein Wegwerfverzeichnis."""

    def __init__(self, quelle, bundle, updated="2026-10-08T15:29:23Z"):
        self.tmp = tempfile.TemporaryDirectory()
        self.ordner = os.path.join(self.tmp.name, "tarife")
        os.makedirs(self.ordner)
        for t in quelle:
            with open(os.path.join(self.ordner, t["id"] + ".json"), "w") as f:
                json.dump(t, f)
        self.bundle = os.path.join(self.tmp.name, "tariffs.json")
        with open(self.bundle, "w") as f:
            json.dump({"updatedAt": updated, "tarife": bundle}, f)

    def lauf(self, *extra):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = quote.main(["--tarife", self.ordner, "--bundle", self.bundle, *extra])
        return code, out.getvalue(), err.getvalue()


class QuoteTests(unittest.TestCase):
    def test_drei_tarife_einer_belegt_ergibt_ein_drittel(self):
        u = Umgebung([tarif("a", belegt=True), tarif("b"), tarif("c")],
                     [bundle_eintrag("a", True), bundle_eintrag("b"), bundle_eintrag("c")])
        code, out, _ = u.lauf()
        self.assertEqual(code, 0)
        self.assertIn("1/3", out)
        self.assertIn("2026-10-08", out)

    def test_quelle_und_bundle_laufen_auseinander_exit_1(self):
        u = Umgebung([tarif("a", belegt=True), tarif("b", belegt=True)],
                     [bundle_eintrag("a", True), bundle_eintrag("b")])
        code, out, err = u.lauf()
        self.assertEqual(code, 1)
        self.assertIn("b", err)
        self.assertIn("belegteFelder", err)

    def test_bundle_belegt_quelle_nicht_exit_1(self):
        u = Umgebung([tarif("a"), tarif("b")],
                     [bundle_eintrag("a", True), bundle_eintrag("b")])
        code, _, err = u.lauf()
        self.assertEqual(code, 1)
        self.assertIn("a", err)

    def test_leerer_scan_exit_1_nie_hundert_prozent(self):
        u = Umgebung([], [])
        code, out, err = u.lauf()
        self.assertEqual(code, 1)
        self.assertIn("Scan leer", err)
        self.assertNotIn("100", out)

    def test_gesamt_ungleich_bundle_anzahl_exit_1(self):
        u = Umgebung([tarif("a"), tarif("b")], [bundle_eintrag("a")])
        code, _, err = u.lauf()
        self.assertEqual(code, 1)
        self.assertIn("Anzahl", err)

    def test_kategorien_summieren_zur_gesamtzahl(self):
        u = Umgebung(
            [tarif("a", "K1", True), tarif("b", "K1"), tarif("c", "K2", True), tarif("d", "K3")],
            [bundle_eintrag("a", True), bundle_eintrag("b"),
             bundle_eintrag("c", True), bundle_eintrag("d")])
        code, out, _ = u.lauf("--json")
        self.assertEqual(code, 0)
        erg = json.loads(out)
        kat = erg["kategorien"]
        self.assertEqual(sum(k["gesamt"] for k in kat.values()), erg["gesamt"])
        self.assertEqual(sum(k["belegt"] for k in kat.values()), erg["belegt"])
        self.assertEqual(kat["K1"], {"belegt": 1, "gesamt": 2})
        self.assertEqual((erg["belegt"], erg["gesamt"]), (2, 4))
        self.assertEqual(erg["stand"], "2026-10-08T15:29:23Z")

    def test_echterStand_stimmtMitDerDateizaehlung(self):
        dateien = glob.glob(os.path.join(ROOT, "data", "app", "tarife", "*.json"))
        self.assertTrue(dateien, "Scan leer: keine Tarifdateien gefunden")
        belegt = 0
        for pfad in dateien:
            with open(pfad, encoding="utf-8") as f:
                belegt += "beleg" in json.load(f)
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = quote.main(["--json"])
        self.assertEqual(code, 0)
        erg = json.loads(out.getvalue())
        self.assertEqual(erg["gesamt"], len(dateien))
        self.assertEqual(erg["belegt"], belegt)


if __name__ == "__main__":
    unittest.main()
