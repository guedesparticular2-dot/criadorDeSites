insert into permissions (id, code, module, description) values
  ('018f0000-0000-7000-8000-000000000101', 'tenant.appearance.publish', 'tenant', 'Publicar identidade visual e institucional do tenant'),
  ('018f0000-0000-7000-8000-000000000102', 'people.manage', 'people', 'Promover, suspender e gerir administradores'),
  ('018f0000-0000-7000-8000-000000000103', 'people.approve', 'people', 'Aprovar ou rejeitar cadastros'),
  ('018f0000-0000-7000-8000-000000000104', 'content.edit', 'content', 'Criar e editar conteúdo editorial'),
  ('018f0000-0000-7000-8000-000000000105', 'content.publish', 'content', 'Publicar conteúdo editorial'),
  ('018f0000-0000-7000-8000-000000000106', 'comments.moderate', 'comments', 'Moderar comentários'),
  ('018f0000-0000-7000-8000-000000000107', 'media.upload', 'media', 'Enviar mídia para processamento')
on conflict (code) do nothing;

-- O Administrador Principal possui todos os recursos do catálogo. Administradores
-- recebem edição/publicação por padrão; cada concessão pode ser revogada por
-- override de associação.
insert into role_permissions (role_id, permission_id)
select role.id, permission.id
from roles role cross join permissions permission
where role.code = 'PRIMARY_ADMIN'
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select role.id, permission.id
from roles role join permissions permission on permission.code in (
  'content.edit', 'content.publish', 'comments.moderate', 'media.upload'
)
where role.code = 'ADMIN'
on conflict do nothing;
