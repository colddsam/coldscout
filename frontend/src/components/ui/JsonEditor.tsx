/**
 * Code-Style JSON Editor Component.
 * 
 * Integrates the Monaco Editor (VS Code core) to provide a rich editing experience
 * for configuration objects, including syntax highlighting and validation.
 */
import Editor from '@monaco-editor/react';

interface JsonEditorProps {
  /** The current JSON string content */
  value: string;
  /** Callback triggered on every change to the editor content */
  onChange: (v: string) => void;
  /** Fixed height of the editor container in pixels */
  height?: number;
}

export default function JsonEditor({ value, onChange, height = 400 }: JsonEditorProps) {
  return (
    <div className="rounded-lg overflow-hidden border border-gray-200">
      <Editor
        height={`${height}px`}
        defaultLanguage="json"
        theme="light"
        value={value}
        onChange={(v) => onChange(v || '')}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: '"JetBrains Mono", monospace',
          scrollBeyondLastLine: false,
          padding: { top: 12, bottom: 12 },
          lineNumbers: 'on',
          renderLineHighlight: 'none',
          wordWrap: 'on',
        }}
      />
    </div>
  );
}
