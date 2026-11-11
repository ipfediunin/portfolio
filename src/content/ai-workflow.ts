import { z } from "zod";

import { localizedSchema } from "./schema";

/**
 * AI-assisted engineering: how AI tools fit into the work. It is a competence, not a client case,
 * so it lives on the projects page as its own section; the emphasis is on engineering control.
 */
const aiWorkflowSchema = z.object({
  eyebrow: localizedSchema,
  title: localizedSchema,
  lead: localizedSchema,
  steps: z
    .array(z.object({ title: localizedSchema, text: localizedSchema }))
    .min(3),
  tools: z.array(z.string().trim().min(1)).min(1),
  principle: localizedSchema,
});

export const aiWorkflow = aiWorkflowSchema.parse({
  eyebrow: { ru: "AI Workflow", en: "AI Workflow" },
  title: {
    ru: "AI-assisted Software Engineering",
    en: "AI-assisted Software Engineering",
  },
  lead: {
    ru: "Использую OpenAI Codex и Claude как инструменты разработки. Архитектурные решения, проверка результата и ответственность за код остаются за мной.",
    en: "I use OpenAI Codex and Claude as development tools. Architectural decisions, checking the result and responsibility for the code stay with me.",
  },
  steps: [
    {
      title: { ru: "Постановка задачи", en: "Framing the task" },
      text: {
        ru: "Ставлю задачу AI-агенту как техническое задание: контекст, ограничения и критерии готовности.",
        en: "I give an AI agent a task the way I would write a spec: context, constraints and a definition of done.",
      },
    },
    {
      title: {
        ru: "Архитектура и декомпозиция",
        en: "Architecture and decomposition",
      },
      text: {
        ru: "Сначала прорабатываю архитектуру и делю сложную задачу на шаги, каждый из которых можно проверить отдельно.",
        en: "I work out the architecture first and split a complex task into steps that can each be checked on their own.",
      },
    },
    {
      title: { ru: "Технические спецификации", en: "Technical specifications" },
      text: {
        ru: "Готовлю спецификации, по которым работа идёт итерациями.",
        en: "I prepare specifications that the work follows in iterations.",
      },
    },
    {
      title: { ru: "Существующий код", en: "Existing code" },
      text: {
        ru: "Использую AI для анализа и рефакторинга существующего кода.",
        en: "I use AI to analyse and refactor existing code.",
      },
    },
    {
      title: { ru: "Проверка результата", en: "Checking the result" },
      text: {
        ru: "Каждый результат проверяю ревью, тестами и запуском. Принимаю только то, что понимаю и могу объяснить.",
        en: "Every result goes through review, tests and a real run. I accept only what I understand and can explain.",
      },
    },
    {
      title: { ru: "Встраивание в процесс", en: "Part of the process" },
      text: {
        ru: "Встраиваю AI-инструменты в рабочий процесс так, чтобы они ускоряли разработку без потери качества.",
        en: "I fit AI tools into the workflow so they speed development up without lowering the quality.",
      },
    },
  ],
  tools: ["OpenAI Codex", "Claude", "Python", "TypeScript"],
  principle: {
    ru: "AI ускоряет работу, но не принимает решений: за архитектуру, качество и конечный результат отвечает инженер.",
    en: "AI speeds the work up but makes no decisions: the engineer is accountable for the architecture, the quality and the final result.",
  },
});
