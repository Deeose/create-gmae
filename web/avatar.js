// 직접 그린 작은 도트 캐릭터. 외형은 능력치·성격·확률에 영향을 주지 않는다.
const looks = [
  { hair: '#493b39', light: '#71504a', skin: '#f2c8a7', shade: '#dba98b', shirt: '#6596bd', trim: '#dcecf2', long: false },
  { hair: '#303140', light: '#4b4b5f', skin: '#f4c6a5', shade: '#dc9d85', shirt: '#d68b63', trim: '#fff0cf', long: true },
  { hair: '#624531', light: '#8b6949', skin: '#bb8662', shade: '#966246', shirt: '#7f9b6d', trim: '#e8e8bd', long: false },
  { hair: '#70534a', light: '#9a7563', skin: '#e2b28c', shade: '#bd8d6e', shirt: '#9a8abd', trim: '#eee3f5', long: true },
];
const cache = new Map();

export function avatarMarkup({ variant = 0, stage = 'school' } = {}) {
  const index = Number.isInteger(variant) && variant >= 0 && variant < looks.length ? variant : 0;
  const job = ['school', 'employee', 'creator', 'owner'].includes(stage) ? stage : 'school';
  const key = `${index}:${job}`;
  if (cache.has(key)) return cache.get(key);
  const p = looks[index];
  const ink = '#293344';
  let pixels = '';
  const rect = (x, y, width, height, fill) => { pixels += `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`; };

  rect(9, 45, 24, 2, '#25324720');
  // 머리와 머리카락
  rect(13, 3, 14, 2, ink);
  rect(10, 5, 20, 3, ink);
  rect(8, 8, 24, p.long ? 17 : 10, ink);
  rect(10, 7, 20, 9, p.hair);
  rect(12, 5, 15, 3, p.hair);
  rect(12, 7, 9, 2, p.light);
  rect(10, 11, 3, 8, p.hair);
  rect(28, 10, 2, 9, p.hair);
  if (p.long) {
    rect(9, 17, 4, 11, p.hair);
    rect(28, 16, 3, 12, p.hair);
    rect(10, 19, 1, 5, p.light);
  }
  rect(13, 12, 14, 10, p.skin);
  rect(11, 15, 2, 4, p.shade);
  rect(27, 15, 2, 4, p.shade);
  rect(14, 21, 12, 2, p.shade);
  rect(13, 10, 4, 5, p.hair);
  rect(17, 10, 3, 3, p.hair);
  rect(20, 10, 4, 4, p.hair);
  rect(24, 10, 3, 3, p.hair);
  // 눈과 작은 표정
  rect(15, 16, 2, 3, ink);
  rect(23, 16, 2, 3, ink);
  rect(15, 16, 1, 1, '#fff6e4');
  rect(23, 16, 1, 1, '#fff6e4');
  rect(18, 20, 4, 1, '#ad7267');
  rect(13, 19, 2, 1, '#df999080');
  rect(25, 19, 2, 1, '#df999080');
  rect(17, 23, 6, 3, p.shade);
  // 옷과 팔
  const shirt = job === 'employee' ? '#e8edf4' : p.shirt;
  rect(12, 25, 16, 11, ink);
  rect(9, 27, 4, 9, ink);
  rect(28, 27, 4, 9, ink);
  rect(13, 26, 14, 9, shirt);
  rect(10, 28, 3, 7, shirt);
  rect(28, 28, 3, 7, shirt);
  rect(10, 35, 3, 3, p.skin);
  rect(28, 35, 3, 3, p.skin);
  rect(14, 26, 4, 2, p.trim);
  rect(22, 26, 4, 2, p.trim);
  rect(19, 27, 2, 7, '#ffffff35');
  // 바지와 신발
  rect(13, 36, 14, 2, ink);
  rect(13, 38, 6, 6, '#3a5269');
  rect(21, 38, 6, 6, '#3a5269');
  rect(14, 38, 2, 5, '#526b7e');
  rect(22, 38, 2, 5, '#526b7e');
  rect(11, 44, 8, 2, ink);
  rect(21, 44, 8, 2, ink);
  rect(11, 46, 8, 1, '#cbd6df');
  rect(21, 46, 8, 1, '#cbd6df');
  // 생활에 따라 달라지는 작은 소품
  if (job === 'school') {
    rect(12, 27, 2, 8, '#384c65');
    rect(26, 27, 2, 8, '#384c65');
    rect(23, 30, 2, 2, '#f1d578');
  } else if (job === 'employee') {
    rect(19, 27, 2, 8, '#587f9c');
    rect(24, 30, 3, 3, '#9ec6d0');
    rect(30, 35, 4, 2, ink);
    rect(29, 37, 7, 6, '#705744');
    rect(30, 38, 5, 1, '#9b7e56');
  } else if (job === 'creator') {
    rect(25, 33, 7, 8, '#f6e7bd');
    rect(25, 33, 1, 8, '#b88f64');
    rect(27, 35, 4, 1, '#7994a0');
    rect(27, 38, 3, 1, '#d58b69');
  } else {
    rect(16, 28, 8, 8, '#efdec1');
    rect(15, 35, 10, 5, '#efdec1');
    rect(18, 32, 4, 3, '#c6b58f');
  }
  const svg = `<svg class="pixel-avatar" viewBox="0 0 40 48" fill="none" shape-rendering="crispEdges" role="img" aria-label="나의 캐릭터">${pixels}</svg>`;
  cache.set(key, svg);
  return svg;
}
