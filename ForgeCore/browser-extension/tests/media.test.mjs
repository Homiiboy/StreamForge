import assert from "node:assert/strict";
import { classifyCandidate, mediaKindFromUrl, mediaKindFromContentType, canonicalUrlForDedup, safeFilename } from "../media.js";
assert.equal(mediaKindFromUrl("https://cdn.example/video/master.m3u8?token=abc"), "hls");
assert.equal(mediaKindFromUrl("https://cdn.example/manifest.mpd"), "dash");
assert.equal(mediaKindFromUrl("https://cdn.example/movie.mp4"), "media");
assert.equal(mediaKindFromUrl("https://cdn.example/seg-001.ts"), null);
assert.equal(mediaKindFromContentType("application/vnd.apple.mpegurl; charset=utf-8"), "hls");
assert.equal(mediaKindFromContentType("application/dash+xml"), "dash");
assert.equal(classifyCandidate({url:"https://cdn.example/noext?id=7",contentType:"video/mp4",resourceType:"xmlhttprequest"}), "media");
assert.equal(canonicalUrlForDedup("https://cdn.example/master.m3u8?id=7&token=abc"), "https://cdn.example/master.m3u8?id=7");
assert.equal(canonicalUrlForDedup("https://cdn.example/master.m3u8?id=8&token=abc").includes("id=8"), true);
assert.equal(safeFilename('A:B/C*D?'), 'A B C D');
console.log("media detection tests: OK");

const { hlsProbeContainsVariant } = await import('../media.js');
assert.equal(hlsProbeContainsVariant({variantOptions:[{uri:'https://cdn.example/v/1080.m3u8?token=abc'}]}, 'https://cdn.example/v/1080.m3u8?token=def'), true);
assert.equal(hlsProbeContainsVariant({variantOptions:[{uri:'https://cdn.example/v/1080.m3u8'}]}, 'https://cdn.example/v/720.m3u8'), false);
