'use client';

import ar from '@/messages/ar.json';
import { scheduleExam } from '@/lib/actions/committee';

/** Converts the browser's local datetime to UTC ISO before the server action runs. */
export function ScheduleForm({ examId }: { examId: string }) {
  return (
    <form
      action={scheduleExam}
      onSubmit={(e) => {
        const f = e.currentTarget;
        const local = (f.elements.namedItem('when') as HTMLInputElement).value;
        (f.elements.namedItem('scheduledIso') as HTMLInputElement).value = local
          ? new Date(local).toISOString()
          : '';
      }}
      className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
    >
      <input type="hidden" name="examId" value={examId} />
      <input type="hidden" name="scheduledIso" />
      <div>
        <label className="field-label" htmlFor={`when-${examId}`}>{ar.committee.when}</label>
        <input id={`when-${examId}`} name="when" type="datetime-local" required className="field-input" />
      </div>
      <div>
        <label className="field-label" htmlFor={`link-${examId}`}>{ar.committee.meetingUrl}</label>
        <input id={`link-${examId}`} name="meetingUrl" type="url" dir="ltr" placeholder="https://meet.google.com/…" className="field-input" />
      </div>
      <button type="submit" className="btn-primary">{ar.committee.schedule}</button>
    </form>
  );
}
