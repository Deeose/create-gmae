import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, choose, advanceMonths, availableEvents, restoreGame, serializeGame } from '../src/core/engine.js';
import { nextScene } from '../src/core/session.js';
import { STUDENT_ACTIVITIES, DEFAULT_SCHOOL_PLAN, canPlanSchoolMonth, schoolTerm,
  schoolPlanEffects, completeSchoolMonth } from '../src/core/school-life.js';
import { loadCatalog } from '../src/content/load.js';
import { graduate } from './helpers/school.js';

const catalog = await loadCatalog();
const firstMonth = () => choose(createGame(catalog), 'school-interest', 'science', catalog);

function resolveStories(state) {
  for (let guard = 0; guard < 25; guard++) {
    const event = availableEvents(state, catalog)[0];
    if (!event) return state;
    state = choose(state, event.id, event.choices[0].id, catalog);
  }
  throw new Error('사건 연결이 끝나지 않습니다.');
}

test('학교의 조용한 기간은 자동으로 건너뛰지 않고 일정을 확정해야 한 달 진행한다', () => {
  const initial = createGame(catalog);
  assert.equal(canPlanSchoolMonth(initial, catalog), false);
  assert.throws(() => completeSchoolMonth(initial, DEFAULT_SCHOOL_PLAN, catalog));
  const state = firstMonth();
  assert.equal(canPlanSchoolMonth(state, catalog), true);
  assert.equal(nextScene(state, catalog).time.elapsedMonths, 0);
  const before = structuredClone(state);
  const next = completeSchoolMonth(state, DEFAULT_SCHOOL_PLAN, catalog);
  assert.deepEqual(state, before);
  assert.equal(next.time.elapsedMonths, 1);
  assert.equal(next.time.ageMonths - state.time.ageMonths, 1);
  assert.equal(next.schoolLife.monthsCompleted, 1);
  assert.deepEqual(next.schoolLife.lastPlan, DEFAULT_SCHOOL_PLAN);
  assert.equal(next.history.at(-1).type, 'schedule');
  assert.equal(next.schoolLife.lastReport.atMonth, 1);
  assert.ok(next.schoolLife.lastReport.body.length > 0);
  assert.match(schoolTerm(next).label, /중학교|중3/);
});

test('요일별 예상 능력·감정 변화와 실제 월말 정산이 일치한다', () => {
  const state = firstMonth();
  for (const plan of [DEFAULT_SCHOOL_PLAN, Array(7).fill('math'), Array(7).fill('rest')]) {
    const preview = schoolPlanEffects(state, plan);
    const next = completeSchoolMonth(state, plan, catalog);
    for (const group of ['skills', 'stats']) {
      for (const key of Object.keys(state.player[group])) {
        assert.equal(next.player[group][key] - state.player[group][key], preview[group][key] ?? 0, `${group}.${key}`);
      }
    }
  }
  const study = completeSchoolMonth(state, Array(7).fill('math'), catalog);
  const rest = completeSchoolMonth(state, Array(7).fill('rest'), catalog);
  assert.ok(study.player.skills.math > state.player.skills.math);
  assert.ok(study.player.stats.health < rest.player.stats.health);
  assert.ok(study.player.stats.happiness < rest.player.stats.happiness);
  assert.ok(study.player.stats.workStress > rest.player.stats.workStress);
  assert.ok(schoolPlanEffects(state, Array(7).fill('math')).warnings.length > 0);
});

test('친구와 동아리 활동이 실제 인물과 관계·행복으로 이어지고 재회해도 성향을 유지한다', () => {
  let state = firstMonth();
  const plan = ['friends', 'club', 'friends', 'club', 'rest', 'exercise', 'math'];
  for (let month = 0; month < 3; month++) {
    state = resolveStories(state);
    state = completeSchoolMonth(state, plan, catalog);
  }
  assert.ok(state.people['school-friend']);
  assert.ok(state.people['student-club-friend']);
  const known = structuredClone(state.people['student-club-friend']);
  assert.ok(known.relationship > 0);
  assert.ok(state.player.stats.happiness >= firstMonth().player.stats.happiness);
  state = completeSchoolMonth(resolveStories(state), plan, catalog);
  assert.deepEqual(state.people['student-club-friend'].traits, known.traits);
  assert.ok(state.people['student-club-friend'].relationship >= known.relationship);
});

