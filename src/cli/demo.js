import { loadCatalog } from '../content/load.js';
import { validateCatalog } from '../content/validate.js';
import { createGame, availableEvents, choose, enterTrack } from '../core/engine.js';
import { nextScene, printScene, printSummary } from './session.js';
import { canPlanSchoolMonth, completeSchoolMonth, DEFAULT_SCHOOL_PLAN } from '../core/school-life.js';

const catalog = await loadCatalog();
const errors = validateCatalog(catalog);
if (errors.length) throw new Error(errors.join('\n'));
const trackId = process.argv[2] ?? 'employee';
if (!['employee', 'creator', 'owner'].includes(trackId)) {
  console.error('사용법: npm run demo -- employee|creator|owner');
  process.exitCode = 1;
} else {
  let state = createGame(catalog);
  console.log('인생 경로 구조 데모 · 모든 인물·조직·금액·기간은 게임용 예시입니다.');
  for (const id of ['school', trackId]) {
    if (id !== 'school') state = enterTrack(state, id, catalog);
    for (let guard = 0; guard < 250; guard++) {
      state = nextScene(state, catalog);
      const event = availableEvents(state, catalog)[0];
      if (!event) {
        if (canPlanSchoolMonth(state, catalog)) {
          state = completeSchoolMonth(state, DEFAULT_SCHOOL_PLAN, catalog);
          console.log(`\n[${state.time.elapsedMonths}개월] ${state.schoolLife.lastReport.body}`);
          continue;
        }
        break;
      }
      printScene(state, event);
      // 자동 재생은 첫 선택지를 고른다. npm start에서 직접 선택할 수 있다.
      const choice = event.choices[0];
      console.log(`선택: ${choice.label}`);
      state = choose(state, event.id, choice.id, catalog);
      console.log(`결과: ${choice.outcome}`);
    }
  }
  printSummary(state);
}
