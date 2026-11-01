const fs = require('node:fs');
const path = require('node:path');
function configureLocal(projectDir, key) {
  if (!key || /[\r\n]/.test(key))
    throw new Error('请输入非空的单行服务端 API Key。');
  const envFile = path.join(projectDir, '.env');
  if (fs.existsSync(envFile)) throw new Error('已有 .env，已保留。');
  fs.writeFileSync(
    envFile,
    [
      '# Local server config. Never commit.',
      'NODE_ENV=development',
      'PORT=3000',
      'SUPABASE_URL=https://dxpiqttvtxjhmlvxstbb.supabase.co',
      `SUPABASE_SECRET_KEY=${JSON.stringify(key)}`,
      '',
    ].join('\n'),
    { flag: 'wx', mode: 0o600 },
  );
  const mobile = path.join(projectDir, 'apps/mobile/.env');
  if (!fs.existsSync(mobile))
    fs.writeFileSync(mobile, 'EXPO_PUBLIC_API_URL=http://localhost:3000\n', {
      flag: 'wx',
      mode: 0o600,
    });
}
if (require.main === module) {
  try {
    configureLocal(
      path.resolve(__dirname, '..'),
      fs.readFileSync(3, 'utf8').replace(/\n$/, ''),
    );
    console.log('已创建本地 SDK 配置；未输出 API Key。');
  } catch {
    console.error(
      '配置失败，请检查目录权限、Key 是否为空，以及是否已有 .env；现有文件不会覆盖。',
    );
    process.exitCode = 1;
  }
}
module.exports = { configureLocal };
