import type { SortOption } from "./types";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveApiBaseUrl(input: string | undefined): string {
  return trimTrailingSlash(input || "http://localhost:8000/api");
}

function resolveSocketBaseUrl(apiBaseUrl: string, input: string | undefined): string {
  if (input) {
    return trimTrailingSlash(input);
  }

  return trimTrailingSlash(apiBaseUrl.replace(/\/api$/, ""));
}

export const TODO_API_BASE_URL = resolveApiBaseUrl(
  process.env.NEXT_PUBLIC_API_URL,
);

export const SOCKET_BASE_URL = resolveSocketBaseUrl(
  TODO_API_BASE_URL,
  process.env.NEXT_PUBLIC_SOCKET_URL,
);

export const SOCKET_PATH =
  process.env.NEXT_PUBLIC_SOCKET_PATH || "/api/socket.io/";

export const LIVEKIT_URL =
  process.env.NEXT_PUBLIC_LIVEKIT_URL || "ws://localhost:7880";

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "created", label: "날짜" },
  { value: "name", label: "이름" },
  { value: "updated", label: "최근편집" },
];

export const DEFAULT_CODE_LANGUAGE = "typescript";
export const EDITOR_THEME = "vs-dark";

export const AllIcons = [
  "Beer",
  "Cake",
  "Flash",
  "IceCream",
  "Idea",
  "King",
  "Mountain",
  "Nut",
  "Pizza",
  "Plant",
  "Radio",
  "Skull",
];
