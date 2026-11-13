// 화면·파일·네트워크를 모르는 공통 엔진. 입력 상태를 바꾸지 않고 새 상태를 돌려준다.
export const SAVE_VERSION = 1;
export const STAT_KEYS = ['health', 'happiness', 'workStress', 'socialStress'];
export const SKILL_KEYS = ['math', 'language', 'science', 'art', 'business', 'communication'];
export const VALUE_KEYS = ['wealth', 'influence', 'craft', 'stability', 'freedom'];
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const copy = (value) => structuredClone(value);

function parts(path) {
  if (typeof path !== 'string' || !path.length) throw new Error('상태 경로가 필요합니다.');
  const keys = path.split('.');
  if (keys.some((key) => !key || forbidden.has(key))) throw new Error(`허용하지 않는 경로: ${path}`);
  return keys;
}

export function readPath(state, path) {
  return parts(path).reduce((value, key) =>
    value != null && Object.hasOwn(value, key) ? value[key] : undefined, state);
}

export function matches(state, conditions = []) {
  return conditions.every(({ path, op, value }) => {
    const actual = readPath(state, path);
    switch (op) {
      case 'eq': return actual === value;
      case 'gte': return typeof actual === 'number' && actual >= value;
      case 'lte': return typeof actual === 'number' && actual <= value;
      case 'exists': return (actual !== undefined) === (value ?? true);
      case 'includes': return Array.isArray(actual) && actual.includes(value);
      default: throw new Error(`알 수 없는 조건: ${op}`);
    }
  });
}

export function validEffectPath(path) {
  parts(path);
  const [root, group, key] = path.split('.');
  if (root === 'player') {
    const keys = { stats: STAT_KEYS, skills: SKILL_KEYS, values: VALUE_KEYS }[group];
    return path.split('.').length === 3 && Boolean(keys?.includes(key));
  }
  return /^(facts\.[\w-]+|people\.[\w-]+\.relationship|progress\.[\w-]+\.(phase|metrics\.[\w-]+))$/.test(path);
}

function setPath(state, path, value, additive = false) {
  if (!validEffectPath(path)) throw new Error(`수정할 수 없는 경로: ${path}`);
  const keys = parts(path);
  const key = keys.pop();
  let target = state;
  for (const part of keys) {
    if (!Object.hasOwn(target, part) || !target[part] || typeof target[part] !== 'object') {
      throw new Error(`아직 존재하지 않는 상태: ${path}`);
    }
    target = target[part];
  }
  const next = additive ? (target[key] ?? 0) + value : value;
  if (additive && (typeof value !== 'number' || typeof (target[key] ?? 0) !== 'number')) {
    throw new Error(`숫자에만 더할 수 있습니다: ${path}`);
  }
  if (typeof next === 'number' && !Number.isFinite(next)) throw new Error('유한한 숫자가 필요합니다.');
  if (path.startsWith('player.') || path.startsWith('people.')) {
    if (typeof next !== 'number') throw new Error(`능력치와 관계는 숫자여야 합니다: ${path}`);
    target[key] = Math.max(path.startsWith('people.') ? -100 : 0, Math.min(100, next));
  } else {
    target[key] = next;
  }
}

// 같은 seed와 선택이면 같은 만남이 나온다. 만난 인물은 재회해도 다시 추첨하지 않는다.
function random(state) {
  let seed = state.rngSeed;
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  state.rngSeed = seed >>> 0;
  return state.rngSeed / 4294967296;
}

function enterMutable(state, track) {
  state.activeTrack = track.id;
  state.progress[track.id] ??= {
    elapsedMonths: 0,
    phase: track.initialPhase,
    metrics: copy(track.initialMetrics),
    completedEvents: [],
  };
}

