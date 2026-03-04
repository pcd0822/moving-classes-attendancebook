/** 학년·반·번호 조합(학번)으로 학생을 구분. 동명이인 시 이름만으로는 구분 불가하므로 사용. */
export function getStudentKey(o: {
  grade?: string;
  class?: string;
  number?: string;
  name?: string;
  studentName?: string;
}): string {
  const part = [o.grade, o.class, o.number].filter(Boolean).join('|');
  return part || (o.name ?? o.studentName ?? '');
}
