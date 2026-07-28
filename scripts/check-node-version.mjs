const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
const required = 22;

if (major < required) {
  console.error('');
  console.error(`platform-ui requires Node.js >= ${required}. You are running ${process.version}.`);
  console.error('');
  console.error('Angular 22 requires Node.js 22.22.3+, 24.15.0+, or 26+.');
  console.error('');
  console.error('Fix:');
  console.error('  nvm install 22');
  console.error('  nvm use 22');
  console.error('  node -v');
  console.error('  npm start');
  console.error('');
  console.error('Use npm start (local CLI), not a global ng binary on an unsupported Node.');
  console.error('');
  process.exit(1);
}
