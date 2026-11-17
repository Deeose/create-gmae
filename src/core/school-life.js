import { advanceMonths, availableEvents, meetPerson, SKILL_KEYS, STAT_KEYS } from './engine.js';

// 정규 수업을 제외한 월~일 대표 활동. 한 번의 실행은 이 주간 루틴을 반복한 한 달이다.
export const STUDENT_ACTIVITIES = [
  { id: 'math', label: '수학 공부', description: '차근차근 문제를 풀며 수학 실력을 쌓아요.' },
  { id: 'language', label: '국어·독서', description: '글을 읽고 생각을 정리하며 언어 실력을 키워요.' },
  { id: 'science', label: '과학 탐구', description: '궁금한 주제를 찾아보고 실험과 원리를 배워요.' },
  { id: 'art', label: '그림·창작', description: '좋아하는 표현으로 작은 작품을 만들어요.' },
  { id: 'club', label: '동아리 활동', description: '함께 만드는 경험과 새로운 인연을 쌓아요.' },
  { id: 'exercise', label: '운동하기', description: '몸을 움직이며 건강과 기분을 돌봐요.' },
  { id: 'friends', label: '친구 만나기', description: '대화를 나누고 함께 시간을 보내며 가까워져요.' },
  { id: 'rest', label: '충분히 쉬기', description: '나를 위한 여유로 피로와 스트레스를 풀어요.' },
];

export const DEFAULT_SCHOOL_PLAN = ['math', 'language', 'science', 'club', 'exercise', 'friends', 'rest'];
const activityIds = new Set(STUDENT_ACTIVITIES.map((activity) => activity.id));
const studyIds = ['math', 'language', 'science'];
const skillNames = { math: '수학', language: '언어', science: '과학', art: '창작', communication: '소통' };
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));

function checkPlan(plan) {
  if (!Array.isArray(plan) || plan.length !== 7 || plan.some((id) => !activityIds.has(id))) {
    throw new Error('월요일부터 일요일까지 7개의 올바른 활동을 골라 주세요.');
  }
}

function countActivities(plan) {
  return Object.fromEntries(STUDENT_ACTIVITIES.map(({ id }) => [id, plan.filter((activity) => activity === id).length]));
}

export function canPlanSchoolMonth(state, catalog) {
  return state?.activeTrack === 'school' && !state.facts.readyForCareer
    && availableEvents(state, catalog).length === 0;
}

export function schoolTerm(state) {
  const month = state.progress.school?.elapsedMonths ?? 0;
  const education = state.facts.education;
  if (state.facts.readyForCareer) return { label: '학생 시절을 마치고', monthLabel: '새로운 일상으로' };
  let label;
  let withinYear;
  if (month < 12) { label = '중학교 3학년'; withinYear = month; }
  else if (month < 48) { label = `고등학교 ${Math.floor((month - 12) / 12) + 1}학년`; withinYear = (month - 12) % 12; }
  else if (education === 'university') { label = `대학교 ${Math.min(4, Math.floor((month - 48) / 12) + 1)}학년`; withinYear = (month - 48) % 12; }
  else if (education === 'training') { label = '실무 훈련 과정'; withinYear = (month - 48) % 12; }
  else { label = '고등학교 졸업'; withinYear = 0; }
  return { label, monthLabel: `${Math.floor(withinYear / 6) + 1}학기 · ${withinYear % 6 + 1}개월차` };
}

// 이 함수는 RNG·관계·시간을 바꾸지 않는다. 실제 반영할 범위 제한까지 적용한 예상 변화다.
export function schoolPlanEffects(state, plan) {
  checkPlan(plan);
  const counts = countActivities(plan);
  const study = studyIds.reduce((sum, id) => sum + counts[id], 0);
  const overload = Math.max(0, study - 4);
  const warnings = [];
  const rawSkills = {
    math: counts.math,
    language: counts.language,
    science: counts.science,
    art: counts.art + counts.club / 2,
    communication: counts.friends + counts.club / 2,
    business: 0,
  };
  const skills = Object.fromEntries(SKILL_KEYS.map((key) => {
    const sessions = rawSkills[key];
    let gain = sessions > 0 ? Math.min(3, Math.ceil(sessions / 2)) : 0;
    if (state.player.skills[key] >= 80) gain = Math.min(gain, 1);
    else if (state.player.skills[key] >= 60) gain = Math.min(gain, 2);
    if (state.player.stats.health < 30 || state.player.stats.workStress > 75) gain = Math.floor(gain / 2);
    return [key, clamp(state.player.skills[key] + gain) - state.player.skills[key]];
  }));
  const rawStats = {
    health: -2 + counts.exercise * 3 + counts.rest * 3 - overload * 2,
    happiness: -1 - study + counts.art + counts.club + counts.exercise + counts.friends * 3 + counts.rest * 2 - overload,
    workStress: 3 + study + overload * 2 - counts.exercise * 2 - counts.friends - counts.rest * 4,
    socialStress: 1 - counts.club - counts.friends * 2 - counts.rest,
  };
  const stats = Object.fromEntries(STAT_KEYS.map((key) => [key,
    clamp(state.player.stats[key] + rawStats[key]) - state.player.stats[key]]));
  if (study >= 5) warnings.push('공부에 일정이 몰려 있어요. 피로와 스트레스가 쌓일 수 있어요.');
  if (!counts.rest && !counts.exercise) warnings.push('쉬거나 몸을 돌보는 시간을 조금 남겨두면 좋아요.');
  if (!counts.friends && !counts.club) warnings.push('사람들과 만나는 활동이 없어 이번 달에는 새로운 인연을 쌓기 어려워요.');
  if (state.player.stats.health < 30 || state.player.stats.workStress > 75) warnings.push('지금은 피로가 커서 배움의 효율이 낮아요. 회복할 시간을 가져보세요.');
  return { skills, stats, warnings };
}

