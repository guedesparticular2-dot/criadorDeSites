insert into plans (id, code, name) values
  ('018f0000-0000-7000-8000-000000000001', 'SIMPLE', 'Simples'),
  ('018f0000-0000-7000-8000-000000000002', 'MEDIUM', 'Médio'),
  ('018f0000-0000-7000-8000-000000000003', 'UNLIMITED', 'Ilimitado')
on conflict (code) do nothing;

insert into plan_entitlements (plan_id, feature_code, limit_value, enforcement) values
  ('018f0000-0000-7000-8000-000000000001', 'active_users', 20, 'SOFT'),
  ('018f0000-0000-7000-8000-000000000001', 'published_pages', 10, 'SOFT'),
  ('018f0000-0000-7000-8000-000000000001', 'storage_bytes', 524288000, 'SOFT'),
  ('018f0000-0000-7000-8000-000000000002', 'active_users', 50, 'SOFT'),
  ('018f0000-0000-7000-8000-000000000002', 'published_pages', 20, 'SOFT'),
  ('018f0000-0000-7000-8000-000000000002', 'storage_bytes', 1073741824, 'SOFT'),
  ('018f0000-0000-7000-8000-000000000003', 'active_users', null, 'SOFT'),
  ('018f0000-0000-7000-8000-000000000003', 'published_pages', null, 'SOFT'),
  ('018f0000-0000-7000-8000-000000000003', 'storage_bytes', 2147483648, 'SOFT')
on conflict (plan_id, feature_code) do nothing;

insert into roles (id, code, name, scope) values
  ('018f0000-0000-7000-8000-000000000011', 'SUPERUSER', 'Superusuário Técnico', 'PLATFORM'),
  ('018f0000-0000-7000-8000-000000000012', 'PRIMARY_ADMIN', 'Administrador Principal', 'TENANT'),
  ('018f0000-0000-7000-8000-000000000013', 'ADMIN', 'Administrador', 'TENANT'),
  ('018f0000-0000-7000-8000-000000000014', 'USER', 'Usuário', 'TENANT')
on conflict (code) do nothing;

insert into layout_definitions (id, code, name, column_schema, responsive_rules) values
  ('018f0000-0000-7000-8000-000000000021', 'ONE_COLUMN', 'Uma coluna', '[1]', '{"mobile":"stack"}'),
  ('018f0000-0000-7000-8000-000000000022', 'TWO_EQUAL', 'Duas colunas iguais', '[1,1]', '{"mobile":"stack"}'),
  ('018f0000-0000-7000-8000-000000000023', 'THREE_EQUAL', 'Três colunas iguais', '[1,1,1]', '{"mobile":"stack"}'),
  ('018f0000-0000-7000-8000-000000000024', 'TWO_THIRDS', 'Dois terços + um terço', '[2,1]', '{"mobile":"stack"}'),
  ('018f0000-0000-7000-8000-000000000025', 'ONE_THIRD', 'Um terço + dois terços', '[1,2]', '{"mobile":"stack"}')
on conflict (code) do nothing;
