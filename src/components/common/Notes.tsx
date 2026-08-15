import { Fragment, type ReactNode } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";

const URL_SOURCE = "https?://[^\\s<>()]+[^\\s<>().,;:!?]";
/** Capturing group so `split` keeps the URLs as their own parts. */
const URL_SPLIT = new RegExp(`(${URL_SOURCE})`, "g");
/** Separate non-global copy: `test` on a /g regex advances lastIndex. */
const URL_TEST = new RegExp(`^${URL_SOURCE}$`);

/**
 * Renders author notes with their original line breaks intact, turning bare
 * URLs into links.
 *
 * Notes are the field scenario authors use for sources and citations, so the
 * text is rendered as data — split on a URL pattern and emitted as React nodes.
 * Nothing here goes through `dangerouslySetInnerHTML`, and no markdown
 * dependency is involved.
 */
export function Notes({ text }: { text: string }): ReactNode {
  const parts = text.split(URL_SPLIT);

  return (
    <span className="notes">
      {parts.map((part, i) =>
        URL_TEST.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noreferrer noopener"
            className="underline"
            style={{ color: "var(--series-1)" }}
          >
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </span>
  );
}

export interface NoteTooltipProps {
  notes?: string | undefined;
  /** Appended below the notes, e.g. "Click to edit probabilities". */
  hint?: string;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactNode;
}

/**
 * Hover tooltip carrying a node's notes.
 *
 * Hover shows the note; clicking the same trigger opens the editor popover
 * instead, which repeats the note in a selectable, scrollable region. Splitting
 * them this way keeps a single click target from owning two overlays.
 */
export function NoteTooltip({
  notes,
  hint,
  side = "right",
  children,
}: NoteTooltipProps): ReactNode {
  if (!notes && !hint) return <>{children}</>;

  return (
    <Tooltip.Root delayDuration={280}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="overlay-panel"
          style={{ maxWidth: 340, padding: "10px 12px" }}
        >
          {notes ? (
            <div
              className="notes"
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                maxHeight: 260,
                overflow: "hidden",
              }}
            >
              {notes}
            </div>
          ) : null}
          {hint ? (
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginTop: notes ? 8 : 0,
                paddingTop: notes ? 8 : 0,
                borderTop: notes ? "1px solid var(--border)" : undefined,
              }}
            >
              {hint}
            </div>
          ) : null}
          <Tooltip.Arrow style={{ fill: "var(--surface-1)" }} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** Small "i" affordance marking that a note exists. */
export function NoteBadge(): ReactNode {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 13,
        height: 13,
        borderRadius: "50%",
        border: "1px solid var(--border)",
        background: "var(--surface-2)",
        color: "var(--text-muted)",
        fontSize: 9,
        fontWeight: 700,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      i
    </span>
  );
}
