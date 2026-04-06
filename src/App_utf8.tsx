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
  File
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QuizInputSection } from './components/QuizInputSection';
import { StudentResponseTable } from './components/StudentResponseTable';
import { CsvImportPanel } from './components/CsvImportPanel';
import { DataSummaryCard } from './components/DataSummaryCard';

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
  difficulty: "蝓ｺ遉 | "讓呎ｺ | "逋ｺ螻;
  prompt: string;
  choices?: string[];
  answer: string;
  explanation: string;
  evidence: string;
  tags: {
    era: string;
    theme: string;
    topic: string;
    skill: "逕ｨ隱樒炊隗｣" | "譎らｳｻ蛻礼炊隗｣" | "蝗