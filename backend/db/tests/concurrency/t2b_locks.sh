#!/usr/bin/env bash
# اختبارات المرحلة 1B-2b (الجزء 3): أقفال الاستشارة بجلستين للدوال lock_specialty / lock_doctor / lock_patient (afiyah_test فقط).
# التشغيل:  bash backend/db/tests/concurrency/t2b_locks.sh        (بلا وسائط؛ لا يُقبل أي اسم قاعدة بيانات من الخارج)
#
# المتطلبات: تطبيق 002_functions.sql أولاً (يفحص P02 وجود الدوال الثلاث ويُنهي التشغيل بالرمز 3 إن غابت). لا يحتاج الجداول ولا 003_indexes.sql،
# ولا يلمس أي جدول، ولا يعتمد على مشغّلات 1B-2c، فيبقى صالحاً بعد تثبيتها. لا يُنفّذ أي DDL أو DML ولا يستهلك قيم الهوية (يتحقق Z03).
#
# رموز الخروج: 0 كل الحالات نجحت | 1 فشلت حالة سلوكية (FAIL) | 2 خطأ بنية تحتية أو دليل ناقص/مشوّه أو حالة لم تكتمل (ERROR) أو انتهاء الحد العام
#              3 فشل شرط مسبق (قاعدة/مستخدم/إصدار/دوال/بقايا جلسات أو أقفال) | 129/130/143 مقاطعة. عند اجتماع FAIL و ERROR يُعاد 2 (النتيجة غير حاسمة).
#
# التصميم (لا نوم كدليل؛ كل انتظار استطلاع بموعد نهائي):
#  - الجلسة A: psql في الخلفية يقرأ أوامره من FIFO تملك هذه السكربت طرف كتابته (الواصف 3 يُفتح <> فلا يُحجب). تأخذ A القفل داخل BEGIN وتبقى مفتوحة.
#    كل أمر يُطلَق يحمل 3>&- فلا يرث أي ابن الواصف 3؛ وإغلاقه يعطي A نهاية الملف. مصيدة التنظيف لا تكتب في FIFO أبداً (تغلق الواصف فقط).
#  - العلامات (markers): تُنتَج من psql نفسه عبر \o و \qecho بسطري BEGIN وEND يحملان رقماً عشوائياً فريداً (nonce) لكل علامة، ثم يُغلق \o،
#    ثم يُكتب ملف تأكيد ثانٍ (.closed) بعد إغلاق الأول (فوجوده يثبت أن الأول أُغلق). لا تقبل Bash العلامة إلا باكتمال الملفين ومطابقة الـ nonce
#    وكون السطر الأول BEGIN والأخير END. شرط إنتاجها \if على متغير يُحذف (\unset) ثم يُعاد ضبطه باستعلام ناجح؛ فإن فشل الاستعلام أو لم يُحلّ المتغير
#    يُعامل \if التعبير غير الصالح كـ false (موثّق في دليل psql 18) فلا تُنتَج علامة (فشل مغلق). وA تعمل بـ ON_ERROR_STOP=1 فتخرج عند أول خطأ.
#  - الجلسة B: قالب ملف ثابت (heredoc محاط بعلامات اقتباس) تُستبدل فيه مسارات محقَّقة بـ sed؛ وسائر القيم عبر -v. تطبع علامات T2B وتُقرأ بعد انتهائها.
#  - المراقب: جلسات psql قصيرة للقراءة فقط تستعلم pg_locks و pg_stat_activity؛ لكل أمر مُطلَق حد زمني، ولكل انتظار موعد نهائي (SECONDS).
#  - الدليل على التنازع: صف قفل ممنوح لـ A بالصنف والمعرّف والنمط و objsubid=2 قبل محاولة B، ثم SQLSTATE=55P03 من B، ثم بقاء صف A ممنوحاً،
#    ثم نجاح الاستدعاء نفسه بعد تحرير A. وفي حالات R يُشترط رؤية صف B غير الممنوح (granted=false) قبل أن تحرّر A، وحاجز بعد COMMIT/ROLLBACK قبل فحص التحرير.
#    زمن التنفيذ تشخيص ثانوي فقط.
#  - ربط الجلسات: لكل جلسة application_name فريد لهذا التشغيل، ويُتحقق أن pid الذي تبلّغ به الجلسة نفسها هو المرصود في pg_stat_activity باسمها وبالعدد 1.
#  - SQLSTATE: تُقرأ فور التعليمة المختبَرة بأمر \echo واحد: ERROR (true/false) و SQLSTATE (حالة آخر استعلام) ثم LAST_ERROR_SQLSTATE و LAST_ERROR_MESSAGE.
#    LAST_ERROR_* تصف آخر خطأ في الجلسة كلها ولا تُصفَّر بعد استعلام ناجح، فلا تُستعمل دليلَ نجاح أبداً؛ تُقبل فقط تأكيداً لخطأ حالي (يجب أن تساوي SQLSTATE).
#    أي قيمة غائبة أو غير محلولة (مثل ":ERROR") أو مشوّهة أو متناقضة تُسجَّل ERROR ولا تُحتسب نجاحاً.
#  - اكتمال الحالة: كل حالة تعدّ تأكيداتها وتستدعي case_complete N في نهاية مسارها السليم؛ ولا تنجح حالة لم تصل إليها أو اختل عدّ تأكيداتها.
#  - الحماية: PGOPTIONS يضبط default_transaction_read_only=on ومهلات الخادم الاحتياطية (lock 10 ث، statement 20 ث، idle_in_transaction 30 ث) لكل جلسة؛
#    ويتجاوزها SET لكل اختبار (700 م ث للتنازع، 8 ث لانتظار التحرير). لا pg_terminate_backend ولا pkill: تُنهى فقط العمليات المحلية التي أنشأها هذا السكربت.
#  - تحقّقت تجربة معزولة (بلا قاعدة بيانات) من: فتح FIFO بـ <> لا يحجب على macOS، وقراءة الابن سطراً سطراً، وأن ابناً يرث الواصف 3 يمنع EOF،
#    وأن kill -0 ينجح على عملية zombie بينما ps stat يعرضها Z (لذلك proc_alive تجمع الفحصين).
#  - غير مُجرَّب هنا: سلوك psql نفسه مع FIFO، وقبول الأقفال الاستشارية داخل معاملة للقراءة فقط، وصيغ عرض الإعدادات ('10s' و '700ms').

if [ -z "${BASH_VERSION:-}" ]; then
    echo "t2b_locks.sh: run it with bash: bash backend/db/tests/concurrency/t2b_locks.sh" >&2
    exit 3
fi
set -u
set -f
umask 077

DBNAME="afiyah_test"
K1=910001
K2=910002
T_CONFLICT_MS=700
T_WAIT_MS=8000
LT_CONFLICT="700ms"
LT_WAIT="8s"
SRV_LOCK_MS=10000
SRV_STMT_MS=20000
SRV_IDLE_MS=30000
GLOBAL_LIMIT_S=300
NL='
'

RUN=""
SCRIPT_DIR=""
DB_DIR=""
WORK=""
CHILD_PIDS=""
ALL_PIDS="0"
INT_RC=""
GLOBAL_END=0
OBS_N=0
OBS_VAL=""
OBS_ERR=""
OBS_APP=""
APP_PREFIX=""
PSQL_BIN=""
GUARD=""
SEQ_SNAP0=""
RB_TIMEOUT=0
SPAWN_PID=""
WAIT_PID=""
CALL_SQL=""
MARK_N=0
NONCE=""
Z01_BAD=""
CASE_ID=""
CASE_TITLE=""
CASE_FAILS=""
CASE_ERRS=""
CASE_BG=""
CASE_DONE=0
CASE_EXPECT=-1
CASE_ASSERTS=0
N_PASS=0
N_FAIL=0
N_ERR=0
A_ACTIVE=0; A_TAG=""; A_APP=""; A_FIFO=""; A_OUT=""; A_ERR=""; A_PID=""; A_OSPID=""
BT_TAG=""; BT_MODE=""; BT_TMO=""; BT_KCLS=0; BT_KID=0; BT_KMODE="None"; BT_APID=0; BT_ACLS=0; BT_AID=0; BT_AMODE="None"
BT_STMT=""; BT_APP=""; BT_PIDFILE=""; BT_OUT=""; BT_ERR=""; BT_TPL=""; BT_SQL=""; BT_NONCE=""; BT_OSPID=""
B_PID=""; B_APPV=""; B_NAPP=""; B_DBN=""; B_ERRV=""; B_STATE=""; B_LSTATE=""; B_MSG=""; B_MS=""; B_LT=""
B_EV1=""; B_EV2=""; B_EV3=""; B_EV4=""; B_EV5=""; B_EV6=""
Q_DB="(SELECT d.oid FROM pg_database d WHERE d.datname = current_database())"

