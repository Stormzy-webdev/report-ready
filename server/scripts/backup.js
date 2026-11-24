// Saves a full copy of the database to backups/report-ready-YYYY-MM-DD-HHMM.sql.
// Restore with:  psql "<DATABASE_URL>" -f backups/<file>.sql
// Backups contain learner data: keep them private (the folder is git-ignored).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Run this with: npm run backup');
  process.exit(1);
}

// pg_dump is usually not on PATH on Windows; look in the standard install folder.
function findPgDump() {
  if (process.env.PG_BIN) return join(process.env.PG_BIN, 'pg_dump');
  const base = 'C:\\Program Files\\PostgreSQL';
  if (process.platform === 'win32' && existsSync(base)) {
    const versions = readdirSync(base).filter((v) => existsSync(join(base, v, 'bin', 'pg_dump.exe')));
    versions.sort((a, b) => Number(b) - Number(a));
    if (versions.length) return join(base, versions[0], 'bin', 'pg_dump.exe');
  }
  return 'pg_dump';
}

const dir = new URL('../../backups/', import.meta.url);
mkdirSync(dir, { recursive: true });
// Local time, so the file name matches the clock on the wall.
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const file = join(dir.pathname.replace(/^\/([A-Za-z]:)/, '$1'), `report-ready-${stamp}.sql`);

// --clean/--if-exists make the file restore over an existing database.
const result = spawnSync(findPgDump(), ['--dbname', url, '--file', file, '--clean', '--if-exists', '--no-owner'], {
  stdio: ['ignore', 'inherit', 'inherit'],
});
if (result.error || result.status !== 0) {
  console.error(result.error ? `Could not run pg_dump: ${result.error.message}` : 'pg_dump failed.');
  process.exit(1);
}
console.log(`Backup saved: ${file} (${Math.round(statSync(file).size / 1024)} KB)`);
