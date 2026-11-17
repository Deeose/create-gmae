import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { loadCatalog } from '../content/load.js';
import { validateCatalog } from '../content/validate.js';
import { createGame, choose, availableEvents, enterTrack, serializeGame, restoreGame } from '../core/engine.js';
import { nextScene, printScene, printSummary } from './session.js';
import { canPlanSchoolMonth, completeSchoolMonth, DEFAULT_SCHOOL_PLAN, schoolTerm } from '../core/school-life.js';

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
      if (canPlanSchoolMonth(state, catalog)) {
        const presets = [
          { label: '균형 잡힌 한 달 — 공부·동아리·운동·친구·휴식', plan: DEFAULT_SCHOOL_PLAN },
          { label: '공부에 집중 — 수학·언어·과학과 휴식', plan: ['math', 'math', 'language', 'science', 'science', 'exercise', 'rest'] },
          { label: '친구와 창작 — 동아리와 만남', plan: ['art', 'club', 'friends', 'club', 'math', 'exercise', 'rest'] },
          { label: '회복하는 한 달 — 운동과 충분한 휴식', plan: ['rest', 'exercise', 'rest', 'friends', 'rest', 'art', 'rest'] },
        ];
        const term = schoolTerm(state);
        console.log(`\n${term.label} · ${term.monthLabel}\n정규 수업 이외의 월~일 대표 활동을 정하고 한 달을 보냅니다.`);
        const index = await pick(presets.map((preset) => preset.label));
        if (index === null) break;
        state = completeSchoolMonth(state, presets[index].plan, catalog);
        console.log(`\n${state.schoolLife.lastReport.body}`);
        continue;
      }
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
  console.log('진행을 saves/slot-1.json에 저장했습니다. npm run cli -- --load 로 이어할 수 있습니다.');
}