export function createGame(catalog, { seed = 42 } = {}) {
  if (!Number.isInteger(seed) || seed < 1 || seed > 4294967295) throw new Error('seed는 1~4294967295 정수입니다.');
  const school = catalog.tracks.find((track) => track.id === 'school');
  if (!school) throw new Error('school 경로가 필요합니다.');
  const state = {
    schemaVersion: SAVE_VERSION,
    rngSeed: seed,
    time: { ageMonths: 15 * 12, elapsedMonths: 0 },
    player: {
      stats: { health: 70, happiness: 60, workStress: 0, socialStress: 0 },
      skills: { math: 30, language: 30, science: 30, art: 30, business: 20, communication: 30 },
      values: { wealth: 50, influence: 50, craft: 50, stability: 50, freedom: 50 },
      // 검증용 시작 자금. 현실의 학생 자산이나 가정환경을 나타내는 통계가 아니다.
      money: 10000000,
    },
    facts: {}, people: {}, progress: {},
    memories: [], history: [], ledger: [], activeTrack: null,
  };
  enterMutable(state, school);
  return state;
}

export function enterTrack(state, trackId, catalog) {
  const track = catalog.tracks.find((item) => item.id === trackId);
  if (!track) throw new Error(`없는 경로: ${trackId}`);
  if (trackId !== 'school' && !state.facts.readyForCareer) throw new Error('학교에서 졸업 후 계획을 먼저 선택하세요.');
  const next = copy(state);
  const previousTrack = next.activeTrack;
  enterMutable(next, track);
  next.history.push({ type: 'transition', from: previousTrack, to: trackId, atMonth: next.time.elapsedMonths });
  return next;
}

function advanceMutable(state, months) {
  if (!Number.isInteger(months) || months < 0) throw new Error('시간은 0 이상의 정수 개월로 진행합니다.');
  state.time.elapsedMonths += months;
  state.time.ageMonths += months;
  state.progress[state.activeTrack].elapsedMonths += months;
}

export function advanceMonths(state, months) {
  const next = copy(state);
  advanceMutable(next, months);
  return next;
}

export function availableEvents(state, catalog) {
  const progress = state.progress[state.activeTrack];
  return catalog.events
    .filter((event) => event.trackId === state.activeTrack
      && event.atMonth <= progress.elapsedMonths
      && !progress.completedEvents.includes(event.id)
      && matches(state, event.requires))
    .sort((a, b) => a.atMonth - b.atMonth || a.id.localeCompare(b.id))
    .map((event) => ({ ...copy(event), choices: event.choices.filter((choice) => matches(state, choice.requires)).map(copy) }));
}

function applyEffect(state, effect, catalog) {
  switch (effect.type) {
    case 'add': case 'set':
      setPath(state, effect.path, effect.value, effect.type === 'add');
      break;
    case 'meet': {
      const person = catalog.people.find((item) => item.id === effect.personId);
      if (!person) throw new Error(`없는 인물: ${effect.personId}`);
      if (!state.people[person.id]) {
        const met = copy(person);
        for (const key of Object.keys(met.traits)) {
          met.traits[key] = Math.max(0, Math.min(100, met.traits[key] + Math.floor(random(state) * 21) - 10));
        }
        state.people[person.id] = { ...met, metAtMonth: state.time.elapsedMonths };
      }
      break;
    }
    case 'remember':
      state.memories.push({ atMonth: state.time.elapsedMonths, text: effect.text, tags: copy(effect.tags ?? []) });
      break;
    case 'payment': {
      if (!['salary', 'revenue', 'expense'].includes(effect.kind)
        || !Number.isSafeInteger(effect.amount) || effect.amount < 0) throw new Error('올바른 수입·비용 항목이 필요합니다.');
      state.player.money += effect.kind === 'expense' ? -effect.amount : effect.amount;
      if (!Number.isSafeInteger(state.player.money)) throw new Error('지원하는 금액 범위를 넘었습니다.');
      state.ledger.push({ atMonth: state.time.elapsedMonths, trackId: state.activeTrack,
        kind: effect.kind, amount: effect.amount, memo: effect.memo, balance: state.player.money });
      break;
    }
    default: throw new Error(`알 수 없는 효과: ${effect.type}`);
  }
}

