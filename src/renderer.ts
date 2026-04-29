import { TimelineData, TimelineTask, Swimlane } from './types';

const DAY_WIDTH = 28;       // pixels per day (base zoom)
const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 48;
const LANE_LABEL_WIDTH = 200;

export class TimelineRenderer {
  private container: HTMLElement;
  private data: TimelineData;
  private zoom = 1;
  private scrollX = 0;

  constructor(container: HTMLElement, data: TimelineData) {
    this.container = container;
    this.data = data;
  }

  render() {
    this.container.empty();
    this.container.addClass('timeline-root');

    const totalDays = this.getDaySpan(this.data.minDate, this.data.maxDate) + 14;
    const totalWidth = totalDays * DAY_WIDTH * this.zoom;

    // ── Toolbar ──
    const toolbar = this.container.createDiv('timeline-toolbar');
    this.buildToolbar(toolbar);

    // ── Scroll wrapper ──
    const scrollArea = this.container.createDiv('timeline-scroll-area');

    // ── Left: Lane labels (sticky) ──
    const labelsCol = scrollArea.createDiv('timeline-labels-col');

    // ── Right: Scrollable canvas ──
    const canvas = scrollArea.createDiv('timeline-canvas');
    canvas.style.width = `${totalWidth + LANE_LABEL_WIDTH}px`;

    // Date header
    this.renderDateHeader(canvas, totalDays, totalWidth);

    // Swimlanes
    for (const sl of this.data.swimlanes) {
      this.renderSwimlane(labelsCol, canvas, sl, totalDays, totalWidth);
    }

    // ── Zoom / scroll behaviour ──
    canvas.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.zoom = Math.min(4, Math.max(0.3, this.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
        this.render();
      }
    }, { passive: false });
  }

  private buildToolbar(toolbar: HTMLElement) {
    const zoomIn = toolbar.createEl('button', { text: '＋', cls: 'timeline-btn' });
    const zoomOut = toolbar.createEl('button', { text: '－', cls: 'timeline-btn' });
    const today = toolbar.createEl('button', { text: 'Today', cls: 'timeline-btn' });
    const fitAll = toolbar.createEl('button', { text: 'Fit All', cls: 'timeline-btn' });

    zoomIn.onclick = () => { this.zoom = Math.min(4, this.zoom * 1.25); this.render(); };
    zoomOut.onclick = () => { this.zoom = Math.max(0.3, this.zoom * 0.8); this.render(); };
    today.onclick = () => this.scrollToDate(new Date());
    fitAll.onclick = () => {
      const span = this.getDaySpan(this.data.minDate, this.data.maxDate);
      const availWidth = this.container.clientWidth - LANE_LABEL_WIDTH - 40;
      this.zoom = availWidth / (span * DAY_WIDTH);
      this.render();
    };
  }

  private renderDateHeader(canvas: HTMLElement, totalDays: number, totalWidth: number) {
    const header = canvas.createDiv('timeline-date-header');
    header.style.width = `${totalWidth}px`;

    const startDate = new Date(this.data.minDate);
    startDate.setDate(startDate.getDate() - 7);

    let cursor = new Date(startDate);
    cursor.setDate(1); // snap to month start

    while (cursor <= this.data.maxDate) {
      const offset = this.getDaySpan(startDate, cursor) * DAY_WIDTH * this.zoom;
      const monthLabel = header.createDiv('timeline-month-label');
      monthLabel.style.left = `${offset}px`;
      monthLabel.setText(cursor.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));

      // Tick marks per week
      for (let w = 0; w < 5; w++) {
        const weekDate = new Date(cursor);
        weekDate.setDate(weekDate.getDate() + w * 7);
        const wOffset = this.getDaySpan(startDate, weekDate) * DAY_WIDTH * this.zoom;
        const tick = header.createDiv('timeline-week-tick');
        tick.style.left = `${wOffset}px`;
      }

      cursor.setMonth(cursor.getMonth() + 1);
    }

    // Today line
    const todayOffset = this.getDaySpan(startDate, new Date()) * DAY_WIDTH * this.zoom;
    const todayLine = canvas.createDiv('timeline-today-line');
    todayLine.style.left = `${todayOffset}px`;
    todayLine.style.height = '100%';
  }

  private renderSwimlane(
    labelsCol: HTMLElement,
    canvas: HTMLElement,
    sl: Swimlane,
    totalDays: number,
    totalWidth: number
  ) {
    const startDate = new Date(this.data.minDate);
    startDate.setDate(startDate.getDate() - 7);

    // Label
    const laneLabel = labelsCol.createDiv('timeline-lane-label timeline-lane-label--l2');
    laneLabel.setText(sl.label);

    // Row
    const row = canvas.createDiv('timeline-lane-row timeline-lane-row--l2');
    row.style.width = `${totalWidth}px`;

    // Direct tasks
    for (const task of sl.tasks) {
      this.renderTask(row, task, startDate);
    }

    // Sub-swimlanes (L3)
    for (const sub of sl.subSwimlanes) {
      const subLabel = labelsCol.createDiv('timeline-lane-label timeline-lane-label--l3');
      subLabel.setText(sub.label);

      const subRow = canvas.createDiv('timeline-lane-row timeline-lane-row--l3');
      subRow.style.width = `${totalWidth}px`;

      for (const task of sub.tasks) {
        this.renderTask(subRow, task, startDate);
      }
    }
  }

  private renderTask(row: HTMLElement, task: TimelineTask, startDate: Date) {
    const leftPx = this.getDaySpan(startDate, task.startDate) * DAY_WIDTH * this.zoom;
    const widthPx = task.isRange
      ? Math.max(8, this.getDaySpan(task.startDate, task.endDate) * DAY_WIDTH * this.zoom)
      : 10;

    const bar = row.createDiv('timeline-task');
    bar.style.left = `${leftPx}px`;
    bar.style.width = `${widthPx}px`;

    bar.classList.add(task.status === 'done' ? 'timeline-task--done' : 'timeline-task--pending');
    if (!task.isRange) bar.classList.add('timeline-task--point');
    if (task.tags.length) bar.addClass(`tag-${task.tags[0]}`);

    const label = bar.createSpan('timeline-task-label');
    label.setText(task.label);

    // Tooltip
    bar.setAttribute('aria-label',
      `${task.label} | ${task.startDate.toDateString()}${task.isRange ? ' → ' + task.endDate.toDateString() : ''}${task.note ? ' | ' + task.note : ''}`
    );
    bar.setAttribute('data-tooltip-position', 'top');

    // Click to scroll source
    bar.addEventListener('click', () => {
      // Optionally: open/highlight source line via Obsidian's editor API
      console.log(`Task clicked: ${task.label}`);
    });
  }

  private getDaySpan(from: Date, to: Date): number {
    return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  }

  private scrollToDate(date: Date) {
    const startDate = new Date(this.data.minDate);
    startDate.setDate(startDate.getDate() - 7);
    const offset = this.getDaySpan(startDate, date) * DAY_WIDTH * this.zoom;
    this.container.querySelector('.timeline-scroll-area')?.scrollTo({ left: offset - 200, behavior: 'smooth' });
  }
}