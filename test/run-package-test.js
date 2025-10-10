import { pathToFileURL } from 'url';
import { spawn } from 'child_process';

const setupPath = pathToFileURL('./test/mocha.setup.js').href;

spawn('npx', ['mocha', 'test/package', '--import', setupPath, '--exit'], {
  stdio: 'inherit',
});