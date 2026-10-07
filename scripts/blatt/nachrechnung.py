#!/usr/bin/env python3
"""Selbstpruefung belegter Tarife: Musterfall des Blatts mit den Tarifwerten nachrechnen.

Plan Blatt-Auslese, Etappe B. Jeder Tarif mit Feld `beleg` traegt in
`beleg.pruefung` den Musterfall seines Basisinformationsblatts bzw. Muster-PIB
(Beitrag, Haltedauer, Rendite) und die Vergleichswerte des Blatts ("Kosten
insgesamt" in Euro, jaehrliche Auswirkung der Kosten). Das Skript rechnet den
Fall mit den Werten aus dem Tarif nach. Weicht das Ergebnis ueber die Toleranz
ab, ist ein Posten falsch gelesen oder fehlt: Exit-Code 1.

Rechenweg wie die Blaetter: "Kosten insgesamt" ist die nominale Summe aller
Abzuege, die Auswirkung pro Jahr (RIY) ist r minus interner Zins der
Nettowerte. Jaehrliche Schritte, Beitrag zu Jahresbeginn. Wie in der App
wirkt alpha nur auf laufende Beitraege; ein Einmalbeitrag traegt allein
betaEinmalRate (fehlt sie: betaRate).

`annahmen` ersetzt Tarifwerte fuer den Musterfall, wenn das Blatt mit anderen
Werten rechnet (etwa Fondskosten des guenstigsten Fonds statt des Depot-ETF).
Zusaetzlich kennt es `kumRate`: Anteil p. a. auf die bisher eingezahlte Summe,
ein Posten ohne App-Feld.

Aufruf:  python3 scripts/blatt/nachrechnung.py [--toleranz-euro 0.15]
             [--toleranz-riy 0.0015] [tarif.json ...]
Ohne Dateien: alle Tarife unter data/app/tarife mit Feld `beleg`.
"""
import argparse
import glob
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")

# Toleranz der Selbstpruefung. Plan Frage 2 ist offen: neu festlegen, sobald
# die Verteilung ueber alle Tarife vorliegt. Bis dahin die Werte der
# BIB-Auslese vom 07.10.2026.
TOLERANZ_EURO = 0.15     # relative Abweichung "Kosten insgesamt"
TOLERANZ_RIY = 0.0015    # 0,15 Prozentpunkte


def kostensaetze(tarif, annahmen):
    """Kostenparameter des Musterfalls: Tarifwerte, ueberschrieben durch annahmen."""
    w = dict(tarif)
    w.update(annahmen or {})
    beta = w.get("betaRate", 0.0)
    return {
        "alpha": w.get("alphaRate", 0.0),
        "zillmer_jahre": (w.get("zillmerdauerMonate") or 60) / 12,
        "beta": beta,
        "beta_einmal": w["betaEinmalRate"] if w.get("betaEinmalRate") is not None else beta,
        "gamma": w.get("gammaAnnualRate", 0.0),
        "ter": w.get("fundTER", 0.0),
        "kappa_jahr": 12 * w.get("kappaMonthly", 0.0),
        "rest": w.get("restbeitragRate", 0.0),
        "kum": w.get("kumRate", 0.0),
    }


def lauf(fall, k, mit_kosten):
    """Endwert und nominale Kostensumme eines Musterfalls."""
    n, beitrag, einmal, r = fall["jahre"], fall["beitrag"], fall["einmal"], fall["rendite"]
    zill = max(1, min(n, round(k["zillmer_jahre"])))
    summe = beitrag * n
    wert = nominal = eingezahlt = 0.0
    for t in range(n):
        einzahlung = beitrag if (not einmal or t == 0) else 0.0
        wert += einzahlung
        eingezahlt += einzahlung
        if mit_kosten:
            if einmal:
                kosten = k["beta_einmal"] * einzahlung
            else:
                kosten = k["beta"] * einzahlung + k["rest"] * beitrag * (n - t - 1)
                if t < zill:
                    kosten += k["alpha"] * summe / zill
            kosten += k["kappa_jahr"] + k["kum"] * eingezahlt
            wert -= kosten
            nominal += kosten
        wert *= 1 + r
        if mit_kosten:
            satz = k["gamma"] + k["ter"]
            nominal += wert * satz
            wert *= 1 - satz
    return wert, nominal


