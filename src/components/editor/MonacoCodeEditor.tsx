'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { DEFAULT_CODE_LANGUAGE, EDITOR_THEME } from '@/lib/constants';

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
  onSave?: () => void;
  height?: string;
  readOnly?: boolean;
}

export function MonacoCodeEditor({
  value,
  language = DEFAULT_CODE_LANGUAGE,
  onChange,
  onSave,
  height = '300px',
  readOnly = false,
}: MonacoCodeEditorProps) {
  const [selectedLanguage, setSelectedLanguage] = useState(language);

  const handleEditorChange = (value: string | undefined) => {
    onChange(value || '');
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEditorDidMount = (editor: any, monaco: any) => {
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

  const languages = [
    'typescript',
    'javascript',
    'python',
    'java',
    'go',
    'rust',
    'html',
    'css',
    'json',
  ];

  return (
    <div className="border border-gray-300 rounded overflow-hidden">
      {/* Language Selector */}
      <div className="bg-gray-800 px-3 py-1.5 flex items-center justify-between">
        <select
          value={selectedLanguage}
          onChange={(e) => setSelectedLanguage(e.target.value)}
          className="bg-gray-700 text-gray-200 text-sm px-2 py-1 rounded border-none outline-none"
        >
          {languages.map((lang) => (
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
