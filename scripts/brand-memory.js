// Transfer only brand knowledge, never users, passwords, tokens or environment files.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),Database=require('better-sqlite3');
const root=path.resolve(__dirname,'..');require('dotenv').config({path:path.join(root,'.env')});require('dotenv').config({path:path.join(root,'brand.env'),override:true});
const tables=['brands','brand_analyses','xhs_writing_methods','brand_writing_knowledge'];
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function main(){
  const args=process.argv.slice(2),mode=args[0],file=args[1];
  if(!['--export','--import'].includes(mode)||!file)throw Error('Usage: node scripts/brand-memory.js --export FILE | --import FILE [--apply] [--owner USER_ID]');
  const dbPath=path.join(process.env.DATA_DIR||path.join(root,'data'),'users.db');
  const db=new Database(dbPath,{readonly:mode==='--export'||!args.includes('--apply')});
  try{
    if(mode==='--export'){
      const data={format:'brand-memory-v1',exported_at:new Date().toISOString(),tables:{}};
      for(const name of tables){data.tables[name]=db.prepare('SELECT name FROM sqlite_master WHERE name=?').get(name)?db.prepare('SELECT * FROM '+name).all():[];if(name==='brand_writing_knowledge')data.tables[name]=data.tables[name].map(({user_id,...row})=>row);}
      fs.writeFileSync(path.resolve(file),JSON.stringify(data,null,2),{flag:'wx',mode:0o600});console.log('Exported brand knowledge:',Object.fromEntries(tables.map(t=>[t,data.tables[t].length])));return;
    }
    const source=JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));
    if(source.format!=='brand-memory-v1'||!source.tables||tables.some(t=>!Array.isArray(source.tables[t])))throw Error('Invalid brand-memory export');
    const rows=source.tables,brands=new Map(),conflicts=[];
    const columns=table=>new Set(db.prepare('PRAGMA table_info('+table+')').all().map(c=>c.name));
    const allowed={};for(const t of tables){allowed[t]=columns(t);if(rows[t].length&&!allowed[t].size)throw Error('Target table missing; start updated application first: '+t);}
    for(const row of rows.brands){
      if(!Number.isInteger(row.id)||!String(row.name||'').trim()||brands.has(row.id))throw Error('Invalid or duplicate source brand');
      const matches=db.prepare('SELECT * FROM brands WHERE name=?').all(row.name);
      if(matches.length>1)throw Error('Ambiguous target brand name: '+row.name);
      const match=matches[0];
      if(match)for(const key of allowed.brands)if(!['id','updated_at'].includes(key)&&row[key]!==undefined&&row[key]!==match[key]&&![null,'','[]'].includes(row[key])&&![null,'','[]'].includes(match[key]))conflicts.push(row.name+': '+key);
      brands.set(row.id,match?.id||null);
    }
    for(const t of ['brand_analyses','brand_writing_knowledge'])for(const row of rows[t])if(row.brand_id!=null&&!brands.has(row.brand_id))throw Error('Unknown source brand in '+t);
    console.log('Import preview:',Object.fromEntries(tables.map(t=>[t,rows[t].length])));
    if(conflicts.length)throw Error('Conflicting existing brand fields (nothing changed): '+conflicts.join(', '));
    if(!args.includes('--apply')){console.log('Dry run only. Add --apply after reviewing.');return;}
    const ownerArg=args.indexOf('--owner'),owner=ownerArg>=0?Number(args[ownerArg+1]):null;
    if(rows.brand_writing_knowledge.length&&!db.prepare('SELECT id FROM users WHERE id=?').get(owner||0))throw Error('Provide --owner with an existing local user ID for imported knowledge');
    const backup=dbPath+'.before-brand-import-'+Date.now()+'.db';await db.backup(backup);console.log('Database backup:',backup);
    db.transaction(()=>{
      db.exec('CREATE TABLE IF NOT EXISTS brand_memory_imports(fingerprint TEXT PRIMARY KEY,imported_at TEXT DEFAULT CURRENT_TIMESTAMP)');
      function insert(table,row){const values=Object.fromEntries(Object.entries(row).filter(([k])=>allowed[table].has(k)&&k!=='id'));const keys=Object.keys(values);return db.prepare('INSERT INTO '+table+' ('+keys.join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>values[k]??null)).lastInsertRowid;}
      for(const row of rows.brands){const id=brands.get(row.id);if(!id){brands.set(row.id,insert('brands',row));continue;}const current=db.prepare('SELECT * FROM brands WHERE id=?').get(id);for(const key of allowed.brands)if(!['id','updated_at'].includes(key)&&[null,'','[]'].includes(current[key])&&row[key]!=null)db.prepare('UPDATE brands SET '+key+'=? WHERE id=?').run(row[key],id);}
      for(const t of tables.slice(1))for(const original of rows[t]){
        const row={...original};delete row.id;if(row.brand_id!=null)row.brand_id=brands.get(row.brand_id);if(t==='brand_writing_knowledge')row.user_id=owner;
        const fingerprint=hash({table:t,row});if(db.prepare('SELECT fingerprint FROM brand_memory_imports WHERE fingerprint=?').get(fingerprint))continue;
        let duplicate=false;
        if(t==='brand_analyses')duplicate=!!db.prepare('SELECT id FROM brand_analyses WHERE brand_id=? AND report=?').get(row.brand_id,row.report);
        if(t==='xhs_writing_methods')duplicate=!!db.prepare('SELECT id FROM xhs_writing_methods WHERE title=? AND structure=? AND logic=?').get(row.title,row.structure||'',row.logic||'');
        if(!duplicate)insert(t,row);db.prepare('INSERT INTO brand_memory_imports(fingerprint) VALUES(?)').run(fingerprint);
      }
    })();console.log('Import complete. Existing nonempty brand fields were not overwritten.');
  }finally{db.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
