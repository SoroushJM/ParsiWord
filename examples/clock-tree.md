# دیاگرام توزیع کلاک

بازسازی دیاگرام مرجع با TikZ و برچسب‌های انگلیسی. کد زیر را می‌توان در پارسی‌ورد نمایش داد و ویرایش کرد.

```tikz
\usetikzlibrary{arrows.meta,calc}
\begin{tikzpicture}[
  x=0.85cm,y=0.85cm,
  font=\sffamily\scriptsize,
  >=Latex,
  block/.style={draw=black!65,fill=gray!12,align=center,
    minimum width=2.4cm,minimum height=1.2cm,inner sep=3pt},
  function/.style={fill=yellow!85!orange,draw=none,align=center,
    minimum width=1.25cm,minimum height=1.25cm,inner sep=2pt},
  peripheral/.style={draw=blue!55,fill=green!18!gray!25,align=center,
    minimum width=1.2cm,minimum height=1.2cm,inner sep=2pt},
  pin/.style={draw=black!65,fill=gray!12,inner sep=1pt,
    font=\sffamily\tiny},
  label/.style={fill=white,inner sep=1.5pt},
  violetclock/.style={draw=violet!85!blue},
  pllclock/.style={draw=red!85},
  rcclock/.style={draw=cyan!75!blue},
  lfclock/.style={draw=orange!90!red},
  sysclock/.style={draw=blue!60!cyan},
  tap/.style={draw=yellow!75!orange}
]

% Clock sources and the main oscillator rail.
\node[block] (rcint) at (1.8,9.5) {Internal RC\\3.2 MHz};
\draw[->,thick] (-0.3,9.8) -- (rcint.west |- 0,9.8);
\node[anchor=north west] at (rcint.north west) {En};

\node[block] (osc) at (1.8,7.5) {Crystal\\Oscillator};
\draw[->,thick] (osc.east) -- (23.4,7.5);
\node[above] at (7.6,7.5) {$f_{\mathrm{OSC}}$};

% External low-frequency crystal, X1, with its two pins.
\draw[thick] (0.85,6.795) -- (0.85,1.6) -- (1.55,1.6);
\draw[thick] (2.75,6.795) -- (2.75,1.6) -- (2.1,1.6);
\node[pin] at (0.85,3.2) {X};
\node[pin] at (2.75,3.2) {X};
\node[left] at (0.7,2.95) {OSCI};
\node[right] at (2.9,2.95) {OSCO};
\draw[thick] (1.55,1.3) -- (1.55,1.9);
\draw[thick] (2.1,1.3) -- (2.1,1.9);
\draw[thick,fill=white] (1.7,1.3) rectangle (1.95,1.9);
\node[above] at (1.825,1.9) {X1};
\node[below] at (1.825,1.25) {32.768 kHz};
\node[right] at (2.9,1.95) {Rs};

% Functions tapped from the oscillator rail.
\node[function] (rtc) at (5.25,6.5) {RTC};
\draw[tap] (4.25,7.5) -- (4.25,6.5) -- (rtc.west);
\draw[rcclock,->] (5.15,5.05) -- (5.15,5.88);

\node[function] (adc) at (9.0,6.5) {Temperature\\ADC};
\draw[tap] (6.8,7.5) -- (6.8,6.5) -- (7.4,6.5);
\draw[tap] (7.4,6.5) -- (7.85,6.95);
\draw[tap,->] (7.95,6.5) -- (adc.west);
\draw[rcclock,->] (8.95,5.05) -- (8.95,5.88);

\node[function] (rtccal) at (13.05,6.5) {RTC\\Calibration};
\draw[tap] (11.1,7.5) -- (11.1,6.5) -- (11.45,6.5);
\draw[tap] (11.45,6.5) -- (11.9,6.95);
\draw[tap,->] (12.0,6.5) -- (rtccal.west);

\node[function] (pll) at (17.0,6.5) {PLL\\32.768\\MHz};
\draw[tap] (14.95,7.5) -- (14.95,6.5) -- (15.3,6.5);
\draw[tap] (15.3,6.5) -- (15.75,6.95);
\draw[tap,->] (15.85,6.5) -- (pll.west);

\node[function] (rc32m) at (21.35,6.6) {RC32M\\32.768\\MHz};
\draw[tap] (18.55,7.55) -- (19.15,7.55) -- (19.15,6.55)
  -- (19.55,6.55);
\draw[tap] (19.55,6.55) -- (19.95,7.0);
\draw[tap,->] (20.05,6.55) -- (rc32m.west |- 0,6.55);

% Primary high-frequency crystal oscillator and enable.
\node[block] (primary) at (7.0,4.15) {Primary\\Crystal\\Oscillator};
\draw[->,thick] (4.8,4.45) -- (primary.west |- 0,4.45);
\node[anchor=north west] at (primary.north west) {En};
\node[above left] at (6.1,3.1) {POSCI};
\node[above right] at (7.9,3.1) {POSCO};
\draw[thick] (6.1,3.445) -- (6.1,0.65);
\draw[thick] (7.9,3.445) -- (7.9,0.65);
\node[pin] at (6.1,2.95) {X};
\node[pin] at (7.9,2.95) {X};

% Feedback resistor Rf2, using drawing primitives only.
\draw (6.1,2.3) -- (6.75,2.3)
  -- (6.81,2.38) -- (6.9,2.22) -- (6.99,2.38)
  -- (7.08,2.22) -- (7.17,2.38) -- (7.26,2.3) -- (7.9,2.3);
\node[above] at (7.0,2.42) {Rf2};

% X2 crystal.
\draw[thick] (6.1,1.35) -- (6.7,1.35);
\draw[thick] (7.3,1.35) -- (7.9,1.35);
\draw[thick] (6.7,1.05) -- (6.7,1.65);
\draw[thick] (7.3,1.05) -- (7.3,1.65);
\draw[thick,fill=white] (6.86,1.05) rectangle (7.14,1.65);
\node[above] at (7.0,1.68) {X2};

% Load capacitors C1/C2 and their common ground.
\draw (5.95,0.65) -- (6.25,0.65);
\draw (5.95,0.53) -- (6.25,0.53);
\draw (7.75,0.65) -- (8.05,0.65);
\draw (7.75,0.53) -- (8.05,0.53);
\node[left] at (5.85,0.65) {C1};
\node[right] at (8.15,0.65) {C2};
\draw (6.1,0.53) -- (6.1,0.25) -- (7.9,0.25) -- (7.9,0.53);
\draw[thick] (7.0,0.25) -- (7.0,-0.05);
\draw[thick] (6.7,-0.05) -- (7.3,-0.05);
\draw[thick] (6.8,-0.2) -- (7.2,-0.2);
\draw[thick] (6.9,-0.35) -- (7.1,-0.35);
\node[below] at (7.0,-0.5) {High-frequency crystal: up to 32.768 MHz};

% Clock management unit and its input sources.
\node[block,minimum width=1.8cm,minimum height=1.8cm] (cmu)
  at (11.0,4.15) {CMU};
\draw[->,thick] (primary.east) -- (cmu.west)
  node[midway,above,align=center] {HF crystal\\up to 32.768 MHz};

\draw[violetclock,->] (rcint.east) -- (9.85,9.5)
  -- (9.85,4.72) -- (cmu.west |- 0,4.72);
\node[above,anchor=east] at (9.85,9.5) {Internal RC clock: 1.6 MHz};

\draw[pllclock,->] (pll.south) -- (17.0,4.85)
  -- (cmu.east |- 0,4.85);
\node[above] at (14.7,4.85) {PLL clock: 32.768 MHz};

\draw[rcclock,->] (rc32m.south) -- (21.35,4.48)
  -- (12.35,4.48);
\node[above,anchor=east] at (21.35,4.48) {RC32M clock: 32.768 MHz};

\node[block] (rc32k) at (16.95,9.65)
  {Internal RC\\32 kHz\\Always on};
\draw[->] (rc32k.west) -- (15.2,9.65) -- (15.2,3.85)
  -- (cmu.east |- 0,3.85);

\draw[lfclock,->] (17.9,7.5) -- (17.9,3.32)
  -- (cmu.east |- 0,3.32);
\node[above,anchor=east] at (17.75,3.32) {LF crystal clock: 32.768 kHz};

% Watchdog with its dedicated RC source and system-clock connection.
\node[fill=magenta,minimum width=1.05cm,minimum height=1.05cm,
  align=center] (wdt) at (19.75,9.65) {WDT};
\draw[->] (rc32k.east) -- (wdt.west);
\draw[rcclock,->] (22.9,2.15) -- (22.9,3.85)
  -- (23.25,3.85) -- (23.25,9.65) -- (wdt.east);

% Internal system-clock rail.
\draw[sysclock,->] (10.65,3.091) -- (10.65,2.1) -- (23.95,2.1);
\node[above] at (15.7,2.22) {Internal system clock};

% CPU wake-up branch.
\node[peripheral] (wake) at (9.65,0.1) {CPU\\Wake-up};
\draw[sysclock,->] (10.65,2.1) -- (9.65,2.1) -- (wake.north);

% Gated peripheral branches. Gaps and diagonal blades show open switches.
\foreach \name/\caption/\x in {
  cpu/CPU/11.2,
  emu/EMU/12.8,
  timer/Timer/14.4,
  iic/I2C/16.2,
  spi/SPI/17.85,
  uart/UART/19.45,
  p7816/7816/21.05,
  edt/EDT/22.5
} {
  \node[peripheral] (\name) at (\x,0.1) {\caption};
  \draw[sysclock] (\x,2.1) -- (\x,1.65);
  \draw[sysclock] (\x,1.65) -- ++(-0.43,-0.43);
  \draw[sysclock,->] (\x,1.47) -- (\name.north);
}
\end{tikzpicture}
```

برچسب‌های چینی تصویر مرجع به انگلیسی برگردانده شده‌اند. این فایل بازسازی چیدمان تصویر است؛ مقادیر و اتصال‌های آن با دیتاشیت قطعه تطبیق داده نشده‌اند. کد این نمونه اجرا یا رندر نشده است.
