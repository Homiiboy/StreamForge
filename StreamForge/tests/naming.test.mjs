import assert from 'node:assert/strict';
import {buildMediaBasename, normalizeYear, sanitizeBaseName, suggestNaming, validateNaming} from '../naming.js';

assert.equal(buildMediaBasename({type:'movie',title:'Obsession',year:'2023'}), 'Obsession (2023)');
assert.equal(buildMediaBasename({type:'series',title:'Lazarus',season:'1',episode:'3'}), 'Lazarus S01E03');
assert.equal(buildMediaBasename({type:'series',title:'Show',season:'12',episode:'104'}), 'Show S12E104');
assert.equal(buildMediaBasename({type:'movie',title:'Obsession (2022)',year:'2023'}), 'Obsession (2023)');
assert.equal(buildMediaBasename({type:'series',title:'Lazarus S01E02',season:'1',episode:'3'}), 'Lazarus S01E03');
assert.equal(normalizeYear('Release 2024-03-01'), '2024');
assert.equal(sanitizeBaseName('A:B/C*D?'), 'A B C D');
assert.deepEqual(suggestNaming({title:'Example Show S02E07 | Player'}), {type:'series',title:'Example Show',season:'2',episode:'7',year:''});
assert.deepEqual(suggestNaming({mediaMeta:{type:'series',seriesTitle:'Dark',season:3,episode:8},title:'irrelevant'}), {type:'series',title:'Dark',season:'3',episode:'8',year:''});
assert.deepEqual(suggestNaming({mediaMeta:{type:'movie',title:'Arrival',datePublished:'2016-09-01'}}), {type:'movie',title:'Arrival',year:'2016',season:'',episode:''});
assert.equal(validateNaming({type:'movie',title:'Arrival',year:''}).ok, false);
assert.equal(validateNaming({type:'series',title:'Dark',season:'3',episode:'8'}).ok, true);
console.log('naming tests: OK');
