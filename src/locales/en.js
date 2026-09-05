export default {
    welcome: "👋 Hello, <b>{name}</b>!\n\n🤖 Welcome to <b>WorkBot</b> — your personal Telegram vacancy radar!\n\nI monitor all public/private channels and groups you are a member of in real-time, delivering only verified job vacancies directly to you.",
    choose_action: "Choose an action from the menu below:",
    
    // Auth & Status
    not_logged_in: "⚠️ <b>You have not connected your Telegram account yet!</b>\n\nTo start real-time monitoring, connect your account via /login.",
    logged_in_status: "✅ <b>Telegram account connected!</b>\n📱 Phone: <code>{phone}</code>\n🟢 Status: Monitoring active",
    session_active: "🟢 Active",
    session_inactive: "🔴 Inactive",
    login_btn: "🔑 Connect account (/login)",
    logout_btn: "🚪 Log out (/logout)",
    login_prompt_phone: "📱 <b>Enter your Telegram account phone number:</b>\n<i>Format: +998901234567</i>\n\nTo cancel, type /cancel.",
    login_invalid_phone: "❌ Invalid phone number format. Please use international format (e.g., +998901234567):",
    login_code_sent: "📩 A <b>verification code</b> has been sent to your Telegram app!\n\nPlease enter the code (spaces are allowed, e.g., <code>1 2 3 4 5</code>):",
    login_2fa_prompt: "🔐 <b>Two-Factor Authentication (2FA)</b> is enabled on this account.\n\nPlease enter your 2FA cloud password:",
    login_success: "🎉 <b>Congratulations! Telegram account connected successfully!</b>\n\nNew job offers across all your chats will now be filtered in real-time.\nConfigure keywords: /keywords",
    login_error: "❌ Login error: {error}\nPlease try again: /login",
    login_cancelled: "❌ Login cancelled.",
    logout_confirm: "⚠️ <b>Are you sure you want to disconnect your account?</b>\n\nJob monitoring will be stopped.",
    logout_yes: "Yes, disconnect",
    logout_no: "Cancel",
    logout_success: "🚪 Your account has been disconnected and session safely removed.",
    
    // Status
    status_title: "📊 <b>Your Profile and Monitoring Status:</b>",
    status_phone: "📱 Phone: <code>{phone}</code>",
    status_keywords_count: "🔑 Keywords: <b>{count}</b>",
    status_stopwords_count: "🛑 Stop-words: <b>{count}</b>",
    status_channels_count: "📢 Monitored channels: <b>{count}</b> (all joined chats)",
    status_saved_count: "⭐ Saved vacancies: <b>{count}</b>",
    
    // Keywords
    keywords_title: "🔑 <b>Keyword Settings:</b>\n\nBot will filter vacancies containing the following terms:",
    keywords_empty: "<i>No keywords added yet. Add your first keyword!</i>",
    btn_add_keyword: "➕ Add keyword",
    btn_del_keyword: "➖ Remove keyword",
    btn_clear_keywords: "🗑 Clear all",
    prompt_add_keyword: "✍️ <b>Enter keyword(s) to search for:</b>\n\nYou can enter multiple comma-separated keywords (e.g.: <i>nodejs, react, python</i>)\nCancel: /cancel",
    keyword_added: "✅ <b>Added:</b> <code>{keywords}</code>",
    keyword_already_exists: "ℹ️ Keyword already exists: <code>{keyword}</code>",
    prompt_del_keyword: "🗑 <b>Select keyword to remove:</b>",
    keyword_deleted: "🗑 <b>Removed:</b> <code>{keyword}</code>",
    keywords_cleared: "🗑 All keywords cleared.",
    
    // Stop-words
    stopwords_title: "🛑 <b>Anti-CV & Stop-words:</b>\n\nPosts containing these words (resumes, job-seekers) will be filtered out:",
    btn_add_stopword: "➕ Add stop-word",
    btn_del_stopword: "➖ Remove stop-word",
    prompt_add_stopword: "🛑 <b>Enter stop-word or phrase:</b>\n<i>Example: #resume or seeking job</i>\nCancel: /cancel",
    stopword_added: "✅ <b>Stop-word added:</b> <code>{word}</code>",
    stopword_deleted: "🗑 <b>Stop-word removed:</b> <code>{word}</code>",
    
    // Language
    language_title: "🌐 <b>Tilni tanlang / Выберите язык / Choose language:</b>",
    language_changed: "✅ <b>Language changed:</b> English 🇺🇸",
    
    // Saved Vacancies
    saved_title: "⭐ <b>Saved vacancies ({count}):</b>",
    saved_empty: "⭐ <b>No saved vacancies yet.</b>\n\nClick the \"⭐ Save\" button under incoming vacancies to bookmark them here.",
    btn_save: "⭐ Save",
    btn_saved_done: "✅ Saved",
    btn_original_post: "🔗 Source",
    btn_delete_saved: "🗑 Remove",
    btn_clear_all_saved: "🗑 Clear all",
    btn_prev_page: "⬅️ Previous",
    btn_next_page: "Next ➡️",
    alert_saved_success: "⭐ Vacancy added to saved list!",
    alert_already_saved: "ℹ️ Vacancy is already saved!",
    alert_deleted_saved: "🗑 Vacancy removed from saved list.",
    alert_all_saved_cleared: "🗑 All saved vacancies cleared.",
    
    // Alert Notification format strings
    alert_title: "New Job Vacancy Found!",
    channel_label: "Channel",
    keywords_label: "Keywords",
    contacts_label: "Contacts",
    phone_label: "Phone",
    body_label: "Job Description",
    text_truncated: "Message truncated due to Telegram size limit",
    
    // Help & Common
    help_text: "📖 <b>WorkBot Help Guide:</b>\n\n/start - Start the bot\n/login - Connect your Telegram account\n/logout - Disconnect account\n/status - View profile and monitoring status\n/keywords - Manage search keywords\n/stopwords - Manage Anti-CV stop-words\n/saved - View saved vacancies\n/language - Change language\n/help - View this guide",
    btn_back: "🔙 Back",
    btn_cancel: "❌ Cancel",
    btn_main_menu: "🏠 Main Menu",
    action_cancelled: "❌ Action cancelled.",
    menu_panel_title: "👇 <b>Control Panel:</b>",
    not_logged_in_start: "⚠️ <b>You have not connected your Telegram account yet!</b>\n\nTo start real-time vacancy radar, connect your account:",
    
    // Main Menu Buttons
    menu_status: "📊 Status",
    menu_keywords: "🔑 Keywords",
    menu_saved: "⭐ Saved",
    menu_stopwords: "🛑 Stop-words",
    menu_language: "🌐 Language",
    menu_help: "📖 Help",
    
    unknown_command: "❓ Unknown command. Please use the menu or type /help."
};
