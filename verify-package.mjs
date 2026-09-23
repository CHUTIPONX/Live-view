import fs from 'node:fs';
const src=fs.readFileSync('public/season-atmospheres.js','utf8');
const engine=fs.readFileSync('public/season-atmosphere-engine.js','utf8');
const ids=[...src.matchAll(/\bid:"([^"]+)"/g)].map(x=>x[1]);
if(ids.length!==100)throw new Error(`scene count ${ids.length}`);
if(new Set(ids).size!==100)throw new Error('duplicate ids');
for(const s of ['"nature"','"cyber"','"space"','"fantasy"','"future"','"abstract"'])if(!src.includes(`category:${s}`))throw new Error('missing category '+s);
for(const s of ['SMART_SHUFFLE_RECENT','chooseForMinute','seededShuffle','fx-warp-stars','fx-black-hole','fx-portal'])if(!engine.includes(s))throw new Error('missing engine feature '+s);
console.log('100 WORLDS PACKAGE: PASS');
