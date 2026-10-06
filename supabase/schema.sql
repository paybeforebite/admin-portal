create extension if not exists pgcrypto;
create table if not exists public.restaurants(id uuid primary key default gen_random_uuid(),name text not null,slug text not null unique,created_at timestamptz not null default now());
create table if not exists public.restaurant_members(user_id uuid primary key references auth.users(id) on delete cascade,restaurant_id uuid not null references public.restaurants(id) on delete cascade,role text not null default 'cashier' check(role in('owner','admin','cashier')),is_active boolean not null default true,created_at timestamptz not null default now());
insert into public.restaurants(id,name,slug) values('00000000-0000-0000-0000-000000000001','Customer A','customer-a') on conflict(id) do nothing;
create or replace function public.current_restaurant_id() returns uuid language sql stable security definer set search_path=public as $$select restaurant_id from public.restaurant_members where user_id=auth.uid() and is_active=true limit 1$$;
alter table public.menu_items add column if not exists restaurant_id uuid;alter table public.menu_item_history add column if not exists restaurant_id uuid;alter table public.invoices add column if not exists restaurant_id uuid;alter table public.invoice_items add column if not exists restaurant_id uuid;
update public.menu_items set restaurant_id='00000000-0000-0000-0000-000000000001' where restaurant_id is null;update public.menu_item_history h set restaurant_id=m.restaurant_id from public.menu_items m where h.menu_item_id=m.id and h.restaurant_id is null;update public.invoices set restaurant_id='00000000-0000-0000-0000-000000000001' where restaurant_id is null;update public.invoice_items ii set restaurant_id=i.restaurant_id from public.invoices i where ii.invoice_id=i.id and ii.restaurant_id is null;
alter table public.menu_items alter column restaurant_id set not null,alter column restaurant_id set default public.current_restaurant_id();alter table public.menu_item_history alter column restaurant_id set not null,alter column restaurant_id set default public.current_restaurant_id();alter table public.invoices alter column restaurant_id set not null,alter column restaurant_id set default public.current_restaurant_id();alter table public.invoice_items alter column restaurant_id set not null,alter column restaurant_id set default public.current_restaurant_id();
alter table public.invoices drop constraint if exists invoices_invoice_number_key;create unique index if not exists invoices_restaurant_invoice_number_uidx on public.invoices(restaurant_id,invoice_number);
alter table public.restaurants enable row level security;alter table public.restaurant_members enable row level security;alter table public.menu_items enable row level security;alter table public.menu_item_history enable row level security;alter table public.invoices enable row level security;alter table public.invoice_items enable row level security;
drop policy if exists restaurant_member_read on public.restaurants;create policy restaurant_member_read on public.restaurants for select to authenticated using(id=public.current_restaurant_id());
drop policy if exists restaurant_self_read on public.restaurant_members;create policy restaurant_self_read on public.restaurant_members for select to authenticated using(user_id=auth.uid());
drop policy if exists menu_read on public.menu_items;drop policy if exists menu_insert on public.menu_items;drop policy if exists menu_update on public.menu_items;drop policy if exists menu_delete on public.menu_items;create policy menu_read on public.menu_items for select to authenticated using(restaurant_id=public.current_restaurant_id());create policy menu_insert on public.menu_items for insert to authenticated with check(restaurant_id=public.current_restaurant_id());create policy menu_update on public.menu_items for update to authenticated using(restaurant_id=public.current_restaurant_id()) with check(restaurant_id=public.current_restaurant_id());create policy menu_delete on public.menu_items for delete to authenticated using(restaurant_id=public.current_restaurant_id());
drop policy if exists history_read on public.menu_item_history;create policy history_read on public.menu_item_history for select to authenticated using(restaurant_id=public.current_restaurant_id());
drop policy if exists invoice_read on public.invoices;drop policy if exists invoice_insert on public.invoices;drop policy if exists invoice_update on public.invoices;drop policy if exists invoice_delete on public.invoices;create policy invoice_read on public.invoices for select to authenticated using(restaurant_id=public.current_restaurant_id());create policy invoice_insert on public.invoices for insert to authenticated with check(restaurant_id=public.current_restaurant_id());create policy invoice_update on public.invoices for update to authenticated using(restaurant_id=public.current_restaurant_id()) with check(restaurant_id=public.current_restaurant_id());create policy invoice_delete on public.invoices for delete to authenticated using(restaurant_id=public.current_restaurant_id());
drop policy if exists item_read on public.invoice_items;drop policy if exists item_insert on public.invoice_items;create policy item_read on public.invoice_items for select to authenticated using(restaurant_id=public.current_restaurant_id());create policy item_insert on public.invoice_items for insert to authenticated with check(restaurant_id=public.current_restaurant_id() and exists(select 1 from public.invoices i where i.id=invoice_id and i.restaurant_id=public.current_restaurant_id()));


