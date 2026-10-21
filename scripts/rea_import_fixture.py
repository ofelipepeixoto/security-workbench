"""Fixture autoral do subconjunto importado; NÃO é saída de uma execução REA.

Somente gera JSON em stdout. Não analisa nem executa JavaScript.
"""

from __future__ import annotations

import hashlib
import json


def synthetic_evidence(*, structural: bool = True) -> dict:
    digest = hashlib.sha256(b"inert synthetic JavaScript artifact, never executed").hexdigest()
    node_id = "jag_node_" + "1" * 64
    return {
        "fixture_notice": "SYNTHETIC: authored import-contract fixture, not a completed REA execution.",
        "evidence_id": "ev_" + "2" * 64,
        "provider": {"id": "rea-javascript-application", "name": "REA JavaScript application analyzer", "version": "1"},
        "operation": "analyze_javascript_application", "predicate_type": "rea.javascript-application-analysis",
        "authority": "shipped-artifact", "confidence": "derived",
        "subject": {"digest": {"sha256": digest}, "format": "directory", "local_path": "/synthetic/private-input", "name": "synthetic", "architecture": None},
        "normalized_result": {
            "input_path": "/synthetic/private-input", "format": "directory", "root_artifact_sha256": digest,
            "statistics": {"relevant_files": 1, "parsed_javascript_files": 1, "parse_failures": 0, "text_bytes_read": 64, "findings": int(structural)},
            "graph": {
                "schema": "JavaScriptApplicationGraph", "root_node_ids": [node_id],
                "coverage": {"status": "complete", "truncated": False, "omitted_count": 0, "limits": []},
                "nodes": [{
                    "node_id": node_id, "kind": "endpoint" if structural else "javascript-asset",
                    "identity": {"strategy": "canonical-path", "path": "fixture.js", "artifact_sha256": digest},
                    "observations": [{
                        "observation_id": "jag_observation_" + "3" * 64,
                        "properties": {"value": "https://example.invalid/inert-fixture", "status": "confirmed"},
                        "evidence": {
                            "authority": "ast-static-analysis", "state": "observed", "confidence": "exact",
                            "artifact": {"available": True, "artifact_id": "art_" + digest, "sha256": digest},
                            "location": {"available": True, "value": {"kind": "source-range", "source": "fixture.js", "start": {"line": 1, "column": 0}, "end": {"line": 1, "column": 30}}},
                        },
                    }],
                }],
            },
        },
    }


if __name__ == "__main__":
    print(json.dumps(synthetic_evidence(), indent=2))
