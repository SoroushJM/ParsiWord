import tempfile
import unittest
from pathlib import Path
from android_frontend import frontend_bundles


class FrontendEntries(unittest.TestCase):
    def test_vite_main_entry_does_not_require_obsolete_index_prefix(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'assets').mkdir()
            (root / 'assets/main-abcd.js').write_text('entry')
            (root / 'assets/shared-efgh.js').write_text('shared')
            (root / 'index.html').write_text('<link rel="modulepreload" href="./assets/shared-efgh.js"><script crossorigin src="./assets/main-abcd.js" type="module"></script>')
            self.assertEqual(frontend_bundles(root), ['assets/main-abcd.js'])

    def test_all_module_entries_are_verified(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ['first.js', 'second.js']:
                (root / name).write_text('entry')
            (root / 'index.html').write_text('<script type="module" src="./first.js"></script><script type="module" src="/second.js?version=1"></script>')
            self.assertEqual(frontend_bundles(root), ['first.js', 'second.js'])

    def test_missing_external_and_escaping_entries_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for source in ['', '<script type="module" src="./missing.js"></script>', '<script type="module" src="https://example.com/app.js"></script>', '<script type="module" src="../outside.js"></script>']:
                with self.subTest(source=source):
                    (root / 'index.html').write_text(source)
                    with self.assertRaises(ValueError):
                        frontend_bundles(root)


if __name__ == '__main__':
    unittest.main()
