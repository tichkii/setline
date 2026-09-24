import fs from 'node:fs';import crypto from 'node:crypto';
const assets=['index.html','styles.css','base.css','app.js','core.mjs','views.mjs','favicon.svg','manifest.webmanifest','icon-192.png','icon-512.png',"preferences.mjs","routines.mjs","fonts/space-grotesk-latin-variable.woff2","fonts/manrope-latin-variable.woff2"];
const h=crypto.createHash('sha256');for(const file of assets)h.update(fs.readFileSync(new URL('./dist/'+file,import.meta.url)));
const path=new URL('./dist/sw.js',import.meta.url),old=fs.readFileSync(path,'utf8');fs.writeFileSync(path,old.replace(/const CACHE='[^']+';/,`const CACHE='setline-${h.digest('hex').slice(0,12)}';`));console.log('Versioned offline cache for current app assets.');
