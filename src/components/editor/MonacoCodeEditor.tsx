'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import type { OnChange, OnMount } from '@monaco-editor/react';
import { CODE_LANGUAGES, resolveCodeLanguage } from '@/lib/codeFence';
import { EDITOR_THEME } from '@/lib/constants';
import { shouldRequestCodeWrite } from '@/lib/editorActivity';
import { isMemoHistoryShortcut, isMemoVersionShortcut } from '@/lib/memoDocumentHistory';

const MIN_EDITOR_HEIGHT = 120;

function initialEditorHeight(value: string) {
  const lineCount = value.split('\n').length;
  return Math.max(MIN_EDITOR_HEIGHT, lineCount * 20);
}

const Editor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-gray-900 text-gray-400">
      Loading editor...
    </div>
  ),
});

export interface MonacoCodeEditorProps {
  value: string;
  language?: string;
  onChange: (value: string) => void;
  /**
   * 주면 언어 선택이 controlled 가 된다 — 호출부가 선택을 문서(펜스 라인)에 되쓴다.
   * 없으면 이 컴포넌트 로컬 상태로만 바뀌고 새로고침하면 사라진다.
   */
  onLanguageChange?: (language: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
  /** 새로 만들어진 코드블록이면 마운트 직후 편집기로 포커스를 가져온다. */
  autoFocus?: boolean;
  onAutoFocused?: () => void;
  /** 코드편집기 포커스도 "편집 중"이다 — 호출부가 락 유지/해제에 쓴다. */
  onFocusChange?: (focused: boolean) => void;
  /** lease 없는 read-only editor를 클릭했을 때 쓰기 의도를 상위로 전달한다. */
  onReadOnlyEditIntent?: () => void;
  onHistoryShortcut?: (action: 'undo' | 'redo') => void;
  onVersionShortcut?: () => void;
}

export function MonacoCodeEditor({
  value,
  language,
  onChange,
  onLanguageChange,
  onSave,
  readOnly = false,
  autoFocus = false,
  onAutoFocused,
  onFocusChange,
  onReadOnlyEditIntent,
  onHistoryShortcut,
  onVersionShortcut,
}: MonacoCodeEditorProps) {
  // Monaco 에 없는 id 를 넘기면 하이라이팅이 조용히 꺼지므로 항상 canonical id 로 정규화한다.
  const resolvedLanguage = resolveCodeLanguage(language);
  const [localLanguage, setLocalLanguage] = useState(resolvedLanguage);
  const [editorHeight, setEditorHeight] = useState(() => initialEditorHeight(value));
  const onSaveRef = useRef(onSave);
  const onFocusChangeRef = useRef(onFocusChange);
  const onAutoFocusedRef = useRef(onAutoFocused);
  const onHistoryShortcutRef = useRef(onHistoryShortcut);
  const onVersionShortcutRef = useRef(onVersionShortcut);
  const editorDisposablesRef = useRef<Array<{ dispose: () => void }>>([]);
  const pendingReadOnlyFocusRef = useRef(false);

  useEffect(() => {
    onSaveRef.current = onSave;
    onFocusChangeRef.current = onFocusChange;
    onAutoFocusedRef.current = onAutoFocused;
    onHistoryShortcutRef.current = onHistoryShortcut;
    onVersionShortcutRef.current = onVersionShortcut;
  }, [onAutoFocused, onFocusChange, onHistoryShortcut, onSave, onVersionShortcut]);

  // 문서 쪽 언어가 바뀌면(펜스 편집·되돌리기) uncontrolled 사용처의 선택도 따라가야 한다.
  useEffect(() => {
    setLocalLanguage(resolvedLanguage);
  }, [resolvedLanguage]);

  const selectedLanguage = onLanguageChange ? resolvedLanguage : localLanguage;

  const handleLanguageSelect = (next: string) => {
    if (onLanguageChange) {
      onLanguageChange(next);
      return;
    }
    setLocalLanguage(next);
  };

  const handleEditorChange: OnChange = (value, event) => {
    if (event.isUndoing || event.isRedoing) {
      onHistoryShortcutRef.current?.(event.isUndoing ? 'undo' : 'redo');
      return;
    }
    onChange(value || '');
  };

  const [editorInstance, setEditorInstance] = useState<Parameters<OnMount>[0] | null>(null);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    setEditorInstance(editor);
    const resizeToContent = (contentHeight = editor.getContentHeight()) => {
      setEditorHeight(Math.max(MIN_EDITOR_HEIGHT, Math.ceil(contentHeight)));
    };

    resizeToContent();
    editorDisposablesRef.current.forEach((item) => item.dispose());
    editorDisposablesRef.current = [
      editor.onDidContentSizeChange(({ contentHeight }) => resizeToContent(contentHeight)),
      editor.onDidFocusEditorWidget(() => onFocusChangeRef.current?.(true)),
      editor.onDidBlurEditorWidget(() => onFocusChangeRef.current?.(false)),
    ];
    // Cmd+S (Mac) or Ctrl+S (Windows/Linux) to save
    if (monaco) {
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => {
          onSaveRef.current?.();
        }
      );
    }
  };

  useEffect(() => {
    return () => {
      editorDisposablesRef.current.forEach((item) => item.dispose());
      editorDisposablesRef.current = [];
    };
  }, []);

  // Monaco 는 동적 로드라 마운트가 늦다 — 인스턴스가 생긴 뒤에 포커스를 준다.
  useEffect(() => {
    if (!autoFocus || !editorInstance) return;
    editorInstance.focus();
    onAutoFocusedRef.current?.();
  }, [autoFocus, editorInstance]);

  useEffect(() => {
    if (readOnly || !editorInstance || !pendingReadOnlyFocusRef.current) return;
    pendingReadOnlyFocusRef.current = false;
    editorInstance.focus();
  }, [editorInstance, readOnly]);

  const handleReadOnlyPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!shouldRequestCodeWrite(readOnly, Boolean(onReadOnlyEditIntent))) return;
    // read-only 상태에서 Monaco가 먼저 focus되면 ready 전환 후 focus event가 다시 오지 않아
    // lease 유지 신호를 놓친다. 첫 pointer는 의도만 기록하고 실제 focus는 ready effect가 재생한다.
    event.preventDefault();
    event.stopPropagation();
    pendingReadOnlyFocusRef.current = true;
    onReadOnlyEditIntent?.();
  };

  const handleEditorKeyDownCapture = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isMemoVersionShortcut(event.nativeEvent)) {
      event.preventDefault();
      event.stopPropagation();
      onVersionShortcutRef.current?.();
      return;
    }
    const historyAction = isMemoHistoryShortcut(event.nativeEvent);
    if (!historyAction) return;
    event.preventDefault();
    event.stopPropagation();
    onHistoryShortcutRef.current?.(historyAction);
  };

  return (
    <div
      className="border border-gray-300 rounded overflow-hidden"
      onPointerDownCapture={handleReadOnlyPointerDown}
      onKeyDownCapture={handleEditorKeyDownCapture}
    >
      {/* Language Selector */}
      <div className="bg-gray-800 px-3 py-1.5 flex items-center justify-between">
        <select
          value={selectedLanguage}
          onChange={(e) => handleLanguageSelect(e.target.value)}
          disabled={readOnly}
          aria-label="코드 언어"
          className="bg-gray-700 text-gray-200 text-sm px-2 py-1 rounded border-none outline-none"
        >
          {CODE_LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
      </div>

      {/* Editor */}
      <Editor
        height={`${editorHeight}px`}
        language={selectedLanguage}
        value={value}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        theme={EDITOR_THEME}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: 'on',
          readOnly,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          scrollbar: {
            vertical: 'hidden',
            alwaysConsumeMouseWheel: false,
          },
        }}
      />
    </div>
  );
}
