import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../src/content/load.js';
import { validateCatalog } from '../src/content/validate.js';
import { createGame, advanceMonths, availableEvents, choose, enterTrack,
  matches, readPath, serializeGame, restoreGame } from '../src/core/engine.js';
import { nextScene } from '../src/cli/session.js';

const catalog = await loadCatalog();

function school({ help = true, education = 'university', seed = 42 } = {}) {
  let state = createGame(catalog, { seed });
  state = choose(state, 'school-interest', 'science', catalog);
  state = advanceMonths(state, 12);
  state = choose(state, 'school-project', help ? 'help-friend' : 'focus-study', catalog);
  state = advanceMonths(state, 24);
  return choose(state, 'school-next-step', education, catalog);
}

// 데이터의 모든 선택 조합을 실제 엔진으로 끝까지 통과시킨다.
function endings(state) {
  const next = nextScene(state, catalog);
  const event = availableEvents(next, catalog)[0];
  if (!event) {
    assert.equal(next.progress[next.activeTrack].completedEvents.length,
      catalog.events.filter((item) => item.trackId === next.activeTrack).length,
      `도중에 막힌 경로: ${next.activeTrack}`);
    return [next];
  }
  return event.choices.flatMap((choice) => endings(choose(next, event.id, choice.id, catalog)));
}

test('데이터 참조, 진로 그래프, 사건 정의를 검증한다', () => {
  assert.deepEqual(validateCatalog(catalog), []);
  const invalid = structuredClone(catalog);
  invalid.careerTree.nodes[0].parentIds = [invalid.careerTree.nodes[0].id];
  invalid.events[0].choices[0].effects.push({ type: 'meet', personId: 'missing-person' });
  invalid.events[0].choices[0].effects.push({ type: 'payment', kind: 'salary', amount: -1 });
  const errors = validateCatalog(invalid);
  assert.ok(errors.some((error) => error.includes('순환')));
  assert.ok(errors.some((error) => error.includes('없는 인물')));
  assert.ok(errors.some((error) => error.includes('금액')));
  const invalidTypes = structuredClone(catalog);
  const effects = invalidTypes.events[0].choices[0].effects;
  effects.push({ type: 'set', path: 'player.stats.health', value: 'healthy' });
  effects.push({ type: 'set', path: 'progress.school.phase', value: 4 });
  invalidTypes.events[0].requires.push({ path: 'facts..x', op: 'exists', value: true });
  effects.push({ type: 'set', path: 123, value: 'invalid' });
  invalidTypes.careerTree.nodes[0].parentIds = 123;
  assert.ok(validateCatalog(invalidTypes).length >= 3);
  assert.ok(validateCatalog({ events: null }).length > 0);
});

test('15세 시작, 과목별 능력과 교육 기간을 기록하며 입력을 변경하지 않는다', () => {
  const initial = createGame(catalog);
  const snapshot = structuredClone(initial);
  const state = choose(initial, 'school-interest', 'science', catalog);
  assert.deepEqual(initial, snapshot);
  assert.equal(state.player.skills.science, 42);
  assert.equal(state.player.skills.art, 30);
  assert.equal(initial.time.ageMonths, 180);
  assert.equal(school().time.ageMonths, 22 * 12);
  assert.equal(school({ education: 'training' }).time.ageMonths, 19 * 12);
  assert.equal(school({ education: 'experience' }).time.ageMonths, 18 * 12);
});

test('미발생·완료·조건부 선택의 우회와 너무 이른 경력 시작을 막는다', () => {
  const initial = createGame(catalog);
  assert.throws(() => enterTrack(initial, 'employee', catalog), /졸업/);
  assert.throws(() => choose(initial, 'school-project', 'help-friend', catalog), /발생/);
  const after = choose(initial, 'school-interest', 'science', catalog);
  assert.throws(() => choose(after, 'school-interest', 'science', catalog), /끝난/);
  let state = enterTrack(school({ help: false }), 'employee', catalog);
  state = choose(state, 'employee-orientation', 'learn-together', catalog);
  assert.ok(!availableEvents(state, catalog)[0].choices.some((choice) => choice.id === 'reconnect-friend'));
  assert.throws(() => choose(state, 'employee-assignment', 'reconnect-friend', catalog), /고를 수 없는/);
  assert.throws(() => advanceMonths(state, -1), /정수/);
  assert.throws(() => enterTrack(state, 'politician', catalog), /없는 경로/);
});

test('학교에서 친구를 도운 경험이 성인기의 추가 선택을 연다', () => {
  let state = enterTrack(school(), 'employee', catalog);
  const relationship = state.people['school-friend'].relationship;
  state = choose(state, 'employee-orientation', 'learn-together', catalog);
  assert.ok(availableEvents(state, catalog)[0].choices.some((choice) => choice.id === 'reconnect-friend'));
  state = choose(state, 'employee-assignment', 'reconnect-friend', catalog);
  assert.equal(state.people['school-friend'].relationship, relationship + 10);
  assert.ok(state.memories.some((memory) => memory.tags.includes('school')));
});

