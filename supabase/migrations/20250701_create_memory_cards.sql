-- === 背诵模块：牌组 / 卡片 / SM-2 调度状态 / 复习日志 ===
-- 执行方式：supabase db reset（随迁移序列自动执行）
--
-- 依赖：
--   - 20250611_add_user_roles.sql 中已定义的 public.is_admin() 函数（本文件不重复创建）
--
-- 表：
--   1. decks             牌组
--   2. cards             卡片
--   3. card_user_states  用户调度状态（SM-2）
--   4. card_reviews      复习日志

-- ============================================================
-- 1. 表结构
-- ============================================================

-- 牌组
create table if not exists decks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  lang text not null check (lang in ('ja','en')),
  card_type text not null check (card_type in ('word','grammar','sentence')),
  visibility text not null default 'private' check (visibility in ('public','private')),
  creator_id uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 卡片
create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid references decks(id) on delete cascade,
  front text not null,
  back text not null,
  metadata jsonb default '{}',
  tags text[] default '{}',
  creator_id uuid references auth.users(id),
  created_at timestamptz default now()
);

-- 用户调度状态（SM-2）
create table if not exists card_user_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  card_id uuid references cards(id) on delete cascade,
  ease float default 2.5,
  interval_days int default 0,
  repetitions int default 0,
  due timestamptz default now(),
  last_reviewed timestamptz,
  unique(user_id, card_id)
);

-- 复习日志
create table if not exists card_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  card_id uuid references cards(id) on delete cascade,
  mode text check (mode in ('flashcard','choice','typing','dictation')),
  quality int check (quality between 0 and 5),
  user_answer text,
  reviewed_at timestamptz default now()
);

-- ============================================================
-- 2. 索引
-- ============================================================

create index if not exists idx_cards_deck_id    on cards(deck_id);
create index if not exists idx_cards_creator_id  on cards(creator_id);
-- 今日队列查询核心索引：某用户到期卡片
create index if not exists idx_card_user_states_user_due
  on card_user_states(user_id, due);
-- 复习历史按时间倒序
create index if not exists idx_card_reviews_user_reviewed
  on card_reviews(user_id, reviewed_at desc);

-- ============================================================
-- 3. RLS 策略
-- ============================================================

alter table decks            enable row level security;
alter table cards            enable row level security;
alter table card_user_states enable row level security;
alter table card_reviews    enable row level security;

-- ---------- decks ----------
-- 公开牌组对所有人可读；私有牌组仅创建者 / 管理员可读
drop policy if exists "decks select visibility" on decks;
create policy "decks select visibility" on decks
  for select to public
  using (
    visibility = 'public'
    or creator_id = auth.uid()
    or public.is_admin()
  );

-- INSERT 限登录用户（且创建者必须为本人）
drop policy if exists "decks insert by authenticated" on decks;
create policy "decks insert by authenticated" on decks
  for insert to authenticated
  with check (creator_id = auth.uid());

-- UPDATE / DELETE 限创建者或管理员
drop policy if exists "decks update by owner or admin" on decks;
create policy "decks update by owner or admin" on decks
  for update to authenticated
  using (creator_id = auth.uid() or public.is_admin())
  with check (creator_id = auth.uid() or public.is_admin());

drop policy if exists "decks delete by owner or admin" on decks;
create policy "decks delete by owner or admin" on decks
  for delete to authenticated
  using (creator_id = auth.uid() or public.is_admin());

-- ---------- cards ----------
-- 通过 deck_id 联表判定可见性：公开 deck 的卡片所有人可读；私有 deck 仅创建者 / 管理员可读
drop policy if exists "cards select by deck visibility" on cards;
create policy "cards select by deck visibility" on cards
  for select to public
  using (
    exists (
      select 1 from decks
      where decks.id = cards.deck_id
        and (
          decks.visibility = 'public'
          or decks.creator_id = auth.uid()
          or public.is_admin()
        )
    )
  );

-- INSERT 限登录用户（且卡片创建者必须为本人）
drop policy if exists "cards insert by authenticated" on cards;
create policy "cards insert by authenticated" on cards
  for insert to authenticated
  with check (creator_id = auth.uid());

