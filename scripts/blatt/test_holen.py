"""Tests fuer holen.py. Kein Netz: die Abruffunktion wird injiziert."""
import hashlib
import io
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import holen  # noqa: E402

REPO = holen.REPO


def abruf_mit(antworten, zaehler=None):
    """antworten: URL-Ende -> (status, body). Zaehlt die Aufrufe in zaehler (Liste)."""
    def abruf(url, akzept="*/*", timeout=60):
        if zaehler is not None:
            zaehler.append(url)
        for ende, (status, body) in antworten.items():
            if url.endswith(ende):
                return status, body, "application/pdf", url
        return 404, b"", "", url
    return abruf


def starte(argv, abruf):
    puffer = io.StringIO()
    code = holen.lauf(argv, abruf=abruf, schlafen=lambda s: None, ausgabe=puffer)
    return code, puffer.getvalue()


class Rfc9309Test(unittest.TestCase):
    def test_1_laengste_regel_gewinnt(self):
        text = "User-agent: *\nDisallow: /a/\nAllow: /a/b/\n"
        self.assertTrue(holen.rfc9309_erlaubt(text, "/a/b/x"))
        self.assertFalse(holen.rfc9309_erlaubt(text, "/a/c"))

    def test_2_wildcard_und_endanker(self):
        text = "User-agent: *\nDisallow: /*.pdf$\n"
        self.assertFalse(holen.rfc9309_erlaubt(text, "/x/y.pdf"))
        self.assertTrue(holen.rfc9309_erlaubt(text, "/x/y.pdf?v=1"))
        self.assertTrue(holen.rfc9309_erlaubt(text, "/x/y.html"))

    def test_3_gleichstand_allow_gewinnt(self):
        text = "User-agent: *\nDisallow: /a\nAllow: /a\n"
        self.assertTrue(holen.rfc9309_erlaubt(text, "/a/x"))

    def test_4_nur_gruppe_stern_zaehlt(self):
        text = "User-agent: bot\nDisallow: /\n\nUser-agent: *\nDisallow: /privat/\n"
        self.assertTrue(holen.rfc9309_erlaubt(text, "/offen/x"))
        self.assertFalse(holen.rfc9309_erlaubt(text, "/privat/x"))
        nur_bot = "User-agent: bot\nDisallow: /\n"
        self.assertTrue(holen.rfc9309_erlaubt(nur_bot, "/x"))


class EntscheideTest(unittest.TestCase):
    SPERRE = "User-agent: *\nDisallow: /\n"

    def test_5_404_und_410_erlaubt(self):
        self.assertEqual(holen.entscheide(404, "", "/x.pdf"), 0)
        self.assertEqual(holen.entscheide(410, "", "/x.pdf"), 0)

    def test_6_401_und_403_gesperrt(self):
        self.assertEqual(holen.entscheide(401, "", "/x.pdf"), 3)
        self.assertEqual(holen.entscheide(403, "", "/x.pdf"), 3)

    def test_7_5xx_gesperrt(self):
        self.assertEqual(holen.entscheide(500, "", "/x.pdf"), 3)
        self.assertEqual(holen.entscheide(503, "", "/x.pdf"), 3)

    def test_8_verbindungsfehler_gesperrt(self):
        self.assertEqual(holen.entscheide(None, "", "/x.pdf"), 3)

    def test_9_leere_robots_erlaubt(self):
        self.assertEqual(holen.entscheide(200, "", "/x.pdf"), 0)



class ExitZuordnungTest(unittest.TestCase):
    SPERRE = b"User-agent: *\nDisallow: /a/\n"

    def test_15_exit_zuordnung_verboten_2_unlesbar_3(self):
        for status, erwartet in ((200, 2), (403, 3)):
            zaehler = []
            aus = os.path.join(tempfile.mkdtemp(), "neu")
            self.addCleanup(shutil.rmtree, os.path.dirname(aus), True)
            code, _ = starte(["--aus", aus, "https://example.org/a/b.pdf"],
                             abruf_mit({"/robots.txt": (status, self.SPERRE)}, zaehler))
            self.assertEqual(code, erwartet)
            self.assertEqual(len(zaehler), 1)  # Blatt nie geladen
            self.assertFalse(os.path.exists(aus))


