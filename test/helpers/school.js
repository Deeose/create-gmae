import { createGame, choose, availableEvents } from '../../src/core/engine.js';
import { canPlanSchoolMonth, completeSchoolMonth, DEFAULT_SCHOOL_PLAN } from '../../src/core/school-life.js';

// 대표적인 학업·관계·진학 경로를 실제 월별 루틴으로 진행한다.
export function graduate(catalog, { interest = 'science', project = 'help-friend', education = 'university', seed = 42,
  plan = DEFAULT_SCHOOL_PLAN, inspect = () => {} } = {}) {
  let state = createGame(catalog, { seed });
  const preferred = { 'school-interest': interest, 'school-project': project, 'school-next-step': education };
  for (let guard = 0; guard < 250; guard++) {
    inspect(state);
    if (state.facts.readyForCareer) return state;
    const event = availableEvents(state, catalog)[0];
    if (event) {
      const choice = event.choices.find((item) => item.id === preferred[event.id]) ?? event.choices[0];
      state = choose(state, event.id, choice.id, catalog);
    } else if (canPlanSchoolMonth(state, catalog)) {
      state = completeSchoolMonth(state, plan, catalog);
    } else {
      throw new Error(`학생 시절의 진행이 막혔습니다: ${state.progress.school.elapsedMonths}`);
    }
  }
  throw new Error('졸업까지의 진행 한도를 넘었습니다.');
}
