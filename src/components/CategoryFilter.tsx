import type { Category, Difficulty, QuestionType } from '../types';
import { DIFFICULTY_LABEL, TYPE_LABEL } from '../types';

interface Props {
  categories: Category[];
  selectedCategory?: string;
  onCategoryChange?: (id: string) => void;
  selectedDifficulty?: Difficulty | '';
  onDifficultyChange?: (d: Difficulty | '') => void;
  selectedType?: QuestionType | '';
  onTypeChange?: (t: QuestionType | '') => void;
  keyword?: string;
  onKeywordChange?: (k: string) => void;
  showType?: boolean;
  showKeyword?: boolean;
}

export default function CategoryFilter({
  categories,
  selectedCategory,
  onCategoryChange,
  selectedDifficulty,
  onDifficultyChange,
  selectedType,
  onTypeChange,
  keyword,
  onKeywordChange,
  showType = true,
  showKeyword = true,
}: Props) {
  return (
    <div className="flex flex-col md:flex-row gap-3 mb-6">
      {showKeyword && (
        <input
          type="text"
          placeholder="搜索题干关键字..."
          value={keyword ?? ''}
          onChange={(e) => onKeywordChange?.(e.target.value)}
          className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-brand-500"
        />
      )}
      <select
        value={selectedCategory ?? ''}
        onChange={(e) => onCategoryChange?.(e.target.value)}
        className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-brand-500"
      >
        <option value="">全部分类</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        value={selectedDifficulty ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          onDifficultyChange?.(v === '' ? '' : (Number(v) as Difficulty));
        }}
        className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-brand-500"
      >
        <option value="">全部难度</option>
        {([1, 2, 3] as Difficulty[]).map((d) => (
          <option key={d} value={d}>
            {DIFFICULTY_LABEL[d]}
          </option>
        ))}
      </select>
      {showType && (
        <select
          value={selectedType ?? ''}
          onChange={(e) => onTypeChange?.(e.target.value as QuestionType | '')}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-brand-500"
        >
          <option value="">全部题型</option>
          <option value="choice">{TYPE_LABEL.choice}</option>
          <option value="fill">{TYPE_LABEL.fill}</option>
        </select>
      )}
    </div>
  );
}