# ---------------------------------------------------------------- إنهاء وتنظيف
die_pre()   { printf 'PRECONDITION FAILED: %s\n' "$1" >&2; exit 3; }
die_infra() { printf 'INFRASTRUCTURE ERROR: %s\n' "$1" >&2; exit 2; }

is_num() { case "${1:-}" in ''|*[!0-9]*) return 1 ;; esac; return 0; }
is_sqlstate() { printf '%s' "${1:-}" | grep -Eq '^[0-9A-Z]{5}$'; }

track_child() { CHILD_PIDS="$CHILD_PIDS $1"; }
untrack_child() {
    local q out=""
    for q in $CHILD_PIDS; do
        [ "$q" = "$1" ] || out="$out $q"
    done
    CHILD_PIDS="$out"
}
is_tracked() {
    local q
    for q in $CHILD_PIDS; do
        [ "$q" = "$1" ] && return 0
    done
    return 1
}

# حيّة فعلاً: kill -0 وحده ينجح على zombie، فنستبعد الحالة Z عبر ps (تحقّقت التجربة من ذلك).
proc_alive() {
    local st
    kill -0 "$1" 2>/dev/null || return 1
    st=$(ps -o stat= -p "$1" 2>/dev/null | cut -c1)
    [ -n "$st" ] || return 1
    [ "$st" != "Z" ]
}

# ينتظر خروج عملية بموعد نهائي بالثواني؛ يعيد 0 إن خرجت و1 إن بقيت حية.
wait_exit() {
    local p="$1" end=$((SECONDS + $2))
    while proc_alive "$p"; do
        [ "$SECONDS" -ge "$end" ] && return 1
        sleep 0.05
    done
    return 0
}

# ابن مباشر لهذا السكربت ومسجَّل لديه واسم أمره psql أو env أو bash (الأخير لفترة ما قبل exec)؛ لا نرسل إشارة لأي عملية أخرى أبداً.
owned_child() {
    local pp cm
    is_tracked "$1" || return 1
    pp=$(ps -o ppid= -p "$1" 2>/dev/null | tr -d ' ')
    [ "$pp" = "$$" ] || return 1
    cm=$(ps -o comm= -p "$1" 2>/dev/null)
    cm="${cm##*/}"
    case "$cm" in psql|env|bash) return 0 ;; esac
    return 1
}

# TERM ثم KILL بمهلة محدودة لعملية ابنة واحدة يملكها هذا السكربت؛ لا انتظار غير محدود.
kill_owned() {
    local p="$1"
    proc_alive "$p" || return 0
    if ! owned_child "$p"; then
        printf 'refusing to signal pid %s: it is not a tracked psql child of this script\n' "$p" >&2
        return 1
    fi
    kill -TERM "$p" 2>/dev/null
    wait_exit "$p" 3 && return 0
    kill -KILL "$p" 2>/dev/null
    wait_exit "$p" 3
}

reap_children() {
    local p alive end
    for p in $CHILD_PIDS; do
        if proc_alive "$p" && owned_child "$p"; then kill -TERM "$p" 2>/dev/null; fi
    done
    end=$((SECONDS + 4))
    while [ "$SECONDS" -lt "$end" ]; do
        alive=0
        for p in $CHILD_PIDS; do proc_alive "$p" && alive=1; done
        [ "$alive" -eq 0 ] && break
        sleep 0.05
    done
    for p in $CHILD_PIDS; do
        if proc_alive "$p" && owned_child "$p"; then kill -KILL "$p" 2>/dev/null; fi
    done
    end=$((SECONDS + 3))
    while [ "$SECONDS" -lt "$end" ]; do
        alive=0
        for p in $CHILD_PIDS; do proc_alive "$p" && alive=1; done
        [ "$alive" -eq 0 ] && break
        sleep 0.05
    done
    for p in $CHILD_PIDS; do
        if proc_alive "$p"; then
            printf 'warning: child pid %s could not be terminated\n' "$p" >&2
        else
            wait "$p" 2>/dev/null
        fi
    done
    CHILD_PIDS=""
}

