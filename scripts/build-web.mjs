import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../src/content/load.js';
import { validateCatalog } from '../src/content/validate.js';

// 빌드 도구 없이 정적 배포 파일만 모은다. 원본 데이터·엔진을 복제해 따로 수정하지 않는다.
export async function buildWeb() {
  const catalog = await loadCatalog();
  const errors = validateCatalog(catalog);
  if (errors.length) throw new Error(errors.join('\n'));
  const root = new URL('../', import.meta.url);
  const dist = new URL('dist/', root);
  await readFile(new URL('web/index.html', root));
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  await cp(new URL('web/', root), dist, { recursive: true });
  await cp(new URL('src/core/', root), new URL('core/', dist), { recursive: true });
  await cp(new URL('data/', root), new URL('data/', dist), { recursive: true });
  // 정적 호스팅에서 이전 화면 코드와 새 저장 형식이 섞이지 않게 버전을 함께 붙인다.
  async function files(directory, prefix = '') {
    const result = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) result.push(...await files(new URL(`${entry.name}/`, directory), `${name}/`));
      else result.push(name);
    }
    return result.sort();
  }
  const outputs = await files(dist);
  const hash = createHash('sha256');
  for (const name of outputs) hash.update(name).update(await readFile(new URL(name, dist)));
  const version = hash.digest('hex').slice(0, 12);
  for (const name of outputs.filter((name) => name.endsWith('.js'))) {
    const file = new URL(name, dist);
    const source = await readFile(file, 'utf8');
    const versioned = source.replace(/(from\s*|import\s*)(['"])(\.{1,2}\/[^'"?]+\.js)\2/g,
      (_, prefix, quote, path) => `${prefix}${quote}${path}?v=${version}${quote}`);
    await writeFile(file, versioned);
  }
  const html = new URL('index.html', dist);
  await writeFile(html, (await readFile(html, 'utf8'))
    .replace('href="./styles.css"', `href="./styles.css?v=${version}"`)
    .replace('src="./app.js"', `src="./app.js?v=${version}"`));
  await writeFile(new URL('build-info.json', dist), JSON.stringify({ version }) + '\n');
  console.log(`웹 빌드 완료: ${fileURLToPath(dist)}`);
  return fileURLToPath(dist);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildWeb();
}
