import { createGame, choose, availableEvents, enterTrack, restoreGame } from './core/engine.js';
import { nextScene } from './core/session.js';

const STORAGE_KEY = 'life-paths.web.v1';
const app = document.querySelector('#app');
const dialog = document.querySelector('#restart-dialog');
const announcer = document.querySelector('#announcer');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const format = (value) => Number(value).toLocaleString('ko-KR');
const skillNames = { math: '수학', language: '언어', science: '과학', art: '예술', business: '사업 감각', communication: '소통' };
const statNames = { health: '건강', happiness: '행복', workStress: '업무 스트레스', socialStress: '대인 스트레스' };
const valueNames = { wealth: '경제적 여유', influence: '영향력', craft: '작업의 완성도', stability: '안정', freedom: '자유' };
const trackNames = { school: '학생 시절', employee: '회사 소속 개발자', creator: '독립 창작자', owner: '작은 가게 운영자' };
const trackNotes = { employee: '동기와 선배를 만나고, 일을 배우고, 후배를 맞이하는 삶.', creator: '나만의 작품을 만들고, 공개하고, 다음 이야기를 준비하는 삶.', owner: '작은 가게를 열고, 고객과 거래처를 만나며 운영하는 삶.' };
const icon = (name, className = '') => {
  const paths = {
    branch: '<path d="M12 21V11m0 4L5 8m7 3 7-7"/><circle cx="5" cy="7" r="2"/><circle cx="19" cy="3" r="2"/>',
    arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
    reset: '<path d="M5 8a8 8 0 1 1-1 7M5 3v5H0"/>',
    book: '<path d="M12 5v15M3 4c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2Z"/>',
    leaf: '<path d="M5 20c0-9 6-15 15-16 0 10-5 16-12 14M5 20 16 9"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    check: '<path d="m5 12 4 4L20 5"/>',
  };
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.leaf}</svg>`;
};
const roadArt = `<div class="welcome-art" aria-hidden="true"><svg viewBox="0 0 640 145" fill="none" preserveAspectRatio="xMidYMax slice"><path d="M0 129c82-31 130-16 203-34 125-32 198-5 262-25 65-19 113-15 175-2v77H0Z" fill="#eef1e5"/><path d="M0 145c138-49 196-8 295-34 123-32 229-9 345-14v48Z" fill="#e4ebd8"/><path d="M348 154c1-39-13-55-38-69-25-15-11-25 8-33m22 102c17-48 40-55 68-70 25-14 33-26 20-46" stroke="#fffdf5" stroke-width="14"/><path d="M342 145c7-38-4-56-21-65m20 65c15-39 42-50 66-63" stroke="#c8d3b9" stroke-width="1" stroke-dasharray="3 6"/><path d="M142 89V44m-20 17 20-23 20 23m-33 7 13-15 13 15" stroke="#859a72" stroke-width="2" stroke-linecap="round"/><path d="M494 66V31m-15 13 15-18 15 18m-25 6 10-12 10 12" stroke="#91a27e" stroke-width="2" stroke-linecap="round"/><path d="M230 91V65m-11 9 11-15 11 15" stroke="#b0bd96" stroke-width="1.8" stroke-linecap="round"/><circle cx="553" cy="35" r="12" fill="#e7cba7"/><path d="M395 55V25m-10 9h20v11h-20z" stroke="#b69772" stroke-width="1.4" stroke-linecap="round"/><path d="M72 119h18m-9-7v14M573 105h13" stroke="#b6c5a3" stroke-width="1.4"/></svg></div>`;

let catalog;
let state = null;
let playerName = '';
let pending = null;
let careerSelection = false;
let activeTab = 'memories';
let notice = '';
let storageFailed = false;
let busy = false;

function seed() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] || 1;
}
function age(ageMonths) { return `${Math.floor(ageMonths / 12)}세`; }
function withPerson(name) {
  const last = name.charCodeAt(name.length - 1);
  return `${name}${last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 ? '과' : '와'}`;
}
function duration(months) {
  if (!months) return '지금';
  return [Math.floor(months / 12) ? `${Math.floor(months / 12)}년` : '', months % 12 ? `${months % 12}개월` : ''].filter(Boolean).join(' ');
}
function announce(text) { announcer.textContent = text; }
function save() {
  if (!state) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, name: playerName, state, pending, careerSelection }));
    storageFailed = false;
  } catch {
    storageFailed = true;
    notice = '이 브라우저에서 진행을 저장하지 못했어요. 플레이는 계속할 수 있지만, 창을 닫으면 기록을 잃을 수 있어요.';
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
    const last = state.history.at(-1);
    if (saved.pending && last?.type === 'choice' && last.eventId === saved.pending.eventId && last.choiceId === saved.pending.choiceId) {
      pending = {
        eventId: last.eventId,
        choiceId: last.choiceId,
        changes: Array.isArray(saved.pending.changes) ? saved.pending.changes.filter((item) => item && typeof item.label === 'string' && typeof item.value === 'string').slice(0, 15) : [],
      };
    }
    careerSelection = saved.careerSelection === true && state.facts.readyForCareer === true && !pending;
  } catch {
    state = null;
    pending = null;
    notice = '저장된 이야기를 불러오지 못했어요. 새 인생을 시작하면 이 브라우저에 새롭게 기록됩니다.';
  }
}
function begin(name) {
  state = createGame(catalog, { seed: seed() });
  playerName = name.trim().slice(0, 20);
  pending = null;
  careerSelection = false;
  activeTab = 'memories';
  notice = '';
  save();
  render();
  focusStory();
  announce('15세, 새로운 이야기가 시작되었습니다.');
}
function focusStory() {
  requestAnimationFrame(() => document.querySelector('.story-title')?.focus({ preventScroll: true }));
}
function panelState() { return state ?? createGame(catalog); }

function shell(content) {
  const current = panelState();
  const currentName = playerName || '나';
  const saveText = state ? storageFailed ? '저장되지 않음' : '이 브라우저에 저장됨' : '당신만의 이야기';
  return `<header class="site-header"><a href="./" class="brand" aria-label="갈림길 홈"><span class="brand-mark">${icon('branch')}</span>갈림길<span class="brand-en">LIFE, BY YOUR CHOICES</span></a><div class="header-right"><span class="save-label"><span class="save-dot" aria-hidden="true"></span>${saveText}</span>${state ? `<button class="text-button" data-action="restart">${icon('reset')}새 인생</button>` : ''}</div></header>
  <main class="page-shell"><div class="page-heading"><div><p class="eyebrow">A LIFE WAITING TO BE WRITTEN</p><h1>${state ? `${esc(currentName)}의 인생 노트` : '삶에는, 정답 대신 선택이 있어요.'}</h1><p class="heading-note">작은 선택이 쌓여, 당신만의 이야기가 됩니다.</p></div><span class="edition">Every choice, a new chapter.</span></div>
  ${notice ? `<div class="notice" role="status">${esc(notice)}</div>` : ''}
  <div class="game-layout">${sidebar(current)}<section id="story" class="story-area" aria-label="현재 이야기">${content}${journal(current)}</section>${statusPanel(current)}</div>
  <footer class="notebook-footer"><span class="footer-label">개발 중인 이야기 · 인물, 금액과 기간은 가상 예시입니다.</span><span>수입·비용은 사건별로 반영되며 정기 생활비·세금은 아직 계산하지 않습니다.</span></footer></main>`;
}
function sidebar(current) {
  const isAdult = current.activeTrack !== 'school';
  const currentPage = current.progress.school?.completedEvents.length ?? 0;
  const stages = [
    { label: '관심을 발견하는 시간', sub: '중학교 3학년', done: currentPage > 0, active: !isAdult && currentPage === 0 },
    { label: '경험으로 자라는 시간', sub: '고등학교', done: currentPage > 1, active: !isAdult && currentPage === 1 },
    { label: '나의 길을 고르는 시간', sub: '졸업, 그리고 다음 걸음', done: isAdult, active: !isAdult && currentPage >= 2 },
    { label: '세상과 만나는 시간', sub: isAdult ? trackNames[current.activeTrack] : '일, 사람, 새로운 일상', done: false, active: isAdult },
  ];
  return `<aside class="life-sidebar" aria-label="나의 인생 단계"><div class="profile-line"><div class="profile-avatar" aria-hidden="true">${esc((playerName || '나').slice(0, 1))}</div><div><p class="profile-label">${state ? '이야기의 주인공' : '첫 장의 주인공'}</p><p class="profile-name">${esc(playerName || '아직 쓰이지 않은 나')}</p></div></div><div class="age-block"><span class="age-number">${Math.floor(current.time.ageMonths / 12)}</span><span class="age-unit">세</span><p class="age-detail">${current.time.ageMonths % 12}개월 · ${state ? '지금, 이 순간' : '시작하는 순간'}</p></div><p class="track-badge">${esc(trackNames[current.activeTrack])}</p><hr class="sidebar-rule"><h2 class="side-heading">나의 발자취</h2><ol class="life-timeline">${stages.map((stage) => `<li class="${stage.active ? 'active' : stage.done ? 'done' : ''}" ${stage.active ? 'aria-current="step"' : ''}>${esc(stage.label)}<span class="timeline-sub">${esc(stage.sub)}</span></li>`).join('')}</ol><p class="sidebar-quote">어디로 향하든,<br>지나온 모든 순간은<br>당신 곁에 남아요.</p></aside>`;
}
function statusPanel(current) {
  const entries = Object.entries(current.player.values);
  const topValue = entries.reduce((best, item) => item[1] > best[1] ? item : best, entries[0]);
  const allEqual = entries.every((item) => item[1] === entries[0][1]);
  return `<aside class="right-sidebar" aria-label="지금의 나"><section class="state-panel"><div class="panel-head"><h2 class="panel-title">지금의 나</h2><span class="panel-tag">MY STATUS</span></div>${Object.entries(statNames).map(([key, label]) => `<div class="stat-row ${key.includes('Stress') ? 'stress' : ''}"><div class="stat-label"><span>${label}</span><b>${current.player.stats[key]}<span class="sr-only"> / 100</span></b></div><div class="stat-bar" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${current.player.stats[key]}"><div class="stat-fill" style="width:${current.player.stats[key]}%"></div></div></div>`).join('')}<hr class="stats-divider"><div class="cash-block"><p class="money-caption">가지고 있는 돈</p><div class="money-number">${format(current.player.money)}<small>원</small></div><p class="money-note">시작 자금과 거래 금액은<br>게임을 위한 예시값이에요.</p></div></section><section class="values-card"><p class="mini-label">내가 소중히 여기는 것</p><div class="values-line"><strong>${allEqual ? '아직 알아가는 중' : esc(valueNames[topValue[0]])}</strong>${allEqual ? '' : `<span>${topValue[1]} / 100</span>`}</div><p class="values-note">무엇이 중요한지는 살면서<br>조금씩 달라질 수 있어요.</p></section></aside>`;
}
function storyFrame(content, { title = '아직 쓰이지 않은 첫 장', number, timing = '새로운 시작', className = '' } = {}) {
  const page = number ?? String((state?.history.filter((entry) => entry.type === 'choice').length ?? 0) + 1).padStart(2, '0');
  return `<article class="story-card scene-enter ${className}"><div class="story-top"><div class="chapter-label"><span>PAGE ${page}</span>${esc(title)}</div><span class="story-timing">${esc(timing)}</span></div>${content}<div class="story-footer">${icon('leaf')}지금의 선택은, 다음 이야기의 시작이 됩니다.</div></article>`;
}
function welcome() {
  return storyFrame(`<div class="story-content"><p class="scene-kicker">열다섯, 가능성의 첫 페이지</p><h2 class="story-title" tabindex="-1">아직 정해지지 않은,<br>당신의 이야기.</h2><p class="story-body">잘하는 것도, 하고 싶은 것도 조금씩 알아가는 나이.<br>학교에서 시작해 일과 사람을 만나며, 나만의 삶을 살아보세요.</p>${roadArt}<form id="begin-form" class="welcome-form"><label class="field-label" for="player-name">이야기 속 나의 이름 <span>선택 사항</span></label><div class="form-row"><input id="player-name" name="name" maxlength="20" placeholder="이름을 적어주세요" autocomplete="off"><button type="submit" class="button primary">인생 시작하기 ${icon('arrow')}</button></div><p class="welcome-features"><span>${icon('check')}설치 없이 바로 플레이</span><span>${icon('lock')}이 브라우저에 자동 저장</span></p></form></div>`, { className: 'welcome' });
}
function currentEventView(event) {
  return storyFrame(`<div class="story-content"><p class="scene-kicker">${esc(trackNames[state.activeTrack])}의 한 장면</p><h2 class="story-title" tabindex="-1">${esc(event.title)}</h2><p class="story-body">${esc(event.body)}</p><div class="choice-heading">당신은 어떤 선택을 할까요?</div><div class="choices">${event.choices.map((choice, index) => `<button class="choice" data-action="choose" data-event="${esc(event.id)}" data-choice="${esc(choice.id)}"><span class="choice-number">${String(index + 1).padStart(2, '0')}</span><span>${choice.requires?.length ? '<span class="unlocked">지난 경험으로 열린 선택</span>' : ''}<span class="choice-label">${esc(choice.label)}</span>${choiceHint(choice)}</span><span class="choice-arrow" aria-hidden="true">↗</span></button>`).join('')}</div></div>`, { title: trackNames[state.activeTrack], timing: `${age(state.time.ageMonths)} · ${state.time.ageMonths % 12}개월` });
}
function choiceHint(choice) {
  const labels = choice.effects.filter((effect) => effect.type === 'add' && effect.path.startsWith('player.skills.')).map((effect) => `${skillNames[effect.path.split('.').at(-1)] || '경험'} ${effect.value > 0 ? '+' : ''}${effect.value}`).slice(0, 2);
  if (choice.durationMonths) labels.push(`${duration(choice.durationMonths)}의 시간`);
  return labels.length ? `<span class="choice-hint">${labels.map(esc).join(' · ')}</span>` : '';
}
function changesBetween(before, after) {
  const changes = [];
  for (const [group, labels] of Object.entries({ stats: statNames, skills: skillNames, values: valueNames })) {
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
  for (const entry of after.ledger.slice(before.ledger.length)) {
    changes.push({ label: { salary: '급여', revenue: '매출', expense: '비용' }[entry.kind], value: `${entry.kind === 'expense' ? '−' : '+'}${format(entry.amount)}원`, negative: entry.kind === 'expense' });
  }
  return changes;
}
function resultView() {
  const event = catalog.events.find((item) => item.id === pending.eventId);
  const choice = event?.choices.find((item) => item.id === pending.choiceId);
  const last = state.history.at(-1);
  const next = nextScene(state, catalog);
  const wait = next.time.elapsedMonths - state.time.elapsedMonths;
  return storyFrame(`<div class="result-content"><div class="result-seal" aria-hidden="true">✓</div><p class="scene-kicker">선택이 남긴 작은 변화</p><h2 class="story-title" tabindex="-1">이렇게, 한 걸음 자랐어요.</h2><p class="story-body">${esc(last.outcome)}</p><p class="selected-label">${esc(choice?.label || '내가 고른 길')}</p><div class="changes">${pending.changes.map((change) => `<span class="change-tag ${change.negative ? 'negative' : ''}">${esc(change.label)} ${esc(change.value)}</span>`).join('')}</div><div class="result-actions"><span class="result-note">${wait ? `${duration(wait)} 뒤, 다음 이야기가 기다려요.` : choice?.durationMonths ? `${duration(choice.durationMonths)}의 시간이 흘렀어요.` : '이 경험은 인생 노트에 남았어요.'}</span><button class="button primary" data-action="continue">다음 장으로 ${icon('arrow')}</button></div></div>`, { title: '선택의 기록', timing: `${age(state.time.ageMonths)} · ${state.time.ageMonths % 12}개월`, number: String(state.history.filter((entry) => entry.type === 'choice').length).padStart(2, '0') });
}
function careerView() {
  const tracks = catalog.tracks.filter((track) => track.id !== 'school' && !state.progress[track.id]);
  return storyFrame(`<div class="story-content"><p class="scene-kicker">새로운 일상으로 향하는 갈림길</p><h2 class="story-title" tabindex="-1">어떤 삶을 만나볼까요?</h2><p class="story-body">그동안 쌓은 경험과 인연을 가지고, 세상으로 나아갑니다. 서로 다른 생활 방식이 기다리는 세 가지 길을 준비했어요.</p><div class="choice-heading">지금, 시작해보고 싶은 일상</div><div class="choices">${tracks.map((track, index) => `<button class="choice" data-action="career" data-track="${esc(track.id)}"><span class="choice-number">${String(index + 1).padStart(2, '0')}</span><span><span class="choice-label">${esc(track.label)}</span><span class="career-description">${esc(trackNotes[track.id])}</span></span><span class="choice-arrow" aria-hidden="true">↗</span></button>`).join('')}</div></div>`, { title: '나의 다음 길', timing: age(state.time.ageMonths) });
}
function endingView() {
  const choices = state.history.filter((entry) => entry.type === 'choice');
  const people = Object.values(state.people);
  const bestSkill = Object.entries(state.player.skills).sort((a, b) => b[1] - a[1])[0];
  const otherTracks = catalog.tracks.filter((track) => track.id !== 'school' && !state.progress[track.id]);
  return storyFrame(`<div class="story-content"><div class="ending-banner"><p class="scene-kicker">끝이 아닌, 잠시의 쉼표</p><h2 class="story-title" tabindex="-1">여기까지,<br>당신이 만든 이야기.</h2><p class="story-body">${esc(trackNames[state.activeTrack])}로 살아본 한 장을 마쳤어요. ${esc(skillNames[bestSkill[0]])}의 경험이 쌓였고, ${people.length ? `${people.length}명의 인연이 곁에 남았어요.` : '앞으로 만날 인연들이 기다리고 있어요.'} 같은 시작에서도 다른 선택은 또 다른 이야기가 됩니다.</p><div class="ending-numbers"><div><div class="ending-number">${choices.length}</div><div class="ending-label">내가 내린 선택</div></div><div><div class="ending-number">${people.length}</div><div class="ending-label">만난 인연</div></div><div><div class="ending-number">${state.memories.length}</div><div class="ending-label">쌓인 기억</div></div></div><p class="story-body">아래 인생 노트에서 지나온 기억과 인연, 성장과 거래를 돌아보세요. 지금은 짧은 이야기지만, 앞으로 더 많은 진로와 사건이 이어질 예정이에요.</p><div class="ending-actions">${otherTracks.length ? `<button class="button primary" data-action="other-career">다른 일상으로 이어가기 ${icon('arrow')}</button>` : ''}<button class="button secondary" data-action="restart">새 인생 살아보기</button></div></div></div>`, { title: '이번 장의 회고', timing: age(state.time.ageMonths) });
}
function journal(current) {
  const tabs = { memories: '기억', people: '인연', skills: '성장', ledger: '금전' };
  const count = { memories: current.memories.length, people: Object.keys(current.people).length, skills: Object.keys(current.player.skills).length, ledger: current.ledger.length }[activeTab];
  return `<section class="journal" aria-label="인생 노트"><div class="journal-heading">${icon('book')}<h2>내가 쌓아가는 것들</h2><span class="journal-count">${String(count).padStart(2, '0')}</span></div><div class="journal-tabs" role="tablist" aria-label="기록 종류">${Object.entries(tabs).map(([key, label]) => `<button id="tab-${key}" class="tab" role="tab" aria-selected="${activeTab === key}" aria-controls="journal-panel" tabindex="${activeTab === key ? '0' : '-1'}" data-tab="${key}">${label}</button>`).join('')}</div><div id="journal-panel" class="journal-content" role="tabpanel" aria-labelledby="tab-${activeTab}" tabindex="0">${journalContent(current)}</div></section>`;
}
function empty(text) { return `<p class="empty-note">${icon('leaf')}${esc(text)}</p>`; }
function journalContent(current) {
  if (activeTab === 'memories') return current.memories.length ? [...current.memories].reverse().map((memory) => `<div class="memory-row"><span class="memory-age">${age(memory.atMonth + 180)}</span><span class="memory-text">${esc(memory.text)}</span></div>`).join('') : empty('첫 번째 선택이 이곳에 작은 기억으로 남을 거예요.');
  if (activeTab === 'people') return Object.keys(current.people).length ? `<div class="people-grid">${Object.values(current.people).map((person) => `<div class="person-row"><span class="person-avatar" aria-hidden="true">${esc(person.name.slice(0, 1))}</span><div class="person-info"><span class="person-name">${esc(person.name)}</span><span class="person-role">${esc(person.role)}</span></div><span class="relation">관계 ${person.relationship > 0 ? '+' : ''}${person.relationship}</span></div>`).join('')}</div>` : empty('어떤 사람들이 당신의 이야기에 찾아올까요?');
  if (activeTab === 'skills') return `<div class="skills-grid">${Object.entries(skillNames).map(([key, label]) => `<div class="skill-row"><span>${label}</span><b>${current.player.skills[key]} <span class="sr-only">/ 100</span></b></div>`).join('')}</div>`;
  return current.ledger.length ? [...current.ledger].reverse().map((entry) => `<div class="ledger-row"><div class="ledger-info"><span class="ledger-kind">${age(entry.atMonth + 180)} · ${{ salary: '급여', revenue: '매출', expense: '비용' }[entry.kind]}</span><br>${esc(entry.memo)}</div><span class="ledger-value ${entry.kind === 'expense' ? 'expense' : ''}">${entry.kind === 'expense' ? '−' : '+'}${format(entry.amount)}원</span></div>`).join('') : empty('앞으로의 수입과 비용이 이곳에 기록돼요.');
}
function render() {
  let content;
  if (!state) content = welcome();
  else if (pending) content = resultView();
  else if (careerSelection || (state.activeTrack === 'school' && state.facts.readyForCareer)) content = careerView();
  else {
    const event = availableEvents(state, catalog)[0];
    content = event ? currentEventView(event) : endingView();
  }
  app.innerHTML = shell(content);
}

app.addEventListener('submit', (event) => {
  if (event.target.id !== 'begin-form') return;
  event.preventDefault();
  begin(new FormData(event.target).get('name')?.toString() || '');
});
app.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-tab]');
  if (tab) {
    activeTab = tab.dataset.tab;
    render();
    document.querySelector(`#tab-${activeTab}`)?.focus({ preventScroll: true });
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button || busy) return;
  const action = button.dataset.action;
  if (action === 'restart') {
    document.querySelector('#restart-name').value = playerName;
    dialog.showModal();
    return;
  }
  busy = true;
  try {
    if (action === 'choose' && state && !pending) {
      const before = state;
      const next = choose(state, button.dataset.event, button.dataset.choice, catalog);
      pending = { eventId: button.dataset.event, choiceId: button.dataset.choice, changes: changesBetween(before, next) };
      state = next;
      announce(state.history.at(-1).outcome);
    } else if (action === 'continue' && pending) {
      pending = null;
      state = nextScene(state, catalog);
      announce('다음 장을 펼쳤습니다.');
    } else if (action === 'career' && state && !pending) {
      if (state.progress[button.dataset.track]) return;
      state = enterTrack(state, button.dataset.track, catalog);
      careerSelection = false;
      announce(`${trackNames[state.activeTrack]}의 이야기가 시작됩니다.`);
    } else if (action === 'other-career') {
      careerSelection = true;
    }
    save();
    render();
    focusStory();
  } catch {
    notice = '선택을 진행하지 못했어요. 현재 이야기는 그대로 남아 있으니 다시 시도해 주세요.';
    render();
  } finally { busy = false; }
});
app.addEventListener('keydown', (event) => {
  if (!event.target.matches('[role="tab"]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const keys = ['memories', 'people', 'skills', 'ledger'];
  const index = keys.indexOf(activeTab);
  activeTab = event.key === 'Home' ? keys[0] : event.key === 'End' ? keys.at(-1) : keys[(index + (event.key === 'ArrowRight' ? 1 : -1) + keys.length) % keys.length];
  render();
  document.querySelector(`#tab-${activeTab}`)?.focus({ preventScroll: true });
});
document.querySelector('#cancel-restart').addEventListener('click', () => dialog.close());
document.querySelector('#confirm-restart').addEventListener('click', () => {
  const name = document.querySelector('#restart-name').value;
  dialog.close();
  begin(name);
});

try {
  const names = ['tracks', 'events', 'people', 'organizations', 'career-tree'];
  const entries = await Promise.all(names.map(async (name) => {
    const response = await fetch(new URL(`./data/${name}.json`, import.meta.url));
    if (!response.ok) throw new Error(`이야기 데이터: ${response.status}`);
    return [name === 'career-tree' ? 'careerTree' : name, await response.json()];
  }));
  catalog = Object.fromEntries(entries);
  load();
  if (state && !pending) state = nextScene(state, catalog);
  if (state) save();
  render();
} catch {
  app.innerHTML = `<main class="fatal"><p class="eyebrow">갈림길</p><h1>노트를 펼치지 못했어요.</h1><p>이야기 데이터를 불러오지 못했습니다. 연결을 확인하고 다시 열어주세요.</p><button class="button primary" id="retry">다시 불러오기</button></main>`;
  document.querySelector('#retry').addEventListener('click', () => location.reload());
}
