import base64
import hashlib
import http.client
import re
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.parse import urlencode

from workbench.__main__ import render_report
from workbench.github import inspect_github
from workbench.store import authorize, connect, get_run, save_run
from workbench.web import create_server


REPO = "ofelipepeixoto/rea"
COMMIT = "a" * 40
TREE = "b" * 40
DATA = b'api_key = "fixture-not-a-real-credential"\n'
BLOB = hashlib.sha1(f"blob {len(DATA)}\0".encode() + DATA).hexdigest()


def responses():
    prefix = f"/repos/{REPO}"
    return {
        prefix: {"id": 123, "full_name": REPO},
        f"{prefix}/git/commits/{COMMIT}": {"sha": COMMIT, "tree": {"sha": TREE}},
        f"{prefix}/git/trees/{TREE}?recursive=1": {"sha": TREE, "truncated": False, "tree": [
            {"path": "config.py", "mode": "100644", "type": "blob", "sha": BLOB, "size": len(DATA)},
            {"path": "link.py", "mode": "120000", "type": "blob", "sha": BLOB, "size": len(DATA)},
        ]},
        f"{prefix}/git/blobs/{BLOB}": {"sha": BLOB, "size": len(DATA), "encoding": "base64", "content": base64.b64encode(DATA).decode()},
    }


class GitHubFlowTest(unittest.TestCase):
    def test_verified_commit_and_redacted_report(self):
        entries = responses()
        revision, result = inspect_github(REPO, COMMIT, request_json=entries.__getitem__)
        self.assertEqual(revision, COMMIT)
        self.assertEqual(result["files_read"], 1)
        self.assertTrue(result["partial"])
        self.assertEqual(len(result["findings"]), 1)
        with tempfile.TemporaryDirectory() as temp:
            with connect(Path(temp) / "data.sqlite3") as db:
                authorize(db, REPO)
                run_id = save_run(db, REPO, revision, result, source="github", verified_revision=True)
                report = render_report(get_run(db, run_id))
                self.assertIn("revisão verificada", report)
                self.assertNotIn("fixture-not-a-real-credential", report)
                self.assertIn("tipo não regular", report)

    def test_rejects_identity_commit_tree_and_blob_mismatch(self):
        prefix = f"/repos/{REPO}"
        for path, patch in [
            (prefix, {"full_name": "attacker/rea"}),
            (f"{prefix}/git/commits/{COMMIT}", {"sha": "c" * 40}),
            (f"{prefix}/git/trees/{TREE}?recursive=1", {"sha": "c" * 40}),
            (f"{prefix}/git/blobs/{BLOB}", {"content": base64.b64encode(b"X" * len(DATA)).decode()}),
        ]:
            with self.subTest(path=path):
                entries = responses()
                entries[path].update(patch)
                with self.assertRaises(ValueError):
                    inspect_github(REPO, COMMIT, request_json=entries.__getitem__)
        with self.assertRaises(ValueError):
            inspect_github(REPO, "main", request_json=responses().__getitem__)

    def test_truncated_tree_and_old_database_migration(self):
        entries = responses()
        entries[f"/repos/{REPO}/git/trees/{TREE}?recursive=1"]["truncated"] = True
        self.assertTrue(inspect_github(REPO, COMMIT, request_json=entries.__getitem__)[1]["partial"])
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "legacy.sqlite3"
            with sqlite3.connect(path) as old:
                old.execute("CREATE TABLE runs (id TEXT PRIMARY KEY, repo TEXT, revision TEXT, digest TEXT, created_at TEXT, partial INTEGER, files_read INTEGER, bytes_read INTEGER, omissions TEXT)")
                old.execute("INSERT INTO runs VALUES ('legacy', ?, 'declared', 'digest', 'date', 1, 0, 0, '[]')", (REPO,))
            with connect(path) as db:
                self.assertEqual(get_run(db, "legacy")["verified_revision"], 0)
                self.assertEqual(get_run(db, "legacy")["source"], "local")


class LocalWebTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.server, self.password = create_server(Path(self.temp.name) / "state.sqlite3", 0, scanner=lambda repo, sha: inspect_github(repo, sha, request_json=responses().__getitem__))
        self.addCleanup(self.server.server_close)
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(self.server.shutdown)
        self.port = self.server.server_port
        self.auth = "Basic " + base64.b64encode(f"operator:{self.password}".encode()).decode()

    def request(self, method, path, body=None, headers=None):
        client = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        client.request(method, path, body=body, headers=headers or {})
        response = client.getresponse()
        status, content = response.status, response.read().decode()
        client.close()
        return status, content

    def test_auth_csrf_scope_scan_and_report(self):
        host = f"127.0.0.1:{self.port}"
        self.assertEqual(self.request("GET", "/", headers={"Host": host})[0], 401)
        self.assertEqual(self.request("GET", "/", headers={"Host": "untrusted.test", "Authorization": self.auth})[0], 403)
        headers = {"Host": host, "Authorization": self.auth}
        status, page = self.request("GET", "/", headers=headers)
        self.assertEqual(status, 200)
        csrf = re.search(r"name='csrf' value='([^']+)'", page).group(1)
        post_headers = {**headers, "Content-Type": "application/x-www-form-urlencoded", "Origin": f"http://{host}"}
        self.assertEqual(self.request("POST", "/authorize", urlencode({"repo": REPO, "owned": "yes", "csrf": "wrong"}), post_headers)[0], 403)
        self.assertEqual(self.request("POST", "/authorize", urlencode({"repo": REPO, "owned": "yes", "csrf": csrf}), {**post_headers, "Origin": "http://evil.test"})[0], 403)
        self.assertEqual(self.request("POST", "/authorize", urlencode({"repo": REPO, "owned": "yes", "csrf": csrf}), post_headers)[0], 200)
        status, page = self.request("POST", "/scan", urlencode({"repo": REPO, "revision": COMMIT, "csrf": csrf}), post_headers)
        self.assertEqual(status, 200)
        run_id = re.search(r"Análise ([0-9a-f]{16})", page).group(1)
        status, report = self.request("GET", f"/report/{run_id}.md", headers=headers)
        self.assertEqual(status, 200)
        self.assertIn("revisão verificada", report)
        self.assertNotIn("fixture-not-a-real-credential", report)


if __name__ == "__main__":
    unittest.main()
