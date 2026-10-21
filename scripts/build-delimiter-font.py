"""Build the tiny Word fallback from the licensed upstream Unifont pixels.

Requires fontTools; no network is used. Shapes and source character values are
preserved. The renamed derivative is distributed under SIL OFL 1.1.
"""
import base64
import json
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

root = Path(__file__).resolve().parents[1]
source = root / 'scripts/font-source'
provenance = json.loads((source / 'provenance.json').read_text())
glyphs = {'.notdef': TTGlyphPen(None).glyph()}
metrics = {'.notdef': (512, 0)}
cmap = {}
for line in (source / 'delimiter-glyphs.hex').read_text().splitlines():
    code, bitmap = line.split(':')
    point = int(code, 16)
    width = len(bitmap) // 4
    name = f'uni{point:04X}'
    pen = TTGlyphPen(None)
    # Each filled horizontal run is a rectangle; this is a lossless tracing of
    # the upstream 16-pixel glyph, not a replacement punctuation design.
    for row in range(16):
        bits = f'{int(bitmap[row * width // 4:(row + 1) * width // 4], 16):0{width}b}'
        x = 0
        while x < width:
            if bits[x] == '0':
                x += 1
                continue
            start = x
            while x < width and bits[x] == '1':
                x += 1
            left, right, bottom = start * 64, x * 64, (13 - row) * 64
            pen.moveTo((left, bottom))
            pen.lineTo((left, bottom + 64))
            pen.lineTo((right, bottom + 64))
            pen.lineTo((right, bottom))
            pen.closePath()
    glyphs[name] = pen.glyph()
    metrics[name] = (width * 64, 0)
    cmap[point] = name

font = FontBuilder(1024, isTTF=True)
font.setupGlyphOrder(list(glyphs))
font.setupCharacterMap(cmap)
font.setupGlyf(glyphs)
font.setupHorizontalMetrics(metrics)
font.setupHorizontalHeader(ascent=896, descent=-128)
font.setupNameTable({
    'familyName': 'ParsiWord Symbols', 'styleName': 'Regular',
    'uniqueFontIdentifier': 'ParsiWordSymbols-Unifont18-1.0',
    'fullName': 'ParsiWord Symbols Regular', 'psName': 'ParsiWordSymbols-Regular',
    'version': 'Version 1.000', 'copyright': provenance['copyright'],
    'licenseDescription': 'SIL Open Font License version 1.1. Renamed subset of GNU Unifont 18.0.01.',
    'licenseInfoURL': 'https://openfontlicense.org',
})
font.setupOS2(sTypoAscender=896, sTypoDescender=-128, usWinAscent=896, usWinDescent=128, fsType=0)
font.setupPost()
font.setupMaxp()
font.font['head'].created = font.font['head'].modified = 3875385600
font.font.recalcTimestamp = False
path = root / 'public/fonts/ParsiWordSymbols-Regular.ttf'
font.save(path)
assert set(font.font.getBestCmap()) == set(cmap) and len(cmap) == 14
data = {'family': 'ParsiWord Symbols', 'codepoints': sorted(cmap), 'ttfBase64': base64.b64encode(path.read_bytes()).decode()}
(root / 'src/data/delimiter-font.json').write_text(json.dumps(data, separators=(',', ':')) + '\n')
print(f'{len(cmap)} glyphs, {path.stat().st_size} bytes, embedding permitted')
