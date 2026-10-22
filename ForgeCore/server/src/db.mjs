import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const MIGRATIONS=[
`CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY CHECK (id=1), password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('movie','series')), title TEXT NOT NULL, year INTEGER, external_id TEXT, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_media_kind_title ON media(kind,title);
CREATE TABLE IF NOT EXISTS episodes (id TEXT PRIMARY KEY, media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE, season INTEGER NOT NULL CHECK(season BETWEEN 0 AND 999), episode INTEGER NOT NULL CHECK(episode BETWEEN 0 AND 9999), title TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'missing' CHECK(status IN ('missing','available','ignored')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(media_id,season,episode));
CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK(type IN ('library_scan','metadata_check')), state TEXT NOT NULL CHECK(state IN ('queued','running','complete','failed','cancelled')), payload TEXT NOT NULL DEFAULT '{}', result TEXT, attempts INTEGER NOT NULL DEFAULT 0, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`,
`CREATE INDEX IF NOT EXISTS idx_jobs_state_created ON jobs(state,created_at);`,
`CREATE INDEX IF NOT EXISTS idx_episodes_media ON episodes(media_id,season,episode);`,
`CREATE TABLE IF NOT EXISTS sources (
 id TEXT PRIMARY KEY,media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
 url TEXT NOT NULL,label TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL, UNIQUE(media_id,url));
CREATE INDEX IF NOT EXISTS idx_sources_media ON sources(media_id);
CREATE TABLE IF NOT EXISTS source_items (
 id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
 url TEXT NOT NULL,title TEXT NOT NULL DEFAULT '',season INTEGER,episode INTEGER,
 created_at TEXT NOT NULL, UNIQUE(source_id,url));
CREATE TABLE IF NOT EXISTS transfer_jobs (
 id TEXT PRIMARY KEY,media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
 episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL,
 source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
 item_id TEXT REFERENCES source_items(id) ON DELETE SET NULL,
 url TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('queued','running','complete','failed','cancelled')),
 progress INTEGER NOT NULL DEFAULT 0,downloaded_bytes INTEGER NOT NULL DEFAULT 0,
 attempts INTEGER NOT NULL DEFAULT 0,result_json TEXT,error TEXT,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_transfer_state ON transfer_jobs(state,created_at);
CREATE INDEX IF NOT EXISTS idx_source_items_source ON source_items(source_id);`,
`CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,category TEXT NOT NULL,message TEXT NOT NULL,ref_id TEXT,created_at TEXT NOT NULL,read_at TEXT);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read_at,created_at);
CREATE TABLE IF NOT EXISTS subtitle_jobs(id TEXT PRIMARY KEY,media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL,url TEXT NOT NULL,language TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('queued','running','complete','failed','cancelled')),result TEXT,error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_subtitle_state ON subtitle_jobs(state,created_at);`,
`ALTER TABLE transfer_jobs ADD COLUMN retry_after_epoch INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_transfer_retry ON transfer_jobs(state,retry_after_epoch);
CREATE TABLE IF NOT EXISTS transfer_events(id INTEGER PRIMARY KEY AUTOINCREMENT,transfer_id TEXT NOT NULL,category TEXT NOT NULL,description TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_transfer_events ON transfer_events(transfer_id,id);`,
`CREATE TABLE IF NOT EXISTS source_automation(source_id TEXT PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),auto_queue INTEGER NOT NULL DEFAULT 0 CHECK(auto_queue IN (0,1)),auto_add_episodes INTEGER NOT NULL DEFAULT 1 CHECK(auto_add_episodes IN (0,1)),interval_minutes INTEGER NOT NULL DEFAULT 360 CHECK(interval_minutes BETWEEN 30 AND 10080),max_per_check INTEGER NOT NULL DEFAULT 10 CHECK(max_per_check BETWEEN 1 AND 50),next_check_epoch INTEGER NOT NULL DEFAULT 0,last_check_epoch INTEGER,failures INTEGER NOT NULL DEFAULT 0,last_error TEXT,last_discovered INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_source_automation_due ON source_automation(enabled,next_check_epoch);
CREATE TABLE IF NOT EXISTS source_check_events(id INTEGER PRIMARY KEY AUTOINCREMENT,source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,checked_at TEXT NOT NULL,status TEXT NOT NULL,discovered INTEGER NOT NULL DEFAULT 0,new_episodes INTEGER NOT NULL DEFAULT 0,queued INTEGER NOT NULL DEFAULT 0,message TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS idx_source_check_events_source ON source_check_events(source_id,id);`,
`ALTER TABLE sources ADD COLUMN adapter_id TEXT NOT NULL DEFAULT 'auto';
CREATE TABLE IF NOT EXISTS jellyfin_sync_events(id INTEGER PRIMARY KEY AUTOINCREMENT,checked_at TEXT NOT NULL,matched INTEGER NOT NULL,updated INTEGER NOT NULL,unmatched INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_jellyfin_sync_events_checked ON jellyfin_sync_events(checked_at);`,
`CREATE TABLE IF NOT EXISTS search_sites(id TEXT PRIMARY KEY,url TEXT NOT NULL UNIQUE,label TEXT NOT NULL,adapter_id TEXT NOT NULL DEFAULT 'auto',enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);`
];
export const utc=()=>new Date().toISOString();
export function openDatabase(path=':memory:'){
 if(path!==':memory:')mkdirSync(dirname(resolve(path)),{recursive:true});
 const db=new DatabaseSync(path,{timeout:3000});
 db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
 let v=db.prepare('PRAGMA user_version').get().user_version;
 if(v>MIGRATIONS.length)throw new Error('Database created by a newer ForgeCore version');
 for(;v<MIGRATIONS.length;v++){
  db.exec('BEGIN IMMEDIATE;');
  try{db.exec(MIGRATIONS[v]);db.exec(`PRAGMA user_version=${v+1};`);db.exec('COMMIT;');}
  catch(e){db.exec('ROLLBACK;');throw e;}
 }
 db.prepare("UPDATE jobs SET state='queued',updated_at=? WHERE state='running'").run(utc());
 db.prepare("UPDATE transfer_jobs SET state='queued',updated_at=? WHERE state='running'").run(utc());
 db.prepare("UPDATE subtitle_jobs SET state='queued',updated_at=? WHERE state='running'").run(utc());
 return db;
}
export function newId(){return randomUUID();}
export const rows=(db,query,...params)=>db.prepare(query).all(...params);
export const one=(db,query,...params)=>db.prepare(query).get(...params);
export function transaction(db,fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
