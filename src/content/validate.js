import { pathToFileURL } from 'node:url';
import { loadCatalog } from './load.js';
import { readPath, validEffectPath } from '../core/engine.js';

// 외부 라이브러리 없이 새로 추가한 이야기의 참조 오류를 먼저 찾는다.
export function validateCatalog(catalog) {
  const errors = [];
  const check = (ok, message) => { if (!ok) errors.push(message); };
  const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!record(catalog)) return ['콘텐츠 객체가 필요합니다.'];
  for (const name of ['tracks', 'people', 'organizations', 'events']) {
    check(Array.isArray(catalog[name]) && catalog[name].every(record), `${name}: 객체 배열이 필요합니다.`);
  }
  check(Array.isArray(catalog.careerTree?.nodes) && catalog.careerTree.nodes.every(record), 'careerTree: 노드 배열이 필요합니다.');
  if (errors.length) return errors;
  const idPattern = /^[a-z][a-z0-9_-]*$/;
  function ids(items, label) {
    check(Array.isArray(items), `${label}: 배열이어야 합니다.`);
    const result = new Set();
    for (const item of Array.isArray(items) ? items : []) {
      check(idPattern.test(item?.id), `${label}: 올바르지 않은 id ${item?.id}`);
      check(!['__proto__', 'prototype', 'constructor'].includes(item?.id), `${label}: 예약된 id`);
      check(!result.has(item?.id), `${label}: 중복 id ${item?.id}`);
      result.add(item?.id);
    }
    return result;
  }
  const trackIds = ids(catalog.tracks, 'tracks');
  const personIds = ids(catalog.people, 'people');
  const orgIds = ids(catalog.organizations, 'organizations');
  ids(catalog.events, 'events');
  const nodes = catalog.careerTree?.nodes ?? [];
  const nodeIds = ids(nodes, 'careerTree');
  check(trackIds.has('school'), 'school 경로가 필요합니다.');
  for (const track of catalog.tracks ?? []) {
    check(typeof track.label === 'string' && track.label.length > 0, `${track.id}: 이름이 필요합니다.`);
    check(typeof track.initialPhase === 'string', `${track.id}: 시작 단계가 필요합니다.`);
    check(record(track.initialMetrics) && Object.values(track.initialMetrics).every(Number.isFinite), `${track.id}: 숫자 metrics가 필요합니다.`);
    check(['none', 'salary', 'project', 'business'].includes(track.incomeModel), `${track.id}: 수입 모델이 잘못되었습니다.`);
    check(track.provenance?.kind === 'fictional' && Boolean(track.provenance.note), `${track.id}: 예시값의 출처 구분이 필요합니다.`);
    if (track.organizationId) check(orgIds.has(track.organizationId), `${track.id}: 없는 조직입니다.`);
  }
  function conditions(list, where) {
    check(list === undefined || Array.isArray(list), `${where}: 조건은 배열입니다.`);
    for (const condition of Array.isArray(list) ? list : []) {
      if (!record(condition)) { check(false, `${where}: 조건 객체가 필요합니다.`); continue; }
      check(['eq', 'gte', 'lte', 'exists', 'includes'].includes(condition.op), `${where}: 알 수 없는 조건`);
      try { readPath({}, condition.path); } catch { check(false, `${where}: 조건 경로 오류`); }
      if (condition.op === 'gte' || condition.op === 'lte') check(Number.isFinite(condition.value), `${where}: 숫자 조건이 필요합니다.`);
      if (condition.op === 'exists') check(condition.value === undefined || typeof condition.value === 'boolean', `${where}: 존재 조건은 참/거짓입니다.`);
    }
  }
  for (const person of catalog.people ?? []) {
    check(Number.isFinite(person.relationship) && Math.abs(person.relationship) <= 100, `${person.id}: 관계 범위 오류`);
    check(typeof person.name === 'string' && person.name.length > 0 && record(person.traits), `${person.id}: 이름과 성향이 필요합니다.`);
    for (const value of Object.values(person.traits ?? {})) check(Number.isFinite(value) && value >= 0 && value <= 100, `${person.id}: 성향 범위 오류`);
  }
  for (const event of catalog.events ?? []) {
    check(trackIds.has(event.trackId), `${event.id}: 없는 경로`);
    check(Number.isInteger(event.atMonth) && event.atMonth >= 0, `${event.id}: 발생 월 오류`);
    check(Boolean(event.title) && Boolean(event.body), `${event.id}: 사건 설명이 필요합니다.`);
    conditions(event.requires, event.id);
    if (!Array.isArray(event.choices) || !event.choices.every(record)) { check(false, `${event.id}: 선택지 객체 배열이 필요합니다.`); continue; }
    const choices = event.choices;
    check(choices.length >= 2, `${event.id}: 선택지가 두 개 이상 필요합니다.`);
    check(choices.some((choice) => !choice.requires?.length), `${event.id}: 조건 없는 기본 선택지가 필요합니다.`);
    ids(choices, event.id);
    for (const choice of choices) {
      const where = `${event.id}/${choice.id}`;
      check(Boolean(choice.label) && Boolean(choice.outcome), `${where}: 선택과 결과 설명이 필요합니다.`);
      check(Number.isInteger(choice.durationMonths) && choice.durationMonths >= 0, `${where}: 기간 오류`);
      conditions(choice.requires, where);
      check(Array.isArray(choice.effects), `${where}: effects 배열이 필요합니다.`);
      for (const effect of Array.isArray(choice.effects) ? choice.effects : []) {
        if (!record(effect)) { check(false, `${where}: 효과 객체가 필요합니다.`); continue; }
        if (effect.type === 'set' || effect.type === 'add') {
          try { check(validEffectPath(effect.path), `${where}: 수정 경로 오류 ${effect.path}`); }
          catch { check(false, `${where}: 수정 경로 오류`); }
          const path = typeof effect.path === 'string' ? effect.path : '';
          if (effect.type === 'add' || path.startsWith('player.') || path.startsWith('people.') || path.includes('.metrics.')) {
            check(Number.isFinite(effect.value), `${where}: 능력치·관계·증가량은 숫자입니다.`);
          } else if (path.endsWith('.phase')) {
            check(effect.type === 'set' && typeof effect.value === 'string' && effect.value.length > 0, `${where}: 단계는 문자열입니다.`);
          } else {
            check(['boolean', 'string'].includes(typeof effect.value) || Number.isFinite(effect.value), `${where}: 사실 값은 참/거짓·문자열·숫자입니다.`);
          }
          if (effect.type === 'add' && path.endsWith('.phase')) check(false, `${where}: 단계에 숫자를 더할 수 없습니다.`);
          if (path.startsWith('people.')) check(personIds.has(path.split('.')[1]), `${where}: 없는 인물 관계`);
          if (path.startsWith('progress.')) check(trackIds.has(path.split('.')[1]), `${where}: 없는 진행 경로`);
        } else if (effect.type === 'meet') {
          check(personIds.has(effect.personId), `${where}: 없는 인물`);
        } else if (effect.type === 'payment') {
          check(['salary', 'revenue', 'expense'].includes(effect.kind), `${where}: 거래 종류 오류`);
          check(Number.isSafeInteger(effect.amount) && effect.amount >= 0 && Boolean(effect.memo), `${where}: 금액·거래 설명 오류`);
        } else if (effect.type === 'remember') {
          check(Boolean(effect.text) && Array.isArray(effect.tags), `${where}: 기억 설명·태그 오류`);
        } else check(false, `${where}: 알 수 없는 효과 ${effect.type}`);
      }
    }
  }
  const byNode = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    check(['interest', 'field', 'specialty', 'occupation'].includes(node.kind), `${node.id}: 진로 종류 오류`);
    check(['sample', 'planned'].includes(node.status), `${node.id}: 구현 상태 오류`);
    check(Array.isArray(node.parentIds), `${node.id}: 부모 목록이 필요합니다.`);
    for (const parent of Array.isArray(node.parentIds) ? node.parentIds : []) check(nodeIds.has(parent), `${node.id}: 없는 상위 진로`);
    if (node.trackId) check(trackIds.has(node.trackId), `${node.id}: 없는 경로 연결`);
  }
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) { check(false, `${id}: 진로 순환 참조`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    const parents = byNode.get(id)?.parentIds;
    for (const parent of Array.isArray(parents) ? parents : []) if (byNode.has(parent)) visit(parent);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of nodeIds) visit(id);
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const catalog = await loadCatalog();
    const errors = validateCatalog(catalog);
    if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
    else console.log(`데이터 검증 완료: ${catalog.tracks.length}개 경로, ${catalog.events.length}개 사건, ${catalog.careerTree.nodes.length}개 진로 노드`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
