/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import {
  BookOpen,
  FileText,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  History,
  GraduationCap,
  Layers,
  Database,
  ArrowRight,
  ClipboardList,
  Users,
  Eye,
  Check,
  Upload,
  File,
  TrendingUp,
  TrendingDown,
  User,
  Search,
  Target,
  AlertTriangle,
  Trash2,
  LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QuizInputSection } from './components/QuizInputSection';
import { StudentResponseTable } from './components/StudentResponseTable';
import { CsvImportPanel } from './components/CsvImportPanel';
import { DataSummaryCard } from './components/DataSummaryCard';
import { supabase } from './lib/supabaseClient';

// --- Types ---

interface QuizMeta {
  source_title: string;
  grade_level: string;
  unit: string;
  created_at: string;
  question_count: number;
  notes: string;
}

interface Question {
  q_id: string;
  type: "MCQ" | "TF" | "SA";
  difficulty: "基礎" | "標準" | "発展";
  prompt: string;
  choices?: string[];
  answer: string;
  explanation: string;
  evidence: string;
  tags: {
    era: string;
    theme: string;
    topic: string;
    skill: "用語理解" | "時系列理解" | "因果関係理解" | "比較整理" | "人物政策対応";
  };
}

interface StudentResponse {
  q_id: string;
  correct: number;
}

interface StudentResult {
  student_id: string;
  responses: StudentResponse[];
}

interface AnalysisData {
  analysis_meta: {
    source_title: string;
    unit: string;
    created_at: string;
    student_count: number;
    question_count: number;
    notes: string;
  };
  class_summary: {
    overall_accuracy: number;
    by_era: Array<{ era: string; accuracy: number | null; n_questions: number; confidence: string }>;
    by_theme: Array<{ theme: string; accuracy: number | null; n_questions: number; confidence: string }>;
    by_era_theme: Array<{ era: string; theme: string; accuracy: number | null; n_questions: number; confidence: string }>;
    hard_questions: Array<{
      q_id: string;
      class_accuracy: number;
      type: string;
      difficulty: string;
      tags: { era: string; theme: string };
      likely_pitfall: string;
      teaching_action: string;
    }>;
    teaching_plan_suggestions: Array<{
      priority: number;
      focus: string;
      reason: string;
      next_action: string;
    }>;
  };
  student_summaries: Array<{
    student_id: string;
    overall_accuracy: number | null;
    class_gap: number | null;
    basic_summary: {
      strength_era: string | null;
      strength_theme: string | null;
      weakness_era: string | null;
      weakness_theme: string | null;
      comment: string;
    };
    weak_points: Array<{
      topic: string;
      era: string;
      theme: string;
      skill: string;
      accuracy: number | null;
      priority: number;
      reason: string;
    }>;
    stumbling_types: Array<{
      type: string;
      evidence: string;
    }>;
    recommended_actions: {
      teacher_action: string;
      student_action: string;
    };
    evidence_items: Array<{
      q_id: string;
      topic: string;
      skill: string;
      result: "correct" | "incorrect";
      note: string;
    }>;
  }>;
  data_quality: {
    missing_responses_students: string[];
    invalid_qids: string[];
    notes: string;
  };
}

interface QuizData {
  quiz_meta: QuizMeta;
  questions: Question[];
  quality_checks: {
    uses_only_source_text: boolean;
    no_unknown_facts: boolean;
    mcq_count: number;
    tf_count: number;
    sa_count: number;
  };
}

interface QuestionCardProps {
  question: Question;
  index: number;
  showAnswer: boolean;
}

// --- Constants ---

const SYSTEM_PROMPT = `あなたは「高校日本史の小テスト作成アシスタント」です。
入力された教材テキスト（source_text）だけを根拠に小テストを作成してください。
外部知識で補完して断定しないでください。

## 最重要ルール
1) 出力は JSONのみ（コードフェンス不要）
2) 根拠は必ず source_text 内。曖昧なら作成しない
3) 問題は合計10問（選択式6/正誤2/短答2）
4) 各設問に付ける：q_id, type, difficulty, prompt, choices, answer, explanation, evidence, tags
5) tagsは必ず：era, theme, topic, skill の4項目
6) answerの形式：MCQはA,B,C,Dのいずれか。TFは○か×。SAは正解の文字列。

## 時代（era）候補
["旧石器","縄文","弥生","古墳","飛鳥","奈良","平安","鎌倉","室町","戦国","安土桃山","江戸","明治","大正","昭和","平成","令和"]

## 分野（theme）候補
["政治","外交","経済","社会","文化"]

## topic（具体論点）ルール
- theme より具体的な論点にすること
- 例：「外交」だけではなく「岩倉使節団と条約改正」「日清戦争の原因と結果」など
- 抽象語ではなく、問題が何を問うているかが分かる粒度にする

## skill（問う力の種類）候補（必ずこの中から1つ選ぶ）
["用語理解","時系列理解","因果関係理解","比較整理","人物政策対応"]

## JSONスキーマ
{
  "questions": [
    {
      "q_id": "string",
      "type": "MCQ" | "TF" | "SA",
      "difficulty": "基礎" | "標準" | "発展",
      "prompt": "string",
      "choices": ["string", "string", "string", "string"],
      "answer": "string",
      "explanation": "string",
      "evidence": "string",
      "tags": {
        "era": "string",
        "theme": "string",
        "topic": "string",
        "skill": "用語理解" | "時系列理解" | "因果関係理解" | "比較整理" | "人物政策対応"
      }
    }
  ]
}
`;

const ANALYSIS_PROMPT = `あなたは「高校日本史の成績・指導支援アナリストAI」です。
目的は、先生が個別最適な指導を行うための根拠を整理することです。
単なる時代別・テーマ別集計ではなく、「具体論点（topic）」「つまずきの種類（skill）」「次の指導アクション」まで示してください。

## 絶対ルール
1) 出力は JSONのみ
2) 分析は 入力に含まれるデータのみ で行う（外部知識で補完しない）
3) 生徒ごとに異なる分析になるよう、topic と skill を必ず活用する
4) 抽象的な表現（例：「外交が弱い」だけ）は避け、具体論点に落とす
5) weak_points は最大3件、stumbling_types は最大2件
6) recommended_actions は弱点・つまずきに対応した具体的な指導提案にする
7) class_gap は「個人の正答率 - クラス全体正答率」で計算する
8) evidence_items には必ず q_id, topic, skill, result, note を含める

## stumbling_types の type 候補（固定）
- 用語理解不足
- 時系列整理不足
- 因果関係理解不足
- 比較整理不足
- 人物と政策の対応不足

## stumbling_types 判定ルール
- skill が「用語理解」の問題で誤答が目立つ → 用語理解不足
- skill が「時系列理解」の問題で誤答が目立つ → 時系列整理不足
- skill が「因果関係理解」の問題で誤答が目立つ → 因果関係理解不足
- skill が「比較整理」の問題で誤答が目立つ → 比較整理不足
- skill が「人物政策対応」の問題で誤答が目立つ → 人物と政策の対応不足

## 弱点論点の抽出ルール
- topic 単位で集計する
- 誤答した topic を優先する
- 同じ topic または同系統の skill で複数誤答がある場合は優先度を上げる
- テーマや時代だけで終わらせず、必ず topic ベースで出す

## recommended_actions のルール
- teacher_action は先生が授業・補習でどう支援するか
- student_action は生徒本人に何を復習させるか
- 例：「年表で整理させる」「目的→内容→結果を表にまとめさせる」など

## 出力JSONスキーマ
必ず以下の構造で出力してください。

{
  "analysis_meta": {
    "source_title": "string",
    "unit": "string",
    "created_at": "YYYY-MM-DD",
    "student_count": 0,
    "question_count": 0,
    "notes": "string"
  },
  "class_summary": {
    "overall_accuracy": 0.0,
    "by_era": [
      { "era": "string", "accuracy": 0.0, "n_questions": 0, "confidence": "high" | "medium" | "low" }
    ],
    "by_theme": [
      { "theme": "string", "accuracy": 0.0, "n_questions": 0, "confidence": "high" | "medium" | "low" }
    ],
    "hard_questions": [
      {
        "q_id": "string",
        "class_accuracy": 0.0,
        "likely_pitfall": "string",
        "teaching_action": "string"
      }
    ],
    "teaching_plan_suggestions": [
      { "priority": 1, "focus": "string", "reason": "string", "next_action": "string" }
    ]
  },
  "student_summaries": [
    {
      "student_id": "string",
      "overall_accuracy": 0.0,
      "class_gap": 0.0,
      "basic_summary": {
        "strength_era": "string",
        "strength_theme": "string",
        "weakness_era": "string",
        "weakness_theme": "string",
        "comment": "string"
      },
      "weak_points": [
        { "topic": "string", "era": "string", "theme": "string", "skill": "string", "accuracy": 0.0, "priority": 1, "reason": "string" }
      ],
      "stumbling_types": [
        { "type": "string", "evidence": "string" }
      ],
      "recommended_actions": {
        "teacher_action": "string",
        "student_action": "string"
      },
      "evidence_items": [
        { "q_id": "string", "topic": "string", "skill": "string", "result": "correct" | "incorrect", "note": "string" }
      ]
    }
  ]
}
`;

const GEMINI_API_KEY = "AIzaSyD939RhTsVMUjyy6QyA55_L0Wezg2EZTsE";

