"""Verify used DOCX fonts have complete embedded faces; optionally compare source files.

python scripts/verify-docx-fonts.py file.docx --font-dir public/fonts
"""
import argparse, hashlib, io, json, uuid, zipfile
from pathlib import Path
from xml.etree import ElementTree as ET
from fontTools.ttLib import TTFont

p = argparse.ArgumentParser()
p.add_argument('document', type=Path)
p.add_argument('--font-dir', type=Path, action='append', default=[])
p.add_argument('--report', type=Path)
a = p.parse_args()
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'm': 'http://schemas.openxmlformats.org/officeDocument/2006/math'}
w, r, m = (f'{{{ns[x]}}}' for x in ('w', 'r', 'm'))
sources = {hashlib.sha256(f.read_bytes()).hexdigest(): f.name for root in a.font_dir for f in root.glob('*.[to]tf')}
with zipfile.ZipFile(a.document) as z:
    assert z.testzip() is None
    table = ET.fromstring(z.read('word/fontTable.xml'))
    rels = {x.get('Id'): x.get('Target') for x in ET.fromstring(z.read('word/_rels/fontTable.xml.rels'))}
    used = set()
    for part in ['word/document.xml', 'word/styles.xml', 'word/numbering.xml']:
        if part not in z.namelist(): continue
        for font in ET.fromstring(z.read(part)).iter(w + 'rFonts'):
            used.update(font.get(w + slot) for slot in ['ascii', 'hAnsi', 'eastAsia', 'cs'] if font.get(w + slot))
    settings = ET.fromstring(z.read('word/settings.xml'))
    used.update(x.get(m + 'val') for x in settings.iter(m + 'mathFont'))
    faces = []
    embedded = set()
    for font in table.findall(w + 'font'):
        name = font.get(w + 'name')
        for style in ['embedRegular', 'embedBold', 'embedItalic', 'embedBoldItalic']:
            ref = font.find(w + style)
            if ref is None: continue
            key = uuid.UUID(ref.get(w + 'fontKey')).bytes[::-1]
            data = bytearray(z.read('word/' + rels[ref.get(r + 'id')]))
            for i in range(32): data[i] ^= key[i % 16]
            face = TTFont(io.BytesIO(data))
            assert not face['OS/2'].fsType & 2, f'{name}: restricted embedding'
            digest = hashlib.sha256(data).hexdigest()
            if sources: assert digest in sources, f'{name} {style}: complete source bytes differ'
            embedded.add(name)
            faces.append({'family': name, 'face': style, 'bytes': len(data), 'sha256': digest,
                          'matchesSource': sources.get(digest), 'hasMathTable': 'MATH' in face})
    assert used <= embedded, f'Used but not embedded: {used - embedded}'
    flag = settings.find(w + 'embedTrueTypeFonts')
    assert flag is not None and flag.get(w + 'val') not in ['false', '0', 'off']
    result = {'document': a.document.name, 'usedFamilies': sorted(used), 'faces': faces,
              'allUsedFamiliesEmbedded': True, 'completeSourceByteCheck': bool(sources)}
    if a.report: a.report.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps(result, indent=2, ensure_ascii=False))