class OrdnerUndModiTest(unittest.TestCase):
    def setUp(self):
        self.aufraeumen = []

    def tearDown(self):
        for p in self.aufraeumen:
            shutil.rmtree(p, ignore_errors=True)

    def tmp(self, im_repo=False):
        p = tempfile.mkdtemp(dir=REPO if im_repo else None)
        self.aufraeumen.append(p)
        return p

    def test_10_zielordner_im_repo_abgelehnt(self):
        aus = self.tmp(im_repo=True)
        zaehler = []
        code, _ = starte(["--aus", aus, "https://example.org/a.pdf"],
                         abruf_mit({"/robots.txt": (200, b"")}, zaehler))
        self.assertEqual(code, 4)
        self.assertEqual(zaehler, [])
        aussen = os.path.join(self.tmp(), "neu")
        code, _ = starte(["--aus", aussen, "https://example.org/a.pdf"],
                         abruf_mit({"/robots.txt": (200, b""), "/a.pdf": (200, b"<html>x</html>")}))
        self.assertEqual(code, 0)

    def test_10b_zielordner_in_zweitem_worktree_des_repos_abgelehnt(self):
        wt = os.path.join(self.tmp(), "wt")
        add = subprocess.run(["git", "worktree", "add", "--detach", wt, "HEAD"],
                             cwd=REPO, capture_output=True, text=True)
        self.assertEqual(add.returncode, 0, add.stderr)
        self.addCleanup(subprocess.run, ["git", "worktree", "prune"],
                        cwd=REPO, capture_output=True)  # tearDown hat den Ordner schon geloescht
        zaehler = []
        for aus in (os.path.join(wt, "blatt-x"), os.path.join(wt, "scripts", "blatt-y")):
            with self.subTest(aus=aus):
                code, ausgabe = starte(["--aus", aus, "https://example.org/a.pdf"],
                                       abruf_mit({"/robots.txt": (200, b"")}, zaehler))
                self.assertEqual(code, 4)
                self.assertIn("Repo", ausgabe)
        self.assertEqual(zaehler, [])
        # Gegenrichtung: ein Ordner ausserhalb jedes Arbeitsbaums bleibt erlaubt.
        code, _ = starte(["--aus", os.path.join(self.tmp(), "neu"), "https://example.org/a.pdf"],
                         abruf_mit({"/robots.txt": (200, b""), "/a.pdf": (200, b"<html>x</html>")}))
        self.assertEqual(code, 0)

    def test_10c_ordner_ist_datei_meldet_kein_ordner(self):
        datei = os.path.join(self.tmp(), "f")
        with open(datei, "w") as f:
            f.write("x")
        self.assertIn("kein Ordner", holen.pruefe_ordner(datei))

    def test_11_nicht_leerer_ordner_abgelehnt(self):
        aus = self.tmp()
        with open(os.path.join(aus, "alt.txt"), "w") as f:
            f.write("x")
        code, _ = starte(["--aus", aus, "https://example.org/a.pdf"],
                         abruf_mit({"/robots.txt": (200, b"")}))
        self.assertEqual(code, 4)

    def test_12_lokal_datei_im_repo_abgelehnt(self):
        im_repo = os.path.join(self.tmp(im_repo=True), "x.pdf")
        aussen = os.path.join(self.tmp(), "x.pdf")
        for p in (im_repo, aussen):
            with open(p, "wb") as f:
                f.write(b"inhalt")
        code, _ = starte(["--aus", os.path.join(self.tmp(), "o1"), "--lokal", im_repo], abruf_mit({}))
        self.assertEqual(code, 4)
        code, _ = starte(["--aus", os.path.join(self.tmp(), "o2"), "--lokal", aussen], abruf_mit({}))
        self.assertEqual(code, 0)

    def test_13_lokal_sha256_ohne_netz(self):
        inhalt = b"Fixture Tarif Blatt\nKosten 1,2 %\n"
        datei = os.path.join(self.tmp(), "f.bin")
        with open(datei, "wb") as f:
            f.write(inhalt)
        aus = os.path.join(self.tmp(), "aus")
        zaehler = []
        code, ausgabe = starte(["--aus", aus, "--lokal", datei], abruf_mit({}, zaehler))
        self.assertEqual(code, 0)
        self.assertEqual(zaehler, [])
        self.assertIn(hashlib.sha256(inhalt).hexdigest(), ausgabe)
        with open(os.path.join(aus, "blatt.json"), encoding="utf-8") as f:
            self.assertIn(hashlib.sha256(inhalt).hexdigest(), f.read())

    def test_14_nur_robots_laedt_das_blatt_nicht(self):
        zaehler = []
        code, _ = starte(["--nur-robots", "https://example.org/a/b.pdf"],
                         abruf_mit({"/robots.txt": (200, b"")}, zaehler))
        self.assertEqual(code, 0)
        self.assertEqual(len(zaehler), 1)
        self.assertTrue(zaehler[0].endswith("/robots.txt"))