export default function App() {
  const [activeTab, setActiveTab] = useState<'generate' | 'analyze'>('generate');
  const [sourceTitle, setSourceTitle] = useState('');
  const [gradeLevel, setGradeLevel] = useState('高校2年');
  const [unit, setUnit] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'validating' | 'analyzing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const [studentResultsInput, setStudentResultsInput] = useState('');

  // New States for Table Input
  const [questionsTable, setQuestionsTable] = useState<any[]>([]);
  const [responsesTable, setResponsesTable] = useState<any[]>([]);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [showAdvancedJson, setShowAdvancedJson] = useState(false);
  const [savedQuizzes, setSavedQuizzes] = useState<any[]>(() => {
    try {
      const cached = localStorage.getItem('hq_saved_quizzes');
      return cached ? JSON.parse(cached) : [];
    } catch (e) {
      return [];
    }
  });
  const [isSaving, setIsSaving] = useState(false);
  const [currentQuizId, setCurrentQuizId] = useState<string | null>(null);
  const [dashboardView, setDashboardView] = useState<'list' | 'detail'>('list');
  const [userMode, setUserMode] = useState<'teacher' | 'student' | null>(null);
  const [studentStep, setStudentStep] = useState<'identity' | 'quiz' | 'finished'>('identity');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [studentName, setStudentName] = useState('');
  const [studentAnswers, setStudentAnswers] = useState<{ [key: string]: string }>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initial fetch
  React.useEffect(() => {
    fetchSavedQuizzes();
  }, []);

  const fetchSavedQuizzes = async () => {
    if (!supabase) {
      console.warn('Supabase is not configured.');
      return;
    }
    try {
      // Fetch quizzes with counts of related data
      const { data, error } = await supabase
        .from('quizzes')
        .select(`
          *,
          questions:questions(count),
          responses:student_responses(count),
          analysis:analysis_results(id)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Map to a cleaner format
      const mapped = (data || []).map(q => ({
        ...q,
        questionCount: q.questions?.[0]?.count || 0,
        responseCount: q.responses?.[0]?.count || 0, // This is count of rows, not necessarily student count. Let's fix that if needed.
        hasAnalysis: !!q.analysis && q.analysis.length > 0
      }));

      setSavedQuizzes(mapped);
      localStorage.setItem('hq_saved_quizzes', JSON.stringify(mapped));
    } catch (err: any) {
      console.error('Error fetching quizzes:', err);
    }
  };

  const saveQuizToDB = async () => {
    if (!quizData) return;
    if (!supabase) {
      alert('データベースが設定されていません。.envファイルの設定を確認してください。');
      return;
    }
    setIsSaving(true);
    try {
      // 1. Save/Update metadata (Upsert)
      const quizPayload: any = {
        source_title: quizData.quiz_meta.source_title,
        grade_level: quizData.quiz_meta.grade_level,
        unit: quizData.quiz_meta.unit,
        source_text: sourceText,
        question_count: quizData.quiz_meta.question_count
      };

      if (currentQuizId) {
        quizPayload.id = currentQuizId;
      }

      let { data: quizMeta, error: metaError } = await supabase
        .from('quizzes')
        .upsert(quizPayload)
        .select()
        .single();

      // Retry once if error
      if (metaError) {
        console.warn('Initial upsert failed, retrying once...', metaError);
        const retry = await supabase.from('quizzes').upsert(quizPayload).select().single();
        quizMeta = retry.data;
        metaError = retry.error;
      }

      if (metaError || !quizMeta) throw metaError || new Error('Quiz data could not be saved.');
      setCurrentQuizId(quizMeta.id);

      const isUpdate = !!quizPayload.id;

      // 2. Clear existing related data (if updating)
      if (isUpdate) {
        await supabase.from('questions').delete().eq('quiz_id', quizMeta.id);
        await supabase.from('student_responses').delete().eq('quiz_id', quizMeta.id);
        await supabase.from('analysis_results').delete().eq('quiz_id', quizMeta.id);
      }

      // 3. Save questions
      const questionRows = quizData.questions.map(q => ({
        quiz_id: quizMeta.id,
        q_id: q.q_id,
        type: q.type,
        difficulty: q.difficulty,
        prompt: q.prompt,
        choices: q.choices,
        answer: q.answer,
        explanation: q.explanation,
        evidence: q.evidence,
        tags: q.tags
      }));

      let { error: questionsError } = await supabase
        .from('questions')
        .insert(questionRows);

      if (questionsError) {
        console.warn('Initial questions insert failed, retrying once...', questionsError);
        const retry = await supabase.from('questions').insert(questionRows);
        questionsError = retry.error;
      }

      if (questionsError) throw questionsError;

      // 4. Save student responses (if any)
      if (responsesTable.length > 0) {
        const responseRows: any[] = [];
        responsesTable.forEach(row => {
          Object.entries(row.responses).forEach(([q_id, val]) => {
            let correct = 0;
            if (val === '1' || val === '○') correct = 1;
            responseRows.push({
              quiz_id: quizMeta.id,
              student_id: row.student_id,
              q_id: q_id,
              correct: correct
            });
          });
        });
        if (responseRows.length > 0) {
          const { error: respError } = await supabase.from('student_responses').insert(responseRows);
          if (respError) throw respError;
        }
      }

      // 5. Save analysis data (if any)
      if (analysisData) {
        const { error: analysisError } = await supabase.from('analysis_results').insert({
          quiz_id: quizMeta.id,
          class_summary: analysisData.class_summary,
          student_summaries: analysisData.student_summaries
        });
        if (analysisError) throw analysisError;
      }

      alert(currentQuizId ? '更新しました。' : 'データベースに保存しました。');
      fetchSavedQuizzes();
    } catch (err: any) {
      console.error('Error saving quiz:', err);
      alert(`保存に失敗しました: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteQuizFromDB = async (quizId: string) => {
    if (!supabase) return;
    if (!confirm('このクイズと関連する問題・データをすべて削除しますか？')) return;

    try {
      setIsSaving(true);
      const { error } = await supabase
        .from('quizzes')
        .delete()
        .eq('id', quizId);

      if (error) throw error;

      alert('削除しました。');
      if (quizId === currentQuizId) {
        setCurrentQuizId(null);
      }
      fetchSavedQuizzes();
    } catch (err: any) {
      console.error('Error deleting quiz:', err);
      alert(`削除に失敗しました: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const loadQuizFromDB = async (quizId: string, targetView?: 'analysis' | 'detail') => {
    if (!supabase) return;
    try {
      setIsLoading(true);
      // 1. Fetch metadata
      const { data: quizMeta, error: metaError } = await supabase
        .from('quizzes')
        .select('*')
        .eq('id', quizId)
        .single();

      if (metaError) throw metaError;

      // 2. Fetch questions
      const { data: questions, error: questionsError } = await supabase
        .from('questions')
        .select('*')
        .eq('quiz_id', quizId)
        .order('q_id', { ascending: true });

      if (questionsError) throw questionsError;

      // 3. Fetch student responses
      const { data: responses, error: responsesError } = await supabase
        .from('student_responses')
        .select('*')
        .eq('quiz_id', quizId);

      if (responsesError) throw responsesError;
      
      const { data: analysis, error: analysisError } = await supabase
        .from('analysis_results')
        .select('*')
        .eq('quiz_id', quizId)
        .maybeSingle();

      if (analysisError) throw analysisError;

      // 5. Build objects locally to avoid stale state issues
      const finalQuestions = (questions || []).map((q: any) => ({
        q_id: q.q_id,
        type: q.type,
        difficulty: q.difficulty,
        prompt: q.prompt,
        choices: q.choices,
        answer: q.answer,
        explanation: q.explanation,
        evidence: q.evidence,
        tags: q.tags
      }));

      const loadedQuiz: QuizData = {
        quiz_meta: {
          source_title: quizMeta.source_title,
          grade_level: quizMeta.grade_level,
          unit: quizMeta.unit,
          created_at: quizMeta.created_at,
          question_count: quizMeta.question_count,
          notes: "Database loaded"
        },
        questions: finalQuestions,
        quality_checks: {
          uses_only_source_text: true,
          no_unknown_facts: true,
          mcq_count: 0,
          tf_count: 0,
          sa_count: 0
        }
      };

      // Reconstruct tables
      const studentMap: { [sid: string]: any } = {};
      (responses || []).forEach((r: any) => {
        if (!studentMap[r.student_id]) {
          studentMap[r.student_id] = { student_id: r.student_id, responses: {} };
        }
        studentMap[r.student_id].responses[r.q_id] = r.correct === 1 ? '1' : '0';
      });
      const finalResponsesTable = Object.values(studentMap);

      let finalAnalysisData: AnalysisData | null = null;
      if (analysis) {
        finalAnalysisData = {
          analysis_meta: {
            source_title: quizMeta.source_title,
            unit: quizMeta.unit,
            created_at: quizMeta.created_at,
            student_count: analysis.student_summaries?.length || 0,
            question_count: finalQuestions.length,
            notes: "Loaded from DB"
          },
          class_summary: analysis.class_summary,
          student_summaries: analysis.student_summaries,
          data_quality: { missing_responses_students: [], invalid_qids: [], notes: "" }
        };
      }

      // --- Batch State Updates ---
      setSourceTitle(quizMeta.source_title || '');
      setUnit(quizMeta.unit || '');
      setGradeLevel(quizMeta.grade_level || '高校2年');
      setSourceText(quizMeta.source_text || '');
      setCurrentQuizId(quizId);
      setQuizData(loadedQuiz);
      syncQuizDataToTable(loadedQuiz);
      setResponsesTable(finalResponsesTable);
      
      if (finalAnalysisData) {
        setAnalysisData(finalAnalysisData);
        setAnalysisStatus('success');
      } else {
        setAnalysisData(null);
        setAnalysisStatus('idle');
      }

      // 遷移先の判断
      if (targetView === 'detail') {
        setDashboardView('detail');
        setCurrentStep(4);
      } else if (targetView === 'analysis') {
        setCurrentStep(3);
      } else if (userMode === 'student') {
        // Stay in student mode, continue to identity or quiz
        setStudentStep('identity');
      } else {
        if (finalAnalysisData) {
          setCurrentStep(3);
        } else if (finalResponsesTable.length > 0) {
          setCurrentStep(2);
        } else {
          setCurrentStep(1);
        }
      }
      
      if (!targetView && userMode === 'teacher') {
        alert(finalAnalysisData ? '分析結果を読み込みました。' : 'クイズを読み込みました。');
      }
    } catch (err: any) {
      console.error('Error loading quiz:', err);
      alert(`読み込みに失敗しました: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteStudentResponses = async (quizId: string, studentId: string) => {
    if (!supabase) return;
    if (!confirm(`${studentId}さんの解答データを削除しますか？`)) return;

    try {
      setIsLoading(true);
      const { error } = await supabase
        .from('student_responses')
        .delete()
        .eq('quiz_id', quizId)
        .eq('student_id', studentId);

      if (error) throw error;

      alert('削除しました。');
      // Refresh data
      loadQuizFromDB(quizId, 'detail');
      fetchSavedQuizzes();
    } catch (err: any) {
      console.error('Error deleting responses:', err);
      alert(`削除に失敗しました: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const submitStudentAnswers = async () => {
    if (!studentName || !quizData || !supabase || !currentQuizId) {
      alert('情報を正しく入力してください。');
      return;
    }
    setIsLoading(true);
    try {
      const responseRows = quizData.questions.map(q => {
        const studentAns = studentAnswers[q.q_id] || '';
        let correct = 0;
        
        // --- Robust Answer Matching ---
        const cleanStudentAns = studentAns.trim();
        const cleanCorrectAns = q.answer.trim();

        if (cleanStudentAns === cleanCorrectAns) {
          correct = 1;
        } else if (q.type === 'MCQ') {
          // Check if student selected label matched choice index
          const choiceIndex = cleanStudentAns.charCodeAt(0) - 65; // A=0, B=1...
          if (choiceIndex >= 0 && q.choices && q.choices[choiceIndex]) {
            if (q.choices[choiceIndex] === cleanCorrectAns) {
              correct = 1;
            }
          }
        } else if (q.type === 'TF') {
          const normalize = (val: string) => val.replace(/^(1|true|正|○)$/i, '○').replace(/^(0|false|誤|×)$/i, '×').trim();
          if (normalize(cleanStudentAns) === normalize(cleanCorrectAns)) {
            correct = 1;
          }
        }

        return {
          quiz_id: currentQuizId,
          student_id: studentName,
          q_id: q.q_id,
          correct: correct
        };
      });

      let { error } = await supabase.from('student_responses').insert(responseRows);
      
      // --- Auto-retry (One time) to handle transient failures ---
      if (error) {
        console.warn('Initial submission failed, retrying once...', error);
        const retry = await supabase.from('student_responses').insert(responseRows);
        error = retry.error;
      }

      if (error) throw error;

      setStudentStep('finished');
      setIsSubmitted(true);
    } catch (err: any) {
      console.error('Error submitting responses:', err);
      alert(`提出に失敗しました: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Set source title if empty
    if (!sourceTitle) {
      setSourceTitle(file.name.replace(/\.[^/.]+$/, ""));
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setSourceText(content);
    };

    if (file.type === "application/pdf" || file.name.endsWith(".pdf") || file.name.endsWith(".docx")) {
      setError("PDFやWordファイルは現在テキスト形式のみ対応しています。テキストをコピーして貼り付けるか、テキストファイル(.txt)をご使用ください。");
      return;
    }

    reader.readAsText(file);
  };

  const syncQuizDataToTable = (data: any) => {
    const table = (data?.questions || []).map((q: any) => ({
      q_id: q?.q_id || '',
      unit: data?.quiz_meta?.unit || unit || '',
      era: q?.tags?.era || '',
      theme: q?.tags?.theme || '',
      topic: q?.tags?.topic || '',
      skill: q?.tags?.skill || '',
      answer: q?.answer || ''
    }));
    setQuestionsTable(table);
  };

  const syncTableToQuizData = (): QuizData | null => {
    if (questionsTable.length === 0) return null;
    return {
      quiz_meta: {
        source_title: sourceTitle,
        grade_level: gradeLevel,
        unit: unit,
        created_at: new Date().toISOString().split('T')[0],
        question_count: questionsTable.length,
        notes: "Table input"
      },
      questions: questionsTable.map(q => ({
        q_id: q.q_id,
        type: "SA",
        difficulty: "標準",
        prompt: `${q.unit}についての問題 (${q.q_id})`,
        answer: q.answer,
        explanation: "",
        evidence: "",
        tags: {
          era: q.era,
          theme: q.theme,
          topic: q.topic || '手動入力',
          skill: q.skill || '用語理解'
        }
      })),
      quality_checks: {
        uses_only_source_text: true,
        no_unknown_facts: true,
        mcq_count: 0,
        tf_count: 0,
        sa_count: questionsTable.length
      }
    };
  };

  const syncTableToStudentResults = () => {
    return responsesTable.map(row => ({
      student_id: row.student_id,
      responses: Object.entries(row.responses).map(([q_id, way]) => {
        let correct = 0;
        if (way === '1' || way === '○') correct = 1;
        return { q_id, correct };
      })
    }));
  };

  const loadSampleData = () => {
    setUnit("旧石器・縄文時代");
    setGradeLevel("高校2年");
    setSourceTitle("第1回 模擬テスト");

    const sampleQuestions = [
      { q_id: "Q01", unit: "旧石器文化", era: "旧石器", theme: "文化", topic: "打製石器の特徴", skill: "用語理解", answer: "打製石器" },
      { q_id: "Q02", unit: "縄文の生活", era: "縄文", theme: "社会", topic: "竪穴住居の構造", skill: "因果関係理解", answer: "竪穴住居" },
      { q_id: "Q03", unit: "縄文の道具", era: "縄文", theme: "文化", topic: "磨製石器の出現", skill: "時系列理解", answer: "磨製石器" },
      { q_id: "Q04", unit: "三内丸山遺跡", era: "縄文", theme: "社会", topic: "巨大木柱建物跡", skill: "比較整理", answer: "青森県" },
    ];
    setQuestionsTable(sampleQuestions);

    const sampleResponses = [
      { student_id: "佐藤 太郎", responses: { Q01: "1", Q02: "1", Q03: "1", Q04: "1" } },
      { student_id: "鈴木 花子", responses: { Q01: "1", Q02: "0", Q03: "1", Q04: "1" } },
      { student_id: "高橋 健二", responses: { Q01: "0", Q02: "0", Q03: "1", Q04: "0" } },
    ];
    setResponsesTable(sampleResponses);

    setSourceText(`日本列島には、古くから人類が住んでいました。
旧石器時代の人々は、打製石器を使い、狩猟や採集を中心とした生活を送っていました。
縄文時代になると、磨製石器や縄文土器が作られるようになり、定住生活が始まりました。
竪穴住居と呼ばれる、地面を掘り下げて作られた住まいが一般的になり、人々は集落を作って暮らすようになりました。
青森県の三内丸山遺跡は、大規模な集落跡として知られています。`);
  };

  const generateQuiz = async () => {
    if (!sourceText || !unit) {
      setError('教材テキストと単元名は必須です。');
      return;
    }

    setIsLoading(true);
    setError(null);
    setQuizData(null);
    setCurrentQuizId(null);

    try {
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

      const result = await ai.models.generateContent({ 
        model: "gemini-2.5-flash",
        config: {
          systemInstruction: SYSTEM_PROMPT,
        },
        contents: [{
          role: 'user', parts: [{
            text: JSON.stringify({
              source_title: sourceTitle,
              grade_level: gradeLevel,
              unit: unit,
              source_text: sourceText,
              question_count: 10,
              constraints: {
                avoid_trivia: true,
                focus_on_core_concepts: true
              }
            })
          }]
        }],
      });

      let text = result.text;

      if (!text) throw new Error("AIからの応答が空でした。");

      // Sanitize JSON (remove markdown code blocks if present)
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const rawData = JSON.parse(cleanJson);

      // Normalize data to prevent crashes
      const normalizedData: QuizData = {
        quiz_meta: {
          source_title: rawData?.quiz_meta?.source_title || sourceTitle,
          grade_level: rawData?.quiz_meta?.grade_level || gradeLevel,
          unit: rawData?.quiz_meta?.unit || unit,
          created_at: rawData?.quiz_meta?.created_at || new Date().toISOString().split('T')[0],
          question_count: rawData?.questions?.length || 0,
          notes: rawData?.quiz_meta?.notes || "AI Generated"
        },
        questions: (rawData?.questions || []).map((q: any, idx: number) => ({
          q_id: q?.q_id || `Q${idx + 1}`,
          type: q?.type || "SA",
          difficulty: q?.difficulty || "標準",
          prompt: q?.prompt || "",
          choices: q?.choices || [],
          answer: q?.answer || "",
          explanation: q?.explanation || "",
          evidence: q?.evidence || "",
          tags: {
            era: q?.tags?.era || "",
            theme: q?.tags?.theme || "",
            topic: q?.tags?.topic || "",
            skill: q?.tags?.skill || "用語理解"
          }
        })),
        quality_checks: rawData?.quality_checks || {
          uses_only_source_text: true,
          no_unknown_facts: true,
          mcq_count: 0,
          tf_count: 0,
          sa_count: 0
        }
      };

      setQuizData(normalizedData);
      syncQuizDataToTable(normalizedData);
      // Removed automatic transition to Step 2 to allow preview in Step 1
      // setCurrentStep(2);

    } catch (err: any) {
      console.error(err);
      setError(`クイズの生成中にエラーが発生しました: ${err.message || '不明なエラー'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const analyzeResults = async () => {
    const finalQuizData = syncTableToQuizData();
    const studentResults = syncTableToStudentResults();

    setAnalysisStatus('validating');
    setError(null);

    // Validation
    if (!finalQuizData || questionsTable.length === 0) {
      setAnalysisStatus('error');
      setError('問題データ（Step 1）が入力されていません。');
      return;
    }
    if (studentResults.length === 0) {
      setAnalysisStatus('error');
      setError('生徒の回答データ（Step 2）が入力されていません。');
      return;
    }

    // Check for missing responses (optional but good to warn)
    const totalMissing = responsesTable.reduce((acc, row) => {
      const rowMissing = questionsTable.filter(q => !row.responses[q.q_id]).length;
      return acc + rowMissing;
    }, 0);

    setAnalysisStatus('analyzing');

    try {
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        config: {
          systemInstruction: ANALYSIS_PROMPT,
          responseMimeType: "application/json",
        },
        contents: [{
          role: 'user', parts: [{
            text: JSON.stringify({
              quiz_json: finalQuizData,
              student_results: studentResults,
              history_results_30d: [],
              analysis_config: {
                min_questions_for_confidence: 6,
                top_k: 3,
                max_weak_points: 3,
                max_stumbling_types: 2,
                require_topic_based_analysis: true,
                require_actionable_feedback: true
              }
            })
          }]
        }],
      });

      let text = result.text;

      if (!text) throw new Error("AIからの応答が空でした。");

      // Sanitize JSON
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const rawAnalysis = JSON.parse(cleanJson);

      // Normalize analysis data to ensure Class Summary is populated
      const normalizedAnalysis: AnalysisData = {
        analysis_meta: {
          source_title: rawAnalysis?.analysis_meta?.source_title || sourceTitle || "無題の小テスト",
          unit: rawAnalysis?.analysis_meta?.unit || unit || "未設定",
          created_at: rawAnalysis?.analysis_meta?.created_at || new Date().toISOString().split('T')[0],
          student_count: rawAnalysis?.analysis_meta?.student_count || rawAnalysis?.student_summaries?.length || studentResults.length,
          question_count: rawAnalysis?.analysis_meta?.question_count || questionsTable.length,
          notes: rawAnalysis?.analysis_meta?.notes || ""
        },
        class_summary: {
          overall_accuracy: typeof rawAnalysis?.class_summary?.overall_accuracy === 'number' 
            ? rawAnalysis.class_summary.overall_accuracy 
            : (rawAnalysis?.student_summaries?.reduce((acc: number, s: any) => acc + (s.overall_accuracy || 0), 0) / (rawAnalysis?.student_summaries?.length || 1)),
          by_era: rawAnalysis?.class_summary?.by_era || [],
          by_theme: rawAnalysis?.class_summary?.by_theme || [],
          by_era_theme: rawAnalysis?.class_summary?.by_era_theme || [],
          hard_questions: rawAnalysis?.class_summary?.hard_questions || [],
          teaching_plan_suggestions: rawAnalysis?.class_summary?.teaching_plan_suggestions || []
        },
        student_summaries: rawAnalysis?.student_summaries || [],
        data_quality: rawAnalysis?.data_quality || {
          missing_responses_students: [],
          invalid_qids: [],
          notes: ""
        }
      };

      setAnalysisData(normalizedAnalysis);
      setCurrentStep(3); // Advance to analysis screen on success
      setAnalysisStatus('success');

    } catch (err: any) {
      console.error(err);
      setAnalysisStatus('error');
      setError(`分析中にエラーが発生しました: ${err.message || '不明なエラー'}`);
    }
  };

  const missingResponses = responsesTable.reduce((acc, row) => {
    const rowMissing = questionsTable.filter(q => !row.responses[q.q_id]).length;
    return acc + rowMissing;
  }, 0);

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-indigo-100 pb-20">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div 
            className="flex items-center gap-2 cursor-pointer group"
            onClick={() => setUserMode(null)}
          >
            <div className="bg-indigo-600 p-1.5 rounded-lg group-hover:scale-110 transition-transform">
              <History className="w-5 h-5 text-white" />
            </div>
            <div>
               <h1 className="text-lg font-bold tracking-tight leading-none group-hover:text-indigo-600 transition-colors">History Quiz Pro</h1>
               <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{userMode === 'teacher' ? 'Teacher Console' : userMode === 'student' ? 'Student Hub' : ''}</span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-6">
            {userMode === 'teacher' && (
              <div className="flex bg-gray-100 p-1 rounded-xl">
                {[1, 2, 3].map((step) => (
                  <button
                    key={step}
                    onClick={() => {
                      if (step === 3 && analysisStatus === 'idle') return;
                      setCurrentStep(step as 1 | 2 | 3);
                    }}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${currentStep === step
                      ? 'bg-white shadow-sm text-indigo-600'
                      : (step === 3 && analysisStatus === 'idle') ? 'opacity-50 cursor-not-allowed text-gray-400' : 'text-gray-400 hover:text-gray-600'
                      }`}
                  >
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${currentStep === step ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-400'
                      }`}>
                      {step}
                    </span>
                    {step === 1 ? '問題入力' : step === 2 ? '回答入力' : '分析結果'}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {userMode && (
              <button
                onClick={() => {
                  setUserMode(null);
                  setQuizData(null);
                  setCurrentQuizId(null);
                  setAnalysisData(null);
                  setAnalysisStatus('idle');
                  setIsSubmitted(false);
                  setStudentStep('identity');
                  setCurrentQuestionIndex(0);
                  setCurrentStep(1); // 初期状態に戻す
                }}
                className="text-xs font-bold px-3 py-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-all flex items-center gap-1.5"
              >
                <LogOut className="w-4 h-4" />
                切替
              </button>
            )}
            <div className="h-4 w-px bg-gray-200 mx-1" />
            {userMode === 'teacher' && (
              <>
                <button
                  onClick={() => {
                    fetchSavedQuizzes();
                    setCurrentStep(4);
                    setDashboardView('list');
                  }}
                  className={`text-xs font-bold transition-all px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${currentStep === 4 ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:text-indigo-600'}`}
                >
                  <Database className="w-4 h-4" />
                  管理パネル
                </button>
                <div className="h-4 w-px bg-gray-200 mx-1" />
              </>
            )}
            <button
              onClick={loadSampleData}
              className="text-xs font-bold text-gray-400 hover:text-indigo-600 transition-colors"
            >
              サンプル読込
            </button>
            <div className="h-4 w-px bg-gray-200 mx-1" />
            <span className="flex items-center gap-1 text-xs text-gray-500 font-medium">
              <GraduationCap className="w-4 h-4" />
              高校日本史
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {!userMode && (
             <motion.div
               key="modeSelection"
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 1.05 }}
               className="min-h-[70vh] flex flex-col items-center justify-center space-y-12"
             >
                <div className="text-center space-y-4">
                  <h2 className="text-5xl font-black text-gray-900 tracking-tight">ようこそ、History Quiz Pro へ</h2>
                  <p className="text-gray-400 font-bold text-lg">あなたの役割を選択してください。どちらのモードでアプリを使用しますか？</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-5xl">
                  {/* Teacher Card */}
                  <div 
                    onClick={() => {
                      setUserMode('teacher');
                      setCurrentStep(4 as any);
                    }}
                    className="p-10 bg-white rounded-[3rem] border-2 border-gray-100 shadow-sm hover:shadow-2xl hover:border-indigo-600 hover:-translate-y-2 transition-all cursor-pointer group"
                  >
                    <div className="w-20 h-20 bg-indigo-50 rounded-[2rem] flex items-center justify-center mb-8 group-hover:bg-indigo-600 transition-colors">
                      <GraduationCap className="w-10 h-10 text-indigo-600 group-hover:text-white" />
                    </div>
                    <div className="space-y-4">
                      <h3 className="text-3xl font-black text-gray-800">先生用モード</h3>
                      <p className="text-gray-500 font-medium leading-relaxed">
                        教材の読み込み、AIによる問題作成、生徒の回答データ管理、クラス全体の傾向分析など、すべての教育支援機能が利用できます。
                      </p>
                      <div className="pt-4 flex items-center text-indigo-600 font-bold gap-2">
                         管理画面へ進む <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform" />
                      </div>
                    </div>
                  </div>

                  {/* Student Card */}
                  <div 
                    onClick={() => {
                      setUserMode('student');
                      setQuizData(null);
                      setStudentStep('identity');
                      setCurrentQuestionIndex(0);
                      fetchSavedQuizzes();
                    }}
                    className="p-10 bg-white rounded-[3rem] border-2 border-gray-100 shadow-sm hover:shadow-2xl hover:border-emerald-600 hover:-translate-y-2 transition-all cursor-pointer group"
                  >
                    <div className="w-20 h-20 bg-emerald-50 rounded-[2rem] flex items-center justify-center mb-8 group-hover:bg-emerald-600 transition-colors">
                      <BookOpen className="w-10 h-10 text-emerald-600 group-hover:text-white" />
                    </div>
                    <div className="space-y-4">
                      <h3 className="text-3xl font-black text-gray-800">生徒用モード</h3>
                      <p className="text-gray-500 font-medium leading-relaxed">
                        先生が作成したクイズに挑戦し、回答を送信します。自分の理解度を確認し、歴史の学習を深めましょう。
                      </p>
                      <div className="pt-4 flex items-center text-emerald-600 font-bold gap-2">
                         解答ページへ進む <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-8 text-[10px] text-gray-300 font-black uppercase tracking-[0.3em]">
                   Powered by Google Gemini AI & Supabase
                </div>

             </motion.div>
          )}

          {userMode === 'teacher' && currentStep === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-5 space-y-6">
                  <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                      <h2 className="font-bold flex items-center gap-2 text-gray-700">
                        <FileText className="w-5 h-5 text-indigo-600" />
                        AIで問題を自動生成
                      </h2>
                    </div>
                    <div className="p-6 space-y-4">
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">教材テキスト (source_text)</label>
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors bg-indigo-50 px-2 py-1 rounded-lg"
                          >
                            <Upload className="w-3 h-3" />
                            ファイルをアップロード
                          </button>
                          <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleFileUpload} 
                            className="hidden" 
                            accept=".txt,.md,.csv" 
                          />
                        </div>
                        <textarea
                          value={sourceText}
                          onChange={(e) => setSourceText(e.target.value)}
                          placeholder="教科書やプリントのテキストを貼り付けてください。AIがこれに基づき問題を作成します。"
                          className="w-full h-64 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm resize-none leading-relaxed"
                        />
                        <div className="flex justify-between items-center text-[10px] text-gray-400">
                          <span>※このテキストのみを根拠にクイズが生成されます。</span>
                          {sourceText && (
                            <button onClick={() => setSourceText('')} className="text-red-400 hover:text-red-500 font-bold uppercase tracking-tighter">クリア</button>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={generateQuiz}
                        disabled={isLoading || !sourceText || !unit}
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-200"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            生成中...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            AI小テストを生成する
                          </>
                        )}
                      </button>

                      {quizData && (
                        <button
                          onClick={saveQuizToDB}
                          disabled={isSaving}
                          className="w-full py-3 bg-white border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50 rounded-xl font-bold flex items-center justify-center gap-2 transition-all mt-2"
                        >
                          {isSaving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Database className="w-4 h-4" />
                          )}
                          データベースに保存
                        </button>
                      )}
                    </div>
                  </section>
                </div>

                <div className="lg:col-span-1 flex items-center justify-center text-gray-300">
                  <div className="h-full w-px bg-gradient-to-b from-transparent via-gray-200 to-transparent hidden lg:block" />
                  <span className="bg-white px-2 py-1 text-[10px] font-bold tracking-widest uppercase">OR</span>
                </div>

                <div className="lg:col-span-6 space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="font-bold flex items-center gap-2 text-gray-700">
                      <ClipboardList className="w-5 h-5 text-indigo-600" />
                      問題データを手動で入力・編集
                    </h2>
                    <button
                      onClick={() => setShowAdvancedJson(!showAdvancedJson)}
                      className="text-[10px] font-bold text-gray-400 hover:text-indigo-600 uppercase tracking-tighter"
                    >
                      {showAdvancedJson ? 'JSONを隠す' : 'JSONを表示'}
                    </button>
                  </div>

                  {showAdvancedJson && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="overflow-hidden"
                    >
                      <textarea
                        value={JSON.stringify(questionsTable, null, 2)}
                        readOnly
                        className="w-full h-32 p-3 bg-gray-900 text-indigo-300 font-mono text-[10px] rounded-xl border border-gray-800"
                      />
                    </motion.div>
                  )}

                  {quizData && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                          <Eye className="w-4 h-4 text-indigo-600" />
                          生成された問題のプレビュー
                        </h3>
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          生成完了
                        </span>
                      </div>
                      <div className="bg-white border-2 border-indigo-50 rounded-2xl p-2 max-h-[500px] overflow-y-auto space-y-4 custom-scrollbar">
                        {quizData.questions.map((q, i) => (
                          <div key={q.q_id || i}>
                            <QuestionCard question={q} index={i + 1} showAnswer={true} />
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  <QuizInputSection
                    questions={questionsTable}
                    setQuestions={setQuestionsTable}
                    gradeLevel={gradeLevel}
                    setGradeLevel={setGradeLevel}
                    unit={unit}
                    setUnit={setUnit}
                    sourceTitle={sourceTitle}
                    setSourceTitle={setSourceTitle}
                  />

                  {questionsTable.length > 0 && (
                    <div className="flex justify-end">
                      <button
                        onClick={() => setCurrentStep(2)}
                        className="px-6 py-3 bg-white border border-indigo-200 text-indigo-600 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-50 transition-all shadow-sm"
                      >
                        次へ：生徒回答を入力
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {userMode === 'teacher' && currentStep === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
                      <Users className="w-6 h-6" />
                    </div>
                    生徒の回答データを入力
                  </h2>
                  <p className="text-gray-500 mt-1 ml-13">CSVのインポートまたは表への直接入力が可能です。</p>
                </div>
                <button
                  onClick={() => setCurrentStep(1)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-500 hover:bg-white transition-all"
                >
                  問題入力に戻る
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-4">
                  <CsvImportPanel
                    questions={questionsTable}
                    onImport={(data) => setResponsesTable(data)}
                    onLoadSample={loadSampleData}
                  />
                </div>
                <div className="lg:col-span-8">
                  <StudentResponseTable
                    questions={questionsTable}
                    responses={responsesTable}
                    setResponses={setResponsesTable}
                  />
                </div>
              </div>

              <DataSummaryCard
                questionCount={questionsTable.length}
                studentCount={responsesTable.length}
                missingDataCount={missingResponses}
                onRunAnalysis={analyzeResults}
                isLoading={analysisStatus === 'analyzing' || analysisStatus === 'validating'}
                disabled={questionsTable.length === 0}
              />
            </motion.div>
          )}

          {userMode === 'teacher' && currentStep === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-8"
            >
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                      <div className="bg-indigo-600 p-2 rounded-2xl shadow-lg shadow-indigo-100">
                        <Database className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-black text-gray-800 tracking-tight">AI 診断レポート</h2>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Analysis Results</p>
                      </div>
                    </div>

                    <button
                      onClick={saveQuizToDB}
                      disabled={isSaving}
                      className="flex items-center gap-2 px-6 py-2.5 bg-white border border-gray-200 text-indigo-600 font-bold rounded-xl shadow-sm hover:shadow-md transition-all disabled:opacity-50"
                    >
                      {isSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Database className="w-4 h-4" />
                      )}
                      {currentQuizId ? '分析結果を保存 (更新)' : 'DBに保存'}
                    </button>
                  </div>

              {analysisStatus === 'analyzing' && (
                 <div className="flex flex-col items-center justify-center py-20 space-y-4">
                    <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
                    <p className="text-lg font-bold text-gray-600">AIがデータを集計・分析しています...</p>
                 </div>
              )}

              {analysisStatus === 'success' && analysisData ? (
                <div className="space-y-12 pb-20">
                  {/* Summary Overview */}
                  <section className="bg-white p-10 rounded-[3rem] border border-gray-200 shadow-xl overflow-hidden relative group hover:border-indigo-200 transition-all">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50/50 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-indigo-100 transition-colors" />
                    <div className="relative space-y-8">
                      <div className="flex justify-between items-center">
                        <div className="space-y-1">
                          <h3 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em]">Class Summary</h3>
                          <p className="text-3xl font-black text-gray-800 tracking-tighter">
                            {sourceTitle || '無題の小テスト'} / {unit}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-5xl font-black text-indigo-600 tracking-tighter">
                            {typeof analysisData?.class_summary?.overall_accuracy === 'number'
                              ? `${(analysisData.class_summary.overall_accuracy * 100).toFixed(0)}`
                              : '-'}<span className="text-lg font-bold">%</span>
                          </div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">クラス平均正答率</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                          { label: '生徒数', value: analysisData?.analysis_meta?.student_count ?? 0, unit: '名' },
                          { label: '設問数', value: analysisData?.analysis_meta?.question_count ?? 0, unit: '問' },
                          { label: '分析信頼度', value: '高', unit: '' },
                          { label: '日付', value: analysisData?.analysis_meta?.created_at || '-', unit: '' }
                        ].map((stat, i) => (
                          <div key={i} className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{stat.label}</span>
                            <span className="text-lg font-black text-gray-800">{stat.value}<span className="text-xs font-bold ml-0.5">{stat.unit}</span></span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>

                  {/* 診断トピック */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Era Analysis */}
                    <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm">
                      <h4 className="text-sm font-bold text-gray-400 mb-6 flex items-center gap-2 uppercase tracking-tight">
                        時代別到達度
                      </h4>
                      <div className="space-y-6">
                        {(analysisData?.class_summary?.by_era || []).map((era, i) => (
                          <div key={i} className="space-y-2">
                            <div className="flex justify-between items-center text-sm">
                              <span className="font-bold text-gray-700">{era?.era || '-'}</span>
                              <span className="font-mono text-gray-400">{typeof era?.accuracy === 'number' ? `${(era.accuracy * 100).toFixed(0)}%` : '-'}</span>
                            </div>
                            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${(era?.accuracy || 0) * 100}%` }}
                                className={`h-full rounded-full ${era?.accuracy && era.accuracy > 0.7 ? 'bg-emerald-500' : era?.accuracy && era.accuracy < 0.4 ? 'bg-red-500' : 'bg-indigo-500'}`}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm">
                      <h4 className="text-sm font-bold text-gray-400 mb-6 flex items-center gap-2 uppercase tracking-tight">
                        テーマ別到達度
                      </h4>
                      <div className="space-y-6">
                        {(analysisData?.class_summary?.by_theme || []).map((theme, i) => (
                          <div key={i} className="space-y-2">
                            <div className="flex justify-between items-center text-sm">
                              <span className="font-bold text-gray-700">{theme?.theme || '-'}</span>
                              <span className="font-mono text-gray-400">{typeof theme?.accuracy === 'number' ? `${(theme.accuracy * 100).toFixed(0)}%` : '-'}</span>
                            </div>
                            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${(theme?.accuracy || 0) * 100}%` }}
                                className={`h-full rounded-full ${theme?.accuracy && theme.accuracy > 0.7 ? 'bg-emerald-500' : theme?.accuracy && theme.accuracy < 0.4 ? 'bg-red-500' : 'bg-indigo-500'}`}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Hard Questions */}
                  <section className="space-y-6">
                    <h3 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                      <AlertCircle className="w-6 h-6 text-red-500" />
                      注意が必要な設問
                    </h3>
                    <div className="grid grid-cols-1 gap-6">
                      {(analysisData?.class_summary?.hard_questions || []).map((hq, i) => (
                        <div key={i} className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-8 hover:border-red-100 transition-colors">
                          <div className="md:w-1/3 space-y-4">
                            <div className="flex items-center gap-3">
                              <div className="px-3 py-1 rounded-full text-xs font-black bg-red-50 text-red-600 border border-red-100">
                                正答率: {((hq?.class_accuracy || 0) * 100).toFixed(0)}%
                              </div>
                              <span className="text-xs font-bold text-gray-300 font-mono tracking-tighter">{hq?.q_id || '-'}</span>
                            </div>
                            <p className="text-lg font-bold text-gray-800 leading-snug">
                              {quizData?.questions.find(q => q.q_id === hq?.q_id)?.prompt || questionsTable.find(q => q.q_id === hq?.q_id)?.unit || '設問内容の取得に失敗しました'}
                            </p>
                          </div>
                          <div className="md:w-2/3 grid grid-cols-1 sm:grid-cols-2 gap-8 border-t md:border-t-0 md:border-l border-gray-100 pt-8 md:pt-0 md:pl-8">
                            <div className="space-y-2">
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">予想されるつまずき</p>
                              <p className="text-sm text-gray-600 leading-relaxed font-medium">{hq.likely_pitfall}</p>
                            </div>
                            <div className="space-y-2">
                              <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">指導アクション</p>
                              <p className="text-sm text-indigo-600 leading-relaxed font-bold">{hq.teaching_action}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Student Summaries */}
                  <section className="space-y-6">
                    <div className="flex justify-between items-end">
                      <h3 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                        <Users className="w-6 h-6 text-indigo-600" />
                        生徒別フィードバック
                      </h3>
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">全 {(analysisData?.student_summaries || []).length} 名の分析</p>
                    </div>
                    <div className="space-y-12">
                      {(analysisData?.student_summaries || []).map((student, i) => (
                        <div key={i} className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden scroll-mt-24" id={`student-${student.student_id}`}>
                          {/* Card Header & Achievement Hub */}
                          <div className="bg-gradient-to-r from-indigo-900 to-indigo-800 p-8 text-white">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                              <div className="space-y-1">
                                <div className="flex items-center gap-3">
                                  <h4 className="text-2xl font-black tracking-tighter uppercase">{student?.student_id || '不明'}</h4>
                                  <span className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-bold tracking-widest border border-white/20">STUDENT PROFILE</span>
                                </div>
                                <p className="text-indigo-200 text-sm font-medium">個別の特性に基づいた具体的な指導根拠とアクション提案</p>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 text-center min-w-[100px]">
                                  <p className="text-[10px] font-bold text-indigo-300 uppercase mb-1">正答率</p>
                                  <p className="text-2xl font-black">{typeof student?.overall_accuracy === 'number' ? `${(student.overall_accuracy * 100).toFixed(0)}%` : '-'}</p>
                                </div>
                                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 text-center min-w-[100px]">
                                  <p className="text-[10px] font-bold text-indigo-300 uppercase mb-1">全体比</p>
                                  <div className="flex items-center justify-center gap-1">
                                    <p className="text-2xl font-black">
                                      {student.class_gap !== null ? (student.class_gap >= 0 ? `+${(student.class_gap * 100).toFixed(0)}` : `${(student.class_gap * 100).toFixed(0)}`) : '-'}
                                    </p>
                                    {student.class_gap !== null && (
                                      student.class_gap >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-rose-400" />
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="p-8 space-y-10">
                            {/* Grid: Basic Profile & Cognitive Pattern */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                              {/* Section: Basic Profile */}
                              <div className="space-y-6">
                                <h5 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                  <User className="w-4 h-4 text-indigo-600" /> パフォーマンス・プロファイル
                                </h5>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100/50">
                                    <p className="text-[9px] font-bold text-emerald-600 uppercase mb-1">得意時代</p>
                                    <p className="text-sm font-bold text-emerald-800">{student.basic_summary.strength_era || 'ー'}</p>
                                  </div>
                                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100/50">
                                    <p className="text-[9px] font-bold text-emerald-600 uppercase mb-1">得意分野</p>
                                    <p className="text-sm font-bold text-emerald-800">{student.basic_summary.strength_theme || 'ー'}</p>
                                  </div>
                                  <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100/50">
                                    <p className="text-[9px] font-bold text-rose-600 uppercase mb-1">苦手時代</p>
                                    <p className="text-sm font-bold text-rose-800">{student.basic_summary.weakness_era || 'ー'}</p>
                                  </div>
                                  <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100/50">
                                    <p className="text-[9px] font-bold text-rose-600 uppercase mb-1">苦手分野</p>
                                    <p className="text-sm font-bold text-rose-800">{student.basic_summary.weakness_theme || 'ー'}</p>
                                  </div>
                                </div>
                                <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 relative quote-style">
                                  <p className="text-sm text-gray-600 leading-relaxed italic">{student.basic_summary.comment}</p>
                                </div>
                              </div>

                              {/* Section: Cognitive Patterns (Stumbling Types) */}
                              <div className="space-y-6">
                                <h5 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                  <Search className="w-4 h-4 text-indigo-600" /> 特徴的なつまずきタイプ
                                </h5>
                                <div className="space-y-4">
                                  {student.stumbling_types.map((st, j) => (
                                    <div key={j} className="flex gap-4 p-5 bg-amber-50 rounded-2xl border border-amber-100">
                                      <div className="w-10 h-10 rounded-full bg-amber-200/50 flex flex-shrink-0 items-center justify-center">
                                        <AlertTriangle className="w-5 h-5 text-amber-700" />
                                      </div>
                                      <div className="space-y-1">
                                        <p className="font-bold text-amber-900">{st.type}</p>
                                        <p className="text-xs text-amber-700 leading-relaxed font-medium">{st.evidence}</p>
                                      </div>
                                    </div>
                                  ))}
                                  {student.stumbling_types.length === 0 && (
                                    <p className="text-sm text-gray-400 italic py-4">特筆すべき特徴的なつまずきパターンは見られません。</p>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Section: Priority Topics */}
                            <div className="space-y-6">
                              <h5 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <Target className="w-4 h-4 text-indigo-600" /> 重点復習テーマ（優先順）
                                </h5>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  {student.weak_points.map((wp, j) => (
                                    <div key={j} className="p-6 bg-white rounded-2xl border-2 border-gray-100 space-y-4 hover:border-indigo-100 transition-colors">
                                      <div className="flex items-center justify-between">
                                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${
                                          wp.priority === 1 ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-600'
                                        }`}>
                                          {wp.priority}
                                        </span>
                                        <span className="text-[10px] font-bold text-gray-400 uppercase">{wp.skill}</span>
                                      </div>
                                      <div className="space-y-1">
                                        <p className="text-xs font-bold text-indigo-600">{wp.era} / {wp.theme}</p>
                                        <p className="font-black text-gray-800 leading-tight">{wp.topic}</p>
                                      </div>
                                      <p className="text-[11px] text-gray-500 leading-relaxed border-t border-gray-50 pt-3 italic">
                                        {wp.reason}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Section: Roadmap / Actions */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-1 bg-gray-50 rounded-3xl">
                                <div className="p-8 bg-white rounded-2xl border border-gray-100/50 space-y-4">
                                  <h6 className="text-[11px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                                    <GraduationCap className="w-4 h-4" /> 先生への指導アドバイス
                                  </h6>
                                  <p className="text-sm text-gray-700 leading-relaxed font-medium">
                                    {student.recommended_actions.teacher_action}
                                  </p>
                                </div>
                                <div className="p-8 bg-white rounded-2xl border border-gray-100/50 space-y-4">
                                  <h6 className="text-[11px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                                    <BookOpen className="w-4 h-4" /> 生徒への学習アドバイス
                                  </h6>
                                  <p className="text-sm text-gray-700 leading-relaxed font-medium">
                                    {student.recommended_actions.student_action}
                                  </p>
                                </div>
                              </div>

                              {/* Section: Raw Evidence (Mini table) */}
                              <div className="space-y-4 pt-4 border-t border-gray-100">
                                <h6 className="text-[10px] font-black text-gray-300 uppercase tracking-widest flex items-center gap-1 hover:text-indigo-400 transition-colors">
                                  分析の根拠となった問題
                                </h6>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                  {student.evidence_items.map((ev, k) => (
                                    <div key={k} className="p-3 bg-gray-50/50 rounded-xl flex items-center justify-between gap-3 group border border-transparent hover:border-gray-200 transition-all">
                                      <div className="flex flex-col">
                                        <span className="text-[9px] font-mono text-gray-400">{ev.q_id}</span>
                                        <span className="text-[11px] font-bold text-gray-700 truncate w-32">{ev.topic}</span>
                                      </div>
                                      <div className="flex flex-col items-end">
                                        <span className={`text-[10px] font-bold ${ev.result === 'correct' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                          {ev.result === 'correct' ? '○' : '×'}
                                        </span>
                                        <span className="text-[8px] text-gray-400">{ev.skill}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                      ))}
                    </div>
                  </section>
                </div>
              ) : (
                <div className="h-full min-h-[400px] flex flex-col items-center justify-center space-y-8">
                  {analysisStatus === 'analyzing' || analysisStatus === 'validating' ? (
                    <>
                      <div className="relative">
                        <div className="w-20 h-20 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                        <Database className="w-8 h-8 text-indigo-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                      </div>
                      <div className="text-center space-y-2">
                        <p className="text-xl font-bold text-gray-800">
                          {analysisStatus === 'validating' ? 'データ整合性をチェック中...' : 'AIがデータを多角的に分析中...'}
                        </p>
                        <p className="text-sm text-gray-400 font-medium">クラスの傾向と生徒別の課題を抽出しています</p>
                      </div>
                    </>
                  ) : analysisStatus === 'error' ? (
                    <div className="text-center space-y-6 max-w-md mx-auto">
                      <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto border border-red-100 mb-4">
                        <XCircle className="w-10 h-10 text-red-500" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-xl font-bold text-gray-800">分析を中断しました</p>
                        <p className="text-sm text-red-500 font-medium leading-relaxed">{error}</p>
                      </div>
                      <button
                        onClick={() => setCurrentStep(2)}
                        className="px-8 py-3 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all flex items-center gap-2 mx-auto"
                      >
                        回答入力に戻って修正する
                      </button>
                    </div>
                  ) : (
                    <div className="text-center space-y-6">
                      <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Send className="w-10 h-10 text-indigo-600" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-xl font-bold text-gray-800">分析の準備が整いました</p>
                        <p className="text-sm text-gray-400 font-medium">「回答入力」画面のボタンから分析を開始してください</p>
                      </div>
                      <button
                        onClick={() => setCurrentStep(2)}
                        className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all"
                      >
                        回答入力画面へ
                      </button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {userMode === 'student' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-3xl mx-auto"
            >
              {studentStep === 'finished' ? (
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="bg-white rounded-[4rem] p-16 text-center border border-gray-100 shadow-2xl relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-400" />
                  <div className="w-32 h-32 bg-emerald-50 rounded-[3rem] flex items-center justify-center mx-auto mb-8 relative">
                    <CheckCircle2 className="w-16 h-16 text-emerald-500" />
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1.5, opacity: 0 }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="absolute inset-0 bg-emerald-100 rounded-[3rem] -z-10"
                    />
                  </div>
                  <div className="space-y-4 mb-10">
                    <h2 className="text-4xl font-black text-gray-800 tracking-tight">提出完了！</h2>
                    <p className="text-gray-500 font-bold text-lg leading-relaxed">
                      {studentName}さん、お疲れ様でした。 <br/>
                      回答は正常に先生へ送信されました。
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-3xl p-6 mb-10 border border-gray-100 flex items-center justify-center gap-8">
                     <div className="text-center">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">回答数</p>
                        <p className="text-xl font-black text-gray-800">{quizData?.questions.length} <span className="text-xs">問</span></p>
                     </div>
                     <div className="w-px h-8 bg-gray-200" />
                     <div className="text-center">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">ステータス</p>
                        <p className="text-xl font-black text-emerald-600">送信済</p>
                     </div>
                  </div>
                  <button 
                    onClick={() => {
                      setIsSubmitted(false);
                      setQuizData(null);
                      setStudentAnswers({});
                      setCurrentQuizId(null);
                      setStudentStep('identity');
                      setCurrentQuestionIndex(0);
                    }}
                    className="w-full py-5 bg-gray-900 hover:bg-black text-white rounded-[2rem] font-bold text-lg transition-all shadow-xl shadow-gray-200 active:scale-95"
                  >
                    メニューに戻る
                  </button>
                </motion.div>
              ) : !quizData ? (
                <div className="space-y-10">
                  <div className="text-center space-y-3">
                    <div className="inline-block bg-indigo-50 px-4 py-1.5 rounded-full text-indigo-600 text-xs font-black uppercase tracking-[0.2em] mb-2">Student Portal</div>
                    <h2 className="text-5xl font-black text-gray-900 tracking-tighter">日本史クイズに挑戦</h2>
                    <p className="text-gray-400 font-bold text-lg">挑戦するクイズを選択してください。</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {savedQuizzes.length > 0 ? (
                      savedQuizzes.map(quiz => (
                        <div 
                          key={quiz.id}
                          onClick={() => loadQuizFromDB(quiz.id)}
                          className="bg-white rounded-[2.5rem] p-10 border-2 border-transparent shadow-sm hover:shadow-2xl hover:border-indigo-500 hover:-translate-y-2 transition-all cursor-pointer group relative overflow-hidden"
                        >
                          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-indigo-100 transition-colors" />
                          <div className="relative z-10 space-y-6">
                            <div>
                              <span className="text-[10px] font-black tracking-[0.2em] text-indigo-400 mb-2 block uppercase">{quiz.unit}</span>
                              <h3 className="text-2xl font-black text-gray-800 leading-tight group-hover:text-indigo-600 transition-colors line-clamp-2">{quiz.source_title}</h3>
                            </div>
                            <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">
                                  <ClipboardList className="w-4 h-4" />
                                </div>
                                <span className="text-xs font-bold text-gray-400 group-hover:text-indigo-600 transition-colors">{quiz.questionCount} Questions</span>
                              </div>
                              <ArrowRight className="w-6 h-6 text-gray-300 group-hover:text-indigo-600 group-hover:translate-x-2 transition-all" />
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="col-span-full py-32 text-center bg-white rounded-[3rem] border-2 border-dashed border-gray-100">
                        <Database className="w-16 h-16 text-gray-100 mx-auto mb-6" />
                        <h3 className="text-xl font-bold text-gray-800">現在公開中のクイズはありません</h3>
                        <p className="text-gray-400 font-medium mt-2">先生がクイズを作成・公開するまでお待ちください。</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : studentStep === 'identity' ? (
                <motion.div 
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  className="bg-white rounded-[3rem] p-12 border border-gray-100 shadow-xl space-y-12 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-8">
                     <button 
                       onClick={() => setQuizData(null)}
                       className="p-3 bg-gray-50 hover:bg-gray-100 text-gray-400 rounded-full transition-all"
                     >
                       <LogOut className="w-5 h-5 rotate-180" />
                     </button>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-2">
                      <span className="text-xs font-black text-indigo-600 uppercase tracking-widest">{quizData.quiz_meta.unit}</span>
                      <h2 className="text-4xl font-black text-gray-800 leading-tight">{quizData.quiz_meta.source_title}</h2>
                    </div>
                    <div className="flex gap-4">
                       <div className="bg-gray-50 px-5 py-3 rounded-2xl border border-gray-100">
                          <p className="text-[10px] font-black text-gray-400 uppercase mb-1">設問数</p>
                          <p className="text-xl font-black text-gray-800">{quizData.questions.length} <span className="text-xs">問</span></p>
                       </div>
                       <div className="bg-gray-50 px-5 py-3 rounded-2xl border border-gray-100">
                          <p className="text-[10px] font-black text-gray-400 uppercase mb-1">学年目安</p>
                          <p className="text-xl font-black text-gray-800">{quizData.quiz_meta.grade_level}</p>
                       </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                        <User className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-gray-800">挑戦者の名前を教えてください</h3>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-0.5">Please enter your name to start</p>
                      </div>
                    </div>
                    <input 
                      type="text" 
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      placeholder="例：歴史 太郎"
                      className="w-full px-8 py-6 rounded-3xl border-2 border-gray-100 bg-gray-50 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 focus:outline-none transition-all font-black text-2xl text-gray-800 placeholder:text-gray-300"
                    />
                  </div>

                  <button
                    onClick={() => {
                       if (studentName.trim()) setStudentStep('quiz');
                       else alert('名前を入力してください。');
                    }}
                    disabled={!studentName.trim()}
                    className="w-full py-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-100 disabled:text-gray-300 text-white rounded-[2.5rem] font-black text-xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-indigo-100 active:scale-95"
                  >
                    回答を開始する
                    <ArrowRight className="w-6 h-6" />
                  </button>
                </motion.div>
              ) : (
                <div className="space-y-8 pb-32">
                  <header className="fixed top-0 left-0 w-full bg-white/80 backdrop-blur-xl border-b border-gray-100 z-50 px-6 py-4">
                    <div className="max-w-3xl mx-auto flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-gray-900 rounded-2xl flex items-center justify-center text-white font-black text-sm">
                           {currentQuestionIndex + 1}
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Question</p>
                          <p className="text-xs font-black text-gray-800 leading-none">{currentQuestionIndex + 1} of {quizData.questions.length}</p>
                        </div>
                      </div>

                      <div className="flex-1 max-w-[200px] md:max-w-xs mx-8">
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                           <motion.div 
                             initial={{ width: 0 }}
                             animate={{ width: `${((currentQuestionIndex + 1) / quizData.questions.length) * 100}%` }}
                             className="h-full bg-indigo-600 rounded-full"
                           />
                        </div>
                      </div>

                      <div className="text-right">
                         <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest leading-none">Answering as</p>
                         <p className="text-xs font-black text-gray-800 leading-none mt-1">{studentName}</p>
                      </div>
                    </div>
                  </header>

                  <div className="pt-16">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={currentQuestionIndex}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-10"
                      >
                        {quizData.questions.map((q, idx) => (
                          idx === currentQuestionIndex && (
                            <div key={q.q_id} className="space-y-10">
                              <div className="bg-white rounded-[3rem] p-10 md:p-16 border border-gray-100 shadow-xl space-y-10">
                                <div className="space-y-4">
                                  <span className="text-xs font-black bg-indigo-50 text-indigo-600 px-4 py-1.5 rounded-full border border-indigo-100">
                                    {q.type === 'MCQ' ? '選択式' : q.type === 'TF' ? '正誤式' : '短答式'}
                                  </span>
                                  <h3 className="text-2xl md:text-3xl font-black text-gray-800 leading-tight">
                                    {q.prompt}
                                  </h3>
                                </div>

                                {/* Answers Section */}
                                <div className="space-y-4">
                                  {q.type === 'MCQ' && q.choices && (
                                    <div className="grid grid-cols-1 gap-3">
                                      {q.choices.map((choice, i) => {
                                        const label = String.fromCharCode(65 + i);
                                        const isSelected = studentAnswers[q.q_id] === label;
                                        return (
                                          <button
                                            key={i}
                                            onClick={() => setStudentAnswers({...studentAnswers, [q.q_id]: label})}
                                            className={`w-full p-6 rounded-[2rem] border-2 text-left flex items-center gap-5 transition-all active:scale-[0.98] ${
                                              isSelected 
                                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xl shadow-indigo-200' 
                                                : 'bg-gray-50 border-gray-50 text-gray-700 hover:border-indigo-200'
                                            }`}
                                          >
                                            <span className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm ${
                                              isSelected ? 'bg-white/20 text-white' : 'bg-white border border-gray-100'
                                            }`}>{label}</span>
                                            <span className="font-black text-lg">{choice}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {q.type === 'TF' && (
                                    <div className="grid grid-cols-2 gap-6">
                                      {['○', '×'].map(val => (
                                        <button
                                          key={val}
                                          onClick={() => setStudentAnswers({...studentAnswers, [q.q_id]: val})}
                                          className={`py-12 rounded-[2.5rem] border-4 font-black transition-all active:scale-[0.98] text-6xl flex flex-col items-center justify-center gap-4 ${
                                            studentAnswers[q.q_id] === val 
                                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xl shadow-indigo-200' 
                                              : 'bg-gray-50 border-gray-50 text-gray-700 hover:border-indigo-200'
                                          }`}
                                        >
                                          {val}
                                          <span className="text-sm font-black uppercase tracking-widest opacity-60">
                                            {val === '○' ? 'TRUE' : 'FALSE'}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  )}

                                  {q.type === 'SA' && (
                                    <input 
                                      type="text"
                                      autoFocus
                                      value={studentAnswers[q.q_id] || ''}
                                      onChange={(e) => setStudentAnswers({...studentAnswers, [q.q_id]: e.target.value})}
                                      placeholder="答えを入力..."
                                      className="w-full px-10 py-8 rounded-[2.5rem] border-4 border-gray-50 bg-gray-50 focus:ring-8 focus:ring-indigo-500/10 focus:border-indigo-500 focus:outline-none transition-all font-black text-3xl text-gray-800 placeholder:text-gray-200"
                                    />
                                  )}
                                </div>
                              </div>

                              {/* Navigation Controls */}
                              <div className="flex items-center justify-between gap-6 px-4">
                                <button
                                  onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                                  disabled={currentQuestionIndex === 0}
                                  className={`flex items-center gap-2 font-black text-sm uppercase tracking-widest transition-all ${currentQuestionIndex === 0 ? 'opacity-0 pointer-events-none' : 'text-gray-400 hover:text-indigo-600'}`}
                                >
                                  <ArrowRight className="w-5 h-5 rotate-180" />
                                  Back
                                </button>

                                {currentQuestionIndex < quizData.questions.length - 1 ? (
                                  <button
                                    onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                                    disabled={!studentAnswers[q.q_id]}
                                    className="px-10 py-5 bg-gray-900 hover:bg-black disabled:bg-gray-100 disabled:text-gray-300 text-white rounded-[2rem] font-black shadow-xl shadow-gray-200 transition-all flex items-center gap-3 active:scale-95"
                                  >
                                    Next Question
                                    <ArrowRight className="w-5 h-5" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={submitStudentAnswers}
                                    disabled={isLoading || Object.keys(studentAnswers).length < quizData.questions.length}
                                    className="px-12 py-5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-100 disabled:text-indigo-300 text-white rounded-[2rem] font-black text-lg shadow-2xl shadow-indigo-200 transition-all flex items-center gap-3 active:scale-95"
                                  >
                                    {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
                                    Finish & Submit
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        ))}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {userMode === 'teacher' && currentStep === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              {dashboardView === 'list' ? (
                <>
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-3xl font-black text-gray-800 tracking-tight flex items-center gap-3">
                        <Database className="w-8 h-8 text-indigo-600" />
                        先生用ダッシュボード
                      </h2>
                      <p className="text-gray-500 font-medium mt-1">保存済みのクイズ作成・回答・分析データを一括管理します。</p>
                    </div>
                    <button
                      onClick={() => {
                        setCurrentStep(1);
                        setQuizData(null);
                        setCurrentQuizId(null);
                        setSourceTitle('');
                        setUnit('');
                        setSourceText('');
                        setQuestionsTable([]);
                        setResponsesTable([]);
                        setAnalysisData(null);
                        setAnalysisStatus('idle');
                      }}
                      className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2"
                    >
                      <FileText className="w-4 h-4" />
                      新しいクイズを作成
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {savedQuizzes.length > 0 ? (
                      savedQuizzes.map((quiz) => (
                        <div 
                          key={quiz.id}
                          className="bg-white rounded-[2rem] border border-gray-200 p-6 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden"
                        >
                          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50/50 rounded-full -mr-12 -mt-12 blur-2xl group-hover:bg-indigo-100 transition-colors" />
                          
                          <div className="relative space-y-4">
                            <div className="flex justify-between items-start">
                              <div className="flex flex-wrap gap-1.5">
                                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                                  {quiz.grade_level}
                                </span>
                                {quiz.questionCount > 0 && (
                                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 flex items-center gap-1">
                                    <CheckCircle2 className="w-2.5 h-2.5" />
                                    作成済
                                  </span>
                                )}
                                {quiz.responseCount > 0 && (
                                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 flex items-center gap-1">
                                    <Users className="w-2.5 h-2.5" />
                                    回答({quiz.responseCount})
                                  </span>
                                )}
                                {quiz.hasAnalysis && (
                                  <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100 flex items-center gap-1">
                                    <TrendingUp className="w-2.5 h-2.5" />
                                    分析完了
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] font-mono text-gray-300">
                                {new Date(quiz.created_at).toLocaleDateString()}
                              </span>
                            </div>

                            <div>
                              <h3 className="text-lg font-black text-gray-800 leading-tight line-clamp-2 group-hover:text-indigo-600 transition-colors">
                                {quiz.source_title || '無題のクイズ'}
                              </h3>
                              <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-wider">{quiz.unit}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-2">
                               <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                  <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">設問数</p>
                                  <p className="text-sm font-black text-gray-700">{quiz.questionCount} <span className="text-[10px]">問</span></p>
                               </div>
                               <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                  <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">回答数</p>
                                  <p className="text-sm font-black text-gray-700">{quiz.responseCount} <span className="text-[10px]">件</span></p>
                               </div>
                            </div>
                            
                            <div className="grid grid-cols-5 gap-2 pt-2">
                              <button 
                                onClick={() => loadQuizFromDB(quiz.id, 'detail')}
                                className="col-span-4 py-3 bg-gray-50 hover:bg-indigo-600 hover:text-white text-gray-600 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-95"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                詳細を確認
                              </button>
                              <button 
                                onClick={() => deleteQuizFromDB(quiz.id)}
                                className="col-span-1 py-3 bg-gray-50 hover:bg-rose-50 hover:text-rose-500 text-gray-400 rounded-2xl flex items-center justify-center transition-all active:scale-95"
                                title="削除"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="col-span-full py-24 text-center bg-white rounded-[3rem] border border-gray-100 shadow-sm">
                        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                          <Database className="w-10 h-10 text-gray-200" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">管理中のクイズがありません</h3>
                        <p className="text-gray-400 max-w-xs mx-auto text-sm leading-relaxed mb-8">
                          「新しいクイズを作成」ボタンから最初の小テストを作成してみましょう。
                        </p>
                        <button
                          onClick={() => setCurrentStep(1)}
                          className="px-8 py-3 bg-indigo-50 text-indigo-600 rounded-2xl font-bold hover:bg-indigo-100 transition-all"
                        >
                          クイズ作成画面へ
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-8 pb-20">
                  {/* Detailed View Header */}
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <button 
                      onClick={() => setDashboardView('list')}
                      className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-indigo-600 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4 rotate-180" />
                      一覧に戻る
                    </button>
                    
                    <div className="flex items-center gap-3">
                      {analysisData && (
                        <button
                          onClick={() => setCurrentStep(3)}
                          className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2"
                        >
                          <TrendingUp className="w-4 h-4" />
                          分析レポートを表示
                        </button>
                      )}
                      {!analysisData && responsesTable.length > 0 && (
                        <button
                          onClick={() => analyzeResults()}
                          className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2"
                        >
                          <Database className="w-4 h-4" />
                          AI分析を実行
                        </button>
                      )}
                      <button
                        onClick={() => setCurrentStep(1)}
                        className="px-6 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-50 transition-all flex items-center gap-2"
                      >
                        <FileText className="w-4 h-4" />
                        問題を編集
                      </button>
                    </div>
                  </div>

                  {/* Quiz Info Banner */}
                  <div className="bg-white rounded-[3rem] p-8 border border-gray-200 shadow-sm overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50/50 rounded-full -mr-32 -mt-32 blur-3xl" />
                    <div className="relative flex flex-col md:flex-row justify-between gap-8">
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-indigo-50 text-indigo-600 border border-indigo-100 uppercase tracking-widest">
                            {gradeLevel}
                          </span>
                          <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">
                            CREATED: {new Date().toLocaleDateString()}
                          </span>
                        </div>
                        <div>
                          <h2 className="text-3xl font-black text-gray-800 tracking-tight leading-tight">{sourceTitle || '無題のクイズ'}</h2>
                          <p className="text-sm font-bold text-indigo-400 mt-1 uppercase tracking-widest">{unit}</p>
                        </div>
                        <div className="flex flex-wrap gap-4 pt-2">
                          <div className="flex items-center gap-2 text-sm text-gray-500 font-bold border-r border-gray-100 pr-4">
                             <FileText className="w-4 h-4 text-indigo-400" />
                             {quizData?.questions.length || 0} 問
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-500 font-bold">
                             <Users className="w-4 h-4 text-emerald-400" />
                             {responsesTable.length} 名の回答データ
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                         {/* Simple average display if analysis is available */}
                         {analysisData && (
                           <div className="bg-indigo-600 p-6 rounded-[2rem] text-white text-center min-w-[140px] shadow-xl shadow-indigo-100">
                             <p className="text-[10px] font-black text-indigo-200 uppercase mb-1">クラス平均</p>
                             <div className="flex items-end justify-center gap-0.5">
                                <span className="text-4xl font-black">{(analysisData.class_summary.overall_accuracy * 100).toFixed(0)}</span>
                                <span className="text-lg font-bold mb-1">%</span>
                             </div>
                           </div>
                         )}
                      </div>
                    </div>
                  </div>

                  {/* Grid: Questions & Responses */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Left: Questions List */}
                    <div className="lg:col-span-7 space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xl font-black text-gray-800 flex items-center gap-2">
                          <ClipboardList className="w-6 h-6 text-indigo-600" />
                          問題リスト
                        </h3>
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Interactive Preview</span>
                      </div>
                      <div className="space-y-4 max-h-[1000px] overflow-y-auto pr-2 custom-scrollbar">
                        {quizData?.questions.map((q: Question, i: number) => (
                           <QuestionCard key={q.q_id} question={q} index={i + 1} showAnswer={true} />
                        ))}
                      </div>
                    </div>

                    {/* Right: Student Responses Table */}
                    <div className="lg:col-span-5 space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xl font-black text-gray-800 flex items-center gap-2">
                          <Users className="w-6 h-6 text-emerald-600" />
                          回答状況
                        </h3>
                        {responsesTable.length > 0 && (
                          <button
                            onClick={() => setCurrentStep(2)}
                            className="text-xs font-bold text-indigo-600 hover:underline"
                          >
                            回答データを編集
                          </button>
                        )}
                      </div>
                      
                      {responsesTable.length > 0 ? (
                        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden p-6">
                           <div className="space-y-4">
                              {responsesTable.map((row: any, idx: number) => {
                                const correctCount = Object.values(row.responses).filter(v => v === '1' || v === '○').length;
                                const accuracy = (correctCount / (quizData?.questions.length || 1)) * 100;
                                
                                return (
                                  <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl group hover:bg-white hover:shadow-md hover:ring-1 hover:ring-gray-100 transition-all">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center flex-shrink-0 border border-gray-100 shadow-sm font-black text-xs text-gray-400 group-hover:text-indigo-600 group-hover:border-indigo-100 group-hover:bg-indigo-50 transition-colors">
                                        {idx + 1}
                                      </div>
                                      <div className="space-y-0.5 overflow-hidden">
                                        <p className="font-black text-gray-800 truncate">{row.student_id}</p>
                                        <div className="flex items-center gap-2">
                                          <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                            <div 
                                              className={`h-full rounded-full ${accuracy > 80 ? 'bg-emerald-500' : accuracy > 50 ? 'bg-indigo-500' : 'bg-rose-500'}`}
                                              style={{ width: `${accuracy}%` }}
                                            />
                                          </div>
                                          <span className="text-[10px] font-bold text-gray-400">{accuracy.toFixed(0)}%</span>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      <div className="text-right flex-shrink-0">
                                        <p className="text-xs font-black text-gray-800">{correctCount} <span className="text-[9px] text-gray-400">/ {quizData?.questions.length}</span></p>
                                        {analysisData && (
                                          <button 
                                            onClick={() => {
                                              setCurrentStep(3);
                                            }}
                                            className="text-[9px] font-black text-indigo-400 uppercase hover:text-indigo-600 transition-colors"
                                          >
                                            View Report
                                          </button>
                                        )}
                                      </div>
                                      <button 
                                        onClick={() => deleteStudentResponses(currentQuizId!, row.student_id)}
                                        className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                                        title="この生徒の解答を削除"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                           </div>
                        </div>
                      ) : (
                        <div className="bg-gray-50 rounded-[2rem] border-2 border-dashed border-gray-200 p-12 text-center">
                           <Users className="w-10 h-10 text-gray-200 mx-auto mb-4" />
                           <p className="text-gray-400 font-bold mb-6">まだ生徒の回答データがありません</p>
                           <button
                             onClick={() => setCurrentStep(2)}
                             className="px-6 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-50 transition-all"
                           >
                             回答データを入力する
                           </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4">
            <div className="px-6 py-4 bg-red-900 text-white rounded-2xl shadow-2xl flex items-center gap-3 border border-red-800">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <p className="text-sm font-bold">{error}</p>
              <button onClick={() => setError(null)} className="ml-2 hover:text-red-400 transition-colors">✕</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

const QuestionCard: React.FC<QuestionCardProps> = ({ question, index, showAnswer }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const difficultyColors = {
    '基礎': 'bg-emerald-50 text-emerald-700 border-emerald-100',
    '標準': 'bg-blue-50 text-blue-700 border-blue-100',
    '発展': 'bg-orange-50 text-orange-700 border-orange-100'
  };

  const typeLabels = {
    'MCQ': '選択式',
    'TF': '正誤',
    'SA': '短答'
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden transition-all hover:border-indigo-200 text-left">
      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
              {index}
            </span>
            <div className="flex flex-wrap gap-2">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${difficultyColors[question.difficulty]}`}>
                {question.difficulty}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200">
                {typeLabels[question.type]}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">
                {question.tags.era}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">
                {question.tags.theme}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-50 text-gray-500 border border-gray-200">
                {question.tags.skill}
              </span>
            </div>
          </div>
        </div>

        {/* Topic */}
        <div className="flex items-center gap-2 text-indigo-900/40">
          <div className="h-px flex-1 bg-gradient-to-r from-indigo-100 to-transparent" />
          <span className="text-[10px] font-bold tracking-widest uppercase">Topic: {question.tags.topic}</span>
          <div className="h-px w-4 bg-indigo-100" />
        </div>

        {/* Prompt */}
        <p className="text-[15px] font-medium leading-relaxed text-gray-800">
          {question.prompt}
        </p>

        {/* Choices (for MCQ) */}
        {question.type === 'MCQ' && question.choices && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {question.choices.map((choice, i) => {
              const label = String.fromCharCode(65 + i); // A, B, C, D
              const isCorrect = showAnswer && (question.answer.trim() === label || question.answer.trim() === choice.trim());
              return (
                <div
                  key={i}
                  className={`p-3 rounded-xl border text-sm transition-all flex items-center gap-3 ${isCorrect
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold'
                    : 'bg-gray-50 border-gray-100 text-gray-600'
                    }`}
                >
                  <span className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${isCorrect ? 'bg-emerald-500 text-white' : 'bg-white border border-gray-200'
                    }`}>
                    {label}
                  </span>
                  {choice}
                </div>
              );
            })}
          </div>
        )}

        {/* TF / SA Answer Display */}
        {showAnswer && question.type !== 'MCQ' && (
          <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
            <p className="text-xs font-bold text-emerald-600 uppercase mb-1">正解</p>
            <p className="text-sm font-bold text-emerald-800">
              {question.type === 'TF' 
                ? (question.answer.replace('1', '○').replace('0', '×'))
                : question.answer}
            </p>
          </div>
        )}

        {/* Explanation & Evidence (Expandable) */}
        {showAnswer && (
          <div className="pt-4 border-t border-gray-100 space-y-4">
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-gray-400 uppercase flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> 解説
              </h4>
              <p className="text-sm text-gray-600 leading-relaxed">
                {question.explanation}
              </p>
            </div>

            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              本文の根拠を表示
            </button>

            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 italic text-xs text-gray-500 leading-relaxed">
                    「{question.evidence}」
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
