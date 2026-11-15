export function currentDate(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function shiftDate(value, days) {
  const date = new Date(value + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10);
}
export const daysBetween = (from, to) => (Date.parse(to) - Date.parse(from)) / 86400000;
export function weekRange(date = currentDate()) {
  const day = new Date(date + 'T12:00:00Z').getUTCDay();
  const start = shiftDate(date, -(day + 6) % 7);
  return { start, end: shiftDate(start, 6) };
}
export function monthDays(month) {
  const first = month + '-01', day = new Date(first + 'T12:00:00Z').getUTCDay();
  const start = shiftDate(first, -(day + 6) % 7);
  return Array.from({ length: 42 }, (_, index) => shiftDate(start, index));
}
export function shiftMonth(month, direction) {
  const date = new Date(month + '-01T12:00:00Z'); date.setUTCMonth(date.getUTCMonth() + direction); return date.toISOString().slice(0, 7);
}
export function monthRange(date = currentDate()) {
  const month = date.slice(0, 7);
  return { start: month + '-01', end: shiftDate(shiftMonth(month, 1) + '-01', -1) };
}

const solarFestivals = { '01-01': '元旦', '05-01': '劳动节', '10-01': '国庆节' };
// Checked against the Hong Kong Observatory Gregorian-Lunar conversion tables.
const datedFestivals = {
  '2026-01-26': '腊八节', '2026-02-16': '除夕', '2026-02-17': '春节', '2026-03-03': '元宵节', '2026-04-05': '清明节',
  '2026-06-19': '端午节', '2026-08-19': '七夕', '2026-09-25': '中秋节', '2026-10-18': '重阳节',
  '2027-01-15': '腊八节', '2027-02-05': '除夕', '2027-02-06': '春节', '2027-02-20': '元宵节', '2027-04-05': '清明节',
  '2027-06-09': '端午节', '2027-08-08': '七夕', '2027-09-15': '中秋节', '2027-10-08': '重阳节'
};

// Annual holiday and make-up workday notices from the State Council General Office.
// 2026: 国办发明电〔2025〕7号; 2027: 国办发明电〔2026〕10号.
const publicHolidays = [
  ['2026-01-01', '2026-01-03', '元旦'], ['2026-02-15', '2026-02-23', '春节'], ['2026-04-04', '2026-04-06', '清明节'],
  ['2026-05-01', '2026-05-05', '劳动节'], ['2026-06-19', '2026-06-21', '端午节'], ['2026-09-25', '2026-09-27', '中秋节'], ['2026-10-01', '2026-10-07', '国庆节'],
  ['2027-01-01', '2027-01-03', '元旦'], ['2027-02-05', '2027-02-13', '春节'], ['2027-04-03', '2027-04-05', '清明节'],
  ['2027-05-01', '2027-05-05', '劳动节'], ['2027-06-09', '2027-06-09', '端午节'], ['2027-09-15', '2027-09-15', '中秋节'], ['2027-10-01', '2027-10-07', '国庆节']
];
const makeUpWorkdays = new Set(['2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10',
  '2027-01-31', '2027-02-14', '2027-05-08', '2027-09-26', '2027-10-09']);
export function chinaCalendarDay(date) {
  if (!validDate(date)) return {};
  const festival = solarFestivals[date.slice(5)] || datedFestivals[date] || '';
  const holiday = publicHolidays.find(([start, end]) => start <= date && date <= end)?.[2];
  return { festival, holiday, workday: makeUpWorkdays.has(date) };
}
