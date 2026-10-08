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


def helvetia(flach=False, staffel=None):
    """Helvetia-Musterfaelle (BIB 1L2HSG und 2PGN9S, Stand 08.10.2026), Tarifwerte selbst gebaut.

    alpha 2,5 %, kappa 36 EUR/J., Fondskosten 0,10 %, gamma 0; beta Einmalbeitrag 7,0 %; laufend 19,4 % bis
    Jahr 9, danach 10,5 %. `flach` rechnet stattdessen durchgehend mit 10,5 %.
    """
    tarif = {"anbieter": "Helvetia", "tarifName": "Musterfall", "alphaRate": 0.025, "kappaMonthly": 3.0,
             "fundTER": 0.001, "gammaAnnualRate": 0.0, "zillmerdauerMonate": 60, "betaRate": 0.105,
             "betaEinmalRate": 0.07}
    if staffel is None and not flach:
        staffel = [{"abJahr": 1, "rate": 0.194}, {"abJahr": 10, "rate": 0.105}]
    if staffel:
        tarif["betaStaffel"] = staffel
    return tarif


LAUFEND_30 = {"jahre": 30, "beitrag": 1000, "einmal": False, "rendite": 0.046,
              "blatt": {"kostenEuro": 6411, "riy": 0.015}}
LAUFEND_20 = {"jahre": 20, "beitrag": 1000, "einmal": False, "rendite": 0.046,
              "blatt": {"kostenEuro": 3957, "riy": 0.021}}
STAFFEL_20 = [{"abJahr": 1, "rate": 0.152}, {"abJahr": 9, "rate": 0.105}]
EINMAL_30 = {"jahre": 30, "beitrag": 10000, "einmal": True, "rendite": 0.041,
             "blatt": {"kostenEuro": 3378, "riy": 0.006}}


class Staffel(unittest.TestCase):
    def test_helvetia_staffel_besteht(self):
        erg = nachrechnung.pruefe(LAUFEND_30, helvetia())
        self.assertTrue(erg["bestanden"], erg["fehler"])
        self.assertAlmostEqual(erg["kostenEuro"], 6371.92, places=2)
        self.assertAlmostEqual(erg["riy"], 0.0153, places=4)

    def test_helvetia_staffel_20_jahre_besteht(self):
        erg = nachrechnung.pruefe(LAUFEND_20, helvetia(staffel=STAFFEL_20))
        self.assertTrue(erg["bestanden"], erg["fehler"])
        self.assertAlmostEqual(erg["kostenEuro"], 3927.65, places=2)
        self.assertAlmostEqual(erg["riy"], 0.0207, places=4)

    def test_helvetia_flach_105_rot(self):
        # Staffel vergessen: durchgehend 10,5 % ergibt RIY 1,24 % gegen 1,5 % (-0,26 Pp)
        erg = nachrechnung.pruefe(LAUFEND_30, helvetia(flach=True))
        self.assertFalse(erg["bestanden"])
        self.assertAlmostEqual(erg["riy"], 0.0124, places=4)
        self.assertLess(erg["abweichungRiy"], -nachrechnung.TOLERANZ_RIY)

    def test_staffel_ohne_stufen_wie_flach(self):
        for tarif in (helvetia(flach=True), helvetia(staffel=[])):
            self.assertEqual(nachrechnung.rechne(LAUFEND_30, tarif),
                             nachrechnung.rechne(LAUFEND_30, helvetia(flach=True)))

    def test_beta_jahr_stufen(self):
        k = nachrechnung.kostensaetze(helvetia(), None)
        self.assertEqual([nachrechnung.beta_jahr(k, t) for t in (0, 8, 9, 29)], [0.194, 0.194, 0.105, 0.105])

    def test_beta_jahr_unabhaengig_von_stufenreihenfolge(self):
        umgekehrt = list(reversed(helvetia()["betaStaffel"]))
        k = nachrechnung.kostensaetze(helvetia(staffel=umgekehrt), None)
        self.assertEqual([nachrechnung.beta_jahr(k, t) for t in (0, 8, 9)], [0.194, 0.194, 0.105])

    def test_beta_jahr_ohne_staffel_flach(self):
        k = nachrechnung.kostensaetze(helvetia(flach=True), None)
        self.assertEqual({nachrechnung.beta_jahr(k, t) for t in range(30)}, {0.105})

    def test_staffel_wirkt_nicht_auf_einmalbeitrag(self):
        self.assertEqual(nachrechnung.rechne(EINMAL_30, helvetia()),
                         nachrechnung.rechne(EINMAL_30, helvetia(flach=True)))

    def test_einmal_nur_riy_besteht_euro_rot(self):
        # Einmalbeitrag: das Blatt stuetzt nur die RIY; die Euro-Summe weicht ab (2.296 gegen 3.378 EUR)
        tarif = helvetia()
        riy_nur = dict(EINMAL_30, blatt={"riy": 0.006})
        erg = nachrechnung.pruefe(riy_nur, tarif)
        self.assertTrue(erg["bestanden"], erg["fehler"])
        self.assertAlmostEqual(erg["riy"], 0.0060, places=4)
        voll = nachrechnung.pruefe(EINMAL_30, tarif)
        self.assertFalse(voll["bestanden"])
        self.assertAlmostEqual(voll["kostenEuro"], 2296, delta=1)


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
