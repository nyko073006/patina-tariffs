#!/usr/bin/env python3
"""Holt ein Dokument (Produktinformationsblatt) robots-konform nach RFC 9309.

  python3 -I scripts/blatt/holen.py --aus <leerer Ordner ausserhalb des Repos> [--name blatt] [--pause 5] <url>
  python3 -I scripts/blatt/holen.py --nur-robots <url>
  python3 -I scripts/blatt/holen.py --aus <Ordner> --lokal <datei>

Schreibt PDF, Text und JSON (URL, Abrufdatum, SHA-256, Seitenzahl, Textzeichen)
nur in den Ordner von --aus. Der Ordner muss leer sein und ausserhalb dieses
Repos liegen. Blaetter gehoeren nie ins Repo.

Exit-Codes:
  0  geladen bzw. erlaubt
  2  robots.txt ist lesbar und verbietet den Pfad
  3  robots.txt nicht entscheidbar oder Sperre am Blatt (401/403, 5xx,
     Verbindungsfehler, Challenge)
  4  sonstiger Fehler (auch Ordnerpruefung)

Bewusste Abweichung vom RFC 9309: Der RFC liest 4xx der robots.txt als
"unavailable" (alles erlaubt). Hier sind nur 404 und 410 "keine robots.txt,
erlaubt". 401, 403 und alle uebrigen 4xx sperren, weil 403 hier eine
Cloudflare-Challenge oder ein Zugriffsverbot ist. 5xx und Verbindungsfehler
sperren wie im RFC ("unreachable"). Pythons robotparser ist nicht zulaessig:
er kennt keine Wildcards (* und $).

Pause: zwischen zwei Abrufen derselben Domain im selben Lauf liegen
mindestens --pause Sekunden. Zwischen getrennten Aufrufen muss der Aufrufer
die Pause einhalten; das Werkzeug schreibt keinen Zustand ausserhalb von --aus.
"""
import argparse
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) PatinaCharts-Recherche/1.0 (Einzelabruf)"
PAUSE_VORGABE = 5.0
KEIN_ROBOTS = (404, 410)
CHALLENGE_MARKER = ("cf-challenge", "just a moment", "captcha", "cf_chl")
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.realpath(__file__))))


def rfc9309_erlaubt(text, pfad):
    """Gruppe "*", laengste passende Regel gewinnt, bei Gleichstand Allow.
    Wildcards * und $ nach RFC 9309; leerer Disallow-Wert zaehlt nicht."""
    regeln, ingruppe, sammeln = [], False, False
    for zeile in text.splitlines():
        zeile = zeile.split("#")[0].strip()
        if not zeile or ":" not in zeile:
            continue
        k, v = [x.strip() for x in zeile.split(":", 1)]
        k = k.lower()
        if k == "user-agent":
            if not sammeln:
                ingruppe = False
            if v == "*":
                ingruppe = True
            sammeln = True
        else:
            sammeln = False
            if ingruppe and k in ("allow", "disallow") and v:
                regeln.append((k, v))
    beste_laenge, erlaubt = -1, True
    for k, v in regeln:
        muster = re.escape(v).replace(r"\*", ".*")
        if muster.endswith(r"\$"):
            muster = muster[:-2] + "$"
        if re.match(muster, pfad):
            if len(v) > beste_laenge or (len(v) == beste_laenge and k == "allow"):
                beste_laenge, erlaubt = len(v), (k == "allow")
    return erlaubt


def entscheide(status, text, pfad):
    """Exit-Code der robots-Entscheidung. status None = Verbindungsfehler."""
    if status is None:
        return 3
    if status in KEIN_ROBOTS:
        return 0
    if 200 <= status < 300:
        return 0 if rfc9309_erlaubt(text, pfad) else 2
    return 3


