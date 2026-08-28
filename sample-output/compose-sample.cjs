"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/lib/audio/composition.ts
var composition_exports = {};
__export(composition_exports, {
  TARGET_BITS_PER_SAMPLE: () => TARGET_BITS_PER_SAMPLE,
  TARGET_CHANNELS: () => TARGET_CHANNELS,
  TARGET_SAMPLE_RATE: () => TARGET_SAMPLE_RATE,
  composeAudioClips: () => composeAudioClips,
  generateClipCacheKey: () => generateClipCacheKey,
  normalizeClipToWav: () => normalizeClipToWav,
  parseWavHeader: () => parseWavHeader
});
function parseWavHeader(buffer) {
  if (buffer.length < 44) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buffer.toString("ascii", 8, 12) !== "WAVE") return null;
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataSize = 0;
  let dataOffset = -1;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === "fmt ") {
      channels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      bitsPerSample = buffer.readUInt16LE(offset + 22);
    } else if (chunkId === "data") {
      dataSize = Math.min(chunkSize, buffer.length - (offset + 8));
      dataOffset = offset + 8;
      break;
    }
    offset += 8 + chunkSize + chunkSize % 2;
  }
  if (dataOffset < 0 || sampleRate === 0 || channels === 0 || bitsPerSample === 0) {
    return null;
  }
  const bytesPerSample = bitsPerSample / 8;
  const samplesPerChannel = Math.floor(dataSize / (channels * bytesPerSample));
  const durationMs = Math.round(samplesPerChannel / sampleRate * 1e3);
  return {
    sampleRate,
    channels,
    bitsPerSample,
    dataSize,
    dataOffset,
    durationMs
  };
}
function extractPcmSamples(wav, parsed) {
  const { channels, bitsPerSample, sampleRate, dataSize, dataOffset } = parsed;
  const bytesPerSample = Math.max(1, bitsPerSample / 8);
  const rawSamples = new Float32Array(Math.floor(dataSize / (channels * bytesPerSample)));
  if (bitsPerSample === 16) {
    for (let i = 0; i < rawSamples.length; i++) {
      const byteOffset = dataOffset + i * channels * 2;
      rawSamples[i] = wav.readInt16LE(byteOffset) / 32768;
    }
  } else if (bitsPerSample === 8) {
    for (let i = 0; i < rawSamples.length; i++) {
      const byteOffset = dataOffset + i * channels;
      rawSamples[i] = (wav[byteOffset] - 128) / 128;
    }
  } else {
    throw new Error(`Unsupported WAV bit depth: ${bitsPerSample}`);
  }
  let mono;
  if (channels === 1) {
    mono = rawSamples;
  } else {
    mono = new Float32Array(rawSamples.length / channels);
    for (let i = 0; i < mono.length; i++) {
      let sum = 0;
      for (let c = 0; c < channels; c++) {
        sum += rawSamples[i * channels + c];
      }
      mono[i] = sum / channels;
    }
  }
  if (sampleRate === TARGET_SAMPLE_RATE) {
    return mono;
  }
  if (sampleRate <= 0) {
    return mono;
  }
  const ratio = sampleRate / TARGET_SAMPLE_RATE;
  const outLength = Math.max(1, Math.floor(mono.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const s0 = mono[idx] ?? 0;
    const s1 = mono[Math.min(idx + 1, mono.length - 1)] ?? 0;
    out[i] = s0 + (s1 - s0) * frac;
  }
  return out;
}
function samplesToWav(samples) {
  const dataSize = samples.length * 2;
  const fileSize = 44 + dataSize;
  const buffer = Buffer.alloc(fileSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(fileSize - 8, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(TARGET_CHANNELS, 22);
  buffer.writeUInt32LE(TARGET_SAMPLE_RATE, 24);
  buffer.writeUInt32LE(TARGET_BYTES_PER_SECOND, 28);
  buffer.writeUInt16LE(TARGET_CHANNELS * TARGET_BYTES_PER_SAMPLE, 32);
  buffer.writeUInt16LE(TARGET_BITS_PER_SAMPLE, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return buffer;
}
function normalizeClipToWav(clip) {
  const parsed = parseWavHeader(clip.audio);
  if (parsed) {
    const samples = extractPcmSamples(clip.audio, parsed);
    const resampled = samplesToWav(samples);
    const durationMs = Math.round(samples.length / TARGET_SAMPLE_RATE * 1e3);
    const wasResampled = parsed.sampleRate !== TARGET_SAMPLE_RATE || parsed.channels !== TARGET_CHANNELS || parsed.bitsPerSample !== TARGET_BITS_PER_SAMPLE;
    return { buffer: resampled, durationMs, wasResampled };
  }
  return { buffer: clip.audio, durationMs: clip.durationMs, wasResampled: false };
}
function composeAudioClips(clips) {
  if (clips.length === 0) {
    return {
      audio: Buffer.alloc(0),
      format: "wav",
      totalDurationMs: 0,
      timestamps: []
    };
  }
  const sorted = [...clips].sort((a, b) => a.turnIndex - b.turnIndex);
  const normalizedClips = sorted.map((clip) => {
    const normalized = normalizeClipToWav(clip);
    return { ...clip, audio: normalized.buffer, durationMs: normalized.durationMs };
  });
  const totalSamples = normalizedClips.reduce((sum, clip) => {
    const samples = Math.round(clip.durationMs / 1e3 * TARGET_SAMPLE_RATE);
    const silenceSamples = Math.round(clip.pauseAfterMs / 1e3 * TARGET_SAMPLE_RATE);
    return sum + samples + silenceSamples;
  }, 0);
  const combined = new Float32Array(totalSamples);
  const timestamps = [];
  let currentMs = 0;
  let writeOffset = 0;
  for (const clip of normalizedClips) {
    const parsed = parseWavHeader(clip.audio);
    let clipSamples;
    if (parsed) {
      clipSamples = extractPcmSamples(clip.audio, parsed);
    } else {
      clipSamples = new Float32Array(Math.round(clip.durationMs / 1e3 * TARGET_SAMPLE_RATE));
    }
    const clipDurationMs = Math.round(clipSamples.length / TARGET_SAMPLE_RATE * 1e3);
    timestamps.push({
      turnIndex: clip.turnIndex,
      speakerId: clip.speakerId,
      startMs: currentMs,
      endMs: currentMs + clipDurationMs,
      durationMs: clipDurationMs
    });
    combined.set(clipSamples, writeOffset);
    writeOffset += clipSamples.length;
    currentMs += clipDurationMs + clip.pauseAfterMs;
    writeOffset += Math.round(clip.pauseAfterMs / 1e3 * TARGET_SAMPLE_RATE);
  }
  const wav = samplesToWav(combined);
  return {
    audio: wav,
    format: "wav",
    totalDurationMs: Math.round(combined.length / TARGET_SAMPLE_RATE * 1e3),
    timestamps
  };
}
function generateClipCacheKey(providerId, voiceId, text, pace, emotion) {
  const input = JSON.stringify({ providerId, voiceId, text, pace, emotion });
  return (0, import_crypto.createHash)("sha256").update(input).digest("hex");
}
var import_crypto, TARGET_SAMPLE_RATE, TARGET_CHANNELS, TARGET_BITS_PER_SAMPLE, TARGET_BYTES_PER_SAMPLE, TARGET_BYTES_PER_SECOND;
var init_composition = __esm({
  "src/lib/audio/composition.ts"() {
    "use strict";
    import_crypto = require("crypto");
    TARGET_SAMPLE_RATE = 16e3;
    TARGET_CHANNELS = 1;
    TARGET_BITS_PER_SAMPLE = 16;
    TARGET_BYTES_PER_SAMPLE = TARGET_BITS_PER_SAMPLE / 8;
    TARGET_BYTES_PER_SECOND = TARGET_SAMPLE_RATE * TARGET_CHANNELS * TARGET_BYTES_PER_SAMPLE;
  }
});

// scripts/compose-sample.ts
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));

// src/lib/normalization/dictionary.ts
var KHMER_DICTIONARY = [
  // === Abbreviations ===
  { written: "\u179F\u17D2\u179A\u17B8", spoken: "\u179F\u17D2\u179A\u17B8\u1798\u178F\u17B7", category: "abbreviation", notes: "Honorific prefix" },
  { written: "\u179B\u17C4\u1780", spoken: "\u179B\u17C4\u1780", category: "abbreviation" },
  { written: "\u178A\u17C2\u179B", spoken: "\u178A\u17C2\u179B", category: "abbreviation" },
  // === Technical Terms (Khmer-English) ===
  { written: "AI", spoken: "\u17A2\u17C1 \u17A2\u17B6\u1799", category: "technical", notes: "Artificial Intelligence" },
  { written: "ML", spoken: "\u17A2\u17C2\u1798 \u17A2\u17C2\u179B", category: "technical", notes: "Machine Learning (\u17A2\u17C2\u1798 \u17A2\u17C2\u179B)" },
  { written: "API", spoken: "\u17A2\u17C1 \u1797\u17B8 \u17A2\u17B6\u1799", category: "technical" },
  { written: "IT", spoken: "\u17A2\u17B6\u1799 \u1791\u17B8", category: "technical" },
  { written: "GPS", spoken: "\u1787\u17B8 \u1797\u17B8 \u17A2\u17C2\u179F", category: "technical" },
  { written: "URL", spoken: "\u1799\u17BC \u17A2\u17B6 \u17A2\u17C2\u179B", category: "technical" },
  { written: "WiFi", spoken: "\u179C\u17B6\u1799\u17A0\u17D2\u179C\u17B6\u1799", category: "technical" },
  { written: "app", spoken: "\u17A2\u17C2\u1795", category: "technical" },
  { written: "startup", spoken: "\u179F\u17D2\u178F\u17B6\u178F\u17A2\u17B6\u1795", category: "technical" },
  { written: "blockchain", spoken: "\u1794\u17D2\u179B\u17BB\u1780\u1786\u17C1\u1793", category: "technical" },
  { written: "fintech", spoken: "\u17A0\u17D2\u179C\u17B7\u1793\u178F\u17C2\u1780", category: "technical" },
  { written: "data science", spoken: "\u178A\u17B6\u178F\u17B6 \u179F\u17B6\u1799\u17A2\u17C1\u1793", category: "technical" },
  { written: "podcast", spoken: "\u1795\u17C9\u17C4\u178F\u1780\u17B6\u179F", category: "technical", notes: "Podcast" },
  { written: "startup", spoken: "\u179F\u17D2\u178F\u17B6\u178F\u17A2\u17B6\u1795", category: "technical" },
  { written: "telegram", spoken: "\u178F\u17C2\u179B\u17C2\u1780\u17D2\u179A\u17B6\u1798", category: "technical" },
  { written: "YouTube", spoken: "\u1799\u17C2\u178F\u17C2\u1794", category: "technical", notes: "YouTube" },
  { written: "Facebook", spoken: "\u179E\u17C1\u179F\u17D2\u1794\u17C1\u1780", category: "technical", notes: "Facebook" },
  { written: "Kiri", spoken: "\u1780\u17B8\u179A\u17B8", category: "name", notes: "Kiri TTS provider" },
  // === Cambodian Place Names ===
  { written: "\u1797\u17D2\u1793\u17C6\u1796\u17C1\u1789", spoken: "\u1797\u17D2\u1793\u17C6\u1796\u17C1\u1789", category: "name", notes: "Phnom Penh" },
  { written: "\u179F\u17C0\u1798\u179A\u17B6\u1794", spoken: "\u179F\u17C0\u1798\u179A\u17B6\u1794", category: "name", notes: "Siem Reap" },
  { written: "\u1794\u178F\u17D2\u178F\u17C6\u1794\u1784", spoken: "\u1794\u178F\u17D2\u178F\u17C6\u1794\u1784", category: "name", notes: "Battambang" },
  { written: "\u1780\u17C6\u1796\u1784\u17CB\u1785\u17B6\u1798", spoken: "\u1780\u17C6\u1796\u1784\u17CB\u1785\u17B6\u1798", category: "name", notes: "Kampong Cham" },
  { written: "\u179F\u17B7\u17C2\u1798\u179A\u17B6\u1794", spoken: "\u179F\u17B7\u17C2\u1798\u179A\u17B6\u1794", category: "name", notes: "Siem Reap alt" },
  // === Number-related ===
  { written: "\u17E0", spoken: "\u179F\u17BC\u1793\u17D2\u1799", category: "number", notes: "0" },
  { written: "\u17E1", spoken: "\u1798\u17BD\u1799", category: "number", notes: "1" },
  { written: "\u17E2", spoken: "\u1796\u17B8\u179A", category: "number", notes: "2" },
  { written: "\u17E3", spoken: "\u1794\u17B8", category: "number", notes: "3" },
  { written: "\u17E4", spoken: "\u1794\u17BD\u1793", category: "number", notes: "4" },
  { written: "\u17E5", spoken: "\u1794\u17D2\u179A\u17B6\u17C6", category: "number", notes: "5" },
  { written: "\u17E6", spoken: "\u1798\u17D2\u1797\u17BB\u17C7", category: "number", notes: "6" },
  { written: "\u17E7", spoken: "\u1787\u17D2\u179A\u17BB\u17C7", category: "number", notes: "7" },
  { written: "\u17E8", spoken: "\u1794\u17D2\u179A\u17B6\u17C6\u1794\u17B8", category: "number", notes: "8" },
  { written: "\u17E9", spoken: "\u1780\u17C5\u17BB", category: "number", notes: "9" },
  // === Common Words ===
  { written: "\u179F\u17D2\u179C\u17B6\u1782\u1798\u1793\u17CD", spoken: "\u179F\u17D2\u179C\u17B6\u1782\u17C0\u1798\u17CD\u1793\u17CD", category: "common", notes: "Autonomy/Independence" },
  { written: "\u1794\u17D2\u179A\u1787\u17B6\u1792\u17B7\u1794\u178F\u17C1\u1799\u17D2\u1799", spoken: "\u1794\u17D2\u179A\u1787\u17B6\u1792\u17B7\u1794\u178F\u17C1\u1799\u17D2\u1799", category: "common", notes: "Democracy" }
];
function applyDictionary(text) {
  let result = text;
  for (const entry of KHMER_DICTIONARY) {
    const escaped = entry.written.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
      `(?<![\\u1780-\\u17FFa-zA-Z0-9])${escaped}(?![\\u1780-\\u17FFa-zA-Z0-9])`,
      "g"
    );
    result = result.replace(regex, entry.spoken);
  }
  return result;
}

// src/lib/normalization/khmer.ts
var KHMER_DIGIT_CHARS = ["\u17E0", "\u17E1", "\u17E2", "\u17E3", "\u17E4", "\u17E5", "\u17E6", "\u17E7", "\u17E8", "\u17E9"];
var ONES = [
  "\u179F\u17BC\u1793\u17D2\u1799",
  // សូន្យ (0)
  "\u1798\u17BD\u1799",
  // មួយ (1)
  "\u1796\u17B8\u179A",
  // ពីរ (2)
  "\u1794\u17B8",
  // បី (3)
  "\u1794\u17BD\u1793",
  // បួន (4)
  "\u1794\u17D2\u179A\u17B6\u17C6",
  // ប្រាំ (5)
  "\u1798\u17D2\u1797\u17BB\u17C7",
  // ប្រាំមួយ (6)
  "\u1787\u17D2\u179A\u17BB\u17C7",
  // ប្រាំពីរ (7)
  "\u1794\u17D2\u179A\u17B6\u17C6\u1794\u17B8",
  // ប្រាំបី (8)
  "\u1794\u17D2\u179A\u17B6\u17C6\u1794\u17BD\u1793"
  // ប្រាំបួន (9)
];
var TEENS = [
  "\u178A\u1794\u17D2\u179A\u17B6\u17C6",
  // ដប់ (10)
  "\u178A\u1794\u17D2\u179A\u17B6\u17C6\u1798\u17BD\u1799",
  // ដប់មួយ (11)
  "\u178A\u1794\u17D2\u179A\u17B6\u17C6\u1796\u17B8\u179A",
  // ដប់ពីរ (12)
  "\u178A\u1794\u17D2\u179A\u17B6\u17C6\u1794\u17B8",
  // ដប់បី (13)
  "\u178A\u1794\u17D2\u179A\u17B6\u17C6\u1794\u17BD\u1793",
  // ដប់បួន (14)
  "\u178A\u1794\u17D2\u179A\u17B6\u17C6\u1794\u17D2\u179A\u17B6\u17C6",
  // ដប់ប្រាំ (15)
  "\u178A\u1794\u17D2\u179A\u17B6\u17C6\u1798\u17D2\u1797\u17BB\u17C7",
  // ដប់ប្រាំមួយ (16)
  "\u178A\u1794\u17D2\u179A\u17B6\u17C6\u1794\u17D2\u179A\u17B6\u17C6\u1796\u17B8\u179A",
  // ដប់ប្រាំពីរ (17)
  "\u178A\u1794\u17D2\u179A\u17B6\u17C6\u1794\u17D2\u179A\u17B6\u17C6\u1794\u17B8",
  // ដប់ប្រាំបី (18)
  "\u178A\u1794\u17D2\u179A\u17B6\u17C6\u1794\u17D2\u179A\u17B6\u17C6\u1794\u17BD\u1793"
  // ដប់ប្រាំបួន (19)
];
var TENS = [
  "\u1798\u17D2\u1797\u17C0\u179F",
  // ម្ភៃ (20)
  "\u179F\u17B8\u179F\u17D2\u179A\u17B8",
  // សាមសិប (30)
  "\u179F\u17D2\u179A\u17C2\u179F\u17B8\u1794\u17C2\u179F",
  // សែសិប (40)
  "\u17A0\u17D2\u1791\u17B8\u179F\u17D2\u179A\u17B8",
  // ហាសិប (50)
  "\u1795\u17C1\u179F\u17D2\u179F\u17B8\u179F\u17D2\u179A\u17B8",
  // ហុកសិប (60)
  "\u1795\u17C1\u17A2\u17D2\u179F\u17B8\u179F\u17D2\u179A\u17B8",
  // ចិតសិប (70)
  "\u1796\u17C1\u17A0\u17D2\u179F\u17B8\u179F\u17D2\u179A\u17B8",
  // ប៉ែតសិប (80)
  "\u1784\u17C0\u179F\u17D2\u179F\u17B8\u179F\u17D2\u179A\u17B8"
  // កៅសិប (90)
];
var HUNDRED = "\u179A\u1799";
var THOUSAND = "\u1796\u17B6\u1793\u17D2\u1784";
var TEN_THOUSAND = "\u1798\u17C9\u17BA\u1793";
var HUNDRED_THOUSAND = "\u179F\u17C2\u1793";
var MILLION = "\u179B\u17B6\u1793";
function numberToKhmerWords(input) {
  let num = typeof input === "string" ? parseInt(input, 10) : input;
  if (Number.isNaN(num)) return String(input);
  if (num < 0) return `\u1791\u17A2\u17D2\u1792 \u1793\u17C0\u1780\u17D2\u1780 ${numberToKhmerWords(-num)}`;
  if (num === 0) return ONES[0];
  const parts = [];
  const millions = Math.floor(num / 1e6);
  if (millions > 0) {
    parts.push(`${numberToKhmerWords(millions)} ${MILLION}`);
    num -= millions * 1e6;
  }
  const hundredThousands = Math.floor(num / 1e5);
  if (hundredThousands > 0) {
    parts.push(`${hundredThousands === 1 ? "" : numberToKhmerWords(hundredThousands)} ${HUNDRED_THOUSAND}`);
    num -= hundredThousands * 1e5;
  }
  const tenThousands = Math.floor(num / 1e4);
  if (tenThousands > 0) {
    parts.push(`${tenThousands === 1 ? "" : numberToKhmerWords(tenThousands)} ${TEN_THOUSAND}`);
    num -= tenThousands * 1e4;
  }
  const thousands = Math.floor(num / 1e3);
  if (thousands > 0) {
    parts.push(`${thousands === 1 ? "" : numberToKhmerWords(thousands)} ${THOUSAND}`);
    num -= thousands * 1e3;
  }
  const hundreds = Math.floor(num / 100);
  if (hundreds > 0) {
    parts.push(`${hundreds === 1 ? "" : numberToKhmerWords(hundreds)} ${HUNDRED}`);
    num -= hundreds * 100;
  }
  if (num > 0) {
    if (num < 20) {
      parts.push(num < 10 ? ONES[num] : TEENS[num - 10]);
    } else {
      const tens = Math.floor(num / 10);
      const ones = num % 10;
      const tensWord = TENS[tens - 2];
      parts.push(ones === 0 ? tensWord : `${tensWord}${ONES[ones]}`);
    }
  }
  return parts.join(" ");
}
function normalizeKhmerText(text, language = "km") {
  const original = text;
  let normalized = text.normalize("NFC");
  normalized = normalizePunctuation(normalized);
  normalized = expandNumbers(normalized, language);
  normalized = expandDates(normalized, language);
  normalized = expandAbbreviations(normalized);
  normalized = applyDictionary(normalized);
  const hasKhmerEnglishMix = detectKhmerEnglishMix(normalized);
  const chunks = chunkText(normalized);
  return {
    original,
    normalized,
    chunks,
    language,
    hasKhmerEnglishMix
  };
}
function normalizePunctuation(text) {
  text = text.replace(/\s+/g, " ");
  text = text.replace(/([.!?\u17d4\u17D5\u17D6])(\S)/g, "$1 $2");
  return text.trim();
}
function expandNumbers(text, language) {
  if (language !== "km" && !language.startsWith("km")) {
    return text;
  }
  let converted = text;
  KHMER_DIGIT_CHARS.forEach((khmerDigit, i) => {
    converted = converted.replaceAll(khmerDigit, String(i));
  });
  converted = converted.replace(/(\d+(?:\.\d+)?)\s*%/g, (_match, num) => {
    return `${numberToKhmerWords(num)} \u1797\u17B6\u1782\u179A\u1799`;
  });
  converted = converted.replace(/(\d+)\.(\d+)/g, (_match, whole, decimal) => {
    return `${numberToKhmerWords(whole)} \u1785\u17BB\u1785 ${numberToKhmerWords(decimal)}`;
  });
  converted = converted.replace(/(?<![_\w.])(\d+)(?![_\w.])/g, (_match, num) => {
    return numberToKhmerWords(num);
  });
  return converted;
}
function expandDates(text, language) {
  if (language !== "km" && !language.startsWith("km")) {
    return text;
  }
  const KHMER_MONTHS = [
    "",
    "\u1798\u1780\u179A\u17B6",
    "\u1780\u17BB\u1798\u17D2\u1797\u17C8",
    "\u1798\u17B8\u1793\u17B6",
    "\u1798\u17C1\u179F\u17B6",
    "\u17A7\u179F\u1797\u17B6",
    "\u1798\u17B7\u1790\u17BB\u1793\u17B6",
    "\u1780\u1780\u17D2\u1780\u178A\u17B6",
    "\u179F\u17B8\u17A0\u17B6",
    "\u1780\u1789\u17D2\u1789\u17B6",
    "\u178F\u17BB\u179B\u17B6",
    "\u179C\u17B7\u1785\u17D2\u1786\u17B7\u1780\u17B6",
    "\u1792\u17D2\u1793\u17BC"
  ];
  text = text.replace(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/g, (_match, day, month, year) => {
    const monthNum = parseInt(month, 10);
    const monthName = KHMER_MONTHS[monthNum] || month;
    return `\u1790\u17D2\u1784\u17C3\u1791\u17B8 ${numberToKhmerWords(day)} \u1781\u17C2 ${monthName} \u1786\u17D2\u1793\u17B6\u17C6 ${numberToKhmerWords(year)}`;
  });
  text = text.replace(/(\d{1,2}):(\d{2})/g, (_match, hour, minute) => {
    return `\u1798\u17C9\u17C4\u1784 ${numberToKhmerWords(hour)} \u1793\u17B6\u1791\u17B8 ${numberToKhmerWords(minute)}`;
  });
  return text;
}
function expandAbbreviations(text) {
  const abbreviations = {
    "Dr.": "Doctor",
    "Mr.": "Mister",
    "Mrs.": "Missus",
    "etc.": "et cetera",
    "vs.": "versus"
  };
  for (const [abbr, expanded] of Object.entries(abbreviations)) {
    text = text.replace(new RegExp(escapeRegex(abbr), "g"), expanded);
  }
  return text;
}
function detectKhmerEnglishMix(text) {
  const hasKhmer = /[\u1780-\u17FF]/.test(text);
  const hasLatin = /[a-zA-Z]/.test(text);
  return hasKhmer && hasLatin;
}
function chunkText(text, maxChunkLength = 500) {
  if (!text.trim()) return [];
  const sentenceEnders = /([.!?\u17D4\u17D5])(?:\s+|$)/g;
  const sentences = [];
  let lastIndex = 0;
  let match;
  while ((match = sentenceEnders.exec(text)) !== null) {
    const end = match.index + match[0].length;
    const sentence = text.slice(lastIndex, end).trim();
    if (sentence) sentences.push(sentence);
    lastIndex = end;
  }
  const tail = text.slice(lastIndex).trim();
  if (tail) sentences.push(tail);
  const finalChunks = [];
  for (const sentence of sentences) {
    if (sentence.length <= maxChunkLength) {
      finalChunks.push(sentence);
    } else {
      const parts = sentence.split(/[,\u17CB\u17D6;]\s*/);
      let subChunk = "";
      for (const part of parts) {
        if (subChunk.length + part.length > maxChunkLength) {
          if (subChunk.trim()) finalChunks.push(subChunk.trim());
          subChunk = part;
        } else {
          subChunk += (subChunk ? ", " : "") + part;
        }
      }
      if (subChunk.trim()) finalChunks.push(subChunk.trim());
    }
  }
  return finalChunks.filter((c) => c.length > 0);
}
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// scripts/compose-sample.ts
init_composition();

// src/lib/thumbnail/generator.ts
var WIDTH = 1200;
var HEIGHT = 630;
var PALETTES = [
  { from: "#0f172a", to: "#1e3a8a", accent: "#f59e0b" },
  // slate -> blue, amber accent
  { from: "#111827", to: "#5b21b6", accent: "#fbbf24" },
  // gray -> violet
  { from: "#082f49", to: "#164e63", accent: "#f472b6" },
  // cyan-dark -> teal
  { from: "#1c1917", to: "#7c2d12", accent: "#facc15" }
  // stone -> amber-dark
];
function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function truncate(s, maxLen) {
  if (s.length <= maxLen) return s;
  const cut = s.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut) + "\u2026";
}
function wrapText(s, maxCharsPerLine) {
  const lines = [];
  let current = "";
  for (const char of s) {
    current += char;
    if (current.length >= maxCharsPerLine) {
      lines.push(current);
      current = "";
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}
function buildWaveform(svg, yBase, barCount, color, seed) {
  let state = seed;
  const next = () => {
    state = state * 1103515245 + 12345 & 2147483647;
    return state % 100 / 100;
  };
  const barWidth = 6;
  const gap = 8;
  const totalWidth = barCount * (barWidth + gap) - gap;
  const startX = (WIDTH - totalWidth) / 2;
  for (let i = 0; i < barCount; i++) {
    const h = 24 + next() * 90;
    const x = startX + i * (barWidth + gap);
    const opacity = 0.25 + next() * 0.5;
    svg.push(
      `<rect x="${x.toFixed(1)}" y="${(yBase - h).toFixed(1)}" width="${barWidth}" height="${h.toFixed(1)}" rx="3" fill="${color}" fill-opacity="${opacity.toFixed(2)}"/>`
    );
  }
}
function generateThumbnailSvg(input) {
  const seed = hashString(input.title || "episode");
  const palette = PALETTES[seed % PALETTES.length];
  const titleLines = wrapText(truncate(input.title || "Podcast Episode", 54), 24);
  const topicText = input.topic ? truncate(input.topic, 90) : "";
  const speakers = (input.speakerNames || []).slice(0, 3).join(" \u2022 ");
  const languageLabel = (input.language || "km").toUpperCase();
  const svg = [];
  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`);
  svg.push(`  <defs>`);
  svg.push(`    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">`);
  svg.push(`      <stop offset="0%" stop-color="${palette.from}"/>`);
  svg.push(`      <stop offset="100%" stop-color="${palette.to}"/>`);
  svg.push(`    </linearGradient>`);
  svg.push(`  </defs>`);
  svg.push(`  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>`);
  svg.push(`  <circle cx="1050" cy="120" r="240" fill="${palette.accent}" fill-opacity="0.08"/>`);
  svg.push(`  <circle cx="120" cy="540" r="200" fill="#ffffff" fill-opacity="0.04"/>`);
  buildWaveform(svg, 170, 40, palette.accent, seed);
  svg.push(`  <text x="72" y="96" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="26" letter-spacing="6" fill="#ffffff" fill-opacity="0.85">AI PODCAST</text>`);
  svg.push(`  <text x="1060" y="96" font-family="system-ui, sans-serif" font-size="22" letter-spacing="2" fill="${palette.accent}" text-anchor="end">${escapeXml(languageLabel)}</text>`);
  let ty = 260;
  for (const line of titleLines) {
    svg.push(`  <text x="72" y="${ty}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="52" font-weight="700" fill="#ffffff">${escapeXml(line)}</text>`);
    ty += 66;
  }
  if (topicText) {
    svg.push(`  <text x="72" y="${ty + 8}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="28" fill="#ffffff" fill-opacity="0.7">${escapeXml(topicText)}</text>`);
    ty += 46;
  }
  if (speakers) {
    svg.push(`  <text x="72" y="${ty + 26}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="24" fill="${palette.accent}">${escapeXml(speakers)}</text>`);
  }
  svg.push(`  <rect x="72" y="560" width="140" height="6" rx="3" fill="${palette.accent}"/>`);
  svg.push(`</svg>`);
  return svg.join("\n");
}
function generateThumbnailSvgBuffer(input) {
  return Buffer.from(generateThumbnailSvg(input), "utf8");
}

// scripts/compose-sample.ts
var REPO = import_path.default.join(__dirname, "..");
var OUT_DIR = import_path.default.join(REPO, "sample-output");
var TURNS = [
  { speaker: "\u1796\u17B7\u179F\u17B7\u178A\u17D2\u178B", speakerId: "speaker-host", text: "\u179F\u17BD\u179F\u17D2\u178F\u17B8\u17A2\u17D2\u1793\u1780\u1791\u17B6\u17C6\u1784\u17A2\u179F\u17CB\u1782\u17D2\u1793\u17B6! \u179F\u17BC\u1798\u179F\u17D2\u179C\u17B6\u1782\u1798\u1793\u17CD\u1798\u1780\u1780\u17B6\u1793\u17CB\u1795\u178F\u1781\u17B6\u179F\u179A\u1794\u179F\u17CB\u1799\u17BE\u1784\u17D4 \u1790\u17D2\u1784\u17C3\u1793\u17C1\u17C7\u1799\u17BE\u1784\u1793\u17B9\u1784\u1793\u17B7\u1799\u17B6\u1799\u17A2\u17C6\u1796\u17B8\u1794\u1789\u17D2\u1789\u17B6\u179F\u17B7\u1794\u17D2\u1794\u1793\u17B7\u1798\u17D2\u1798\u17B7\u178F\u1793\u17C5\u1780\u1798\u17D2\u1796\u17BB\u1787\u17B6\u17D4" },
  { speaker: "\u179F\u17D2\u179A\u17B8\u1798\u17BB\u17C6", speakerId: "speaker-guest", text: "\u17A2\u179A\u1782\u17BB\u178E\u1796\u17B7\u179F\u17B7\u178A\u17D2\u178B\u178A\u17C2\u179B\u1794\u17B6\u1793\u17A2\u1789\u17D2\u1787\u17BE\u1789\u1781\u17D2\u1789\u17BB\u17C6\u17D4 \u1793\u17C1\u17C7\u1787\u17B6\u1794\u17D2\u179A\u1792\u17B6\u1793\u1794\u1791\u178A\u17C2\u179B\u1782\u17BD\u179A\u17B1\u17D2\u1799\u1785\u17B6\u1794\u17CB\u17A2\u17B6\u179A\u1798\u17D2\u1798\u178E\u17CD\u1781\u17D2\u179B\u17B6\u17C6\u1784\u178E\u17B6\u179F\u17CB\u179F\u1798\u17D2\u179A\u17B6\u1794\u17CB\u1799\u17BB\u179C\u1787\u1793\u1780\u1798\u17D2\u1796\u17BB\u1787\u17B6\u17D4" },
  { speaker: "\u1796\u17B7\u179F\u17B7\u178A\u17D2\u178B", speakerId: "speaker-host", text: "\u178F\u17BE\u179F\u17D2\u179A\u17B8\u1798\u17BB\u17C6\u1799\u179B\u17CB\u1790\u17B6\u1794\u1789\u17D2\u1789\u17B6\u179F\u17B7\u1794\u17D2\u1794\u1793\u17B7\u1798\u17D2\u1798\u17B7\u178F\u1780\u17C6\u1796\u17BB\u1784\u1795\u17D2\u179B\u17B6\u179F\u17CB\u1794\u17D2\u178F\u17BC\u179A\u179C\u17B7\u179F\u17D0\u1799\u17A2\u17D2\u179C\u17B8\u1781\u17D2\u179B\u17C7\u1793\u17C5\u1780\u1798\u17D2\u1796\u17BB\u1787\u17B6?" },
  { speaker: "\u179F\u17D2\u179A\u17B8\u1798\u17BB\u17C6", speakerId: "speaker-guest", text: "\u1787\u17B6\u1780\u17CB\u179F\u17D2\u178F\u17C2\u1784 \u179C\u17B7\u179F\u17D0\u1799\u17A2\u1794\u17CB\u179A\u17C6 \u1793\u17B7\u1784\u179C\u17B7\u179F\u17D0\u1799\u179F\u17BB\u1781\u17B6\u1797\u17B7\u1794\u17B6\u179B\u1780\u17C6\u1796\u17BB\u1784\u1791\u1791\u17BD\u179B\u1795\u179B\u1785\u17D2\u179A\u17BE\u1793\u17D4 \u17A7\u1791\u17B6\u17A0\u179A\u178E\u17CD \u1780\u1798\u17D2\u1798\u179C\u17B7\u1792\u17B8\u179A\u17C0\u1793\u1797\u17B6\u179F\u17B6\u178A\u17C2\u179B\u1794\u17D2\u179A\u17BE AI \u17A2\u17B6\u1785\u1787\u17BD\u1799\u179F\u17B7\u179F\u17D2\u179F\u1793\u17C5\u178F\u17B6\u1798\u1787\u1793\u1794\u1791\u1794\u17B6\u1793\u1799\u17C9\u17B6\u1784\u179B\u17D2\u17A2\u17D4" },
  { speaker: "\u1796\u17B7\u179F\u17B7\u178A\u17D2\u178B", speakerId: "speaker-host", text: "\u1796\u17B7\u178F\u1798\u17C2\u1793! \u17A0\u17BE\u1799\u178F\u17BE\u1798\u17B6\u1793\u1794\u1789\u17D2\u17A0\u17B6\u1794\u17D2\u179A\u1788\u1798\u17A2\u17D2\u179C\u17B8\u1781\u17D2\u179B\u17C7\u179F\u1798\u17D2\u179A\u17B6\u1794\u17CB\u1780\u17B6\u179A\u17A2\u1793\u17BB\u179C\u178F\u17D2\u178F\u1793\u17C1\u17C7?" },
  { speaker: "\u179F\u17D2\u179A\u17B8\u1798\u17BB\u17C6", speakerId: "speaker-guest", text: "\u1794\u1789\u17D2\u17A0\u17B6\u1792\u17C6\u1794\u17C6\u1795\u17BB\u178F\u1782\u17BA\u17A0\u17C1\u178A\u17D2\u178B\u17B6\u179A\u1785\u1793\u17B6\u179F\u1798\u17D2\u1796\u17D0\u1793\u17D2\u1792\u178C\u17B8\u1787\u17B8\u1790\u179B \u1793\u17B7\u1784\u1780\u17B6\u179A\u17A2\u1794\u17CB\u179A\u17C6\u1794\u17D2\u179A\u1787\u17B6\u1787\u1793\u17B1\u17D2\u1799\u1799\u179B\u17CB\u178A\u17B9\u1784\u1796\u17B8\u1780\u17B6\u179A\u1794\u17D2\u179A\u17BE\u1794\u17D2\u179A\u17B6\u179F\u17CB\u1794\u17D2\u179A\u1780\u1794\u178A\u17C4\u1799\u179F\u17BB\u179C\u178F\u17D2\u1790\u17B7\u1797\u17B6\u1796\u17D4" },
  { speaker: "\u1796\u17B7\u179F\u17B7\u178A\u17D2\u178B", speakerId: "speaker-host", text: "\u1781\u17D2\u1789\u17BB\u17C6\u1787\u17BF\u1790\u17B6\u17A2\u1793\u17B6\u1782\u178F\u179A\u1794\u179F\u17CB\u1780\u1798\u17D2\u1796\u17BB\u1787\u17B6\u1780\u17D2\u1793\u17BB\u1784\u179C\u17B7\u179F\u17D0\u1799\u1794\u1785\u17D2\u1785\u17C1\u1780\u179C\u17B7\u1791\u17D2\u1799\u17B6\u1793\u17B9\u1784\u1797\u17D2\u179B\u17BA\u179F\u17D2\u179C\u17B6\u1784 \u1794\u17BE\u1799\u17BE\u1784\u1791\u17B6\u17C6\u1784\u17A2\u179F\u17CB\u1782\u17D2\u1793\u17B6\u1785\u17BC\u179B\u179A\u17BD\u1798\u179F\u17A0\u1780\u17B6\u179A\u17D4 \u17A2\u179A\u1782\u17BB\u178E\u179F\u17D2\u179A\u17B8\u1798\u17BB\u17C6\u179F\u1798\u17D2\u179A\u17B6\u1794\u17CB\u1780\u17B6\u179A\u1785\u17C2\u1780\u179A\u17C6\u179B\u17C2\u1780\u178A\u17CF\u1798\u17B6\u1793\u178F\u1798\u17D2\u179B\u17C3!" }
];
async function main() {
  import_fs.default.mkdirSync(import_path.default.join(OUT_DIR, "tmp"), { recursive: true });
  const normalizedTurns = TURNS.map((t) => {
    const n = normalizeKhmerText(t.text, "km");
    return { ...t, normalized: n.normalized, warnings: n.warnings ?? [] };
  });
  const clips = [];
  for (let i = 0; i < normalizedTurns.length; i++) {
    const wavPath = import_path.default.join(OUT_DIR, "tmp", `turn_${String(i + 1).padStart(2, "0")}.wav`);
    if (!import_fs.default.existsSync(wavPath)) {
      throw new Error(`Missing clip: ${wavPath}`);
    }
    const audio = import_fs.default.readFileSync(wavPath);
    const { parseWavHeader: parseWavHeader2 } = await Promise.resolve().then(() => (init_composition(), composition_exports));
    const parsed = parseWavHeader2(audio);
    const durationMs = parsed?.durationMs ?? 0;
    clips.push({
      turnIndex: i,
      speakerId: normalizedTurns[i].speakerId,
      audio,
      durationMs,
      pauseAfterMs: i < normalizedTurns.length - 1 ? 500 : 250
    });
  }
  const composed = composeAudioClips(clips);
  const episodeWav = import_path.default.join(OUT_DIR, "sample-khmer-episode.wav");
  import_fs.default.writeFileSync(episodeWav, composed.audio);
  const svg = generateThumbnailSvgBuffer({
    title: "\u1794\u1789\u17D2\u1789\u17B6\u179F\u17B7\u1794\u17D2\u1794\u1793\u17B7\u1798\u17D2\u1798\u17B7\u178F\u1793\u17C5\u1780\u1798\u17D2\u1796\u17BB\u1787\u17B6",
    topic: "AI \u1793\u17B7\u1784\u1794\u1785\u17D2\u1785\u17C1\u1780\u179C\u17B7\u1791\u17D2\u1799\u17B6\u1793\u17C5\u1780\u1798\u17D2\u1796\u17BB\u1787\u17B6",
    language: "km",
    speakerNames: ["\u1796\u17B7\u179F\u17B7\u178A\u17D2\u178B", "\u179F\u17D2\u179A\u17B8\u1798\u17BB\u17C6"],
    status: "AUDIO_READY"
  });
  const thumbPath = import_path.default.join(OUT_DIR, "sample-khmer-thumbnail.svg");
  import_fs.default.writeFileSync(thumbPath, svg);
  const scriptPath = import_path.default.join(OUT_DIR, "sample-khmer-script.json");
  import_fs.default.writeFileSync(
    scriptPath,
    JSON.stringify(
      {
        title: "\u1794\u1789\u17D2\u1789\u17B6\u179F\u17B7\u1794\u17D2\u1794\u1793\u17B7\u1798\u17D2\u1798\u17B7\u178F\u1793\u17C5\u1780\u1798\u17D2\u1796\u17BB\u1787\u17B6",
        language: "km",
        generator: "repo pipeline (normalization + composition + thumbnail) + real km-KH TTS clips",
        turns: normalizedTurns.map((t, i) => ({
          index: i,
          speaker: t.speaker,
          speakerId: t.speakerId,
          text: t.text,
          normalized: t.normalized,
          estimatedSeconds: Math.round(t.text.length / 12 * 10) / 10,
          warnings: t.warnings
        }))
      },
      null,
      2
    )
  );
  const tsPath = import_path.default.join(OUT_DIR, "sample-khmer-timestamps.json");
  import_fs.default.writeFileSync(
    tsPath,
    JSON.stringify(
      {
        totalDurationMs: composed.totalDurationMs,
        timestamps: composed.timestamps.map((t) => ({
          turnIndex: t.turnIndex,
          speaker: normalizedTurns[t.turnIndex]?.speaker,
          startMs: t.startMs,
          endMs: t.endMs,
          durationMs: t.durationMs,
          text: normalizedTurns[t.turnIndex]?.text
        }))
      },
      null,
      2
    )
  );
  console.log(`Episode:      ${episodeWav}  (${(composed.audio.length / 1024 / 1024).toFixed(2)} MB, ${(composed.totalDurationMs / 1e3).toFixed(1)} s)`);
  console.log(`Thumbnail:    ${thumbPath}`);
  console.log(`Script:       ${scriptPath}`);
  console.log(`Timestamps:   ${tsPath}`);
  console.log(`Turns:        ${clips.length}`);
  console.log("Sample complete.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
