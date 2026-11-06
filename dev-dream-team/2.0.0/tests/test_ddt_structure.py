from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class DDTStructureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.attachments = json.loads((ROOT / "ddt" / "attachments.json").read_text(encoding="utf-8"))

    def test_attachment_targets_exist_and_roles_require_kernel(self) -> None:
        modules = self.attachments["modules"]
        self.assertIn("kernel", modules)
        for name, module in modules.items():
            self.assertFalse(Path(module["path"]).is_absolute(), name)
            self.assertTrue((ROOT / module["path"]).is_file(), name)
        for role, policy in self.attachments["roles"].items():
            self.assertIn("kernel", policy["required"], role)
            role_file = ROOT / "skills" / role / "SKILL.md"
            self.assertTrue(role_file.is_file(), role)
            self.assertIn("role-composition.md", role_file.read_text(encoding="utf-8"), role)

    def test_direct_workflows_reference_their_boundary_and_manifests_match(self) -> None:
        for workflow, policy in self.attachments["workflows"].items():
            self.assertIn("kernel", policy["required"], workflow)
            text = (ROOT / "skills" / workflow / "SKILL.md").read_text(encoding="utf-8")
            self.assertIn("attachments.json", text, workflow)
        codex = json.loads((ROOT / ".codex-plugin" / "plugin.json").read_text(encoding="utf-8"))
        claude = json.loads((ROOT / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8"))
        self.assertEqual(codex["version"], "2.0.0")
        self.assertEqual(codex["version"], claude["version"])
        self.assertEqual(codex["name"], claude["name"])

    def test_cleanup_invariants_are_wired_without_legacy_fanout(self) -> None:
        orchestrator = (ROOT / "skills" / "project-orchestrator" / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("Choose one primary executor.", orchestrator)
        self.assertNotIn("Use `code-reviewer` on each increment.", orchestrator)
        self.assertNotIn("Phase 7 — Review", orchestrator)
        verifier = (ROOT / "skills" / "verify-change" / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("Bounded adjacent-risk check", verifier)
        updater = (ROOT / "skills" / "update-repository-context" / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("architecture_pressure", updater)
        self.assertIn("never hand-author replacement JSON", updater)
        self.assertTrue((ROOT / "scripts" / "ddt_bundle.py").is_file())

    def test_schemas_and_evaluation_registry_are_well_formed(self) -> None:
        for schema in (ROOT / "ddt" / "schemas").glob("*.json"):
            self.assertEqual(json.loads(schema.read_text(encoding="utf-8"))["schema_version"], 1)
        scenarios = json.loads((ROOT / "evals" / "scenarios.json").read_text(encoding="utf-8"))["scenarios"]
        scenario_ids = {entry["id"] for entry in scenarios}
        self.assertEqual(len(scenario_ids), len(scenarios))
        for entry in scenarios:
            self.assertTrue(entry["expected"], entry["id"])
            self.assertTrue(entry["forbidden"], entry["id"])
        registry = json.loads((ROOT / "evals" / "gap-registry.json").read_text(encoding="utf-8"))["entries"]
        for gap in registry:
            self.assertTrue(set(gap["scenarios"]).issubset(scenario_ids), gap["id"])


if __name__ == "__main__":
    unittest.main()
