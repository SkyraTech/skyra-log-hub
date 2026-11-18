import fs from 'node:fs';import path from 'node:path';
import {root} from './isolated-postgres.mjs';import {maintenanceTarget} from './lib/storage-maintenance-target.mjs';
import {StorageMaintenance} from '../apps/ingestion-gateway/dist/storage/maintenance/storage-maintenance.js';
if(process.argv.slice(2).some(a=>a!=='--apply'))throw Error('Only --apply is supported; default is dry-run');
const target=JSON.parse(fs.readFileSync(path.join(root,'.tmp/dev012-evidence/target.json')));
const {db,options}=await maintenanceTarget(target.store);
try{const report=await new StorageMaintenance(db).run({...options,apply:process.argv.includes('--apply')});console.log(JSON.stringify(report,null,2));}finally{await db.end();}
