import { TimelineTask, TimelineData, Swimlane, TaskStatus } from './types';

// ─── Local date construction (avoids UTC shift bug) ───────────────────────────

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// ─── Absolute date parsing ────────────────────────────────────────────────────

interface ParsedDate {
  start: Date;
  end: Date;
  isRange: boolean;
}

function parseAbsoluteDate(raw: string): ParsedDate | null {
  raw = raw.trim();

  // Range: 2026-05-01 to 2026-05-15
  const rangeMatch = raw.match(/^(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})$/);
  if (rangeMatch) {
    return {
      start: parseLocalDate(rangeMatch[1]),
      end: parseLocalDate(rangeMatch[2]),
      isRange: true,
    };
  }

  // Start + relative duration: 2026-04-20 + 2w or 2026-04-20 + 5d
  const relMatch = raw.match(/^(\d{4}-\d{2}-\d{2})\s*\+\s*(\d+)([dw])$/);
  if (relMatch) {
    const start = parseLocalDate(relMatch[1]);
    const amount = parseInt(relMatch[2]);
    const unit = relMatch[3];
    const end = addDays(start, unit === 'w' ? amount * 7 : amount);
    return { start, end, isRange: true };
  }

  // Specific day: 2026-05-10
  const dayMatch = raw.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dayMatch) {
    const d = parseLocalDate(dayMatch[1]);
    return { start: d, end: d, isRange: false };
  }

  // Month/Year numeric: 2026-05
  const monthYearMatch = raw.match(/^(\d{4})-(\d{2})$/);
  if (monthYearMatch) {
    const year = parseInt(monthYearMatch[1]);
    const month = parseInt(monthYearMatch[2]) - 1;
    return {
      start: new Date(year, month, 1),
      end: new Date(year, month + 1, 0),
      isRange: true,
    };
  }

  // Month/Year textual: May 2026
  const monthNames = ['january','february','march','april','may','june',
                      'july','august','september','october','november','december'];
  const textMonthMatch = raw.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (textMonthMatch) {
    const monthIdx = monthNames.indexOf(textMonthMatch[1].toLowerCase());
    if (monthIdx !== -1) {
      const year = parseInt(textMonthMatch[2]);
      return {
        start: new Date(year, monthIdx, 1),
        end: new Date(year, monthIdx + 1, 0),
        isRange: true,
      };
    }
  }

  return null;
}

// ─── Dependency date syntax ───────────────────────────────────────────────────

interface DependencyRef {
  refId: string;
  offsetDays: number;   // days added to refTask.endDate to get this task's start
  durationDays?: number; // if present, task has this duration; else point event
}

function parseDependencyDate(raw: string): DependencyRef | null {
  raw = raw.trim();

  // after E1 + 3d for 2w
  const fullMatch = raw.match(
    /^after\s+(\w+)\s*\+\s*(\d+)([dw])\s+for\s+(\d+)([dw])$/i
  );
  if (fullMatch) {
    const offset = parseInt(fullMatch[2]);
    const offsetUnit = fullMatch[3];
    const dur = parseInt(fullMatch[4]);
    const durUnit = fullMatch[5];
    return {
      refId: fullMatch[1],
      offsetDays: offsetUnit === 'w' ? offset * 7 : offset,
      durationDays: durUnit === 'w' ? dur * 7 : dur,
    };
  }

  // after E1 + 3d  (offset only, point event)
  const offsetOnly = raw.match(/^after\s+(\w+)\s*\+\s*(\d+)([dw])$/i);
  if (offsetOnly) {
    const amount = parseInt(offsetOnly[2]);
    const unit = offsetOnly[3];
    return {
      refId: offsetOnly[1],
      offsetDays: unit === 'w' ? amount * 7 : amount,
    };
  }

  // after E1 for 3d  (no offset, with duration)
  const forOnly = raw.match(/^after\s+(\w+)\s+for\s+(\d+)([dw])$/i);
  if (forOnly) {
    const dur = parseInt(forOnly[2]);
    const durUnit = forOnly[3];
    return {
      refId: forOnly[1],
      offsetDays: 1, // starts the day after ref ends
      durationDays: durUnit === 'w' ? dur * 7 : dur,
    };
  }

  // after E1  (starts day after, point event)
  const bareAfter = raw.match(/^after\s+(\w+)$/i);
  if (bareAfter) {
    return { refId: bareAfter[1], offsetDays: 1 };
  }

  return null;
}

// ─── Topological sort ─────────────────────────────────────────────────────────