class _KeineWeiterleitung(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


_OPENER = urllib.request.build_opener(_KeineWeiterleitung)
MAX_WEITERLEITUNGEN = 5


def abruf_netz(url, akzept="*/*", timeout=60):
    """(status | None, bytes, content_type, final_url). Wirft nie.
    Folgt keinen Weiterleitungen: bei 3xx kommt der absolute Location-Wert als
    vierter Wert zurueck, das Ziel prueft der Aufrufer selbst gegen robots."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": akzept})
    try:
        with _OPENER.open(req, timeout=timeout) as r:
            return r.status, r.read(), r.headers.get("Content-Type", ""), r.geturl()
    except urllib.error.HTTPError as e:
        ziel = e.headers.get("Location") if e.headers else None
        if 300 <= e.code < 400 and ziel:
            return e.code, b"", "", urllib.parse.urljoin(url, ziel)
        return e.code, b"", "", url
    except Exception:
        return None, b"", "", url


class Pause:
    def __init__(self, sekunden, schlafen=time.sleep, uhr=time.monotonic):
        self.sekunden, self.schlafen, self.uhr, self.zuletzt = sekunden, schlafen, uhr, {}

    def vor(self, domain):
        if domain in self.zuletzt:
            warte = self.sekunden - (self.uhr() - self.zuletzt[domain])
            if warte > 0:
                self.schlafen(warte)
        self.zuletzt[domain] = self.uhr()


def _git_wurzel(ordner):
    p = ordner
    while not os.path.isdir(p):
        p = os.path.dirname(p)
    r = subprocess.run(["git", "rev-parse", "--show-toplevel"], cwd=p,
                       capture_output=True, text=True)
    return os.path.realpath(r.stdout.strip()) if r.returncode == 0 else None


def _im_repo(pfad):
    p = os.path.realpath(pfad)
    return p == REPO or p.startswith(REPO + os.sep)


def pruefe_ordner(aus):
    """None wenn der Ordner taugt (neu oder leer, ausserhalb des Repos), sonst Grund."""
    if _im_repo(aus) or _git_wurzel(os.path.realpath(aus)) == REPO:
        return "Zielordner liegt im Repo; Blaetter gehoeren nie ins Repo"
    if os.path.exists(aus):
        if not os.path.isdir(aus):
            return "Zielordner ist keine Ordner"
        if os.listdir(aus):
            return "Zielordner ist nicht leer"
    return None


def _meldung(out, code, ausgabe):
    print(json.dumps(out, ensure_ascii=False), file=ausgabe)
    return code


def _text_und_seiten(pfad_pdf, pfad_txt):
    subprocess.run(["pdftotext", "-layout", pfad_pdf, pfad_txt], check=False)
    zeichen = 0
    if os.path.exists(pfad_txt):
        with open(pfad_txt, encoding="utf-8", errors="replace") as f:
            zeichen = len(f.read().strip())
    info = subprocess.run(["pdfinfo", pfad_pdf], capture_output=True, text=True).stdout
    seiten = next((z.split()[-1] for z in info.splitlines() if z.startswith("Pages")), "?")
    return zeichen, seiten


def _schreibe_json(aus, name, out):
    with open(os.path.join(aus, name + ".json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)


def lokal(datei, aus, name, ausgabe):
    out = {"name": name, "quelle": "lokal", "datei": os.path.abspath(datei),
           "abrufdatum": datetime.date.today().isoformat()}
    if _im_repo(datei):
        out["ergebnis"] = "Datei liegt im Repo; Blaetter gehoeren nie ins Repo"
        return _meldung(out, 4, ausgabe)
    grund = pruefe_ordner(aus)
    if grund:
        out["ergebnis"] = grund
        return _meldung(out, 4, ausgabe)
    try:
        with open(datei, "rb") as f:
            data = f.read()
    except OSError as e:
        out["ergebnis"] = f"Fehler {type(e).__name__}: {e}"
        return _meldung(out, 4, ausgabe)
    os.makedirs(aus, exist_ok=True)
    out.update({"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    txt = os.path.join(aus, name + ".txt")
    if data.startswith(b"%PDF"):
        out["textzeichen"], out["seiten"] = _text_und_seiten(datei, txt)
    else:
        text = data.decode("utf-8", "replace")
        with open(txt, "w", encoding="utf-8") as f:
            f.write(text)
        out["textzeichen"], out["seiten"] = len(text.strip()), "?"
    out["text"] = txt
    out["ergebnis"] = "lokal gelesen"
    _schreibe_json(aus, name, out)
    return _meldung(out, 0, ausgabe)


def lauf(argv, abruf=abruf_netz, schlafen=time.sleep, ausgabe=sys.stdout):
    ap = argparse.ArgumentParser(description="Blatt robots-konform holen (RFC 9309)")
    ap.add_argument("url", nargs="?")
    ap.add_argument("--aus", help="neuer oder leerer Ordner ausserhalb des Repos")
    ap.add_argument("--name", default="blatt")
    ap.add_argument("--pause", type=float, default=PAUSE_VORGABE,
                    help="Sekunden zwischen Abrufen derselben Domain (Vorgabe 5)")
    ap.add_argument("--nur-robots", action="store_true",
                    help="nur die robots-Entscheidung, das Blatt wird nicht geladen")
    ap.add_argument("--lokal", metavar="DATEI",
                    help="kein Netz: SHA-256, Text und JSON aus einer gelieferten Datei")
    try:
        a = ap.parse_args(argv)
    except SystemExit:
        return 4
    out = {"name": a.name, "url": a.url, "abrufdatum": datetime.date.today().isoformat()}

    if a.lokal:
        if not a.aus:
            out["ergebnis"] = "--aus fehlt"
            return _meldung(out, 4, ausgabe)
        return lokal(a.lokal, a.aus, a.name, ausgabe)
    if not a.url:
        out["ergebnis"] = "URL fehlt"
        return _meldung(out, 4, ausgabe)
    if not a.nur_robots:
        if not a.aus:
            out["ergebnis"] = "--aus fehlt"
            return _meldung(out, 4, ausgabe)
        grund = pruefe_ordner(a.aus)
        if grund:
            out["ergebnis"] = grund
            return _meldung(out, 4, ausgabe)

    u = urllib.parse.urlparse(a.url)
    if u.scheme not in ("http", "https") or not u.netloc:
        out["ergebnis"] = "keine http(s)-Adresse"
        return _meldung(out, 4, ausgabe)
    pause = Pause(a.pause, schlafen)
    pause.vor(u.netloc)
    status, body, _, _ = abruf(f"{u.scheme}://{u.netloc}/robots.txt", "text/plain,*/*")
    pfad = (u.path or "/") + (("?" + u.query) if u.query else "")
    code = entscheide(status, body.decode("utf-8", "replace"), pfad)
    out["robots_status"] = status
    out["robots"] = {0: "erlaubt", 2: "verboten (RFC 9309)",
                     3: "nicht entscheidbar, als gesperrt gewertet"}[code]
    if code != 0:
        out["ergebnis"] = "nicht abgerufen: " + out["robots"]
        return _meldung(out, code, ausgabe)
    if a.nur_robots:
        out["ergebnis"] = "nur robots geprueft, nichts geladen"
        return _meldung(out, 0, ausgabe)

    robots_text = body.decode("utf-8", "replace")
    url, final = a.url, a.url
    for _ in range(MAX_WEITERLEITUNGEN + 1):
        pause.vor(u.netloc)
        status, data, ctype, final = abruf(url, "application/pdf,*/*")
        if status is None or not 300 <= status < 400:
            break
        ziel = urllib.parse.urlparse(urllib.parse.urljoin(url, final or ""))
        if ziel.scheme not in ("http", "https") or ziel.netloc.lower() != u.netloc.lower():
            out["ergebnis"] = ("Sperre: Weiterleitung auf anderen Host/Schema, "
                               "robots dort ungeprueft: " + (final or ""))
            return _meldung(out, 3, ausgabe)
        zpfad = (ziel.path or "/") + (("?" + ziel.query) if ziel.query else "")
        zcode = entscheide(200, robots_text, zpfad)
        if zcode != 0:
            out["ergebnis"] = "nicht abgerufen: Weiterleitungsziel verboten (RFC 9309): " + final
            return _meldung(out, zcode, ausgabe)
        url = ziel.geturl()
    else:
        out["ergebnis"] = "Sperre/Fehler: zu viele Weiterleitungen"
        return _meldung(out, 3, ausgabe)
    if status is None:
        out["ergebnis"] = "Sperre/Fehler: Verbindungsfehler"
        return _meldung(out, 3, ausgabe)
    if status in (401, 403, 429) or status >= 500:
        out["ergebnis"] = f"Sperre/Fehler HTTP {status}"
        return _meldung(out, 3, ausgabe)
    if not 200 <= status < 300:
        out["ergebnis"] = f"Fehler HTTP {status}"
        return _meldung(out, 4, ausgabe)
    out.update({"final_url": final, "content_type": ctype, "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest()})
    os.makedirs(a.aus, exist_ok=True)
    if not data.startswith(b"%PDF"):
        kopf = data[:4000].decode("utf-8", "replace").lower()
        if any(w in kopf for w in CHALLENGE_MARKER):
            out["ergebnis"] = "Sperre: Bot-Challenge, nicht umgehen"
            return _meldung(out, 3, ausgabe)
        p = os.path.join(a.aus, a.name + ".html")
        with open(p, "wb") as f:
            f.write(data)
        out.update({"datei": p, "ergebnis": "kein PDF (HTML gespeichert)"})
        _schreibe_json(a.aus, a.name, out)
        return _meldung(out, 0, ausgabe)
    p = os.path.join(a.aus, a.name + ".pdf")
    with open(p, "wb") as f:
        f.write(data)
    txt = os.path.join(a.aus, a.name + ".txt")
    zeichen, seiten = _text_und_seiten(p, txt)
    out.update({"datei": p, "text": txt, "textzeichen": zeichen, "seiten": seiten,
                "ergebnis": "geladen" if zeichen > 800
                else "geladen, aber kaum Text (Bild-PDF?), nicht als leer werten"})
    _schreibe_json(a.aus, a.name, out)
    return _meldung(out, 0, ausgabe)


if __name__ == "__main__":
    sys.exit(lauf(sys.argv[1:]))
