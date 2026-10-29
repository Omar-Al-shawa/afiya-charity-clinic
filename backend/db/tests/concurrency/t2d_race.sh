#!/usr/bin/env bash
# اختبار السباق للمرحلة 1B-2d (afiyah_test فقط). التشغيل: bash backend/db/tests/concurrency/t2d_race.sh
# السيناريو R1: A تنشئ طلب حذف اختصاص (قفل حصري) وتمسك المعاملة؛ B تضيف طبيباً إلى الاختصاص نفسه فتنتظر ثم تُرفض AF121 بعد التزام A.
# السيناريو R2: A تدرج حجزاً قيد التنفيذ (قفل اختصاص مشترك وقفل الطبيب)؛ B تنشئ طلب تعديل على ذلك الطبيب فتنتظر ثم تنجح بعد التزام A.
# يتطلب 005_pending_changes.sql وجداول فارغة وتسلسلات غير مستعملة. بيانات تجريبية ملتزَمة بمعرّفات خاصة:
#   مستخدمون 9801 و 9811 و 9812، اختصاصان 9701 (بلا أطباء) و 9702، مريض 9701، طبيب 9701 (في 9702)، حجز 9711، طلبات 9751 و 9752، وطبيب B المرفوض 9702.
# التنسيق الحتمي كما في t2c_race.sh: A تكتب ملف READY بعد أخذ القفل وتنتظر ملف GO (حلقة محدودة)؛ B لا تبدأ إلا بعد READY؛ ويتحقق السكربت من أن B معلّقة فعلاً (قفل استشاري غير ممنوح) قبل GO.
# التنظيف عند كل خروج بمعرّفات هذا الاختبار حصراً ثم التحقق من الفراغ وعدم استهلاك التسلسلات؛ وإلا الرمز 3. رموز الخروج: 0 نجاح | 1 فشل سيناريو | 2 بنية | 3 شرط مسبق أو تنظيف.
if [ -z "${BASH_VERSION:-}" ]; then echo "run with bash" >&2; exit 3; fi
set -u
set -f
umask 077

DBNAME="afiyah_test"
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P) || exit 3
case "$SCRIPT_DIR" in */backend/db/tests/concurrency) ;; *) echo "unexpected location: $SCRIPT_DIR" >&2; exit 3 ;; esac
GUARD="${SCRIPT_DIR%/tests/concurrency}/_guard.sql"
[ -f "$GUARD" ] || { echo "guard not found" >&2; exit 3; }
case "$GUARD" in *[!A-Za-z0-9._/-]*) echo "unsupported path characters" >&2; exit 3 ;; esac
PSQL=$(command -v psql) || { echo "psql not found" >&2; exit 3; }
unset PGSERVICE PGSERVICEFILE PGOPTIONS PGAPPNAME PGDATABASE
export PGDATABASE="$DBNAME" PGCONNECT_TIMEOUT=10
export PGOPTIONS="-c lock_timeout=20000 -c statement_timeout=40000 -c idle_in_transaction_session_timeout=60000"
RUN="$$-$(date +%s)"
WORK=$(mktemp -d "${TMPDIR:-/tmp}/t2d_race.XXXXXX") || exit 2
case "$WORK" in *[!A-Za-z0-9._/-]*) echo "unsupported temp path" >&2; rm -rf "$WORK"; exit 2 ;; esac

CHILDREN=""
FIXTURES=0
N_PASS=0
N_FAIL=0
CLEAN_FAILED=0

q() { "$PSQL" -X -q -At -v ON_ERROR_STOP=1 -c "$1"; }

