import { advanceMonths, availableEvents } from '../core/engine.js';

// 예제의 조용한 기간을 건너뛴다. 생활비·월급·NPC의 자동 변화는 아직 처리하지 않는다.
export function nextScene(state, catalog) {
  const progress = state.progress[state.activeTrack];
  if (availableEvents(state, catalog).length) return state;
  const futureMonths = [...new Set(catalog.events
    .filter((event) => event.trackId === state.activeTrack && !progress.completedEvents.includes(event.id)
      && event.atMonth > progress.elapsedMonths)
    .map((event) => event.atMonth))].sort((a, b) => a - b);
  for (const month of futureMonths) {
    const next = advanceMonths(state, month - progress.elapsedMonths);
    if (availableEvents(next, catalog).length) return next;
  }
  return state;
}

export function ageLabel(state) {
  return `${Math.floor(state.time.ageMonths / 12)}세 ${state.time.ageMonths % 12}개월`;
}

export function printScene(state, event) {
  console.log(`\n[${ageLabel(state)} · ${state.activeTrack}] ${event.title}\n${event.body}`);
}

export function printSummary(state) {
  console.log(`\n── 예시 종료 · ${ageLabel(state)} ──`);
  console.log(`잔액 ${state.player.money.toLocaleString('ko-KR')}원 (가상 시작 자금·예시 거래, 세금/정기 생활비 미반영)`);
  console.log(`건강 ${state.player.stats.health} / 행복 ${state.player.stats.happiness} / 업무 스트레스 ${state.player.stats.workStress} / 대인 스트레스 ${state.player.stats.socialStress}`);
  console.log(`만난 사람: ${Object.values(state.people).map((person) => `${person.name}(관계 ${person.relationship})`).join(', ') || '없음'}`);
  console.log('거래:', state.ledger.map((entry) => `${entry.kind} ${entry.amount.toLocaleString('ko-KR')}원: ${entry.memo}`).join(' / ') || '없음');
  console.log('남은 기억:', state.memories.map((memory) => memory.text).join(' / ') || '없음');
}
