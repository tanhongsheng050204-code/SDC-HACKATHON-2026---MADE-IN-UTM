"""Words used in emails, in English, Bahasa Malaysia and Chinese (BM and Chinese AI-drafted, like the
app's own text in frontend/src/lib/i18n.ts; a native speaker should check them)."""

TEXT: dict[str, dict[str, str]] = {
    "digest_subject": {"en": "Your Laluan week", "ms": "Minggu Laluan anda", "zh": "你的 Laluan 本周摘要"},
    "hello": {"en": "Hello,", "ms": "Hai,", "zh": "你好，"},
    "hello_name": {"en": "Hello {name},", "ms": "Hai {name},", "zh": "{name}，你好，"},
    "ready": {"en": "You're {n}% ready for {role}.", "ms": "Anda {n}% bersedia untuk {role}.", "zh": "你已为{role}准备了 {n}%。"},
    "status": {"en": "{status} for your target date of {date}.", "ms": "{status} untuk tarikh sasaran {date}.",
               "zh": "距离你的目标日期 {date}：{status}。"},
    "on_track": {"en": "On track", "ms": "Di landasan", "zh": "按计划进行"},
    "ahead": {"en": "Ahead", "ms": "Mendahului", "zh": "超前"},
    "behind": {"en": "Behind", "ms": "Ketinggalan", "zh": "落后"},
    "done": {"en": "Ready", "ms": "Bersedia", "zh": "已准备好"},
    "week": {"en": "Course hours finished this week: {done} of {target}.",
             "ms": "Jam kursus yang diselesaikan minggu ini: {done} daripada {target}.",
             "zh": "本周完成的课程时数：{done} / {target}。"},
    "week_no_target": {"en": "Course hours finished this week: {done}.", "ms": "Jam kursus yang diselesaikan minggu ini: {done}.",
                       "zh": "本周完成的课程时数：{done}。"},
    "next_course": {"en": "Next course: {course} from {provider}, {hours} hours.", "ms": "Kursus seterusnya: {course} daripada {provider}, {hours} jam.",
                    "zh": "下一门课程：{provider} 的 {course}，{hours} 小时。"},
    "no_destination": {"en": "Choose a destination in Laluan to see your progress and matching job ads here.",
                       "ms": "Pilih destinasi dalam Laluan untuk melihat kemajuan dan iklan kerja yang sepadan di sini.",
                       "zh": "在 Laluan 中选择一个目标，就能在这里看到你的进度和相符的招聘广告。"},
    "jobs_title": {"en": "New job ads for {role}{where}:", "ms": "Iklan kerja baharu untuk {role}{where}:", "zh": "{role}的新招聘广告{where}："},
    "where": {"en": " in {state}", "ms": " di {state}", "zh": "（{state}）"},
    "no_jobs": {"en": "No new job ads for {role} this week.", "ms": "Tiada iklan kerja baharu untuk {role} minggu ini.",
                "zh": "本周没有{role}的新招聘广告。"},
    "no_state": {"en": "location not stated", "ms": "lokasi tidak dinyatakan", "zh": "未注明地点"},
    "jobs_source": {"en": "From freehire.me Malaysian job postings. Each link opens the original ad; Laluan has not checked them.",
                    "ms": "Daripada iklan kerja Malaysia freehire.me. Setiap pautan membuka iklan asal; Laluan belum menyemaknya.",
                    "zh": "来自 freehire.me 的马来西亚招聘信息。每个链接都打开原始广告；Laluan 未核实这些广告。"},
    "forecast": {"en": "Forecast updated on {date}: {role} moved from {before} to {after} under Baseline (estimate).",
                 "ms": "Unjuran dikemas kini pada {date}: {role} berubah daripada {before} kepada {after} di bawah senario Asas (anggaran).",
                 "zh": "预测于 {date} 更新：在基准情景下，{role} 从 {before} 变为 {after}（估计值）。"},
    "replan": {"en": "The new forecast re-ranked your roles: {moves}.", "ms": "Unjuran baharu menyusun semula peranan anda: {moves}.",
               "zh": "新的预测重新排列了你的职位：{moves}。"},
    "replan_dest": {"en": "Your destination {role} is now #{after} (was #{before}).",
                    "ms": "Destinasi anda {role} kini #{after} (sebelum ini #{before}).",
                    "zh": "你的目标{role}现在排第 {after}（之前第 {before}）。"},
    "replan_top": {"en": "{role} is now your best fit. Open it in Laluan if you want to compare; nothing changes unless you choose.",
                   "ms": "{role} kini paling sesuai untuk anda. Bukanya dalam Laluan jika mahu membandingkan; tiada apa berubah melainkan anda memilih.",
                   "zh": "{role}现在最适合你。如需比较，可在 Laluan 中打开；除非你选择，否则不会有任何改变。"},
    "open": {"en": "Open Laluan", "ms": "Buka Laluan", "zh": "打开 Laluan"},
    "footer": {"en": "You get this weekly email because you ticked “Email me” in Laluan. Estimates, not predictions. You decide.",
               "ms": "Anda menerima e-mel mingguan ini kerana anda menanda “E-mel saya” dalam Laluan. Anggaran, bukan ramalan. Anda yang menentukan.",
               "zh": "你收到这封每周邮件，是因为你在 Laluan 中勾选了“给我发邮件”。仅为估计，并非预言。由你决定。"},
    "unsubscribe": {"en": "Unsubscribe with one click", "ms": "Berhenti melanggan dengan satu klik", "zh": "一键退订"},
    "alerts_subject": {"en": "New job ads for {role}", "ms": "Iklan kerja baharu untuk {role}", "zh": "{role}的新招聘广告"},
    "alerts_intro": {"en": "{n} new job ads name {role}{where}.", "ms": "{n} iklan kerja baharu menyebut {role}{where}.",
                     "zh": "有 {n} 条新招聘广告提到{role}{where}。"},
    "alerts_footer": {"en": "You get these because you ticked “Send job alerts as they appear” in Laluan.",
                      "ms": "Anda menerima ini kerana anda menanda “Hantar amaran kerja sebaik sahaja ada” dalam Laluan.",
                      "zh": "你收到这些，是因为你在 Laluan 中勾选了“有新职位时立即通知我”。"},
    "stop_alerts": {"en": "Stop job alerts with one click", "ms": "Hentikan amaran kerja dengan satu klik", "zh": "一键停止职位提醒"},
}

