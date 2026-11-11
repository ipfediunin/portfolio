import type { Locale } from "@/i18n/config";
import type { MessengerCaption } from "@/simulation/cases/corporate-messenger/compile";
import { measureCorporateMessengerImpact } from "@/simulation/cases/corporate-messenger/impact";

import type { CaseGlanceInput, CaseRecordInput } from "../schema";

export const corporateMessengerProject = {
  slug: "corporate-messenger",
  published: true,
  basis: "project",
  order: 4,
  title: "Internal Corporate Messenger",
  subtitle: {
    ru: "Корпоративная система обмена сообщениями на Python Sockets",
    en: "A corporate messaging system on Python sockets",
  },
  direction: "Networking / Backend / Client-Server Architecture",
  summary: {
    ru: "Закрытый мессенджер для общения сотрудников внутри организации. Основа проекта — сетевое взаимодействие: клиенты обмениваются сообщениями через сервер по TCP-соединениям, UDP используется в задачах, где он уместен.",
    en: "A private messenger for employees inside an organisation. The core of the project is networking: clients exchange messages through a server over TCP connections, and UDP is used where it fits.",
  },
  scene: { world: "corporate-messenger", view: "system" },
  stack: ["Python", "Sockets", "TCP", "UDP"],
  technologies: ["sockets"],
} satisfies CaseRecordInput;

export interface CorporateMessengerDemoContent {
  readonly idle: string;
  readonly captions: Readonly<Record<MessengerCaption, string>>;
  readonly labels: {
    readonly controls: string;
    readonly message: string;
    readonly messageDefault: string;
    readonly transport: string;
    readonly sender: string;
    readonly loss: string;
    readonly send: string;
    readonly connections: string;
    readonly online: string;
    readonly offline: string;
    readonly connect: string;
    readonly disconnect: string;
    readonly results: string;
    readonly resultsEmpty: string;
    readonly parts: string;
    readonly inOrder: string;
    readonly outOfOrder: string;
    readonly missing: string;
    readonly notConnected: string;
    readonly stats: string;
    readonly difference: string;
  };
}

export const corporateMessengerDemo: Readonly<
  Record<Locale, CorporateMessengerDemoContent>
