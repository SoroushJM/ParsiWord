/* ParsiWord's isolated XeLaTeX runner. busytex.js is prepended by the owner
 * window, so neither importScripts nor worker fetches need a webview origin. */
self.fetch = () => Promise.reject(new Error('The TeX worker has no network access'));
const maximumPdfBytes = 16_000_000;
async function unpack(bytes, limit) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const parts = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length; if (length > limit) throw new Error('Runtime expansion exceeds its limit');
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length); let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
function environment(ENV) {
  Object.assign(ENV, {
    TEXMFCNF: '/texlive/texmf-dist/web2c', TEXMFROOT: '/texlive', TEXMFDIST: '/texlive/texmf-dist',
    TEXMFVAR: '/texlive/texmf-dist/texmf-var', TEXMFSYSVAR: '/texlive/texmf-dist/texmf-var',
    TEXMFSYSCONFIG: '/texlive/texmf-dist', TEXMFLOCAL: '/texlive/texmf-dist', TEXMFHOME: '/texlive/texmf-dist',
    TEXMFCONFIG: '/texlive/texmf-dist', TEXMF: '/texlive/texmf-dist', TEXMFDOTDIR: '.',
    TEXINPUTS: '.:/texlive/texmf-dist/tex//:', TFMFONTS: '.:/texlive/texmf-dist/fonts/tfm//',
    T1FONTS: '.:/texlive/texmf-dist/fonts/type1//', VFFONTS: '.:/texlive/texmf-dist/fonts/vf//',
    ENCFONTS: '.:/texlive/texmf-dist/fonts/enc//', OPENTYPEFONTS: '.:/texlive/texmf-dist/fonts/opentype//',
    TEXFONTMAPS: '.:/texlive/texmf-dist/fonts/map//:/texlive/texmf-dist/texmf-var/fonts/map//',
    TEXPSHEADERS: '.:/texlive/texmf-dist/dvips//:/texlive/texmf-dist/fonts/enc//:/texlive/texmf-dist/fonts/type1//',
  });
}
function fileDatabase(FS) {
  const base = '/texlive/texmf-dist', lines = ['% ls-R -- filename database.', ''];
  function walk(path) {
    const names = FS.readdir(path).filter(name => name !== '.' && name !== '..').sort();
    lines.push(path + ':', ...names, '');
    for (const name of names) if (FS.isDir(FS.stat(path + '/' + name).mode)) walk(path + '/' + name);
  }
  walk(base); FS.writeFile(base + '/ls-R', lines.join('\n'));
}
self.onmessage = async event => {
  const { source, wasm, tex, entries } = event.data;
  let log = '';
  const append = line => { log = (log + line + '\n').slice(-48_000); };
  try {
    const [binary, packed] = await Promise.all([unpack(wasm, 32_000_000), unpack(tex, 160_000_000)]);
    const compiled = await WebAssembly.compile(binary);
    let auxiliary = {};
    // Fresh C state on every pass; retaining an already-run TeX instance can
    // corrupt its font globals. Only bounded aux bytes cross the pass boundary.
    const passes = /\\(?:tableofcontents|listoffigures|listoftables)\b/.test(source) ? 3 : 2;
    for (let pass = 0; pass < passes; pass++) {
      const config = { thisProgram: '/bin/busytex', noInitialRun: true, noExitRuntime: true,
        print: append, printErr: append, locateFile: path => path,
        instantiateWasm: (imports, ready) => { WebAssembly.instantiate(compiled, imports).then(instance => ready(instance)); return {}; },
        preRun: [() => environment(config.ENV ??= {})],
      };
      const module = await busytex(config), FS = module.FS;
      const put = (path, bytes) => { FS.mkdirTree(path.slice(0, path.lastIndexOf('/')) || '/'); FS.writeFile(path, bytes); };
      for (const [path, start, length] of entries) {
        if (start < 0 || length < 0 || start + length > packed.length || !/^\/(?:texlive\/texmf-dist\/|Vazirmatn-(?:Regular|Bold)\.ttf$)/.test(path) || path.includes('..')) throw new Error('Invalid runtime file');
        put(path, packed.subarray(start, start + length));
      }
      fileDatabase(FS); put('/bin/busytex', ''); put('/document.tex', source);
      for (const [path, bytes] of Object.entries(auxiliary)) put(path, bytes);
      function run(args) { const code = module.callMain(args); module._flush_streams(); return code; }
      const exit = run(['xelatex', '--no-shell-escape', '--interaction=nonstopmode', '--halt-on-error', '--no-pdf', '--fmt=/texlive/texmf-dist/texmf-var/web2c/xetex/xelatex.fmt', 'document.tex']);
      if (exit !== 0) throw new Error('XeLaTeX compilation failed');
      const transcript = FS.readFile('/document.log', { encoding: 'utf8' });
      // A normal first pass is sufficient for exam questions. Rerun only when
      // TeX requests it, keeping the last successful PDF when the limit is hit.
      const rerun = /Rerun to get|Label\(s\) may have changed|undefined references|Rerun LaTeX/i.test(transcript);
      if (rerun && pass + 1 < passes) {
        auxiliary = {};
        for (const extension of ['aux', 'toc', 'out', 'lof', 'lot']) {
          try { const bytes = FS.readFile('/document.' + extension); if (bytes.length < 1_000_000) auxiliary['/document.' + extension] = bytes.slice(); } catch {}
        }
        continue;
      }
      if (run(['xdvipdfmx', '-o', '/document.pdf', '/document.xdv']) !== 0) throw new Error('PDF generation failed');
      const pdf = FS.readFile('/document.pdf');
      if (pdf.length > maximumPdfBytes) throw new Error('PDF exceeds its size limit');
      self.postMessage({ type: 'result', pdf, log }, [pdf.buffer]); return;
    }
  } catch (error) {
    const code = /fontspec Error|font .* cannot be found|font-not-found/i.test(log) ? 'XETEX_FONT_MISSING' : 'XETEX_COMPILE_FAILED';
    self.postMessage({ type: 'error', code, log, message: String(error) });
  }
};
