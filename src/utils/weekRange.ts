import { startOfWeek, addDays, format } from 'date-fns';
import { ko } from 'date-fns/locale';

const MONDAY = 1;

export function getCurrentWeekRange(): { start: Date; end: Date; labels: string[] } {
  const now = new Date();
  const start = startOfWeek(now, { weekStartsOn: MONDAY });
  const end = addDays(start, 4);
  const labels = [0, 1, 2, 3, 4].map(d => format(addDays(start, d), 'M/d (EEE)', { locale: ko }));
  return { start, end, labels };
}

export function formatWeekLabel(start: Date): string {
  const end = addDays(start, 4);
  return `${format(start, 'M월 d일')} ~ ${format(end, 'M월 d일')}`;
}

export function isToday(date: Date): boolean {
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}

export function dateToYMD(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}