export function choose(state, eventId, choiceId, catalog) {
  const event = availableEvents(state, catalog).find((item) => item.id === eventId);
  if (!event) throw new Error('아직 발생하지 않았거나 이미 끝난 사건입니다.');
  const choice = event.choices.find((item) => item.id === choiceId);
  if (!choice) throw new Error('지금 고를 수 없는 선택지입니다.');
  const next = copy(state);
  const startedAtMonth = next.time.elapsedMonths;
  for (const effect of choice.effects) applyEffect(next, effect, catalog);
  next.progress[next.activeTrack].completedEvents.push(event.id);
  advanceMutable(next, choice.durationMonths);
  next.history.push({ type: 'choice', eventId, choiceId, trackId: next.activeTrack,
    startedAtMonth, finishedAtMonth: next.time.elapsedMonths, outcome: choice.outcome });
  return next;
}

export function serializeGame(state) {
  return JSON.stringify(state, null, 2);
}

export function restoreGame(json, catalog) {
  const state = JSON.parse(json);
  if (state?.schemaVersion !== SAVE_VERSION) throw new Error('지원하지 않는 저장 버전입니다.');
  if (!Number.isInteger(state.rngSeed) || state.rngSeed < 1 || state.rngSeed > 4294967295
    || !Number.isSafeInteger(state.time?.ageMonths) || state.time.ageMonths < 0
    || !Number.isSafeInteger(state.time?.elapsedMonths) || state.time.elapsedMonths < 0
    || !Number.isSafeInteger(state.player?.money)) throw new Error('저장 상태가 손상되었습니다.');
  for (const [group, keys] of Object.entries({ stats: STAT_KEYS, skills: SKILL_KEYS, values: VALUE_KEYS })) {
    for (const key of keys) {
      const value = state.player?.[group]?.[key];
      if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error('저장 능력치가 올바르지 않습니다.');
    }
  }
  for (const name of ['facts', 'people', 'progress']) {
    if (!state[name] || typeof state[name] !== 'object' || Array.isArray(state[name])) throw new Error('저장 객체가 손상되었습니다.');
  }
  for (const name of ['memories', 'history', 'ledger']) {
    if (!Array.isArray(state[name])) throw new Error('저장 기록이 손상되었습니다.');
  }
  const trackIds = new Set(catalog.tracks.map((track) => track.id));
  for (const [id, progress] of Object.entries(state.progress)) {
    if (!trackIds.has(id) || !Number.isInteger(progress.elapsedMonths) || progress.elapsedMonths < 0
      || typeof progress.phase !== 'string' || !progress.metrics || typeof progress.metrics !== 'object'
      || !Array.isArray(progress.completedEvents)
      || progress.completedEvents.some((eventId) => !catalog.events.some((event) => event.id === eventId && event.trackId === id))) {
      throw new Error('저장된 경로 진행이 올바르지 않습니다.');
    }
  }
  if (!Object.hasOwn(state.progress, state.activeTrack)) throw new Error('진행 중인 경로가 없습니다.');
  for (const person of Object.values(state.people)) {
    if (!person || !catalog.people.some((item) => item.id === person.id) || !Number.isFinite(person.relationship)
      || person.relationship < -100 || person.relationship > 100
      || !person.traits || typeof person.traits !== 'object'
      || Object.values(person.traits).some((value) => !Number.isFinite(value) || value < 0 || value > 100)) {
      throw new Error('저장된 인물이 올바르지 않습니다.');
    }
  }
  if (state.memories.some((entry) => !entry || typeof entry.text !== 'string' || !Array.isArray(entry.tags))) throw new Error('저장된 기억이 올바르지 않습니다.');
  if (state.ledger.some((entry) => !entry || !['salary', 'revenue', 'expense'].includes(entry.kind)
    || !Number.isSafeInteger(entry.amount) || entry.amount < 0 || typeof entry.memo !== 'string'
    || !Number.isSafeInteger(entry.balance))) throw new Error('저장된 거래가 올바르지 않습니다.');
  if (state.history.some((entry) => !entry || !['choice', 'transition'].includes(entry.type))) throw new Error('저장된 이력이 올바르지 않습니다.');
  return state;
}