test('학기 사건을 끼워 넣으며 고교·대학·실무 훈련 기간도 한 달씩 진행한다', () => {
  for (const [education, months] of [['experience', 48], ['training', 60], ['university', 96]]) {
    const state = graduate(catalog, { education });
    assert.equal(state.time.elapsedMonths, months);
    assert.equal(state.schoolLife.monthsCompleted, months);
    assert.equal(state.facts.readyForCareer, true);
    const schedules = state.history.filter((entry) => entry.type === 'schedule');
    assert.equal(schedules.length, months);
    assert.ok(schedules.every((entry) => entry.finishedAtMonth - entry.startedAtMonth === 1));
    assert.ok(state.progress.school.completedEvents.length >= 8);
  }
  assert.ok(catalog.events.filter((event) => event.trackId === 'school')
    .every((event) => event.choices.every((choice) => choice.durationMonths === 0)));
});

test('일정·월말 보고서를 저장해 이어하고 기존 버전 1의 진행도 보존한다', () => {
  const state = completeSchoolMonth(firstMonth(), DEFAULT_SCHOOL_PLAN, catalog);
  assert.deepEqual(restoreGame(serializeGame(state), catalog), state);
  const old = structuredClone(state);
  old.schemaVersion = 1;
  delete old.schoolLife;
  // 실제 버전 1에는 월별 일정 이력이 없었다.
  old.history = old.history.filter((entry) => entry.type !== 'schedule');
  const migrated = restoreGame(JSON.stringify(old), catalog);
  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.time, old.time);
  assert.deepEqual(migrated.people, old.people);
  assert.deepEqual(migrated.facts, old.facts);
  assert.ok(migrated.schoolLife);
  const invalid = structuredClone(state);
  invalid.schoolLife.lastPlan = ['not-an-activity'];
  assert.throws(() => restoreGame(JSON.stringify(invalid), catalog));
});

test('기존 학생 저장에 새로 추가한 과거 사건을 소급하지 않고 원래 선택과 재산·관계를 보존한다', () => {
  let old = advanceMonths(firstMonth(), 12);
  old = choose(old, 'school-project', 'help-friend', catalog);
  old.schemaVersion = 1;
  delete old.schoolLife;
  const migrated = restoreGame(JSON.stringify(old), catalog);
  const legacyIds = new Set(['school-interest', 'school-project', 'school-next-step']);
  const skipped = catalog.events.filter((event) => event.trackId === 'school'
    && !legacyIds.has(event.id) && event.atMonth < old.progress.school.elapsedMonths).map((event) => event.id);
  assert.ok(skipped.length >= 2);
  assert.deepEqual(migrated.progress.school.completedEvents,
    [...old.progress.school.completedEvents, ...skipped]);
  assert.deepEqual(availableEvents(migrated, catalog), []);
  assert.equal(canPlanSchoolMonth(migrated, catalog), true);
  for (const field of ['time', 'player', 'people', 'facts', 'history', 'memories', 'ledger', 'rngSeed', 'activeTrack']) {
    assert.deepEqual(migrated[field], old[field], field);
  }
  assert.deepEqual(migrated.progress.school.metrics, old.progress.school.metrics);
  assert.equal(migrated.progress.school.phase, old.progress.school.phase);

  const atBoundary = advanceMonths(firstMonth(), 6);
  atBoundary.schemaVersion = 1;
  delete atBoundary.schoolLife;
  const boundaryRestored = restoreGame(JSON.stringify(atBoundary), catalog);
  assert.ok(availableEvents(boundaryRestored, catalog).some((event) => event.atMonth === 6));

  const ready = structuredClone(old);
  ready.facts.readyForCareer = true;
  assert.deepEqual(restoreGame(JSON.stringify(ready), catalog).progress, ready.progress);
  const adult = structuredClone(ready);
  adult.activeTrack = 'employee';
  adult.progress.employee = { elapsedMonths: 0, phase: 'orientation', metrics: {}, completedEvents: [] };
  assert.deepEqual(restoreGame(JSON.stringify(adult), catalog).progress, adult.progress);

  const malformed = { ...old, progress: { school: null } };
  assert.throws(() => restoreGame(JSON.stringify(malformed), catalog), /저장된 경로 진행/);
});

test('부족하거나 잘못된 요일 계획은 반영하지 않고 능력치 상한을 지킨다', () => {
  const state = firstMonth();
  const before = structuredClone(state);
  for (const plan of [[], ['math'], Array(7).fill('missing'), Array(8).fill('rest'), null]) {
    assert.throws(() => completeSchoolMonth(state, plan, catalog));
  }
  assert.deepEqual(state, before);
  const high = structuredClone(state);
  high.player.stats.health = 100;
  high.player.skills.math = 100;
  const next = completeSchoolMonth(high, DEFAULT_SCHOOL_PLAN, catalog);
  assert.ok(Object.values(next.player.stats).every((value) => value >= 0 && value <= 100));
  assert.ok(Object.values(next.player.skills).every((value) => value >= 0 && value <= 100));
  assert.equal(new Set(STUDENT_ACTIVITIES.map((activity) => activity.id)).size, STUDENT_ACTIVITIES.length);
});