cleanup() {
    local rc=$?
    trap '' INT TERM HUP
    if [ -n "$INT_RC" ]; then rc="$INT_RC"; fi
    exec 3>&-
    reap_children
    if [ -n "$WORK" ] && [ "${T2B_KEEP_WORK:-0}" != "1" ]; then
        case "$WORK" in
            /*/t2b_locks.*) [ -d "$WORK" ] && rm -rf "$WORK" ;;
        esac
    elif [ -n "$WORK" ]; then
        printf 'work directory kept: %s\n' "$WORK" >&2
    fi
    exit "$rc"
}

check_deadline() {
    if [ "$GLOBAL_END" -gt 0 ] && [ "$SECONDS" -gt "$GLOBAL_END" ]; then
        die_infra "global time limit (${GLOBAL_LIMIT_S}s) exceeded"
    fi
}

# ---------------------------------------------------------------- تشغيل أوامر محدودة الزمن
# الابن المباشر هو psql نفسه (env يستبدل نفسه به)، بلا stdin وبلا الواصف 3؛ pid مسجَّل للتنظيف.
spawn_bg() {
    local out="$1" err="$2"
    shift 2
    "$@" > "$out" 2> "$err" < /dev/null 3>&- &
    SPAWN_PID=$!
    track_child "$SPAWN_PID"
}

# ينتظر انتهاء الأمر بموعد نهائي (ثوانٍ)؛ عند التجاوز يُنهى الأمر (ابن مملوك فقط) ويُضبط RB_TIMEOUT=1. لا يُستعمل داخل subshell أبداً.
run_bounded() {
    local secs="$1" out="$2" err="$3" p
    shift 3
    RB_TIMEOUT=0
    spawn_bg "$out" "$err" "$@"
    p="$SPAWN_PID"
    if ! wait_exit "$p" "$secs"; then
        RB_TIMEOUT=1
        kill_owned "$p"
    fi
    proc_alive "$p" || wait "$p" 2>/dev/null
    untrack_child "$p"
    check_deadline
}

# ---------------------------------------------------------------- العلامات (BEGIN/END + nonce + ملف إغلاق)
new_nonce() { MARK_N=$((MARK_N + 1)); NONCE="N${RUN}-${MARK_N}"; }

# مكتملة: الملف والملف .closed كلاهما أوله BEGIN وآخره END بالـ nonce نفسه (وجود .closed يثبت أن \o الأول أُغلق قبله).
marker_ready() { # file nonce
    local f="$1" n="$2"
    [ -f "$f" ] && [ -f "$f.closed" ] || return 1
    [ "$(head -n 1 "$f" 2>/dev/null)" = "T2B-MARK-BEGIN $n" ] || return 1
    [ "$(tail -n 1 "$f" 2>/dev/null)" = "T2B-MARK-END $n" ] || return 1
    [ "$(head -n 1 "$f.closed" 2>/dev/null)" = "T2B-MARK-BEGIN $n" ] || return 1
    [ "$(tail -n 1 "$f.closed" 2>/dev/null)" = "T2B-MARK-END $n" ] || return 1
    return 0
}
marker_payload() { sed -n "s/^T2B-$2 //p" "$1" 2>/dev/null | head -n 1; }

# 0 اكتملت | 1 انتهى الموعد | 2 خرجت العملية قبل اكتمالها
wait_marker() { # file nonce ospid secs
    local end=$((SECONDS + $4))
    while :; do
        marker_ready "$1" "$2" && return 0
        if ! proc_alive "$3"; then
            marker_ready "$1" "$2" && return 0
            return 2
        fi
        [ "$SECONDS" -ge "$end" ] && return 1
        check_deadline
        sleep 0.05
    done
}

# ---------------------------------------------------------------- بناة استعلامات pg_locks / pg_stat_activity (قراءة فقط)
sql_lockrow() { # pid cls id mode granted(true|false)
    printf "(SELECT count(*) FROM pg_locks l WHERE l.locktype = 'advisory' AND l.database = %s AND l.pid = %s AND l.classid::bigint = %s AND l.objid::bigint = %s AND l.objsubid = 2 AND l.mode = '%s' AND l.granted = %s)" "$Q_DB" "$1" "$2" "$3" "$4" "$5"
}
sql_keyrows() { # cls id granted(true|false): كل صفوف المفتاح لدى أي جلسة
    printf "(SELECT count(*) FROM pg_locks l WHERE l.locktype = 'advisory' AND l.database = %s AND l.classid::bigint = %s AND l.objid::bigint = %s AND l.objsubid = 2 AND l.granted = %s)" "$Q_DB" "$1" "$2" "$3"
}
sql_adv_total() { # pid: كل الأقفال الاستشارية لجلسة
    printf "(SELECT count(*) FROM pg_locks l WHERE l.locktype = 'advisory' AND l.pid = %s)" "$1"
}
sql_ident() { # pid app
    printf "((SELECT count(*) FROM pg_stat_activity s WHERE s.pid = %s AND s.application_name = '%s' AND s.datname = current_database() AND s.usename = current_user) || '/' || (SELECT count(*) FROM pg_stat_activity s WHERE s.application_name = '%s'))" "$1" "$2" "$2"
}
sql_pidcount() { # pid
    printf "(SELECT count(*) FROM pg_stat_activity s WHERE s.pid = %s)" "$1"
}
sql_testkey_rows() { # صفوف مفاتيح الاختبار (الأصناف 1-3 والمعرّفان 910001 و 910002) لدى أي جلسة
    printf "(SELECT count(*) FROM pg_locks l WHERE l.locktype = 'advisory' AND l.database = %s AND l.objsubid = 2 AND l.classid::bigint IN (1, 2, 3) AND l.objid::bigint IN (%s, %s))" "$Q_DB" "$K1" "$K2"
}

lock_call() { # cls id mode
    case "$1" in
        1) if [ "$3" = "ShareLock" ]; then CALL_SQL="SELECT public.lock_specialty($2, true)"; else CALL_SQL="SELECT public.lock_specialty($2, false)"; fi ;;
        2) CALL_SQL="SELECT public.lock_doctor($2)" ;;
        3) CALL_SQL="SELECT public.lock_patient($2)" ;;
        *) die_infra "internal: unknown lock class $1" ;;
    esac
}

# ---------------------------------------------------------------- المراقب
obs() { # $1 = تعبير SQL يعيد قيمة نصية واحدة. النتيجة في OBS_VAL. يعيد 0 عند النجاح و1 عند فشل أداة المراقبة.
    local expr="$1" n f cnt
    OBS_N=$((OBS_N + 1))
    n="$OBS_N"
    f="$WORK/obs_$n.sql"
    OBS_VAL=""
    OBS_ERR=""
    {
        printf '%s\n' '\set ON_ERROR_STOP on'
        printf '%s\n' "\\i '$GUARD'"
        printf '%s\n' "SELECT 'T2B OBS ' || (${expr})::text;"
    } > "$f"
    run_bounded 20 "$WORK/obs_$n.out" "$WORK/obs_$n.err" env "PGAPPNAME=$OBS_APP" "$PSQL_BIN" -X -q -A -t -v ON_ERROR_STOP=1 -v "expect_db=$DBNAME" -f "$f"
    if [ "$RB_TIMEOUT" -eq 1 ]; then
        OBS_ERR="observer psql exceeded its time limit"
        return 1
    fi
    cnt=$(grep -c '^T2B OBS ' "$WORK/obs_$n.out" 2>/dev/null)
    if [ "$cnt" != "1" ]; then
        OBS_ERR="observer produced no single result marker: $(tail -n 2 "$WORK/obs_$n.err" 2>/dev/null | tr '\n' ' ')"
        return 1
    fi
    OBS_VAL=$(sed -n 's/^T2B OBS //p' "$WORK/obs_$n.out")
    rm -f "$f" "$WORK/obs_$n.out" "$WORK/obs_$n.err"
    return 0
}

# استطلاع بموعد نهائي: 0 تحقق المطلوب | 1 انتهى الموعد دون تحقق (OBS_VAL آخر قيمة) | 2 فشلت أداة المراقبة.
poll_obs() { # secs expr want
    local end=$((SECONDS + $1))
    while :; do
        obs "$2" || return 2
        [ "$OBS_VAL" = "$3" ] && return 0
        [ "$SECONDS" -ge "$end" ] && return 1
        check_deadline
        sleep 0.05
    done
}

# ---------------------------------------------------------------- تسجيل الخطوات والتأكيدات (كل تأكيد يُعدّ)
vlog() { if [ "${T2B_VERBOSE:-0}" = "1" ]; then printf '        . %s\n' "$1"; fi; return 0; }
step_fail() { CASE_FAILS="${CASE_FAILS}      - $1${NL}"; }
step_err()  { CASE_ERRS="${CASE_ERRS}      - $1${NL}"; }
assert_pass() { CASE_ASSERTS=$((CASE_ASSERTS + 1)); vlog "$1"; return 0; }
assert_fail() { CASE_ASSERTS=$((CASE_ASSERTS + 1)); step_fail "$1"; return 1; }
case_complete() { CASE_DONE=1; CASE_EXPECT="$1"; }

expect_eq() { # desc got want
    if [ "$2" = "$3" ]; then assert_pass "$1"; return 0; fi
    assert_fail "$1: expected '$3', got '$2'"
}
obs_expect() { # desc expr want
    if ! obs "$2"; then step_err "$1: observer failed ($OBS_ERR)"; return 1; fi
    expect_eq "$1" "$OBS_VAL" "$3"
}
poll_expect() { # desc secs expr want
    local rc
    poll_obs "$2" "$3" "$4"
    rc=$?
    case "$rc" in
        0) assert_pass "$1"; return 0 ;;
        1) assert_fail "$1: expected '$4' within ${2}s, last observed '$OBS_VAL'"; return 1 ;;
        *) step_err "$1: observer failed ($OBS_ERR)"; return 1 ;;
    esac
}

describe_state() { # SQLSTATE غير المتوقعة بوصف مفيد
    case "$1" in
        57014) printf 'statement_timeout fired, not a lock conflict' ;;
        25P03) printf 'idle_in_transaction_session_timeout fired' ;;
        25006) printf 'read-only transaction violation' ;;
        42883) printf 'function does not exist (apply 002_functions.sql)' ;;
        42501) printf 'insufficient privilege' ;;
        57P01|57P02|57P03) printf 'server shut down or unavailable' ;;
        08*) printf 'connection exception' ;;
        55P03) printf 'lock_not_available (lock timeout)' ;;
        *) printf 'unrelated error' ;;
    esac
}

# ---------------------------------------------------------------- الجلسة A (FIFO)
a_send() { printf '%s\n' "$1" 2>/dev/null >&3; }

a_start() { # tag
    local tag="$1"
    exec 3>&-
    A_TAG="$tag"
    A_APP="${APP_PREFIX}:${tag}:A"
    A_FIFO="$WORK/A_${tag}.fifo"
    A_OUT="$WORK/A_${tag}.out"
    A_ERR="$WORK/A_${tag}.err"
    A_PID=""
    A_OSPID=""
    rm -f "$A_FIFO"
    mkfifo "$A_FIFO" || return 1
    env "PGAPPNAME=$A_APP" "$PSQL_BIN" -X -q -A -t -v ON_ERROR_STOP=1 -v "expect_db=$DBNAME" < "$A_FIFO" > "$A_OUT" 2> "$A_ERR" 3>&- &
    A_OSPID=$!
    track_child "$A_OSPID"
    A_ACTIVE=1
    exec 3<> "$A_FIFO" || return 1
    return 0
}

# يرسل إلى A كتلة العلامة (فشل مغلق): \unset ثم استعلام ناجح يضبط t2b_ok ثم \if؛ أمر \o يُغلق قبل ملف التأكيد.
a_send_marker() { # file nonce kind(pid|bar)
    local f="$1" n="$2" kind="$3"
    a_send '\unset t2b_ok' || return 1
    if [ "$kind" = "pid" ]; then
        a_send '\unset t2b_pid' || return 1
        a_send "SELECT pg_backend_pid() AS t2b_pid, 'on' AS t2b_ok \\gset" || return 1
    else
        a_send "SELECT 'on' AS t2b_ok \\gset" || return 1
    fi
    a_send '\if :t2b_ok' || return 1
    a_send "\\o '$f'" || return 1
    a_send "\\qecho T2B-MARK-BEGIN $n" || return 1
    if [ "$kind" = "pid" ]; then a_send '\qecho T2B-PID :t2b_pid' || return 1; fi
    a_send "\\qecho T2B-MARK-END $n" || return 1
    a_send '\o' || return 1
    a_send "\\o '$f.closed'" || return 1
    a_send "\\qecho T2B-MARK-BEGIN $n" || return 1
    a_send "\\qecho T2B-MARK-END $n" || return 1
    a_send '\o' || return 1
    a_send '\endif' || return 1
    return 0
}

# حاجز: يثبت أن A عالجت كل ما أُرسل قبله بنجاح (وأن معاملتها لم تُجهَض). 0 تم | 1 انتهى الموعد | 2 خرجت A | 3 تعذّر الإرسال
a_barrier() {
    local f rc
    new_nonce
    f="$WORK/A_${A_TAG}.bar${MARK_N}.mark"
    a_send_marker "$f" "$NONCE" bar || return 3
    wait_marker "$f" "$NONCE" "$A_OSPID" 10
    rc=$?
    return "$rc"
}

a_tail_err() { tail -n 3 "$A_ERR" 2>/dev/null | tr '\n' ' '; }

# تبدأ A وتأخذ القفل وتثبت الدليل في pg_locks. 4 تأكيدات: الهوية، صف القفل، عدد الأقفال، عدم وجود منافس.
hold_a() { # tag cls id mode
    local tag="$1" cls="$2" id="$3" mode="$4" rc pf pn
    lock_call "$cls" "$id" "$mode"
    if ! a_start "$tag"; then step_err "could not start session A"; return 1; fi
    new_nonce
    pn="$NONCE"
    pf="$WORK/A_${tag}.pid"
    if ! { a_send "\\i '$GUARD'" && a_send_marker "$pf" "$pn" pid && a_send "BEGIN;" && a_send "$CALL_SQL;"; }; then
        step_err "could not send commands to session A"
        return 1
    fi
    a_barrier
    rc=$?
    if [ "$rc" -ne 0 ]; then
        step_err "session A did not complete its lock statement (barrier rc=$rc): $(a_tail_err)"
        return 1
    fi
    wait_marker "$pf" "$pn" "$A_OSPID" 5
    rc=$?
    A_PID=$(marker_payload "$pf" PID)
    if [ "$rc" -ne 0 ] || ! is_num "$A_PID"; then
        step_err "session A did not report a valid backend pid marker (rc=$rc, pid='$A_PID')"
        return 1
    fi
    ALL_PIDS="$ALL_PIDS,$A_PID"
    if ! obs "$(sql_ident "$A_PID" "$A_APP")"; then step_err "A identity check: observer failed ($OBS_ERR)"; return 1; fi
    expect_eq "session A correlated (pid $A_PID matches application_name $A_APP, one session with that name)" "$OBS_VAL" "1/1" || return 1
    poll_expect "A holds the expected granted $mode row (class $cls, id $id, objsubid 2)" 10 "$(sql_lockrow "$A_PID" "$cls" "$id" "$mode" true)" 1 || return 1
    obs_expect "A holds exactly one advisory lock" "$(sql_adv_total "$A_PID")" 1 || return 1
    obs_expect "no other session touches the test keys while A holds its lock" "$(sql_testkey_rows)" 1 || return 1
    return 0
}

a_finish() {
    local rc
    if [ "$A_ACTIVE" -eq 1 ]; then
        a_send "ROLLBACK;"
        a_send '\q'
        exec 3>&-
        wait_exit "$A_OSPID" 6 || kill_owned "$A_OSPID"
        proc_alive "$A_OSPID" || wait "$A_OSPID" 2>/dev/null
        untrack_child "$A_OSPID"
        if [ -n "$A_PID" ]; then
            poll_obs 6 "$(sql_pidcount "$A_PID")" 0
            rc=$?
            [ "$rc" -eq 0 ] || Z01_BAD="${Z01_BAD} ${CASE_ID}:backend-${A_PID}-still-present(rc=${rc})"
        fi
        A_ACTIVE=0
    fi
    exec 3>&-
    if [ -n "$A_FIFO" ]; then rm -f "$A_FIFO"; fi
    A_PID=""
    A_OSPID=""
}

# ---------------------------------------------------------------- الجلسة B (قوالب ثابتة)
write_templates() {
    cat > "$WORK/b_head.tpl" <<'TPL'
\set ON_ERROR_STOP on
\i '@GUARD@'
\set ON_ERROR_STOP off
\unset t2b_ok
\unset bpid
SELECT pg_backend_pid() AS bpid, 'on' AS t2b_ok \gset
\if :t2b_ok
\o '@PIDFILE@'
\qecho T2B-MARK-BEGIN @NONCE@
\qecho T2B-PID :bpid
\qecho T2B-MARK-END @NONCE@
\o
\o '@PIDFILE@.closed'
\qecho T2B-MARK-BEGIN @NONCE@
\qecho T2B-MARK-END @NONCE@
\o
\endif
SELECT current_setting('application_name') AS app,
       (SELECT count(*) FROM pg_stat_activity a WHERE a.application_name = current_setting('application_name')) AS napp,
       current_database() AS dbn \gset
\echo T2B ID :tcase :bpid :app :napp :dbn
SET lock_timeout = :tmo;
SELECT current_setting('lock_timeout') AS lt \gset
\echo T2B LT :tcase :lt
TPL
    cat > "$WORK/b_attempt.body" <<'TPL'
SELECT clock_timestamp() AS t0 \gset
:stmt;
\echo T2B RES :tcase :ERROR :SQLSTATE :LAST_ERROR_SQLSTATE :LAST_ERROR_MESSAGE
SELECT (round(extract(epoch FROM clock_timestamp() - :'t0'::timestamptz) * 1000))::bigint AS ms \gset
\echo T2B MS :tcase :ms
\echo T2B END :tcase
TPL
    cat > "$WORK/b_txn.body" <<'TPL'
BEGIN;
SELECT clock_timestamp() AS t0 \gset
:stmt;
\echo T2B RES :tcase :ERROR :SQLSTATE :LAST_ERROR_SQLSTATE :LAST_ERROR_MESSAGE
SELECT (round(extract(epoch FROM clock_timestamp() - :'t0'::timestamptz) * 1000))::bigint AS ms \gset
\echo T2B MS :tcase :ms
SELECT
 (SELECT count(*) FROM pg_locks l WHERE l.locktype = 'advisory' AND l.database = (SELECT d.oid FROM pg_database d WHERE d.datname = current_database()) AND l.pid = pg_backend_pid() AND l.classid::bigint = :kcls AND l.objid::bigint = :kid AND l.objsubid = 2 AND l.mode = :'kmode' AND l.granted) AS n_self,
 (SELECT count(*) FROM pg_locks l WHERE l.locktype = 'advisory' AND l.database = (SELECT d.oid FROM pg_database d WHERE d.datname = current_database()) AND l.pid = :apid AND l.classid::bigint = :acls AND l.objid::bigint = :aid AND l.objsubid = 2 AND l.mode = :'amode' AND l.granted) AS n_a,
 (SELECT count(*) FROM pg_locks l WHERE l.locktype = 'advisory' AND l.database = (SELECT d.oid FROM pg_database d WHERE d.datname = current_database()) AND l.classid::bigint = :kcls AND l.objid::bigint = :kid AND l.objsubid = 2 AND l.granted) AS n_key,
 (SELECT count(*) FROM pg_locks l WHERE l.locktype = 'advisory' AND l.database = (SELECT d.oid FROM pg_database d WHERE d.datname = current_database()) AND l.classid::bigint = :kcls AND l.objid::bigint = :kid AND l.objsubid = 2 AND NOT l.granted) AS n_wait,
 (SELECT count(*) FROM pg_locks l WHERE l.locktype = 'advisory' AND l.database = (SELECT d.oid FROM pg_database d WHERE d.datname = current_database()) AND l.objsubid = 2 AND l.classid::bigint IN (1, 2, 3) AND l.objid::bigint IN (910001, 910002) AND l.pid NOT IN (pg_backend_pid(), :apid)) AS n_other,
 (SELECT count(*) FROM pg_locks l WHERE l.locktype = 'advisory' AND l.pid = pg_backend_pid()) AS n_own
\gset
\echo T2B EV :tcase :n_self :n_a :n_key :n_wait :n_other :n_own
COMMIT;
\echo T2B END :tcase
TPL
    cat > "$WORK/b_null.body" <<'TPL'
BEGIN;
SAVEPOINT s1;
:stmt;
\echo T2B RES :tcase :ERROR :SQLSTATE :LAST_ERROR_SQLSTATE :LAST_ERROR_MESSAGE
ROLLBACK TO SAVEPOINT s1;
SELECT count(*) AS n_own FROM pg_locks l WHERE l.locktype = 'advisory' AND l.pid = pg_backend_pid() \gset
\echo T2B EV :tcase :n_own
ROLLBACK;
\echo T2B END :tcase
TPL
    cat "$WORK/b_head.tpl" "$WORK/b_attempt.body" > "$WORK/b_attempt.tpl"
    cat "$WORK/b_head.tpl" "$WORK/b_txn.body" > "$WORK/b_txn.tpl"
    cat "$WORK/b_head.tpl" "$WORK/b_null.body" > "$WORK/b_null.tpl"
}

b_set() { # tag mode tmo kcls kid kmode apid acls aid amode
    BT_TAG="$1"; BT_MODE="$2"; BT_TMO="$3"; BT_KCLS="$4"; BT_KID="$5"; BT_KMODE="$6"
    BT_APID="$7"; BT_ACLS="$8"; BT_AID="$9"; BT_AMODE="${10}"
    case "$BT_TAG" in
        ''|*[!A-Za-z0-9-]*) step_err "internal: unsafe B tag '$BT_TAG'"; return 1 ;;
    esac
    BT_APP="${APP_PREFIX}:${BT_TAG}:B"
    BT_PIDFILE="$WORK/B_${BT_TAG}.pid"
    BT_OUT="$WORK/B_${BT_TAG}.out"
    BT_ERR="$WORK/B_${BT_TAG}.err"
    BT_SQL="$WORK/B_${BT_TAG}.sql"
    BT_OSPID=""
    case "$BT_MODE" in
        attempt) BT_TPL="$WORK/b_attempt.tpl" ;;
        txn)     BT_TPL="$WORK/b_txn.tpl" ;;
        null)    BT_TPL="$WORK/b_null.tpl" ;;
        *) step_err "internal: unknown B mode $BT_MODE"; return 1 ;;
    esac
    BT_STMT=""
    if [ "$BT_KCLS" != "0" ]; then
        lock_call "$BT_KCLS" "$BT_KID" "$BT_KMODE"
        BT_STMT="$CALL_SQL"
    fi
    new_nonce
    BT_NONCE="$NONCE"
    rm -f "$BT_PIDFILE" "$BT_PIDFILE.closed" "$BT_OUT" "$BT_ERR" "$BT_SQL"
    return 0
}

b_launch() { # fg|bg
    local mode="$1"
    sed -e "s|@GUARD@|$GUARD|g" -e "s|@PIDFILE@|$BT_PIDFILE|g" -e "s|@NONCE@|$BT_NONCE|g" "$BT_TPL" > "$BT_SQL"
    set -- env "PGAPPNAME=$BT_APP" "$PSQL_BIN" -X -q -A -t \
        -v "expect_db=$DBNAME" -v "tcase=$BT_TAG" -v "tmo=$BT_TMO" -v "stmt=$BT_STMT" \
        -v "kcls=$BT_KCLS" -v "kid=$BT_KID" -v "kmode=$BT_KMODE" \
        -v "apid=$BT_APID" -v "acls=$BT_ACLS" -v "aid=$BT_AID" -v "amode=$BT_AMODE" -f "$BT_SQL"
    if [ "$mode" = "fg" ]; then
        run_bounded 40 "$BT_OUT" "$BT_ERR" "$@"
        return 0
    fi
    spawn_bg "$BT_OUT" "$BT_ERR" "$@"
    BT_OSPID="$SPAWN_PID"
    CASE_BG="$CASE_BG $BT_OSPID"
    return 0
}

tline() { sed -n "s/^T2B $1 $BT_TAG //p" "$BT_OUT" 2>/dev/null | head -n 1; }
tcount() { grep -Ec "^T2B $1 $BT_TAG( |\$)" "$BT_OUT" 2>/dev/null; }

# يقرأ ناتج B بعد انتهائها ويتحقق بصرامة من العلامات والهوية والتناسق؛ يعيد 0 فقط إذا كل شيء سليم، وإلا يسجّل ERROR ويعيد 1.
b_collect() {
    local k cnt line e s l m
    if [ "$RB_TIMEOUT" -eq 1 ]; then step_err "B ($BT_TAG) exceeded its time limit and was terminated"; return 1; fi
    for k in ID LT RES END; do
        cnt=$(tcount "$k")
        if [ "$cnt" != "1" ]; then
            step_err "B ($BT_TAG): marker $k appeared '$cnt' times (expected exactly once): $(tail -n 3 "$BT_ERR" 2>/dev/null | tr '\n' ' ')"
            return 1
        fi
    done
    if ! marker_ready "$BT_PIDFILE" "$BT_NONCE"; then step_err "B ($BT_TAG): pid marker missing or incomplete"; return 1; fi
    line=$(tline ID)
    set -- $line
    if [ "$#" -ne 4 ] || ! is_num "$1" || ! is_num "$3"; then step_err "B ($BT_TAG): malformed ID marker '$line'"; return 1; fi
    B_PID="$1"; B_APPV="$2"; B_NAPP="$3"; B_DBN="$4"
    if [ "$(marker_payload "$BT_PIDFILE" PID)" != "$B_PID" ]; then step_err "B ($BT_TAG): pid marker differs from the pid reported in-session ($B_PID)"; return 1; fi
    ALL_PIDS="$ALL_PIDS,$B_PID"
    if [ "$B_APPV" != "$BT_APP" ] || [ "$B_NAPP" != "1" ] || [ "$B_DBN" != "$DBNAME" ]; then
        step_err "B ($BT_TAG): session identity mismatch (app=$B_APPV sessions-with-name=$B_NAPP db=$B_DBN)"
        return 1
    fi
    B_LT=$(tline LT)
    case "$B_LT" in ''|*:*|*' '*) step_err "B ($BT_TAG): malformed LT marker '$B_LT'"; return 1 ;; esac
    line=$(tline RES)
    set -- $line
    if [ "$#" -lt 3 ]; then step_err "B ($BT_TAG): malformed RES marker '$line'"; return 1; fi
    e="$1"; s="$2"; l="$3"
    shift 3
    m="$*"
    case "$e" in
        true|false) ;;
        *) step_err "B ($BT_TAG): psql variable ERROR was '$e' (expected true or false)"; return 1 ;;
    esac
    if ! is_sqlstate "$s"; then step_err "B ($BT_TAG): malformed SQLSTATE '$s'"; return 1; fi
    if [ "$e" = "false" ]; then
        if [ "$s" != "00000" ]; then step_err "B ($BT_TAG): contradictory result (ERROR=false but SQLSTATE=$s)"; return 1; fi
        B_LSTATE=""
        B_MSG=""
    else
        if [ "$s" = "00000" ]; then step_err "B ($BT_TAG): contradictory result (ERROR=true but SQLSTATE=00000)"; return 1; fi
        if [ "$l" != "$s" ]; then step_err "B ($BT_TAG): contradictory result (SQLSTATE=$s but LAST_ERROR_SQLSTATE=$l)"; return 1; fi
        B_LSTATE="$l"
        B_MSG="$m"
    fi
    B_ERRV="$e"
    B_STATE="$s"
    line=$(tline MS)
    if is_num "$line"; then B_MS="$line"; else B_MS="?"; fi
    vlog "B ($BT_TAG): error=$B_ERRV sqlstate=$B_STATE lock_timeout=$B_LT elapsed_ms=$B_MS (secondary diagnostic only)"
    return 0
}

b_run() { b_launch fg; b_collect; }

# نجاح التعليمة المختبَرة: ERROR=false و SQLSTATE=00000 (من استعلامها هي لا من LAST_ERROR_*) + سريان مهلة القفل المتوقعة. 2 تأكيدان.
b_expect_success() { # expected lock_timeout text
    local ok=0
    if [ "$B_ERRV/$B_STATE" = "false/00000" ]; then
        assert_pass "B ($BT_TAG) statement succeeded"
    else
        assert_fail "B ($BT_TAG) expected success but got error=$B_ERRV sqlstate=$B_STATE: $(describe_state "$B_STATE") [$B_MSG]"
        ok=1
    fi
    expect_eq "B ($BT_TAG) effective lock_timeout override" "$B_LT" "$1" || ok=1
    return "$ok"
}

# خطأ متوقع: ERROR=true و SQLSTATE المتوقع، ثم الرسالة (إن طُلبت) ومهلة القفل (إن طُلبت). تأكيد + عدد الوسيطين غير الفارغين.
b_expect_error() { # sqlstate message lock_timeout
    local ok=0
    if [ "$B_ERRV/$B_STATE" = "true/$1" ]; then
        assert_pass "B ($BT_TAG) received SQLSTATE $1"
    else
        assert_fail "B ($BT_TAG) expected SQLSTATE $1 but got error=$B_ERRV sqlstate=$B_STATE: $(describe_state "$B_STATE") [$B_MSG]"
        ok=1
    fi
    if [ -n "$2" ]; then expect_eq "B ($BT_TAG) error message" "$B_MSG" "$2" || ok=1; fi
    if [ -n "$3" ]; then expect_eq "B ($BT_TAG) effective lock_timeout override" "$B_LT" "$3" || ok=1; fi
    return "$ok"
}

b_load_ev() { # علامة EV بست قيم
    local line
    line=$(tline EV)
    set -- $line
    if [ "$#" -ne 6 ] || ! is_num "$1" || ! is_num "$2" || ! is_num "$3" || ! is_num "$4" || ! is_num "$5" || ! is_num "$6"; then
        step_err "B ($BT_TAG): missing or malformed EV marker '$line'"
        return 1
    fi
    B_EV1="$1"; B_EV2="$2"; B_EV3="$3"; B_EV4="$4"; B_EV5="$5"; B_EV6="$6"
    return 0
}

b_expect_ev() { # n_self n_a n_key n_wait n_other n_own  (6 تأكيدات)
    local ok=0
    if [ "$B_ERRV" != "false" ]; then return 1; fi
    b_load_ev || return 1
    expect_eq "B ($BT_TAG) evidence: own granted row (class $BT_KCLS, id $BT_KID, $BT_KMODE, objsubid 2)" "$B_EV1" "$1" || ok=1
    expect_eq "B ($BT_TAG) evidence: A's row on A's key" "$B_EV2" "$2" || ok=1
    expect_eq "B ($BT_TAG) evidence: granted rows on B's key (all sessions)" "$B_EV3" "$3" || ok=1
    expect_eq "B ($BT_TAG) evidence: waiting rows on B's key" "$B_EV4" "$4" || ok=1
    expect_eq "B ($BT_TAG) evidence: rows of foreign sessions on the test keys" "$B_EV5" "$5" || ok=1
    expect_eq "B ($BT_TAG) evidence: advisory locks held by B" "$B_EV6" "$6" || ok=1
    return "$ok"
}

b_wait_bg() { # secs
    if ! wait_exit "$BT_OSPID" "$1"; then
        step_err "B ($BT_TAG) did not finish within ${1}s; terminating this script's own child"
        kill_owned "$BT_OSPID"
    fi
    proc_alive "$BT_OSPID" || wait "$BT_OSPID" 2>/dev/null
    untrack_child "$BT_OSPID"
    RB_TIMEOUT=0
}

bg_reap() {
    local p
    for p in $CASE_BG; do
        wait_exit "$p" 2 || kill_owned "$p"
        proc_alive "$p" || wait "$p" 2>/dev/null
        untrack_child "$p"
    done
    CASE_BG=""
}

# ---------------------------------------------------------------- مخططات الحالات (العدد المذكور = عدد التأكيدات على المسار السليم)
# تنازع: hold_a 4 + محاولة 2 + A تحتفظ 1 + B لا تترك شيئاً 1 + حاجز ROLLBACK 1 + تحرير 1 + A متصلة 1 + تحكم (نجاح 2 + أدلة 6) = 19
conflict_case() { # tag cls a_mode b_mode
    local tag="$1" cls="$2" am="$3" bm="$4"
    hold_a "${tag}-a" "$cls" "$K1" "$am" || return 0
    b_set "${tag}-b1" attempt "$T_CONFLICT_MS" "$cls" "$K1" "$bm" "$A_PID" "$cls" "$K1" "$am" || return 0
    b_run || return 0
    b_expect_error 55P03 "" "$LT_CONFLICT"
    obs_expect "A still holds its granted lock after B received 55P03" "$(sql_lockrow "$A_PID" "$cls" "$K1" "$am" true)" 1
    obs_expect "B left no advisory lock and no waiting row behind" "$(sql_adv_total "$B_PID") || '/' || $(sql_keyrows "$cls" "$K1" false)" "0/0"
    a_send "ROLLBACK;"
    if a_barrier; then assert_pass "A completed ROLLBACK (barrier)"; else step_err "A did not complete ROLLBACK (barrier failed)"; return 0; fi
    poll_expect "A's lock is gone after ROLLBACK" 5 "$(sql_adv_total "$A_PID")" 0 || return 0
    obs_expect "A's session is still connected (release came from the transaction end)" "$(sql_ident "$A_PID" "$A_APP")" "1/1"
    b_set "${tag}-b2" txn "$T_CONFLICT_MS" "$cls" "$K1" "$bm" "$A_PID" "$cls" "$K1" "$am" || return 0
    b_run || return 0
    b_expect_success "$LT_CONFLICT"
    b_expect_ev 1 0 1 0 0 1
    case_complete 19
}

# استقلال المعرّفات: hold_a 4 + نجاح 2 + أدلة 6 + A تحتفظ 1 = 13
indep_case() { # tag cls a_mode b_mode ida idb
    local tag="$1" cls="$2" am="$3" bm="$4" ida="$5" idb="$6"
    hold_a "${tag}-a" "$cls" "$ida" "$am" || return 0
    b_set "${tag}-b" txn "$T_CONFLICT_MS" "$cls" "$idb" "$bm" "$A_PID" "$cls" "$ida" "$am" || return 0
    b_run || return 0
    b_expect_success "$LT_CONFLICT"
    b_expect_ev 1 1 1 0 0 1
    obs_expect "A still holds its own lock" "$(sql_lockrow "$A_PID" "$cls" "$ida" "$am" true)" 1
    case_complete 13
}

# استقلال الأصناف: hold_a 4 + (نجاح 2 + أدلة 6) x2 + A تحتفظ 1 = 21
class_case() { # tag a_cls a_mode b1_cls b1_mode b2_cls b2_mode
    local tag="$1" ac="$2" am="$3"
    hold_a "${tag}-a" "$ac" "$K1" "$am" || return 0
    b_set "${tag}-b1" txn "$T_CONFLICT_MS" "$4" "$K1" "$5" "$A_PID" "$ac" "$K1" "$am" || return 0
    b_run || return 0
    b_expect_success "$LT_CONFLICT"
    b_expect_ev 1 1 1 0 0 1
    b_set "${tag}-b2" txn "$T_CONFLICT_MS" "$6" "$K1" "$7" "$A_PID" "$ac" "$K1" "$am" || return 0
    b_run || return 0
    b_expect_success "$LT_CONFLICT"
    b_expect_ev 1 1 1 0 0 1
    obs_expect "A still holds its own lock" "$(sql_lockrow "$A_PID" "$ac" "$K1" "$am" true)" 1
    case_complete 21
}

release_a_and_wait() { # endcmd : يحرّر A حتى لا تبقى B معلّقة (مسار فشل)
    a_send "$1;"
    b_wait_bg 15
}

# تحرير: hold_a 4 + هوية B 1 + B محجوبة 1 + A تحتفظ 1 + حاجز 1 + تحرير 1 + A متصلة 1 + نجاح 2 + أدلة 6 = 18
release_case() { # tag cls a_mode b_mode COMMIT|ROLLBACK
    local tag="$1" cls="$2" am="$3" bm="$4" endcmd="$5" blocked=0 rc
    hold_a "${tag}-a" "$cls" "$K1" "$am" || return 0
    b_set "${tag}-b" txn "$T_WAIT_MS" "$cls" "$K1" "$bm" "$A_PID" "$cls" "$K1" "$am" || return 0
    b_launch bg
    wait_marker "$BT_PIDFILE" "$BT_NONCE" "$BT_OSPID" 10
    rc=$?
    B_PID=$(marker_payload "$BT_PIDFILE" PID)
    if [ "$rc" -ne 0 ] || ! is_num "$B_PID"; then
        step_err "B ($BT_TAG) did not publish a valid pid marker (rc=$rc): $(tail -n 3 "$BT_ERR" 2>/dev/null | tr '\n' ' ')"
        release_a_and_wait "$endcmd"
        return 0
    fi
    ALL_PIDS="$ALL_PIDS,$B_PID"
    if ! obs "$(sql_ident "$B_PID" "$BT_APP")"; then
        step_err "B ($BT_TAG) identity check: observer failed ($OBS_ERR)"
        release_a_and_wait "$endcmd"
        return 0
    fi
    if ! expect_eq "B ($BT_TAG) correlated (pid $B_PID matches application_name, one session with that name)" "$OBS_VAL" "1/1"; then
        release_a_and_wait "$endcmd"
        return 0
    fi
    if poll_expect "B is blocked: its ungranted $bm row exists while A holds the lock" 5 "$(sql_lockrow "$B_PID" "$cls" "$K1" "$bm" false)" 1; then
        blocked=1
    fi
    obs_expect "A still holds its granted lock while B waits" "$(sql_lockrow "$A_PID" "$cls" "$K1" "$am" true)" 1
    a_send "$endcmd;"
    if a_barrier; then assert_pass "A completed $endcmd (barrier)"; else step_err "A did not complete $endcmd (barrier failed)"; b_wait_bg 15; return 0; fi
    poll_expect "A's lock is gone after $endcmd" 5 "$(sql_adv_total "$A_PID")" 0
    obs_expect "A's session is still connected (release came from the transaction end)" "$(sql_ident "$A_PID" "$A_APP")" "1/1"
    b_wait_bg 15
    if [ "$blocked" -eq 0 ]; then
        step_fail "release is not proven: B was never observed blocked before $endcmd"
        return 0
    fi
    b_collect || return 0
    b_expect_success "$LT_WAIT"
    b_expect_ev 1 0 1 0 0 1
    case_complete 18
}

# NULL: خطأ 3 تأكيدات (الحالة والرسالة والمهلة) + عدّ أقفال B 1 = 4
null_case() { # tag stmt message
    local tag="$1" stmt="$2" msg="$3" line
    b_set "${tag}-b" null "$T_CONFLICT_MS" 0 0 None 0 0 0 None || return 0
    BT_STMT="$stmt"
    b_run || return 0
    b_expect_error 22004 "$msg" "$LT_CONFLICT"
    line=$(tline EV)
    if ! is_num "$line"; then step_err "B ($BT_TAG): missing or malformed EV marker '$line'"; return 0; fi
    expect_eq "B ($BT_TAG) holds no advisory lock after the rejected call" "$line" 0
    case_complete 4
}

# ---------------------------------------------------------------- الحالات
case_P01() { # 3 تأكيدات
    obs_expect "database, user and server major version" "current_database() || '|' || current_user || '|' || (current_setting('server_version_num')::int / 10000)" "afiyah_test|omarsh|18"
    obs_expect "server-side backstops and read-only protection are in effect" "current_setting('lock_timeout') || '|' || current_setting('statement_timeout') || '|' || current_setting('idle_in_transaction_session_timeout') || '|' || current_setting('default_transaction_read_only') || '|' || current_setting('transaction_read_only')" "10s|20s|30s|on|on"
    if obs "(SELECT md5(coalesce(string_agg(s.schemaname || '.' || s.sequencename || '=' || coalesce(s.last_value::text, 'null'), ',' ORDER BY s.schemaname, s.sequencename), '')) FROM pg_sequences s)"; then
        SEQ_SNAP0="$OBS_VAL"
        assert_pass "initial sequence snapshot taken"
    else
        step_err "could not snapshot the sequences ($OBS_ERR)"
        return 0
    fi
    case_complete 3
}
case_P02() { # 1 تأكيد
    obs_expect "the three lock functions exist in public with exact signatures (apply 002_functions.sql first if not)" "(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname IN ('lock_specialty', 'lock_doctor', 'lock_patient')) || '/' || (SELECT count(*) FROM (VALUES ('public.lock_specialty(integer,boolean)'), ('public.lock_doctor(integer)'), ('public.lock_patient(integer)')) v(sig) JOIN pg_proc p ON p.oid = to_regprocedure(v.sig)::oid WHERE p.prokind = 'f' AND p.prorettype = 'void'::regtype AND p.provolatile = 'v' AND NOT p.prosecdef AND NOT p.proretset)" "3/3"
    case_complete 1
}
case_P03() { # 1 تأكيد
    obs_expect "no foreign T2BLK sessions and no lock rows on the test keys" "(SELECT count(*) FROM pg_stat_activity s WHERE s.application_name LIKE 'T2BLK:%' AND s.application_name NOT LIKE '${APP_PREFIX}:%') || '/' || $(sql_testkey_rows)" "0/0"
    case_complete 1
}

case_C01() { # hold_a 4 + نجاح 2 + أدلة 6 + A تحتفظ 1 = 13
    hold_a C01-a 1 "$K1" ShareLock || return 0
    b_set C01-b txn "$T_CONFLICT_MS" 1 "$K1" ShareLock "$A_PID" 1 "$K1" ShareLock || return 0
    b_run || return 0
    b_expect_success "$LT_CONFLICT"
    b_expect_ev 1 1 2 0 0 1
    obs_expect "A still holds its shared lock" "$(sql_lockrow "$A_PID" 1 "$K1" ShareLock true)" 1
    case_complete 13
}
case_C02() { conflict_case C02 1 ShareLock ExclusiveLock; }
case_C03() { conflict_case C03 1 ExclusiveLock ShareLock; }
# C04: hold_a 4 + حاجز 1 + بقاء القفل 1 + محاولة 2 + A تحتفظ 1 + B لا تترك شيئاً 1 + حاجز ROLLBACK 1 + تحرير 1 + A متصلة 1 + تحكم 8 = 21
case_C04() {
    hold_a C04-a 1 "$K1" ExclusiveLock || return 0
    if a_barrier; then assert_pass "A processed a later statement in the same transaction (barrier)"; else step_err "A did not process the later statement (barrier failed)"; return 0; fi
    obs_expect "A still holds the lock after a later statement in the same transaction" "$(sql_lockrow "$A_PID" 1 "$K1" ExclusiveLock true)" 1
    b_set C04-b1 attempt "$T_CONFLICT_MS" 1 "$K1" ExclusiveLock "$A_PID" 1 "$K1" ExclusiveLock || return 0
    b_run || return 0
    b_expect_error 55P03 "" "$LT_CONFLICT"
    obs_expect "A still holds its granted lock after B received 55P03" "$(sql_lockrow "$A_PID" 1 "$K1" ExclusiveLock true)" 1
    obs_expect "B left no advisory lock and no waiting row behind" "$(sql_adv_total "$B_PID") || '/' || $(sql_keyrows 1 "$K1" false)" "0/0"
    a_send "ROLLBACK;"
    if a_barrier; then assert_pass "A completed ROLLBACK (barrier)"; else step_err "A did not complete ROLLBACK (barrier failed)"; return 0; fi
    poll_expect "A's lock is gone after ROLLBACK" 5 "$(sql_adv_total "$A_PID")" 0 || return 0
    obs_expect "A's session is still connected" "$(sql_ident "$A_PID" "$A_APP")" "1/1"
    b_set C04-b2 txn "$T_CONFLICT_MS" 1 "$K1" ExclusiveLock "$A_PID" 1 "$K1" ExclusiveLock || return 0
    b_run || return 0
    b_expect_success "$LT_CONFLICT"
    b_expect_ev 1 0 1 0 0 1
    case_complete 21
}
case_C05() { conflict_case C05 2 ExclusiveLock ExclusiveLock; }
case_C06() { conflict_case C06 3 ExclusiveLock ExclusiveLock; }

case_I01() { indep_case I01 1 ExclusiveLock ExclusiveLock "$K1" "$K2"; }
case_I02() { indep_case I02 2 ExclusiveLock ExclusiveLock "$K1" "$K2"; }
case_I03() { indep_case I03 3 ExclusiveLock ExclusiveLock "$K1" "$K2"; }
case_I04() { indep_case I04 1 ShareLock ExclusiveLock "$K1" "$K2"; }

case_K01() { class_case K01 2 ExclusiveLock 3 ExclusiveLock 1 ExclusiveLock; }
case_K02() { class_case K02 3 ExclusiveLock 2 ExclusiveLock 1 ExclusiveLock; }
case_K03() { class_case K03 1 ExclusiveLock 2 ExclusiveLock 3 ExclusiveLock; }

case_R01() { release_case R01 2 ExclusiveLock ExclusiveLock COMMIT; }
case_R02() { release_case R02 3 ExclusiveLock ExclusiveLock COMMIT; }
case_R03() { release_case R03 1 ExclusiveLock ExclusiveLock COMMIT; }
case_R04() { release_case R04 2 ExclusiveLock ExclusiveLock ROLLBACK; }
case_R05() { release_case R05 3 ExclusiveLock ExclusiveLock ROLLBACK; }
case_R06() { release_case R06 1 ExclusiveLock ExclusiveLock ROLLBACK; }
case_R07() { release_case R07 1 ShareLock ExclusiveLock COMMIT; }

case_N01() { null_case N01 "SELECT public.lock_doctor(NULL)" "lock_doctor: p_id is required"; }
case_N02() { null_case N02 "SELECT public.lock_patient(NULL)" "lock_patient: p_id is required"; }
case_N03() { null_case N03 "SELECT public.lock_specialty(NULL, true)" "lock_specialty: p_id and p_shared are required"; }
case_N04() { null_case N04 "SELECT public.lock_specialty($K1, NULL)" "lock_specialty: p_id and p_shared are required"; }

case_Z01() { # 3 تأكيدات
    obs_expect "no backend of this run remains (any role)" "(SELECT count(*) FROM pg_stat_activity s WHERE s.application_name LIKE '${APP_PREFIX}:%' AND s.pid <> pg_backend_pid())" 0
    if [ -z "$Z01_BAD" ]; then assert_pass "every A backend was confirmed gone right after its case"; else assert_fail "per-case session cleanup problems:${Z01_BAD}"; fi
    if [ -z "${CHILD_PIDS// /}" ]; then assert_pass "no local child process is still tracked"; else assert_fail "local child processes still tracked: $CHILD_PIDS"; fi
    case_complete 3
}
case_Z02() { # 1 تأكيد
    obs_expect "no advisory lock row remains on the test keys or for any session created by this run" "(SELECT count(*) FROM pg_locks l WHERE l.locktype = 'advisory' AND l.database = $Q_DB AND ((l.objsubid = 2 AND l.classid::bigint IN (1, 2, 3) AND l.objid::bigint IN ($K1, $K2)) OR l.pid IN ($ALL_PIDS)))" 0
    case_complete 1
}
case_Z03() { # 1 تأكيد
    if [ -z "$SEQ_SNAP0" ]; then step_err "no initial sequence snapshot (P01 did not complete)"; return 0; fi
    obs_expect "identity sequences unchanged since P01 (nothing consumed)" "(SELECT md5(coalesce(string_agg(s.schemaname || '.' || s.sequencename || '=' || coalesce(s.last_value::text, 'null'), ',' ORDER BY s.schemaname, s.sequencename), '')) FROM pg_sequences s)" "$SEQ_SNAP0"
    case_complete 1
}

# ---------------------------------------------------------------- المشغّل والملخّص
# النتيجة: ERROR إن سُجّل خطأ بنية، FAIL إن سُجّل فشل سلوكي، ERROR إن لم تكتمل الحالة أو اختل عدّ تأكيداتها، وإلا PASS.
run_case() { # id title function
    CASE_ID="$1"; CASE_TITLE="$2"; CASE_FAILS=""; CASE_ERRS=""; CASE_BG=""
    CASE_DONE=0; CASE_EXPECT=-1; CASE_ASSERTS=0
    check_deadline
    "$3"
    a_finish
    bg_reap
    if [ -z "$CASE_ERRS" ] && [ -z "$CASE_FAILS" ]; then
        if [ "$CASE_DONE" -ne 1 ]; then
            step_err "case did not run to completion and recorded no evidence"
        elif [ "$CASE_ASSERTS" -ne "$CASE_EXPECT" ]; then
            step_err "assertion count mismatch: executed $CASE_ASSERTS, expected $CASE_EXPECT"
        fi
    fi
    if [ -n "$CASE_ERRS" ]; then
        N_ERR=$((N_ERR + 1))
        printf 'ERROR %s  %s\n%s' "$CASE_ID" "$CASE_TITLE" "$CASE_ERRS"
        if [ -n "$CASE_FAILS" ]; then printf '%s' "$CASE_FAILS"; fi
        printf 'ERROR %s\n' "$CASE_ID" >> "$WORK/results.txt"
    elif [ -n "$CASE_FAILS" ]; then
        N_FAIL=$((N_FAIL + 1))
        printf 'FAIL  %s  %s\n%s' "$CASE_ID" "$CASE_TITLE" "$CASE_FAILS"
        printf 'FAIL %s\n' "$CASE_ID" >> "$WORK/results.txt"
    else
        N_PASS=$((N_PASS + 1))
        printf 'PASS  %s  %s  (%s assertions)\n' "$CASE_ID" "$CASE_TITLE" "$CASE_ASSERTS"
        printf 'PASS %s\n' "$CASE_ID" >> "$WORK/results.txt"
    fi
}

summary() {
    awk '{ g = $2; sub(/[0-9].*/, "", g); t[g]++; if ($1 == "PASS") p[g]++ } END { for (g in t) printf "group %s: %d/%d passed\n", g, p[g] + 0, t[g] }' "$WORK/results.txt" | sort
    printf 'TOTAL: %d passed, %d failed, %d errors, %d tests\n' "$N_PASS" "$N_FAIL" "$N_ERR" $((N_PASS + N_FAIL + N_ERR))
}

