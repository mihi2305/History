import React, { useRef } from 'react';
import { Download, Upload, ClipboardPaste, Beaker } from 'lucide-react';

interface StudentResponseRow {
    student_id: string;
    responses: { [q_id: string]: string };
}

interface CsvImportPanelProps {
    questions: { q_id: string }[];
    onImport: (data: StudentResponseRow[]) => void;
    onLoadSample: () => void;
}

export const CsvImportPanel: React.FC<CsvImportPanelProps> = ({
    questions,
    onImport,
    onLoadSample,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const parseCsv = (text: string) => {
        // Detect delimiter (comma or tab)
        const lines = text.trim().split(/\r?\n/);
        if (lines.length < 1) return;

        const firstLine = lines[0];
        const delimiter = firstLine.includes('\t') ? '\t' : (firstLine.includes(',') ? ',' : '\t');

        // Header check
        const header = lines[0].split(delimiter).map(h => h.trim());
        const dataLines = lines.slice(1);

        const importedData: StudentResponseRow[] = dataLines.map(line => {
            const parts = line.split(delimiter).map(p => p.trim());
            const student_id = parts[0] || '不明な生徒';
            const responses: { [q_id: string]: string } = {};

            // Match columns by index if possible, otherwise by header name
            questions.forEach((q, idx) => {
                // Try to find by header name first
                const headerIdx = header.findIndex(h => h === q.q_id);
                if (headerIdx !== -1) {
                    responses[q.q_id] = parts[headerIdx] || '';
                } else if (parts[idx + 1] !== undefined) {
                    // Fallback to position (assuming first col is ID, then questions)
                    responses[q.q_id] = parts[idx + 1];
                }
            });

            return { student_id, responses };
        });

        onImport(importedData);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            parseCsv(text);
        };
        reader.readAsText(file);
    };

    const handlePaste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            parseCsv(text);
        } catch (err) {
            alert('クリップボードの読み取りに失敗しました。直接テキストエリアに貼り付けてください。');
        }
    };

    const downloadTemplate = () => {
        const header = ['生徒名/ID', ...questions.map(q => q.q_id)].join(',');
        const blob = new Blob([header], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'answer_template.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap gap-3">
                <button
                    onClick={handlePaste}
                    className="flex-1 min-w-[150px] flex items-center justify-center gap-2 py-3 bg-white border border-indigo-200 text-indigo-700 rounded-xl hover:bg-indigo-50 transition-all font-bold text-sm shadow-sm"
                >
                    <ClipboardPaste className="w-4 h-4" />
                    貼り付け (Excel/Sheets)
                </button>

                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 min-w-[150px] flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all font-bold text-sm shadow-sm"
                >
                    <Upload className="w-4 h-4" />
                    CSVをアップロード
                </button>

                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".csv,.tsv,.txt"
                    className="hidden"
                />
            </div>

            <div className="flex justify-between items-center text-xs text-gray-500 bg-white/50 p-3 rounded-lg border border-gray-100">
                <div className="flex gap-4">
                    <button
                        onClick={downloadTemplate}
                        className="flex items-center gap-1 hover:text-indigo-600 transition-colors font-medium"
                    >
                        <Download className="w-3 h-3" />
                        CSVテンプレートをDL
                    </button>
                    <span>|</span>
                    <button
                        onClick={onLoadSample}
                        className="flex items-center gap-1 hover:text-indigo-600 transition-colors font-medium"
                    >
                        <Beaker className="w-3 h-3" />
                        サンプル読込
                    </button>
                </div>
                <p className="hidden md:block">※1列目に生徒名、2列目以降に回答(○/×)を並べてください</p>
            </div>

            <div className="relative group">
                <textarea
                    placeholder="ここにExcelやGoogleスプレッドシートからデータをコピーして貼り付けてください..."
                    onChange={(e) => parseCsv(e.target.value)}
                    className="w-full h-24 p-4 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-xs bg-white/80 resize-none font-mono"
                />
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <span className="bg-gray-100 text-[10px] px-2 py-1 rounded text-gray-400 font-bold">手入力も可</span>
                </div>
            </div>
        </div>
    );
};
