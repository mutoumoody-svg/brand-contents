const crypto = require('crypto');

function normalize(text) {
  return String(text || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}
function grams(text) {
  const value = normalize(text);
  const result = new Set();
  for (let i = 0; i < value.length - 2; i++) result.add(value.slice(i, i + 3));
  return result;
}
function score(a, b) {
  const x = grams(a), y = grams(b);
  if (!x.size || !y.size) return 0;
  let common = 0;
  for (const g of x) if (y.has(g)) common++;
  return 2 * common / (x.size + y.size);
}
function inspect(text, candidates = []) {
  const matches = candidates.map(c => ({
    id: c.id, title: c.title || '', source: c.source || 'history',
    score: Math.round(score(text, c.body) * 100),
  })).filter(c => c.score >= 20).sort((a, b) => b.score - a.score).slice(0, 5);
  const highest = matches[0]?.score || 0;
  return { metric: '字符三元组重合度', highest, review: highest >= 45, matches,
    limitation: '文字重合检查不能保证叙事风格或语义不同；需要结合创作角度人工复核。' };
}
function fingerprint(text) { return crypto.createHash('sha256').update(normalize(text)).digest('hex'); }
module.exports = { normalize, score, inspect, fingerprint };
