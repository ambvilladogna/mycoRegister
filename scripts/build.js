// Build: bundle server + client with esbuild into dist/.
//   dist/server/server.js        server bundle ('../public' resolves to dist/public)
//   dist/public/js/*.js          client bundles (ESM, code-split)
//   dist/public/<everything else> copied as-is from public/ (html, css, img, assets, manifest, sw.js)
// sw.js gets its precache list regenerated from what is actually in dist/public
// and its version stamped; footer.js gets the version via esbuild `define`.
const esbuild = require('esbuild');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const publicSrc = path.join(root, 'public');
const publicDist = path.join(dist, 'public');

// Version string shown in the footer and used as the service worker cache name.
function getVersion() {
  try {
    return execSync('git describe --tags --always', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown-version';
  }
}
const VERSION = getVersion();

// Minify with `--minify` (or NODE_ENV=production).
// Secrets/config injected into the client bundle (visible in the browser, but not in the repo).
const THUNDERFOREST_API_KEY = process.env.THUNDERFOREST_API_KEY;
if (!THUNDERFOREST_API_KEY) {
  console.error('THUNDERFOREST_API_KEY is missing: add it to .env (or the environment) and rebuild.');
  process.exit(1);
}

const MINIFY = process.argv.includes('--minify') || process.env.NODE_ENV === 'production';

// The client uses root-relative dynamic imports (await import('/js/...')).
// esbuild would treat them as filesystem paths, so map them onto public/.
// const rootRelativeImports = {
//   name: 'root-relative-imports',
//   setup(build) {
//     build.onResolve({ filter: /^\/js\// }, (args) => ({
//       path: path.join(publicSrc, args.path),
//     }));
//   },
// };

async function buildServer() {
  await esbuild.build({
    entryPoints: [path.join(root, 'server/server.js')],
    outfile: path.join(dist, 'server/server.js'),
    bundle: true,
    platform: 'node',
    target: 'node18',
    packages: 'external', // node_modules stay external (npm ci --omit=dev on the VPS)
    sourcemap: true,
    logLevel: 'info',
  });
}

async function buildClient() {
  await esbuild.build({
    entryPoints: [
      path.join(publicSrc, 'js/app.js'),
      path.join(publicSrc, 'js/services/pwa-registration.js'),
    ],
    outdir: path.join(publicDist, 'js'),
    outbase: path.join(publicSrc, 'js'), // keeps js/app.js and js/services/pwa-registration.js where index.html expects them
    entryNames: '[dir]/[name]',
    chunkNames: 'chunks/[name]-[hash]',
    bundle: true,
    splitting: true, // needed to keep the dynamic import()s as lazy chunks
    format: 'esm',
    platform: 'browser',
    target: ['es2020'],
    sourcemap: true,
    minify: MINIFY,
    define: {
      __APP_VERSION__: JSON.stringify(VERSION), // footer.js
      __THUNDERFOREST_API_KEY__: JSON.stringify(THUNDERFOREST_API_KEY), // listSpeciesModal.js
      global: 'globalThis', // PouchDB's deps reference Node's `global`
    },
    // plugins: [rootRelativeImports],
    logLevel: 'info',
  });
}

async function buildCss() {
  // public/css/app.css only @imports the three stylesheets, in cascade order.
  await esbuild.build({
    entryPoints: [path.join(publicSrc, 'css/app.css')],
    outdir: path.join(publicDist, 'css'),
    bundle: true,
    minify: MINIFY,
    sourcemap: true,
    target: ['chrome90', 'safari14', 'firefox88'],
    logLevel: 'info',
  });
}

// Leaflet's stylesheet and images come from node_modules (same version as the JS).
// They are copied as-is, not bundled: Leaflet finds its marker icon path from the
// url() in this CSS, so the image file names must not change.
function copyLeafletAssets() {
  const dist_ = path.join(root, 'node_modules/leaflet/dist');
  const assets = path.join(publicDist, 'assets');
  fs.mkdirSync(path.join(assets, 'images'), { recursive: true });
  fs.copyFileSync(path.join(dist_, 'leaflet.css'), path.join(assets, 'leaflet.css'));
  fs.cpSync(path.join(dist_, 'images'), path.join(assets, 'images'), { recursive: true });
  console.log('Copied leaflet.css + images from node_modules/leaflet');
}

function copyStatic() {
  // everything except public/js and public/css, which esbuild produces
  fs.cpSync(publicSrc, publicDist, {
    recursive: true,
    filter: (src) => src !== path.join(publicSrc, 'js') && src !== path.join(publicSrc, 'css'),
  });
  console.log('Copied static files public/ -> dist/public (js, css excluded)');
}

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(p) : [p];
  });
}

// Replace ASSETS_TO_CACHE in the copied sw.js with the real file list.
function injectPrecacheList() {
  const swPath = path.join(publicDist, 'sw.js');
  const urls = listFiles(publicDist)
    .map((f) => '/' + path.relative(publicDist, f).split(path.sep).join('/'))
    .filter((u) => u !== '/sw.js' && !u.endsWith('.map'))
    .sort();
  urls.unshift('/');

  const list = 'const ASSETS_TO_CACHE = [\n' + urls.map((u) => `  '${u}',`).join('\n') + '\n];';
  const sw = fs.readFileSync(swPath, 'utf8');
  const re = /const\s+ASSETS_TO_CACHE\s*=\s*\[[\s\S]*?\];/;
  if (!re.test(sw)) throw new Error('ASSETS_TO_CACHE not found in sw.js');
  fs.writeFileSync(swPath, sw.replace(re, () => list), 'utf8');
  console.log(`sw.js: precache list regenerated (${urls.length} entries)`);
}

// Replace the __APP_VERSION__ placeholder in the copied sw.js.
function injectSwVersion() {
  const swPath = path.join(publicDist, 'sw.js');
  const sw = fs.readFileSync(swPath, 'utf8');
  if (!sw.includes('__APP_VERSION__')) throw new Error('__APP_VERSION__ not found in sw.js');
  fs.writeFileSync(swPath, sw.split('__APP_VERSION__').join(VERSION), 'utf8');
  console.log(`sw.js: version set to ${VERSION}`);
}

async function build() {
  fs.rmSync(dist, { recursive: true, force: true });
  await buildServer();
  copyStatic();
  copyLeafletAssets();
  await buildCss();
  await buildClient();
  injectPrecacheList(); // needs the final file tree
  injectSwVersion();
}

build().catch(() => process.exit(1));