STATES: dict[str, dict[str, str]] = {
    "anywhere": {"en": "anywhere in Malaysia", "ms": "di mana-mana di Malaysia", "zh": "马来西亚各地"},
    "johor": {"en": "Johor", "ms": "Johor", "zh": "柔佛"},
    "kedah": {"en": "Kedah", "ms": "Kedah", "zh": "吉打"},
    "kelantan": {"en": "Kelantan", "ms": "Kelantan", "zh": "吉兰丹"},
    "melaka": {"en": "Melaka", "ms": "Melaka", "zh": "马六甲"},
    "negeri_sembilan": {"en": "Negeri Sembilan", "ms": "Negeri Sembilan", "zh": "森美兰"},
    "pahang": {"en": "Pahang", "ms": "Pahang", "zh": "彭亨"},
    "perak": {"en": "Perak", "ms": "Perak", "zh": "霹雳"},
    "perlis": {"en": "Perlis", "ms": "Perlis", "zh": "玻璃市"},
    "pulau_pinang": {"en": "Penang", "ms": "Pulau Pinang", "zh": "槟城"},
    "sabah": {"en": "Sabah", "ms": "Sabah", "zh": "沙巴"},
    "sarawak": {"en": "Sarawak", "ms": "Sarawak", "zh": "砂拉越"},
    "selangor": {"en": "Selangor", "ms": "Selangor", "zh": "雪兰莪"},
    "terengganu": {"en": "Terengganu", "ms": "Terengganu", "zh": "登嘉楼"},
    "kuala_lumpur": {"en": "Kuala Lumpur", "ms": "Kuala Lumpur", "zh": "吉隆坡"},
    "labuan": {"en": "Labuan", "ms": "Labuan", "zh": "纳闽"},
    "putrajaya": {"en": "Putrajaya", "ms": "Putrajaya", "zh": "布城"},
}


def say(key: str, lang: str, **values) -> str:
    entry = TEXT[key]
    return (entry.get(lang) or entry["en"]).format(**values)


def state_name(state: str, lang: str) -> str:
    entry = STATES.get(state) or STATES["anywhere"]
    return entry.get(lang) or entry["en"]
