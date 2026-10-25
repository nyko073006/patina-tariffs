#!/usr/bin/env python3
"""Belegquote als Kennzahl, abgeleitet aus den Daten (nie eingetragen).

Zaehlt in `data/app/tarife/*.json` die Tarife mit Feld `beleg` und stellt sie
`tariffs.json` gegenueber (`belegteFelder` je Tarif, `updatedAt` als Stand).
Exit 1, wenn
  - der Scan leer ist (nie "0/0 ist 100 %"),
  - Quelle und Bundle verschieden viele Tarife fuehren,
  - Quelle (`beleg`) und Bundle (`belegteFelder`) verschiedene Tarife als
    belegt fuehren.

Aufruf:  python3 -I scripts/blatt/quote.py [--json] [--tarife ORDNER] [--bundle DATEI]
"""
import argparse
import glob
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")


class QuoteFehler(Exception):
    pass


def _lade(pfad):
    with open(pfad, encoding="utf-8") as f:
        return json.load(f)


def berechne(tarife_ordner, bundle_pfad):
    dateien = sorted(glob.glob(os.path.join(tarife_ordner, "*.json")))
    if not dateien:
        raise QuoteFehler(f"Scan leer: keine Tarifdateien in {tarife_ordner}")
    quelle = [_lade(p) for p in dateien]
    bundle = _lade(bundle_pfad)
    b_tarife = bundle.get("tarife") or []
    if not b_tarife:
        raise QuoteFehler(f"Scan leer: keine Tarife in {bundle_pfad}")
    if len(b_tarife) != len(quelle):
        raise QuoteFehler(
            f"Anzahl weicht ab: {len(quelle)} Dateien in {tarife_ordner}, "
            f"{len(b_tarife)} Tarife im Bundle")
    q_belegt = {t["id"] for t in quelle if "beleg" in t}
    b_belegt = {t["id"] for t in b_tarife if "belegteFelder" in t}
    if q_belegt != b_belegt:
        nur_q = sorted(q_belegt - b_belegt)
        nur_b = sorted(b_belegt - q_belegt)
        raise QuoteFehler(
            "Quelle (beleg) und Bundle (belegteFelder) laufen auseinander: "
            f"nur in der Quelle belegt {nur_q}, nur im Bundle belegt {nur_b}")
    kategorien = {}
    for t in quelle:
        k = kategorien.setdefault(t.get("kategorie", "(ohne Kategorie)"),
                                  {"belegt": 0, "gesamt": 0})
        k["gesamt"] += 1
        k["belegt"] += t["id"] in q_belegt
    return {"belegt": len(q_belegt), "gesamt": len(quelle),
            "stand": bundle.get("updatedAt"), "kategorien": kategorien}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--tarife", default=os.path.join(ROOT, "data", "app", "tarife"))
    p.add_argument("--bundle", default=os.path.join(ROOT, "tariffs.json"))
    p.add_argument("--json", action="store_true", help="Ausgabe als JSON")
    a = p.parse_args(argv)
    try:
        erg = berechne(a.tarife, a.bundle)
    except (QuoteFehler, OSError, ValueError, KeyError) as e:
        print(f"✗ Belegquote: {e}", file=sys.stderr)
        return 1
    if a.json:
        print(json.dumps(erg, ensure_ascii=False, indent=2))
        return 0
    stand = (erg["stand"] or "unbekannt")[:10]
    print(f"Belegquote: {erg['belegt']}/{erg['gesamt']} (Stand tariffs.json {stand})")
    for name, k in sorted(erg["kategorien"].items()):
        print(f"  {name}: {k['belegt']}/{k['gesamt']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
