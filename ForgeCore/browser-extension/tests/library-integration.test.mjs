import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const html=read('popup.html'),popup=read('popup.js'),background=read('background.js'),offscreen=read('offscreen.js');
const manifest=JSON.parse(read('manifest.json'));
assert.equal(manifest.version,'1.8.7');
assert.ok(html.includes('Browser Connector '+manifest.version));
for(const id of ['libraryMode','libraryPlacement','libraryPick','libraryTarget','libraryForget']){
 assert.ok(html.includes('id="'+id+'"'),id+' markup missing');
 assert.ok(popup.includes("'#"+id+"'"),id+' event binding missing');
}
assert.match(popup,/showDirectoryPicker\(/);
assert.match(popup,/handleKey='job-'/);
assert.match(offscreen,/writeIntoLibrary\(/);
assert.match(offscreen,/directoryHandleStore\(\)\.get\(job\.library\.handleKey/);
assert.match(background,/downloadsRelativePath\(/);
assert.match(background,/conflictAction:'uniquify'/);
assert.match(background,/naming:message\.naming, library:message\.library/);
assert.match(html,/seasonScan/);
assert.match(popup,/discoverSeasons\(/);
assert.match(offscreen,/seasonFolder:job\.library\.seasonFolder/);
console.log('Jellyfin folder UI/export integration wiring tests passed');