-- Tenant-isolation hardening: remove any legacy/permissive policies and recreate only member-scoped policies.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('restaurants','restaurant_members','menu_items','menu_item_history','invoices','invoice_items')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

CREATE POLICY restaurant_member_read ON public.restaurants
  FOR SELECT TO authenticated
  USING (id = public.current_restaurant_id());

CREATE POLICY restaurant_self_read ON public.restaurant_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND is_active = true);

CREATE POLICY menu_tenant_select ON public.menu_items
  FOR SELECT TO authenticated
  USING (restaurant_id = public.current_restaurant_id());
CREATE POLICY menu_tenant_insert ON public.menu_items
  FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = public.current_restaurant_id());
CREATE POLICY menu_tenant_update ON public.menu_items
  FOR UPDATE TO authenticated
  USING (restaurant_id = public.current_restaurant_id())
  WITH CHECK (restaurant_id = public.current_restaurant_id());
CREATE POLICY menu_tenant_delete ON public.menu_items
  FOR DELETE TO authenticated
  USING (restaurant_id = public.current_restaurant_id());

CREATE POLICY history_tenant_select ON public.menu_item_history
  FOR SELECT TO authenticated
  USING (restaurant_id = public.current_restaurant_id());

CREATE POLICY invoice_tenant_select ON public.invoices
  FOR SELECT TO authenticated
  USING (restaurant_id = public.current_restaurant_id());
CREATE POLICY invoice_tenant_insert ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = public.current_restaurant_id());
CREATE POLICY invoice_tenant_update ON public.invoices
  FOR UPDATE TO authenticated
  USING (restaurant_id = public.current_restaurant_id())
  WITH CHECK (restaurant_id = public.current_restaurant_id());
CREATE POLICY invoice_tenant_delete ON public.invoices
  FOR DELETE TO authenticated
  USING (restaurant_id = public.current_restaurant_id());

CREATE POLICY invoice_item_tenant_select ON public.invoice_items
  FOR SELECT TO authenticated
  USING (restaurant_id = public.current_restaurant_id());
CREATE POLICY invoice_item_tenant_insert ON public.invoice_items
  FOR INSERT TO authenticated
  WITH CHECK (
    restaurant_id = public.current_restaurant_id()
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id
        AND i.restaurant_id = public.current_restaurant_id()
    )
  );


-- PayBeforeBite customer onboarding
alter table public.restaurants
  add column if not exists status text not null default 'pending'
    check (status in ('pending','active','suspended','cancelled')),
  add column if not exists plan text not null default 'basic',
  add column if not exists owner_name text,
  add column if not exists owner_email text,
  add column if not exists phone text,
  add column if not exists activated_at timestamptz;

alter table public.restaurant_members
  add column if not exists invited_email text,
  add column if not exists invited_at timestamptz,
  add column if not exists activated_at timestamptz;

create index if not exists restaurants_status_idx on public.restaurants(status);
create index if not exists restaurant_members_restaurant_idx on public.restaurant_members(restaurant_id);


-- Helper for role-aware UI/API access without recursive RLS evaluation.
create or replace function public.current_restaurant_role()
returns text
language sql
stable
security definer
set search_path=public
as $$
  select role
  from public.restaurant_members
  where user_id = auth.uid()
    and is_active = true
  limit 1
$$;

