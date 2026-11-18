import fs from 'node:fs';import {maintenanceTarget} from '../../scripts/lib/storage-maintenance-target.mjs';
import {StorageMaintenance} from '../../apps/ingestion-gateway/dist/storage/maintenance/storage-maintenance.js';
const target=JSON.parse(fs.readFileSync(process.argv[2]));const {db,options}=await maintenanceTarget(target.store);
try{const result=await new StorageMaintenance(db).run({...options,apply:true,minAgeMs:0,maxSegments:16,fault:async stage=>{if(stage===process.argv[3]){process.send({paused:stage});await new Promise(()=>{});}}});process.send({result});}finally{await db.end();}
