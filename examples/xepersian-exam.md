# سؤال‌نامهٔ فارسی با XeLaTeX و XePersian

این سند کامل در خود دستگاه اجرا می‌شود. قلم فارسی آن همراه برنامه است.

```xelatex
\documentclass[12pt,a4paper]{article}
\usepackage{amsmath,amssymb,tikz,geometry,enumitem}
\geometry{margin=2cm}
\usepackage{xepersian}
\settextfont[BoldFont=Vazirmatn-Bold.ttf]{Vazirmatn-Regular.ttf}
\begin{document}
\begin{center}
{\Large\bfseries آزمون ریاضی}\par
نام دانش‌آموز: \dotfill \hfill زمان: ۴۵ دقیقه
\end{center}
\begin{enumerate}
\item دو شعاع دایرهٔ زیر برابر $r=2$ و زاویهٔ مرکزی آن‌ها $60^\circ$ است.
با استفاده از رابطهٔ $x^2=r^2+r^2-2r^2\cos(60^\circ)$ طول وتر را بیابید.
\begin{center}
\begin{tikzpicture}[scale=0.85]
\coordinate (O) at (0,0);
\coordinate (A) at (2,0);
\coordinate (B) at (60:2);
\draw[blue,thick] (O) circle (2);
\draw[thick] (A)--(O)--(B);
\draw[red,dashed] (A)--(B) node[midway,right] {$x$};
\node[below left] at (O) {$O$};
\node[right] at (A) {$A$};
\node[above] at (B) {$B$};
\node at (0,-2.5) {\rl{دایره و دو شعاع}};
\end{tikzpicture}
\end{center}
\item انتگرال زیر را با تغییر متغیر مناسب محاسبه کنید:
\[
\int_0^\infty \frac{x^{a-1}}{1+x}\,dx
=\frac{\pi}{\sin(\pi a)},\qquad 0<a<1.
\]
\item مقادیر ویژهٔ ماتریس $A$ را به دست آورید:
\[
A=\begin{pmatrix}2&1\\1&2\end{pmatrix},\qquad
\det(A-\lambda I)=(2-\lambda)^2-1.
\]
\end{enumerate}
\end{document}
```
