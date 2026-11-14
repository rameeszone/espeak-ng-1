#!/bin/bash
# Rebuilds the app's voice data (the files in espeakdata.zip) as listed in DATA-SOURCES.txt.
# Run from the root of this branch:
#   bash redzoc-data/build-data.sh <checkout of upstream eSpeak NG tag 1.52.0> <output folder>
# Needs cmake and a C compiler (checked with the gcc:13 Docker image).
# The output folder gets espeak-ng-data/ with every listed file except the one marked
# upstream-android-1.52.0, which comes from upstream's official 1.52.0 Android build.
set -eu
HERE=$(pwd); UP=$(cd "$1" && pwd); mkdir -p "$2"; OUT=$(cd "$2" && pwd)
W=$(mktemp -d); O="-DUSE_MBROLA=OFF -DUSE_ASYNC=OFF"
cp -r "$HERE" "$W/this"; cp -r "$UP" "$W/1.52.0"; cp -r "$UP" "$W/mix"
rm -rf "$W/this/.git" "$W/1.52.0/.git" "$W/mix/.git"
cp "$HERE/phsource/ph_hindi" "$W/mix/phsource/"; cp "$HERE/phsource/vnasal/o_n6" "$W/mix/phsource/vnasal/"
for n in this 1.52.0 mix; do
  (cd "$W/$n" && cmake -S . -B b $O -DENABLE_TESTS=OFF >/dev/null && cmake --build b -j4 >/dev/null && cmake --build b --target data -j4 >/dev/null)
done
data() { case $1 in this) echo "$W/this/b/espeak-ng-data";; 1.52.0) echo "$W/1.52.0/b/espeak-ng-data";; 1.52.0+hindi) echo "$W/mix/b/espeak-ng-data";; esac; }
E="$OUT/espeak-ng-data"; rm -rf "$E"; mkdir -p "$E"
# 1. Every file except the dictionaries, from the data builds.
grep -v '^#' DATA-SOURCES.txt | while IFS=$'\t' read -r f r; do
  case $r in this|1.52.0|1.52.0+hindi) mkdir -p "$E/$(dirname "$f")"; cp "$(data "$r")/$f" "$E/$f";; esac
done
# 2. The dictionaries, compiled against the phoneme data from step 1.
grep -v '^#' DATA-SOURCES.txt | while IFS=$'\t' read -r f r; do
  case $r in dict*) ;; upstream-android-1.52.0) echo "not built: $f ($r)"; continue;; *) continue;; esac
  l=${f%_dict}; c=$(echo "$r" | sed -n 's/.*compiler=\([^ ]*\).*/\1/p'); s=$(echo "$r" | sed -n 's/.*source=\([^ ]*\).*/\1/p')
  [ "$c" = this ] && P="$W/this/b/src/espeak-ng" || P="$W/1.52.0/b/src/espeak-ng"
  [ "$s" = this ] && S="$W/this/dictsource" || S="$W/1.52.0/dictsource"
  T="$W/c-$l"; mkdir -p "$T"; cp "$S/${l}"_* "$T/"; [ -f "$S/extra/${l}_listx" ] && cp "$S/extra/${l}_listx" "$T/"
  case $r in *emoji=this*) cp "$HERE/dictsource/${l}_emoji" "$T/";; *emoji=redzoc-data*) cp "$HERE/redzoc-data/${l}_emoji" "$T/";; esac
  case $r in *no-extra*) rm -f "$T/${l}_extra";; esac
  (cd "$T" && ESPEAK_DATA_PATH="$OUT" "$P" --compile="$l" >/dev/null)
done
rm -rf "$W"
echo "done: $(find "$E" -type f | wc -l) files in $E"
