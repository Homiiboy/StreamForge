import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../popup.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../popup.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../popup.css',import.meta.url),'utf8');
for(const id of ['viewMedia','viewDownloads','downloadCenter','centerStats','activeDownloads','downloadHistory','historyClear','activeCount']) {
 assert.match(html,new RegExp('id="'+id+'"'), 'missing popup element '+id);
 assert.ok(js.includes("'#"+id+"'"),'missing JavaScript binding '+id);
}
const version=JSON.parse(fs.readFileSync(new URL('../manifest.json',import.meta.url),'utf8')).version;
assert.ok(html.includes('Browser Connector '+version));
assert.match(css,/#downloadCenter/);
assert.match(js,/aria-pressed/);
console.log('download center markup checks passed');