> = {
  ru: {
    idle: "Отправьте сообщение по TCP или UDP и добавьте потери в сети — разница станет видна. Desk 1 пока не подключён: первое сообщение начнётся с рукопожатия.",
    captions: {
      tcpConnect:
        "{desk} открывает TCP-соединение с сервером: SYN → SYN-ACK → ACK.",
      tcpSend:
        "Сообщение разбито на сегменты ({parts}) с номерами. Сервер подтверждает каждый сегмент (ACK).",
      tcpLoss:
        "Часть передач потерялась ({lost}). Не дождавшись ACK, отправитель повторил их — повторов: {retransmitted}.",
      tcpForward:
        "Сервер пересылает сообщение клиентам с открытым соединением: {online}.",
      tcpOffline:
        "{offline} — не в сети: соединения нет, по TCP серверу некуда отправить сообщение.",
      tcpDone:
        "Каждый получатель собрал {parts} из {parts} частей в правильном порядке. Всего передач: {sent}.",
      udpSend:
        "UDP: без соединения и подтверждений — датаграммы сразу летят к серверу.",
      udpForward: "Сервер рассылает полученные датаграммы клиентам.",
      udpDone:
        "Потеряно {lost} из {sent} датаграмм, повторов не было. Целиком и по порядку сообщение собрали {complete} из {recipients} получателей.",
      close:
        "{desk} закрывает соединение: FIN → ACK. Пока клиент не подключится снова, сервер не сможет ему писать.",
    },
    labels: {
      controls: "Отправка сообщения",
      message: "Сообщение",
      messageDefault: "Созвон по релизу в 15:00, ссылка в календаре",
      transport: "Протокол",
      sender: "Отправитель",
      loss: "Потери в сети",
      send: "Отправить",
      connections: "TCP-соединения",
      online: "в сети",
      offline: "не в сети",
      connect: "Подключить",
      disconnect: "Отключить",
      results: "Что получили клиенты",
      resultsEmpty:
        "Здесь появится, какие части сообщения дошли до каждого клиента.",
      parts: "{count} из {parts}",
      inOrder: "целиком, по порядку",
      outOfOrder: "порядок нарушен",
      missing: "не хватает частей",
      notConnected: "нет соединения",
      stats: "Передач {sent} · потеряно {lost} · повторно {retransmitted}",
      difference:
        "TCP гарантирует доставку и порядок ценой подтверждений и повторов. UDP проще и не ждёт, но потерянное не вернуть — он подходит там, где свежесть данных важнее полноты.",
    },
  },
  en: {
    idle: "Send a message over TCP or UDP and add network loss to see the difference. Desk 1 is not connected yet: its first message starts with a handshake.",
    captions: {
      tcpConnect:
        "{desk} opens a TCP connection to the server: SYN → SYN-ACK → ACK.",
      tcpSend:
        "The message is split into numbered segments ({parts}). The server acknowledges each one (ACK).",
      tcpLoss:
        "Some transmissions were lost ({lost}). With no ACK in time, the sender sent them again — {retransmitted} retransmissions.",
      tcpForward:
        "The server forwards the message to clients with an open connection: {online}.",
      tcpOffline:
        "{offline} — offline: there is no connection, so over TCP the server has nowhere to send the message.",
      tcpDone:
        "Every recipient assembled {parts} of {parts} parts in the right order. Transmissions in total: {sent}.",
      udpSend:
        "UDP: no connection and no acknowledgements — datagrams go straight to the server.",
      udpForward:
        "The server sends the datagrams it received on to the clients.",
      udpDone:
        "{lost} of {sent} datagrams were lost and none were resent. {complete} of {recipients} recipients assembled the whole message in order.",
      close:
        "{desk} closes the connection: FIN → ACK. Until the client connects again, the server cannot write to it.",
    },
    labels: {
      controls: "Send a message",
      message: "Message",
      messageDefault: "Release call at 15:00, link in the calendar",
      transport: "Protocol",
      sender: "Sender",
      loss: "Network loss",
      send: "Send",
      connections: "TCP connections",
      online: "online",
      offline: "offline",
      connect: "Connect",
      disconnect: "Disconnect",
      results: "What the clients received",
      resultsEmpty:
        "This shows which parts of the message reached each client.",
      parts: "{count} of {parts}",
      inOrder: "complete, in order",
      outOfOrder: "out of order",
      missing: "parts missing",
      notConnected: "no connection",
      stats: "{sent} transmissions · {lost} lost · {retransmitted} resent",
      difference:
        "TCP guarantees delivery and order at the cost of acknowledgements and retransmissions. UDP is simpler and never waits, but a lost datagram is gone — it fits where fresh data matters more than complete data.",
    },
  },
};

const measures = measureCorporateMessengerImpact();

/** The case at a glance: before and after, what the approach changes in the model, what I did. */
export const corporateMessengerGlance = {
  before: [
    "Team chat depends on external services",
    "No private channel inside the organisation's own network",
  ],
  after: [
    "Messages go through the organisation's own server",
    "One server serves many clients at the same time",
    "A dropped client or a network error does not stop the server",
  ],
  did: [
    "Client-server app on Python sockets",
    "Connecting and disconnecting clients",
    "Many simultaneous connections",
    "Network error handling",
    "UDP where speed matters more",
  ],
  charts: [
    {
      measure: measures.delivery,
      title: "Messages delivered intact",
      figure: "after",
      caption: "of messages arrive complete and in order at 10% packet loss",
      bars: {
        udp: "UDP: no acknowledgements",
        tcp: "TCP: acknowledged, resent if lost",
      },
      method:
        "A three-part message to three desks, 60 sends per transport, loss on every hop.",
    },
  ],
} satisfies CaseGlanceInput;
