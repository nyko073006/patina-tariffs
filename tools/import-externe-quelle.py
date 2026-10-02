#!/usr/bin/env python3
"""
import-externe-quelle.py — übernimmt Kostenwerte einer externen Quelle (CSV)
in data/app/tarife/<slug>.json.

Die CSV liegt NIE im Repo. Sie wird von einem Pfad außerhalb gelesen
(Default /Users/nyko/tariffs_analysis.csv): Semikolon, UTF-8 mit BOM,
Minus als U+2212, Beträge mit Leerzeichen vor „€".

Zuordnung Tarifname -> Tarif-ID: tools/zuordnung-externe-quelle.json.
Zeilen mit null werden nicht geraten, sondern gelistet.

Mapping (Einheiten der Quelle: Prozent bzw. €/Jahr, die App rechnet in Anteilen):
    alphaRate          = Alpha_Rate_Pct / 100
    gammaAnnualRate    = Gamma_Rate_Pct / 100
    kappaMonthly       = Beta_Stk / 12          (nur wenn Beta_Stk > 0, siehe unten)
    zillmerdauerMonate = Alpha_Years * 12
    gammaBeitragsfrei  = Gamma_Bfrei_Pct / 100
    quelle             = "externe Quelle"
    betaRate           bleibt aus dem bestehenden Datensatz.
    Alpha2_Pct         wird nicht übernommen (Bedeutung unklar), nur gemeldet.
    gammaRentenphase   gibt die Quelle nicht her, wird nicht gesetzt.

Zwei bewusste Abweichungen vom reinen Mapping:
  * effectiveCostRIY: Effektivkosten_Pct ist in der Quelle für alle Zeilen
    identisch (Platzhalter ohne Aussage). Nur mit --mit-effektivkosten.
  * kappaMonthly: Beta_Stk ist nur bei wenigen Tarifen gefüllt (0 heißt
    „nicht angegeben", nicht „keine Stückkosten"). 0 würde den bisherigen,
    belegten Stückkostenwert löschen und die Police zu günstig rechnen.
    Nur mit --nullwerte-uebernehmen wird auch 0 geschrieben.

Aufruf:
    python3 tools/import-externe-quelle.py --dry-run
    python3 tools/import-externe-quelle.py [pfad/zur.csv]
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARIFE = ROOT / "data" / "app" / "tarife"
ZUORDNUNG = Path(__file__).resolve().parent / "zuordnung-externe-quelle.json"
STANDARD_CSV = "/Users/nyko/tariffs_analysis.csv"
QUELLE = "externe Quelle"


def zahl(text: str) -> float:
    """Parst „1,5 €", „−3,2", „2.5" (U+2212, Komma, Leerzeichen, €)."""
    t = text.replace("−", "-").replace("€", "").replace("\xa0", "").replace(" ", "").strip()
    if t == "":
        return 0.0
    return float(t.replace(",", "."))


def lies_csv(pfad: Path) -> list[dict[str, str]]:
    text = pfad.read_text(encoding="utf-8-sig")
    return list(csv.DictReader(io.StringIO(text), delimiter=";"))


def neue_werte(z: dict[str, str], mit_effektiv: bool, nullwerte: bool) -> dict:
    w: dict = {
        "alphaRate": round(zahl(z["Alpha_Rate_Pct"]) / 100, 8),
        "gammaAnnualRate": round(zahl(z["Gamma_Rate_Pct"]) / 100, 8),
        "zillmerdauerMonate": int(round(zahl(z["Alpha_Years"]) * 12)),
        "gammaBeitragsfrei": round(zahl(z["Gamma_Bfrei_Pct"]) / 100, 8),
        "quelle": QUELLE,
    }
    stk = zahl(z["Beta_Stk"])
    if stk > 0 or nullwerte:
        w["kappaMonthly"] = round(stk / 12, 6)
    if mit_effektiv:
        w["effectiveCostRIY"] = round(zahl(z["Effektivkosten_Pct"]) / 100, 8)
    return w


