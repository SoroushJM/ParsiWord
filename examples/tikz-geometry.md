# دایره و دو شعاع

شعاع دایره $r=2$ و زاویهٔ بین دو شعاع $60^\circ$ است. طول وتر $AB$ را به دست آورید.

```tikz
\usetikzlibrary{angles,quotes,calc}
\begin{tikzpicture}[scale=1.3]
\coordinate (O) at (0,0);
\coordinate (A) at (2,0);
\coordinate (B) at (60:2);
\draw[blue,thick] (O) circle (2);
\draw[thick] (A) -- (O) -- (B);
\draw[red,dashed] (A) -- (B) node[midway,right] {$x$};
\pic[draw,"$60^\circ$",angle radius=0.7cm] {angle=A--O--B};
\fill (O) circle (0.025) node[below left] {$O$};
\fill (A) circle (0.025) node[right] {$A$};
\fill (B) circle (0.025) node[above] {$B$};
\path (O) -- (A) node[midway,below] {$r=2$};
\end{tikzpicture}
```

این کد شکل همراه فایل Markdown ذخیره می‌شود؛ ویرایش کد شکل، پیش‌نمایش آن را به‌روز می‌کند.
