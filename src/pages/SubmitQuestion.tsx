import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import type { Category, Difficulty, Question, QuestionType } from '../types';
import {
  getCategories, insertCategory, insertQuestion, insertQuestionsBulk,
} from '../lib/questions';
import { generateQuestions, testAIConnection } from '../lib/ai';
import { getAIConfig, saveAIConfig } from '../lib/ai';
import { useAuthStore } from '../store/authStore';
import Loading from '../components/Loading';

interface ManualForm {
  categoryId: string;
  newCategory?: string;
  difficulty: Difficulty;
  type: QuestionType;
  question: string;
  options?: { key: string; value: string }[];
  answer: string;
  explanation?: string;
  reference_url?: string;
}

interface AIQuestion {
  question: string;
  options?: Record<string, string>;
  answer: string;
  explanation?: string;
  type: QuestionType;
  difficulty: Difficulty;
}

export default function SubmitQuestion() {
  const { user, loading: authLoading } = useAuthStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'manual' | 'bulk' | 'ai'>('manual');
  const [categories, setCategories] = useState<Category[]>([]);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiQuestions, setAiQuestions] = useState<AIQuestion[]>([]);
  const [bulkJson, setBulkJson] = useState('');

  const [hasAIConfig] = useState<boolean>(false);
  const [aiCfg, setAiCfg] = useState<{ url: string; key: string; model: string }>({
    url: '', key: '', model: '',
  });
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);

  useEffect(() => {
    getCategories().then(setCategories);
    if (user) {
      getAIConfig(user.id).then((cfg) => {
        if (cfg) {
          setAiCfg({ url: cfg.api_base_url, key: cfg.api_key, model: cfg.model });
        }
      });
    }
  }, [user]);

  const {
    control, register, handleSubmit, formState: { errors }, watch, reset,
  } = useForm<ManualForm>({
    defaultValues: {
      categoryId: '',
      difficulty: 2,
      type: 'choice',
      question: '',
      options: [
        { key: 'A', value: '' },
        { key: 'B', value: '' },
        { key: 'C', value: '' },
        { key: 'D', value: '' },
      ],
      answer: '',
      explanation: '',
      reference_url: '',
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'options' });
  const watchType = watch('type');

  if (authLoading) return <Loading label="检查登录状态..." />;

  if (!user) {
    return (
      <div className="py-16 text-center">
        <div className="text-lg text-slate-200 mb-2">请先登录</div>
        <p className="text-sm text-slate-400 mb-6">提交新题功能需要登录。</p>
        <Link to="/login" className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm">
          去登录
        </Link>
      </div>
    );
  }

  const onSubmitManual = async (data: ManualForm) => {
    setMessage(null);
    setSubmitLoading(true);
    try {
      let categoryId = data.categoryId;
      if (data.newCategory?.trim()) {
        const c = await insertCategory(data.newCategory.trim());
        setCategories((prev) => [...prev, c]);
        categoryId = c.id;
      }
      if (!categoryId) {
        setMessage({ ok: false, text: '请选择或新建一个分类' });
        return;
      }

      const options =
        data.type === 'choice'
          ? Object.fromEntries(
              (data.options ?? []).filter((o) => o.key.trim() && o.value.trim()).map((o) => [o.key.trim(), o.value.trim()]),
            )
          : undefined;

      if (data.type === 'choice' && Object.keys(options ?? {}).length < 2) {
        setMessage({ ok: false, text: '选择题至少需要 2 个有效选项' });
        return;
      }

      const q = await insertQuestion({
        category_id: categoryId,
        difficulty: data.difficulty,
        type: data.type,
        question: data.question,
        options,
        answer: data.answer,
        explanation: data.explanation,
        reference_url: data.reference_url,
      });
      setMessage({ ok: true, text: `已添加一题（ID ${q.id.slice(0, 8)}）` });
      reset();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : '提交失败' });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleBulkSubmit = async () => {
    setMessage(null);
    setSubmitLoading(true);
    try {
      const parsed = JSON.parse(bulkJson) as Array<{
        category?: string;
        category_id?: string;
        difficulty?: number;
        type?: QuestionType;
        question: string;
        options?: Record<string, string>;
        answer: string;
        explanation?: string;
        reference_url?: string;
      }>;
      if (!Array.isArray(parsed)) throw new Error('JSON 必须是数组');

      // 解析分类
      const nameToId = new Map<string, string>();
      for (const c of categories) nameToId.set(c.name, c.id);

      const rows: Array<Omit<Question, 'id' | 'created_at' | 'ai_resolution'>> = [];
      for (const row of parsed) {
        if (!row.question || !row.answer) continue;
        const type = row.type === 'fill' ? 'fill' : 'choice';
        const diff = (row.difficulty === 1 || row.difficulty === 3 ? row.difficulty : 2) as Difficulty;
        let catId: string | undefined;
        if (row.category_id && nameToId.get('')) {
          catId = row.category_id;
        } else if (row.category) {
          if (!nameToId.has(row.category)) {
            const c = await insertCategory(row.category);
            nameToId.set(c.name, c.id);
            catId = c.id;
          } else {
            catId = nameToId.get(row.category);
          }
        } else if (categories[0]) {
          catId = categories[0].id;
        }
        rows.push({
          category_id: catId,
          difficulty: diff,
          type,
          question: row.question,
          options: type === 'choice' ? row.options : undefined,
          answer: row.answer,
          explanation: row.explanation,
          reference_url: row.reference_url,
        });
      }
      if (rows.length === 0) {
        setMessage({ ok: false, text: '未解析到有效题目' });
        return;
      }
      await insertQuestionsBulk(rows);
      setMessage({ ok: true, text: `成功导入 ${rows.length} 道题目` });
      setBulkJson('');
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : '导入失败' });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleAI = async () => {
    setMessage(null);
    setAiLoading(true);
    try {
      const topic = prompt('请输入出题主题（如：React Hooks 基础用法）')?.trim();
      if (!topic) return;
      const qs = await generateQuestions({ topic, count: 5, difficulty: 2, type: 'choice' });
      setAiQuestions(
        qs.map((q) => ({ ...q, type: 'choice', difficulty: 2 })),
      );
      setMessage({ ok: true, text: `AI 生成了 ${qs.length} 道题，确认后入库` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : '生成失败' });
    } finally {
      setAiLoading(false);
    }
  };

  const handleAICommit = async () => {
    if (aiQuestions.length === 0) return;
    setSubmitLoading(true);
    try {
      let catId = categories[0]?.id;
      if (!catId) {
        const c = await insertCategory('AI 出题');
        catId = c.id;
      }
      const rows = aiQuestions.map((q) => ({
        category_id: catId,
        difficulty: q.difficulty,
        type: q.type,
        question: q.question,
        options: q.type === 'choice' ? q.options : undefined,
        answer: q.answer,
        explanation: q.explanation,
      }));
      await insertQuestionsBulk(rows);
      setMessage({ ok: true, text: `已入库 ${rows.length} 道题目` });
      setAiQuestions([]);
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : '入库失败' });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleTestAI = async () => {
    if (!aiCfg.url || !aiCfg.key || !aiCfg.model) {
      setTestResult({ ok: false, message: '请填写完整的 API 配置' });
      return;
    }
    const res = await testAIConnection({ api_base_url: aiCfg.url, api_key: aiCfg.key, model: aiCfg.model });
    setTestResult(res);
  };

  const handleSaveAIConfig = async () => {
    if (!aiCfg.url || !aiCfg.key || !aiCfg.model) return;
    await saveAIConfig(user.id, { api_base_url: aiCfg.url, api_key: aiCfg.key, model: aiCfg.model });
    setMessage({ ok: true, text: 'AI 配置已保存' });
  };

  return (
    <div className="py-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-100 mb-1">贡献题目</h1>
      <p className="text-sm text-slate-400 mb-6">
        支持手动添加、JSON 批量导入，或借助 AI 快速生成后确认入库。
      </p>

      <div className="flex gap-2 mb-6">
        {(['manual', 'bulk', 'ai'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm rounded-md border ${
              tab === t
                ? 'bg-brand-600 border-brand-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {t === 'manual' ? '手动添加' : t === 'bulk' ? 'JSON 批量导入' : 'AI 出题'}
          </button>
        ))}
      </div>

      {message && (
        <div
          className={`mb-4 text-sm rounded-md p-3 border ${
            message.ok
              ? 'border-emerald-600/60 bg-emerald-900/30 text-emerald-200'
              : 'border-rose-600/60 bg-rose-900/30 text-rose-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {tab === 'manual' && (
        <form
          onSubmit={handleSubmit(onSubmitManual)}
          className="space-y-4 bg-slate-800/40 border border-slate-700 rounded-xl p-5"
        >
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">分类</label>
              <select
                {...register('categoryId')}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-100 text-sm"
              >
                <option value="">— 选择 —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {errors.categoryId && (
                <div className="text-xs text-rose-400 mt-1">{errors.categoryId.message as string}</div>
              )}
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">或新建分类</label>
              <input
                {...register('newCategory')}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-100 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">难度</label>
              <Controller
                control={control}
                name="difficulty"
                render={({ field }) => (
                  <select
                    {...field}
                    value={field.value}
                    onChange={(e) => field.onChange(Number(e.target.value) as Difficulty)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-100 text-sm"
                  >
                    <option value={1}>简单</option>
                    <option value={2}>中等</option>
                    <option value={3}>困难</option>
                  </select>
                )}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">题型</label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <select
                    {...field}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-100 text-sm"
                  >
                    <option value="choice">选择题</option>
                    <option value="fill">填空题</option>
                  </select>
                )}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">题干</label>
            <textarea
              {...register('question', { required: '请填写题干' })}
              rows={3}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-100 text-sm"
              placeholder="题目内容..."
            />
            {errors.question && (
              <div className="text-xs text-rose-400 mt-1">{errors.question.message}</div>
            )}
          </div>

          {watchType === 'choice' && (
            <div>
              <label className="block text-sm text-slate-300 mb-1">选项</label>
              <div className="space-y-2">
                {fields.map((f, idx) => (
                  <div key={f.id} className="flex gap-2 items-center">
                    <input
                      {...register(`options.${idx}.key` as const)}
                      placeholder="A"
                      maxLength={2}
                      className="w-16 px-2 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-100 text-sm text-center"
                    />
                    <input
                      {...register(`options.${idx}.value` as const)}
                      placeholder="选项内容"
                      className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-100 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => remove(idx)}
                      className="px-2 text-sm text-slate-400 hover:text-rose-400"
                    >
                      删
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => append({ key: String.fromCharCode(65 + fields.length), value: '' })}
                className="text-sm text-brand-300 hover:text-brand-200 mt-2"
              >
                + 增加选项
              </button>
            </div>
          )}

          <div>
            <label className="block text-sm text-slate-300 mb-1">正确答案</label>
            <input
              {...register('answer', { required: '请填写答案' })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-100 text-sm"
              placeholder={watchType === 'choice' ? '填选项字母，如 A' : '答案文本'}
            />
            {errors.answer && (
              <div className="text-xs text-rose-400 mt-1">{errors.answer.message}</div>
            )}
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">解析（可选）</label>
            <textarea
              {...register('explanation')}
              rows={2}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-100 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">参考链接（可选）</label>
            <input
              {...register('reference_url')}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-100 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={submitLoading}
            className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-md text-sm disabled:opacity-60"
          >
            {submitLoading ? '提交中...' : '提交题目'}
          </button>
        </form>
      )}

      {tab === 'bulk' && (
        <div className="space-y-4 bg-slate-800/40 border border-slate-700 rounded-xl p-5">
          <div className="text-sm text-slate-300">
            粘贴 JSON 数组，每个对象可包含字段：<code className="text-brand-300">category</code>,
            <code className="text-brand-300"> difficulty</code>,
            <code className="text-brand-300"> type</code>,
            <code className="text-brand-300"> question</code>,
            <code className="text-brand-300"> options</code>,
            <code className="text-brand-300"> answer</code>,
            <code className="text-brand-300"> explanation</code>,
            <code className="text-brand-300"> reference_url</code>。
          </div>
          <textarea
            value={bulkJson}
            onChange={(e) => setBulkJson(e.target.value)}
            rows={14}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-100 text-sm font-mono"
            placeholder={`[\n  {\n    "category": "基础概念",\n    "type": "choice",\n    "question": "...",\n    "options": {"A": "...", "B": "..."},\n    "answer": "A",\n    "explanation": "..."\n  }\n]`}
          />
          <button
            onClick={handleBulkSubmit}
            disabled={submitLoading || !bulkJson.trim()}
            className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-md text-sm disabled:opacity-60"
          >
            {submitLoading ? '导入中...' : '批量导入'}
          </button>
        </div>
      )}

      {tab === 'ai' && (
        <div className="space-y-5">
          <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">AI API 配置（仅本人可见）</h3>
            <div className="grid md:grid-cols-3 gap-3">
              <input
                value={aiCfg.url}
                onChange={(e) => setAiCfg({ ...aiCfg, url: e.target.value })}
                placeholder="API Base URL"
                className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-100 text-sm"
              />
              <input
                value={aiCfg.key}
                type="password"
                onChange={(e) => setAiCfg({ ...aiCfg, key: e.target.value })}
                placeholder="API Key"
                className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-100 text-sm"
              />
              <input
                value={aiCfg.model}
                onChange={(e) => setAiCfg({ ...aiCfg, model: e.target.value })}
                placeholder="Model name"
                className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-100 text-sm"
              />
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleSaveAIConfig}
                className="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-500 text-white"
              >
                保存配置
              </button>
              <button
                onClick={handleTestAI}
                className="px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200"
              >
                测试连接
              </button>
              {testResult && (
                <span
                  className={`text-sm ${testResult.ok ? 'text-emerald-300' : 'text-rose-300'}`}
                >
                  {testResult.message || testResult.error || (testResult.ok ? '连接成功' : '失败')}
                </span>
              )}
            </div>
          </div>

          <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">AI 出题</h3>
            <button
              onClick={handleAI}
              disabled={aiLoading}
              className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-md text-sm disabled:opacity-60"
            >
              {aiLoading ? '生成中...' : '按主题生成（5 道选择题，中等）'}
            </button>
          </div>

          {aiQuestions.length > 0 && (
            <div className="space-y-3">
              {aiQuestions.map((q, idx) => (
                <div key={idx} className="rounded-lg bg-slate-800/60 border border-slate-700 p-4">
                  <div className="text-slate-300 text-sm mb-1">题目 {idx + 1}</div>
                  <div className="text-slate-100 whitespace-pre-wrap mb-2">{q.question}</div>
                  {q.options && (
                    <ul className="text-sm text-slate-300 mb-2 space-y-0.5">
                      {Object.entries(q.options).map(([k, v]) => (
                        <li key={k}>
                          {k}. {v}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="text-sm text-emerald-300">答案：{q.answer}</div>
                  {q.explanation && (
                    <div className="text-sm text-slate-400 mt-1">解析：{q.explanation}</div>
                  )}
                </div>
              ))}
              <button
                onClick={handleAICommit}
                disabled={submitLoading}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-sm disabled:opacity-60"
              >
                确认全部入库
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 text-sm text-slate-500">
        做题去 <Link to="/practice" className="text-brand-300 hover:underline">练习模式</Link> 或{' '}
        <Link to="/exam" className="text-brand-300 hover:underline">考试模式</Link>
      </div>
    </div>
  );
}
