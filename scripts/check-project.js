const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const requiredFiles = [
  'package.json',
  'server.js',
  '.env.example',
  'README.md',
  'START_HERE.md',
  'index.html',
  'xhs-writing.html',
  'brand.html',
  'fangxie.html',
  'baowenku.html',
  'xhs-insights.html',
  'xiaohongshu-poster.html',
  'login.html',
  'register.html',
  'admin.html',
  'scripts/xhs_scrape.py',
];

const requiredPackages = [
  'express',
  'bcryptjs',
  'dotenv',
  'better-sqlite3',
  'jsonwebtoken',
  'multer',
  'pdf-parse',
  'mammoth',
  'jszip',
];

function exists(relPath) {
  return fs.existsSync(path.join(root, relPath));
}

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function walkHtml(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full, out);
    if (entry.isFile() && entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const failures = [];
const warnings = [];

for (const file of requiredFiles) {
  if (!exists(file)) failures.push(`缺少文件：${file}`);
}

let packageJson;
try {
  packageJson = JSON.parse(read('package.json'));
} catch (err) {
  failures.push(`package.json 无法解析：${err.message}`);
}

if (packageJson) {
  for (const dep of requiredPackages) {
    if (!packageJson.dependencies || !packageJson.dependencies[dep]) {
      failures.push(`package.json 缺少依赖：${dep}`);
    }
  }
}

if (!exists('node_modules')) {
  warnings.push('尚未安装 node_modules，请运行 npm.cmd install。');
}

if (!exists('.env')) {
  warnings.push('尚未创建 .env；本地启动可先复制 .env.example，再填写真实密钥。');
}

if (exists('.git') && !exists('.git/HEAD')) {
  warnings.push('.git 目录存在但不是完整 Git 仓库；需要版本管理时请重新 git init。');
}

for (const htmlFile of walkHtml(root)) {
  const html = fs.readFileSync(htmlFile, 'utf8');
  const rel = path.relative(root, htmlFile).replace(/\\/g, '/');
  if (html.includes('anthorpic-proxy.mutoumoody.workers.dev')) {
    failures.push(`${rel} 仍直接暴露 Claude Worker 地址。`);
  }
  if (html.includes('x-worker-secret')) {
    failures.push(`${rel} 仍暴露 Claude Worker secret 请求头。`);
  }
}

if (exists('server.js') && !read('server.js').includes("app.get('/api/health'")) {
  failures.push('server.js 缺少 /api/health 健康检查接口。');
}

console.log('Brand Contents 项目检查');
console.log(`根目录：${root}`);

if (warnings.length) {
  console.log('\n提醒：');
  for (const item of warnings) console.log(`- ${item}`);
}

if (failures.length) {
  console.log('\n问题：');
  for (const item of failures) console.log(`- ${item}`);
  process.exitCode = 1;
} else {
  console.log('\n检查通过：项目文件、依赖声明和 Claude 前端调用收口均正常。');
}
