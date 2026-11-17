import { createGame, choose, availableEvents, enterTrack, restoreGame } from './core/engine.js';
import { nextScene } from './core/session.js';
import { STUDENT_ACTIVITIES, DEFAULT_SCHOOL_PLAN, canPlanSchoolMonth,
  schoolTerm, schoolPlanEffects, completeSchoolMonth } from './core/school-life.js';
import { avatarMarkup } from './avatar.js';

const STORAGE_KEY = 'life-paths.web.v1';
const app = document.querySelector('#app');
const dialog = document.querySelector('#restart-dialog');
const announcer = document.querySelector('#announcer');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const format = (value) => Number(value).toLocaleString('ko-KR');
const skillNames = { math: '수학', language: '언어', science: '과학', art: '창작', business: '사업 감각', communication: '소통' };
const statNames = { health: '건강', happiness: '행복', workStress: '업무 스트레스', socialStress: '대인 스트레스' };
const traitNames = { fairness: '공정성', competence: '역량', ambition: '목표 의식', empathy: '공감' };
const valueNames = { wealth: '경제적 여유', influence: '영향력', craft: '작업의 완성도', stability: '안정', freedom: '자유' };
const trackNames = { school: '학생', employee: '회사 소속 개발자', creator: '독립 창작자', owner: '가게 운영자' };
const trackNotes = { employee: '입문 교육, 첫 업무와 팀 관계, 후배를 맞이하는 생활', creator: '작품 제작과 공개, 계약과 다음 작품을 이어가는 생활', owner: '개업 준비부터 거래처, 고객, 가게의 비용을 관리하는 생활' };
const navItems = [ ['home', '생활', 'home'], ['schedule', '일정', 'calendar'], ['people', '인연', 'people'], ['career', '진로', 'career'], ['records', '기록', 'book'] ];
const weekdays = ['월', '화', '수', '목', '금', '토', '일'];
const schoolPresets = [
  { id: 'balanced', label: '균형', plan: DEFAULT_SCHOOL_PLAN },
  { id: 'study', label: '공부 집중', plan: ['math', 'language', 'science', 'math', 'language', 'rest', 'exercise'] },
  { id: 'social', label: '인연·취미', plan: ['friends', 'club', 'art', 'friends', 'exercise', 'rest', 'friends'] },
  { id: 'recover', label: '회복', plan: ['rest', 'exercise', 'art', 'rest', 'friends', 'exercise', 'rest'] },
];
let catalog, state = null, playerName = '', pending = null, careerSelection = false;
let activeView = 'home', recordTab = 'memories', appearance = 0, nameDraft = '';
let notice = '', storageFailed = false, busy = false, schoolPlan = null;

