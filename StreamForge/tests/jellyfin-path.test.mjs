import assert from 'node:assert/strict';
import {jellyfinRelativePath,jellyfinFolder} from '../jellyfin-path.js';
assert.equal(jellyfinRelativePath({type:'movie',title:'Cars',year:'2006'}),'Movies/Cars (2006)/Cars (2006).mp4');
assert.equal(jellyfinRelativePath({type:'series',title:'Slugterra',season:1,episode:2},'.srt'),'Shows/Slugterra/Season 01/Slugterra S01E02.srt');
assert.equal(jellyfinFolder({type:'movie',title:'Cars',year:'2006'}),'Movies/Cars (2006)');
assert.throws(()=>jellyfinRelativePath({type:'movie',title:'Bad',year:''}),/Erscheinungsjahr/);
assert.ok(!jellyfinRelativePath({type:'movie',title:'../My:Movie',year:'2025'}).includes('..'));
console.log('Jellyfin relative naming tests passed');
