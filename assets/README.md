# App icon sources

`app-icon-source.png` is the original opaque emerald app icon generated with
imagegen. `app-icon-foreground.png` is its transparent foreground, also produced
with imagegen. Keep both originals when regenerating platform assets.

After `npm ci`, run:

```sh
node scripts/generate-icons.mjs
```

The official Tauri icon tool reads `app-icon.manifest.json`, creates the desktop
and iOS assets in `src-tauri/icons`, and updates Android launcher resources in
the generated Android project. The Android adaptive icon uses the transparent
foreground at 75% scale over an emerald background. A standard Android
`InsetDrawable` supplies 12.5% padding on each side: the Tauri CLI's scale option
does not pad explicit adaptive foreground files. The script also copies the
generated 64px PNG to `public/icon.png` for the browser favicon.

The inset keeps the opaque foreground inside Android's central 66dp safe circle
on the 108dp adaptive canvas, including circular launcher masks.

No Android 13 monochrome/themed variant is supplied; Android uses the color
launcher icon. Platform artwork generation does not build or test native apps.