def interner_zins(zahlungen, endwert):
    lo, hi = -0.99, 1.0
    for _ in range(200):
        m = (lo + hi) / 2
        v = sum(z * (1 + m) ** (len(zahlungen) - i) for i, z in enumerate(zahlungen)) - endwert
        lo, hi = (m, hi) if v < 0 else (lo, m)
    return m


def rechne(fall, tarif):
    k = kostensaetze(tarif, fall.get("annahmen"))
    brutto, _ = lauf(fall, k, False)
    netto, nominal = lauf(fall, k, True)
    zahlungen = [fall["beitrag"] if (not fall["einmal"] or t == 0) else 0.0 for t in range(fall["jahre"])]
    return {"kostenEuro": nominal, "riy": fall["rendite"] - interner_zins(zahlungen, netto),
            "endwert": netto, "endwertOhneKosten": brutto}


def pruefe(fall, tarif, toleranz_euro=TOLERANZ_EURO, toleranz_riy=TOLERANZ_RIY):
    """Ergebnis eines Musterfalls mit Abweichungen und Urteil."""
    e = rechne(fall, tarif)
    blatt = fall["blatt"]
    out = {"kostenEuro": round(e["kostenEuro"], 2), "riy": round(e["riy"], 5), "fehler": []}
    if isinstance(blatt.get("kostenEuro"), (int, float)):
        abw = e["kostenEuro"] / blatt["kostenEuro"] - 1
        out["abweichungEuro"] = round(abw, 4)
        if abs(abw) > toleranz_euro:
            out["fehler"].append(f"Kosten {e['kostenEuro']:.0f} EUR gegen {blatt['kostenEuro']} EUR laut Blatt ({abw:+.1%})")
    if isinstance(blatt.get("riy"), (int, float)):
        diff = e["riy"] - blatt["riy"]
        out["abweichungRiy"] = round(diff, 5)
        if abs(diff) > toleranz_riy:
            out["fehler"].append(f"RIY {e['riy']:.2%} gegen {blatt['riy']:.2%} laut Blatt ({diff * 100:+.2f} Pp)")
    out["bestanden"] = not out["fehler"]
    return out


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("dateien", nargs="*")
    p.add_argument("--toleranz-euro", type=float, default=TOLERANZ_EURO)
    p.add_argument("--toleranz-riy", type=float, default=TOLERANZ_RIY)
    a = p.parse_args(argv)
    dateien = a.dateien or sorted(glob.glob(os.path.join(ROOT, "data", "app", "tarife", "*.json")))
    geprueft = durchgefallen = 0
    for pfad in dateien:
        with open(pfad, encoding="utf-8") as f:
            tarif = json.load(f)
        faelle = (tarif.get("beleg") or {}).get("pruefung") or []
        name = f"{tarif.get('anbieter')} {tarif.get('tarifName')}"
        if a.dateien and not faelle:
            print(f"✗ {name}: kein beleg.pruefung")
            durchgefallen += 1
        for i, fall in enumerate(faelle):
            geprueft += 1
            erg = pruefe(fall, tarif, a.toleranz_euro, a.toleranz_riy)
            art = "einmal" if fall["einmal"] else "laufend"
            kopf = f"{name} [{i}] {art} {fall['jahre']} J."
            teile = []
            if "abweichungEuro" in erg:
                teile.append(f"Kosten {erg['kostenEuro']:.0f} EUR {erg['abweichungEuro']:+.1%}")
            if "abweichungRiy" in erg:
                teile.append(f"RIY {erg['riy']:.2%} {erg['abweichungRiy'] * 100:+.2f} Pp")
            werte = ", ".join(teile)
            if erg["bestanden"]:
                print(f"✓ {kopf}: {werte}")
            else:
                durchgefallen += 1
                print(f"✗ {kopf}: " + "; ".join(erg["fehler"]))
    print(f"\n{geprueft} Musterfaelle, {durchgefallen} durchgefallen")
    return 1 if durchgefallen else 0


if __name__ == "__main__":
    sys.exit(main())
