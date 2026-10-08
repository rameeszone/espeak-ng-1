#!/bin/sh
# Builds the eSpeak NG WebAssembly engine and voice data for the RedZoc web tool.
# Runs inside the official Emscripten image; see web/README.md.
#   docker run --rm -v <this repo>:/src -v <output dir>:/out emscripten/emsdk:4.0.10 sh /src/web/build.sh
set -eu
JOBS=$(nproc)

# Clean Linux checkout of the committed engine source (avoids Windows line endings).
rm -rf /work && git clone -q /src /work
mkdir -p /work/web && cp /src/web/glue.c /src/web/pack_data.py /work/web/
cd /work

# 1. Native build, only to compile the voice data (dictionaries, phonemes, intonations).
cmake -S . -B build-native -DCMAKE_BUILD_TYPE=Release -DENABLE_TESTS=OFF \
  -DUSE_MBROLA=OFF -DUSE_LIBSONIC=OFF -DUSE_LIBPCAUDIO=OFF -DUSE_ASYNC=OFF -DUSE_SPEECHPLAYER=OFF >/dev/null
cmake --build build-native -j"$JOBS" >/dev/null
echo "native build and data: OK"

# 2. WebAssembly build of the engine library.
emcmake cmake -S . -B build-wasm -DCMAKE_BUILD_TYPE=Release -DENABLE_TESTS=OFF -DBUILD_SHARED_LIBS=OFF \
  -DCOMPILE_INTONATIONS=OFF -DUSE_MBROLA=OFF -DUSE_LIBSONIC=OFF -DUSE_LIBPCAUDIO=OFF -DUSE_ASYNC=OFF \
  -DUSE_SPEECHPLAYER=OFF >/dev/null
cmake --build build-wasm --target espeak-ng -j"$JOBS" >/dev/null
LIB=$(find build-wasm -name 'libespeak-ng.a' | head -1)
LIBS="$LIB $(find build-wasm -name '*.a' ! -name 'libespeak-ng.a' | tr '
' ' ')"
echo "wasm libraries: $LIBS"

# 3. Link the wrapper into a module that runs in a Web Worker.
mkdir -p /out
emcc -O3 web/glue.c $LIBS -Isrc/include \
  -sMODULARIZE=1 -sEXPORT_NAME=createEspeak -sENVIRONMENT=worker \
  -sALLOW_MEMORY_GROWTH=1 -sFORCE_FILESYSTEM=1 \
  -sEXPORTED_FUNCTIONS=_rz_init,_rz_set_voice,_rz_set_parameter,_rz_synth,_rz_samples,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=FS,ccall,cwrap,HEAP16 \
  -o /out/espeakng.js
echo "engine: OK"

# 4. Package the voice data: one shared bundle plus one file per dictionary.
python3 web/pack_data.py build-native/espeak-ng-data /out
git -C /work log -1 --format='source commit: %H' | tee /out/SOURCE.txt
