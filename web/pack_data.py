#!/usr/bin/env python3
# Packs compiled eSpeak NG voice data for the RedZoc web tool.
#   base.bin + base.json   shared files (phonemes, intonations, voice and variant files), one download
#   dict/<name>_dict.bin   one file per language dictionary, downloaded only when needed
#                          (".bin" so web servers treat it as a file, not a folder)
#   voices.json            the voices that can actually speak (their dictionary exists)
# Copyright (C) 2026 Ramees Muhammed (RedZoc). GPL-3.0-or-later.
import json
import os
import shutil
import sys

data, out = sys.argv[1], sys.argv[2]
SKIP = {"mbrola_ph", "phondata-manifest"}

base, offset, chunks = [], 0, []
os.makedirs(os.path.join(out, "dict"), exist_ok=True)
for root, dirs, files in os.walk(data):
    dirs[:] = sorted(d for d in dirs if d not in SKIP and d != "mbrola")
    for name in sorted(files):
        path = os.path.join(root, name)
        rel = os.path.relpath(path, data).replace(os.sep, "/")
        if name in SKIP:
            continue
        if name.endswith("_dict"):
            shutil.copyfile(path, os.path.join(out, "dict", name + ".bin"))
            continue
        blob = open(path, "rb").read()
        base.append({"path": rel, "offset": offset, "size": len(blob)})
        chunks.append(blob)
        offset += len(blob)

with open(os.path.join(out, "base.bin"), "wb") as f:
    f.write(b"".join(chunks))
with open(os.path.join(out, "base.json"), "w") as f:
    json.dump(base, f, separators=(",", ":"))

dicts = {n[:-len("_dict.bin")] for n in os.listdir(os.path.join(out, "dict"))}
voices = []
for entry in base:
    if not entry["path"].startswith("lang/"):
        continue
    text = open(os.path.join(data, entry["path"]), encoding="utf-8", errors="replace").read().splitlines()
    code = entry["path"].rsplit("/", 1)[-1]
    name = next((l.split(None, 1)[1].strip() for l in text if l.startswith("name ")), code)
    dictionary = next((l.split()[1] for l in text if l.startswith("dictionary ")), code.split("-")[0])
    if dictionary in dicts and not code.startswith("xex"):
        voices.append({"code": code, "name": name, "dict": dictionary, "family": entry["path"].split("/")[1]})
with open(os.path.join(out, "voices.json"), "w", encoding="utf-8") as f:
    json.dump(voices, f, ensure_ascii=False, separators=(",", ":"))

print(f"data: {len(base)} shared files ({offset // 1024} KB), {len(dicts)} dictionaries, {len(voices)} voices")
