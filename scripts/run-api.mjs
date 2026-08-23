import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const candidates = process.platform === 'win32'
  ? ['.venv/Scripts/python.exe', 'python']
  : ['.venv/bin/python', 'python3'];

const python = candidates.find((candidate) =>
  candidate.includes('/') ? existsSync(candidate) : true,
);

const result = spawnSync(
  python,
  ['-m', 'uvicorn', 'api.index:app', '--port', '8000'],
  { stdio: 'inherit' },
);

if (result.error) {
  console.error(`无法启动 Python 后端：${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
