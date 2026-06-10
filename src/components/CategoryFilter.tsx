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
        <div className="flex-1">
          <label htmlFor="keyword-filter" className="block text-sm text-theme-secondary mb-1.5">
            搜索
          </label>
          <input
            id="keyword-filter"
            type="text"
            placeholder="搜索题干关键字..."
            value={keyword ?? ''}
            onChange={(e) => onKeywordChange?.(e.target.value)}
            className="input-theme w-full"
          />
        </div>
      )}
      <div>
        <label htmlFor="category-filter" className="block text-sm text-theme-secondary mb-1.5">
          分类
        </label>
        <select
          id="category-filter"
          value={selectedCategory ?? ''}
          onChange={(e) => onCategoryChange?.(e.target.value)}
          className="input-theme w-full"
        >
          <option value="">全部分类</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="difficulty-filter" className="block text-sm text-theme-secondary mb-1.5">
          难度
        </label>
        <select
          id="difficulty-filter"
          value={selectedDifficulty ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onDifficultyChange?.(v === '' ? '' : (Number(v) as Difficulty));
          }}
          className="input-theme w-full"
        >
          <option value="">全部难度</option>
          {([1, 2, 3] as Difficulty[]).map((d) => (
            <option key={d} value={d}>
              {DIFFICULTY_LABEL[d]}
            </option>
          ))}
        </select>
      </div>
      {showType && (
        <div>
        <label htmlFor="type-filter" className="block text-sm text-theme-secondary mb-1.5">
          题型
        </label>
        <select
          id="type-filter"
          value={selectedType ?? ''}
          onChange={(e) => onTypeChange?.(e.target.value as QuestionType | '')}
          className="input-theme w-full"
        >
          <option value="">全部题型</option>
          <option value="choice">{TYPE_LABEL.choice}</option>
          <option value="multiple">{TYPE_LABEL.multiple}</option>
          <option value="fill">{TYPE_LABEL.fill}</option>
        </select>
      </div>
      )}
    </div>
  );
}
