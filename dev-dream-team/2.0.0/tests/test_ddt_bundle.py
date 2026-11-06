from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "ddt_bundle.py"


class DDTBundleTests(unittest.TestCase):
    def test_resolves_explicit_bundle_from_a_standalone_skill_copy(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "bundle"
            for relative in (
                ".codex-plugin/plugin.json",
                "ddt/attachments.json",
                "ddt/kernel.md",
                "scripts/ddt_context.py",
            ):
                path = root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("{}", encoding="utf-8")
            standalone = Path(directory) / ".codex" / "skills" / "project-orchestrator" / "SKILL.md"
            standalone.parent.mkdir(parents=True)
            standalone.write_text("standalone", encoding="utf-8")
            env = dict(os.environ, DDT_BUNDLE_ROOT=str(root))
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--start", str(standalone)],
                text=True, capture_output=True, env=env, check=True,
            )
            payload = json.loads(result.stdout)
            self.assertEqual(Path(payload["root"]), root.resolve())
            self.assertTrue(Path(payload["attachments"]).is_file())


if __name__ == "__main__":
    unittest.main()
