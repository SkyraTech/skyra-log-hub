import fs from 'node:fs';
import path from 'node:path';
import {verifyCandidateHash} from './lib/evidence-output-policy.mjs';

const root=process.cwd(),candidate=process.argv[2],manifestPath=process.argv[3]??path.join(root,'.tmp/dev018-evidence/prior-evidence-hashes.json'),provenance=process.argv.find(arg=>arg.startsWith('--provenance='))?.slice('--provenance='.length)??'not supplied';
if(!candidate)throw Error('Usage: node scripts/verify-evidence-recovery-candidate.mjs <candidate-file-or-directory> [manifest-path] [--provenance=...]');
const manifest=JSON.parse(fs.readFileSync(path.resolve(manifestPath))),expectedEntries=Object.entries(manifest).filter(([file])=>file.startsWith('.tmp/dev013-evidence/')&&['http-security.json','outage-recovery.json','persistence.json','session-admin.log'].includes(path.basename(file)));
const requested=path.resolve(candidate),files=[];
function walk(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const full=path.join(directory,entry.name);if(entry.isDirectory())walk(full);else if(expectedEntries.some(([file])=>path.basename(file)===entry.name))files.push(full);}}
if(fs.statSync(requested).isDirectory())walk(requested);else files.push(requested);
const results=expectedEntries.map(([historicalPath,expected])=>{const candidates=files.filter(file=>path.basename(file)===path.basename(historicalPath)).map(file=>verifyCandidateHash(file,expected));return {historicalPath,expected,candidates,match:candidates.find(value=>value.match)??null,provenance,restorationRecommended:false};});
console.log(JSON.stringify({candidate:requested,manifest:path.resolve(manifestPath),provenance,results,authenticHistoricalEvidenceEstablished:results.every(result=>Boolean(result.match))},null,2));