function icon(name) {
  const paths = {
    home: '<path d="m3 11 9-8 9 8v10h-6v-7H9v7H3z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 4c2 0 3 2 3 4v2"/>',
    career: '<path d="M12 22V10m0 4L5 7m7 3 7-7M2 3h6v6m8-9h6v6"/>',
    book: '<path d="M12 5v16M3 4c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2Z"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    check: '<path d="m5 12 4 4L20 5"/>',
    reset: '<path d="M5 8a8 8 0 1 1-1 7M5 3v5H0"/>',
    star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="M9 8h6m-3 0v8m-3 0h6"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.star}</svg>`;
}
function validSchoolPlan(plan) { return Array.isArray(plan) && plan.length === 7 && plan.every((id) => STUDENT_ACTIVITIES.some((activity) => activity.id === id)); }
function currentSchoolPlan() {
  if (!validSchoolPlan(schoolPlan)) schoolPlan = [...(validSchoolPlan(state?.schoolLife?.lastPlan) ? state.schoolLife.lastPlan : DEFAULT_SCHOOL_PLAN)];
  return schoolPlan;
}
function seed() { const values = new Uint32Array(1); crypto.getRandomValues(values); return values[0] || 1; }
function age(months) { return `${Math.floor(months / 12)}세`; }
function duration(months) { return [Math.floor(months / 12) ? `${Math.floor(months / 12)}년` : '', months % 12 ? `${months % 12}개월` : ''].filter(Boolean).join(' ') || '지금'; }
function withPerson(name) { const code = name.charCodeAt(name.length - 1); return `${name}${code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 ? '과' : '와'}`; }
function displayStats(current) { return current.activeTrack === 'school' ? { ...statNames, workStress: '학업 스트레스' } : statNames; }
function playedMoments(current = state) { return current?.history.filter((entry) => ['choice', 'schedule'].includes(entry.type)).length ?? 0; }
function announce(text) { announcer.textContent = text; }
function panelState() { return state ?? createGame(catalog); }
function focusStory() { requestAnimationFrame(() => document.querySelector('.story-title')?.focus({ preventScroll: true })); }
function savedChanges(changes) {
  if (!Array.isArray(changes)) return [];
  return changes
    .filter((item) => item && typeof item.label === 'string' && typeof item.value === 'string')
    .slice(0, 24)
    .map((item) => ({ label: item.label, value: item.value, negative: item.negative === true }));
}
function save() {
  if (!state) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, name: playerName, appearance, state, pending, careerSelection, schoolPlan, activeView }));
    storageFailed = false;
  } catch {
    storageFailed = true;
    notice = '자동 저장을 사용할 수 없어요. 지금은 플레이할 수 있지만 창을 닫으면 진행을 잃을 수 있어요.';
  }
}
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.version !== 1) throw new Error('저장 버전');
    state = restoreGame(JSON.stringify(saved.state), catalog);
    playerName = typeof saved.name === 'string' ? saved.name.slice(0, 20) : '';
    appearance = Number.isInteger(saved.appearance) && saved.appearance >= 0 && saved.appearance < 4 ? saved.appearance : 0;
    const last = state.history.at(-1);
    if (saved.pending?.kind === 'schedule' && last?.type === 'schedule' && saved.pending.month === state.time.elapsedMonths
      && typeof state.schoolLife?.lastReport?.title === 'string' && typeof state.schoolLife.lastReport.body === 'string') {
      pending = { kind: 'schedule', month: saved.pending.month, changes: savedChanges(saved.pending.changes) };
    } else if (saved.pending && last?.type === 'choice' && last.eventId === saved.pending.eventId && last.choiceId === saved.pending.choiceId) {
      pending = { kind: 'choice', eventId: last.eventId, choiceId: last.choiceId, changes: savedChanges(saved.pending.changes) };
    }
    schoolPlan = validSchoolPlan(saved.schoolPlan) ? [...saved.schoolPlan] : null;
    careerSelection = saved.careerSelection === true && state.facts.readyForCareer === true && !pending;
    activeView = navItems.some(([id]) => id === saved.activeView) ? saved.activeView : 'home';
    // 결과를 아직 읽지 않았다면 재접속 때 그 자리로 돌아온다. 정산은 다시 실행하지 않는다.
    if (pending) activeView = 'home';
  } catch {
    state = null; pending = null; activeView = 'home';
    notice = '저장된 인생을 읽지 못했어요. 새로 시작하면 이 브라우저에 새 진행을 기록합니다.';
  }
}
function begin(name) {
  state = createGame(catalog, { seed: seed() });
  playerName = name.trim().slice(0, 20); nameDraft = playerName;
  pending = null; careerSelection = false; activeView = 'home'; recordTab = 'memories';
  schoolPlan = [...DEFAULT_SCHOOL_PLAN]; notice = '';
  save(); render(); focusStory(); announce('15세, 새로운 인생을 시작했습니다.');
}

function meter(label, value, { inverse = false } = {}) {
  return `<div class="meter ${inverse ? 'inverse' : ''}"><div class="meter-label"><span>${esc(label)}</span><b>${value}<small>/100</small></b></div><div class="meter-track" role="meter" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"><i style="width:${value}%"></i></div></div>`;
}
function profile(current) {
  const term = current.activeTrack === 'school' ? schoolTerm(current) : null;
  const activeStats = displayStats(current);
  return `<aside class="player-hud" aria-label="플레이어 상태">
    <section class="profile-card"><div class="profile-main"><div class="player-avatar">${avatarMarkup({ variant: appearance, stage: current.activeTrack })}</div>
      <div class="profile-info"><span class="tag">${esc(term?.label ?? trackNames[current.activeTrack])}</span><h1>${esc(playerName || nameDraft || '새로운 나')}</h1><p>${age(current.time.ageMonths)} <span>· ${current.time.ageMonths % 12}개월</span></p></div>
      <div class="level-badge"><strong>${current.memories.length}</strong><span>쌓인 기억</span></div></div>
      <div class="profile-time">${icon('calendar')}<span>${esc(term?.monthLabel ?? `이 경로에서 ${duration(current.progress[current.activeTrack].elapsedMonths)}`)}</span><b>${current.schoolLife?.monthsCompleted ?? 0}<small>개월의 일상</small></b></div>
    </section>
    <section class="status-card" aria-label="컨디션"><h2 class="small-heading">컨디션 <span>지금의 상태</span></h2><div class="condition-grid">${Object.entries(activeStats).map(([key, label]) => meter(label, current.player.stats[key], { inverse: key.includes('Stress') })).join('')}</div>
      <div class="money-row">${icon('coin')}<span>보유 자금</span><b>${format(current.player.money)}<small>원</small></b></div>
    </section>
    <section class="skills-card" aria-label="능력치"><h2 class="small-heading">능력치 <span>경험이 쌓이는 중</span></h2><div class="skill-grid">${Object.entries(skillNames).map(([key, label]) => `<div class="skill-cell"><span>${label}</span><strong>${current.player.skills[key]}</strong><div class="skill-line"><i style="width:${current.player.skills[key]}%"></i></div></div>`).join('')}</div></section>
    ${state ? `<div class="hud-counts"><span>${icon('people')}<b>${Object.keys(current.people).length}</b>명의 인연</span><span>${icon('book')}<b>${current.memories.length}</b>개의 기억</span></div>` : ''}
  </aside>`;
}
function navigation() {
  return `<nav class="game-nav" aria-label="게임 메뉴">${navItems.map(([id, label, symbol]) => `<button type="button" class="nav-button ${activeView === id ? 'active' : ''}" data-view="${id}" ${activeView === id ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span>${id === 'home' && (pending || availableEvents(state, catalog).length) ? '<i class="nav-dot" aria-label="확인할 이야기 있음"></i>' : ''}</button>`).join('')}</nav>`;
}
function shell(content) {
  const current = panelState();
  return `<div class="game-shell"><header class="game-header"><a class="brand" href="./">${icon('career')}<strong>갈림길</strong><span>인생 육성 시뮬레이션</span></a><div class="header-actions"><span class="save-state ${storageFailed ? 'failed' : ''}"><i></i>${state ? storageFailed ? '저장 실패' : '자동 저장됨' : '새 인생 준비'}</span>${state ? `<button class="icon-button" data-action="restart" aria-label="새 인생 시작">${icon('reset')}<span>새 인생</span></button>` : ''}</div></header>
    ${notice ? `<div class="notice" role="status">${esc(notice)}</div>` : ''}
    <main class="game-grid">${profile(current)}<section id="story" class="play-area" aria-label="게임 진행">${content}</section></main>
    <footer class="game-note">개발 중인 게임 · 인물·금액·기간은 가상 설정입니다. 정기 생활비와 세금은 아직 반영되지 않습니다.</footer>
    ${state ? navigation() : ''}</div>`;
}
function frame(content, { label = '생활', number, className = '' } = {}) {
  return `<article class="game-panel ${className}"><div class="panel-caption"><span>${esc(label)}</span><b>${number ?? `TURN ${String(playedMoments() + 1).padStart(2, '0')}`}</b></div>${content}</article>`;
}
function heading(kicker, title, body = '') {
  return `<div class="scene-heading"><p class="eyebrow">${esc(kicker)}</p><h2 class="story-title" tabindex="-1">${esc(title)}</h2>${body ? `<p class="scene-body">${esc(body)}</p>` : ''}</div>`;
}
function welcome() {
  return frame(`<div class="panel-content">${heading('NEW LIFE', '나의 첫 인생을 설정해요', '15세, 중학교 3학년부터 시작합니다. 정해진 정답 없이 공부·관계·진로를 직접 선택해 보세요.')}
    <form id="begin-form"><label class="field-label" for="player-name">이름 <span>선택 사항</span></label><input class="name-input" id="player-name" name="name" value="${esc(nameDraft)}" maxlength="20" placeholder="이름을 적어 주세요" autocomplete="off">
    <fieldset class="avatar-fieldset"><legend>나의 모습</legend><div class="avatar-options">${[0, 1, 2, 3].map((variant) => `<button type="button" class="avatar-option ${appearance === variant ? 'selected' : ''}" data-avatar="${variant}" aria-pressed="${appearance === variant}" aria-label="모습 ${variant + 1}">${avatarMarkup({ variant, stage: 'school' })}<span>${String(variant + 1).padStart(2, '0')}</span></button>`).join('')}</div></fieldset>
    <div class="setup-summary"><span>${icon('calendar')}한 달씩 만드는 일상</span><span>${icon('people')}선택으로 깊어지는 관계</span></div>
    <button class="button primary full" type="submit">이 인생 시작하기 ${icon('arrow')}</button></form></div>`, { label: '캐릭터 생성', number: 'START' });
}
function choiceHint(choice) {
  const labels = choice.effects.filter((effect) => effect.type === 'add' && effect.path.startsWith('player.skills.')).map((effect) => `${skillNames[effect.path.split('.').at(-1)] || '경험'} ${effect.value > 0 ? '+' : ''}${effect.value}`).slice(0, 2);
  if (choice.durationMonths) labels.push(`${duration(choice.durationMonths)} 경과`);
  return labels.length ? `<span class="choice-hint">${labels.map(esc).join(' · ')}</span>` : '';
}
function eventView(event) {
  return frame(`<div class="panel-content">${heading('현재의 선택', event.title, event.body)}<div class="section-heading"><h3>어떻게 할까요?</h3><span>${event.choices.length}개의 선택</span></div><div class="choices">${event.choices.map((choice, index) => `<button class="choice" data-action="choose" data-event="${esc(event.id)}" data-choice="${esc(choice.id)}"><span class="choice-number">${index + 1}</span><span>${choice.requires?.length ? '<span class="unlocked">쌓아온 경험으로 열린 선택</span>' : ''}<span class="choice-label">${esc(choice.label)}</span>${choiceHint(choice)}</span>${icon('arrow')}</button>`).join('')}</div></div>`, { label: `${trackNames[state.activeTrack]} · 이야기` });
}
function schoolPlanPreview() {
  const effects = schoolPlanEffects(state, currentSchoolPlan());
  const labels = { ...skillNames, ...displayStats(state) };
  const changes = Object.entries({ ...effects.skills, ...effects.stats }).filter(([, delta]) => delta !== 0).map(([key, delta]) => ({ label: labels[key] ?? key, value: `${delta > 0 ? '+' : ''}${delta}`, negative: key.includes('Stress') ? delta > 0 : delta < 0 }));
  return `<div class="section-heading"><h3>이번 달 예상 변화</h3><span>현재 상태 기준</span></div>${changeTags(changes)}
    ${effects.warnings.length ? `<ul class="warnings">${effects.warnings.map((warning) => `<li>${esc(warning)}</li>`).join('')}</ul>` : ''}
    <p class="sub-note">친구와 동아리 활동을 이어가면 새로운 인연을 만나고 관계도 깊어져요.</p>`;
}
function plannerView() {
  const plan = currentSchoolPlan(), term = schoolTerm(state);
  return frame(`<div class="panel-content">${heading('나의 주간 루틴', '이번 달의 일정을 정해요', '정규 수업 이후와 주말의 대표 활동을 배치하세요. 같은 주간 루틴을 한 달 동안 반복합니다.')}
    <form id="school-plan-form"><fieldset class="planner-fieldset"><legend class="sr-only">월요일부터 일요일의 활동</legend>
      <div class="planner-presets">${schoolPresets.map((preset) => `<button class="preset" type="button" data-action="plan-preset" data-preset="${preset.id}" aria-pressed="${preset.plan.every((id, index) => id === plan[index])}">${preset.label}</button>`).join('')}</div>
      <div class="planner-days">${weekdays.map((day, index) => `<div class="planner-day ${index > 4 ? 'weekend' : ''}"><label for="school-day-${index}"><strong>${day}</strong><span>${index > 4 ? '주말' : '방과 후'}</span></label><select id="school-day-${index}" name="day-${index}" data-school-day="${index}" aria-describedby="school-day-note-${index}">${STUDENT_ACTIVITIES.map((activity) => `<option value="${esc(activity.id)}" ${activity.id === plan[index] ? 'selected' : ''}>${esc(activity.label)}</option>`).join('')}</select><p id="school-day-note-${index}" class="planner-day-note">${esc(STUDENT_ACTIVITIES.find((activity) => activity.id === plan[index]).description)}</p></div>`).join('')}</div>
    </fieldset><section id="school-plan-preview" class="plan-preview" aria-live="polite">${schoolPlanPreview()}</section>
    <div class="planner-submit"><p>활동을 수정할 때는 시간이 흐르지 않아요.<br><strong>확정하면 한 달</strong>이 지나고 결과를 확인합니다.</p><button class="button primary" type="submit">한 달 보내기 ${icon('arrow')}</button></div></form></div>`, { label: `${term.label} · ${term.monthLabel}` });
}
function changesBetween(before, after) {
  const changes = [];
  for (const [group, labels] of Object.entries({ stats: displayStats(after), skills: skillNames, values: valueNames })) {
    for (const [key, label] of Object.entries(labels)) {
      const delta = after.player[group][key] - before.player[group][key];
      if (delta) changes.push({ label, value: `${delta > 0 ? '+' : ''}${delta}`, negative: group === 'stats' && key.includes('Stress') ? delta > 0 : delta < 0 });
    }
  }
  for (const person of Object.values(after.people)) {
    const old = before.people[person.id];
    if (!old) changes.push({ label: person.name, value: '새로운 인연', negative: false });
    const delta = person.relationship - (old?.relationship ?? 0);
    if (delta) changes.push({ label: `${withPerson(person.name)}의 관계`, value: `${delta > 0 ? '+' : ''}${delta}`, negative: delta < 0 });
  }
  for (const entry of after.ledger.slice(before.ledger.length)) changes.push({ label: { salary: '급여', revenue: '매출', expense: '비용' }[entry.kind], value: `${entry.kind === 'expense' ? '−' : '+'}${format(entry.amount)}원`, negative: entry.kind === 'expense' });
  return changes;
}
function changeTags(changes) { return `<div class="changes">${changes.map((change) => `<span class="change-tag ${change.negative ? 'negative' : ''}"><span>${esc(change.label)}</span><b>${esc(change.value)}</b></span>`).join('') || '<span class="sub-note">능력치 변화 없이 남은 경험도 소중해요.</span>'}</div>`; }
function resultView() {
  const monthly = pending.kind === 'schedule';
  const event = monthly ? null : catalog.events.find((item) => item.id === pending.eventId);
  const choice = event?.choices.find((item) => item.id === pending.choiceId);
  const body = monthly ? state.schoolLife.lastReport.body : state.history.at(-1).outcome;
  const title = monthly ? state.schoolLife.lastReport.title : '선택의 결과를 확인해요';
  const routine = monthly ? [...new Set(state.schoolLife.lastPlan)].map((id) => `${STUDENT_ACTIVITIES.find((activity) => activity.id === id)?.label ?? id} ${state.schoolLife.lastPlan.filter((item) => item === id).length}일`).join(' · ') : choice?.label;
  return frame(`<div class="panel-content result-content"><div class="result-mark">${icon('check')}</div>${heading(monthly ? 'MONTH COMPLETE' : '선택 완료', title, body)}
    ${routine ? `<p class="selected-path">${esc(routine)}</p>` : ''}${changeTags(pending.changes)}
    <div class="result-actions"><span>${monthly ? '한 달의 시간이 인생에 쌓였어요.' : '이 경험은 다음 선택에도 남아요.'}</span><button class="button primary" data-action="continue">${monthly ? '다음 이야기 확인' : '계속하기'} ${icon('arrow')}</button></div></div>`, { label: monthly ? '월말 보고' : '결과', number: `TURN ${String(playedMoments()).padStart(2, '0')}` });
}
function careerSelectionView() {
  const tracks = catalog.tracks.filter((track) => track.id !== 'school' && !state.progress[track.id]);
  return frame(`<div class="panel-content">${heading('새로운 생활', '다음 진로를 선택해요', '지금까지 쌓은 실력과 관계를 가지고, 서로 다른 방식의 생활을 시작합니다.')}
    <div class="choices">${tracks.map((track, index) => `<button class="choice career-choice" data-action="career" data-track="${esc(track.id)}"><span class="choice-number">${index + 1}</span><span><span class="choice-label">${esc(track.label)}</span><span class="choice-hint">${esc(trackNotes[track.id])}</span></span>${icon('arrow')}</button>`).join('')}</div></div>`, { label: '진로 결정' });
}
function endingView() {
  const choices = state.history.filter((entry) => entry.type === 'choice').length;
  const people = Object.keys(state.people).length;
  const others = catalog.tracks.some((track) => track.id !== 'school' && !state.progress[track.id]);
  return frame(`<div class="panel-content">${heading('CHAPTER COMPLETE', '이번 생활의 기록', `${trackNames[state.activeTrack]}로 보낸 시간을 잠시 돌아봅니다. 만난 사람과 쌓은 경험은 다음 생활에도 남습니다.`)}
    <div class="ending-totals"><div><strong>${choices}</strong><span>중요한 선택</span></div><div><strong>${state.schoolLife.monthsCompleted}</strong><span>직접 보낸 달</span></div><div><strong>${people}</strong><span>만난 인연</span></div></div>
    <div class="ending-actions">${others ? `<button class="button primary" data-action="other-career">다른 생활로 이어가기 ${icon('arrow')}</button>` : ''}<button class="button secondary" data-view="records">기록 돌아보기</button></div></div>`, { label: '생활 회고' });
}
function mainFlow() {
  if (pending) return resultView();
  if (careerSelection || (state.activeTrack === 'school' && state.facts.readyForCareer)) return careerSelectionView();
  const event = availableEvents(state, catalog)[0];
  return event ? eventView(event) : canPlanSchoolMonth(state, catalog) ? plannerView() : endingView();
}
function scheduleView() {
  if (canPlanSchoolMonth(state, catalog) && !pending && !careerSelection) return plannerView();
  const currentEvent = availableEvents(state, catalog)[0];
  const message = pending ? '지난 활동의 결과를 먼저 확인해 주세요. 결과를 확인해도 시간이 더 흐르지는 않아요.'
    : currentEvent ? `지금은 “${currentEvent.title}”에서 결정할 일이 있어요.`
      : state.activeTrack === 'school' ? '학교 생활을 마치고 다음 진로를 고를 차례예요.' : '현재 직업 생활은 중요한 사건에 맞춰 진행됩니다. 학생 일정은 학생 시절에 직접 계획할 수 있어요.';
  return frame(`<div class="panel-content">${heading('일정', '지금의 이야기가 먼저예요', message)}<button class="button primary" data-action="show-home">현재 이야기 확인 ${icon('arrow')}</button>
    ${state.schoolLife.lastPlan.length ? `<section class="last-routine"><h3>마지막 주간 루틴</h3>${state.schoolLife.lastPlan.map((id, index) => `<div><b>${weekdays[index]}</b><span>${esc(STUDENT_ACTIVITIES.find((activity) => activity.id === id)?.label ?? id)}</span></div>`).join('')}</section>` : ''}</div>`, { label: '일정 관리' });
}
function relationLabel(value) { return value >= 60 ? '깊어진 신뢰' : value >= 20 ? '가까워지는 사이' : value >= 0 ? '알아가는 사이' : '갈등이 남은 사이'; }
function peopleView() {
  const people = Object.values(state.people);
  return frame(`<div class="panel-content">${heading('인연', '함께 살아가는 사람들', '같은 사람과 시간을 쌓으면 관계가 달라집니다. 각 인물의 성향과 함께 겪은 경험을 확인해 보세요.')}
    ${people.length ? `<div class="people-list">${people.map((person, index) => `<details class="person-card"><summary><span class="person-avatar">${avatarMarkup({ variant: index % 4, stage: state.activeTrack })}</span><span class="person-title"><strong>${esc(person.name)}</strong><span>${esc(person.role)}</span></span><span class="relation-score ${person.relationship < 0 ? 'negative' : ''}"><b>${person.relationship > 0 ? '+' : ''}${person.relationship}</b><small>${relationLabel(person.relationship)}</small></span><span class="details-arrow">⌄</span></summary>
      <div class="person-details"><p>${esc(person.background)}</p><p class="met-time">${age(person.metAtMonth + 180)}에 만난 인연</p><div class="trait-grid">${Object.entries(person.traits).map(([key, value]) => `<span>${esc(traitNames[key] ?? key)}<b>${value}</b></span>`).join('')}</div></div></details>`).join('')}</div>` : `<div class="empty-state">${icon('people')}<h3>아직 만난 사람이 없어요</h3><p>친구·동아리 활동을 이어가거나 이야기 속에서 누군가를 만나면 이곳에 남아요.</p><button class="button secondary" data-view="schedule">이번 달 일정 보기</button></div>`}</div>`, { label: '인연 관리', number: `${people.length}명` });
}
function upcomingMilestone() {
  if (state.activeTrack !== 'school') return null;
  const elapsed = state.progress.school.elapsedMonths;
  const education = state.facts.education;
  const applicable = catalog.events.filter((event) => event.trackId === 'school' && event.atMonth > elapsed && !state.progress.school.completedEvents.includes(event.id))
    .filter((event) => event.requires.every((condition) => !condition.path.startsWith('facts.education') || condition.value === education));
  return applicable.sort((a, b) => a.atMonth - b.atMonth)[0];
}
function careerView() {
  const term = state.activeTrack === 'school' ? schoolTerm(state) : null;
  const milestone = upcomingMilestone();
  const stageMonth = state.progress.school?.elapsedMonths ?? 0;
  const stages = [['중학교 3학년', stageMonth >= 12, stageMonth < 12], ['고등학교', stageMonth >= 48, stageMonth >= 12 && stageMonth < 48], ['진학·훈련·현장', state.facts.readyForCareer, stageMonth >= 48 && !state.facts.readyForCareer], ['직업 생활', false, state.activeTrack !== 'school']];
  const occupations = catalog.careerTree.nodes.filter((node) => node.kind === 'occupation');
  return frame(`<div class="panel-content">${heading('진로', '나의 길은 계속 이어져요', '한 번의 선택이 인생 전체를 확정하지 않습니다. 경험을 쌓고 새로운 생활로 나아갈 수 있어요.')}
    <div class="current-route"><span>현재 경로</span><strong>${esc(term?.label ?? trackNames[state.activeTrack])}</strong><p>${milestone ? `${milestone.atMonth - stageMonth}개월 뒤 · ${esc(milestone.title)}` : state.facts.readyForCareer && state.activeTrack === 'school' ? '다음 생활을 시작할 준비가 되었어요.' : '지금의 경험을 차근차근 쌓아가는 중이에요.'}</p></div>
    <ol class="career-steps">${stages.map(([label, done, active]) => `<li class="${active ? 'active' : done ? 'done' : ''}">${done ? icon('check') : '<i></i>'}<span>${label}</span></li>`).join('')}</ol>
    ${state.facts.readyForCareer && state.activeTrack === 'school' ? '<button class="button primary full" data-action="show-home">다음 진로 결정하기</button>' : ''}
    <div class="section-heading"><h3>이어질 수 있는 생활</h3><span>각자 다른 일상</span></div><div class="route-list">${occupations.map((node) => `<div class="route-item"><div><strong>${esc(node.label)}</strong><p>${node.trackId ? esc(trackNotes[node.trackId]) : '고유한 생활 방식과 사건을 준비하고 있어요.'}</p></div><span class="route-status ${node.status === 'planned' ? 'planned' : ''}">${node.status === 'planned' ? '준비 중' : state.progress[node.trackId] ? '경험한 길' : '플레이 경로'}</span></div>`).join('')}</div></div>`, { label: '진로 지도' });
}
function recordContent() {
  if (recordTab === 'skills') return `<div class="record-skills">${Object.entries(skillNames).map(([key, label]) => meter(label, state.player.skills[key])).join('')}</div><h3 class="record-subheading">중요하게 여기는 가치</h3><div class="record-skills">${Object.entries(valueNames).map(([key, label]) => meter(label, state.player.values[key])).join('')}</div>`;
  if (recordTab === 'ledger') return state.ledger.length ? `<div class="ledger-list">${[...state.ledger].reverse().map((entry) => `<div class="ledger-row"><div><span>${age(entry.atMonth + 180)} · ${{ salary: '급여', revenue: '매출', expense: '비용' }[entry.kind]}</span><p>${esc(entry.memo)}</p></div><b class="${entry.kind === 'expense' ? 'expense' : ''}">${entry.kind === 'expense' ? '−' : '+'}${format(entry.amount)}<small>원</small></b></div>`).join('')}</div>` : '<div class="empty-state"><p>아직 기록된 수입이나 비용이 없어요.</p></div>';
  return state.memories.length ? `<ol class="memory-list">${[...state.memories].reverse().map((memory) => `<li><span>${age(memory.atMonth + 180)} · ${(memory.atMonth + 180) % 12}개월</span><p>${esc(memory.text)}</p><small>${memory.tags.includes('schedule') ? '일상의 기록' : '중요한 경험'}</small></li>`).join('')}</ol>` : '<div class="empty-state"><p>첫 선택과 한 달의 경험이 이곳에 남아요.</p></div>';
}
function recordsView() {
  const tabs = { memories: '기억', skills: '성장', ledger: '금전' };
  return frame(`<div class="panel-content">${heading('기록', '쌓여가는 나의 인생', '지나온 선택과 일상은 사라지지 않아요. 지금의 나를 만든 과정을 돌아보세요.')}
    <div class="record-tabs" role="tablist" aria-label="기록 종류">${Object.entries(tabs).map(([id, label]) => `<button id="record-tab-${id}" role="tab" aria-selected="${recordTab === id}" tabindex="${recordTab === id ? '0' : '-1'}" aria-controls="record-panel" data-record-tab="${id}">${label}</button>`).join('')}</div><div id="record-panel" role="tabpanel" aria-labelledby="record-tab-${recordTab}" tabindex="0">${recordContent()}</div></div>`, { label: '인생 기록', number: `${state.memories.length}개의 기억` });
}
function render() {
  let content;
  if (!state) content = welcome();
  else content = ({ home: mainFlow, schedule: scheduleView, people: peopleView, career: careerView, records: recordsView })[activeView]();
  app.innerHTML = shell(content);
}
function showView(view) {
  if (!state || !navItems.some(([id]) => id === view)) return;
  activeView = view; save(); render(); focusStory();
}

app.addEventListener('input', (event) => { if (event.target.id === 'player-name') nameDraft = event.target.value; });
app.addEventListener('submit', (event) => {
  if (event.target.id === 'begin-form') { event.preventDefault(); begin(new FormData(event.target).get('name')?.toString() || ''); return; }
  if (event.target.id !== 'school-plan-form') return;
  event.preventDefault();
  if (busy || !state || pending || !canPlanSchoolMonth(state, catalog)) return;
  busy = true;
  try {
    const before = state, next = completeSchoolMonth(state, currentSchoolPlan(), catalog);
    pending = { kind: 'schedule', month: next.time.elapsedMonths, changes: changesBetween(before, next) };
    state = next; schoolPlan = [...state.schoolLife.lastPlan]; activeView = 'home';
    save(); render(); focusStory(); announce(state.schoolLife.lastReport.body);
  } catch { notice = '이번 달을 진행하지 못했어요. 선택한 활동을 확인하고 다시 시도해 주세요.'; render(); }
  finally { busy = false; }
});
app.addEventListener('change', (event) => {
  if (!event.target.matches('[data-school-day]') || !state || pending || !canPlanSchoolMonth(state, catalog)) return;
  const index = Number(event.target.dataset.schoolDay);
  if (!Number.isInteger(index) || index < 0 || index > 6 || !STUDENT_ACTIVITIES.some((activity) => activity.id === event.target.value)) return;
  currentSchoolPlan()[index] = event.target.value;
  document.querySelector(`#school-day-note-${index}`).textContent = STUDENT_ACTIVITIES.find((activity) => activity.id === event.target.value).description;
  document.querySelector('#school-plan-preview').innerHTML = schoolPlanPreview();
  for (const button of app.querySelectorAll('[data-preset]')) {
    const preset = schoolPresets.find((item) => item.id === button.dataset.preset);
    button.setAttribute('aria-pressed', String(preset.plan.every((id, position) => id === schoolPlan[position])));
  }
  save();
  if (storageFailed) { render(); document.querySelector(`#school-day-${index}`)?.focus({ preventScroll: true }); }
});
app.addEventListener('click', (event) => {
  const avatar = event.target.closest('[data-avatar]');
  if (avatar && !state) {
    const variant = Number(avatar.dataset.avatar);
    if (!Number.isInteger(variant) || variant < 0 || variant > 3) return;
    appearance = variant;
    render(); document.querySelector(`[data-avatar="${appearance}"]`)?.focus(); return;
  }
  const nav = event.target.closest('[data-view]');
  if (nav) { showView(nav.dataset.view); return; }
  const record = event.target.closest('[data-record-tab]');
  if (record) { recordTab = record.dataset.recordTab; render(); document.querySelector(`#record-tab-${recordTab}`)?.focus({ preventScroll: true }); return; }
  const button = event.target.closest('[data-action]');
  if (!button || busy) return;
  const action = button.dataset.action;
  if (action === 'restart') { document.querySelector('#restart-name').value = playerName; dialog.showModal(); return; }
  if (action === 'show-home') { showView('home'); return; }
  if (action === 'plan-preset' && state && !pending && canPlanSchoolMonth(state, catalog)) {
    const preset = schoolPresets.find((item) => item.id === button.dataset.preset);
    if (!preset) return;
    schoolPlan = [...preset.plan]; save(); render(); document.querySelector(`[data-preset="${preset.id}"]`)?.focus({ preventScroll: true }); announce(`${preset.label} 루틴을 채웠어요.`); return;
  }
  busy = true;
  try {
    if (action === 'choose' && state && !pending) {
      const before = state, next = choose(state, button.dataset.event, button.dataset.choice, catalog);
      pending = { kind: 'choice', eventId: button.dataset.event, choiceId: button.dataset.choice, changes: changesBetween(before, next) };
      state = next; activeView = 'home'; announce(state.history.at(-1).outcome);
    } else if (action === 'continue' && pending) { pending = null; state = nextScene(state, catalog); activeView = 'home'; announce('다음 이야기를 확인합니다.'); }
    else if (action === 'career' && state && !pending) {
      if (state.progress[button.dataset.track]) return;
      state = enterTrack(state, button.dataset.track, catalog); careerSelection = false; activeView = 'home'; announce(`${trackNames[state.activeTrack]}의 생활을 시작합니다.`);
    } else if (action === 'other-career') { careerSelection = true; activeView = 'home'; }
    save(); render(); focusStory();
  } catch { notice = '선택을 진행하지 못했어요. 현재 진행은 유지되어 있으니 다시 확인해 주세요.'; render(); }
  finally { busy = false; }
});
app.addEventListener('keydown', (event) => {
  if (!event.target.matches('[role="tab"]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const keys = ['memories', 'skills', 'ledger'], index = keys.indexOf(recordTab);
  recordTab = event.key === 'Home' ? keys[0] : event.key === 'End' ? keys.at(-1) : keys[(index + (event.key === 'ArrowRight' ? 1 : -1) + keys.length) % keys.length];
  render(); document.querySelector(`#record-tab-${recordTab}`)?.focus({ preventScroll: true });
});
document.querySelector('#cancel-restart').addEventListener('click', () => dialog.close());
document.querySelector('#confirm-restart').addEventListener('click', () => { const name = document.querySelector('#restart-name').value; dialog.close(); begin(name); });

try {
  const names = ['tracks', 'events', 'people', 'organizations', 'career-tree'];
  const entries = await Promise.all(names.map(async (name) => {
    const dataUrl = new URL(`./data/${name}.json`, import.meta.url);
    dataUrl.search = new URL(import.meta.url).search;
    const response = await fetch(dataUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`이야기 데이터: ${response.status}`);
    return [name === 'career-tree' ? 'careerTree' : name, await response.json()];
  }));
  catalog = Object.fromEntries(entries); load();
  if (state && !pending) state = nextScene(state, catalog);
  if (state) save();
  render();
} catch {
  app.innerHTML = '<main class="fatal"><p>갈림길</p><h1>게임을 불러오지 못했어요.</h1><p>연결 상태를 확인하고 다시 열어 주세요.</p><button class="button primary" id="retry">다시 불러오기</button></main>';
  document.querySelector('#retry').addEventListener('click', () => location.reload());
}
