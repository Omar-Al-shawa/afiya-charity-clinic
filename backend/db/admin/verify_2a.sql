-- التحقق من المرحلة 1B-2a (للقراءة فقط): 25 فحصاً V01-V25 على afiyah_test.
-- التشغيل: psql -X -v ON_ERROR_STOP=1 -v expect_db=afiyah_test -d afiyah_test -f backend/db/admin/verify_2a.sql
-- يبدأ بالحارس (\ir يُحلّ نسبةً إلى مجلد هذا الملف: admin/ ثم ../_guard.sql)، فيُنهى الاتصال إن لم تكن القاعدة afiyah_test والمستخدم omarsh.
-- القراءة فقط مفروضة آلياً: كل الفحوص داخل BEGIN TRANSACTION READ ONLY، فأي كتابة أو DDL أو nextval يفشل.
-- يقارن المخطط الحي بالتعريفات المعتمدة في الاتجاهين (الناقص والزائد كلاهما فشل). حالة التسلسلات تُقرأ مباشرة من علاقة التسلسل
-- (يفشل الاستعلام بخطأ صلاحية إن لم يكن المستخدم مخوّلاً) ولا يُعتمد على pg_sequences.last_value لأنه يرجع NULL أيضاً عند غياب الصلاحية.
\set ON_ERROR_STOP on
\ir ../_guard.sql

BEGIN TRANSACTION READ ONLY;

DO $v$
DECLARE
    chk      record;
    v_fail   int := 0;
    v_total  int := 0;
