import { ApiError } from "./api";

const POST_LOGIN_REDIRECT_KEY = "todo-web-next:post-login-redirect";
const DEFAULT_ACCESS_DENIED_MESSAGE =
  "TODO 서비스 접근 권한이 없습니다. 관리자에게 사용 권한을 요청하세요.";
const PASSWORD_RESET_REQUIRED_MESSAGE =
  "비밀번호 재설정이 필요합니다. 관리자에게 문의하세요.";

function isSafeRedirectPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//");
}

export function normalizePostLoginRedirect(path: string | null | undefined): string {
  if (!path) {
    return "/";
  }

  return isSafeRedirectPath(path) ? path : "/";
}

export function rememberPostLoginRedirect(path: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizePostLoginRedirect(path);
  if (normalized === "/") {
    window.sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
    return;
  }

  window.sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, normalized);
}

export function consumePostLoginRedirect(fallback = "/"): string {
  const normalizedFallback = normalizePostLoginRedirect(fallback);
  if (typeof window === "undefined") {
    return normalizedFallback;
  }

  const stored = normalizePostLoginRedirect(
    window.sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY),
  );
  window.sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);

  return stored !== "/" ? stored : normalizedFallback;
}

function isAccessDeniedText(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  return /access[_\s-]?denied|no active service permission|forbidden/i.test(value);
}

export function buildAccessDeniedMessage(detail?: string | null): string {
  const normalized = detail?.trim();
  if (!normalized) {
    return DEFAULT_ACCESS_DENIED_MESSAGE;
  }

  if (/password reset is required/i.test(normalized)) {
    return PASSWORD_RESET_REQUIRED_MESSAGE;
  }

  if (isAccessDeniedText(normalized)) {
    return DEFAULT_ACCESS_DENIED_MESSAGE;
  }

  return `${DEFAULT_ACCESS_DENIED_MESSAGE} ${normalized}`;
}

export function getAccessDeniedMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) {
    return null;
  }

  if (
    error.status === 403 ||
    error.code === "access_denied" ||
    isAccessDeniedText(error.message)
  ) {
    return buildAccessDeniedMessage(error.message);
  }

  return null;
}

export function getLoginErrorFromSearchParams(searchParams: URLSearchParams): string | null {
  const error = searchParams.get("error");
  const errorDescription =
    searchParams.get("error_description") ?? searchParams.get("message");

  if (error === "access_denied" || isAccessDeniedText(errorDescription)) {
    return buildAccessDeniedMessage(errorDescription);
  }

  if (errorDescription) {
    return errorDescription;
  }

  if (error) {
    return "로그인에 실패했습니다. 잠시 후 다시 시도해주세요.";
  }

  return null;
}
