export default {
    welcome: "👋 Salom, <b>{name}</b>!\n\n🤖 <b>WorkBot</b> — Telegramdagi shaxsiy vakansiya qidiruvchi tizimingizga xush kelibsiz!\n\nMen siz a'zo bo'lgan barcha ochiq va yopiq kanallarni, guruhlarni real-time rejimda kuzataman va faqat sizga mos keluvchi toza ish o'rinlarini yuborib turaman.",
    choose_action: "Quyidagi tugmalardan birini tanlang:",
    
    // Auth & Status
    not_logged_in: "⚠️ <b>Siz hali Telegram hisobingizni ulamagansiz!</b>\n\nVakansiyalarni avtomatik qidirish uchun /login buyrug'i orqali hisobingizni ulang.",
    logged_in_status: "✅ <b>Telegram hisobingiz ulangan!</b>\n📱 Telefon: <code>{phone}</code>\n🟢 Holati: Monitoring faol",
    session_active: "🟢 Faol",
    session_inactive: "🔴 Nofaol",
    login_btn: "🔑 Hisobni ulash (/login)",
    logout_btn: "🚪 Chiqish (/logout)",
    login_prompt_phone: "📱 <b>Telegram hisobingiz telefon raqamini kiriting:</b>\n<i>Format: +998901234567</i>\n\nBekor qilish uchun /cancel deb yozing.",
    login_invalid_phone: "❌ Noto'g'ri telefon raqami formati. Iltimos, xalqaro formatda kiriting (masalan, +998901234567):",
    login_code_sent: "📩 Telegram orqali <b>tasdiqlash kodi</b> yuborildi!\n\nIltimos, kelgan kodni kiriting (raqamlar orasiga bo'shliq qo'ysangiz ham bo'ladi, masalan: <code>1 2 3 4 5</code>):",
    login_2fa_prompt: "🔐 Ushbu hisobda <b>Ikki bosqichli autentifikatsiya (2FA)</b> yoqilgan.\n\nIltimos, hisobingizning 2FA bulutli parolini kiriting:",
    login_success: "🎉 <b>Tabriklaymiz! Telegram hisobingiz muvaffaqiyatli ulandi!</b>\n\nEndi siz a'zo bo'lgan barcha kanallardagi yangi e'lonlar avtomatik filtrlanadi.\nKalit so'zlarni sozlash uchun: /keywords",
    login_error: "❌ Kirishda xatolik yuz berdi: {error}\nQaytadan urinib ko'ring: /login",
    login_cancelled: "❌ Kirish jarayoni bekor qilindi.",
    logout_confirm: "⚠️ <b>Haqiqatan ham hisobingizni uzmoqchimisiz?</b>\n\nBunda barcha avtomatik qidiruvlar to'xtatiladi.",
    logout_yes: "Ha, hisobni uzish",
    logout_no: "Bekor qilish",
    logout_success: "🚪 Hisobingiz tizimdan uzildi va sessiya xavfsiz o'chirildi.",
    
    // Status
    status_title: "📊 <b>Sizning profilingiz va monitoring holati:</b>",
    status_phone: "📱 Telefon: <code>{phone}</code>",
    status_keywords_count: "🔑 Kalit so'zlar: <b>{count}</b> ta",
    status_stopwords_count: "🛑 Stop-so'zlar: <b>{count}</b> ta",
    status_channels_count: "📢 Kuzatilayotgan kanallar: <b>{count}</b> ta (barcha a'zo chatlar)",
    status_saved_count: "⭐ Saqlangan postlar: <b>{count}</b> ta",
    
    // Keywords
    keywords_title: "🔑 <b>Kalit so'zlar bo'yicha sozlamalar:</b>\n\nBot quyidagi so'zlar qatnashgan e'lonlarni saralab beradi:",
    keywords_empty: "<i>Hozircha kalit so'zlar kiritilmagan. Yangi so'z qo'shing!</i>",
    btn_add_keyword: "➕ So'z qo'shish",
    btn_del_keyword: "➖ So'zni o'chirish",
    btn_clear_keywords: "🗑 Barchasini tozalash",
    prompt_add_keyword: "✍️ <b>Qo'shmoqchi bo'lgan kalit so'z(lar)ingizni yozing:</b>\n\nBir nechta so'zni vergul bilan ajratib yozishingiz mumkin (masalan: <i>nodejs, react, python</i>)\nBekor qilish: /cancel",
    keyword_added: "✅ <b>Qo'shildi:</b> <code>{keywords}</code>",
    keyword_already_exists: "ℹ️ Bu so'z allaqachon ro'yxatda bor: <code>{keyword}</code>",
    prompt_del_keyword: "🗑 <b>O'chirmoqchi bo'lgan so'zni tanlang:</b>",
    keyword_deleted: "🗑 <b>O'chirildi:</b> <code>{keyword}</code>",
    keywords_cleared: "🗑 Barcha kalit so'zlaringiz tozalandi.",
    
    // Stop-words
    stopwords_title: "🛑 <b>Anti-CV va Stop-so'zlar:</b>\n\nUshbu so'zlar qatnashgan e'lonlar (rezyumelar, ish qidiruvchilar) sizga yuborilmaydi:",
    btn_add_stopword: "➕ Stop-so'z qo'shish",
    btn_del_stopword: "➖ Stop-so'zni o'chirish",
    prompt_add_stopword: "🛑 <b>Qo'shmoqchi bo'lgan stop-so'zni yozing:</b>\n<i>Masalan: #rezyume yoki ish qidir</i>\nBekor qilish: /cancel",
    stopword_added: "✅ <b>Stop-so'z qo'shildi:</b> <code>{word}</code>",
    stopword_deleted: "🗑 <b>Stop-so'z o'chirildi:</b> <code>{word}</code>",
    
    // Language
    language_title: "🌐 <b>Tilni tanlang / Выберите язык / Choose language:</b>",
    language_changed: "✅ <b>Til muvaffaqiyatli o'zgartirildi:</b> O'zbekcha 🇺🇿",
    
    // Saved Vacancies
    saved_title: "⭐ <b>Saqlangan vakansiyalar ({count} ta):</b>",
    saved_empty: "⭐ <b>Saqlangan vakansiyalar hozircha yo'q.</b>\n\nKelgan e'lon ostidagi \"⭐ Saqlash\" tugmasini bossangiz, shu yerda jamlanadi.",
    btn_save: "⭐ Saqlash",
    btn_saved_done: "✅ Saqlandi",
    btn_original_post: "🔗 Asl post",
    btn_delete_saved: "🗑 O'chirish",
    btn_clear_all_saved: "🗑 Barchasini tozalash",
    btn_prev_page: "⬅️ Oldingi",
    btn_next_page: "Keyingi ➡️",
    alert_saved_success: "⭐ Vakansiya saqlanganlarga qo'shildi!",
    alert_already_saved: "ℹ️ Ushbu vakansiya allaqachon saqlangan!",
    alert_deleted_saved: "🗑 Vakansiya saqlanganlardan o'chirildi.",
    alert_all_saved_cleared: "🗑 Barcha saqlangan vakansiyalar tozalandi.",
    
    // Alert Notification format strings
    alert_title: "Yangi Vakansiya Topildi!",
    channel_label: "Kanal",
    keywords_label: "Kalit so'zlar",
    contacts_label: "Kontaktlar",
    phone_label: "Telefon",
    body_label: "E'lon matni",
    text_truncated: "Xabar uzunligi sabab qisqartirildi",
    
    // Help & Common
    help_text: "📖 <b>WorkBot Yordam:</b>\n\n/start - Botni ishga tushirish\n/login - Telegram hisobingizni ulash\n/logout - Hisobni uzish va to'xtatish\n/status - Hisob va monitoring holati\n/keywords - Kalit so'zlarni boshqarish\n/stopwords - Anti-CV stop-so'zlar\n/saved - Saqlangan vakansiyalar\n/language - Tilni o'zgartirish\n/help - Ushbu qo'llanma",
    btn_back: "🔙 Orqaga",
    btn_cancel: "❌ Bekor qilish",
    btn_main_menu: "🏠 Bosh menyu",
    action_cancelled: "❌ Amal bekor qilindi.",
    menu_panel_title: "👇 <b>Boshqaruv paneli:</b>",
    not_logged_in_start: "⚠️ <b>Siz hali Telegram hisobingizni ulamagansiz!</b>\n\nVakansiyalarni avtomatik qidirishni boshlash uchun hisobingizni ulang:",
    
    // Main Menu Buttons
    menu_status: "📊 Status",
    menu_keywords: "🔑 Kalit so'zlar",
    menu_saved: "⭐ Saqlanganlar",
    menu_stopwords: "🛑 Stop-so'zlar",
    menu_language: "🌐 Til / Language",
    menu_help: "📖 Yordam",
    
    unknown_command: "❓ Noma'lum buyruq. Kerakli menyudan foydalaning yoki /help buyrug'ini yuboring."
};