// Returns task IDs in resolution order, or throws on circular dependency.
function topoSort(
  depMap: Map<string, string> // taskId → refId it depends on
): string[] {
  const visited = new Set<string>();
  const sorted: string[] = [];
  const inStack = new Set<string>();

  function visit(id: string, chain: string[]) {
    if (inStack.has(id)) {
      const cycle = [...chain, id].join(' → ');
      throw new Error(`Circular dependency detected: ${cycle}`);
    }
    if (visited.has(id)) return;
    inStack.add(id);
    const dep = depMap.get(id);
    if (dep) visit(dep, [...chain, id]);
    inStack.delete(id);
    visited.add(id);
    sorted.push(id);
  }

  for (const id of depMap.keys()) visit(id, []);
  return sorted;
}

// ─── Table parsing helpers ────────────────────────────────────────────────────

function parseTableHeader(headerRow: string): Map<string, number> {
  const colIndex = new Map<string, number>();
  const cells = headerRow.split('|').map(c => c.trim().toLowerCase()).filter(Boolean);

  const aliases: Record<string, string> = {
    task: 'task', name: 'task', label: 'task',
    date: 'date', dates: 'date', when: 'date',
    id: 'id',
    status: 'status', done: 'status',
    tags: 'tags', tag: 'tags',
    notes: 'notes', note: 'notes',
  };

  cells.forEach((cell, i) => {
    const canonical = aliases[cell];
    if (canonical && !colIndex.has(canonical)) {
      colIndex.set(canonical, i);
    }
  });

  return colIndex;
}

function parseStatus(raw: string): TaskStatus {
  const s = raw.trim().toLowerCase();
  if (s === 'done' || s === 'x') return 'done';
  if (s === 'in progress' || s === 'in-progress' || s === 'wip') return 'in-progress';
  if (s === 'blocked') return 'blocked';
  return 'pending';
}

