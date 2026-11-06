ALTER TABLE "public"."production_checks"
  DROP COLUMN "is_paid";

ALTER TABLE "public"."production_checks"
  DROP COLUMN "payment_status";

CREATE TABLE "public"."v_max_id" (
  "coalesce" bigint
);

CREATE POLICY "petty_delete" ON "public"."petty_cash_transactions"
  FOR DELETE
  TO "authenticated"
  USING ((public.has_permission('kas_kecil.write'::text) OR (upper(COALESCE(public.current_user_role(), ''::text)) = 'ADMIN'::text)));

CREATE POLICY "petty_update" ON "public"."petty_cash_transactions"
  FOR UPDATE
  TO "authenticated"
  USING ((public.has_permission('kas_kecil.write'::text) OR (upper(COALESCE(public.current_user_role(), ''::text)) = 'ADMIN'::text)));

CREATE POLICY "authenticated_select_workers" ON "public"."workers"
  FOR SELECT
  TO "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v_max_id" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."v_max_id" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v_max_id" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v_max_id" TO "service_role";
