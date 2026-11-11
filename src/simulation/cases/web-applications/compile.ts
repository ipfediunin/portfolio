import { CaseScript, type CaseRun } from "../case-script";
import { webApplicationsGraph } from "./graph";
import type { BookingOutcome } from "./model";

export type WebApplicationsCaption =
  | "clientCheck"
  | "clientSaved"
  | "request"
  | "serverValidate"
  | "serverInvalid"
  | "logic"
  | "conflict"
  | "transaction"
  | "created";

type Next = { readonly startAt: number; readonly sequence: number };
type Script = CaseScript<WebApplicationsCaption>;

const back = (
  s: Script,
  links: readonly string[],
  tone: "success" | "failed" | "retry",
) => {
  for (const link of links)
    s.hop(link, { kind: "response", tone, reverse: true });
};

/** The browser caught the errors: nothing leaves it. */
export function compileClientRejection(
  fields: number,
  next: Next,
): CaseRun<WebApplicationsCaption> {
  const s = new CaseScript<WebApplicationsCaption>(
    webApplicationsGraph,
    "wa-client",
    next,
  );
  s.caption("clientCheck", { fields })
    .work("wa.browser", "validate(form)", [0.2, 0.6])
    .status(
      "wa.browser",
      "retry",
      `Fix ${fields} field${fields === 1 ? "" : "s"}`,
    )
    .caption("clientSaved");
  return s.build();
}

/** The request went to the server: validation, the business rule, the transaction, the answer. */
export function compileSubmission(
  outcome: BookingOutcome,
  next: Next,
): CaseRun<WebApplicationsCaption> {
  const s = new CaseScript<WebApplicationsCaption>(
    webApplicationsGraph,
    "wa-submit",
    next,
  );
  s.caption("request")
    .hop("wa.l.browser-next")
    .work("wa.next", "submitBooking(form)", [1, 3])
    .hop("wa.l.next-api")
    .work("wa.api", "POST /bookings · validate", [1, 4])
    .caption("serverValidate");

  if (outcome.status === 422) {
    s.status("wa.api", "failed", "422 Unprocessable");
    back(s, ["wa.l.next-api", "wa.l.browser-next"], "failed");
    s.status("wa.browser", "failed", "422 · show errors").caption(
      "serverInvalid",
    );
    return s.build();
  }

  s.hop("wa.l.api-domain")
    .work("wa.domain", "is slot free?", [1, 3])
    .caption("logic");
  if (outcome.status === 409) {
    s.status("wa.domain", "failed", "Slot taken");
    back(s, ["wa.l.api-domain", "wa.l.next-api", "wa.l.browser-next"], "retry");
    s.status("wa.browser", "retry", "409 Conflict").caption("conflict");
    return s.build();
  }

  s.hop("wa.l.domain-db")
    .work("wa.db", "BEGIN · INSERT booking · COMMIT", [3, 8])
    .status("wa.db", "success", "COMMIT")
    .caption("transaction");
  back(
    s,
    ["wa.l.domain-db", "wa.l.api-domain", "wa.l.next-api", "wa.l.browser-next"],
    "success",
  );
  s.status("wa.browser", "success", "201 Created").caption("created", {
    ms: s.reportedMs,
  });
  return s.build();
}
