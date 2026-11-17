// Kinds of work people offer on the workers directory.
const TRADES = [
  { key: 'plumber', label: 'Plumber', icon: '🚰' },
  { key: 'electrician', label: 'Electrician', icon: '💡' },
  { key: 'carpenter', label: 'Carpenter', icon: '🪚' },
  { key: 'painter', label: 'Painter', icon: '🎨' },
  { key: 'builder', label: 'Builder & bricklayer', icon: '🧱' },
  { key: 'roofer', label: 'Roofer', icon: '🏠' },
  { key: 'tiler', label: 'Tiler', icon: '🔲' },
  { key: 'welder', label: 'Welder & metal work', icon: '🔥' },
  { key: 'solar', label: 'Solar installer', icon: '☀️' },
  { key: 'borehole', label: 'Borehole & water tanks', icon: '💧' },
  { key: 'appliance', label: 'Appliance repair', icon: '🔧' },
  { key: 'locksmith', label: 'Locksmith & security', icon: '🔐' },
  { key: 'pest', label: 'Pest control', icon: '🐜' },
  { key: 'cleaner', label: 'Cleaner', icon: '🧽' },
  { key: 'gardener', label: 'Gardener', icon: '🌿' },
  { key: 'mover', label: 'Movers & transport', icon: '🚚' },
  { key: 'other', label: 'Other work', icon: '🛠️' },
];
const BY_KEY = Object.fromEntries(TRADES.map((t) => [t.key, t]));
const tradeOf = (key) => BY_KEY[key] || BY_KEY.other;
const isTrade = (key) => Boolean(BY_KEY[key]);

module.exports = { TRADES, tradeOf, isTrade };
