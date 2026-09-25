-- ============================================================================
-- SMPT V2: CASCADE UPDATE ON PROJECT_PRODUCTS (Allows moving products between projects)
-- ============================================================================

alter table public.work_items
  drop constraint if exists work_items_product_matches_project_fk,
  add constraint work_items_product_matches_project_fk
  foreign key (project_id, product_id) references public.project_products(project_id, id)
  on update cascade on delete restrict;

alter table public.bom_requirements
  drop constraint if exists bom_requirements_product_matches_project_fk,
  add constraint bom_requirements_product_matches_project_fk
  foreign key (project_id, product_id) references public.project_products(project_id, id)
  on update cascade on delete restrict;

alter table public.production_orders
  drop constraint if exists production_orders_project_id_product_id_fkey,
  add constraint production_orders_project_id_product_id_fkey
  foreign key (project_id, product_id) references public.project_products(project_id, id)
  on update cascade on delete restrict;

alter table public.finished_goods
  drop constraint if exists finished_goods_project_id_product_id_fkey,
  add constraint finished_goods_project_id_product_id_fkey
  foreign key (project_id, product_id) references public.project_products(project_id, id)
  on update cascade on delete restrict;

alter table public.manufacturing_transactions
  drop constraint if exists manufacturing_transactions_project_id_product_id_fkey,
  add constraint manufacturing_transactions_project_id_product_id_fkey
  foreign key (project_id, product_id) references public.project_products(project_id, id)
  on update cascade on delete restrict;
