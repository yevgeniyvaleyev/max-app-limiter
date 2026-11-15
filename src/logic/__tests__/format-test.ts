import { formatClock, formatDuration, parseMinutes } from '../format';

const MIN = 60_000;

describe('formatDuration', () => {
  it('rounds remaining time up and used time down', () => {
    expect(formatDuration(1)).toBe('1 min');
    expect(formatDuration(20 * MIN)).toBe('20 min');
    expect(formatDuration(20 * MIN - 1, 'down')).toBe('19 min');
    expect(formatDuration(-5)).toBe('0 min');
  });
  it('uses hours', () => {
    expect(formatDuration(60 * MIN)).toBe('1 h');
    expect(formatDuration(80 * MIN)).toBe('1 h 20 min');
  });
});

describe('formatClock', () => {
  it('pads and wraps', () => {
    expect(formatClock(7 * 60 + 5)).toBe('07:05');
    expect(formatClock(1440)).toBe('00:00');
    expect(formatClock(-15)).toBe('23:45');
  });
});

describe('parseMinutes', () => {
  it('reads digits only and clamps', () => {
    expect(parseMinutes('20')).toBe(20);
    expect(parseMinutes('2 0x')).toBe(20);
    expect(parseMinutes('')).toBe(0);
    expect(parseMinutes('99999')).toBe(1440);
  });
});
