export type Course = {
  id: string;
  name: string;
  code: string;
  type: "regular" | "honors" | "ap";
  currentScore: number | null;
  targetGrade: number;
  origin?: "canvas" | "manual";
};
export type Assignment = {
  id: string;
  courseId: string;
  title: string;
  type: "assignment" | "quiz" | "exam" | "project";
  dueAt: string | null;
  pointsPossible: number;
  pointsEarned: number | null;
  groupWeight: number | null;
  submitted: boolean;
  needsGrading: boolean;
  htmlUrl: string;
  description: string;
  done: boolean;
  minutes: number;
  groupId?: string;
  groupName?: string;
  canvasId?: string;
  excused?: boolean;
  submissionTypes?: string[];
};
export type Announcement = {
  id: string;
  courseId: string;
  title: string;
  text: string;
  url: string;
  date: string;
};
export type SchoolData = {
  courses: Course[];
  tasks: Assignment[];
  announcements: Announcement[];
  synced: number;
  dailyMinutes: number;
};
export const emptySchool: SchoolData = {
  courses: [],
  tasks: [],
  announcements: [],
  synced: 0,
  dailyMinutes: 120,
};
