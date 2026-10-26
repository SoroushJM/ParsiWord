/** Classification stays independent of the lazy TeX/WASM rendering engine. */
export const isTikzLanguage = (language?: string | null): boolean => /^(tikz|tikzpicture)$/i.test(language?.trim() || '');

/** A useful first geometry exercise; no additional TikZ library is required. */
export const tikzSample = String.raw`\begin{tikzpicture}[scale=1.2]
\coordinate (O) at (0,0); \coordinate (A) at (2,0); \coordinate (B) at (60:2);
\draw[blue,thick] (O) circle (2);
\draw[thick] (A) -- (O) -- (B);
\draw[red,dashed] (A) -- (B) node[midway,right] {$x$};
\path (O) node[below left] {$O$} (A) node[right] {$A$} (B) node[above] {$B$};
\path (O) -- (A) node[midway,below] {$r=2$};
\end{tikzpicture}`;
export const tikzSampleInsertion = `\n\n\`\`\`tikz\n${tikzSample}\n\`\`\`\n\n`;
