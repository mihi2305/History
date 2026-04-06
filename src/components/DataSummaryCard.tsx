import React from 'react';
import { Play, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';

interface DataSummaryCardProps {
    questionCount: number;
    studentCount: number;
    missingDataCount: number;
    onRunAnalysis: () => void;
    isLoading: boolean;
    disabled: boolean;
}

export const DataSummaryCard: React.FC<DataSummaryCardProps> = ({
    questionCount,
    studentCount,
    missingDataCount,
    onRunAnalysis,
    isLoading,
    disabled,
}) => {
    const isHealthy = questionCount > 0 && studentCount > 0 && missingDataCount === 0;

    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden sticky bottom-6 z-20">
            <div className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex flex-wrap gap-8">
                    <div className="space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">問題数</p>
                        <p className="text-2xl font-bold text-gray-800">{questionCount} <span className="text-xs font-normal text-gray-400">問</span></p>
                    </div>
                    <div className="space-y-1 text-center md:text-left">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">生徒数</p>
                        <p className="text-2xl font-bold text-gray-800">{studentCount} <span className="text-xs font-normal text-gray-400">名</span></p>
                    </div>
                    <div className="space-y-1 text-right md:text-left">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">入力欠損</p>
                        <p className={`text-2xl font-bold ${missingDataCount > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                            {missingDataCount} <span className="text-xs font-normal text-gray-400">件</span>
                        </p>
                    </div>
                </div>

                <div className="w-full md:w-auto flex flex-col items-center gap-2">
                    {!isHealthy && studentCount > 0 && (
                        <p className="flex items-center gap-1.5 text-amber-600 text-[10px] font-bold">
                            <AlertTriangle className="w-3 h-3" />
                            {missingDataCount > 0 ? '欠損データがありますが、分析は可能です' : 'データを確認してください'}
                        </p>
                    )}
                    {isHealthy && (
                        <p className="flex items-center gap-1.5 text-emerald-600 text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3" />
                            データの準備が整いました
                        </p>
                    )}

                    <button
                        onClick={onRunAnalysis}
                        disabled={disabled || isLoading || studentCount === 0 || questionCount === 0}
                        className="w-full md:w-auto px-10 py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-xl shadow-indigo-100 group"
                    >
                        {isLoading ? (
                            <span className="flex items-center gap-2">
                                <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                分析を実行中...
                            </span>
                        ) : (
                            <>
                                分析を実行する
                                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
