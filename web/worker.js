/*
 * Web Worker that runs the eSpeak NG WebAssembly engine for the RedZoc web tool.
 * Copyright (C) 2026 Ramees Muhammed (RedZoc). GPL-3.0-or-later.
 *
 * Messages in:  { id, text, voice, variant, rate, pitch, volume, dicts: [names] }
 * Messages out: { id, samples: Int16Array, sampleRate } or { id, error, fatal }
 *   fatal: the engine crashed; the page should start a new worker.
 */
importScripts("espeakng.js");

var DATA_ROOT = "/data";
var engine = null;
var sampleRate = 0;
var loadedDicts = {};

function fetchOk(url, type) {
  return fetch(url).then(function (response) {
    if (!response.ok) throw new Error("Could not load " + url + " (" + response.status + ")");
    return type === "json" ? response.json() : response.arrayBuffer();
  });
}

function writeFile(path, bytes) {
  var dir = path.slice(0, path.lastIndexOf("/"));
  engine.FS.mkdirTree(dir);
  engine.FS.writeFile(path, bytes);
}

var ready = Promise.all([
  createEspeak(),
  fetchOk("base.json", "json"),
  fetchOk("base.bin", "bin")
]).then(function (parts) {
  engine = parts[0];
  var index = parts[1];
  var bin = parts[2];
  index.forEach(function (entry) {
    writeFile(DATA_ROOT + "/espeak-ng-data/" + entry.path, new Uint8Array(bin, entry.offset, entry.size));
  });
  sampleRate = engine.ccall("rz_init", "number", ["string"], [DATA_ROOT]);
  if (sampleRate <= 0) throw new Error("The speech engine could not start.");
});

// Text fixes for engine bugs that are not yet fixed upstream.
function prepare(text, voice) {
  if (voice === "as") {
    // Assamese: precomposed RRA/RHA (U+09DC, U+09DD) crash the engine; decomposed YYA is misread.
    text = text.replace(/ড়/g, "ড়").replace(/ঢ়/g, "ঢ়")
               .replace(/য়/g, "য়");
  }
  return text;
}

function loadDict(name) {
  if (loadedDicts[name]) return loadedDicts[name];
  loadedDicts[name] = fetchOk("dict/" + name + "_dict.bin", "bin").then(function (bytes) {
    writeFile(DATA_ROOT + "/espeak-ng-data/" + name + "_dict", new Uint8Array(bytes));
  }).catch(function (error) {
    delete loadedDicts[name];
    throw error;
  });
  return loadedDicts[name];
}

self.onmessage = function (event) {
  var job = event.data;
  ready.then(function () {
    return Promise.all(job.dicts.map(loadDict));
  }).then(function () {
    var name = job.variant ? job.voice + "+" + job.variant : job.voice;
    if (engine.ccall("rz_set_voice", "number", ["string"], [name]) !== 0) {
      throw new Error("This voice could not be loaded.");
    }
    engine.ccall("rz_set_parameter", "number", ["number", "number"], [1, job.rate]);
    engine.ccall("rz_set_parameter", "number", ["number", "number"], [2, job.volume]);
    engine.ccall("rz_set_parameter", "number", ["number", "number"], [3, job.pitch]);
    var count = engine.ccall("rz_synth", "number", ["string"], [prepare(job.text, job.voice)]);
    if (count < 0) throw new Error("Speech could not be generated.");
    var pointer = engine.ccall("rz_samples", "number", [], []);
    var samples = new Int16Array(engine.HEAP16.buffer, pointer, count).slice();
    self.postMessage({ id: job.id, samples: samples, sampleRate: sampleRate }, [samples.buffer]);
  }).catch(function (error) {
    var fatal = typeof WebAssembly !== "undefined" && error instanceof WebAssembly.RuntimeError;
    self.postMessage({
      id: job.id,
      fatal: fatal,
      error: fatal ? "Speech could not be generated for this text. Please try again." : (error.message || String(error))
    });
  });
};
