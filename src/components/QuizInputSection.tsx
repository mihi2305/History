import React from 'react';
import { Plus, Trash2, HelpCircle } from 'lucide-react';

interface QuestionRow {
  q_id: string;
  unit: string;
  era: string;
  theme: string;
  answer: string;
}

interface QuizInputSectionProps {
  questions: QuestionRow[];
  setQuestions: (questions: QuestionRow[]) => void;
  gradeLevel: string;
  setGradeLevel: (val: string) => void;
  unit: string;
  setUnit: (val: string) => void;
  sourceTitle: string;
  setSourceTitle: (val: string) => void;
}

export const QuizInputSection: React.FC<QuizInputSectionProps> = ({
  questions,
  setQuestions,
  gradeLevel,
  setGradeLevel,
  unit,
  setUnit,
  sourceTitle,
  setSourceTitle,
}) => {
  const addRow = () => {
    const nextId = `Q${String(questions.length + 1).padStart(2, '0')}`;
    setQuestions([...questions, { q_id: nextId, unit: unit || '', era: '', theme: '', answer: '' }]);
  };

  const removeRow = (index: number) => {
    const newQuestions = questions.filter((_, i) => i !== index);
    setQuestions(newQuestions);
  };

  const updateRow = (index: number, field: keyof QuestionRow, value: string) => {
    const newQuestions = [...questions];
    newQuestions[index] = { ...newQuestions[index], [field]: value };
    setQuestions(newQuestions);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">学年</label>
          <input 
            type="text" 
            value={gradeLevel}
            onChange={(e) => setGradeLevel(e.target.value)}
            placeholder="例: 高校2年"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">主な単元名</label>
          <input 
            type="text" 
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="例: 旧石器・縄文時代"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">教材タイトル (任意)</label>
          <input 
            type="text" 
            value={sourceTitle}
            onChange={(e) => setSourceTitle(e.target.value)}
            placeholder="例: 日本史探究 第1回"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
          />
        </div>
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold">
              <tr>
                <th className="px-4 py-3 w-20">問題ID</th>
                <th className="px-4 py-3">単元</th>
                <th className="px-4 py-3 w-32">時代区分</th>
                <th className="px-4 py-3 w-32">テーマ</th>
                <th className="px-4 py-3 w-24">正答</th>
                <th className="px-4 py-3 w-16 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {questions.map((q, idx) => (
                <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-2">
                    <input 
                      type="text" 
                      value={q.q_id}
                      onChange={(e) => updateRow(idx, 'q_id', e.target.value)}
                      className="w-full bg-transparent border-none focus:ring-0 text-gray-500 font-mono text-xs"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input 
                      type="text" 
                      value={q.unit}
                      onChange={(e) => updateRow(idx, 'unit', e.target.value)}
                      placeholder="例: 縄文文化"
                      className="w-full bg-transparent border-none focus:ring-0 text-sm"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <select 
                      value={q.era}
                      onChange={(e) => updateRow(idx, 'era', e.target.value)}
                      className="w-full bg-transparent border-none focus:ring-0 text-sm appearance-none cursor-pointer"
                    >
                      <option value="">選択...</option>
                      {["旧石器","縄文","弥生","古墳","飛鳥","奈良","平安","鎌倉","室町","戦国","安土桃山","江戸","明治","大正","昭和","平成","令和"].map(era => (
                        <option key={era} value={era}>{era}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <select 
                      value={q.theme}
                      onChange={(e) => updateRow(idx, 'theme', e.target.value)}
                      className="w-full bg-transparent border-none focus:ring-0 text-sm appearance-none cursor-pointer"
                    >
                      <option value="">選択...</option>
                      {["政治","外交","経済","社会","文化"].map(theme => (
                        <option key={theme} value={theme}>{theme}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input 
                      type="text" 
                      value={q.answer}
                      onChange={(e) => updateRow(idx, 'answer', e.target.value)}
                      placeholder="例: ○"
                      className="w-full bg-transparent border-none focus:ring-0 text-sm text-center font-bold"
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button 
                      onClick={() => removeRow(idx)}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                      title="削除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-3 bg-gray-50/50 border-t border-gray-100">
          <button 
            onClick={addRow}
            className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            設問を追加する
          </button>
        </div>
      </div>
      
      <div className="flex items-start gap-2 p-4 bg-blue-50 border border-blue-100 rounded-xl text-blue-700 text-xs">
        <HelpCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p>
          ここで入力した「問題ID」が、次ステップの生徒回答データの列名になります。
          「単元」「時代区分」「テーマ」は、クラスや生徒の弱点分析に使用されます。
        </p>
      </div>
    </div>
  );
};
