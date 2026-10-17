"""Download budgets count skipped binaries and zero-byte requests; no network."""

import base64
import hashlib
import unittest
from unittest.mock import patch

from workbench.github import inspect_github


class DownloadBudgetTest(unittest.TestCase):
    def acquire(self, payload, count, *, max_files, max_bytes):
        repo = "owner/repo"
        revision = "a" * 40
        tree = "b" * 40
        sha = hashlib.sha1(f"blob {len(payload)}\0".encode() + payload).hexdigest()
        blob_requests = []

        def fetch(path):
            if path == f"/repos/{repo}":
                return {"full_name": repo, "id": 1}
            if path == f"/repos/{repo}/git/commits/{revision}":
                return {"sha": revision, "tree": {"sha": tree}}
            if path == f"/repos/{repo}/git/trees/{tree}?recursive=1":
                return {"sha": tree, "truncated": False, "tree": [
                    {"path": f"file-{index:03}.py", "type": "blob", "mode": "100644",
                     "sha": sha, "size": len(payload)} for index in range(count)
                ]}
            self.assertEqual(path, f"/repos/{repo}/git/blobs/{sha}")
            blob_requests.append(path)
            return {"sha": sha, "size": len(payload), "encoding": "base64",
                    "content": base64.b64encode(payload).decode()}

        with patch("workbench.github.MAX_FILES", max_files), patch("workbench.github.MAX_TOTAL_BYTES", max_bytes):
            _, result = inspect_github(repo, revision, repository_id=1, request_json=fetch)
        return result, len(blob_requests)

    def test_skipped_binaries_consume_file_budget(self):
        result, requests = self.acquire(b"\0abc", 8, max_files=2, max_bytes=100)
        self.assertEqual(requests, 2)
        self.assertEqual((result["files_acquired"], result["bytes_acquired"]), (2, 8))
        self.assertEqual((result["files_read"], result["bytes_read"]), (0, 0))
        self.assertTrue(result["partial"])
        self.assertTrue(any("limite global" in item for item in result["omissions"]))

    def test_skipped_binaries_consume_byte_budget(self):
        result, requests = self.acquire(b"\0abc", 8, max_files=100, max_bytes=5)
        self.assertEqual(requests, 1)
        self.assertEqual((result["files_acquired"], result["bytes_acquired"]), (1, 4))
        self.assertEqual((result["files_read"], result["bytes_read"]), (0, 0))
        self.assertTrue(result["partial"])
        self.assertTrue(any("limite global" in item for item in result["omissions"]))

    def test_zero_byte_blobs_consume_request_budget(self):
        result, requests = self.acquire(b"", 8, max_files=2, max_bytes=0)
        self.assertEqual(requests, 2)
        self.assertEqual((result["files_acquired"], result["bytes_acquired"]), (2, 0))
        self.assertEqual((result["files_read"], result["bytes_read"]), (2, 0))
        self.assertTrue(result["partial"])
        self.assertTrue(any("limite global" in item for item in result["omissions"]))
