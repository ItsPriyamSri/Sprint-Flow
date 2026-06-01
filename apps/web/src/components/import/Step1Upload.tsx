'use client';

import { useRef, useState } from 'react';

interface Props {
  onUploaded: (file: File) => void;
  loading: boolean;
  error?: string | null;
}

export function Step1Upload({ onUploaded, loading, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFile = (file: File) => {
    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleUpload = () => {
    if (selectedFile) onUploaded(selectedFile);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Upload your workbook</h2>
        <p className="mt-1 text-sm text-slate-500">
          Drop the Excel workbook you currently use. We'll detect the task list automatically.
        </p>
      </div>

      {/* Drop zone */}
      <div
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 transition ${
          dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 bg-white hover:border-indigo-300 hover:bg-slate-50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <svg className="mb-4 h-12 w-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 48 48">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M28 8H12a4 4 0 00-4 4v24a4 4 0 004 4h24a4 4 0 004-4V20M28 8l12 12M28 8v12h12M20 28l4-4m0 0l4 4m-4-4v12" />
        </svg>

        {selectedFile ? (
          <div className="text-center">
            <p className="font-medium text-slate-700">{selectedFile.name}</p>
            <p className="text-sm text-slate-400">{(selectedFile.size / 1024).toFixed(0)} KB</p>
            <button
              className="mt-2 text-xs text-indigo-500 hover:underline"
              onClick={() => { setSelectedFile(null); if (inputRef.current) inputRef.current.value = ''; }}
            >
              Remove
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500">
              <button
                type="button"
                className="font-medium text-indigo-600 hover:underline"
                onClick={() => inputRef.current?.click()}
              >
                Choose file
              </button>{' '}
              or drag and drop
            </p>
            <p className="mt-1 text-xs text-slate-400">.xlsx or .xls — up to 20 MB</p>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      <button
        onClick={handleUpload}
        disabled={!selectedFile || loading}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {loading ? 'Analysing…' : 'Analyse workbook →'}
      </button>
    </div>
  );
}