-- UPDATE / DELETE 限创建者或管理员
drop policy if exists "cards update by owner or admin" on cards;
create policy "cards update by owner or admin" on cards
  for update to authenticated
  using (creator_id = auth.uid() or public.is_admin())
  with check (creator_id = auth.uid() or public.is_admin());

drop policy if exists "cards delete by owner or admin" on cards;
create policy "cards delete by owner or admin" on cards
  for delete to authenticated
  using (creator_id = auth.uid() or public.is_admin());

-- ---------- card_user_states ----------
-- 仅本人可读写
drop policy if exists "card_user_states owner all" on card_user_states;
create policy "card_user_states owner all" on card_user_states
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- card_reviews ----------
-- 仅本人可读写
drop policy if exists "card_reviews owner all" on card_reviews;
create policy "card_reviews owner all" on card_reviews
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- 4. 示例数据（公共牌组，creator_id = NULL）
-- ============================================================

-- 公共牌组 1：日语入门单词 - JLPT N5
insert into decks (id, name, description, lang, card_type, visibility, creator_id)
values (
  '00000000-0000-0000-0000-0000000000a1',
  '日语入门单词 - JLPT N5',
  'JLPT N5 级别的基础日语单词，覆盖常见名词。',
  'ja', 'word', 'public', null
)
on conflict (id) do nothing;

-- 公共牌组 2：English Essential Words - CET-4
insert into decks (id, name, description, lang, card_type, visibility, creator_id)
values (
  '00000000-0000-0000-0000-0000000000a2',
  'English Essential Words - CET-4',
  'CET-4 高频英语核心词汇。',
  'en', 'word', 'public', null
)
on conflict (id) do nothing;

-- 卡片 1：猫
insert into cards (id, deck_id, front, back, metadata, tags, creator_id)
values (
  '00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000a1',
  '猫', '猫（猫科动物）',
  '{"reading":"ねこ","romaji":"neko","example_ja":"猫が寝転んでいる。","example_zh":"猫在躺着。"}',
  '{}', null
)
on conflict (id) do nothing;

-- 卡片 2：犬
insert into cards (id, deck_id, front, back, metadata, tags, creator_id)
values (
  '00000000-0000-0000-0000-0000000000b2',
  '00000000-0000-0000-0000-0000000000a1',
  '犬', '狗',
  '{"reading":"いぬ","romaji":"inu","example_ja":"犬は忠実な動物です。","example_zh":"狗是忠实的动物。"}',
  '{}', null
)
on conflict (id) do nothing;

-- 卡片 3：本
insert into cards (id, deck_id, front, back, metadata, tags, creator_id)
values (
  '00000000-0000-0000-0000-0000000000b3',
  '00000000-0000-0000-0000-0000000000a1',
  '本', '书',
  '{"reading":"ほん","romaji":"hon","example_ja":"本を読むのが好きです。","example_zh":"我喜欢读书。"}',
  '{}', null
)
on conflict (id) do nothing;

-- 卡片 4：abandon
insert into cards (id, deck_id, front, back, metadata, tags, creator_id)
values (
  '00000000-0000-0000-0000-0000000000b4',
  '00000000-0000-0000-0000-0000000000a2',
  'abandon', '放弃；抛弃',
  '{"phonetic":"/əˈbændən/","pos":"verb","example_en":"He abandoned his car.","example_zh":"他抛弃了他的车。"}',
  '{}', null
)
on conflict (id) do nothing;

-- 卡片 5：benefit
insert into cards (id, deck_id, front, back, metadata, tags, creator_id)
values (
  '00000000-0000-0000-0000-0000000000b5',
  '00000000-0000-0000-0000-0000000000a2',
  'benefit', '利益；好处',
  '{"phonetic":"/ˈbenɪfɪt/","pos":"noun","example_en":"Exercise has many benefits.","example_zh":"锻炼有很多好处。"}',
  '{}', null
)
on conflict (id) do nothing;
