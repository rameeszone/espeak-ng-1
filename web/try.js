/*
 * Page script for "Try eSpeak NG" (https://www.redzoc.com/espeak/try/).
 * Copyright (C) 2026 Ramees Muhammed (RedZoc). GPL-3.0-or-later.
 */
(function () {
  "use strict";

  var ENGINE = "engine/";
  var LIMIT = 5000;
  var STORE = "redzoc-try-espeak";

  // Region groups, in the order shown (decision 14.4). Anything unlisted goes to "Other languages".
  var GROUPS = [
    ["India and South Asia", ["as", "bn", "bpy", "gu", "hi", "kn", "kok", "ml", "mr", "ne", "or", "pa", "sd", "si", "ta", "te", "ur"]],
    ["English", ["en", "en-029", "en-GB-scotland", "en-GB-x-gbclan", "en-GB-x-gbcwmd", "en-GB-x-rp", "en-Shaw", "en-US", "en-US-nyc"]],
    ["Middle East and Central Asia", ["ar", "hy", "hyw", "az", "ba", "cv", "ka", "he", "kk", "ku", "ky", "nog", "fa", "fa-Latn", "tt", "tr", "tk", "ug", "uz", "kaa", "ab", "crh", "ps", "ps-x-northwest", "ps-x-southeast", "ps-x-yusufzai"]],
    ["East and Southeast Asia", ["my", "yue", "yue-Latn-jyutping", "hak", "id", "ja", "ko", "ms", "cmn", "cmn-Latn-pinyin", "mn", "mn-f", "shn", "th", "vi", "vi-VN-x-central", "vi-VN-x-south"]],
    ["Africa", ["af", "am", "om", "sw", "tn", "ti"]],
    ["Americas and Pacific", ["chr", "nci", "kl", "gn", "ht", "haw", "quc", "mi", "pap", "qu", "mto"]],
    ["Constructed languages", ["eo", "ia", "io", "jbo", "lfn", "piqd", "py", "qdb", "qya", "sjn"]]
  ];
  var EUROPE = "Europe";
  var OTHER = "Other languages";
  var RENAME = { "Oriya": "Odia", "Gaelic (Irish)": "Irish", "Gaelic (Scottish)": "Scottish Gaelic", "English (Great Britain)": "English (British)" };

  // Scripts whose language the engine switches to automatically inside mixed text.
  var SCRIPTS = [
    [/[ऀ-ॿ]/, "hi"], [/[ঀ-৿]/, "bn"], [/[਀-੿]/, "pa"], [/[઀-૿]/, "gu"],
    [/[଀-୿]/, "or"], [/[஀-௿]/, "ta"], [/[ఀ-౿]/, "te"], [/[ಀ-೿]/, "kn"],
    [/[ഀ-ൿ]/, "ml"], [/[඀-෿]/, "si"], [/[؀-ۿ]/, "ar"], [/[֐-׿]/, "he"],
    [/[Ͱ-Ͽ]/, "el"], [/[฀-๿]/, "th"], [/[Ⴀ-ჿ]/, "ka"], [/[԰-֏]/, "hy"],
    [/[ሀ-፿]/, "am"], [/[A-Za-z]/, "en"]
  ];

  var $ = function (id) { return document.getElementById(id); };
  var text = $("tts-text"), counter = $("tts-count"), limitNote = $("tts-limit");
  var language = $("tts-language"), variant = $("tts-voice");
  var rate = $("tts-rate"), pitch = $("tts-pitch"), volume = $("tts-volume");
  var play = $("tts-play"), download = $("tts-download"), status = $("tts-status");
  var audio = new Audio();
  var SILENCE = "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQIAAAAAAA==";

  var voices = {};
  var worker = null;
  var jobId = 0;
  var pending = {};
  var cache = { key: null, blob: null, url: null };
  var state = "idle"; // idle | generating | playing

  function announce(message) {
    status.textContent = message;
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; }
  }
  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        language: language.value, voice: variant.value, rate: rate.value, pitch: pitch.value, volume: volume.value
      }));
    } catch (e) { /* storage unavailable: settings are simply not remembered */ }
  }

  function groupOf(code) {
    for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i][1].indexOf(code) >= 0) return GROUPS[i][0];
    return null;
  }

  function buildLanguages(list, saved) {
    var buckets = {};
    list.forEach(function (v) {
      voices[v.code] = v;
      var group = groupOf(v.code) || ((["gmw", "gmq", "roa", "zle", "zls", "zlw", "bat", "cel", "grk", "itc", "urj", "ine"].indexOf(v.family) >= 0 || v.code === "eu" || v.code === "mt") ? EUROPE : OTHER);
      (buckets[group] = buckets[group] || []).push(v);
    });
    var order = GROUPS.slice(0, 2).map(function (g) { return g[0]; }).concat([EUROPE], GROUPS.slice(2).map(function (g) { return g[0]; }), [OTHER]);
    order.forEach(function (name) {
      if (!buckets[name]) return;
      var group = document.createElement("optgroup");
      group.label = name;
      buckets[name].sort(function (a, b) { return label(a).localeCompare(label(b)); }).forEach(function (v) {
        var option = document.createElement("option");
        option.value = v.code;
        option.textContent = label(v);
        group.appendChild(option);
      });
      language.appendChild(group);
    });
    language.value = saved.language && voices[saved.language] ? saved.language : guessLanguage();
    language.disabled = false;
  }

  function label(v) {
    return RENAME[v.name] || v.name;
  }

  function guessLanguage() {
    var wanted = (navigator.languages || [navigator.language || "en"]);
    for (var i = 0; i < wanted.length; i++) {
      var tag = String(wanted[i]);
      var exact = Object.keys(voices).filter(function (c) { return c.toLowerCase() === tag.toLowerCase(); })[0];
      if (exact) return exact;
      var base = tag.split("-")[0].toLowerCase();
      if (voices[base]) return base;
    }
    return voices.en ? "en" : Object.keys(voices)[0];
  }

  function neededDicts() {
    var dicts = {};
    dicts[voices[language.value].dict] = true;
    SCRIPTS.forEach(function (s) {
      if (s[0].test(text.value) && voices[s[1]]) dicts[voices[s[1]].dict] = true;
    });
    return Object.keys(dicts);
  }

  function settingsKey() {
    return [text.value, language.value, variant.value, rate.value, pitch.value, volume.value].join("\u0001");
  }

  function startWorker() {
    if (worker) return;
    worker = new Worker(ENGINE + "worker.js");
    worker.onmessage = function (event) {
      var done = pending[event.data.id];
      delete pending[event.data.id];
      if (done) done(event.data);
    };
  }

  function generate() {
    var key = settingsKey();
    if (cache.key === key) return Promise.resolve(cache);
    startWorker();
    var id = ++jobId;
    return new Promise(function (resolve, reject) {
      pending[id] = function (result) {
        if (result.error) return reject(new Error(result.error));
        if (cache.url) URL.revokeObjectURL(cache.url);
        cache.key = key;
        cache.blob = toWav(result.samples, result.sampleRate);
        cache.url = URL.createObjectURL(cache.blob);
        resolve(cache);
      };
      worker.postMessage({
        id: id, text: text.value, voice: language.value, variant: variant.value,
        rate: Number(rate.value), pitch: Number(pitch.value), volume: Number(volume.value), dicts: neededDicts()
      });
    });
  }

  function toWav(samples, sampleRate) {
    var buffer = new ArrayBuffer(44 + samples.length * 2);
    var view = new DataView(buffer);
    function str(offset, s) { for (var i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); }
    str(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE");
    str(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    str(36, "data"); view.setUint32(40, samples.length * 2, true);
    new Int16Array(buffer, 44).set(samples);
    return new Blob([buffer], { type: "audio/wav" });
  }

  function setState(next) {
    state = next;
    var stop = next !== "idle";
    play.textContent = stop ? "Stop" : "Play";
    play.setAttribute("aria-label", stop ? "Stop" : "Play");
    play.classList.toggle("stopping", stop);
    download.disabled = next === "generating";
  }

  function needText() {
    if (text.value.trim()) return false;
    announce("Type or paste some text first.");
    text.focus();
    return true;
  }

  play.addEventListener("click", function () {
    if (state !== "idle") {
      audio.pause();
      audio.currentTime = 0;
      setState("idle");
      announce("Stopped.");
      return;
    }
    if (needText()) return;
    // Start (silent) playback inside the tap itself, so browsers that only allow
    // audio started by a user action still play the speech once it is ready.
    audio.src = SILENCE;
    audio.play().catch(function () { /* the real play() below reports any problem */ });
    setState("generating");
    announce("Generating…");
    generate().then(function (result) {
      if (state !== "generating") return;
      audio.src = result.url;
      return audio.play().then(function () {
        setState("playing");
        announce("Playing.");
      });
    }).catch(function (error) {
      setState("idle");
      announce(error.message);
    });
  });

  audio.addEventListener("ended", function () {
    if (state !== "playing") return; // the silent unlock clip, not the speech
    setState("idle");
    announce("Finished.");
  });

  download.addEventListener("click", function () {
    if (needText()) return;
    var wasIdle = state === "idle";
    if (wasIdle) { setState("generating"); announce("Generating…"); }
    generate().then(function (result) {
      var link = document.createElement("a");
      var name = label(voices[language.value]).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      link.href = result.url;
      link.download = "espeak-" + name + "-" + new Date().toISOString().slice(0, 10) + ".wav";
      document.body.appendChild(link);
      link.click();
      link.remove();
      if (wasIdle) setState("idle");
      announce("Audio file downloaded.");
    }).catch(function (error) {
      if (wasIdle) setState("idle");
      announce(error.message);
    });
  });

  function updateCount() {
    var n = text.value.length;
    counter.textContent = n.toLocaleString("en-IN") + " of " + LIMIT.toLocaleString("en-IN") + " characters";
    var near = n >= LIMIT ? "You have reached the 5,000 character limit." : (n >= LIMIT * 0.9 ? "Nearly at the 5,000 character limit." : "");
    if (limitNote.textContent !== near) limitNote.textContent = near;
  }

  function sliderText(input) {
    var unit = input === rate ? " words per minute" : " percent";
    input.setAttribute("aria-valuetext", input.value + unit);
    $(input.id + "-value").textContent = input === rate ? input.value + " wpm" : input.value + "%";
  }

  text.addEventListener("input", updateCount);
  [language, variant, rate, pitch, volume].forEach(function (control) {
    control.addEventListener("change", save);
  });
  [rate, pitch, volume].forEach(function (input) {
    input.addEventListener("input", function () { sliderText(input); });
  });

  var saved = load();
  ["voice", "rate", "pitch", "volume"].forEach(function (k) {
    var control = { voice: variant, rate: rate, pitch: pitch, volume: volume }[k];
    if (saved[k] !== undefined) control.value = saved[k];
  });
  [rate, pitch, volume].forEach(sliderText);
  updateCount();

  fetch(ENGINE + "voices.json").then(function (r) { return r.json(); }).then(function (list) {
    buildLanguages(list, saved);
    play.disabled = false;
    download.disabled = false;
  }).catch(function () {
    announce("The speech engine could not be loaded. Please check your connection and reload the page.");
  });
})();