class WeiterleitungTest(unittest.TestCase):
    """Befund 1: Weiterleitungen duerfen robots nicht umgehen."""

    def abruf(self, karte, zaehler):
        def f(url, akzept="*/*", timeout=60):
            zaehler.append(url)
            if url in karte:
                return karte[url]
            return 404, b"", "", url
        return f

    def lauf(self, karte):
        zaehler = []
        aus = os.path.join(tempfile.mkdtemp(), "neu")
        self.addCleanup(shutil.rmtree, os.path.dirname(aus), True)
        code, ausgabe = starte(["--aus", aus, "https://example.org/ok/b.pdf"],
                               self.abruf(karte, zaehler))
        return code, ausgabe, zaehler

    def test_16_hostwechsel_exit_3_ziel_nie_geladen(self):
        karte = {"https://example.org/robots.txt": (200, b"", "", ""),
                 "https://example.org/ok/b.pdf": (301, b"", "", "https://fremd.example/x.pdf"),
                 "https://fremd.example/x.pdf": (200, b"%PDF-1.4", "application/pdf", "")}
        code, _, zaehler = self.lauf(karte)
        self.assertEqual(code, 3)
        self.assertNotIn("https://fremd.example/x.pdf", zaehler)

    def test_17_gleicher_host_verbotener_pfad_exit_2(self):
        karte = {"https://example.org/robots.txt": (200, b"User-agent: *\nDisallow: /geheim/\n", "", ""),
                 "https://example.org/ok/b.pdf": (302, b"", "", "/geheim/b.pdf"),
                 "https://example.org/geheim/b.pdf": (200, b"%PDF-1.4", "application/pdf", "")}
        code, _, zaehler = self.lauf(karte)
        self.assertEqual(code, 2)
        self.assertNotIn("https://example.org/geheim/b.pdf", zaehler)

    def test_18_gleicher_host_erlaubter_pfad_wird_geladen(self):
        karte = {"https://example.org/robots.txt": (200, b"User-agent: *\nDisallow: /geheim/\n", "", ""),
                 "https://example.org/ok/b.pdf": (301, b"", "", "/neu/b.pdf"),
                 "https://example.org/neu/b.pdf": (200, b"<html>kein pdf</html>", "text/html", "https://example.org/neu/b.pdf")}
        code, _, zaehler = self.lauf(karte)
        self.assertEqual(code, 0)
        self.assertIn("https://example.org/neu/b.pdf", zaehler)

    def test_19_weiterleitungsschleife_exit_3(self):
        karte = {"https://example.org/robots.txt": (200, b"", "", ""),
                 "https://example.org/ok/b.pdf": (301, b"", "", "/ok/b.pdf")}
        code, _, _ = self.lauf(karte)
        self.assertEqual(code, 3)

    def test_20_abruf_netz_folgt_nicht(self):
        import http.server
        import threading

        class H(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(302)
                self.send_header("Location", "/ziel")
                self.end_headers()

            def log_message(self, *a):
                pass
        srv = http.server.HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.server_close)
        self.addCleanup(srv.shutdown)
        status, _, _, ziel = holen.abruf_netz("http://127.0.0.1:%d/start" % srv.server_port)
        self.assertEqual(status, 302)
        self.assertEqual(ziel, "http://127.0.0.1:%d/ziel" % srv.server_port)


if __name__ == "__main__":
    unittest.main()
