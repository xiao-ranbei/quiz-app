-- === 示例题库 Seed（在 Supabase SQL Editor 中执行）===
-- 如果此前已执行过 create_schema 迁移，categories/questions 表应该已经存在
-- 本文件提供 20 道示例题，可按需删减

-- 1) 先确保分类存在
insert into categories (id, name, description)
values
  ('00000000-0000-0000-0000-000000000001', '基础概念', '基本知识与概念题'),
  ('00000000-0000-0000-0000-000000000002', '代码补全', 'GitHub Copilot 相关'),
  ('00000000-0000-0000-0000-000000000003', 'JavaScript', '前端 JS 基础题'),
  ('00000000-0000-0000-0000-000000000004', 'React', 'React 基础与 Hooks'),
  ('00000000-0000-0000-0000-000000000005', '数据库', 'SQL 与数据库基础')
on conflict (id) do nothing;

-- 2) 插入示例题目（单选题）
insert into questions (category_id, difficulty, type, question, options, answer, explanation)
values
(
  '00000000-0000-0000-0000-000000000002', 1, 'choice',
  'GitHub Copilot 主要提供什么功能？',
  '{"A":"代码补全和生成","B":"代码部署","C":"数据库管理","D":"UI 设计"}',
  'A',
  'Copilot 是一款基于 AI 的编程助手，核心能力是根据上下文提示代码补全与生成。'
),
(
  '00000000-0000-0000-0000-000000000003', 1, 'choice',
  '以下哪种不是 JavaScript 的原始数据类型？',
  '{"A":"string","B":"number","C":"object","D":"boolean"}',
  'C',
  'object 是引用类型，不是原始类型。原始类型包括：string、number、bigint、boolean、null、undefined、symbol。'
),
(
  '00000000-0000-0000-0000-000000000003', 1, 'choice',
  'typeof null 的返回值是什么？',
  '{"A":"null","B":"undefined","C":"object","D":"number"}',
  'C',
  '这是 JavaScript 的一个历史遗留行为：typeof null 返回 "object"。'
),
(
  '00000000-0000-0000-0000-000000000003', 2, 'choice',
  '以下表达式结果为 true 的是？',
  '{"A":"[] === []","B":"NaN === NaN","C":"null === undefined","D":"1 === 1"}',
  'D',
  '对象比较的是引用而非值，所以 [] === [] 为 false；NaN 与任何值（包括自身）都不相等。'
),
(
  '00000000-0000-0000-0000-000000000004', 1, 'choice',
  'React 中用于管理组件内部状态的 Hook 是？',
  '{"A":"useEffect","B":"useState","C":"useMemo","D":"useRef"}',
  'B',
  'useState 返回一个状态值和一个更新它的函数，是最常用的状态管理 Hook。'
),
(
  '00000000-0000-0000-0000-000000000004', 2, 'choice',
  'useEffect 的依赖数组为空数组 [] 时，它何时执行？',
  '{"A":"每次渲染都执行","B":"仅在组件挂载时执行一次","C":"永不执行","D":"仅在 props 变化时执行"}',
  'B',
  '空依赖数组意味着 useEffect 只在组件挂载时执行一次，在卸载时清理。'
),
(
  '00000000-0000-0000-0000-000000000005', 1, 'choice',
  '以下哪个 SQL 关键字用于从表中选取数据？',
  '{"A":"INSERT","B":"UPDATE","C":"SELECT","D":"DELETE"}',
  'C',
  'SELECT 是 SQL 中用于读取数据的关键字。'
),
(
  '00000000-0000-0000-0000-000000000005', 2, 'choice',
  'PostgreSQL 中哪个数据类型用于存储 UUID？',
  '{"A":"uuid","B":"id","C":"text","D":"primary"}',
  'A',
  'PostgreSQL 内置了 uuid 类型，用于存储通用唯一标识符。'
),
(
  '00000000-0000-0000-0000-000000000001', 1, 'choice',
  'Supabase 的身份认证（Auth）默认使用哪种方式存储用户密码？',
  '{"A":"明文存储","B":"MD5 哈希","C":"bcrypt/argon2 等强哈希","D":"Base64 编码"}',
  'C',
  'Supabase Auth 默认使用安全的强哈希算法（如 bcrypt）存储密码，不会明文存储。'
),
(
  '00000000-0000-0000-0000-000000000001', 2, 'choice',
  'Supabase 中用于实现行级安全的机制是？',
  '{"A":"RLS (Row Level Security)","B":"Foreign Key","C":"Trigger","D":"Function"}',
  'A',
  'RLS（行级安全策略）是 Supabase 用来在数据层面控制用户能读取/写入哪些行的核心机制。'
);

