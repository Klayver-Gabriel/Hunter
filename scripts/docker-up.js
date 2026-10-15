import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = args => new Promise((resolve, reject) => {
  const child = spawn('docker', args, { cwd: root, stdio: 'inherit' });
  child.on('error', () => reject(Error('Docker indisponível. Verifique a instalação e o acesso ao daemon.')));
  child.on('exit', code => code === 0 ? resolve() : reject(Error(`Comando Docker encerrado com código ${code}.`)));
});
try {
  await run(['compose', 'config', '--quiet']);
  await run(['build', '--tag', process.env.HUNTER_IMAGE || 'hunters-codex:local', '.']);
  await run(['compose', 'up', '-d', '--no-build', ...process.argv.slice(2)]);
} catch (error) { console.error(error.message); process.exitCode = 1; }
