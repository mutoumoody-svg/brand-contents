#!/usr/bin/env bash
set -euo pipefail
cd /var/www/brand-contents
backup="/var/www/brand-contents-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -m 700 "$backup"
for file in .env brand.env; do
  if [ -f "$file" ]; then cp -p "$file" "$backup/"; fi
done
if [ -f data/users.db ]; then
  node - "$backup/users.db" <<'NODE'
const Database = require('better-sqlite3');
const db = new Database('data/users.db');
db.backup(process.argv[2]).then(() => db.close()).catch(err => { console.error(err.message); process.exitCode = 1; });
NODE
fi
git fetch origin
git merge --ff-only origin/main
npm ci
npm run check
npm test
NODE_ENV=production LOCAL_PREVIEW_AUTH_BYPASS=0 pm2 restart brand-contents --update-env
curl --fail http://127.0.0.1:3000/api/health
node scripts/verify-ai.js
printf '\nBackup: %s\n' "$backup"
