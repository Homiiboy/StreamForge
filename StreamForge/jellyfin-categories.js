export const JELLYFIN_CATEGORIES=Object.freeze(['Movies','Tv Shows','Animes','Anime Movies','Cartoon','Animation']);
export function normalizeJellyfinCategory(value,naming={}){return JELLYFIN_CATEGORIES.includes(value)?value:(naming.type==='series'?'Tv Shows':'Movies');}
export function suggestJellyfinCategory(naming={},meta={}){
  const raw=[meta.genre,meta.genres,meta.category,meta.categories,meta.keywords,meta.type,meta.pageTitle,meta.displayTitle,meta.title,meta.seriesTitle].flat(Infinity).filter(v=>typeof v==='string').join(' ').toLowerCase();
  const anime=/\b(?:anime|animes|anim[eé])\b|アニメ/i.test(raw);
  const cartoon=/\b(?:cartoon|cartoons|zeichentrick)\b/i.test(raw);
  const animation=/\b(?:animation|animated|animationsfilm|animationsserie)\b/i.test(raw);
  return naming.type==='series'?(anime?'Animes':cartoon?'Cartoon':animation?'Animation':'Tv Shows'):(anime?'Anime Movies':cartoon||animation?'Animation':'Movies');
}
