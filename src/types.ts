export interface TimelineTask {
  id: string;
  label: string;
  status: 'done' | 'incomplete';
  startDate: Date;
  endDate: Date;           // same as startDate for point events
  isRange: boolean;
  tags: string[];
  note?: string;
  swimlane: string;        // L2 heading
  subSwimlane?: string;    // L3 heading (optional)
}

export interface Swimlane {
  id: string;
  label: string;
  subSwimlanes: SubSwimlane[];
  tasks: TimelineTask[];   // tasks with no sub-swimlane
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