import { clsx, type ClassValue } from "clsx";
import type { ContentBlockInterface } from "./types";

export function cn(...classes: ClassValue[]): string {
  return clsx(classes);
}

export function formatDate(date: Date | string): string {
  const now = new Date();
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const diff = now.getTime() - dateObj.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    return dateObj.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  if (days > 0) {
    return `${days}일 전`;
  }

  if (hours > 0) {
    return `${hours}시간 전`;
  }

  if (minutes > 0) {
    return `${minutes}분 전`;
  }

  return "방금 전";
}

export function parseContent(content: string): ContentBlockInterface[] {
  const blocks: ContentBlockInterface[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("--v ")) {
      blocks.push({
        type: "checkbox",
        content: line.replace("--v ", ""),
        metadata: { checked: true },
      });
      continue;
    }

    if (line.startsWith("-- ")) {
      blocks.push({
        type: "checkbox",
        content: line.replace("-- ", ""),
        metadata: { checked: false },
      });
      continue;
    }

    if (line.startsWith("```")) {
      const language = line.slice(3).trim() || "typescript";
      const codeLines: string[] = [];
      i++;

      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }

      blocks.push({
        type: "code",
        content: codeLines.join("\n"),
        metadata: { language },
      });
      continue;
    }

    if (line.includes("[@") && line.includes("](")) {
      const match = line.match(/\[@([^\]]+)\]\(([^)]+)\)/);

      if (match) {
        const [, memoTitle, memoId] = match;
        blocks.push({
          type: "memo-link",
          content: line,
          metadata: { memoId, memoTitle },
        });
        continue;
      }
    }

    blocks.push({ type: "text", content: line });
  }

  return blocks;
}

export function toggleCheckbox(content: string, lineIndex: number): string {
  const lines = content.split("\n");

  if (lineIndex < 0 || lineIndex >= lines.length) {
    return content;
  }

  const line = lines[lineIndex];

  if (line.startsWith("--v ")) {
    lines[lineIndex] = line.replace("--v ", "-- ");
  } else if (line.startsWith("-- ")) {
    lines[lineIndex] = line.replace("-- ", "--v ");
  }

  return lines.join("\n");
}
