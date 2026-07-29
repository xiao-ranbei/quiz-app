-- ============================================================
-- 聚合统计 RPC：减少前端全表拉取
-- ============================================================

-- 1. 每个分类的题目数
-- 返回：{ category_id: uuid, count: bigint }[]
create or replace function public.get_category_question_counts()
returns table (category_id uuid, count bigint)
language sql
stable
security definer
as $$
  select category_id, count(*)::bigint
  from public.questions
  where category_id is not null
  group by category_id;
$$;

-- 2. 用户统计：一次返回 4 个数字
-- 返回：{ total_answered, correct, wrong_count, exam_count }
create or replace function public.get_user_stats(p_user_id uuid)
returns table (total_answered bigint, correct bigint, wrong_count bigint, exam_count bigint)
language sql
stable
security definer
as $$
  select
    (select count(*)::bigint from public.user_history where user_id = p_user_id),
    (select count(*)::bigint from public.user_history where user_id = p_user_id and is_correct = true),
    (select count(*)::bigint from public.wrong_book where user_id = p_user_id),
    (select count(*)::bigint from public.exam_sessions where user_id = p_user_id);
$$;

-- 注：security definer 让 RPC 绕过 RLS 读取用户自己的数据；
-- get_user_stats 内部 where user_id = p_user_id，调用方需传入自己的 id（前端从 auth.getUser 拿）
