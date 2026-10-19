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
  "landing.student": { en: "Or try the student demo", ms: "Atau cuba demo pelajar", zh: "或试试学生示范" },
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
  "data.english": { en: "", ms: "Nama peranan, kursus dan tugas dipaparkan dalam bahasa Inggeris seperti yang diterbitkan oleh sumbernya.", zh: "职位、课程和任务名称按来源原文以英文显示。" },
} satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof STRINGS;

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
