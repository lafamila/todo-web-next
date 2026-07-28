'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { CODE_LANGUAGES, resolveCodeLanguage } from '@/lib/codeFence';
import { EDITOR_THEME } from '@/lib/constants';

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
  height?: string;
  readOnly?: boolean;
  /** 새로 만들어진 코드블록이면 마운트 직후 편집기로 포커스를 가져온다. */
  autoFocus?: boolean;
  onAutoFocused?: () => void;
  /** 코드편집기 포커스도 "편집 중"이다 — 호출부가 락 유지/해제에 쓴다. */
  onFocusChange?: (focused: boolean) => void;
}

export function MonacoCodeEditor({
  value,
  language,
  onChange,
  onLanguageChange,
  onSave,
  height = '300px',
  readOnly = false,
  autoFocus = false,
  onAutoFocused,
  onFocusChange,
}: MonacoCodeEditorProps) {
  // Monaco 에 없는 id 를 넘기면 하이라이팅이 조용히 꺼지므로 항상 canonical id 로 정규화한다.
  const resolvedLanguage = resolveCodeLanguage(language);
  const [localLanguage, setLocalLanguage] = useState(resolvedLanguage);

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

  const handleEditorChange = (value: string | undefined) => {
    onChange(value || '');
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editorInstance, setEditorInstance] = useState<any>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEditorDidMount = (editor: any, monaco: any) => {
    setEditorInstance(editor);
    editor.onDidFocusEditorWidget(() => onFocusChange?.(true));
    editor.onDidBlurEditorWidget(() => onFocusChange?.(false));
    // Cmd+S (Mac) or Ctrl+S (Windows/Linux) to save
    if (onSave && monaco) {
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => {
          onSave();
        }
      );
    }
  };

  // Monaco 는 동적 로드라 마운트가 늦다 — 인스턴스가 생긴 뒤에 포커스를 준다.
  useEffect(() => {
    if (!autoFocus || !editorInstance) return;
    editorInstance.focus();
    onAutoFocused?.();
  }, [autoFocus, editorInstance, onAutoFocused]);

  return (
    <div className="border border-gray-300 rounded overflow-hidden">
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
        height={height}
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
        }}
      />
    </div>
  );
}