create policy restaurant_admin_member_read on public.restaurant_members
  for select to authenticated
  using (
    restaurant_id = public.current_restaurant_id()
    and public.current_restaurant_role() in ('owner','admin')
  );

create policy restaurant_admin_manage_read on public.restaurants
  for select to authenticated
  using (
    id = public.current_restaurant_id()
    and public.current_restaurant_role() in ('owner','admin')
  );


-- PayBeforeBite platform admin
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

drop policy if exists platform_admin_self_read on public.platform_admins;
create policy platform_admin_self_read on public.platform_admins
  for select to authenticated
  using (user_id = auth.uid() and is_active = true);

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists (
    select 1
    from public.platform_admins
    where user_id = auth.uid()
      and is_active = true
  )
$$;

create index if not exists platform_admins_active_idx
  on public.platform_admins(user_id)
  where is_active = true;


-- PayBeforeBite subscription and feature-entitlement model
-- Plans define packages; features define capabilities; plan_features maps
-- capabilities and limits; subscriptions define the restaurant's active plan.

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  price_monthly numeric(12,2) not null default 0 check (price_monthly >= 0),
  price_yearly numeric(12,2) not null default 0 check (price_yearly >= 0),
  currency text not null default 'INR',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.features (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  feature_type text not null default 'boolean'
    check (feature_type in ('boolean','limit')),
  created_at timestamptz not null default now()
);