-- 3) 插入示例：多选题
insert into questions (category_id, difficulty, type, question, options, answer, explanation)
values
(
  '00000000-0000-0000-0000-000000000003', 2, 'multiple',
  '以下哪些是 JavaScript 的原始数据类型？（多选）',
  '{"A":"string","B":"number","C":"array","D":"boolean","E":"symbol"}',
  'ABDE',
  'array 是对象类型，不是原始类型。正确的原始类型包括：string、number、bigint、boolean、null、undefined、symbol。'
),
(
  '00000000-0000-0000-0000-000000000004', 2, 'multiple',
  '以下哪些是 React Hook？（多选）',
  '{"A":"useState","B":"useFetch","C":"useEffect","D":"useReducer","E":"useRender"}',
  'ACD',
  'useState、useEffect、useReducer 都是 React 官方 Hook。useFetch 与 useRender 不是官方提供的 Hook。'
),
(
  '00000000-0000-0000-0000-000000000005', 3, 'multiple',
  '以下哪些是 PostgreSQL 的特点？（多选）',
  '{"A":"支持 JSONB 类型","B":"支持行级安全策略","C":"是图数据库","D":"支持自定义函数","E":"完全开源"}',
  'ABDE',
  'PostgreSQL 是关系型数据库，不是图数据库，其余选项均正确。'
),
(
  '00000000-0000-0000-0000-000000000002', 2, 'multiple',
  'Copilot 可以根据哪些上下文生成代码？（多选）',
  '{"A":"注释内容","B":"函数名","C":"当前文件名","D":"相邻文件的代码","E":"已导入的库"}',
  'ABCDE',
  'Copilot 会综合注释、函数/变量命名、文件类型、相邻文件内容、已导入的库等多维度上下文生成代码建议。'
),
(
  '00000000-0000-0000-0000-000000000001', 2, 'multiple',
  '以下哪些方式可以保护 Supabase 中的数据？（多选）',
  '{"A":"启用 RLS 并写策略","B":"使用服务端角色（service_role）访问数据","C":"在前端把 API key 隐藏在环境变量里","D":"公开 anon key 即可","E":"使用 Edge Functions 做鉴权中转"}',
  'ABE',
  'RLS 是核心防线；服务端角色可绕过 RLS（仅在服务器中使用）；Edge Functions 可做自定义鉴权。公开 anon key 无法保护数据，环境变量对前端浏览器端不生效。'
);

-- 4) 插入示例：填空题
insert into questions (category_id, difficulty, type, question, options, answer, explanation)
values
(
  '00000000-0000-0000-0000-000000000001', 1, 'fill',
  'Supabase 的底层数据库是 ___（填一个数据库产品名）。',
  null,
  'PostgreSQL',
  'Supabase 在 PostgreSQL 之上构建了完整的 BaaS 能力。'
),
(
  '00000000-0000-0000-0000-000000000004', 1, 'fill',
  'React 中函数组件返回多个子元素时，通常用一个不可见的包裹元素，它的名字是 ___。',
  null,
  'Fragment',
  'React.Fragment（简写为 <>...</>）允许在不产生额外 DOM 节点的情况下返回多个子元素。'
),
(
  '00000000-0000-0000-0000-000000000003', 2, 'fill',
  'JavaScript 中声明常量的关键字是 ___。',
  null,
  'const',
  'const 用于声明一个不可重新赋值的常量，但对象/数组内部仍可被修改。'
),
(
  '00000000-0000-0000-0000-000000000003', 2, 'fill',
  'Promise 的三种状态是 pending、fulfilled 和 ___。',
  null,
  'rejected',
  'Promise 只有三种状态：pending（等待中）、fulfilled（已解决）、rejected（已拒绝）。'
),
(
  '00000000-0000-0000-0000-000000000005', 2, 'fill',
  'SQL 中用于给列设置默认值的关键字是 ___（3 个大写字母）。',
  null,
  'DEFAULT',
  '在 CREATE TABLE 或 ALTER TABLE 中使用 DEFAULT 可为列指定默认值。'
),
(
  '00000000-0000-0000-0000-000000000001', 3, 'fill',
  'Supabase 中判断当前登录用户 ID 的 SQL 函数是 auth.___()。',
  null,
  'uid',
  'auth.uid() 返回当前已认证用户的 UUID，是 RLS 策略中常用的判定函数。'
),
(
  '00000000-0000-0000-0000-000000000004', 3, 'fill',
  'React 中用于缓存计算结果、避免重复计算的 Hook 是 use___。',
  null,
  'Memo',
  'useMemo 可在依赖不变时返回缓存的计算值，适合优化昂贵的计算逻辑。'
);
