export type TaskStatus = 'pending' | 'done' | 'in-progress' | 'blocked';

export interface TimelineTask {
  id?: string;
  label: string;
  status: TaskStatus;
  startDate: Date;
  endDate: Date;
  isRange: boolean;
  tags: string[];
  note?: string;
  swimlane: string;
  subSwimlane?: string;
  unresolvedRef?: string; // set if a dependency ref couldn't be resolved
}

export interface Swimlane {
  id: string;
  label: string;
  subSwimlanes: SubSwimlane[];
  tasks: TimelineTask[];
}

export interface SubSwimlane {
  id: string;
  label: string;
  tasks: TimelineTask[];
}

export interface TimelineData {
  swimlanes: Swimlane[];
  minDate: Date;
  maxDate: Date;
}