import React, { useRef, useState } from 'react';
import { FileUp, CheckCircle2, Loader2 } from 'lucide-react';
import { cn, formatFileSize } from '../../lib/utils';

interface FileUploadFieldProps {
  label: string;
  accept?: string;
  maxMb?: number;
  uploading?: boolean;
  selectedFile: File | null;
  onSelectFile: (file: File | null) => void;
  helperText?: string;
}

export function FileUploadField({
  label,
  accept = '.pdf,.docx',
  maxMb = 25,
  uploading = false,
  selectedFile,
  onSelectFile,
  helperText,
}: FileUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files || !files[0]) return;
    onSelectFile(files[0]);
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !uploading && inputRef.current?.click()}
        className={cn(
          'cursor-pointer rounded-lg border border-dashed p-4 transition-colors flex items-center justify-between gap-3',
          dragOver
            ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/30'
            : 'border-slate-300 dark:border-slate-700 hover:border-blue-500 bg-slate-50/50 dark:bg-slate-900/50'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 text-blue-700 dark:text-cyan-400">
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : selectedFile ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <FileUp className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
              {selectedFile ? selectedFile.name : 'Klik atau seret berkas ke area ini'}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {selectedFile
                ? `${formatFileSize(selectedFile.size)} · Siap diunggah`
                : helperText || `Maksimal ${maxMb} MB (${accept})`}
            </p>
          </div>
        </div>
        {selectedFile && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectFile(null);
            }}
            className="text-xs text-slate-500 hover:text-rose-600 px-2 py-1 shrink-0"
          >
            Hapus
          </button>
        )}
      </div>
    </div>
  );
}
