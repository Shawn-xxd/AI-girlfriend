const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const run = promisify(execFile);
const [, , container, database] = process.argv;
if (
  !/^[a-z0-9_-]+$/i.test(container || '') ||
  !/^companion_schema_test_[0-9_]+$/.test(database || '')
)
  throw new Error('Isolated schema test database required');
const env = { ...process.env };
for (const key of [
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_TLS',
  'DOCKER_TLS_VERIFY',
  'DOCKER_CERT_PATH',
])
  delete env[key];
const actor = randomUUID(),
  character = randomUUID(),
  conversation = randomUUID();
function sql(query) {
  return run(
    'docker',
    [
      '--host=unix:///var/run/docker.sock',
      'exec',
      container,
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'companion',
      '-d',
      database,
      '-Atqc',
      query,
    ],
    { env, timeout: 20000 },
  );
}
async function check() {
  await sql(`INSERT INTO public.companion_users(id) VALUES ('${actor}');
    INSERT INTO public.companion_characters(id,name,archetype,bio,published) VALUES ('${character}','Concurrency Fixture','Test','Fixture',true);
    INSERT INTO public.companion_conversations(id,user_id,character_id) VALUES ('${conversation}','${actor}','${character}');`);
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      sql(
        `SELECT public.companion_begin_turn_v1('${actor}','${conversation}','${randomUUID()}','Concurrent test');`,
      ),
    ),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].reason.stderr, /GENERATION_IN_PROGRESS/);
  const state = await sql(
    `SELECT count(*) FROM public.companion_messages WHERE conversation_id='${conversation}';`,
  );
  assert.equal(state.stdout.trim(), '1');
  console.log(
    'PASS: two real concurrent database sessions produce only one pending turn/message.',
  );
  const winner = results.find((result) => result.status === 'fulfilled');
  const claim = JSON.parse(winner.value.stdout.trim());
  const photo1 = randomUUID(),
    photo2 = randomUUID();
  await sql(`SELECT public.companion_set_level_rules_v1('${character}','[{"level":1,"requiredCount":0},{"level":2,"requiredCount":1}]');
    INSERT INTO public.companion_photos(id,character_id,required_level,object_key,review_status,published) VALUES
      ('${photo1}','${character}',1,'${character}/first.png','approved',true),
      ('${photo2}','${character}',2,'${character}/second.png','approved',true);`);
  await Promise.all(
    [1, 2].map(() =>
      sql(
        `SELECT public.companion_open_conversation_v1('${actor}','${character}');`,
      ),
    ),
  );
  const complete = `SELECT public.companion_complete_turn_v1('${actor}','${claim.turnId}','${claim.generationId}','Reply','test','test',1,1);`;
  const completions = await Promise.allSettled([sql(complete), sql(complete)]);
  assert.equal(
    completions.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  assert.match(
    completions.find((result) => result.status === 'rejected').reason.stderr,
    /GENERATION_LEASE_LOST/,
  );
  const earned =
    await sql(`SELECT json_build_object('count',effective_chat_count,'level',level,
    'events',(SELECT count(*) FROM public.companion_chat_count_events WHERE user_id='${actor}'),
    'unlocks',(SELECT count(*) FROM public.companion_photo_unlocks WHERE user_id='${actor}'),
    'cards',(SELECT count(*) FROM public.companion_photo_messages WHERE conversation_id='${conversation}'))
    FROM public.companion_user_character_progress WHERE user_id='${actor}' AND character_id='${character}';`);
  assert.deepEqual(JSON.parse(earned.stdout.trim()), {
    count: 1,
    level: 2,
    events: 1,
    unlocks: 2,
    cards: 2,
  });
  console.log(
    'PASS: concurrent opens/completions count once and issue each earned photo once.',
  );
  const memories = await Promise.all(
    [1, 2].map(() =>
      sql(
        `SELECT public.companion_claim_memory_v1('${actor}','${conversation}',1,24000);`,
      ),
    ),
  );
  assert.equal(
    memories.filter((result) => result.stdout.trim() !== '').length,
    1,
  );
  console.log(
    'PASS: concurrent memory refresh claims acquire only one model lease.',
  );
  const diamond1 = randomUUID(),
    diamond2 = randomUUID(),
    diamond3 = randomUUID();
  const otherCharacter = randomUUID(),
    otherConversation = randomUUID();
  await sql(`INSERT INTO public.companion_characters(id,name,archetype,bio,published) VALUES ('${otherCharacter}','Second wallet fixture','Test','Fixture',true);
    INSERT INTO public.companion_conversations(id,user_id,character_id) VALUES ('${otherConversation}','${actor}','${otherCharacter}');
    INSERT INTO public.companion_photos(id,character_id,kind,object_key,review_status,published,diamond_price) VALUES
      ('${diamond1}','${character}','diamond','${character}/diamond1','approved',true,7),
      ('${diamond2}','${otherCharacter}','diamond','${otherCharacter}/diamond2','approved',true,7),
      ('${diamond3}','${character}','diamond','${character}/diamond3','approved',true,7);
    SELECT public.companion_credit_wallet_v1('${actor}',7,'concurrency-credit');`);
  const spends = await Promise.allSettled([
    sql(
      `SELECT public.companion_unlock_diamond_photo_v1('${actor}','${conversation}','${diamond1}','${randomUUID()}',7);`,
    ),
    sql(
      `SELECT public.companion_unlock_diamond_photo_v1('${actor}','${otherConversation}','${diamond2}','${randomUUID()}',7);`,
    ),
  ]);
  assert.equal(spends.filter((r) => r.status === 'fulfilled').length, 1);
  assert.match(
    spends.find((r) => r.status === 'rejected').reason.stderr,
    /INSUFFICIENT_DIAMONDS/,
  );
  const snapshot = await sql(
    `SELECT public.companion_wallet_snapshot_v1('${actor}');`,
  );
  assert.deepEqual(JSON.parse(snapshot.stdout.trim()), {
    availableDiamonds: 0,
    pendingRecovery: 0,
  });
  console.log(
    'PASS: concurrent spending across two characters cannot overdraw one wallet.',
  );
  await sql(
    `SELECT public.companion_credit_wallet_v1('${actor}',7,'concurrency-second-credit');`,
  );
  const duplicates = await Promise.all(
    [1, 2].map(() =>
      sql(
        `SELECT public.companion_unlock_diamond_photo_v1('${actor}','${conversation}','${diamond3}','${randomUUID()}',7);`,
      ),
    ),
  );
  assert.deepEqual(
    duplicates.map((r) => JSON.parse(r.stdout.trim()).chargedDiamonds).sort(),
    [0, 7],
  );
  const spendCount = await sql(
    `SELECT count(*) FROM public.companion_wallet_transactions WHERE user_id='${actor}' AND kind='spend';`,
  );
  assert.equal(spendCount.stdout.trim(), '2');
  console.log(
    'PASS: concurrent requests with different keys unlock the same photo with one debit.',
  );
}
check().catch(() => {
  console.error('Concurrent SQL assertion failed');
  process.exitCode = 1;
});
