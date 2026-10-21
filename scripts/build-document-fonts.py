"""Rebuild bundled open fonts used by portable DOCX exports (requires fontTools).

Sources retain their SIL Open Font License; no system/Microsoft fonts are copied.
Run from the repository root. Full font files are bundled, not glyph subsets.
"""
from pathlib import Path
from urllib.request import urlopen
from io import BytesIO
from hashlib import sha256
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

base = 'https://raw.githubusercontent.com/google/fonts/main/ofl/'
output = Path('public/fonts')
output.mkdir(exist_ok=True)

def read(path):
    with urlopen(base + path, timeout=60) as response:
        return response.read()

mono = read('notosansmono/NotoSansMono%5Bwdth,wght%5D.ttf')
assert sha256(mono).hexdigest() == '2cb2adb378a8f574213e23df697050b83c54c27df465a2015552740b2769a081', 'Upstream mono font changed; review before updating'
math = read('stixtwomath/STIXTwoMath-Regular.ttf')
assert sha256(math).hexdigest() == '562551b15b836e6e01d1b7350909baf3c8c8d83260c1190fbf4544333e6936de', 'Upstream math font changed; review source and license before updating'
font = TTFont(BytesIO(mono))
assert font['OS/2'].fsType == 0
for weight, style in [(400, 'Regular'), (700, 'Bold')]:
    face = instantiateVariableFont(font, {'wght': weight, 'wdth': 100}, inplace=False, updateFontNames=True)
    face.save(output / f'NotoSansMono-{style}.ttf')
# Preserve the original STIX file, including its reserved family name.
assert 'MATH' in TTFont(BytesIO(math))
(output / 'STIXTwoMath-Regular.ttf').write_bytes(math)
for directory, name in [('notosansmono', 'NotoSansMono'), ('stixtwomath', 'STIXTwoMath')]:
    (output / f'OFL-{name}.txt').write_bytes(read(directory + '/OFL.txt'))
