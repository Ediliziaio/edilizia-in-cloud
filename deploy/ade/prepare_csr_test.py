import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("prepare_csr", Path(__file__).with_name("prepare-csr.py"))
csr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(csr)


class PrepareCSRTest(unittest.TestCase):
    def test_four_distinct_verified_pairs_and_idempotent_private_keys(self):
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory) / "requests"
            manifest = csr.prepare(out, "IT", "02010390439")
            self.assertEqual(manifest["status"], "DRAFT_NOT_SUBMITTED")
            self.assertFalse(manifest["portal_identity_verified"])
            self.assertEqual(len({r["public_key_sha256"] for r in manifest["requests"]}), 4)
            before = {p.name: (p.read_bytes(), p.stat().st_mtime_ns) for p in out.iterdir()}
            self.assertEqual(csr.prepare(out, "IT", "02010390439"), manifest)
            self.assertEqual({p.name: (p.read_bytes(), p.stat().st_mtime_ns) for p in out.iterdir()}, before)
            with self.assertRaises(ValueError):
                csr.prepare(out, "IT", "01234567890")
            (out / "test-client.key").chmod(0o644)
            with self.assertRaises(ValueError):
                csr.prepare(out, "IT", "02010390439")
            (out / "test-client.key").chmod(0o600)
            # A different, valid CSR must not be mistaken for the recorded pair.
            (out / "test-client.csr").write_bytes((out / "production-client.csr").read_bytes())
            with self.assertRaises(ValueError):
                csr.prepare(out, "IT", "02010390439")

    def test_invalid_subjects_and_symlink_are_rejected_without_generating_keys(self):
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory) / "requests"
            for country, code in [("IT", "02010390439/CN=other"), ("ITALY", "02010390439"), ("IT", "")]:
                with self.assertRaises(ValueError):
                    csr.prepare(out, country, code)
                self.assertFalse(out.exists())
            out.symlink_to(Path(directory), target_is_directory=True)
            with self.assertRaises(ValueError):
                csr.prepare(out, "IT", "02010390439")

    def test_partial_existing_directory_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory) / "requests"
            out.mkdir(mode=0o700)
            key = out / "test-client.key"
            key.write_bytes(b"existing key material")
            with self.assertRaises(FileNotFoundError):
                csr.prepare(out, "IT", "02010390439")
            self.assertEqual(key.read_bytes(), b"existing key material")


if __name__ == "__main__":
    unittest.main()