BEGIN
    IF current_database() <> 'afiyah_test' OR current_user <> 'omarsh' THEN
        RAISE EXCEPTION 'verify_2a: must run on afiyah_test as omarsh (got % as %)', current_database(), current_user;
    END IF;

    FOR chk IN
    WITH
    tbls AS (
        SELECT c.oid, c.relname, c.relkind, c.relowner, c.relacl, c.relpersistence, c.relrowsecurity, c.relforcerowsecurity, c.relispartition
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
    ),
    exp_cols(tbl, ord, col, typ, nn, ident, dflt) AS (VALUES
        ('users', 1, 'user_id', 'integer', true, 'a', NULL),
        ('users', 2, 'email', 'character varying(255)', true, '', NULL),
        ('users', 3, 'password_hash', 'character varying(255)', true, '', NULL),
        ('users', 4, 'role', 'character varying(20)', true, '', NULL),
        ('users', 5, 'is_active', 'boolean', true, '', 'true'),
        ('specialties', 1, 'specialty_id', 'integer', true, 'a', NULL),
        ('specialties', 2, 'specialty_name', 'character varying(100)', true, '', NULL),
        ('specialties', 3, 'appointment_duration', 'integer', true, '', NULL),
        ('patients', 1, 'patient_id', 'integer', true, 'a', NULL),
        ('patients', 2, 'user_id', 'integer', true, '', NULL),
        ('patients', 3, 'first_name', 'character varying(100)', true, '', NULL),
        ('patients', 4, 'last_name', 'character varying(100)', true, '', NULL),
        ('patients', 5, 'phone', 'character varying(20)', true, '', NULL),
        ('patients', 6, 'birth_date', 'date', true, '', NULL),
        ('patients', 7, 'address', 'character varying(255)', false, '', NULL),
        ('patients', 8, 'gender', 'character varying(10)', true, '', NULL),
        ('patients', 9, 'blood_type', 'character varying(5)', false, '', NULL),
        ('doctors', 1, 'doctor_id', 'integer', true, 'a', NULL),
        ('doctors', 2, 'user_id', 'integer', true, '', NULL),
        ('doctors', 3, 'specialty_id', 'integer', true, '', NULL),
        ('doctors', 4, 'first_name', 'character varying(100)', true, '', NULL),
        ('doctors', 5, 'last_name', 'character varying(100)', true, '', NULL),
        ('doctors', 6, 'birth_date', 'date', true, '', NULL),
        ('doctors', 7, 'phone', 'character varying(20)', true, '', NULL),
        ('doctors', 8, 'image_url', 'character varying(500)', false, '', NULL),
        ('doctors', 9, 'biography', 'text', false, '', NULL),
        ('doctors', 10, 'years_of_experience', 'integer', false, '', NULL),
        ('appointments', 1, 'appointment_id', 'integer', true, 'a', NULL),
        ('appointments', 2, 'patient_id', 'integer', true, '', NULL),
        ('appointments', 3, 'doctor_id', 'integer', true, '', NULL),
        ('appointments', 4, 'appointment_date', 'date', true, '', NULL),
        ('appointments', 5, 'appointment_time', 'time without time zone', true, '', NULL),
        ('appointments', 6, 'status', 'character varying(20)', true, '', '''booked''::character varying'),
        ('pending_changes', 1, 'change_id', 'integer', true, 'a', NULL),
        ('pending_changes', 2, 'doctor_id', 'integer', false, '', NULL),
        ('pending_changes', 3, 'specialty_id', 'integer', false, '', NULL),
        ('pending_changes', 4, 'change_type', 'character varying(20)', true, '', NULL),
        ('pending_changes', 5, 'new_data', 'jsonb', false, '', NULL),
        ('pending_changes', 6, 'status', 'character varying(20)', true, '', '''pending''::character varying'),
        ('pending_changes', 7, 'created_at', 'timestamp with time zone', true, '', 'now()'),
        ('pending_changes', 8, 'execute_at', 'timestamp with time zone', true, '', NULL),
        ('pending_changes', 9, 'failure_reason', 'text', false, '', NULL)
    ),
    act_cols AS (
        SELECT c.relname::text AS tbl,
               (row_number() OVER (PARTITION BY c.relname ORDER BY a.attnum))::int AS ord,
               a.attname::text AS col,
               format_type(a.atttypid, a.atttypmod) AS typ,
               a.attnotnull AS nn,
               a.attidentity::text AS ident,
               pg_get_expr(d.adbin, d.adrelid) AS dflt
          FROM pg_attribute a
          JOIN pg_class c ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
         WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
    ),
    exp_con(tbl, conname, contype, def) AS (VALUES
        ('users', 'users_pkey', 'p', 'PRIMARY KEY (user_id)'),
        ('specialties', 'specialties_pkey', 'p', 'PRIMARY KEY (specialty_id)'),
        ('patients', 'patients_pkey', 'p', 'PRIMARY KEY (patient_id)'),
        ('doctors', 'doctors_pkey', 'p', 'PRIMARY KEY (doctor_id)'),
        ('appointments', 'appointments_pkey', 'p', 'PRIMARY KEY (appointment_id)'),
        ('pending_changes', 'pending_changes_pkey', 'p', 'PRIMARY KEY (change_id)'),
        ('users', 'users_email_key', 'u', 'UNIQUE (email)'),
        ('specialties', 'specialties_specialty_name_key', 'u', 'UNIQUE (specialty_name)'),
        ('patients', 'patients_user_id_key', 'u', 'UNIQUE (user_id)'),
        ('doctors', 'doctors_user_id_key', 'u', 'UNIQUE (user_id)')
    ),
    act_con AS (
        SELECT cl.relname::text AS tbl, co.conname::text, co.contype::text, pg_get_constraintdef(co.oid) AS def
          FROM pg_constraint co JOIN pg_class cl ON cl.oid = co.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
         WHERE n.nspname = 'public' AND co.contype IN ('p', 'u')
    ),
    exp_fk(tbl, conname, cols, reftbl, refcols, del, upd, mt, dfr, val) AS (VALUES
        ('patients', 'patients_user_id_fkey', 'user_id', 'users', 'user_id', 'r', 'a', 's', false, true),
        ('doctors', 'doctors_user_id_fkey', 'user_id', 'users', 'user_id', 'r', 'a', 's', false, true),
        ('doctors', 'doctors_specialty_id_fkey', 'specialty_id', 'specialties', 'specialty_id', 'r', 'a', 's', false, true),
        ('appointments', 'appointments_patient_id_fkey', 'patient_id', 'patients', 'patient_id', 'r', 'a', 's', false, true),
        ('appointments', 'appointments_doctor_id_fkey', 'doctor_id', 'doctors', 'doctor_id', 'r', 'a', 's', false, true),
        ('pending_changes', 'pending_changes_doctor_id_fkey', 'doctor_id', 'doctors', 'doctor_id', 'r', 'a', 's', false, true),
        ('pending_changes', 'pending_changes_specialty_id_fkey', 'specialty_id', 'specialties', 'specialty_id', 'c', 'a', 's', false, true)
    ),
    act_fk AS (
        SELECT cl.relname::text AS tbl, co.conname::text,
               (SELECT string_agg(a.attname, ',' ORDER BY k.ord) FROM unnest(co.conkey) WITH ORDINALITY k(attnum, ord)
                  JOIN pg_attribute a ON a.attrelid = co.conrelid AND a.attnum = k.attnum) AS cols,
               rf.relname::text AS reftbl,
               (SELECT string_agg(a.attname, ',' ORDER BY k.ord) FROM unnest(co.confkey) WITH ORDINALITY k(attnum, ord)
                  JOIN pg_attribute a ON a.attrelid = co.confrelid AND a.attnum = k.attnum) AS refcols,
               co.confdeltype::text AS del, co.confupdtype::text AS upd, co.confmatchtype::text AS mt,
               co.condeferrable AS dfr, co.convalidated AS val
          FROM pg_constraint co
          JOIN pg_class cl ON cl.oid = co.conrelid
          JOIN pg_class rf ON rf.oid = co.confrelid
          JOIN pg_namespace n ON n.oid = cl.relnamespace
         WHERE co.contype = 'f' AND n.nspname = 'public'
    ),
    exp_ck(conname) AS (VALUES
        ('users_email_ck'), ('users_password_hash_ck'), ('users_role_ck'),
        ('specialties_name_ck'), ('specialties_duration_ck'),
        ('patients_first_name_ck'), ('patients_last_name_ck'), ('patients_phone_ck'), ('patients_address_ck'),
        ('patients_gender_ck'), ('patients_blood_type_ck'),
        ('doctors_first_name_ck'), ('doctors_last_name_ck'), ('doctors_phone_ck'), ('doctors_image_url_ck'),
        ('doctors_years_of_experience_ck'),
        ('appointments_date_not_friday_ck'), ('appointments_time_ck'), ('appointments_status_ck'),
        ('pending_changes_target_ck'), ('pending_changes_change_type_ck'), ('pending_changes_status_ck'),
        ('pending_changes_new_data_shape_ck'), ('pending_changes_failure_reason_ck'), ('pending_changes_execute_at_ck')
    ),
    act_ck AS (
        SELECT co.conname::text FROM pg_constraint co JOIN pg_class cl ON cl.oid = co.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
         WHERE n.nspname = 'public' AND co.contype = 'c'
    ),
    exp_idx(idxname) AS (VALUES
        ('users_pkey'), ('users_email_key'), ('specialties_pkey'), ('specialties_specialty_name_key'),
        ('patients_pkey'), ('patients_user_id_key'), ('doctors_pkey'), ('doctors_user_id_key'),
        ('appointments_pkey'), ('pending_changes_pkey')
    ),
    act_idx AS (
        SELECT ic.relname::text AS idxname
          FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid JOIN pg_class t ON t.oid = i.indrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE n.nspname = 'public'
    ),
    exp_seq(tbl, col) AS (VALUES
        ('users', 'user_id'), ('specialties', 'specialty_id'), ('patients', 'patient_id'),
        ('doctors', 'doctor_id'), ('appointments', 'appointment_id'), ('pending_changes', 'change_id')
    ),
    act_seq AS (
        SELECT c.relname::text AS tbl, a.attname::text AS col, ps.sequencename::text AS seqname,
               pg_get_serial_sequence(format('public.%I', c.relname), a.attname) AS owned_seq,
               ps.data_type::text AS typ, ps.start_value, ps.min_value, ps.max_value, ps.increment_by, ps.cycle, ps.cache_size
          FROM pg_attribute a
          JOIN pg_class c ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          LEFT JOIN pg_sequences ps ON ps.schemaname = 'public' AND ps.sequencename = c.relname || '_' || a.attname || '_seq'
         WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attidentity = 'a'
    ),
    seq_state(seqname, last_value, is_called) AS (
        -- قراءة مباشرة من علاقات التسلسل: خطأ صلاحية صريح عند غياب الصلاحية بدل NULL مضلل
        SELECT 'users_user_id_seq', last_value, is_called FROM public.users_user_id_seq
        UNION ALL SELECT 'specialties_specialty_id_seq', last_value, is_called FROM public.specialties_specialty_id_seq
        UNION ALL SELECT 'patients_patient_id_seq', last_value, is_called FROM public.patients_patient_id_seq
        UNION ALL SELECT 'doctors_doctor_id_seq', last_value, is_called FROM public.doctors_doctor_id_seq
        UNION ALL SELECT 'appointments_appointment_id_seq', last_value, is_called FROM public.appointments_appointment_id_seq
        UNION ALL SELECT 'pending_changes_change_id_seq', last_value, is_called FROM public.pending_changes_change_id_seq
    ),
    checks(id, descr, ok, detail) AS (
        SELECT 'V01', 'exactly the six approved tables (no seventh table, no migrations table)',
               (SELECT array_agg(relname::text ORDER BY relname) FROM tbls WHERE relkind = 'r')
                 = ARRAY['appointments','doctors','patients','pending_changes','specialties','users'],
               (SELECT string_agg(relname, ',' ORDER BY relname) FROM tbls WHERE relkind = 'r')
        UNION ALL SELECT 'V02', 'only tables, their 10 indexes and 6 identity sequences exist in public (no views, matviews, foreign tables, composite types)',
               (SELECT count(*) FROM tbls WHERE relkind = 'r') = 6 AND (SELECT count(*) FROM tbls WHERE relkind = 'i') = 10
               AND (SELECT count(*) FROM tbls WHERE relkind = 'S') = 6 AND (SELECT count(*) FROM tbls WHERE relkind NOT IN ('r','i','S')) = 0,
               (SELECT string_agg(relkind::text || '=' || n, ' ' ORDER BY relkind) FROM (SELECT relkind, count(*) AS n FROM tbls GROUP BY relkind) s)
        UNION ALL SELECT 'V03', 'no other schema holds objects (only public)',
               NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                            WHERE n.nspname NOT IN ('public','pg_catalog','information_schema','pg_toast') AND n.nspname !~ '^pg_(temp|toast_temp)'),
               NULL
        UNION ALL SELECT 'V04', 'all 42 columns match the approved names, order, types, nullability, identity and defaults; 33 NOT NULL constraints (PostgreSQL 18 catalog)',
               NOT EXISTS (SELECT * FROM act_cols EXCEPT SELECT * FROM exp_cols)
               AND NOT EXISTS (SELECT * FROM exp_cols EXCEPT SELECT * FROM act_cols)
               AND (SELECT count(*) FROM act_cols) = 42
               AND (SELECT count(*) FROM pg_constraint co JOIN pg_class cl ON cl.oid = co.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
                     WHERE n.nspname = 'public' AND co.contype = 'n') = 33,
               (SELECT count(*) || ' columns, ' || count(*) FILTER (WHERE nn) || ' not null' FROM act_cols)
        UNION ALL SELECT 'V05', 'years_of_experience is the doctors column name (report typos not copied)',
               EXISTS (SELECT 1 FROM act_cols WHERE tbl = 'doctors' AND col = 'years_of_experience')
               AND NOT EXISTS (SELECT 1 FROM act_cols WHERE col IN ('years_of_experince', 'bioghraphy', 'chang_type')),
               NULL
        UNION ALL SELECT 'V06', 'primary keys and unique constraints match exactly',
               NOT EXISTS (SELECT * FROM act_con EXCEPT SELECT * FROM exp_con)
               AND NOT EXISTS (SELECT * FROM exp_con EXCEPT SELECT * FROM act_con),
               (SELECT count(*) || ' PK/UNIQUE constraints' FROM act_con)
        UNION ALL SELECT 'V07', 'foreign keys: correct tables and columns, RESTRICT on delete except pending_changes.specialty_id CASCADE, NO ACTION on update, not deferrable, validated',
               NOT EXISTS (SELECT * FROM act_fk EXCEPT SELECT * FROM exp_fk)
               AND NOT EXISTS (SELECT * FROM exp_fk EXCEPT SELECT * FROM act_fk),
               (SELECT string_agg(conname || ':' || del, ' ' ORDER BY conname) FROM act_fk)
        UNION ALL SELECT 'V08', 'exactly the 25 approved CHECK constraints exist, all validated',
               NOT EXISTS (SELECT * FROM act_ck EXCEPT SELECT * FROM exp_ck)
               AND NOT EXISTS (SELECT * FROM exp_ck EXCEPT SELECT * FROM act_ck)
               AND (SELECT count(*) FROM act_ck) = 25
               AND NOT EXISTS (SELECT 1 FROM pg_constraint co JOIN pg_namespace n ON n.oid = co.connamespace
                                WHERE n.nspname = 'public' AND co.contype = 'c' AND NOT co.convalidated),
               (SELECT count(*) || ' CHECK constraints' FROM act_ck)
        UNION ALL SELECT 'V09', 'indexes are exactly the 10 constraint indexes (plain btree, no partial or expression indexes: those start in 1B-2b)',
               NOT EXISTS (SELECT * FROM act_idx EXCEPT SELECT * FROM exp_idx)
               AND NOT EXISTS (SELECT * FROM exp_idx EXCEPT SELECT * FROM act_idx)
               AND NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class t ON t.oid = i.indrelid JOIN pg_class ic ON ic.oid = i.indexrelid
                                 JOIN pg_am am ON am.oid = ic.relam JOIN pg_namespace n ON n.oid = t.relnamespace
                                WHERE n.nspname = 'public' AND (i.indpred IS NOT NULL OR i.indexprs IS NOT NULL OR NOT i.indisvalid OR am.amname <> 'btree')),
               (SELECT count(*) || ' indexes' FROM act_idx)
        UNION ALL SELECT 'V10', 'identity: the six primary keys are GENERATED ALWAYS and no column has BY DEFAULT identity or a serial default',
               (SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attidentity = 'a') = 6
               AND NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
                                WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attidentity = 'd')
               AND NOT EXISTS (SELECT 1 FROM pg_attrdef d JOIN pg_class c ON c.oid = d.adrelid JOIN pg_namespace n ON n.oid = c.relnamespace
                                WHERE n.nspname = 'public' AND pg_get_expr(d.adbin, d.adrelid) LIKE 'nextval(%'),
               NULL
        UNION ALL SELECT 'V11', 'each identity sequence: integer, start 1, increment 1, min 1, max 2147483647, cache 1, no cycle, owned by its column',
               (SELECT count(*) FROM act_seq) = 6
               AND NOT EXISTS (SELECT tbl, col FROM exp_seq EXCEPT SELECT tbl, col FROM act_seq)
               AND NOT EXISTS (SELECT 1 FROM act_seq WHERE typ IS DISTINCT FROM 'integer' OR start_value IS DISTINCT FROM 1 OR increment_by IS DISTINCT FROM 1
                                  OR min_value IS DISTINCT FROM 1 OR max_value IS DISTINCT FROM 2147483647 OR cache_size IS DISTINCT FROM 1
                                  OR cycle IS DISTINCT FROM false OR owned_seq IS DISTINCT FROM 'public.' || seqname),
               (SELECT string_agg(seqname, ',' ORDER BY seqname) FROM act_seq)
        UNION ALL SELECT 'V12', 'identity sequences are pristine: all six read directly (no NULL ambiguity), never used (is_called false, last_value 1); run as the sequence owner omarsh',
               current_user = 'omarsh'
               AND NOT EXISTS (SELECT 1 FROM tbls WHERE relkind = 'S' AND pg_get_userbyid(relowner) <> current_user)
               AND (SELECT count(*) FROM seq_state) = 6
               AND NOT EXISTS (SELECT 1 FROM seq_state WHERE is_called OR last_value IS DISTINCT FROM 1),
               (SELECT count(*) FILTER (WHERE NOT is_called AND last_value = 1) || ' of ' || count(*) || ' unused' FROM seq_state)
        UNION ALL SELECT 'V13', 'no persistent data: all six tables are empty',
               (SELECT count(*) FROM public.users) + (SELECT count(*) FROM public.patients) + (SELECT count(*) FROM public.doctors)
               + (SELECT count(*) FROM public.specialties) + (SELECT count(*) FROM public.appointments)
               + (SELECT count(*) FROM public.pending_changes) = 0,
               NULL
        UNION ALL SELECT 'V14', 'no application functions or procedures (helpers, definer functions and trigger functions start in later stages)',
               (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema')) = 0,
               NULL
        UNION ALL SELECT 'V15', 'no application triggers (exactly the 28 internal foreign-key triggers = 7 FKs x 4) and no rules',
               (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal) = 0
               AND (SELECT count(*) FROM pg_trigger WHERE tgisinternal) = 28
               AND (SELECT count(*) FROM pg_rewrite rw JOIN pg_class c ON c.oid = rw.ev_class JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public') = 0,
               (SELECT count(*) FILTER (WHERE tgisinternal) || ' internal, ' || count(*) FILTER (WHERE NOT tgisinternal) || ' application' FROM pg_trigger)
        UNION ALL SELECT 'V16', 'no extensions beyond plpgsql, and no custom enum, domain or range types',
               (SELECT array_agg(extname::text ORDER BY extname) FROM pg_extension) = ARRAY['plpgsql']
               AND NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype IN ('e','d','r','m')),
               NULL
        UNION ALL SELECT 'V17', 'all tables, sequences and indexes are owned by omarsh',
               NOT EXISTS (SELECT 1 FROM tbls WHERE relkind IN ('r','S','i') AND pg_get_userbyid(relowner) <> 'omarsh'),
               NULL
        UNION ALL SELECT 'V18', 'no table or sequence grants exist (relacl is NULL), and afiyah_app holds no table or sequence privilege',
               NOT EXISTS (SELECT 1 FROM tbls WHERE relacl IS NOT NULL)
               AND NOT EXISTS (SELECT 1 FROM tbls t CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
                                WHERE t.relkind = 'r' AND has_table_privilege('afiyah_app', t.oid, p))
               AND NOT EXISTS (SELECT 1 FROM tbls t CROSS JOIN unnest(ARRAY['SELECT','USAGE','UPDATE']) p
                                WHERE t.relkind = 'S' AND has_sequence_privilege('afiyah_app', t.oid, p)),
               NULL
        UNION ALL SELECT 'V19', 'schema public ACL unchanged from the baseline (PUBLIC USAGE still present: revoked later in 1B-2e)',
               (SELECT nspacl::text FROM pg_namespace WHERE nspname = 'public') = '{pg_database_owner=UC/pg_database_owner,=U/pg_database_owner}',
               (SELECT nspacl::text FROM pg_namespace WHERE nspname = 'public')
        UNION ALL SELECT 'V20', 'database ACLs of afiyah_dev and afiyah_test unchanged (CONNECT only for afiyah_app)',
               (SELECT count(*) FROM pg_database WHERE datname IN ('afiyah_dev','afiyah_test') AND datacl::text = '{omarsh=CTc/omarsh,afiyah_app=c/omarsh}') = 2,
               (SELECT string_agg(datname || '=' || datacl::text, ' ' ORDER BY datname) FROM pg_database WHERE datname LIKE 'afiyah_%')
        UNION ALL SELECT 'V21', 'no default privileges configured',
               (SELECT count(*) FROM pg_default_acl) = 0,
               NULL
        UNION ALL SELECT 'V22', 'roles unchanged: only afiyah_app, omarsh, postgres (no afiyah_executor_owner yet), and no role memberships',
               (SELECT array_agg(rolname::text ORDER BY rolname) FROM pg_roles WHERE rolname !~ '^pg_') = ARRAY['afiyah_app','omarsh','postgres']
               AND (SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid WHERE r.rolname !~ '^pg_') = 0,
               (SELECT string_agg(rolname, ',' ORDER BY rolname) FROM pg_roles WHERE rolname !~ '^pg_')
        UNION ALL SELECT 'V23', 'afiyah_app attributes and role settings unchanged',
               EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afiyah_app' AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
                          AND NOT rolreplication AND NOT rolbypassrls AND rolconnlimit = 20)
               AND EXISTS (SELECT 1 FROM pg_db_role_setting s JOIN pg_roles r ON r.oid = s.setrole
                            WHERE r.rolname = 'afiyah_app' AND s.setdatabase = 0
                              AND s.setconfig @> ARRAY['lock_timeout=5s','idle_in_transaction_session_timeout=30s']),
               NULL
        UNION ALL SELECT 'V24', 'database-level time zone setting for afiyah_test is UTC (read from the catalog, independent of the session)',
               EXISTS (SELECT 1 FROM pg_db_role_setting s JOIN pg_database d ON d.oid = s.setdatabase
                        WHERE d.datname = 'afiyah_test' AND s.setrole = 0 AND s.setconfig @> ARRAY['TimeZone=UTC']),
               'session TimeZone=' || current_setting('TimeZone')
        UNION ALL SELECT 'V25', 'tables are permanent, not partitioned, and have row-level security off',
               NOT EXISTS (SELECT 1 FROM tbls WHERE relkind = 'r' AND (relpersistence <> 'p' OR relrowsecurity OR relforcerowsecurity OR relispartition)),
               NULL
    )
    SELECT * FROM checks ORDER BY id
    LOOP
        v_total := v_total + 1;
        IF chk.ok IS TRUE THEN
            RAISE NOTICE 'PASS  %  %', chk.id, chk.descr || CASE WHEN chk.detail IS NOT NULL THEN '  [' || chk.detail || ']' ELSE '' END;
        ELSE
            v_fail := v_fail + 1;
            RAISE NOTICE 'FAIL  %  %', chk.id, chk.descr || CASE WHEN chk.detail IS NOT NULL THEN '  [' || chk.detail || ']' ELSE '' END;
        END IF;
    END LOOP;

    RAISE NOTICE 'VERIFY 2a: %/% checks passed, % failed', v_total - v_fail, v_total, v_fail;
    IF v_total <> 25 THEN
        RAISE EXCEPTION 'verify_2a: expected exactly 25 checks (V01-V25), ran %', v_total;
    END IF;
    IF v_fail > 0 THEN
        RAISE EXCEPTION '% verification check(s) failed', v_fail;
    END IF;
END $v$;

ROLLBACK;
