import crypto from 'node:crypto';
export async function seedCredentialFixtures(owner,clusterId){
  const suffix=crypto.randomUUID(),issuer='https://auth.skyra.dev';
  const tenantA=(await owner.query("INSERT INTO tenants(code,name,updated_at) VALUES($1,'Credential Alpha',now()) RETURNING id",['credential-a-'+suffix])).rows[0].id;
  const tenantB=(await owner.query("INSERT INTO tenants(code,name,updated_at) VALUES($1,'Credential Beta',now()) RETURNING id",['credential-b-'+suffix])).rows[0].id;
  const users={};
  const records=[['owner','OrgOwner','ACTIVE','ACTIVE'],['owner2','OrgOwner','ACTIVE','ACTIVE'],['admin','OrgAdmin','ACTIVE','ACTIVE'],['projectAdmin','ProjectAdmin','ACTIVE','ACTIVE'],['developer','Developer','ACTIVE','ACTIVE'],['viewer','Viewer','ACTIVE','ACTIVE'],['credentialViewer','Viewer','ACTIVE','ACTIVE'],['suspended','Developer','SUSPENDED','ACTIVE'],['revoked','Viewer','REVOKED','ACTIVE'],['pending','Viewer','PENDING_INVITE','ACTIVE'],['disabled','Developer','ACTIVE','SUSPENDED'],...Array.from({length:15},(_,i)=>['extra'+i,'Viewer','ACTIVE','ACTIVE'])];
  for(const [label,role,status,identity]of records){
    const subject='credential-'+label+'-'+suffix,id=(await owner.query('INSERT INTO users(issuer,subject,email,display_name,status) VALUES($1,$2,$3,$4,$5) RETURNING id',[issuer,subject,label+'@credentials.test.invalid',label==='viewer'?'Casey Viewer':label==='developer'?'Devin Developer':label,identity])).rows[0].id;
    const membership=(await owner.query('INSERT INTO tenant_memberships(tenant_id,user_id,status) VALUES($1,$2,$3) RETURNING id',[tenantA,id,status])).rows[0].id;
    if(!['projectAdmin','developer'].includes(label))await owner.query('INSERT INTO role_assignments(tenant_id,user_id,role_id) SELECT $1,$2,id FROM roles WHERE name=$3',[tenantA,id,role]);
    users[label]={id,subject,membership};
  }
  const projectA=crypto.randomUUID(),projectB=crypto.randomUUID();for(const [id,tenant]of [[projectA,tenantA],[projectB,tenantB]])await owner.query("INSERT INTO projects(id,tenant_id,name,updated_at) VALUES($1,$2,'Member Scope',now())",[id,tenant]);
  const projectPrefix='project-'+crypto.randomUUID().slice(0,8),projects=[];
  for(let i=0;i<17;i++){const id=projectPrefix+'-'+String(i).padStart(2,'0');await owner.query('INSERT INTO projects(id,tenant_id,name,status,updated_at) VALUES($1,$2,$3,$4,now())',[id,tenantA,'Project '+String(i).padStart(2,'0'),i===15?'SUSPENDED':i===16?'ARCHIVED':'ACTIVE']);projects.push(id);}
  for(const [label,role,project]of [['projectAdmin','ProjectAdmin',projects[0]],['developer','Developer',projects[0]],['viewer','Developer',projectA]]){await owner.query('INSERT INTO project_memberships(tenant_id,user_id,project_id) VALUES($1,$2,$3)',[tenantA,users[label].id,project]);await owner.query('INSERT INTO role_assignments(tenant_id,user_id,project_id,role_id) SELECT $1,$2,$3,id FROM roles WHERE name=$4',[tenantA,users[label].id,project,role]);}
  const other=(await owner.query("INSERT INTO users(issuer,subject,email,display_name) VALUES($1,$2,'other@credentials.test.invalid','Other Tenant') RETURNING id",[issuer,'credential-other-'+suffix])).rows[0].id;
  const foreignMembership=(await owner.query('INSERT INTO tenant_memberships(tenant_id,user_id) VALUES($1,$2) RETURNING id',[tenantB,other])).rows[0].id;
  users.other={id:other,subject:'credential-other-'+suffix,membership:foreignMembership};
  await owner.query("INSERT INTO role_assignments(tenant_id,user_id,role_id) SELECT $1,$2,id FROM roles WHERE name='Viewer'",[tenantB,other]);
  const missingSubject='credential-missing-'+suffix;users.missing={id:(await owner.query("INSERT INTO users(issuer,subject,email,display_name) VALUES($1,$2,'missing@credentials.test.invalid','Missing Membership') RETURNING id",[issuer,missingSubject])).rows[0].id,subject:missingSubject};
  return {clusterId,issuer,tenantA,tenantB,users,foreignMembership,projectA,projectB,projectPrefix,projects,credentialProject:projects[0]};
}
