import { TimelineTask, TimelineData, Swimlane, SubSwimlane } from './types';

// ─── Date Parsing ────────────────────────────────────────────────────────────

function parseDate(raw: string, refDate?: Date): { start: Date; end: Date; isRange: boolean } | null {
  raw = raw.trim();

  // Range: [2024-05-01 to 2024-05-15]
  const rangeMatch = raw.match(/^(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})$/);
  if (rangeMatch) {
    return {
      start: new Date(rangeMatch[1]),
      end: new Date(rangeMatch[2]),
      isRange: true,
    };
  }

  // Specific day: [2024-05-10]
  const dayMatch = raw.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dayMatch) {
    const d = new Date(dayMatch[1]);
    return { start: d, end: d, isRange: false };
  }

  // Month/Year numeric: [2024-05]
  const monthYearMatch = raw.match(/^(\d{4})-(\d{2})$/);
  if (monthYearMatch) {
    const start = new Date(parseInt(monthYearMatch[1]), parseInt(monthYearMatch[2]) - 1, 1);
    const end = new Date(parseInt(monthYearMatch[1]), parseInt(monthYearMatch[2]), 0); // last day
    return { start, end, isRange: true };
  }

  // Month/Year textual: [May 2024]
  const monthNames = ['january','february','march','april','may','june',
                      'july','august','september','october','november','december'];
  const textMonthMatch = raw.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (textMonthMatch) {
    const monthIdx = monthNames.indexOf(textMonthMatch[1].toLowerCase());
    if (monthIdx !== -1) {
      const year = parseInt(textMonthMatch[2]);
      const start = new Date(year, monthIdx, 1);
      const end = new Date(year, monthIdx + 1, 0);
      return { start, end, isRange: true };
    }
  }

  // Relative duration: [+3d] or [1w] — requires a refDate
  if (refDate) {
    const relMatch = raw.match(/^\+?(\d+)([dw])$/);
    if (relMatch) {
      const amount = parseInt(relMatch[1]);
      const unit = relMatch[2];
      const end = new Date(refDate);
      end.setDate(end.getDate() + (unit === 'w' ? amount * 7 : amount));
      return { start: new Date(refDate), end, isRange: true };
    }
  }

  return null;
}

// ─── Task Line Parser ─────────────────────────────────────────────────────────

function parseTaskLine(line: string, swimlane: string, subSwimlane?: string): TimelineTask | null {
  // Match: - [x] or - [ ] then content
  const taskMatch = line.match(/^- \[([x ])\] (.+)$/);
  if (!taskMatch) return null;

  const status = taskMatch[1] === 'x' ? 'done' : 'incomplete';
  let content = taskMatch[2];

  // Extract date/range [...]
  const dateMatch = content.match(/\[([^\]]+)\]/);
  if (!dateMatch) return null;

  const dateStr = dateMatch[1];
  const parsed = parseDate(dateStr);
  if (!parsed) return null;

  // Remove date from content
  content = content.replace(dateMatch[0], '').trim();

  // Extract tags #tag
  const tags: string[] = [];
  content = content.replace(/#(\w+)/g, (_, tag) => {
    tags.push(tag);
    return '';
  }).trim();

  // Extract note in parentheses (note text)
  let note: string | undefined;
  const noteMatch = content.match(/\(([^)]+)\)/);
  if (noteMatch) {
    note = noteMatch[1];
    content = content.replace(noteMatch[0], '').trim();
  }

  return {
    id: `${swimlane}-${subSwimlane ?? ''}-${content}-${dateStr}`,
    label: content,
    status,
    startDate: parsed.start,
    endDate: parsed.end,
    isRange: parsed.isRange,
    tags,
    note,
    swimlane,
    subSwimlane,
  };
}

// ─── Main Parser ──────────────────────────────────────────────────────────────

export function parseMarkdown(content: string): TimelineData {
  const lines = content.split('\n');
  const swimlanesMap = new Map<string, Swimlane>();

  let currentSwimlane: string | null = null;
  let currentSubSwimlane: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('## ')) {
      currentSwimlane = trimmed.slice(3).trim();
      currentSubSwimlane = null;
      if (!swimlanesMap.has(currentSwimlane)) {
        swimlanesMap.set(currentSwimlane, {
          id: currentSwimlane,
          label: currentSwimlane,
          subSwimlanes: [],
          tasks: [],
        });
      }
      continue;
    }

    if (trimmed.startsWith('### ') && currentSwimlane) {
      currentSubSwimlane = trimmed.slice(4).trim();
      const sl = swimlanesMap.get(currentSwimlane)!;
      if (!sl.subSwimlanes.find(s => s.id === currentSubSwimlane)) {
        sl.subSwimlanes.push({ id: currentSubSwimlane!, label: currentSubSwimlane!, tasks: [] });
      }
      continue;
    }

    if (trimmed.startsWith('- [') && currentSwimlane) {
      const task = parseTaskLine(trimmed, currentSwimlane, currentSubSwimlane ?? undefined);
      if (!task) continue;

      const sl = swimlanesMap.get(currentSwimlane)!;
      if (currentSubSwimlane) {
        const sub = sl.subSwimlanes.find(s => s.id === currentSubSwimlane);
        sub?.tasks.push(task);
      } else {
        sl.tasks.push(task);
      }
    }
  }

  const allTasks = [...swimlanesMap.values()].flatMap(sl => [
    ...sl.tasks,
    ...sl.subSwimlanes.flatMap(sub => sub.tasks),
  ]);

  const dates = allTasks.flatMap(t => [t.startDate, t.endDate]);
  const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

  return {
    swimlanes: [...swimlanesMap.values()],
    minDate,
    maxDate,
  };
}