test('모든 학교 선택과 세 직업의 선택 조합이 마지막 사건까지 이어진다', (context) => {
  const graduates = endings(createGame(catalog));
  assert.equal(graduates.length, 27);
  let count = 0;
  for (const graduate of graduates) {
    assert.equal(graduate.facts.readyForCareer, true);
    for (const trackId of ['employee', 'creator', 'owner']) {
      for (const final of endings(enterTrack(graduate, trackId, catalog))) {
        count++;
        assert.ok(Number.isSafeInteger(final.player.money));
        assert.ok(final.memories.length > graduate.memories.length);
        const kinds = new Set(final.ledger.filter((entry) => entry.trackId === trackId).map((entry) => entry.kind));
        if (trackId === 'employee') {
          assert.deepEqual([...kinds], ['salary']);
          assert.ok(final.people['employee-newcomer']);
        } else {
          assert.ok(!kinds.has('salary'));
          assert.ok(kinds.has('expense'));
          if (trackId === 'owner') assert.ok(kinds.has('revenue'));
        }
        const balance = 10000000 + final.ledger.reduce((sum, entry) =>
          sum + (entry.kind === 'expense' ? -entry.amount : entry.amount), 0);
        assert.equal(final.player.money, balance);
      }
    }
  }
  assert.ok(count > 1000, `검증한 인생 조합: ${count}`);
  context.diagnostic(`완주를 검증한 인생 조합: ${count}`);
});

test('경력 전환 뒤에도 사람·관계·돈·기억은 남고 이전 경로를 재개한다', () => {
  let state = enterTrack(school(), 'employee', catalog);
  state = choose(state, 'employee-orientation', 'learn-together', catalog);
  const saved = structuredClone(state);
  state = enterTrack(state, 'creator', catalog);
  state = choose(state, 'creator-production', 'collaborate-friend', catalog);
  assert.deepEqual(state.people['employee-peer'], saved.people['employee-peer']);
  assert.equal(state.people['school-friend'].relationship, saved.people['school-friend'].relationship + 10);
  assert.ok(state.memories.some((memory) => memory.tags.includes('orientation')));
  assert.deepEqual(state.progress.employee, saved.progress.employee);
  const balance = state.player.money;
  state = enterTrack(state, 'employee', catalog);
  assert.equal(state.player.money, balance);
  assert.equal(availableEvents(state, catalog)[0].id, 'employee-assignment');
  assert.ok(!availableEvents(state, catalog).some((event) => event.id === 'employee-orientation'));
});

test('저장·복원 뒤에도 인물 추첨과 이후 선택 결과가 재현된다', () => {
  const state = enterTrack(school({ seed: 2026 }), 'employee', catalog);
  const loaded = restoreGame(serializeGame(state), catalog);
  assert.deepEqual(loaded, state);
  assert.deepEqual(choose(loaded, 'employee-orientation', 'learn-together', catalog),
    choose(state, 'employee-orientation', 'learn-together', catalog));
  const other = enterTrack(school({ seed: 2027 }), 'employee', catalog);
  assert.notDeepEqual(choose(other, 'employee-orientation', 'learn-together', catalog).people['employee-peer'].traits,
    choose(state, 'employee-orientation', 'learn-together', catalog).people['employee-peer'].traits);
  assert.throws(() => restoreGame(JSON.stringify({ ...state, schemaVersion: 99 }), catalog), /버전/);
  const broken = structuredClone(state);
  broken.progress.employee.elapsedMonths = -1;
  assert.throws(() => restoreGame(JSON.stringify(broken), catalog), /진행/);
  for (const key of ['memories', 'ledger', 'history']) {
    const invalid = { ...state, [key]: [null] };
    assert.throws(() => restoreGame(JSON.stringify(invalid), catalog), /올바르지/);
  }
  const invalidPerson = structuredClone(state);
  invalidPerson.people['school-friend'].name = null;
  assert.throws(() => restoreGame(JSON.stringify(invalidPerson), catalog), /인물/);
});

test('false인 사실도 존재 조건에는 맞으며, 상태 접근으로 객체 원형을 읽지 않는다', () => {
  assert.equal(matches({ facts: { helped: false } }, [{ path: 'facts.helped', op: 'exists', value: true }]), true);
  assert.equal(matches({ facts: {} }, [{ path: 'facts.helped', op: 'exists', value: true }]), false);
  assert.throws(() => readPath({}, '__proto__.polluted'), /경로/);
});
