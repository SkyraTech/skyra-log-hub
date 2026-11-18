import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../../src/app.module.js';
import { ProblemDetailsFilter } from '../../src/common/filters/problem-details.filter.js';
import {
  ARCHIVE_SEGMENT_REPOSITORY,
  type IArchiveSegmentRepository,
} from '../../src/modules/archive-discovery/domain/archive-segment.repository.interface.js';

describe('DEV016 dashboard aggregates using real Query/DuckDB with canonical fixture archives', () => {
  let app: NestFastifyApplication;
  let tempArchiveRoot: string;
  let segmentRepo: IArchiveSegmentRepository;

  const tenantId = '00000000-0000-0000-0000-000000000001';
  const otherTenantId = '00000000-0000-0000-0000-000000000002';
  const projectAlpha = 'proj-alpha';
  const projectBeta = 'proj-beta';
  const secretProject = 'proj-secret';

  // Helper to create test JWT tokens
  const createToken = (tenant: string, projects: string[], user = 'test-analyst') => {
    const payload = {
      sub: user,
      tenantId: tenant,
      authorizedProjects: projects,
      allowedEnvironments: ['production', 'staging'],
      roles: ['analyst'],
    };
    return `Bearer test-token:${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  };

  const validToken = createToken(tenantId, [projectAlpha, projectBeta]);
  const restrictedToken = createToken(tenantId, [projectAlpha]); // Only alpha
  const otherTenantToken = createToken(otherTenantId, [projectAlpha]);

  before(async () => {
    tempArchiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-analytics-test-'));
    process.env['ARCHIVE_ROOT'] = tempArchiveRoot;
    process.env['QUERY_AUTH_MODE'] = 'test';
    process.env['NODE_ENV'] = 'test';

    const adapter = new FastifyAdapter({ logger: false });
    app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
      logger: false,
      abortOnError: false,
    });

    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    segmentRepo = app.get<IArchiveSegmentRepository>(ARCHIVE_SEGMENT_REPOSITORY);

    // Seed realistic canonical JSONL log segments across 2 projects
    const alphaDir = path.join(tempArchiveRoot, tenantId, projectAlpha, 'production', 'auth-service', '2026-10-26');
    const betaDir = path.join(tempArchiveRoot, tenantId, projectBeta, 'production', 'payment-service', '2026-10-26');
    const otherTenantDir = path.join(tempArchiveRoot, otherTenantId, projectAlpha, 'production', 'auth-service', '2026-10-26');

    fs.mkdirSync(alphaDir, { recursive: true });
    fs.mkdirSync(betaDir, { recursive: true });
    fs.mkdirSync(otherTenantDir, { recursive: true });

    // Events for Project Alpha (auth-service)
    const alphaEvents = [
      {
        '@timestamp': '2026-10-26T01:10:00.123Z',
        'ecs.version': '8.11.0',
        event: { id: 'a0000000-0000-4000-8000-000000000001', action: 'user.login' },
        log: { level: 'info' },
        message: 'User logged in',
        service: { name: 'auth-service', environment: 'production' },
        skyra: { project_id: projectAlpha, tenant_id: tenantId, schema_version: '1.0.0' },
      },
      {
        '@timestamp': '2026-10-26T01:25:00.456Z',
        'ecs.version': '8.11.0',
        event: { id: 'a0000000-0000-4000-8000-000000000002', action: 'user.login' },
        log: { level: 'info' },
        message: 'Second login',
        service: { name: 'auth-service', environment: 'production' },
        skyra: { project_id: projectAlpha, tenant_id: tenantId, schema_version: '1.0.0' },
      },
      {
        '@timestamp': '2026-10-26T02:05:00.789Z',
        'ecs.version': '8.11.0',
        event: { id: 'a0000000-0000-4000-8000-000000000003', action: 'user.login' },
        log: { level: 'error' },
        error: { type: 'InvalidCredentialsException', message: 'Auth failed' },
        message: 'Password mismatch for user \u2764\ufe0f Unicode User',
        service: { name: 'auth-service', environment: 'production' },
        skyra: { project_id: projectAlpha, tenant_id: tenantId, schema_version: '1.0.0' },
      },
    ];

    // Events for Project Beta (payment-service)
    const betaEvents = [
      {
        '@timestamp': '2026-10-26T01:40:00.000Z',
        'ecs.version': '8.11.0',
        event: { id: 'b0000000-0000-4000-8000-000000000001', action: 'payment.charge' },
        log: { level: 'info' },
        message: 'Charge successful',
        service: { name: 'payment-service', environment: 'production' },
        skyra: { project_id: projectBeta, tenant_id: tenantId, schema_version: '1.0.0' },
      },
      {
        '@timestamp': '2026-10-26T02:15:00.000Z',
        'ecs.version': '8.11.0',
        event: { id: 'b0000000-0000-4000-8000-000000000002', action: 'payment.charge' },
        log: { level: 'error' },
        error: { type: 'PaymentGatewayTimeout', message: 'Timeout contacting bank' },
        message: 'Charge failed: gateway timeout',
        service: { name: 'payment-service', environment: 'production' },
        skyra: { project_id: projectBeta, tenant_id: tenantId, schema_version: '1.0.0' },
      },
    ];

    // Events for Other Tenant (same service name, must NEVER leak!)
    const otherTenantEvents = [
      {
        '@timestamp': '2026-10-26T01:10:00.000Z',
        'ecs.version': '8.11.0',
        event: { id: 'x0000000-0000-4000-8000-000000000001', action: 'user.login' },
        log: { level: 'fatal' },
        message: 'Confidential other tenant event',
        service: { name: 'auth-service', environment: 'production' },
        skyra: { project_id: projectAlpha, tenant_id: otherTenantId, schema_version: '1.0.0' },
      },
    ];

    const writeSegment = async (dir: string, filename: string, events: object[], tenant: string, proj: string, sName: string) => {
      const filePath = path.join(dir, filename);
      const content = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
      fs.writeFileSync(filePath, content, 'utf8');
      const stat = fs.statSync(filePath);
      const hash = crypto.createHash('sha256').update(content).digest('hex');

      await segmentRepo.saveSegment({
        id: `seg-${tenant.slice(0, 4)}-${proj}-${filename}`,
        tenantId: tenant,
        projectId: proj,
        environment: 'production',
        serviceName: sName,
        date: '2026-10-26',
        segmentFilename: filename,
        recordCount: events.length,
        byteSize: stat.size,
        sha256Checksum: hash,
        firstEventTimestamp: new Date('2026-10-26T01:00:00Z'),
        lastEventTimestamp: new Date('2026-10-26T03:00:00Z'),
        finalizedAt: new Date('2026-10-26T03:05:00Z'),
        writerInstanceId: 'writer-01',
        journalSegmentId: 'j-01',
        journalStartOffset: 0,
        journalEndOffset: stat.size,
      });
    };

    await writeSegment(alphaDir, 'segment-0000.jsonl', alphaEvents, tenantId, projectAlpha, 'auth-service');
    await writeSegment(alphaDir, 'segment-copy.jsonl', [alphaEvents[0]!], tenantId, projectAlpha, 'auth-service');
    await writeSegment(betaDir, 'segment-0000.jsonl', betaEvents, tenantId, projectBeta, 'payment-service');
    await writeSegment(otherTenantDir, 'segment-0000.jsonl', otherTenantEvents, otherTenantId, projectAlpha, 'auth-service');
  });

  after(async () => {
    if (app) {
      await app.close();
    }
    try {
      fs.rmSync(tempArchiveRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });


 const payload=(overrides:Record<string,unknown>={})=>({projects:[projectAlpha],time_range:{start:'2026-10-26T00:00:00.000Z',end:'2026-10-26T03:00:00.000Z'},interval:'1h',top_n:5,...overrides});
 const query=async(data=payload(),token=validToken)=>app.inject({method:'POST',url:'/query/v1/logs/dashboard',headers:{authorization:token},payload:data});
 it('Counts and service buckets reconcile; previous zero is new activity with null percent',async()=>{const r=await query();assert.equal(r.statusCode,200,r.body);const d=r.json();assert.deepEqual(d.current.metrics,{total:3,errors:1,warnings:0,errorRate:1/3*100,services:1});assert.equal(d.previous.metrics.total,0);assert.equal(d.comparison.changes.total.percent,null);assert.equal(d.comparison.changes.total.activity,'NEW');assert.equal(d.comparison.changes.errorRate.percentagePoints,1/3*100);assert.equal(d.serviceTrends.services[0].buckets.length,3);assert.equal(d.serviceTrends.services[0].buckets.reduce((n:number,b:any)=>n+b.count,0),3);assert.equal(d.current.aggregations.error_over_time.buckets.reduce((n:number,b:any)=>n+b.count,0),1);});
 it('Adjacent equal-duration periods use event time and exact error-rate percentage points',async()=>{const r=await query(payload({time_range:{start:'2026-10-26T02:00:00.000Z',end:'2026-10-26T03:00:00.000Z'}}));assert.equal(r.statusCode,200,r.body);const d=r.json();assert.equal(d.current.metrics.total,1);assert.equal(d.previous.metrics.total,2);assert.equal(d.comparison.changes.total.absolute,-1);assert.equal(d.comparison.changes.total.percent,-50);assert.equal(d.comparison.changes.errorRate.percentagePoints,100);assert.deepEqual(d.previous.range,{start:'2026-10-26T01:00:00.000Z',end:'2026-10-26T02:00:00.000Z',timezone:'UTC'});});
 it('Both empty periods remain complete with no activity and defined zero error rate',async()=>{const r=await query(payload({time_range:{start:'2026-10-27T02:00:00.000Z',end:'2026-10-27T03:00:00.000Z'}}));assert.equal(r.statusCode,200,r.body);const d=r.json();assert.equal(d.current.metrics.total,0);assert.equal(d.current.metrics.errorRate,0);assert.equal(d.comparison.changes.total.activity,'NONE');assert.equal(d.comparison.changes.total.percent,null);});
 it('Current zero and positive previous gives minus 100 percent',async()=>{const r=await query(payload({time_range:{start:'2026-10-26T03:00:00.000Z',end:'2026-10-26T04:00:00.000Z'}}));assert.equal(r.statusCode,200,r.body);assert.equal(r.json().comparison.changes.total.percent,-100);});
 it('Foreign principal never counts another tenant events',async()=>{const r=await query(payload(),otherTenantToken);assert.equal(r.statusCode,200,r.body);assert.equal(r.json().current.metrics.total,1);assert.equal(r.json().current.metrics.errors,1);});
 it('Foreign project and missing authentication are denied',async()=>{assert.equal((await query(payload({projects:[projectBeta]}),restrictedToken)).statusCode,403);assert.equal((await query(payload(),'')).statusCode,401);});
 for(const [name,extra]of Object.entries({correlation:{correlation_id:'No-Match'},service:{services:['payment-service']},severity:{levels:['fatal']}}))it('Combined '+name+' filter yields an authoritative empty result',async()=>{const r=await query(payload(extra));assert.equal(r.statusCode,200,r.body);assert.equal(r.json().current.metrics.total,0);});
 for(const [name,extra]of Object.entries({arbitraryInterval:{interval:'1ms'},buckets:{interval:'1m',time_range:{start:'2026-10-26T00:00:00Z',end:'2026-10-26T05:00:00Z'}},topN:{top_n:11},rawSQL:{sql:'SELECT *'},malformedCorrelation:{correlation_id:''},projectOverride:{tenantId:otherTenantId},reversed:{time_range:{start:'2026-10-27T00:00:00Z',end:'2026-10-26T00:00:00Z'}}}))it('Rejects '+name,async()=>{const r=await query(payload(extra));assert.ok([400,422].includes(r.statusCode),r.body);});
 it('Unavailable canonical segment preserves partial available counts and withholds comparisons without zero fill',async()=>{const file=path.join(tempArchiveRoot,tenantId,projectAlpha,'production','auth-service','2026-10-26','segment-0000.jsonl'),held=file+'.held';fs.renameSync(file,held);try{const r=await query();assert.equal(r.statusCode,200,r.body);const d=r.json();assert.equal(d.current.completeness,'PARTIAL');assert.equal(d.current.metrics.total,1);assert.equal(d.comparison.complete,false);assert.equal(d.comparison.changes,null);assert.equal(d.serviceTrends.complete,false);assert.equal(d.current.aggregations.volume_over_time.buckets.length,1);}finally{fs.renameSync(held,file);}});
 it('Recovery after canonical archive restoration returns complete reconciled metrics',async()=>{const r=await query();assert.equal(r.statusCode,200,r.body);assert.equal(r.json().current.completeness,'COMPLETE');assert.equal(r.json().current.metrics.total,3);});

});
