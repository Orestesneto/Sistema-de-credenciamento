create table if not exists public.credenciados (
  id text primary key,
  nome_completo text not null,
  telefone text not null,
  data_nascimento text not null,
  perfil_acesso text not null default 'Visitante',
  codigo_credencial text not null unique,
  checkin_realizado_em timestamptz,
  checkin_realizado_por text,
  imagem text,
  imagem_data text,
  imagem_bytes integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists credenciados_telefone_idx on public.credenciados (telefone);
create index if not exists credenciados_codigo_idx on public.credenciados (codigo_credencial);
create index if not exists credenciados_perfil_idx on public.credenciados (perfil_acesso);
