import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { loadCatalog } from '../content/load.js';
import { validateCatalog } from '../content/validate.js';
import { createGame, choose, availableEvents, enterTrack, serializeGame, restoreGame } from '../core/engine.js';
import { nextScene, printScene, printSummary } from './session.js';

const catalog = await loadCatalog();
const errors = validateCatalog(catalog);
if (errors.length) throw new Error(errors.join('\n'));
const saveFile = new URL('../../saves/slot-1.json', import.meta.url);
let state = process.argv.includes('--load')
  ? restoreGame(await readFile(saveFile, 'utf8'), catalog) : createGame(catalog);
const input = createInterface({ input: stdin, output: stdout });
const answers = input[Symbol.asyncIterator]();

async function pick(labels) {
  labels.forEach((label, index) => console.log(`  ${index + 1}. ${label}`));
  for (;;) {
    stdout.write('번호 선택 (q: 저장 후 종료): ');
    const line = await answers.next();
    if (line.done) return null;
    const answer = line.value.trim();
    if (answer === 'q') return null;
    const index = Number(answer) - 1;
    if (Number.isInteger(index) && index >= 0 && index < labels.length) return index;
    console.log('목록에 있는 번호를 입력해 주세요.');
  }
}

console.log('인생 경로 · 구조 확인용 짧은 플레이\n인물·조직·금액·기간은 가상 설정이며, 시간 건너뛰기에는 자동 급여·생활비가 없습니다.');
try {
  for (;;) {
    state = nextScene(state, catalog);
    const event = availableEvents(state, catalog)[0];
    if (!event) {
      if (state.activeTrack === 'school' && state.facts.readyForCareer) {
        const tracks = catalog.tracks.filter((track) => track.id !== 'school');
        console.log('\n학교에서 쌓은 경험과 관계를 가지고 어떤 생활을 시작할까요?\n진로 트리는 설계 예시이며, 이 화면에서는 세 경로를 직접 선택합니다.');
        const index = await pick(tracks.map((track) => track.label));
        if (index === null) break;
        state = enterTrack(state, tracks[index].id, catalog);
        continue;
      }
      printSummary(state);
      console.log('이 경로의 준비된 예시 사건을 모두 확인했습니다.');
      break;
    }
    printScene(state, event);
    const index = await pick(event.choices.map((choice) => choice.label));
    if (index === null) break;
    const choice = event.choices[index];
    state = choose(state, event.id, choice.id, catalog);
    console.log(`\n${choice.outcome}`);
  }
} finally {
  input.close();
  await mkdir(new URL('../../saves/', import.meta.url), { recursive: true });
  await writeFile(saveFile, serializeGame(state));
  console.log('진행을 saves/slot-1.json에 저장했습니다. npm start -- --load 로 이어할 수 있습니다.');
}
