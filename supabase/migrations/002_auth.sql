-- User profiles for approval gate
create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  status text default 'pending',  -- pending | approved | rejected
  created_at timestamptz default now(),
  approved_at timestamptz,
  approved_by text
);

-- RLS policies
alter table user_profiles enable row level security;

-- Users can read their own profile
create policy "users_read_own_profile"
on user_profiles for select
using (auth.uid() = id);

-- Service role can do everything (for admin API)
create policy "service_role_all"
on user_profiles for all
using (true)
with check (true);

-- Auto-approve admin on signup
create or replace function approve_admin_on_signup()
returns trigger as $$
begin
  if new.email = 'leowatts25@gmail.com' then
    new.status := 'approved';
    new.approved_at := now();
    new.approved_by := 'system';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger auto_approve_admin
before insert on user_profiles
for each row execute function approve_admin_on_signup();
