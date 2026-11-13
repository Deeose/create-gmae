import { cp, mkdir, readFile, rm } from 'node:fs/promises';
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
  console.log(`웹 빌드 완료: ${fileURLToPath(dist)}`);
  return fileURLToPath(dist);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildWeb();
}
