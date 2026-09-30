-- A página pública precisa de uma única configuração de aparência por tenant.
-- Configurações anteriores permanecem versionadas com estado SUPERSEDED.
create unique index tenant_theme_configs_one_published_per_tenant_idx
  on tenant_theme_configs (tenant_id)
  where state = 'PUBLISHED';
