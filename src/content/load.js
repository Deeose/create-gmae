import { readFile } from 'node:fs/promises';

// 파일 읽기는 Node 어댑터에만 둔다. core는 브라우저 화면에서도 그대로 사용할 수 있다.
export async function loadCatalog() {
  const names = ['tracks', 'events', 'people', 'organizations', 'career-tree'];
  const contents = await Promise.all(names.map(async (name) => {
    const file = new URL(`../../data/${name}.json`, import.meta.url);
    return [name === 'career-tree' ? 'careerTree' : name, JSON.parse(await readFile(file, 'utf8'))];
  }));
  return Object.fromEntries(contents);
}
