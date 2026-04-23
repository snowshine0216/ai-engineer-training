import styles from "./page.module.css";

const milestones = [
  "Next.js App Router scaffold in TypeScript",
  "Node.js 22 target runtime with pnpm package management",
  "OpenAI Agents SDK will run through a LiteLLM-backed OpenAI client",
  "Langfuse remains the primary telemetry layer",
] as const;

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <span className={styles.eyebrow}>Scaffold ready</span>
        <div className={styles.intro}>
          <h1>OpenAI LiteLLM Chat</h1>
          <p>
            This scaffold is now aligned with the TypeScript-first architecture.
            The next implementation steps will add the agent runner, direct
            OpenAI client override for base URL and API key, retry policy, and
            Langfuse instrumentation.
          </p>
        </div>
        <ul className={styles.milestones}>
          {milestones.map((milestone) => (
            <li key={milestone}>{milestone}</li>
          ))}
        </ul>
      </main>
    </div>
  );
}
