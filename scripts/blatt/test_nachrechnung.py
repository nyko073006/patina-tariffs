"""Gegentests der Selbstpruefung (Plan Blatt-Auslese, Etappe B).

Die Continentale ist die Kalibrierung: ihre Werte wurden am 05.10.2026 von Hand
ausgelesen und am 07.10.2026 blind bestaetigt. Faellt ein Posten weg oder ist
er falsch gelesen, muss die Pruefung rot werden.

Aufruf: python3 -m unittest discover -s scripts/blatt
"""
import copy
import json
import os
import unittest

import nachrechnung

TARIF = os.path.join(nachrechnung.ROOT, "data", "app", "tarife", "continentale--easyrente-invest-ri.json")


def continentale():
    with open(TARIF, encoding="utf-8") as f:
        return json.load(f)


class Selbstpruefung(unittest.TestCase):
    def setUp(self):
        self.tarif = continentale()
        self.laufend = self.tarif["beleg"]["pruefung"][0]
        self.assertFalse(self.laufend["einmal"])

    def test_continentale_besteht(self):
        for fall in self.tarif["beleg"]["pruefung"]:
            erg = nachrechnung.pruefe(fall, self.tarif)
            self.assertTrue(erg["bestanden"], erg["fehler"])

    def test_ohne_restbeitragsposten_rot(self):
        # Blatt ohne die Zeile "0,3 % der noch ausstehenden Anlage" gelesen
        tarif = copy.deepcopy(self.tarif)
        tarif["restbeitragRate"] = 0
        erg = nachrechnung.pruefe(self.laufend, tarif)
        self.assertFalse(erg["bestanden"])

    def test_falsches_beta_rot(self):
        tarif = copy.deepcopy(self.tarif)
        tarif["betaRate"] = 0  # alter App-Wert der meisten Tarife
        self.assertFalse(nachrechnung.pruefe(self.laufend, tarif)["bestanden"])
        tarif["betaRate"] = 0.088  # doppelt gelesen
        self.assertFalse(nachrechnung.pruefe(self.laufend, tarif)["bestanden"])

    def test_falscher_einmalsatz_rot(self):
        einmal = self.tarif["beleg"]["pruefung"][1]
        self.assertTrue(einmal["einmal"])
        tarif = copy.deepcopy(self.tarif)
        tarif["betaEinmalRate"] = 0.014  # nur der Verwaltungsteil, ohne 4,0 % Einstieg
        self.assertFalse(nachrechnung.pruefe(einmal, tarif)["bestanden"])

    def test_alpha_wirkt_nicht_auf_einmalbeitrag(self):
        einmal = self.tarif["beleg"]["pruefung"][1]
        tarif = copy.deepcopy(self.tarif)
        tarif["alphaRate"] = 0.09
        self.assertEqual(nachrechnung.rechne(einmal, tarif), nachrechnung.rechne(einmal, self.tarif))

    def test_annahmen_ersetzen_tarifwert(self):
        fall = dict(self.laufend, annahmen={})
        mit = nachrechnung.rechne(self.laufend, self.tarif)["kostenEuro"]
        ohne = nachrechnung.rechne(fall, self.tarif)["kostenEuro"]  # Fonds-TER 0,20 % statt 0,07 %
        self.assertGreater(ohne, mit)

    def test_toleranz_einstellbar(self):
        self.assertFalse(nachrechnung.pruefe(self.laufend, self.tarif, toleranz_euro=0.01)["bestanden"])


class Kommandozeile(unittest.TestCase):
    def test_exitcode_rot_bei_falschem_wert(self):
        import tempfile
        tarif = continentale()
        tarif["betaRate"] = 0
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
            json.dump(tarif, f)
        try:
            self.assertEqual(nachrechnung.main([f.name]), 1)
        finally:
            os.unlink(f.name)

    def test_exitcode_gruen_fuer_continentale(self):
        self.assertEqual(nachrechnung.main([TARIF]), 0)


if __name__ == "__main__":
    unittest.main()