proc_alive() {
    local st
    kill -0 "$1" 2>/dev/null || return 1
    st=$(ps -o stat= -p "$1" 2>/dev/null | cut -c1)
    [ -n "$st" ] && [ "$st" != "Z" ]
}
wait_exit() { # pid secs
    local end=$((SECONDS + $2))
    while proc_alive "$1"; do
        [ "$SECONDS" -ge "$end" ] && return 1
        sleep 0.05
    done
    return 0
}
kill_children() {
    local p pp
    for p in $CHILDREN; do
        if proc_alive "$p"; then
            pp=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')
            if [ "$pp" = "$$" ]; then
                kill -TERM "$p" 2>/dev/null
                wait_exit "$p" 3 || { kill -KILL "$p" 2>/dev/null; wait_exit "$p" 3; }
            fi
        fi
        proc_alive "$p" || wait "$p" 2>/dev/null
    done
    CHILDREN=""
}

# حذف مقيَّد بمعرّفات هذا الاختبار فقط، ثم التحقق من الفراغ وعدم استهلاك التسلسلات.
cleanup_rows() {
    "$PSQL" -X -q -v ON_ERROR_STOP=1 -1 <<'SQL' || return 1
DELETE FROM public.appointments WHERE appointment_id = 9711;
DELETE FROM public.pending_changes WHERE change_id IN (9751, 9752);
DELETE FROM public.doctors WHERE doctor_id IN (9701, 9702) AND user_id IN (9811, 9812);
DELETE FROM public.patients WHERE patient_id = 9701 AND user_id = 9801;
DELETE FROM public.specialties WHERE specialty_id IN (9701, 9702) AND specialty_name IN ('t2d-s1', 't2d-s2');
DELETE FROM public.users WHERE user_id IN (9801, 9811, 9812) AND email LIKE '%@t2d.local';
SQL
}
rows_left() {
    q "SELECT (SELECT count(*) FROM public.users) + (SELECT count(*) FROM public.patients) + (SELECT count(*) FROM public.doctors) + (SELECT count(*) FROM public.specialties) + (SELECT count(*) FROM public.appointments) + (SELECT count(*) FROM public.pending_changes)"
}
seq_used() {
    q "SELECT count(*) FROM pg_sequences WHERE schemaname = 'public' AND last_value IS NOT NULL"
}

