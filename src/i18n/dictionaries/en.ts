export const en = {
  meta: {
    title: "Full-Stack & AI Engineer — Python Backend, RAG and Automation",
    description:
      "Full-stack and AI engineer building Python backends with FastAPI and Django, RAG and LLM features, automation and React/Next.js interfaces. Case studies come with interactive models of the system architecture.",
    ogAlt:
      "An isometric city where buildings are services and roads are data flows",
  },
  common: {
    skipToContent: "Skip to content",
    mainNavigation: "Main navigation",
    openMenu: "Open menu",
    closeMenu: "Close menu",
  },
  nav: {
    projects: "Projects",
    expertise: "Expertise",
    about: "About",
    work: "Work with me",
    employers: "For employers",
    employersHint: "Engineering profile, stack and role enquiries",
    clients: "For clients",
    clientsHint: "Services, process and project enquiries",
    playground: "System playground",
    contact: "Contact",
    privacy: "Privacy",
    cta: "Get in touch",
  },
  footer: {
    tagline: "Python backends, AI systems and the web interfaces around them.",
    navigation: "Navigation",
    workWithMe: "Work with me",
    contacts: "Contact",
    /** Under the owner's name, once it is configured. */
    legal: "Individual entrepreneur registered in Armenia",
  },
  scene: {
    overviewLabel:
      "An isometric system map: buildings are architecture components, roads are the data flows between them",
  },
  home: {
    hero: {
      eyebrow: "Python backend · RAG & LLM · Automation",
      title: "Full-Stack & AI Engineer",
      /** Next to the owner's name above the heading, once the name is configured. */
      availability: "Open to remote roles",
      lead: "I build reliable Python backends, RAG and LLM features and business automation — together with the React and Next.js interfaces people use them through.",
      primaryCta: "Explore projects",
      secondaryCta: "Work with me",
      employers: "Hiring for a role?",
      employersLink: "See my engineering profile",
      resume: "Download résumé",
      request: {
        send: "Send a request",
        hint: "or click any building",
        inFlight: "Request in flight…",
        details: "Inspect it in the playground",
      },
    },
    facts: [
      {
        title: "Python backend",
        text: "APIs and services with FastAPI, Django and Flask",
      },
      { title: "AI systems", text: "RAG, LLM integration and vector search" },
      { title: "Full-stack", text: "React and Next.js on top of the backend" },
      { title: "Open to work", text: "remote roles and independent projects" },
    ],
    stack: {
      eyebrow: "Expertise",
      title: "Three areas, one engineer",
      lead: "Server logic, interfaces, automation and AI fit together. Each area is a district of the city, with scenarios you can run.",
      more: "Explore",
    },
    playground: {
      eyebrow: "System playground",
      title: "Send a request and watch it move through a system",
      lead: "Gateway, cache, queue, workers and database at work — with statuses, traces, retries and failures you can trigger yourself.",
      cta: "Open the playground",
    },
    principles: {
      eyebrow: "Approach",
      title: "How I work",
      items: [
        {
          title: "Architecture first",
          text: "I start from the problem, the data and the load, and only then choose the tools.",
        },
        {
          title: "Failure is part of the design",
          text: "Error handling, timeouts and logging go in from the start, not after the first incident.",
        },
        {
          title: "Simplicity pays off",
          text: "Every abstraction has to earn its place. Separate services only when they solve a real problem.",
        },
        {
          title: "Code for the team",
          text: "Types, tests and a clear structure keep a project easy to change.",
        },
      ],
    },
    contact: {
      title: "Have a system to build?",
      lead: "Tell me about the problem — I'll come back with questions and a proposed approach.",
      cta: "Discuss your project",
    },
  },
  stack: {
    eyebrow: "Expertise",
    title: "Engineering expertise",
    lead: "The areas a system is made of — server logic, interfaces, automation and AI. Each one is a district of the city with scenarios that show how its parts work together.",
    areasNavigation: "Expertise areas",
    technologies: "Technologies",
    allAreas: "All areas",
    sceneLabel:
      "A district of the city: buildings are the system components these technologies run in",
    technologiesHint:
      "Pick a technology to light up the buildings it runs in. Tap or click a building to open its details. Technologies with no building in the city lead to case studies.",
    cases: "In case studies",
    scenariosTitle: "District scenarios",
    storyIdle:
      "Pick a scenario — it plays out in the district on the diagram, and every step is explained here.",
    snippetTitle: "What it looks like in code",
  },
  architecture: {
    eyebrow: "System playground",
    title: "How a request travels through a system",
    lead: "Client, gateway, services, cache, message broker, workers and database — in one living map. Pick a scenario, send a request and watch how the system behaves at work and under failure.",
    nodes: {
      title: "System components",
      lead: "Every building is a component of the architecture. Pick one here or on the diagram to see why it is there and how I build and run it.",
    },
    reportLink: "How the live backend holds up under load and failure",
  },
  report: {
    eyebrow: "Live backend",
    title: "Load and chaos report",
    lead: "The services behind the playground's Live API mode — FastAPI, Django, RabbitMQ, Kafka, workers and a WebSocket hub — under load, and with parts of them broken on purpose. Every number on this page comes from a real run of scripts that are in the repository.",
    caveat:
      "Measured on a developer machine, not in production: the services run in Docker Desktop on Windows with the CPU and memory limits from compose, and the load comes from the same machine. A server will give other absolute numbers; what this shows is the shape — what stays fast, what queues, what breaks and how it comes back.",
    measuredOn: "Measured on {date}.",
    links: {
      playground: "Send a live request in the playground",
    },
    load: {
      title: "Load",
      lead: "Simulated playground visitors, each with a sandbox of their own, doing what the Live API mode does: reads, orders, background jobs, payments and webhooks.",
      run: "{users} visitors",
      summary:
        "{rps} requests/s · p95 {p95} ms · {failures} failed of {requests}",
      columns: {
        request: "Request",
        rps: "req/s",
        p50: "p50",
        p95: "p95",
        p99: "p99",
        failures: "Failed",
      },
      groups: {
        read: "Reads · cache",
        events: "Orders · Kafka",
        jobs: "Jobs · RabbitMQ",
        payments: "Payments API · Django",
        traces: "Traces",
      },
      background: {
        title: "Queued work, end to end",
        lead: "From the request's start to the end of its last background step, taken from the trace: measured by the services themselves, not by the load generator.",
        count: "Done",
      },
      containers: {
        title: "Busiest containers",
        service: "Service",
        cpu: "CPU peak (cores)",
        memory: "Memory peak",
        ofLimit: "of {limit}",
      },
    },
    chaos: {
      title: "Chaos",
      lead: "Each experiment states what should hold, breaks one thing for real — kills a container, stops a broker — measures what happens and whether the system comes back by itself.",
      held: "Hypothesis held",
      failed: "Hypothesis did not hold",
      fault: "What was broken",
      hypothesis: "Hypothesis",
      observed: "What was measured",
      finding: "Found and fixed",
      findings: {
        "redis-down":
          "The first run disproved this hypothesis: without Redis the Orders API answered 500 after five seconds — nothing handled a lost Redis, and the trace of the failure was written into that same Redis. Now a lost Redis gives a 503 with Retry-After within half a second (the client's timeout), a trace is never written into a Redis that just failed, and a regression test keeps it that way. The load run right after found one more: the first call on a connection opened before the restart failed, so one order event's trace never completed (the order itself was handled). Every Redis client now repeats a call on a closed connection, and this experiment now places an order right after the restart and waits for its trace.",
      } as Readonly<Record<string, string>>,
    },
    environment: {
      title: "Where it was measured",
      machine: "Machine",
      docker: "Docker",
      generator: "Load generator",
      cpus: "{count} logical CPUs",
      memory: "{gb} GB RAM",
      limits: "Container limits (compose)",
      service: "Service",
      replicas: "Replicas",
      cpu: "CPU",
      memoryLimit: "Memory",
      unlimited: "—",
    },
    method: {
      title: "Method",
      items: [
        "Load: Locust. Each level ramps up, settles, then is measured over a steady window; a visitor waits 0.2–1 s between actions.",
        "The per-visitor rate limits are lifted for the run (compose.load.yaml): one machine plays every visitor from one IP, and the point is the services, not the limiter. The limiter has a scenario of its own in the playground.",
        "Latencies are percentiles over the measured window; Locust rounds times above 100 ms to the nearest 10 ms.",
        "Chaos: the experiments run one after another; after each, whatever was broken is started again before the next one begins.",
      ],
      weights: "Mix of actions per visitor",
      reproduce: "Run it yourself",
    },
  },
  inspector: {
    label: "Node inspector",
    close: "Close",
    practices: "How I work with it",
    technologies: "Technologies",
    scenarios: "Scenarios through this node",
    cases: "Case studies with this component",
    kinds: {
      client: "Client",
      gateway: "API gateway",
      service: "Service",
      cache: "Cache",
      database: "Database",
      broker: "Message broker",
      worker: "Background worker",
      scheduler: "Scheduler",
      wsHub: "Realtime hub",
      storage: "Storage",
      integration: "External integration",
      observability: "Monitoring",
      dlq: "Dead letter queue",
      ci: "Build",
    },
  },
  playground: {
    scenariosTitle: "Scenarios",
    scenarios: {
      "sync-read": {
        title: "Synchronous request",
        text: "Client → gateway → API → database → 200 response.",
      },
      cache: {
        title: "Cache miss and hit",
        text: "The first request hits the database, the repeat is served from Redis.",
      },
      validation: {
        title: "Validation error",
        text: "Invalid JSON stops at the API with a 422. Fix the body to get a 201.",
      },
      auth: {
        title: "Missing auth",
        text: "A request without a token is rejected at the gateway with 401.",
      },
      "rate-limit": {
        title: "Rate limit",
        text: "Eight requests in a row: five pass, the rest get 429 before the service.",
      },
      "async-job": {
        title: "Background job",
        text: "The API answers 202 right away; heavy work goes to a queue and a worker.",
      },
      retry: {
        title: "Retries with backoff",
        text: "The external payment API fails; the worker retries with a growing delay.",
      },
      "dead-letter": {
        title: "Dead letter queue",
        text: "Out of attempts, the task lands in the DLQ and an alert fires.",
      },
      "circuit-breaker": {
        title: "Circuit breaker",
        text: "The provider does not answer: after three timeouts the breaker opens and requests get a fast 503. Send several times in a row.",
      },
      webhook: {
        title: "Idempotent webhook",
        text: "The provider sends an event. The same id again is dropped as a repeat; a new id gets processed.",
      },
      "fan-out": {
        title: "Fan-out: one event, three subscribers",
        text: "The order publishes order.created to Kafka, and inventory, analytics and notifications read it, each on its own.",
      },
      chaos: {
        title: "Chaos: a worker goes down",
        text: "An import becomes a queue of jobs; one worker is down, the queue grows and the autoscaler brings a replacement.",
      },
    },
    request: "Request",
    send: "Send",
    sendHint: "Ctrl + Enter",
    body: "Request body (JSON)",
    authorization: "Bearer token",
    cache: "Cache",
    cacheModes: { auto: "Auto", hit: "Hit", miss: "Miss" },
    failures: "Provider failures in a row",
    failuresHint: "3 of 3 attempts — the task goes to the dead letter queue",
    providerDown: "Provider not responding",
    workerDown: "Worker down",
    resetSystem: "Reset cache and limits",
    live: {
      mode: "Mode",
      modes: { simulation: "Simulation", live: "Live API" },
      hint: "Your request goes to real FastAPI and Django services with Redis, PostgreSQL, RabbitMQ and Kafka, queued work and events are handled by real workers, results are pushed back over a WebSocket, and the city replays the actual trace. No account and nothing personal: an anonymous sandbox that deletes itself after 30 minutes.",
      unsupported:
        "This scenario runs as a simulation. The live API covers a plain request, cache, validation, auth, rate limit, a background job, retries, the dead letter queue, the circuit breaker, the idempotent webhook and the Kafka fan-out.",
      providerFault:
        "The payment provider here is a local stand-in: it stops answering on purpose (fault injection). The real Django payments service waits out its timeout, counts the failure and, after three, opens its circuit breaker.",
      faults:
        "The payment provider here is a local stand-in: it fails this many calls of the job on purpose (fault injection), so the real worker retries — or gives up.",
      badge: "Live",
      sending: "Sending…",
      sandbox: "Your sandbox expires at {time}.",
      deleteSandbox: "Delete it now",
      channel: {
        connecting: "Opening a WebSocket to the realtime hub…",
        open: "Results are pushed to this page over a WebSocket.",
        unavailable:
          "The WebSocket is unavailable — the page checks the trace instead.",
      },
      lastPush: "Last push: {event}.",
      errors: {
        unreachable:
          "The live API is not reachable right now. Switch to Simulation or try again later.",
        protocol: "The live API answered in an unexpected format.",
        limited:
          "Too many sandboxes from your network. Try again in a few minutes.",
      },
    },
    playback: "Playback",
    play: "Resume",
    pause: "Pause",
    step: "Step",
    speed: "Speed",
    stepMode: "Step by step",
    whatHappens: "What is happening",
    idleNote:
      "Pick a scenario and send a request — the packet travels through the city, and every step is explained here.",
    slowedNote:
      "The animation is slowed down for clarity; latencies in the trace are realistic.",
    trace: "Trace",
    traceEmpty: "Send a request to see a span for every node.",
    logs: "Logs",
    logsEmpty: "All quiet so far.",
    response: "Response",
    responseEmpty:
      "The response appears when the request is back at the client.",
    waiting: "Waiting for the response…",
    headers: "Headers",
    latency: "Latency",
    runs: "Recent requests",
    notes: {
      gatewayRateLimit:
        "The gateway counts client requests in a token bucket: when it is empty, the request gets 429 before reaching the service.",
      gatewayAuth:
        "The gateway verifies the token with the Auth Service. Without a token the request gets 401 and never loads the business logic.",
      apiValidate:
        "The API validates the body against a schema, like Pydantic in FastAPI: on error, an immediate 422 that points at the field.",
      apiHandle: "The service runs the endpoint's business logic.",
      cacheRead:
        "Redis is checked first: no data means a miss, so we go to the database.",
      cacheHit:
        "The data is in Redis — answered without touching the database, in a few milliseconds.",
      cacheWrite:
        "The result goes into Redis with a TTL, so the next request is served from the cache.",
      dbQuery: "The PostgreSQL query is the most expensive part of the path.",
      brokerPublish:
        "Heavy work goes to a RabbitMQ queue, and the client immediately gets 202 Accepted with a task id.",
      workerProcess:
        "A worker takes the task from the queue and runs it in the background.",
      providerCall:
        "The worker calls an external payment API over the internet — it may answer with an error.",
      workerRetry:
        "The failure is transient: the task goes back to the queue and is retried with exponential backoff.",
      deadLetter:
        "Out of attempts: the task moves to the dead letter queue for review and an alert fires — nothing is lost silently.",
      push: "The background result reaches the client as a push, no polling.",
      responded: "The response travelled back to the client the same way.",
      webhookReceived:
        "The payment provider reports by webhook that a payment went through. The service checks the signature and the event id, then marks the order as paid.",
      webhookDuplicate:
        "The provider did not get the acknowledgement in time and sends the same event again — normal for webhooks, not an edge case.",
      webhookIgnored:
        "This event id is already processed: the repeat is dropped with no second write and no double charge, and the provider still gets a 200.",
      choiceIntro:
        "Three services, three tools. The choice is not about which framework is best but about what each job needs.",
      choiceDjango:
        "Payments with refunds and manual operations run on Django: the ORM, migrations and the built-in admin save weeks of internal tooling.",
      choiceFastapi:
        "Orders is a busy API with many concurrent requests: FastAPI with async I/O and Pydantic contracts handles them without extra threads.",
      choiceFlask:
        "Auth is a small service with a couple of endpoints: Flask brings nothing extra and stays easy to read.",
      choiceSummary:
        "One language and shared practices — and every service on the tool that fits its job.",
      ssrRequest: "The browser asks the Next.js server for an order page.",
      ssrShell:
        "The server sends the page shell right away: the visitor sees the layout and navigation while the data is still on its way.",
      ssrStream:
        "The data has arrived and its block is streamed into the same HTTP response — no second request from the browser. Slow blocks do not hold up fast ones.",
      ssrHydrate:
        "JavaScript arrives last and brings the already visible page to life — interactivity without a blank screen.",
      validateClient:
        "The visitor submits a form with a broken email — the Zod schema catches it in the browser, and nothing goes over the network.",
      validateFixed:
        "The corrected form goes to the Next.js server as a Server Action.",
      validateServer:
        "The server validates the data again with the same schema: client checks cannot be trusted, they only save a round trip.",
      optimisticClick:
        "The visitor likes a product — the interface updates at once, without waiting for the server.",
      optimisticConfirm:
        "The server confirms the change — nothing moves on screen, the user simply did not wait.",
      optimisticFail:
        "A second click removes the like. The interface updates instantly again, but this time the server does not answer.",
      optimisticRollback:
        "The request timed out: the interface rolls the change back and says so honestly instead of showing a wrong state.",
      botCommand:
        "A user sends the bot the /sync command — the bot queues a sync job and replies at once that the work has started.",
      syncStore:
        "The job fetched data from the external API and checked every record. Valid records are stored in PostgreSQL.",
      botDone:
        "The bot reports the result: how many records were stored. The user did not wait while the job ran.",
      syncStart: "A sync job with the external API starts.",
      syncFailed:
        "The external API answered 503. The job does not fail silently: the error is logged and nothing reached the database.",
      syncNotified:
        "The bot tells the team about the failure — the problem is visible at once, not at the next check.",
      dockerBuild:
        "The service is built into a Docker image together with its dependencies and environment.",
      dockerPush: "The image is stored in the registry under its version.",
      dockerRun:
        "The container starts from that same image — the same way on any machine.",
      breakerTimeout:
        "The provider is silent: the service waits out its 2-second timeout and counts a failure. Until there are three, the next requests will wait again.",
      breakerTripped:
        "A third timeout in a row: the breaker opens. From now on the service will not wait for the provider until it recovers.",
      breakerOpen:
        "The circuit is open: the request does not even go to the provider and gets a 503 at once. Failing fast instead of waiting two seconds saves the service's threads and the user's time.",
      breakerHalfOpen:
        "The 8-second pause is over: one trial call checks whether the provider is back. Other requests still fail fast for now.",
      breakerClosed:
        "The provider answered — the circuit is closed again and requests flow as usual.",
      webhookFirst:
        "This id is new: the service remembers it and processes the payment. Send the same request again.",
      fanoutPublish:
        "The order and its order.created event are saved in one transaction (an outbox), and the client gets its answer. A relay then puts the event into Kafka — the service does not need to know who listens.",
      fanoutDeliver:
        "Three consumer groups read the event, each on its own: inventory reserves stock, analytics counts the sale, notifications queue a message. One failing or lagging does not affect the others.",
      chaosShared:
        "Both workers drain the queue in parallel — each job goes to whoever frees up first. Turn on “Worker down” to see a failure.",
      chaosDown:
        "One worker is down. Its jobs are not lost — they wait in the queue — but only the other worker takes them, so the queue shrinks slowly.",
      chaosAutoscale:
        "The autoscaler sees the queue is not shrinking and starts a new worker replica to replace the lost one.",
      chaosDrained:
        "The queue is empty: every job is done and none was lost — the broker held them while there was no one to work.",
    },
  },
  stories: {
    "webhook-idempotency": {
      title: "Webhook and idempotency",
      text: "The provider sends one event twice; the repeat is dropped without a double charge.",
    },
    "framework-choice": {
      title: "When I pick what",
      text: "Django, FastAPI and Flask in one system, each for its own job.",
    },
    "ssr-streaming": {
      title: "SSR and streaming",
      text: "The page shell arrives at once, data streams in parts, then hydration.",
    },
    "client-validation": {
      title: "Validation on client and server",
      text: "Errors are caught before the network; valid data is checked again on the server.",
    },
    "optimistic-ui": {
      title: "Optimistic UI",
      text: "The interface responds instantly and rolls back honestly when the server fails.",
    },
    "bot-sync": {
      title: "A bot starts a sync",
      text: "A chat command starts a job: data from an external API is checked and stored, and the bot reports the result.",
    },
    "sync-failure": {
      title: "External API failure",
      text: "The external service does not answer: the error goes to the log and the team gets a message from the bot.",
    },
    "docker-image": {
      title: "A Docker image",
      text: "The service is built into an image with its environment and runs from it — the same way on any machine.",
    },
  },
  projects: {
    eyebrow: "Projects",
    title: "Case studies",
    lead: "Each case shows in a minute what changed: before and after, the effect of the approach in numbers and an interactive model of the system — with the full engineering write-up one click away.",
    emptyTitle: "Case studies are on the way",
    emptyText:
      "Project breakdowns with architecture diagrams are coming soon. Meanwhile, explore the stack and the interactive architecture.",
    caseEyebrow: "Case",
    results: "Results in numbers",
    overview: "Overview",
    basis: {
      project: "Project work",
      practice: "Generalised experience across several systems",
    },
    glance: {
      title: "At a glance",
      before: "Before",
      after: "After",
      did: "What I did",
      timeUnits: "time units",
      modelNote:
        "The charts are computed by this case's model on synthetic data — the same model that runs the interactive demo. They show what the approach changes, not figures from a client's system.",
    },
    details: {
      title: "Engineering details",
      hint: "The full write-up: problem, architecture, implementation decisions and outcome.",
    },
    relatedServices: "Related services",
    sceneLabel: "Model of the {title} system",
    stack: "Technology stack",
    stackLinks: "More in Expertise",
    scenarios: "The same ideas in the playground",
    links: "Links",
    open: "Open the case",
    back: "All case studies",
    draft: "Draft: visible in development only, never in the production build",
    ctaTitle: "Need a system like this?",
    ctaText:
      "Tell me about the problem — I'll come back with questions and a proposed approach.",
    ctaButton: "Discuss your project",
    ctaRole: "Hiring? See my engineering profile",
    demo: {
      title: "How it works",
      lead: "A model of the system you can run: watch requests and data move through the components. It is a simplified reconstruction on synthetic data, not the production code.",
      glance: "At a glance",
      hidePanel: "Hide the panel",
      showPanel: "Show the panel",
      tryHere: "Try it here",
      playback: "Playback",
      whatHappens: "What is happening",
      play: "Resume",
      pause: "Pause",
      speed: "Speed",
      simulated:
        "The model runs in the browser on synthetic data. Times on the cards are illustrative, and motion is slowed down so the path can be followed.",
    },
  },
  about: {
    eyebrow: "About",
    title: "Python backend, fullstack and AI systems",
    lead: "Full-Stack Developer · Python Backend Engineer · AI Systems Developer. I design and build server-side systems, interfaces and smart services for searching and processing information.",
    paragraphs: [
      "The core is a Python backend: APIs with FastAPI, Django and Flask, asynchronous programming, integrations between systems, queues and messaging. On the frontend — React and Next.js: multi-page websites, interfaces for the backend and admin panels.",
      "A separate direction is AI systems and data: RAG search over knowledge bases, work with LLMs and vector stores, numerical processing, interpolation and data visualisation.",
      "I use AI tools — OpenAI Codex and Claude — in my work, but architectural decisions, checking the result and responsibility for the code stay with me.",
    ],
    /** Under the owner's name; {age} is NEXT_PUBLIC_OWNER_AGE. */
    age: "{age} years old",
    /** Explains the site name: the owner works through an individual entrepreneurship. */
    entrepreneur: "Individual entrepreneur (IP), registered in Armenia",
    photoAlt: "Portrait of {name}",
    /** Development builds only: marks the empty photo slot until NEXT_PUBLIC_OWNER_PHOTO is set. */
    photoSlot:
      "Photo slot — add a portrait to /public and set NEXT_PUBLIC_OWNER_PHOTO",
    profileTitle: "Technical profile",
    next: "Where to go next",
    nextProjects: "Case studies with interactive models of each system",
    profile: [
      {
        title: "Backend",
        items: [
          "Python",
          "Django",
          "FastAPI",
          "Flask",
          "REST API",
          "Asynchronous programming",
          "Integrations between systems",
          "Services and automation",
        ],
      },
      {
        title: "Frontend",
        items: [
          "JavaScript / TypeScript",
          "React",
          "Next.js",
          "Multi-page websites",
          "Interfaces for the backend",
          "Client applications and admin panels",
        ],
      },
      {
        title: "AI / Data Engineering",
        items: [
          "RAG",
          "LLM",
          "Intelligent search",
          "NumPy",
          "SciPy",
          "Pandas",
          "Matplotlib",
          "Numerical methods and interpolation",
          "Analytics and visualisation",
        ],
      },
      {
        title: "Databases",
        items: [
          "PostgreSQL",
          "pgvector",
          "Milvus",
          "Redis",
          "Cloud databases",
          "Vector search",
        ],
      },
      {
        title: "Messaging and distributed systems",
        items: [
          "RabbitMQ",
          "Apache Kafka",
          "Redis",
          "Asynchronous task processing",
          "Event-driven architecture",
        ],
      },
      {
        title: "Networking",
        items: [
          "Python sockets",
          "TCP",
          "UDP",
          "Client-server architecture",
          "Corporate chats",
        ],
      },
      {
        title: "Automation and tools",
        items: [
          "Python automation",
          "Bots",
          "API integration",
          "Docker",
          "Cloud infrastructure",
          "OpenAI Codex",
          "Claude",
        ],
      },
      {
        title: "Also",
        items: ["C#", "Object-oriented programming", "Software design"],
      },
    ],
  },
  contact: {
    eyebrow: "Contact",
    title: "Let's talk",
    lead: "Hiring for a role or planning a project? Send a short message and I'll get back to you.",
    email: "Email",
    profiles: "Profiles",
    booking: "Book a call",
    bookingText: "Prefer to talk? Pick a time that works for you.",
    channels: "Other ways to reach me",
    unavailable:
      "Contact details are still being set up. Please check back soon.",
    form: {
      title: "Send a message",
      topic: "What is it about?",
      topics: {
        project: "A project",
        role: "A role",
        other: "Something else",
      },
      name: "Name",
      contact: "Email or Telegram",
      contactHint:
        "Where should I reply? An email address or a Telegram @username.",
      message: "Message",
      messageHint:
        "What do you need built or changed? Add context, timing or links if you have them.",
      submit: "Send message",
      sending: "Sending…",
      sent: "Thanks — your message has been sent. I'll reply soon.",
      sendAnother: "Send another message",
      honeypot: "Website (leave empty)",
      errors: {
        nameRequired: "Please enter your name.",
        nameLong: "The name is longer than 100 characters.",
        contactInvalid:
          "Please enter an email address or a Telegram handle like @username.",
        messageShort: "Please write at least 20 characters.",
        messageLong: "The message is too long: 4000 characters at most.",
        rateLimited:
          "Too many messages in a row. Please try again in a few minutes.",
        deliveryFailed:
          "The message could not be sent. Please try again later or use another channel on this page.",
      },
    },
  },
  notFound: {
    title: "Page not found",
    text: "There is no page at this address — the request came back with a 404.",
    home: "Back to home",
  },
};

export type Dictionary = typeof en;
