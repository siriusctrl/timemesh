import { CheckCircle, UsersThree } from "@phosphor-icons/react";
import type { CandidateWindow } from "../protocol/planner";
import { formatInstant, slotEpochMinutes } from "../protocol/time";
import type { BaseAllocation } from "../protocol/types";

type ComparisonPanelProps = {
  base: BaseAllocation;
  candidates: CandidateWindow[];
  displayTimezone: string;
  participantLabels: Array<string | undefined>;
};

export function ComparisonPanel({ base, candidates, displayTimezone, participantLabels }: ComparisonPanelProps) {
  return (
    <aside className="comparison-panel">
      <div className="panel-heading">
        <div>
          <span>Ranked windows</span>
          <h2>Best shared time</h2>
        </div>
        <UsersThree aria-hidden="true" size={24} />
      </div>
      {candidates.length === 0 ? (
        <div className="empty-candidates">
          <p>No continuous window fits the current meeting duration.</p>
          <span>Try a shorter meeting or add more organizer availability.</span>
        </div>
      ) : (
        <ol className="candidate-list">
          {candidates.slice(0, 6).map((candidate, index) => {
            const start = slotEpochMinutes(base, candidate.startSlot);
            const end = slotEpochMinutes(base, candidate.endSlot);
            const date = formatInstant(start, displayTimezone, { weekday: "short", month: "short", day: "numeric" });
            const startTime = formatInstant(start, displayTimezone, { hour: "2-digit", minute: "2-digit", hour12: false });
            const endTime = formatInstant(end, displayTimezone, { hour: "2-digit", minute: "2-digit", hour12: false });
            const everyone = candidate.attendeeCount === candidate.participantCount;
            const attendeeNames = candidate.participantIndexes.map((participantIndex) =>
              participantLabels[participantIndex] || `Response ${participantIndex + 1}`
            );
            return (
              <li className={index === 0 ? "best-candidate" : ""} key={candidate.startSlot}>
                <div className="candidate-rank">{String(index + 1).padStart(2, "0")}</div>
                <div>
                  <strong>{date}</strong>
                  <span>{startTime} - {endTime}</span>
                  <small title={attendeeNames.join(", ")}>{attendeeNames.join(" · ")}</small>
                </div>
                <div className={everyone ? "attendance everyone" : "attendance"}>
                  {everyone ? <CheckCircle aria-hidden="true" size={15} weight="fill" /> : null}
                  {candidate.attendeeCount}/{candidate.participantCount}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
