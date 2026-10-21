import contextlib
import copy
import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.rea_import_fixture import synthetic_evidence
from workbench.__main__ import main, render_report
from workbench.rea import MAX_REPORT_BYTES, parse_rea_evidence, read_evidence
from workbench.store import authorize, compare, connect, get_run, review, save_run


def encoded(value):
    return json.dumps(value).encode()


class ReaImportTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.evidence = synthetic_evidence()

    def test_structural_projection_never_confirms_or_copies_source_values(self):
        observation = self.evidence["normalized_result"]["graph"]["nodes"][0]["observations"][0]
        observation["properties"]["value"] = "https://user:inert-secret@example.invalid/?token=inert-secret"
        observation["properties"]["code"] = "raise SystemExit('must never execute')"
        raw = encoded(self.evidence)
        result = parse_rea_evidence(raw)
        self.assertEqual(len(result["findings"]), 1)
        self.assertEqual(result["findings"][0]["status"], "candidate")
        self.assertEqual(result["findings"][0]["confidence"], "low")
        self.assertTrue(result["partial"])
        self.assertEqual(result["provenance"]["report_sha256"], hashlib.sha256(raw).hexdigest())
        self.assertFalse(result["provenance"]["execution_verified"])
        self.assertFalse(result["provenance"]["network_isolation_verified"])
        projected = json.dumps(result)
        for sensitive in ["inert-secret", "example.invalid", "/synthetic/private-input", "SystemExit"]:
            self.assertNotIn(sensitive, projected)

    def test_cli_scope_import_review_report_comparison_and_no_code_execution(self):
        state, path = self.base / "state.sqlite3", self.base / "evidence.json"
        path.write_bytes(encoded(self.evidence))
        marker = self.base / "executed"
        (self.base / "fixture.js").write_text(f"throw new Error('never execute'); require('fs').writeFileSync({str(marker)!r}, 'BAD');", encoding="utf-8")
        args = ["--state", str(state), "import-rea", "--repo", "ofelipepeixoto/rea", "--revision", "a" * 40, "--evidence", str(path)]
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(main(args), 2)
        db = connect(state)
        self.addCleanup(db.close)
        authorize(db, "ofelipepeixoto/rea", 1417322346)
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.assertEqual(main(args), 0)
        self.assertIn("execução REA não comprovada", output.getvalue())
        run_id = db.execute("SELECT id FROM runs").fetchone()[0]
        run = get_run(db, run_id)
        self.assertEqual(run["repository_id"], 1417322346)
        self.assertEqual(run["source"], "rea-import")
        self.assertFalse(run["verified_revision"])
        self.assertFalse(marker.exists())
        finding = run["findings"][0]
        review(db, run_id, finding["fingerprint"], "false_positive")
        report = render_report(get_run(db, run_id))
        self.assertIn("Proveniência REA importada", report)
        self.assertIn("false_positive", report)
        self.assertNotIn("/synthetic/private-input", report)
        second = parse_rea_evidence(encoded(synthetic_evidence(structural=False)))
        second["repository_id"] = 1417322346
        second_id = save_run(db, "ofelipepeixoto/rea", "b" * 40, second, source="rea-import")
        self.assertEqual(compare(db, run_id, second_id)["no_longer_detected"], [finding["fingerprint"]])
        self.assertTrue(compare(db, run_id, second_id)["partial"])
        with self.assertRaises(ValueError):
            save_run(db, "ofelipepeixoto/rea", "a" * 40, second, source="rea-import", verified_revision=True)
        github_id = save_run(db, "ofelipepeixoto/rea", "b" * 40, second, source="github", verified_revision=True)
        with self.assertRaisesRegex(ValueError, "mesmo analisador"):
            compare(db, run_id, github_id)

    def test_invalid_json_shapes_bounds_and_no_reflected_parser_values(self):
        invalid = [b"{}", b"[]", b'{"secret":"inert-private",}', b'{"a":1,"a":2}', b'{"a":NaN}', b'{"a":1e999}', b'\xff', b'{"x":"\\ud800"}', b"[" * 33 + b"0" + b"]" * 33, b" " * (MAX_REPORT_BYTES + 1), encoded({"x": "a" * 16385})]
        for data in invalid:
            with self.subTest(data_size=len(data)):
                with self.assertRaisesRegex(ValueError, "^Evidence REA inválido") as caught:
                    parse_rea_evidence(data)
                self.assertNotIn("inert-private", str(caught.exception))

    def test_wrong_provider_binding_coverage_or_untrusted_location_fail_closed(self):
        mutations = [
            lambda e: e.update(operation="capture_browser_scenario"),
            lambda e: e["provider"].update(version="6.4.0"),
            lambda e: e["subject"]["digest"].update(sha256="0" * 64),
            lambda e: e["normalized_result"]["statistics"].update(relevant_files=True),
            lambda e: e["normalized_result"]["graph"]["coverage"].update(status="complete", truncated=True),
            lambda e: e["normalized_result"]["graph"].update(root_node_ids=[{}]),
            lambda e: e["normalized_result"]["graph"]["nodes"][0]["observations"][0]["evidence"]["location"]["value"].update(source="../outside.js"),
            lambda e: e["normalized_result"]["graph"]["nodes"][0]["observations"][0]["evidence"]["location"]["value"].update(source="https://example.invalid/app.js"),
            lambda e: e["normalized_result"]["graph"]["nodes"][0]["observations"][0]["evidence"]["location"]["value"]["end"].update(line=0),
        ]
        for mutate in mutations:
            evidence = copy.deepcopy(self.evidence)
            mutate(evidence)
            with self.assertRaises(ValueError):
                parse_rea_evidence(encoded(evidence))

    def test_runtime_unknown_and_benign_observations_do_not_become_findings(self):
        benign = parse_rea_evidence(encoded(synthetic_evidence(structural=False)))
        self.assertEqual(benign["findings"], [])
        self.assertTrue(benign["partial"])
        self.evidence["normalized_result"]["graph"]["nodes"][0]["observations"][0]["evidence"].update(authority="passive-cdp-runtime")
        result = parse_rea_evidence(encoded(self.evidence))
        self.assertEqual(result["findings"], [])
        self.assertEqual(result["provenance"]["observations_omitted"], 1)

    def test_surrogate_pairs_are_valid_but_orphan_surrogates_in_keys_are_not(self):
        text = '{"ignored":"' + '\\ud83d\\ude00' * 16384 + '",' + encoded(self.evidence).decode()[1:]
        self.assertEqual(len(parse_rea_evidence(text.encode())["findings"]), 1)
        text = '{"\\ud800":true,' + encoded(self.evidence).decode()[1:]
        with self.assertRaises(ValueError):
            parse_rea_evidence(text.encode())

    def test_candidate_cap_is_explicit_and_fingerprints_ignore_external_review_status(self):
        observations = self.evidence["normalized_result"]["graph"]["nodes"][0]["observations"]
        original = observations[0]
        for index in range(1, 105):
            item = copy.deepcopy(original)
            item["observation_id"] = "jag_observation_" + f"{index:064x}"
            observations.append(item)
        result = parse_rea_evidence(encoded(self.evidence))
        self.assertEqual(len(result["findings"]), 100)
        self.assertEqual(result["provenance"]["observations_omitted"], 5)
        self.assertTrue(all(item["status"] == "candidate" for item in result["findings"]))

    def test_reader_rejects_links_nonregular_and_oversize_without_following(self):
        path = self.base / "report.json"
        path.write_bytes(encoded(self.evidence))
        self.assertEqual(read_evidence(path), path.read_bytes())
        with patch("workbench.rea.os.O_NOFOLLOW", 0):
            with self.assertRaises(ValueError):
                read_evidence(path)
        alias = self.base / "alias.json"
        alias.symlink_to(path)
        with self.assertRaises((OSError, ValueError)):
            read_evidence(alias)
        with self.assertRaises((OSError, ValueError)):
            read_evidence(self.base)
        path.write_bytes(b"x" * (MAX_REPORT_BYTES + 1))
        with self.assertRaises(ValueError):
            read_evidence(path)


if __name__ == "__main__":
    unittest.main()
