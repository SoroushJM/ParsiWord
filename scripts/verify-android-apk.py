"""Check a signed ARM64 release APK before publishing it.

Usage: python scripts/verify-android-apk.py APK --compare-with PREVIOUS_APK
Requires Android SDK build-tools; does not start an emulator or install an app.
"""
import argparse
import hashlib
import json
import os
import re
import struct
import subprocess
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('apk', type=Path)
parser.add_argument('--compare-with', type=Path)
parser.add_argument('--report', type=Path)
args = parser.parse_args()
sdk = Path(os.environ['ANDROID_HOME'])
tools = sdk / 'build-tools' / '36.0.0'


def run(tool, *params):
    return subprocess.check_output([str(tools / tool), *map(str, params)], text=True)


def certificate(apk):
    output = run('apksigner', 'verify', '--min-sdk-version', '24', '--verbose', '--print-certs', apk)
    assert 'Verified using v2 scheme (APK Signature Scheme v2): true' in output
    return re.search(r'certificate SHA-256 digest: (\w+)', output).group(1)


fingerprint = certificate(args.apk)
if args.compare_with:
    assert fingerprint == certificate(args.compare_with), 'Signing key changed'
run('zipalign', '-c', '-P', '16', '4', args.apk)
badging = run('aapt', 'dump', 'badging', args.apk)
manifest = run('aapt', 'dump', 'xmltree', args.apk, 'AndroidManifest.xml')
assert "native-code: 'arm64-v8a'\n" in badging
assert "sdkVersion:'24'" in badging
assert "name='app.parsiword.mobile'" in badging
assert not re.search(r'android:(?:debuggable|testOnly)\([^\n]*0xffffffff', manifest), 'Not a normal release APK'
assert re.search(r'android:extractNativeLibs\([^\n]*0xffffffff', manifest), 'Native extraction not enabled'
version = re.search(r"versionCode='(\d+)' versionName='([^']+)'", badging)
bundle = next((Path(__file__).resolve().parents[1] / 'dist/assets').glob('index-*.js')).name
with zipfile.ZipFile(args.apk) as archive:
    assert archive.testzip() is None
    libraries = [p for p in archive.namelist() if p.endswith('.so')]
    assert libraries == ['lib/arm64-v8a/libparsiword_lib.so'], libraries
    entry = archive.getinfo(libraries[0])
    assert entry.compress_type == zipfile.ZIP_DEFLATED
    data = archive.read(entry)
    assert data[:6] == b'\x7fELF\x02\x01'
    assert struct.unpack_from('<H', data, 18)[0] == 183, 'ELF is not AArch64'
    offset = struct.unpack_from('<Q', data, 32)[0]
    size, count = struct.unpack_from('<HH', data, 54)
    alignments = []
    for i in range(count):
        start = offset + i * size
        if struct.unpack_from('<I', data, start)[0] != 1:
            continue
        file_offset, address, _, file_size, memory_size, alignment = struct.unpack_from('<6Q', data, start + 8)
        assert alignment >= 16384 and (address - file_offset) % alignment == 0
        assert file_size <= memory_size and file_offset + file_size <= len(data)
        alignments.append(alignment)
    assert alignments
    assert bundle.encode() in data, 'Latest frontend bundle is missing'
    assert b'ParsiWordSymbols-Regular.ttf' in data, 'Bundled delimiter font is missing'

result = {
    'version': version.group(2), 'versionCode': int(version.group(1)),
    'bytes': args.apk.stat().st_size,
    'sha256': hashlib.sha256(args.apk.read_bytes()).hexdigest(),
    'certificateSha256': fingerprint, 'architecture': 'arm64-v8a',
    'debuggable': False, 'testOnly': False, 'nativeExtraction': True,
    'nativeBytes': entry.file_size, 'nativeCompressedBytes': entry.compress_size,
    'elfLoadAlignments': alignments, 'frontendBundle': bundle,
    'signatureVerified': True, 'zipCrcVerified': True,
    'deviceInstallation': 'pending',
}
if args.report:
    args.report.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