preflight_env() {
    local tool v
    if [ "$#" -ne 0 ]; then die_pre "no arguments are accepted (the target database is fixed to $DBNAME)"; fi
    SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P) || die_pre "cannot resolve the script directory"
    case "$SCRIPT_DIR" in
        */backend/db/tests/concurrency) ;;
        *) die_pre "unexpected script location: $SCRIPT_DIR" ;;
    esac
    DB_DIR="${SCRIPT_DIR%/tests/concurrency}"
    GUARD="$DB_DIR/_guard.sql"
    [ -f "$GUARD" ] || die_pre "_guard.sql not found at $GUARD"
    case "$GUARD" in
        *[!A-Za-z0-9._/-]*) die_pre "the path of _guard.sql contains characters this script does not support" ;;
    esac
    for tool in mkfifo mktemp sed grep awk tr ps sleep kill sort head tail cut date cat; do
        command -v "$tool" > /dev/null 2>&1 || die_pre "required tool not found: $tool"
    done
    PSQL_BIN=$(command -v psql) || die_pre "psql not found on PATH"
    v=$("$PSQL_BIN" --version 2>/dev/null | sed -n 's/^psql (PostgreSQL) \([0-9][0-9]*\).*/\1/p')
    [ "$v" = "18" ] || die_pre "psql major version must be 18 (found '${v:-unknown}')"
    unset PGSERVICE PGSERVICEFILE PGOPTIONS PGAPPNAME PGDATABASE PGTARGETSESSIONATTRS
    export PGDATABASE="$DBNAME"
    export PGCONNECT_TIMEOUT=10
    export PGOPTIONS="-c lock_timeout=${SRV_LOCK_MS} -c statement_timeout=${SRV_STMT_MS} -c idle_in_transaction_session_timeout=${SRV_IDLE_MS} -c default_transaction_read_only=on"
    RUN="$$-$(date +%s)"
    APP_PREFIX="T2BLK:${RUN}"
    OBS_APP="${APP_PREFIX}:OBS"
    WORK=$(mktemp -d "${TMPDIR:-/tmp}/t2b_locks.XXXXXX") || die_infra "cannot create a temporary directory"
    trap cleanup EXIT
    trap 'INT_RC=130; exit 130' INT
    trap 'INT_RC=143; exit 143' TERM
    trap 'INT_RC=129; exit 129' HUP
    case "$WORK" in
        *[!A-Za-z0-9._/-]*) die_infra "the temporary directory path contains characters this script does not support: $WORK" ;;
    esac
    : > "$WORK/results.txt"
    write_templates
    GLOBAL_END=$((SECONDS + GLOBAL_LIMIT_S))
}

