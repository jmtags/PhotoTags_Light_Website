// Run locally with a private output directory outside the repository.
const { generateKeyPairSync } = require('node:crypto');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const output = process.argv[2];
if (!output) throw new Error('Usage: node scripts/light-signing-key.cjs <private-directory-outside-repository>');
const dir = path.resolve(output), repo = path.resolve(__dirname, '..');
if (dir === repo || dir.startsWith(repo + path.sep)) throw new Error('Choose a private directory outside the repository.');
mkdirSync(dir, { recursive: true });
const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
writeFileSync(path.join(dir,'light-private.pem'), keys.privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 });
const publicKey = keys.publicKey.export({ format: 'jwk' });
writeFileSync(path.join(dir,'light-public.json'), JSON.stringify(publicKey), { flag: 'wx' });
console.log('Created light-private.pem (server only) and light-public.json (booth verification key). No keys were printed.');
