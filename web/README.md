# Try eSpeak NG — web tool

Source for the browser text-to-speech tool at https://www.redzoc.com/espeak/try/,
made by Ramees Muhammed (RedZoc). It runs eSpeak NG compiled to WebAssembly entirely
in the visitor's browser; no text is sent to any server.

Licensed under the GNU General Public License, version 3 or later, like eSpeak NG.

This branch (`redzoc-web`) is upstream eSpeak NG plus one fix not yet merged upstream:
stylized Latin letters normalised to plain text (espeak-ng/espeak-ng#2435).
Each published version of the tool is tagged (`web-1.0`, …).

| File | Purpose |
|---|---|
| `glue.c` | Small C interface to the engine (initialise, set voice and parameters, synthesise). |
| `build.sh` | Builds the engine and voice data inside the official Emscripten Docker image. |
| `pack_data.py` | Packs voice data: one shared bundle, one file per language dictionary, a voice list. |
| `worker.js` | Web Worker that runs the engine and loads dictionaries on demand. |
| `try.js` | The page script: controls, language list, playback, WAV download. |

## Build

```sh
docker run --rm -v "$PWD:/src:ro" -v "$PWD/web-out:/out" emscripten/emsdk:latest sh /src/web/build.sh
```

Output in `web-out/`: `espeakng.js`, `espeakng.wasm`, `base.bin`, `base.json`, `voices.json`,
`dict/*_dict`, and `SOURCE.txt` with the exact source commit. Serve them with `worker.js`
in one folder, and `try.js` from the page.