function monthsWith(history, predicate) {
  return history.filter((entry) => entry.type === 'schedule' && predicate(countActivities(entry.plan))).length;
}

export function completeSchoolMonth(state, plan, catalog) {
  checkPlan(plan);
  if (!canPlanSchoolMonth(state, catalog)) throw new Error('먼저 현재의 이야기를 마친 뒤 일정을 정해 주세요.');
  const effects = schoolPlanEffects(state, plan);
  const counts = countActivities(plan);
  const study = studyIds.reduce((sum, id) => sum + counts[id], 0);
  let next = advanceMonths(state, 1);
  const newlyMet = [];
  const meet = (personId, relationshipGain) => {
    if (!next.people[personId]) newlyMet.push(personId);
    next = meetPerson(next, personId, catalog);
    next.people[personId].relationship = clamp(next.people[personId].relationship + relationshipGain, -100);
  };
  for (const [key, delta] of Object.entries(effects.skills)) next.player.skills[key] += delta;
  for (const [key, delta] of Object.entries(effects.stats)) next.player.stats[key] += delta;

  if (counts.friends) meet('school-friend', Math.min(4, counts.friends * 2));
  if (study >= 2 && monthsWith(state.history, (past) => studyIds.reduce((sum, id) => sum + past[id], 0) >= 2) + 1 >= 2) {
    meet('student-study-buddy', 2);
  }
  if (counts.club && monthsWith(state.history, (past) => past.club > 0) + 1 >= 2) {
    meet('student-club-friend', Math.min(4, counts.club * 2));
  }
  if (counts.friends && monthsWith(state.history, (past) => past.friends > 0) + 1 >= 3) {
    meet('student-neighbor', Math.min(4, counts.friends));
  }

  const grown = Object.entries(effects.skills).filter(([, delta]) => delta > 0).map(([key]) => skillNames[key]);
  const sentences = [];
  if (study >= 5) sentences.push('방과 후 시간을 공부에 많이 썼다. 해야 할 일을 해냈지만 마음과 몸에는 피로가 남았다.');
  else if (counts.art + counts.club >= 3) sentences.push('좋아하는 창작과 동아리 활동을 하며 나를 표현하는 시간을 보냈다.');
  else if (counts.friends >= 3) sentences.push('친구들과 이야기를 나누고 함께 보내는 시간이 많았던 한 달이었다.');
  else if (counts.rest + counts.exercise >= 4) sentences.push('충분히 쉬고 몸을 움직이며 나를 돌보는 한 달을 보냈다.');
  else sentences.push('정규 수업이 끝난 뒤, 공부와 좋아하는 활동 사이에서 나만의 리듬을 만들어갔다.');
  if (grown.length) sentences.push(`${grown.join('·')}에 조금씩 자신감이 생겼다.`);
  if (newlyMet.length) sentences.push(`${newlyMet.map((id) => next.people[id].name).join(', ')}와 새로운 인연이 시작되었다.`);
  else if (counts.friends || counts.club) sentences.push('익숙한 사람들과 함께 보낸 시간이 관계에 남았다.');
  if (effects.warnings.length && study < 5) sentences.push(effects.warnings[0]);
  const report = { atMonth: next.time.elapsedMonths, title: `${schoolTerm(state).label}, 한 달의 기록`, body: sentences.join(' ') };
  next.schoolLife.lastPlan = [...plan];
  next.schoolLife.monthsCompleted += 1;
  next.schoolLife.lastReport = report;
  next.history.push({ type: 'schedule', trackId: 'school', atMonth: state.time.elapsedMonths,
    startedAtMonth: state.time.elapsedMonths, finishedAtMonth: next.time.elapsedMonths, plan: [...plan], outcome: report.body });
  next.memories.push({ atMonth: next.time.elapsedMonths, text: report.body, tags: ['school', 'schedule'] });
  return next;
}
