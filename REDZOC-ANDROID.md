# eSpeak NG Text-to-Speech for Android: engine source

This branch holds the speech engine source of **eSpeak NG Text-to-Speech** on Google Play (package `com.redzoc.ramees.tts.espeak`), exactly as built into each release. Each release has a tag: `android-<version>`, for example `android-2.8.6`.

The app is an independent Android build of eSpeak NG, made and maintained by RedZoc. It is not the official eSpeak NG project; RedZoc contributes fixes back to it: https://github.com/espeak-ng/espeak-ng/pulls?q=author%3Arameeszone

## Licence

eSpeak NG is licensed under the GNU General Public License version 3 or later: see `COPYING`. Some files carry other compatible licences: see `COPYING.APACHE`, `COPYING.BSD2` and `COPYING.UCD`.

## What is here

- `src/`: the eSpeak NG library.
- `dictsource/`, `phsource/`, `espeak-ng-data/`: the language rules, dictionaries, phonemes and voices.
- `android/jni/`: the small C layer between the Android app and the engine (`jni/eSpeakService.c`) and its build file.

## How the app builds it

1. **Engine library:** the app's Gradle build runs CMake through the Android NDK on `android/jni/CMakeLists.txt`, with `-DUSE_ASYNC=OFF -DUSE_MBROLA=OFF`, target `ttsespeak`. This builds `libttsespeak.so` from `android/jni/jni/eSpeakService.c` and the eSpeak NG library in `src/`.
2. **Voice data:** compiled from `dictsource/` and `phsource/` with eSpeak NG's own data build (`cmake -Bbuild -DENABLE_TESTS=OFF && cmake --build build --target data`) and packed into `espeakdata.zip`, which the app installs on the phone. Some files in the app's voice data are still unchanged from upstream eSpeak NG's 1.52.0 release; `DATA-SOURCES.txt` lists which files come from where.

## Contact

RedZoc: https://redzoc.com
