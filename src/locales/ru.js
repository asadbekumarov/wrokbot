export default {
    welcome: "👋 Здравствуйте, <b>{name}</b>!\n\n🤖 Добро пожаловать в <b>WorkBot</b> — ваш персональный фильтр вакансий в Telegram!\n\nЯ отслеживаю сообщения во всех ваших открытых и закрытых каналах и группах в режиме реального времени и присылаю только подходящие вакансии.",
    choose_action: "Выберите действие из меню ниже:",
    
    // Auth & Status
    not_logged_in: "⚠️ <b>Вы еще не подключили свой аккаунт Telegram!</b>\n\nЧтобы начать автоматический поиск вакансий, подключите аккаунт командой /login.",
    logged_in_status: "✅ <b>Ваш аккаунт Telegram подключен!</b>\n📱 Телефон: <code>{phone}</code>\n🟢 Статус: Мониторинг активен",
    session_active: "🟢 Активен",
    session_inactive: "🔴 Неактивен",
    login_btn: "🔑 Подключить аккаунт (/login)",
    logout_btn: "🚪 Выйти (/logout)",
    login_prompt_phone: "📱 <b>Введите номер телефона вашего Telegram-аккаунта:</b>\n<i>Формат: +998901234567</i>\n\nДля отмены введите /cancel.",
    login_invalid_phone: "❌ Неверный формат номера телефона. Введите в международном формате (например, +998901234567):",
    login_code_sent: "📩 В Telegram отправлен <b>код подтверждения</b>!\n\nПожалуйста, введите полученный код (можно с пробелами, например: <code>1 2 3 4 5</code>):",
    login_2fa_prompt: "🔐 На вашем аккаунте включена <b>двухфакторная аутентификация (2FA)</b>.\n\nПожалуйста, введите ваш облачный пароль 2FA:",
    login_success: "🎉 <b>Поздравляем! Ваш аккаунт Telegram успешно подключен!</b>\n\nТеперь новые публикации во всех ваших каналах фильтруются на лету.\nНастроить ключевые слова: /keywords",
    login_error: "❌ Ошибка при входе: {error}\nПопробуйте снова: /login",
    login_cancelled: "❌ Вход отменен.",
    logout_confirm: "⚠️ <b>Вы уверены, что хотите отключить аккаунт?</b>\n\nПри этом отслеживание вакансий будет остановлено.",
    logout_yes: "Да, отключить",
    logout_no: "Отмена",
    logout_success: "🚪 Аккаунт отключен, сессия надежно удалена.",
    
    // Status
    status_title: "📊 <b>Ваш профиль и статус мониторинга:</b>",
    status_phone: "📱 Телефон: <code>{phone}</code>",
    status_keywords_count: "🔑 Ключевые слова: <b>{count}</b>",
    status_stopwords_count: "🛑 Стоп-слова: <b>{count}</b>",
    status_channels_count: "📢 Отслеживаемые каналы: <b>{count}</b> (все доступные чаты)",
    status_saved_count: "⭐ Сохраненные посты: <b>{count}</b>",
    
    // Keywords
    keywords_title: "🔑 <b>Настройки ключевых слов:</b>\n\nБот будет присылать вакансии, содержащие следующие слова:",
    keywords_empty: "<i>Ключевые слова еще не добавлены. Добавьте первое слово!</i>",
    btn_add_keyword: "➕ Добавить слово",
    btn_del_keyword: "➖ Удалить слово",
    btn_clear_keywords: "🗑 Очистить все",
    prompt_add_keyword: "✍️ <b>Введите ключевые слова для поиска:</b>\n\nМожно ввести несколько слов через запятую (например: <i>nodejs, react, python</i>)\nОтмена: /cancel",
    keyword_added: "✅ <b>Добавлено:</b> <code>{keywords}</code>",
    keyword_already_exists: "ℹ️ Это слово уже в списке: <code>{keyword}</code>",
    prompt_del_keyword: "🗑 <b>Выберите слово для удаления:</b>",
    keyword_deleted: "🗑 <b>Удалено:</b> <code>{keyword}</code>",
    keywords_cleared: "🗑 Все ключевые слова удалены.",
    
    // Stop-words
    stopwords_title: "🛑 <b>Анти-Резюме и Стоп-слова:</b>\n\nПосты, содержащие эти слова (резюме, поиск работы), будут отфильтрованы:",
    btn_add_stopword: "➕ Добавить стоп-слово",
    btn_del_stopword: "➖ Удалить стоп-слово",
    prompt_add_stopword: "🛑 <b>Введите стоп-слово или фразу:</b>\n<i>Например: #резюме или ищу работу</i>\nОтмена: /cancel",
    stopword_added: "✅ <b>Стоп-слово добавлено:</b> <code>{word}</code>",
    stopword_deleted: "🗑 <b>Стоп-слово удалено:</b> <code>{word}</code>",
    
    // Language
    language_title: "🌐 <b>Tilni tanlang / Выберите язык / Choose language:</b>",
    language_changed: "✅ <b>Язык успешно изменен:</b> Русский 🇷🇺",
    
    // Saved Vacancies
    saved_title: "⭐ <b>Сохраненные вакансии ({count}):</b>",
    saved_empty: "⭐ <b>Нет сохраненных вакансий.</b>\n\nНажмите кнопку \"⭐ Сохранить\" под подходящим постом, и он появится здесь.",
    btn_save: "⭐ Сохранить",
    btn_saved_done: "✅ Сохранено",
    btn_original_post: "🔗 Источник",
    btn_delete_saved: "🗑 Удалить",
    btn_clear_all_saved: "🗑 Очистить всё",
    btn_prev_page: "⬅️ Назад",
    btn_next_page: "Вперед ➡️",
    alert_saved_success: "⭐ Вакансия сохранена!",
    alert_already_saved: "ℹ️ Эта вакансия уже сохранена!",
    alert_deleted_saved: "🗑 Вакансия удалена из сохраненных.",
    alert_all_saved_cleared: "🗑 Все сохраненные вакансии очищены.",
    
    // Alert Notification format strings
    alert_title: "Найдена Новая Вакансия!",
    channel_label: "Канал",
    keywords_label: "Ключевые слова",
    contacts_label: "Контакты",
    phone_label: "Телефон",
    body_label: "Текст объявления",
    text_truncated: "Текст сокращен из-за ограничения длины",
    
    // Help & Common
    help_text: "📖 <b>WorkBot Справка:</b>\n\n/start - Запуск бота\n/login - Подключить аккаунт Telegram\n/logout - Отключить аккаунт\n/status - Статус и профиль\n/keywords - Управление ключевыми словами\n/stopwords - Стоп-слова (Анти-Резюме)\n/saved - Сохраненные вакансии\n/language - Выбор языка\n/help - Данная справка",
    btn_back: "🔙 Назад",
    btn_cancel: "❌ Отмена",
    btn_main_menu: "🏠 Главное меню",
    action_cancelled: "❌ Действие отменено.",
    menu_panel_title: "👇 <b>Панель управления:</b>",
    not_logged_in_start: "⚠️ <b>Вы еще не подключили свой аккаунт Telegram!</b>\n\nЧтобы начать автоматический поиск вакансий, подключите ваш аккаунт:",
    
    // Main Menu Buttons
    menu_status: "📊 Статус",
    menu_keywords: "🔑 Ключевые слова",
    menu_saved: "⭐ Сохраненные",
    menu_stopwords: "🛑 Стоп-слова",
    menu_language: "🌐 Язык / Language",
    menu_help: "📖 Помощь",
    
    unknown_command: "❓ Неизвестная команда. Воспользуйтесь меню или отправьте /help."
};
