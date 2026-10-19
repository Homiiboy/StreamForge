import {safeFolderPart} from './library-folders.js';

/** Read-only scan: never creates folders or writes files. */
export function parseSeasonFolder(name) {
  const text=String(name||'').trim();
  const match=text.match(/^(?:season|staffel)[\s._-]*0*(\d{1,3})$/i);
  if(match)return Number(match[1]);
  if(/^specials$/i.test(text))return 0;
  return null;
}
async function existingFolder(parent, wanted) {
  if(!parent)return null;
  const target=safeFolderPart(wanted).toLocaleLowerCase();
  for await(const [name,handle] of parent.entries()){
    if(handle.kind==='directory' && name.toLocaleLowerCase()===target)return handle;
  }
  return null;
}
export async function findSeriesFolder(root,{placement='library',title='',category='Tv Shows'}) {
  if(!root || typeof root.entries!=='function')throw Error('Gewählter Ordner ist nicht lesbar.');
  if(placement==='season'||placement==='series')return root;
  let parent=root;
  if(placement==='library')parent=await existingFolder(root,category);
  if(!parent)return null;
  return existingFolder(parent,title);
}
export async function discoverSeasons(root,{placement='library',title=''}={}) {
  if(!root || typeof root.entries!=='function')throw Error('Bitte zuerst einen gültigen Medienordner auswählen.');
  if(typeof root.queryPermission==='function'){
    const permission=await root.queryPermission({mode:'read'});
    if(permission!=='granted')throw Error('Leseberechtigung fehlt. Bitte den Medienordner erneut auswählen.');
  }
  if(placement==='season'){
    const number=parseSeasonFolder(root.name);
    return number===null?[]:[{number,name:root.name}];
  }
  const series=await findSeriesFolder(root,{placement,title,category});
  if(!series)return [];
  const seasons=[];
  for await(const [name,handle] of series.entries()){
    if(handle.kind!=='directory')continue;
    const number=parseSeasonFolder(name);
    if(number!==null)seasons.push({number,name});
  }
  seasons.sort((a,b)=>a.number-b.number||a.name.localeCompare(b.name,'de'));
  return seasons.slice(0,200);
}
export function checkedSeasonFolder(name,season){
  const number=parseSeasonFolder(name);
  if(number===null || number!==Number(season))throw Error('Staffelordner passt nicht zur Staffelnummer.');
  return String(name);
}
