const fs = require('fs'); 
const path = require('path'); 

function walk(dir) { 
    let files = []; 
    for (const f of fs.readdirSync(dir)) { 
        const p = path.join(dir, f); 
        if (fs.statSync(p).isDirectory()) files.push(...walk(p)); 
        else if (p.endsWith('.tsx')) files.push(p); 
    } 
    return files; 
} 

const files = walk('C:/kpi monitoring/apps/dashboard/src/app'); 
for (const f of files) { 
    let content = fs.readFileSync(f, 'utf8'); 
    let updated = false;
    if (content.includes("http://localhost:4000")) { 
        content = content.replace(/http:\/\/localhost:4000/g, ''); 
        updated = true;
    } 
    if (updated) {
        fs.writeFileSync(f, content); 
        console.log('Updated:', f); 
    }
}
