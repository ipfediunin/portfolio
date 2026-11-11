/**
 * The privacy notice, built from what this deployment actually does: the contact form section
 * appears only when the form is configured, the analytics section only when analytics is. It names
 * no operator, address or provider that is not configured. It is a plain-language notice, not
 * legal advice: before launch it should be checked against the owner's jurisdiction.
 */

export const PRIVACY_UPDATED = "2026-11-05";

export interface PrivacySection {
  readonly id: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly items?: readonly string[];
}

interface PrivacyInput {
  readonly ownerName: string | null;
  readonly email: string | null;
  readonly formEnabled: boolean;
  readonly analyticsEnabled: boolean;
  /** The playground's Live API mode is configured (NEXT_PUBLIC_LIVE_API_URL). */
  readonly liveApiEnabled: boolean;
}

export function privacySections({
  ownerName,
  email,
  formEnabled,
  analyticsEnabled,
  liveApiEnabled,
}: PrivacyInput): readonly PrivacySection[] {
  const controller = ownerName ?? "the owner of this website";
  const reachMe = email
    ? `by email at ${email}`
    : "through the contact options on the contact page";

  const sections: PrivacySection[] = [
    {
      id: "who",
      title: "Who is responsible",
      paragraphs: [
        `This is a personal portfolio website. The person responsible for processing personal data on it (the controller) is ${controller}. You can reach me ${reachMe}.`,
      ],
    },
    {
      id: "visits",
      title: "Visiting the website",
      paragraphs: [
        "When you open a page, your browser sends technical data to the server that hosts the site: your IP address, the page requested, the time, and your browser and operating system. The hosting provider processes this data to deliver the site and keep it secure, and may keep it in server logs for a limited time.",
        "The legal basis is a legitimate interest in running a secure website (Art. 6(1)(f) GDPR).",
      ],
    },
    {
      id: "cookies",
      title: "Cookies and local storage",
      paragraphs: [
        "The website does not set cookies and does not store anything in your browser's local storage. Fonts are served from this website, not loaded from third-party font services.",
      ],
    },
  ];

  if (formEnabled)
    sections.push({
      id: "contact-form",
      title: "Contact form",
      paragraphs: [
        "If you send a message through the contact form, I receive what you enter — your name, how to reply (email address or Telegram username), the topic and the message. The message is delivered to me through the Telegram Bot API, which means it is transmitted to and stored by Telegram, a service that may process data outside the European Union.",
        "To protect the form from spam, the sender's IP address is held in the server's memory for up to ten minutes to limit how many messages can be sent in a row. It is not written to a database.",
        "The legal basis is responding to your enquiry and taking steps before a possible contract (Art. 6(1)(b) GDPR) or a legitimate interest in answering messages (Art. 6(1)(f) GDPR). I keep messages as long as needed to handle the enquiry and any work that follows, and delete them on request.",
      ],
    });

  if (analyticsEnabled)
    sections.push({
      id: "analytics",
      title: "Analytics",
      paragraphs: [
        "The website uses Plausible Analytics to count visits in aggregate: which pages are viewed, where visitors come from, the device type and the country. Plausible does not use cookies and does not store personal data or IP addresses; visitors are not tracked across websites or days.",
        "I also count a few actions — for example, opening an email link or sending the contact form — by name and the place on the site. The contents of the contact form are never sent to analytics.",
        "The legal basis is a legitimate interest in understanding how the site is used (Art. 6(1)(f) GDPR).",
      ],
    });

  if (liveApiEnabled)
    sections.push({
      id: "live-api",
      title: "Live API in the system playground",
      paragraphs: [
        "When you switch the playground to Live API, your browser sends demo requests to the site's API server. Like any server, it receives your IP address with each request.",
        "The first live request creates an anonymous sandbox: a random token, and a secret the page uses to sign demo webhooks, both kept only in the page's memory (no cookies, no storage). The server stores a SHA-256 hash of the token and the secret, in memory without disk persistence, and forgets them after 30 minutes.",
        "To limit how many requests one client can send, the server uses a hash of your IP address keyed with a secret that changes every day. The address itself is not stored, and access logs are turned off.",
        "Orders you create in the sandbox hold only demo fields — product, quantity and delivery type — and are deleted when the sandbox expires or when you choose to delete it. The trace of each request (operation names and timings, no request bodies) is kept for five minutes so the page can replay it.",
        "Background jobs you start (a report, a demo payment through a simulated provider) pass through a message queue. A job holds only the task id, the demo fields and the hashed sandbox key; jobs, their records and failed jobs in the dead letter queue are deleted after at most 30 minutes.",
        "Demo webhooks you send record the event id, its type, the order number and the resulting payment status under the hashed sandbox key; they are deleted after at most 30 minutes.",
        "While Live API mode is on, the page keeps a WebSocket connection to the same API server so the results of your sandbox's requests are pushed to it. The connection identifies the sandbox with its token once, in its first message; it is held only in the server's memory and closes when the sandbox expires or is deleted. The latest notifications (the event name, a task or order number and the time — at most 20) are kept with the sandbox and deleted with it.",
        "Creating a demo order also publishes an order event — the same demo fields and the hashed sandbox key — to an event log, where demo services reserve stock, add the sale to anonymous daily totals and queue a demo notification for the sandbox. The event log keeps events for an hour; reservations and notifications go with the sandbox, and the daily totals hold no sandbox key.",
        "The legal basis is a legitimate interest in running the demonstration you asked for (Art. 6(1)(f) GDPR).",
      ],
    });

  sections.push(
    {
      id: "links",
      title: "Links to other services",
      paragraphs: [
        "The site links to external services, such as professional profiles or a scheduling page. When you follow such a link, the other service's privacy policy applies.",
      ],
    },
    {
      id: "rights",
      title: "Your rights",
      paragraphs: ["Under the GDPR you have the right to:"],
      items: [
        "access the personal data I hold about you;",
        "have it corrected or deleted;",
        "restrict or object to its processing;",
        "receive it in a portable format;",
        "lodge a complaint with a data protection supervisory authority.",
      ],
    },
    {
      id: "changes",
      title: "Changes",
      paragraphs: [
        "This notice is updated when the website changes how it handles data. The date of the last update is shown above.",
      ],
    },
  );

  return sections;
}