on_exit() {
    local rc=$?
    trap '' INT TERM HUP
    kill_children
    if [ "$FIXTURES" -eq 1 ]; then
        if cleanup_rows; then
            if [ "$(rows_left 2>/dev/null)" != "0" ] || [ "$(seq_used 2>/dev/null)" != "0" ]; then
                echo "INTEGRITY PROBLEM: tables not empty or sequences used after cleanup" >&2
                CLEAN_FAILED=1
            else
                echo "cleanup ok: test rows removed, tables empty, sequences unused"
            fi
        else
            echo "INTEGRITY PROBLEM: cleanup failed; remove rows with ids 9701-9702, 9711, 9751-9752, 9801, 9811-9812 manually" >&2
            CLEAN_FAILED=1
        fi
    fi
    rm -rf "$WORK"
    [ "$CLEAN_FAILED" -eq 1 ] && rc=3
    exit "$rc"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

# ---- شروط مسبقة
"$PSQL" -X -q -v ON_ERROR_STOP=1 -v expect_db="$DBNAME" -f "$GUARD" > /dev/null || { echo "guard failed" >&2; exit 3; }
[ "$(rows_left)" = "0" ] || { echo "precondition failed: tables are not empty" >&2; exit 3; }
[ "$(seq_used)" = "0" ] || { echo "precondition failed: identity sequences already used" >&2; exit 3; }
[ "$(q "SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace AND t.tgname IN ('appointments_booking_trg', 'pending_changes_guard_trg', 'doctors_insert_guard_trg')")" = "3" ] \
    || { echo "precondition failed: Stage 1B-2c/2d triggers are not applied" >&2; exit 3; }

# ---- بيانات تجريبية ملتزَمة
FIXTURES=1
"$PSQL" -X -q -v ON_ERROR_STOP=1 -1 <<'SQL' || { echo "fixture creation failed" >&2; exit 2; }
INSERT INTO public.users (user_id, email, password_hash, role, is_active) OVERRIDING SYSTEM VALUE VALUES
    (9801, 'p1@t2d.local', 'h', 'patient', true), (9811, 'd1@t2d.local', 'h', 'doctor', true), (9812, 'd2@t2d.local', 'h', 'doctor', true);
INSERT INTO public.specialties (specialty_id, specialty_name, appointment_duration) OVERRIDING SYSTEM VALUE VALUES (9701, 't2d-s1', 20), (9702, 't2d-s2', 20);
INSERT INTO public.patients (patient_id, user_id, first_name, last_name, phone, birth_date, gender) OVERRIDING SYSTEM VALUE VALUES
    (9701, 9801, 'P', 'One', '0911111111', '1990-01-01', 'male');
INSERT INTO public.doctors (doctor_id, user_id, specialty_id, first_name, last_name, birth_date, phone) OVERRIDING SYSTEM VALUE VALUES
    (9701, 9811, 9702, 'D', 'One', '1980-01-01', '0922222221');
SQL
DAY=$(q "SELECT to_char(public.clinic_local(clock_timestamp())::date + g, 'YYYY-MM-DD') FROM generate_series(2, 9) g WHERE extract(dow FROM public.clinic_local(clock_timestamp())::date + g) <> 5 ORDER BY g LIMIT 1")
case "$DAY" in [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;; *) echo "could not determine a booking day: '$DAY'" >&2; exit 2 ;; esac

# ---- سيناريو: A تأخذ القفل وتمسك المعاملة؛ B تحاول فتنتظر؛ ثم GO فتنتهي A؛ ويُفحَص ناتج B وحالة الجداول
scenario() { # id title a_sql a_end b_sql b_result(true AF121|false 00000) verify_query verify_expect
    local id="$1" title="$2" a_sql="$3" a_end="$4" b_sql="$5" b_res="$6" vq="$7" vexp="$8"
    local ready="$WORK/$id.ready" go="$WORK/$id.go" ascr="$WORK/$id.a.sql" bscr="$WORK/$id.b.sql"
    local bapp="t2d_B_${RUN}_$id" a_pid b_pid i got waited=0 res ok=1 detail=""
    rm -f "$ready" "$go"
    {
        printf '%s\n' '\set ON_ERROR_STOP on' "\\i '$GUARD'" 'BEGIN;' "$a_sql;" "\\! touch '$ready'"
        printf '%s\n' "\\! i=0; while [ ! -f '$go' ] && [ \"\$i\" -lt 300 ]; do sleep 0.1; i=\$((i+1)); done" "$a_end;"
    } > "$ascr"
    {
        printf '%s\n' '\set ON_ERROR_STOP on' "\\i '$GUARD'" '\set ON_ERROR_STOP off' "$b_sql;" '\echo T2D_B_RESULT :ERROR :SQLSTATE'
    } > "$bscr"

    PGAPPNAME="t2d_A_${RUN}_$id" "$PSQL" -X -q -v expect_db="$DBNAME" -f "$ascr" > "$WORK/$id.a.out" 2> "$WORK/$id.a.err" < /dev/null &
    a_pid=$!; CHILDREN="$CHILDREN $a_pid"
    i=0; while [ ! -f "$ready" ] && [ "$i" -lt 150 ]; do
        proc_alive "$a_pid" || break
        sleep 0.1; i=$((i + 1))
    done
    if [ ! -f "$ready" ]; then
        echo "FAIL  $id  $title (session A never acquired its lock: $(tail -n 2 "$WORK/$id.a.err" | tr '\n' ' '))"; N_FAIL=$((N_FAIL + 1)); touch "$go"; wait_exit "$a_pid" 5; return
    fi
    PGAPPNAME="$bapp" "$PSQL" -X -q -v expect_db="$DBNAME" -f "$bscr" > "$WORK/$id.b.out" 2> "$WORK/$id.b.err" < /dev/null &
    b_pid=$!; CHILDREN="$CHILDREN $b_pid"
    i=0; while [ "$i" -lt 100 ]; do
        waited=$(q "SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid WHERE l.locktype = 'advisory' AND NOT l.granted AND a.application_name = '$bapp'")
        [ "$waited" = "1" ] && break
        proc_alive "$b_pid" || break
        sleep 0.1; i=$((i + 1))
    done
    if [ "$waited" != "1" ]; then ok=0; detail="B was never observed waiting on an advisory lock before A finished"; fi
    touch "$go"
    wait_exit "$a_pid" 40 || { ok=0; detail="$detail; A did not finish"; }
    wait_exit "$b_pid" 40 || { ok=0; detail="$detail; B did not finish"; }
    res=$(grep '^T2D_B_RESULT ' "$WORK/$id.b.out" | head -n 1)
    if [ "$res" != "T2D_B_RESULT $b_res" ]; then ok=0; detail="$detail; B result '$res' (expected 'T2D_B_RESULT $b_res')"; fi
    got=$(q "$vq")
    if [ "$got" != "$vexp" ]; then ok=0; detail="$detail; state after: '$got' (expected '$vexp')"; fi
    if [ "$ok" -eq 1 ]; then echo "PASS  $id  $title"; N_PASS=$((N_PASS + 1)); else echo "FAIL  $id  $title ($detail)"; N_FAIL=$((N_FAIL + 1)); fi
    CHILDREN=""
    q "DELETE FROM public.appointments WHERE appointment_id = 9711; DELETE FROM public.pending_changes WHERE change_id IN (9751, 9752); DELETE FROM public.doctors WHERE doctor_id = 9702 AND user_id = 9812" > /dev/null || { echo "per-scenario cleanup failed" >&2; exit 3; }
}

scenario R1 "specialty deletion request (exclusive lock) vs adding a doctor: B waits, then AF121 after A commits" \
    "INSERT INTO public.pending_changes (change_id, doctor_id, specialty_id, change_type, new_data) OVERRIDING SYSTEM VALUE VALUES (9751, NULL, 9701, 'delete', NULL)" COMMIT \
    "INSERT INTO public.doctors (doctor_id, user_id, specialty_id, first_name, last_name, birth_date, phone) OVERRIDING SYSTEM VALUE VALUES (9702, 9812, 9701, 'D', 'Two', '1980-01-02', '0922222222')" "true AF121" \
    "SELECT (SELECT coalesce(string_agg(change_id::text, ',' ORDER BY change_id), '') FROM public.pending_changes WHERE change_id IN (9751, 9752)) || '/' || (SELECT count(*) FROM public.doctors WHERE doctor_id = 9702)" "9751/0"
scenario R2 "in-flight booking vs a pending change on the same doctor: B waits for the doctor lock, then succeeds after A commits" \
    "INSERT INTO public.appointments (appointment_id, patient_id, doctor_id, appointment_date, appointment_time, status) OVERRIDING SYSTEM VALUE VALUES (9711, 9701, 9701, '$DAY', '10:00', 'booked')" COMMIT \
    "INSERT INTO public.pending_changes (change_id, doctor_id, specialty_id, change_type, new_data) OVERRIDING SYSTEM VALUE VALUES (9752, 9701, NULL, 'update', '{\"phone\":\"0944444441\"}')" "false 00000" \
    "SELECT (SELECT coalesce(string_agg(change_id::text || ':' || status || ':' || (execute_at = public.pending_execute_at(created_at))::text, ',' ORDER BY change_id), '') FROM public.pending_changes WHERE change_id IN (9751, 9752)) || '/' || (SELECT count(*) FROM public.appointments WHERE appointment_id = 9711)" "9752:pending:true/1"

echo "RESULT: $N_PASS passed, $N_FAIL failed"
[ "$N_FAIL" -eq 0 ] || exit 1
exit 0
