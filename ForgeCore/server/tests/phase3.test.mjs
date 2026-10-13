import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase,newId,utc} from '../src/db.mjs';
import {validateSchedule,scheduleAllows,setSchedule,loadSchedule,scoreSource,sourceRanking,missingEpisodePlan,addNotification,listNotifications,markNotificationRead,diagnostics} from '../src/phase3.mjs';
import {vttToSrt,normalizeLanguage,downloadSubtitle} from '../src/subtitles.mjs';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('valid scheduling with day boundary',()=>{
 assert.equal(scheduleAllows(validateSchedule({enabled:true,startHour:12,endHour:16,days:[2]}),new Date('2026-10-13T13:00:00')),true);
 assert.equal(scheduleAllows(validateSchedule({enabled:true,startHour:12,endHour:16,days:[2]}),new Date('2026-10-13T20:00:00')),false);
 assert.throws(()=>validateSchedule({enabled:true,startHour:22,endHour:6}),/Invalid/);
 assert.throws(()=>validateSchedule({days:[1,1]}),/Invalid/);
});
test('source ranking, missing episodes and notifications',()=>{
 const db=openDatabase();try{
  const now=utc(),mediaId=newId(),sourceId=newId(),epId=newId();
  db.prepare('INSERT INTO media(id,kind,title,created_at,updated_at) VALUES(?,?,?,?,?)').run(mediaId,'series','Slugterra',now,now);
  db.prepare('INSERT INTO sources(id,media_id,url,label,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(sourceId,mediaId,'https://media.example/episode.m3u8','HLS',1,now,now);
  db.prepare('INSERT INTO episodes(id,media_id,season,episode,title,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(epId,mediaId,2,8,'F',now,now);
  for(const episode of [8,9])db.prepare('INSERT INTO source_items(id,source_id,url,season,episode,title,created_at) VALUES(?,?,?,?,?,?,?)').run(newId(),sourceId,'https://media.example/episode'+episode+'.m3u8',2,episode,'Slugterra S02E'+episode,now);
  const rank=sourceRanking(db,mediaId);assert.equal(rank.length,1);assert.equal(rank[0].format,'HLS');
  const plan=missingEpisodePlan(db,mediaId,sourceId);assert.equal(plan.total,2);assert.equal(plan.missing,1);assert.equal(plan.items[1].reason,'not_in_library');
  const schedule=setSchedule(db,{enabled:true,startHour:8,endHour:18,days:[1,2,3,4,5]});assert.deepEqual(loadSchedule(db),schedule);
  const id=addNotification(db,{category:'download',message:'Fertig'});assert.equal(diagnostics(db).unreadNotifications,1);
  assert.equal(markNotificationRead(db,id),true);assert.equal(markNotificationRead(db,id),false);assert.equal(listNotifications(db).length,1);
 }finally{db.close()}
});
test('VTT subtitle conversion and language validation',()=>{
 const content='WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHallo &amp; Welt\n\n00:00:02.500 --> 00:00:04.000\nZweite Zeile\n';
 const out=vttToSrt(content);assert.match(out,/00:00:01,000 --> 00:00:02,000/);assert.match(out,/Hallo & Welt/);assert.match(out,/\n2\n/);
 assert.equal(normalizeLanguage('DE'),'de');assert.throws(()=>normalizeLanguage('../test'));
 assert.throws(()=>vttToSrt('not a subtitle'));
});
test('subtitle save refuses replacement and requires existing movie',async()=>{
 const root=await mkdtemp(join(tmpdir(),'fcsub-'));try{
  const path=join(root,'Movies','Interstellar (2014)');await mkdir(path,{recursive:true});await writeFile(join(path,'Interstellar (2014).mp4'),'x');
  const body=Buffer.from('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n');
  const args={root,media:{kind:'movie',title:'Interstellar',year:2014},url:'https://example.org/captions.vtt',language:'de',fetcher:async()=>({body})};
  const result=await downloadSubtitle(args);assert.equal(result.path,'Movies/Interstellar (2014)/Interstellar (2014).de.srt');
  await assert.rejects(downloadSubtitle(args),/EEXIST/);
 }finally{await rm(root,{recursive:true,force:true})}
});
