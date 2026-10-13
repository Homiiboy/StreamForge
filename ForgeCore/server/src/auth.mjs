import {scryptSync, randomBytes, createHash, timingSafeEqual} from 'node:crypto';
import {one,utc} from './db.mjs';
const TTL=7*24*60*60*1000;
const digest=token=>createHash('sha256').update(token).digest('hex');
const passwordHash=(password,salt)=>scryptSync(password,Buffer.from(salt,'hex'),64,{N:16384,r:8,p:1}).toString('hex');
export function isSetup(db){return !!one(db,'SELECT id FROM admins WHERE id=1');}
export function setupAdmin(db,password){
 if(isSetup(db))throw Object.assign(Error('Already configured'),{status:409});
 if(typeof password!=='string'||password.length<12||password.length>256)throw Object.assign(Error('Password must be 12-256 characters'),{status:400});
 const salt=randomBytes(32).toString('hex');
 db.prepare('INSERT INTO admins(id,password_hash,salt,created_at) VALUES (1,?,?,?)').run(passwordHash(password,salt),salt,utc());
}
export function verifyAdmin(db,password){
 const admin=one(db,'SELECT password_hash,salt FROM admins WHERE id=1');
 if(!admin||typeof password!=='string'||password.length>256)return false;
 const hash=Buffer.from(passwordHash(password,admin.salt),'hex');
 return timingSafeEqual(hash,Buffer.from(admin.password_hash,'hex'));
}
export function createSession(db){
 const token=randomBytes(32).toString('hex');
 const csrf=randomBytes(24).toString('hex');
 db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
 db.prepare('INSERT INTO sessions(token_hash,csrf,expires_at,created_at) VALUES(?,?,?,?)').run(digest(token),csrf,Date.now()+TTL,Date.now());
 return {token,csrf};
}
export function readSession(db,request){
 const cookie=String(request.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('forgecore_session='));
 const value=cookie?.slice('forgecore_session='.length)||'';
 if(!/^[a-f0-9]{64}$/.test(value))return null;
 return one(db,'SELECT token_hash,csrf,expires_at FROM sessions WHERE token_hash=? AND expires_at>?',digest(value),Date.now())||null;
}
export function deleteSession(db,session){if(session)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(session.token_hash);}
export function sessionCookie(token,secure=false){return `forgecore_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${TTL/1000}${secure?'; Secure':''}`;}
export function clearCookie(secure=false){return `forgecore_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure?'; Secure':''}`;}
export function checkCsrf(req,session){const actual=String(req.headers['x-forgecore-csrf']||'');if(!session||!/^[a-f0-9]{48}$/.test(actual)||!timingSafeEqual(Buffer.from(actual),Buffer.from(session.csrf)))throw Object.assign(Error('Invalid CSRF token'),{status:403});}
