"""Find the actual frontend module entries instead of guessing Vite filenames."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


def frontend_bundles(dist: Path) -> list[str]:
    class Scripts(HTMLParser):
        sources: list[str]

        def __init__(self):
            super().__init__()
            self.sources = []

        def handle_starttag(self, tag, attrs):
            attributes = dict(attrs)
            if tag == 'script' and attributes.get('type') == 'module' and attributes.get('src'):
                self.sources.append(attributes['src'])

    dist = dist.resolve()
    parser = Scripts()
    parser.feed((dist / 'index.html').read_text(encoding='utf-8'))
    if not parser.sources:
        raise ValueError('Built index.html contains no frontend module script')
    bundles = []
    for source in parser.sources:
        url = urlsplit(source)
        if url.scheme or url.netloc:
            raise ValueError('APK entry scripts must be local application assets')
        path = (dist / unquote(url.path).lstrip('/')).resolve()
        if not path.is_relative_to(dist) or not path.is_file() or path.suffix != '.js':
            raise ValueError(f'Built frontend module is missing or invalid: {source}')
        bundles.append(path.relative_to(dist).as_posix())
    return bundles