create table if not exists public.plan_features (
  plan_id uuid not null references public.plans(id) on delete cascade,
  feature_id uuid not null references public.features(id) on delete cascade,
  enabled boolean not null default true,
  limit_value bigint,
  created_at timestamptz not null default now(),
  primary key (plan_id, feature_id),
  check (limit_value is null or limit_value >= 0)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  status text not null default 'trialing'
    check (status in ('trialing','active','past_due','paused','cancelled','expired')),
  billing_cycle text not null default 'monthly'
    check (billing_cycle in ('monthly','yearly')),
  start_date timestamptz not null default now(),
  end_date timestamptz,
  trial_end_date timestamptz,
  cancelled_at timestamptz,
  external_customer_id text,
  external_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subscriptions_active_restaurant_uidx
  on public.subscriptions(restaurant_id)
  where status in ('trialing','active','past_due','paused');

create index if not exists subscriptions_restaurant_idx
  on public.subscriptions(restaurant_id);

create index if not exists subscriptions_status_idx
  on public.subscriptions(status);

create table if not exists public.subscription_history (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  old_plan_id uuid references public.plans(id) on delete set null,
  new_plan_id uuid references public.plans(id) on delete set null,
  old_status text,
  new_status text,
  reason text,
  changed_at timestamptz not null default now()
);

create index if not exists subscription_history_restaurant_idx
  on public.subscription_history(restaurant_id, changed_at desc);

create table if not exists public.usage_metrics (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  metric_date date not null,
  invoice_count bigint not null default 0 check (invoice_count >= 0),
  active_users bigint not null default 0 check (active_users >= 0),
  storage_bytes bigint not null default 0 check (storage_bytes >= 0),
  api_requests bigint not null default 0 check (api_requests >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, metric_date)
);

create index if not exists usage_metrics_date_idx
  on public.usage_metrics(metric_date desc);

-- PayBeforeBite production plan catalog.
-- Prices are configurable in the platform catalog and are stored in INR.
insert into public.plans(code, name, description, price_monthly, price_yearly, currency)
values
  ('starter', 'Starter', 'Essential billing and menu management for small restaurants', 299, 2999, 'INR'),
  ('basic', 'Basic', 'Customer management, exports and higher billing limits', 599, 5999, 'INR'),
  ('pro', 'Pro', 'Advanced POS, inventory and reporting', 999, 9999, 'INR'),
  ('business', 'Business', 'Multi-outlet, API and advanced operations', 1999, 19999, 'INR'),
  ('enterprise', 'Enterprise', 'Custom enterprise capabilities and support', 0, 0, 'INR')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  price_monthly = excluded.price_monthly,
  price_yearly = excluded.price_yearly,
  currency = excluded.currency,
  updated_at = now();

-- Feature catalog. Pricing is kept in plans; limits are configured in plan_features.
insert into public.features(code, name, description, feature_type)
values
  ('billing', 'Billing', 'Create and manage invoices', 'boolean'),
  ('menu_management', 'Menu Management', 'Create and manage menu items', 'boolean'),
  ('dashboard', 'Dashboard', 'Access the restaurant dashboard', 'boolean'),
  ('customer_management', 'Customer Management', 'Manage restaurant customers', 'boolean'),
  ('inventory', 'Inventory', 'Manage inventory and stock', 'boolean'),
  ('advanced_reports', 'Advanced Reports', 'Access advanced sales and business reports', 'boolean'),
  ('excel_export', 'Excel/PDF Export', 'Export operational data and reports', 'boolean'),
  ('api_access', 'API Access', 'Access PayBeforeBite APIs', 'boolean'),
  ('multi_device', 'Multi-device POS', 'Use POS across multiple devices', 'boolean'),
  ('multi_outlet', 'Multi-outlet', 'Manage multiple restaurant outlets', 'boolean'),
  ('staff_users', 'Staff Users', 'Maximum active restaurant staff users', 'limit'),
  ('daily_invoice_limit', 'Daily Invoice Limit', 'Maximum invoices that can be created per day', 'limit')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  feature_type = excluded.feature_type;

-- Default entitlement matrix. This is an upsert so rerunning schema.sql keeps plan settings current.
insert into public.plan_features(plan_id, feature_id, enabled, limit_value)
select p.id, f.id,
       case
         when p.code = 'starter' and f.code in ('billing','menu_management','dashboard') then true
         when p.code = 'basic' and f.code in ('billing','menu_management','dashboard','customer_management','excel_export','multi_device') then true
         when p.code = 'pro' and f.code in ('billing','menu_management','dashboard','customer_management','inventory','advanced_reports','excel_export','multi_device') then true
         when p.code = 'business' and f.code in ('billing','menu_management','dashboard','customer_management','inventory','advanced_reports','excel_export','api_access','multi_device','multi_outlet') then true
         when p.code = 'enterprise' then true
         else false
       end,
       case
         when f.code = 'staff_users' and p.code = 'starter' then 2
         when f.code = 'staff_users' and p.code = 'basic' then 5
         when f.code = 'staff_users' and p.code = 'pro' then 10
         when f.code = 'staff_users' and p.code = 'business' then 25
         when f.code = 'staff_users' and p.code = 'enterprise' then null
         when f.code = 'daily_invoice_limit' and p.code = 'starter' then 100
         when f.code = 'daily_invoice_limit' and p.code = 'basic' then 300
         when f.code = 'daily_invoice_limit' and p.code = 'pro' then 1000
         when f.code = 'daily_invoice_limit' and p.code = 'business' then 5000
         when f.code = 'daily_invoice_limit' and p.code = 'enterprise' then null
         else null
       end
from public.plans p
cross join public.features f
on conflict (plan_id, feature_id) do update set
  enabled = excluded.enabled,
  limit_value = excluded.limit_value;

-- Keep the restaurant plan column aligned with the supported catalog.
update public.restaurants
set plan = 'basic'
where plan is null or plan not in ('starter','basic','pro','business','enterprise');

alter table public.plans enable row level security;
alter table public.features enable row level security;
alter table public.plan_features enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_history enable row level security;
alter table public.usage_metrics enable row level security;

-- Authenticated users can read the active catalog. Platform admins can manage it later
-- through secured Edge Functions.
drop policy if exists plans_active_read on public.plans;
create policy plans_active_read on public.plans
  for select to authenticated
  using (is_active = true or public.is_platform_admin());

drop policy if exists features_read on public.features;
create policy features_read on public.features
  for select to authenticated
  using (true);

drop policy if exists plan_features_read on public.plan_features;
create policy plan_features_read on public.plan_features
  for select to authenticated
  using (
    exists (
      select 1 from public.plans p
      where p.id = plan_id
        and (p.is_active = true or public.is_platform_admin())
    )
  );

drop policy if exists subscription_tenant_read on public.subscriptions;
create policy subscription_tenant_read on public.subscriptions
  for select to authenticated
  using (
    restaurant_id = public.current_restaurant_id()
    or public.is_platform_admin()
  );

drop policy if exists subscription_history_tenant_read on public.subscription_history;
create policy subscription_history_tenant_read on public.subscription_history
  for select to authenticated
  using (
    restaurant_id = public.current_restaurant_id()
    or public.is_platform_admin()
  );

drop policy if exists usage_metrics_tenant_read on public.usage_metrics;
create policy usage_metrics_tenant_read on public.usage_metrics
  for select to authenticated
  using (
    restaurant_id = public.current_restaurant_id()
    or public.is_platform_admin()
  );


-- Subscription entitlement helpers used by the POS and future platform features.
create or replace function public.current_subscription_plan_id()
returns uuid
language sql
stable
security definer
set search_path=public
as $$
  select s.plan_id
  from public.subscriptions s
  where s.restaurant_id = public.current_restaurant_id()
    and s.status in ('trialing','active','past_due','paused')
    and (s.end_date is null or s.end_date >= now())
  order by s.start_date desc
  limit 1
$$;

create or replace function public.has_feature(feature_code text)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select coalesce(pf.enabled, false)
  from public.plan_features pf
  join public.features f on f.id = pf.feature_id
  where pf.plan_id = public.current_subscription_plan_id()
    and f.code = feature_code
  limit 1
$$;

create or replace function public.get_feature_limit(feature_code text)
returns bigint
language sql
stable
security definer
set search_path=public
as $$
  select pf.limit_value
  from public.plan_features pf
  join public.features f on f.id = pf.feature_id
  where pf.plan_id = public.current_subscription_plan_id()
    and f.code = feature_code
  limit 1
$$;

-- Secure invoice creation with server-side daily plan-limit enforcement.
-- The browser should call this function instead of inserting invoices directly.
create or replace function public.create_invoice_with_items(
  p_invoice_number text,
  p_customer_name text,
  p_subtotal numeric,
  p_tax numeric,
  p_total numeric,
  p_items jsonb
)
returns public.invoices
language plpgsql
security definer
set search_path=public
as $$
declare
  v_restaurant_id uuid := public.current_restaurant_id();
  v_invoice_limit bigint := public.get_feature_limit('daily_invoice_limit');
  v_invoice_id uuid;
  v_invoice public.invoices;
  v_item jsonb;
begin
  if v_restaurant_id is null then
    raise exception 'Restaurant membership is required.';
  end if;

  if not public.has_feature('billing') then
    raise exception 'Billing is not available on the current plan.';
  end if;

  if v_invoice_limit is not null and (
    select count(*)
    from public.invoices
    where restaurant_id = v_restaurant_id
      and invoice_date >= current_date
      and invoice_date < current_date + interval '1 day'
  ) >= v_invoice_limit then
    raise exception 'Daily invoice limit reached for your plan (% invoices/day).', v_invoice_limit;
  end if;

  insert into public.invoices (
    restaurant_id, invoice_number, customer_name, subtotal, tax, total
  )
  values (
    v_restaurant_id, p_invoice_number, p_customer_name, p_subtotal, p_tax, p_total
  )
  returning * into v_invoice;

  v_invoice_id := v_invoice.id;

  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into public.invoice_items (
      restaurant_id,
      invoice_id,
      menu_item_id,
      item_name,
      quantity,
      unit_price,
      line_total,
      food_type
    )
    values (
      v_restaurant_id,
      v_invoice_id,
      (v_item->>'menu_item_id')::bigint,
      v_item->>'item_name',
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price')::numeric,
      (v_item->>'line_total')::numeric,
      v_item->>'food_type'
    );
  end loop;

  return v_invoice;
exception
  when others then
    raise;
end;
$$;

revoke all on function public.create_invoice_with_items(text,text,numeric,numeric,numeric,jsonb) from public;
grant execute on function public.create_invoice_with_items(text,text,numeric,numeric,numeric,jsonb) to authenticated;
