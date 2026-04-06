import React from 'react';
import { UserPlus, Trash2, AlertCircle } from 'lucide-react';

interface StudentResponseRow {
    student_id: string;
    responses: { [q_id: string]: string };
}

interface StudentResponseTableProps {
    questions: { q_id: string }[];
    responses: StudentResponseRow[];
    setResponses: (responses: StudentResponseRow[]) => void;
}

export const StudentResponseTable: React.FC<StudentResponseTableProps> = ({
    questions,
    responses,
    setResponses,
}) => {
    const addStudent = () => {
        const nextId = `生徒${responses.length + 1}`;
        setResponses([...responses, { student_id: nextId, responses: {} }]);
    };

    const removeStudent = (index: number) => {
        setResponses(responses.filter((_, i) => i !== index));
    };

    const updateStudentId = (index: number, value: string) => {
        const newResponses = [...responses];
        newResponses[index] = { ...newResponses[index], student_id: value };
        setResponses(newResponses);
    };

    const updateResponse = (studentIdx: number, qId: string, value: string) => {
        const newResponses = [...responses];
        newResponses[studentIdx] = {
            ...newResponses[studentIdx],
            responses: { ...newResponses[studentIdx].responses, [qId]: value }
        };
        setResponses(newResponses);
    };

    // Helper to normalize input (○ -> 1, × -> 0, 1 -> 1, 0 -> 0)
    const getCellDisplay = (val: string) => {
        if (val === '1' || val === '○') return '○';
        if (val === '0' || val === '×') return '×';
        return val;
    };

    const getCellClass = (val: string) => {
        if (val === '1' || val === '○') return 'text-emerald-600 font-bold';
        if (val === '0' || val === '×') return 'text-red-500 font-bold';
        if (val === '') return 'bg-yellow-50';
        return 'text-gray-400';
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-gray-700">個別回答データ</h3>
                <button
                    onClick={addStudent}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg text-xs font-bold transition-all"
                >
                    <UserPlus className="w-3.5 h-3.5" />
                    生徒を追加
                </button>
            </div>

            <div className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
                <div className="overflow-x-auto max-h-[500px]">
                    <table className="w-full text-sm text-left border-collapse sticky-header">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold sticky top-0 z-10">
                            <tr>
                                <th className="px-4 py-3 w-40 min-w-[160px] bg-gray-50 sticky left-0 border-r border-gray-200">生徒名 / ID</th>
                                {questions.map(q => (
                                    <th key={q.q_id} className="px-2 py-3 w-16 text-center border-r border-gray-100">
                                        <span className="text-[10px] font-mono block text-gray-400">{q.q_id}</span>
                                    </th>
                                ))}
                                <th className="px-4 py-3 w-16 text-center">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {responses.map((row, sIdx) => (
                                <tr key={sIdx} className="hover:bg-gray-50/30 transition-colors">
                                    <td className="px-4 py-2 bg-white sticky left-0 border-r border-gray-200 z-0">
                                        <input
                                            type="text"
                                            value={row.student_id}
                                            onChange={(e) => updateStudentId(sIdx, e.target.value)}
                                            placeholder="氏名など"
                                            className="w-full bg-transparent border-none focus:ring-0 text-gray-700 font-medium text-sm"
                                        />
                                    </td>
                                    {questions.map(q => {
                                        const val = row.responses[q.q_id] || '';
                                        const isCorrect = val === '1' || val === '○';
                                        const isIncorrect = val === '0' || val === '×';
                                        
                                        return (
                                            <td key={q.q_id} className="px-1 py-1 border-r border-gray-50 min-w-[70px]">
                                                <div className="flex items-center justify-center gap-0.5">
                                                    <button
                                                        onClick={() => updateResponse(sIdx, q.q_id, isCorrect ? '' : '1')}
                                                        className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold transition-all ${
                                                            isCorrect 
                                                            ? 'bg-emerald-500 text-white shadow-sm ring-2 ring-emerald-500/20' 
                                                            : 'bg-gray-50 text-gray-300 hover:bg-emerald-50 hover:text-emerald-400'
                                                        }`}
                                                        title="正解"
                                                    >
                                                        ○
                                                    </button>
                                                    <button
                                                        onClick={() => updateResponse(sIdx, q.q_id, isIncorrect ? '' : '0')}
                                                        className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold transition-all ${
                                                            isIncorrect 
                                                            ? 'bg-red-500 text-white shadow-sm ring-2 ring-red-500/20' 
                                                            : 'bg-gray-50 text-gray-300 hover:bg-red-50 hover:text-red-400'
                                                        }`}
                                                        title="不正解"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            </td>
                                        );
                                    })}
                                    <td className="px-4 py-2 text-center text-gray-300">
                                        <button
                                            onClick={() => removeStudent(sIdx)}
                                            className="p-1.5 hover:text-red-400 transition-colors"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {responses.length === 0 && (
                                <tr>
                                    <td colSpan={questions.length + 2} className="px-4 py-12 text-center text-gray-400">
                                        生徒が登録されていません。上のボタンから追加するか、CSVをインポートしてください。
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="flex items-center gap-2 p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-700 text-[10px]">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <p>
                    各設問の列で「○」または「×」ボタンをクリックして回答を入力してください。
                    再度同じボタンをクリックすると「未回答（空欄）」に戻ります。
                </p>
            </div>
        </div>
    );
};
