import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTestTarget, verifyConnectedTarget } from '../../scripts/lib/isolated-target.mjs';

const env = { SKYRA_ISOLATED_TEST_ENV: 'true', ISOLATED_CLUSTER_ID: 'owned-cluster' };
const good = 'postgresql://skyra_isolated_user:separate-secret@127.0.0.1:5433/skyra_loghub_disposable_validation';
for (const [name, url, flags] of [
  ['missing test flag', good, {}],
  ['missing cluster marker', good, { SKYRA_ISOLATED_TEST_ENV: 'true' }],
  ['protected port', good.replace(':5433/', ':5432/'), env],
  ['protected database', good.replace('skyra_loghub_disposable_validation', 'skyra_loghub_dev'), env],
  ['arbitrary test name', good.replace('skyra_loghub_disposable_validation', 'valuable_test'), env],
  ['remote host', good.replace('127.0.0.1', 'example.com'), env],
  ['unexpected role', good.replace('skyra_isolated_user', 'postgres'), env],
  ['connection options', good + '?host=example.com', env],
  ['absent credentials', good.replace(':separate-secret', ''), env],
]) test(`target guard rejects ${name} before connecting`, () => assert.throws(() => validateTestTarget(url, flags)));

const target = validateTestTarget(good, env);
const identity = { database: target.database, role: target.user, port: 5433, host: '127.0.0.1', version: 170009 };
for (const [name, live, markers] of [
  ['live wrong port', { ...identity, port: 5432 }, [{ cluster_id: env.ISOLATED_CLUSTER_ID }]],
  ['live wrong database', { ...identity, database: 'other' }, [{ cluster_id: env.ISOLATED_CLUSTER_ID }]],
  ['unrecognized marker', identity, [{ cluster_id: 'not-owned' }]],
  ['missing marker', identity, []],
  ['wrong server version', { ...identity, version: 180000 }, [{ cluster_id: env.ISOLATED_CLUSTER_ID }]],
]) test(`target guard rejects ${name}`, async () => {
  const client = { query: async sql => ({ rows: sql.includes('current_database') ? [live] : markers }) };
  await assert.rejects(verifyConnectedTarget(client, target, env));
});
test('target guard accepts matching live identity and ownership marker', async () => {
  const client = { query: async sql => ({ rows: sql.includes('current_database') ? [identity] : [{ cluster_id: env.ISOLATED_CLUSTER_ID }] }) };
  assert.deepEqual(await verifyConnectedTarget(client, target, env), identity);
});