main() {
    local pbad
    preflight_env "$@"
    printf 't2b_locks: target database %s, run %s, psql %s\n' "$DBNAME" "$RUN" "$PSQL_BIN"
    printf 't2b_locks: read-only sessions, no DDL/DML; timeouts: conflict %sms, release wait %sms, server backstops %s/%s/%sms\n' "$T_CONFLICT_MS" "$T_WAIT_MS" "$SRV_LOCK_MS" "$SRV_STMT_MS" "$SRV_IDLE_MS"

    run_case P01 "target database, user, version, backstops and read-only protection" case_P01
    run_case P02 "the three lock functions exist with the approved signatures" case_P02
    run_case P03 "no stale sessions or locks on the test keys" case_P03
    pbad=$((N_FAIL + N_ERR))
    if [ "$pbad" -gt 0 ]; then
        summary
        die_pre "preconditions P01-P03 did not hold; no concurrency test was run"
    fi

    run_case C01 "specialty shared / shared are compatible" case_C01
    run_case C02 "specialty shared (A) / exclusive (B) conflict" case_C02
    run_case C03 "specialty exclusive (A) / shared (B) conflict" case_C03
    run_case C04 "specialty exclusive / exclusive conflict (lock survives later statements)" case_C04
    run_case C05 "doctor exclusive / exclusive conflict" case_C05
    run_case C06 "patient exclusive / exclusive conflict" case_C06
    run_case I01 "specialty: different ids do not conflict" case_I01
    run_case I02 "doctor: different ids do not conflict" case_I02
    run_case I03 "patient: different ids do not conflict" case_I03
    run_case I04 "specialty shared id1 vs exclusive id2 do not conflict" case_I04
    run_case K01 "same id, A holds doctor: patient and specialty are free" case_K01
    run_case K02 "same id, A holds patient: doctor and specialty are free" case_K02
    run_case K03 "same id, A holds specialty: doctor and patient are free" case_K03
    run_case R01 "doctor lock: blocked waiter is granted after COMMIT" case_R01
    run_case R02 "patient lock: blocked waiter is granted after COMMIT" case_R02
    run_case R03 "specialty lock: blocked waiter is granted after COMMIT" case_R03
    run_case R04 "doctor lock: blocked waiter is granted after ROLLBACK" case_R04
    run_case R05 "patient lock: blocked waiter is granted after ROLLBACK" case_R05
    run_case R06 "specialty lock: blocked waiter is granted after ROLLBACK" case_R06
    run_case R07 "specialty shared holder: exclusive waiter is granted after COMMIT" case_R07
    run_case N01 "lock_doctor(NULL) is rejected with 22004" case_N01
    run_case N02 "lock_patient(NULL) is rejected with 22004" case_N02
    run_case N03 "lock_specialty(NULL, true) is rejected with 22004" case_N03
    run_case N04 "lock_specialty(id, NULL) is rejected with 22004" case_N04
    run_case Z01 "no session created by this run remains and no child process is tracked" case_Z01
    run_case Z02 "no advisory lock remains on the test keys or for the run's sessions" case_Z02
    run_case Z03 "identity sequences were not consumed" case_Z03

    summary
    if [ "$N_ERR" -gt 0 ]; then exit 2; fi
    if [ "$N_FAIL" -gt 0 ]; then exit 1; fi
    exit 0
}

main "$@"
