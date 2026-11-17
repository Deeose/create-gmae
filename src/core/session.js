import { advanceMonths, availableEvents } from './engine.js';

// 조용한 기간을 다음 사건까지 넘기는 순수 함수. 웹과 CLI가 같은 규칙을 쓴다.
// 생활비·급여·NPC의 자동 변화는 아직 처리하지 않는다.
export function nextScene(state, catalog) {
  const progress = state.progress[state.activeTrack];
  // 학생의 조용한 기간도 플레이어가 월간 일정을 짜서 직접 살아간다.
  if (state.activeTrack === 'school' && !state.facts.readyForCareer) return state;
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
