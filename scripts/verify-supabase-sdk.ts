import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const projectUrl = 'https://dxpiqttvtxjhmlvxstbb.supabase.co';
const table = 'companion_sdk_probe_runs';
const rpc = 'companion_sdk_probe_adjust_v1';

class ProbeFailure extends Error {
  constructor(public readonly safeCode: string) {
    super(safeCode);
  }
}

function requireResult(condition: unknown, code: string): asserts condition {
  if (!condition) throw new ProbeFailure(code);
}

function checkError(error: { code?: string } | null) {
  if (error) {
    const code =
      error.code && /^[A-Z0-9_]+$/.test(error.code)
        ? error.code
        : 'REQUEST_FAILED';
    throw new ProbeFailure(code);
  }
}

async function verify() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    console.error(
      'BLOCKED: 缺少 SUPABASE_SECRET_KEY。请在安全环境设置中配置，不要发到聊天。',
    );
    process.exitCode = 2;
    return;
  }
  const timedFetch: typeof fetch = (input, init) =>
    fetch(input, {
      ...init,
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
    });
  const client = createClient(projectUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: timedFetch },
  });
  const id = randomUUID();
  let inserted = false;
  try {
    const insert = await client
      .from(table)
      .insert({ id, value: 0 })
      .select('id,value')
      .single();
    checkError(insert.error);
    // Track successful insertion before assertions so its row is cleaned even on a contract failure.
    inserted = true;
    requireResult(
      insert.data?.id === id && insert.data?.value === 0,
      'INSERT_CONTRACT_FAILED',
    );
    const read = await client.from(table).select('value').eq('id', id).single();
    checkError(read.error);
    requireResult(read.data?.value === 0, 'READ_FAILED');
    console.log('PASS: SDK HTTPS 写入和读取真实数据库。');

    const duplicate = await client.from(table).insert({ id, value: 0 });
    requireResult(
      duplicate.error?.code === '23505',
      'UNIQUE_CONSTRAINT_FAILED',
    );
    console.log('PASS: 数据库拒绝重复主键。');

    const commit = await client.rpc(rpc, {
      p_id: id,
      p_delta: 1,
      p_fail: false,
    });
    checkError(commit.error);
    requireResult(commit.data === 1, 'RPC_COMMIT_FAILED');
    const rollback = await client.rpc(rpc, {
      p_id: id,
      p_delta: 10,
      p_fail: true,
    });
    requireResult(
      rollback.error?.code === 'P0001',
      'EXPECTED_ROLLBACK_MISSING',
    );
    const afterRollback = await client
      .from(table)
      .select('value')
      .eq('id', id)
      .single();
    checkError(afterRollback.error);
    requireResult(
      afterRollback.data?.value === 1,
      'ROLLBACK_DID_NOT_PRESERVE_DATA',
    );
    const eventsAfterRollback = await client
      .from('companion_sdk_probe_events')
      .select('delta')
      .eq('run_id', id);
    checkError(eventsAfterRollback.error);
    requireResult(
      eventsAfterRollback.data?.length === 1 &&
        eventsAfterRollback.data[0]?.delta === 1,
      'LEDGER_ROLLBACK_FAILED',
    );
    console.log('PASS: RPC 两表一起提交，故意失败后计数与流水一起回滚。');

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        client.rpc(rpc, {
          p_id: id,
          p_delta: 1,
          p_fail: false,
        }),
      ),
    );
    for (const result of results) checkError(result.error);
    const afterConcurrent = await client
      .from(table)
      .select('value')
      .eq('id', id)
      .single();
    checkError(afterConcurrent.error);
    requireResult(afterConcurrent.data?.value === 9, 'CONCURRENT_UPDATE_LOST');
    const eventsAfterConcurrent = await client
      .from('companion_sdk_probe_events')
      .select('delta')
      .eq('run_id', id);
    checkError(eventsAfterConcurrent.error);
    requireResult(
      eventsAfterConcurrent.data?.length === 9 &&
        eventsAfterConcurrent.data.every((event) => event.delta === 1),
      'CONCURRENT_LEDGER_INCONSISTENT',
    );
    console.log('PASS: 八次并发递增没有丢失更新，流水与计数一致。');
  } finally {
    if (inserted) {
      const cleanup = await client.from(table).delete().eq('id', id);
      checkError(cleanup.error);
      const remaining = await client.from(table).select('id').eq('id', id);
      checkError(remaining.error);
      requireResult(remaining.data?.length === 0, 'CLEANUP_FAILED');
      const remainingEvents = await client
        .from('companion_sdk_probe_events')
        .select('id')
        .eq('run_id', id);
      checkError(remainingEvents.error);
      requireResult(
        remainingEvents.data?.length === 0,
        'LEDGER_CLEANUP_FAILED',
      );
      console.log('PASS: 本次测试行和流水已清理。');
    }
  }
  console.log('SUCCESS: 当前云环境到真实 Supabase 的 SDK 读写与事务验证通过。');
  console.log(
    '范围仅限服务端测试路径；没有验证普通用户权限、完整支付或全部生产场景。',
  );
}

verify().catch((error: unknown) => {
  console.error(
    'FAILED:',
    error instanceof ProbeFailure
      ? error.safeCode
      : 'TRANSPORT_OR_CONFIGURATION_ERROR',
  );
  console.error(
    '未输出密钥或服务器原始错误；若缺少表/函数，请先执行实验 prepare.sql。',
  );
  process.exitCode = 1;
});