function parseTags(raw: string): string[] {
  if (!raw.trim()) return [];
  // Accept #tag1 #tag2 or tag1, tag2
  const hashTags = raw.match(/#(\w+)/g);
  if (hashTags) return hashTags.map(t => t.slice(1));
  return raw.split(',').map(t => t.trim()).filter(Boolean);
}

function getCell(cells: string[], index: number | undefined): string {
  if (index === undefined || index >= cells.length) return '';
  return cells[index].trim();
}

// ─── Intermediate task (before dependency resolution) ────────────────────────

interface RawTask {
  id?: string;
  label: string;
  status: TaskStatus;
  tags: string[];
  note?: string;
  swimlane: string;
  subSwimlane?: string;
  // exactly one of these will be set:
  absoluteDate?: ParsedDate;
  dependencyRef?: DependencyRef;
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseMarkdown(content: string): TimelineData {
  const lines = content.split('\n');
  const rawTasks: RawTask[] = [];

  let currentSwimlane: string | null = null;
  let currentSubSwimlane: string | null = null;
  let colIndex: Map<string, number> | null = null;
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // L2 heading → new swimlane
    if (line.startsWith('## ')) {
      currentSwimlane = line.slice(3).trim();
      currentSubSwimlane = null;
      colIndex = null;
      inTable = false;
      continue;
    }

    // L3 heading → sub-swimlane
    if (line.startsWith('### ')) {
      currentSubSwimlane = line.slice(4).trim();
      colIndex = null;
      inTable = false;
      continue;
    }

    if (!currentSwimlane) continue;

    // Table header row
    if (line.startsWith('|') && !inTable) {
      // Peek ahead — next non-empty line should be the separator |---|
      const nextLine = lines[i + 1]?.trim() ?? '';
      if (nextLine.match(/^\|[-| :]+\|$/)) {
        colIndex = parseTableHeader(line);
        inTable = true;
        i++; // skip separator row
        continue;
      }
    }

    // Table data row
    if (inTable && line.startsWith('|')) {
      if (!colIndex) continue;

      const cells = line.split('|').map(c => c.trim()).filter((_, idx) => {
        // split('|') gives empty strings at start/end — skip them
        return true;
      });
      // Remove first and last empty entries from leading/trailing pipes
      const trimmed = line.split('|').slice(1, -1).map(c => c.trim());

      const label = getCell(trimmed, colIndex.get('task'));
      const dateRaw = getCell(trimmed, colIndex.get('date'));

      if (!label || !dateRaw) continue;

      const id = getCell(trimmed, colIndex.get('id')) || undefined;
      const status = parseStatus(getCell(trimmed, colIndex.get('status')));
      const tags = parseTags(getCell(trimmed, colIndex.get('tags')));
      const note = getCell(trimmed, colIndex.get('notes')) || undefined;

      const depRef = parseDependencyDate(dateRaw);
      const absDate = depRef ? undefined : parseAbsoluteDate(dateRaw);

      if (!depRef && !absDate) continue; // unparseable date — skip row

      rawTasks.push({
        id,
        label,
        status,
        tags,
        note,
        swimlane: currentSwimlane,
        subSwimlane: currentSubSwimlane ?? undefined,
        absoluteDate: absDate,
        dependencyRef: depRef ?? undefined,
      });

      continue;
    }

    // Any non-table line ends the current table
    if (inTable && !line.startsWith('|')) {
      inTable = false;
      colIndex = null;
    }
  }

  // ── Two-pass dependency resolution ─────────────────────────────────────────

  // Pass 1: collect all tasks with absolute dates into an id→endDate map
  const resolvedEnd = new Map<string, Date>();
  for (const task of rawTasks) {
    if (task.id && task.absoluteDate) {
      resolvedEnd.set(task.id, task.absoluteDate.end);
    }
  }

  // Build dependency map for topo sort: taskId → refId
  const depMap = new Map<string, string>();
  for (const task of rawTasks) {
    if (task.id && task.dependencyRef) {
      depMap.set(task.id, task.dependencyRef.refId);
    }
  }

  // Topo-sort dependent tasks and resolve them in order
  let sortedDepIds: string[] = [];
  let circularError: string | null = null;
  try {
    sortedDepIds = topoSort(depMap);
  } catch (e) {
    circularError = (e as Error).message;
  }

  // Pass 2: resolve dependency dates in topo order
  if (!circularError) {
    // Also include tasks without IDs in resolution (they just can't be referenced)
    const taskById = new Map<string, RawTask>();
    for (const task of rawTasks) {
      if (task.id) taskById.set(task.id, task);
    }

    for (const id of sortedDepIds) {
      const task = taskById.get(id);
      if (!task?.dependencyRef) continue;

      const { refId, offsetDays, durationDays } = task.dependencyRef;
      const refEnd = resolvedEnd.get(refId);

      if (!refEnd) {
        // Reference not found — mark task with error
        task.dependencyRef = { ...task.dependencyRef };
        (task as any).unresolvedRef = refId;
        // Fallback: render as today so it still appears
        const today = new Date();
        task.absoluteDate = { start: today, end: today, isRange: false };
      } else {
        const start = addDays(refEnd, offsetDays);
        const end = durationDays ? addDays(start, durationDays) : start;
        task.absoluteDate = { start, end, isRange: durationDays !== undefined };
        if (task.id) resolvedEnd.set(task.id, end);
      }
    }

    // Tasks with dependency refs but no ID — resolve them sequentially
    for (const task of rawTasks) {
      if (task.dependencyRef && !task.id) {
        const { refId, offsetDays, durationDays } = task.dependencyRef;
        const refEnd = resolvedEnd.get(refId);
        if (refEnd) {
          const start = addDays(refEnd, offsetDays);
          const end = durationDays ? addDays(start, durationDays) : start;
          task.absoluteDate = { start, end, isRange: durationDays !== undefined };
        } else {
          (task as any).unresolvedRef = refId;
          const today = new Date();
          task.absoluteDate = { start: today, end: today, isRange: false };
        }
      }
    }
  }

  // ── Build swimlane structure ────────────────────────────────────────────────

  const swimlanesMap = new Map<string, Swimlane>();

  for (const raw of rawTasks) {
    if (!raw.absoluteDate) continue; // shouldn't happen after resolution

    const task: TimelineTask = {
      id: raw.id,
      label: raw.label,
      status: raw.status,
      startDate: raw.absoluteDate.start,
      endDate: raw.absoluteDate.end,
      isRange: raw.absoluteDate.isRange,
      tags: raw.tags,
      note: raw.note,
      swimlane: raw.swimlane,
      subSwimlane: raw.subSwimlane,
      unresolvedRef: (raw as any).unresolvedRef,
    };

    if (!swimlanesMap.has(raw.swimlane)) {
      swimlanesMap.set(raw.swimlane, {
        id: raw.swimlane,
        label: raw.swimlane,
        subSwimlanes: [],
        tasks: [],
      });
    }

    const sl = swimlanesMap.get(raw.swimlane)!;

    if (raw.subSwimlane) {
      let sub = sl.subSwimlanes.find(s => s.id === raw.subSwimlane);
      if (!sub) {
        sub = { id: raw.subSwimlane!, label: raw.subSwimlane!, tasks: [] };
        sl.subSwimlanes.push(sub);
      }
      sub.tasks.push(task);
    } else {
      sl.tasks.push(task);
    }
  }

  // ── Date bounds ─────────────────────────────────────────────────────────────

  const allTasks = [...swimlanesMap.values()].flatMap(sl => [
    ...sl.tasks,
    ...sl.subSwimlanes.flatMap(sub => sub.tasks),
  ]);

  if (allTasks.length === 0) {
    const today = new Date();
    return { swimlanes: [], minDate: today, maxDate: today };
  }

  const dates = allTasks.flatMap(t => [t.startDate, t.endDate]);
  const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

  return { swimlanes: [...swimlanesMap.values()], minDate, maxDate };
}