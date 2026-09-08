"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import styles from "./Agents.module.css";

/** A copy-only reference. Examples are never sent, evaluated or executed. */
export default function AgentsCodeBlock({ title, language, code }: { title: string; language: string; code: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }

  return <div className={styles.codePanel}>
    <div className={styles.codeHeader}>
      <div><span className={styles.codeTitle}>{title}</span><span className={styles.language}>{language}</span></div>
      <button type="button" onClick={copy} className={styles.copyButton} aria-label={`Copy ${title.toLowerCase()}`}>
        {status === "copied" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        <span>{status === "copied" ? "Copied" : "Copy"}</span>
      </button>
    </div>
    <pre tabIndex={0} role="region" aria-label={`${title}, scrollable code`} className={styles.code}><code>{code}</code></pre>
    <p role="status" className={status === "error" ? styles.copyError : "sr-only"}>{status === "copied" ? `${title} copied to clipboard.` : status === "error" ? "Copy unavailable. Select and copy the code instead." : ""}</p>
  </div>;
}
