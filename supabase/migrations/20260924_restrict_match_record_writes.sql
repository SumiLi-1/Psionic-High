-- 前端只读；新增对局必须通过 match-import Edge Function 验证录入码后写入。
-- service_role 不受该限制影响，供 Edge Function 安全写入。
revoke insert, update, delete on table public.match_records from anon, authenticated;
