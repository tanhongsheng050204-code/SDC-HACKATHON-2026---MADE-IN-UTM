// Interface text in English, Bahasa Malaysia and Chinese (PRD: inclusive design).
// Covers the app shell, landing page, page headings, main buttons and the honesty notices.
// Reference data (role titles, courses, O*NET tasks, sources) stays in English, as published.
// BM and 中文 were drafted with AI assistance and need a native speaker's check (REVIEW_LOG).
// The current language lives in this module; MainApp re-renders the tree when it changes.

export type Lang = "en" | "ms" | "zh";
export const LANGS: { id: Lang; label: string; htmlLang: string }[] = [
  { id: "en", label: "EN", htmlLang: "en" },
  { id: "ms", label: "BM", htmlLang: "ms" },
  { id: "zh", label: "中文", htmlLang: "zh-Hans" },
];
const KEY = "laluan.lang";

const STRINGS = {
  // shell
  "nav.profile": { en: "My profile", ms: "Profil saya", zh: "我的资料" },
  "nav.signals": { en: "Signals", ms: "Isyarat", zh: "趋势信号" },
  "nav.radar": { en: "Future Skills Radar", ms: "Radar Kemahiran Masa Depan", zh: "未来技能雷达" },
  "nav.tasks": { en: "My job, task by task", ms: "Kerja saya, tugas demi tugas", zh: "我的工作，逐项任务" },
  "nav.future": { en: "My future", ms: "Masa depan saya", zh: "我的未来" },
  "nav.roles": { en: "Future roles", ms: "Peranan masa depan", zh: "未来职位" },
  "nav.pathway": { en: "Pathway", ms: "Laluan pembelajaran", zh: "学习路径" },
  "nav.impact": { en: "SDG impact", ms: "Impak SDG", zh: "可持续发展目标影响" },
  "nav.home": { en: "Today", ms: "Hari ini", zh: "今天" },
  "home.morning": { en: "Good morning", ms: "Selamat pagi", zh: "早上好" },
  "home.afternoon": { en: "Good afternoon", ms: "Selamat petang", zh: "下午好" },
  "home.evening": { en: "Good evening", ms: "Selamat malam", zh: "晚上好" },
  "home.sub": { en: "Where you stand, your best next roles and what to do next. As of", ms: "Kedudukan anda, peranan terbaik seterusnya dan langkah seterusnya. Setakat", zh: "您目前的位置、最适合的下一个职位，以及下一步。截至" },
  "home.askPlaceholder": { en: "Ask the coach, e.g. “Which role should I aim for?”", ms: "Tanya jurulatih, cth. “Peranan mana patut saya sasarkan?”", zh: "询问顾问，例如“我应该以哪个职位为目标？”" },
  "home.next": { en: "Your next steps", ms: "Langkah seterusnya", zh: "您的下一步" },
  "nav.sources": { en: "Sources", ms: "Sumber", zh: "数据来源" },
  "nav.org": { en: "Organisation", ms: "Organisasi", zh: "机构" },
  "nav.workforce": { en: "Workforce view", ms: "Paparan tenaga kerja", zh: "员工整体视图" },
  "shell.yourProfile": { en: "Your profile", ms: "Profil anda", zh: "您的资料" },
  "shell.skills": { en: "skills", ms: "kemahiran", zh: "项技能" },
  "shell.model": { en: "AI model", ms: "Model AI", zh: "AI 模型" },
  "shell.estimates": { en: "Estimates, not predictions. You decide.", ms: "Anggaran, bukan ramalan. Anda yang membuat keputusan.", zh: "这是估计，不是预言。由您决定。" },
  "shell.delete": { en: "Delete my profile", ms: "Padam profil saya", zh: "删除我的资料" },
  "shell.coach": { en: "Ask the coach", ms: "Tanya jurulatih", zh: "询问顾问" },
  "shell.language": { en: "Language", ms: "Bahasa", zh: "语言" },
  "shell.lite": { en: "Lite mode", ms: "Mod ringan", zh: "精简模式" },
  "shell.liteHelp": { en: "System fonts, no decorative images: faster on slow connections.", ms: "Fon sistem, tiada imej hiasan: lebih pantas untuk sambungan perlahan.", zh: "使用系统字体，不加载装饰图片：网速慢时更快。" },
  "shell.offline": { en: "Can't reach the Laluan server. Check your connection; your profile is saved and will load when it's back.", ms: "Tidak dapat menghubungi pelayan Laluan. Semak sambungan anda; profil anda disimpan dan akan dimuatkan semula.", zh: "无法连接 Laluan 服务器。请检查网络；您的资料已保存，恢复后会重新加载。" },
  "shell.deleteConfirm": { en: "Delete your profile, progress and Future Cards? This can't be undone.", ms: "Padam profil, kemajuan dan Kad Masa Depan anda? Tindakan ini tidak boleh dibatalkan.", zh: "删除您的资料、进度和未来卡片？此操作无法撤销。" },
  "shell.needsProfile": { en: "Add your skills first", ms: "Tambah kemahiran anda dahulu", zh: "请先添加您的技能" },
  "shell.skip": { en: "Skip to content", ms: "Langkau ke kandungan", zh: "跳到正文" },
  "shell.waking": { en: "Waking up the server. The free hosting sleeps when idle, so this first step can take up to a minute.", ms: "Pelayan sedang dihidupkan. Hos percuma tidur apabila tidak digunakan, jadi langkah pertama ini boleh mengambil masa sehingga seminit.", zh: "正在唤醒服务器。免费主机闲置时会休眠，第一次操作可能需要一分钟。" },
  "shell.demoFailed": { en: "Couldn't open the demo profile. The server didn't answer; try again in a moment.", ms: "Tidak dapat membuka profil demo. Pelayan tidak menjawab; cuba lagi sebentar lagi.", zh: "无法打开示范资料，服务器没有响应，请稍后再试。" },
  "shell.retry": { en: "Try again", ms: "Cuba lagi", zh: "重试" },
  // landing
  "landing.judge": { en: "Judging Laluan?", ms: "Menilai Laluan?", zh: "评审 Laluan？" },
  "landing.judgeCta": { en: "Open the demo profile in one click →", ms: "Buka profil demo dengan satu klik →", zh: "一键打开示范资料 →" },
  "landing.continue": { en: "Continue", ms: "Teruskan", zh: "继续" },
  "landing.start": { en: "Get started", ms: "Mula", zh: "开始" },
  "landing.tag": { en: "Career guidance for Malaysia's AI era", ms: "Panduan kerjaya untuk era AI Malaysia", zh: "面向马来西亚 AI 时代的职业指导" },
  "landing.title": { en: "See where your career goes before AI changes it.", ms: "Lihat hala tuju kerjaya anda sebelum AI mengubahnya.", zh: "在 AI 改变您的工作之前，看清职业方向。" },
  "landing.lede": {
    en: "Laluan reads your skills, tracks dated AI-research and job-market signals, ranks the roles you can grow into under three futures, and plans free or low-cost courses to get there. You make the call.",
    ms: "Laluan membaca kemahiran anda, menjejak isyarat penyelidikan AI dan pasaran kerja yang bertarikh, menyusun peranan yang boleh anda capai dalam tiga senario masa depan, dan merancang kursus percuma atau murah untuk ke sana. Keputusan di tangan anda.",
    zh: "Laluan 读取您的技能，追踪注明日期的 AI 研究与招聘市场信号，在三种未来情景下为您可发展的职位排序，并规划免费或低成本的课程。最终由您决定。",
  },
  "landing.demo": { en: "Open the demo profile", ms: "Buka profil demo", zh: "打开示范资料" },
  "landing.mine": { en: "Start with my skills", ms: "Mula dengan kemahiran saya", zh: "从我的技能开始" },
  "landing.bandTitle": { en: "You make the call.", ms: "Keputusan di tangan anda.", zh: "由您做决定。" },
  "landing.bandText": { en: "Laluan prepares the evidence. You decide what to do with it, and every number can be checked.", ms: "Laluan menyediakan bukti. Anda yang memutuskan, dan setiap angka boleh disemak.", zh: "Laluan 准备依据，由您决定怎么做，每个数字都可以核查。" },
  "landing.closing": { en: "Your next role starts with the skills you have.", ms: "Peranan seterusnya bermula dengan kemahiran yang anda ada.", zh: "您的下一个职位，从您已有的技能开始。" },
  "landing.closingText": { en: "About ten minutes. No account. Nothing changes unless you choose it.", ms: "Kira-kira sepuluh minit. Tiada akaun. Tiada yang berubah melainkan anda memilihnya.", zh: "大约十分钟，无需注册。除非您选择，否则不会有任何改变。" },
  "landing.navPeople": { en: "Who it's for", ms: "Untuk siapa", zh: "适合谁" },
  "landing.navJourney": { en: "How it works", ms: "Cara ia berfungsi", zh: "如何运作" },
  "landing.navTrust": { en: "Trust", ms: "Kepercayaan", zh: "可信度" },
  "landing.navFaq": { en: "FAQ", ms: "Soalan lazim", zh: "常见问题" },
  "landing.footer": { en: "Forecasts are estimates under different scenarios, not predictions. Laluan supports your career decision; it never makes it.", ms: "Unjuran ialah anggaran di bawah senario berbeza, bukan ramalan. Laluan menyokong keputusan kerjaya anda; ia tidak membuat keputusan untuk anda.", zh: "预测是不同情景下的估计，不是预言。Laluan 支持您的职业决定，但从不替您做决定。" },
  // page headings and main actions
  "h.skills": { en: "Your skills", ms: "Kemahiran anda", zh: "您的技能" },
  "h.check": { en: "Check your skills", ms: "Semak kemahiran anda", zh: "核对您的技能" },
  "h.roles": { en: "Your future roles", ms: "Peranan masa depan anda", zh: "您的未来职位" },
  "h.radar": { en: "Which skills are rising and declining", ms: "Kemahiran yang meningkat dan menurun", zh: "哪些技能在上升，哪些在下降" },
  "h.tasks": { en: "Your job, task by task", ms: "Kerja anda, tugas demi tugas", zh: "您的工作，逐项任务" },
  "h.workforce": { en: "Workforce view", ms: "Paparan tenaga kerja", zh: "员工整体视图" },
  "a.seeRoles": { en: "See my future roles", ms: "Lihat peranan masa depan saya", zh: "查看我的未来职位" },
  "a.build": { en: "Build my pathway", ms: "Bina laluan saya", zh: "生成我的学习路径" },
  "a.impact": { en: "See my impact", ms: "Lihat impak saya", zh: "查看我的影响" },
  "a.print": { en: "Print summary", ms: "Cetak ringkasan", zh: "打印摘要" },
  "a.card": { en: "Create my Future Card", ms: "Cipta Kad Masa Depan saya", zh: "生成我的未来卡片" },
  "a.moveInto": { en: "See roles you could move into", ms: "Lihat peranan yang boleh anda ceburi", zh: "查看您可以转向的职位" },
  "a.continue": { en: "Save and continue", ms: "Simpan dan teruskan", zh: "保存并继续" },
  "a.building": { en: "Building your plan…", ms: "Sedang membina pelan anda…", zh: "正在生成您的计划…" },
  "in.upload": { en: "Upload CV", ms: "Muat naik CV", zh: "上传简历" },
  "in.paste": { en: "Paste CV", ms: "Tampal CV", zh: "粘贴简历" },
  "in.chat": { en: "Questionnaire", ms: "Soal selidik", zh: "问卷" },
  "in.pick": { en: "Pick skills", ms: "Pilih kemahiran", zh: "选择技能" },
  "in.read": { en: "Read my skills", ms: "Baca kemahiran saya", zh: "读取我的技能" },
  "in.reading": { en: "Reading…", ms: "Sedang membaca…", zh: "正在读取…" },
  "h.sources": { en: "Where the numbers come from", ms: "Dari mana datangnya angka", zh: "数字从哪里来" },
  "a.apply": { en: "Apply", ms: "Guna", zh: "应用" },
  "a.dismiss": { en: "Dismiss", ms: "Abaikan", zh: "忽略" },
  "a.ask": { en: "Ask", ms: "Tanya", zh: "提问" },
  "sc.slow": { en: "Slow", ms: "Perlahan", zh: "缓慢" },
  "sc.baseline": { en: "Baseline", ms: "Asas", zh: "基准" },
  "sc.accelerated": { en: "Accelerated", ms: "Pantas", zh: "加速" },
  "k.top": { en: "Top match", ms: "Padanan teratas", zh: "最佳匹配" },
  "k.robust": { en: "Robust picks", ms: "Pilihan kukuh", zh: "稳健选择" },
  "k.robustNote": { en: "Top five in every scenario", ms: "Lima teratas dalam setiap senario", zh: "在每种情景下都排前五" },
  "k.current": { en: "Your current role", ms: "Peranan semasa anda", zh: "您目前的职位" },
  "k.data": { en: "Forecast data", ms: "Data unjuran", zh: "预测数据" },
  "k.fit": { en: "skill fit", ms: "padanan kemahiran", zh: "技能匹配" },
  "k.notSet": { en: "Not set", ms: "Belum ditetapkan", zh: "未设置" },
  "k.illustrative": { en: "Illustrative baseline", ms: "Asas ilustrasi", zh: "示意性基准数据" },
  "k.cited": { en: "Cited sources", ms: "Sumber dipetik", zh: "已注明来源" },
  "k.lookAhead": { en: "Look ahead to", ms: "Lihat ke hadapan hingga", zh: "展望至" },
  "k.estimate": { en: "estimate", ms: "anggaran", zh: "估计" },
  // honesty notices
  "note.cv": { en: "Use a sample or your own CV. We remove names, emails, phone and IC numbers before any AI reads it, and we never store the file.", ms: "Guna contoh atau CV anda sendiri. Kami membuang nama, e-mel, nombor telefon dan IC sebelum AI membacanya, dan kami tidak menyimpan fail itu.", zh: "可使用示例或您自己的简历。在 AI 读取前，我们会删除姓名、电邮、电话和身份证号码，且从不保存文件。" },
  "note.estimate": { en: "Estimates from research and job-posting trends, not predictions. Your skills are marked.", ms: "Anggaran daripada trend penyelidikan dan iklan jawatan, bukan ramalan. Kemahiran anda ditanda.", zh: "根据研究与招聘趋势得出的估计，不是预言。已标出您的技能。" },
  "note.coach": { en: "Answers come only from your own results, with sources. The coach can suggest a change; nothing changes unless you press Apply.", ms: "Jawapan hanya daripada keputusan anda sendiri, dengan sumber. Jurulatih boleh mencadangkan perubahan; tiada apa berubah melainkan anda tekan Guna.", zh: "回答只来自您自己的结果，并附来源。顾问可以建议修改；除非您按“应用”，否则不会有任何改变。" },
  "coach.title": { en: "Coach", ms: "Jurulatih", zh: "顾问" },
  "note.sources": { en: "Every forecast Laluan has used, newest first. Older snapshots are kept so a number can always be traced back to where it came from.", ms: "Setiap unjuran yang pernah digunakan Laluan, terkini dahulu. Snapshot lama disimpan supaya setiap angka boleh dijejak semula ke sumbernya.", zh: "Laluan 使用过的所有预测，最新的在前。旧快照会保留，任何数字都能追溯到来源。" },
  "banner.illustrative": { en: "The forecast is illustrative seed data until the team replaces it with cited figures. Treat the numbers as examples.", ms: "Unjuran ini ialah data contoh sehingga pasukan menggantikannya dengan angka bersumber. Anggap angka ini sebagai contoh.", zh: "在团队换成有出处的数据之前，此预测为示意数据。请把数字当作示例。" },
  "banner.stale": { en: "This forecast was imported {n} months ago. Trends may have moved since; an admin can refresh it.", ms: "Unjuran ini diimport {n} bulan lalu. Trend mungkin telah berubah; pentadbir boleh mengemas kininya.", zh: "此预测于 {n} 个月前导入，趋势可能已有变化；管理员可以刷新。" },
  "roles.noClose": { en: "None of these roles is a close match yet. That's normal for a career change: the plans show the shortest route to each one.", ms: "Belum ada peranan yang hampir sepadan. Ini biasa bagi pertukaran kerjaya: pelan menunjukkan laluan terpendek ke setiap satu.", zh: "目前还没有非常接近的职位。转行时这很正常：学习计划会给出通往每个职位的最短路线。" },
  "tip.title": { en: "Tip:", ms: "Petua:", zh: "提示：" },
  "tip.body": { en: "drag the year or switch the scenario. Roles marked “Robust pick” stay near the top whatever happens.", ms: "seret tahun atau tukar senario. Peranan bertanda “Pilihan kukuh” kekal di atas walau apa pun berlaku.", zh: "拖动年份或切换情景。标有“稳健选择”的职位无论如何都排在前面。" },
  "tip.ok": { en: "Got it", ms: "Faham", zh: "知道了" },
  "radar.onlyMine": { en: "Show only my skills", ms: "Tunjuk kemahiran saya sahaja", zh: "只显示我的技能" },
  "impact.skills": { en: "Skills that serve a goal", ms: "Kemahiran yang menyumbang kepada matlamat", zh: "有助于实现目标的技能" },
  "data.english": { en: "", ms: "Nama peranan, kursus dan tugas dipaparkan dalam bahasa Inggeris seperti yang diterbitkan oleh sumbernya.", zh: "职位、课程和任务名称按来源原文以英文显示。" },
} satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof STRINGS;

/** Every string in every language, for the translation check in the review kit. */
export function allStrings(): { key: string; en: string; ms: string; zh: string }[] {
  return Object.entries(STRINGS).map(([key, v]) => ({ key, ...(v as Record<Lang, string>) }));
}

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "en" || saved === "ms" || saved === "zh") return saved;
  } catch { /* private mode */ }
  const nav = (navigator.language || "en").toLowerCase();
  return nav.startsWith("ms") ? "ms" : nav.startsWith("zh") ? "zh" : "en";
}

let current: Lang = initial();

export function getLang(): Lang { return current; }

export function setLang(lang: Lang) {
  current = lang;
  document.documentElement.lang = LANGS.find((l) => l.id === lang)!.htmlLang;
  try { localStorage.setItem(KEY, lang); } catch { /* private mode */ }
}

export function t(key: StringKey): string {
  return STRINGS[key][current] || STRINGS[key].en;
}

setLang(current);
