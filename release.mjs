import fs from 'node:fs';import crypto from 'node:crypto';
const assets=['index.html','styles.css','base.css','app.js','core.mjs','views.mjs','sharing.mjs','routine-sharing.mjs','share-card.mjs','offline.mjs','updates.mjs','boot.js','favicon.svg','manifest.webmanifest','icon-192.png','icon-512.png',"preferences.mjs","routines.mjs","fonts/space-grotesk-latin-variable.woff2","fonts/manrope-latin-variable.woff2"];
const path=new URL('./dist/sw.js',import.meta.url),old=fs.readFileSync(path,'utf8');
// Ignore the generated version itself, but include worker behavior so a new
// installation never overwrites the active worker's cache under the same name.
const h=crypto.createHash('sha256');h.update(old.replace(/const CACHE='[^']+';/,"const CACHE='setline-release';"));
for(const file of assets){h.update('\0'+file+'\0');h.update(fs.readFileSync(new URL('./dist/'+file,import.meta.url)))}
fs.writeFileSync(path,old.replace(/const CACHE='[^']+';/,`const CACHE='setline-${h.digest('hex').slice(0,12)}';`));console.log('Versioned offline cache for current app assets and worker.');