def slug(text: str) -> str:
    t = text.lower().replace("ü", "u").replace("ö", "o").replace("ä", "a").replace("ß", "ss")
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def neuer_tarif(cfg: dict, z: dict[str, str], nullwerte: bool) -> tuple[Path, dict]:
    """Grundgerüst für einen Tarif, den es im Datenbestand noch nicht gibt.

    Kosten kommen aus der Quelle (über neue_werte, danach). Alles andere sind
    Schätzwerte (Median der Kategorie, siehe Zuordnungsdatei) und stehen im
    Feld quelle, damit die Lücke im Datensatz sichtbar bleibt.
    """
    basis = {
        "id": cfg["id"], "anbieter": cfg["anbieter"], "tarifName": cfg["tarifName"],
        "jahrgang": cfg["jahrgang"], "kategorie": cfg["kategorie"], "vehikelTyp": cfg["vehikelTyp"],
        "effectiveCostRIY": cfg["effectiveCostRIY"],
    }
    basis.update(cfg["schaetzwerte"])
    geschaetzt = ["fundTER", "betaRate", "rentenfaktor", "typischeBruttorendite"]
    if zahl(z["Beta_Stk"]) > 0 or nullwerte:
        basis.pop("kappaMonthly", None)  # kommt aus der Quelle
    else:
        geschaetzt.append("kappaMonthly")
    geschaetzt += ["kategorie", "jahrgang"]
    basis["quelle"] = f"{QUELLE}; Schätzwert (Kategorie-Median): " + ", ".join(geschaetzt)
    datei = TARIFE / f"{slug(cfg['anbieter'])}--{slug(cfg['tarifName'])}.json"
    return datei, basis


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv", nargs="?", default=STANDARD_CSV)
    ap.add_argument("--dry-run", action="store_true", help="nur Diff je Tarif zeigen, nichts schreiben")
    ap.add_argument("--mit-effektivkosten", action="store_true")
    ap.add_argument("--nullwerte-uebernehmen", action="store_true")
    a = ap.parse_args()

    pfad = Path(a.csv)
    if not pfad.is_file():
        print(f"CSV nicht gefunden: {pfad}", file=sys.stderr)
        return 1
    try:
        pfad.resolve().relative_to(ROOT)
        print("Die CSV darf nicht im Repo liegen.", file=sys.stderr)
        return 1
    except ValueError:
        pass

    zeilen = lies_csv(pfad)
    konfig = json.loads(ZUORDNUNG.read_text(encoding="utf-8"))
    karte = konfig["zuordnung"]
    neue_tarife = {k: v for k, v in konfig.get("neue_tarife", {}).items() if not k.startswith("_")}
    neu_angelegt: list[str] = []
    dateien = {}
    for f in sorted(TARIFE.glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        dateien[d["id"].lower()] = (f, d)

    fehler = []
    zugeordnet, nicht_zugeordnet, alpha2 = [], [], []
    geaendert = 0
    for z in zeilen:
        name = z["Tarif"]
        if name not in karte:
            fehler.append(f"'{name}' fehlt in der Zuordnungstabelle")
            continue
        if zahl(z.get("Alpha2_Pct", "0")) != 0:
            alpha2.append(name)
        tid = karte[name]
        if tid is None:
            nicht_zugeordnet.append(name)
            continue
        if tid.lower() not in dateien and name in neue_tarife:
            datei, alt = neuer_tarif(neue_tarife[name], z, a.nullwerte_uebernehmen)
            neu_angelegt.append(name)
        elif tid.lower() not in dateien:
            fehler.append(f"'{name}': ID {tid} existiert nicht in data/app/tarife")
            continue
        else:
            datei, alt = dateien[tid.lower()]
        zugeordnet.append(name)
        neu = dict(alt)
        for k, v in neue_werte(z, a.mit_effektivkosten, a.nullwerte_uebernehmen).items():
            if k == "quelle" and name in neu_angelegt:
                continue  # nennt schon die geschätzten Felder
            if alt.get(k) != v:
                neu[k] = v
        diffs = [(k, alt.get(k), neu[k]) for k in neu if alt.get(k) != neu[k]]
        print(f"{name}  ->  {datei.name}")
        if not diffs:
            print("    unverändert")
            continue
        geaendert += 1
        for k, o, n in diffs:
            print(f"    {k}: {o!r} -> {n!r}")
        if not a.dry_run:
            datei.write_text(json.dumps(neu, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    doppelt = [t for t in set(v.lower() for v in karte.values() if v) if sum(1 for v in karte.values() if v and v.lower() == t) > 1]
    for t in doppelt:
        fehler.append(f"ID {t} ist mehreren Namen zugeordnet")

    ohne = [d["tarifName"] for tid, (f, d) in dateien.items() if not any((v or "").lower() == tid for v in karte.values())]
    print()
    print(f"Neu angelegt: {len(neu_angelegt)}  {'; '.join(neu_angelegt)}")
    print(f"Zeilen: {len(zeilen)}  zugeordnet: {len(zugeordnet)}  nicht zugeordnet: {len(nicht_zugeordnet)}  geändert: {geaendert}")
    print("Nicht zugeordnet:", "; ".join(nicht_zugeordnet))
    print(f"App-Tarife ohne Quelle (unverändert): {len(ohne)} von {len(dateien)}")
    print("Alpha2 != 0 (nicht übernommen):", "; ".join(alpha2))
    if a.dry_run:
        print("(dry-run: nichts geschrieben)")
    for f in fehler:
        print("FEHLER:", f, file=sys.stderr)
    return 1 if fehler else 0


if __name__ == "__main__":
    sys.exit(main())
