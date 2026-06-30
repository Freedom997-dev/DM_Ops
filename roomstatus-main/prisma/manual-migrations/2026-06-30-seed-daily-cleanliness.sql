-- Seed the Daily Cleanliness Inspection workflow.
-- Apply via `execute_sql` in a Supabase-management chat AFTER the migration above.

-- WorkflowDefinition
INSERT INTO "WorkflowDefinition" ("id", "slug", "name", "description", "shape", "rolesAllowed") VALUES (
  'wfd_daily_cleanliness',
  'daily-cleanliness',
  'Daily Cleanliness Inspection',
  'Matrix check across rooms — 18 cleanliness items per room, three-state OK/Issue/NA, run daily by managers and inspectors.',
  'MATRIX',
  '["ADMIN","MANAGER","INSPECTOR"]'
);

-- WorkflowItem (18 items in order)
INSERT INTO "WorkflowItem" ("id", "workflowId", "text", "order") VALUES
  ('wfi_dc_01', 'wfd_daily_cleanliness', 'Window & Glass',     0),
  ('wfi_dc_02', 'wfd_daily_cleanliness', 'Air-Conditioner',    1),
  ('wfi_dc_03', 'wfd_daily_cleanliness', 'Chair & Cushion',    2),
  ('wfi_dc_04', 'wfd_daily_cleanliness', 'Lights & Lamps',     3),
  ('wfi_dc_05', 'wfd_daily_cleanliness', 'Bedsheet & Pillows', 4),
  ('wfi_dc_06', 'wfd_daily_cleanliness', 'Toilet & Shower',    5),
  ('wfi_dc_07', 'wfd_daily_cleanliness', 'Soap & Shampoo',     6),
  ('wfi_dc_08', 'wfd_daily_cleanliness', 'Sink',               7),
  ('wfi_dc_09', 'wfd_daily_cleanliness', 'Towels',             8),
  ('wfi_dc_10', 'wfd_daily_cleanliness', 'Iron & Board',       9),
  ('wfi_dc_11', 'wfd_daily_cleanliness', 'Hangers',            10),
  ('wfi_dc_12', 'wfd_daily_cleanliness', 'Coffee & Supplies',  11),
  ('wfi_dc_13', 'wfd_daily_cleanliness', 'Telephone',          12),
  ('wfi_dc_14', 'wfd_daily_cleanliness', 'Television',         13),
  ('wfi_dc_15', 'wfd_daily_cleanliness', 'Microwave',          14),
  ('wfi_dc_16', 'wfd_daily_cleanliness', 'Fridge',             15),
  ('wfi_dc_17', 'wfd_daily_cleanliness', 'Drawers',            16),
  ('wfi_dc_18', 'wfd_daily_cleanliness', 'Floor',              17);
