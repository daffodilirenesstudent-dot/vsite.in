/**
 * The Material Symbols icon font — which icons ship, and how they load.
 *
 * Material Symbols is a LIGATURE font: an icon is the text "home" drawn as a
 * glyph, so until the font arrives the browser draws the word. Loading the
 * whole family cost 3.8 MB (all ~4,300 icons, all four variable axes) and was
 * started only after hydration, which is why every icon read as its name for
 * 1–3 seconds after login.
 *
 * This file is the fix, and the one place to touch when adding an icon:
 *
 *   • ICON_NAMES subsets the font to what the app renders — ≈46 KB, not 3.8 MB.
 *   • Only the wght and FILL axes are requested; GRAD and opsz stay at their
 *     defaults everywhere in the app, so their ranges were dead weight.
 *   • display=block: an icon is invisible for the few hundred ms the subset
 *     takes, rather than showing as a word.
 *
 * ADDING AN ICON: put its name in ICON_NAMES, alphabetically (Google rejects an
 * unsorted icon_names list). An icon left out does not fall back to anything —
 * it renders as its name, permanently. tests/unit/iconFont.test.ts scans src/
 * for every icon in use and fails, naming the file, if one is missing.
 */

export const ICON_NAMES = [
    'add', 'add_photo_alternate', 'analytics', 'arrow_back', 'arrow_downward',
    'arrow_forward', 'arrow_upward', 'auto_awesome', 'autorenew', 'bar_chart',
    'block', 'bolt', 'cake', 'call', 'campaign', 'cancel', 'category',
    'celebration', 'chat', 'check', 'check_circle', 'checklist', 'chevron_left',
    'chevron_right', 'close', 'cloud_upload', 'computer', 'contact_phone',
    'content_copy', 'credit_card', 'currency_rupee', 'dashboard', 'delete',
    'delete_forever', 'description', 'desktop_windows', 'dinner_dining',
    'download', 'drag_indicator', 'edit', 'edit_note', 'emoji_food_beverage',
    'error', 'event_busy', 'expand_less', 'expand_more', 'filter_alt',
    'free_breakfast', 'group', 'headset_mic', 'help', 'help_outline', 'home',
    'hourglass_bottom', 'hourglass_empty', 'icecream', 'image', 'info',
    'insights', 'inventory_2', 'ios_share', 'keyboard_arrow_down', 'kitchen',
    'language', 'link', 'link_off', 'local_cafe', 'local_shipping',
    'location_on', 'lock', 'lock_clock', 'logout', 'lunch_dining', 'mail',
    'map', 'menu_book', 'nfc', 'notifications', 'notifications_off',
    'open_in_new', 'package_2', 'paid', 'palette', 'payments', 'pending',
    'phone_android', 'photo_camera', 'photo_library', 'picture_as_pdf',
    'point_of_sale', 'power_settings_new', 'print', 'qr_code', 'qr_code_2',
    'qr_code_2_add', 'qr_code_scanner', 'radio_button_checked',
    'radio_button_unchecked', 'receipt', 'receipt_long', 'redeem', 'refresh',
    'replay', 'report', 'restaurant', 'restaurant_menu', 'rocket_launch',
    'sanitizer', 'savings', 'scale', 'schedule', 'sell', 'settings', 'shield',
    'shopping_bag', 'shopping_cart', 'smartphone', 'speed', 'star', 'store',
    'storefront', 'support_agent', 'swap_horiz', 'sync', 'table_restaurant',
    'takeout_dining', 'timer', 'translate', 'trending_down', 'trending_up',
    'tune', 'upload', 'verified', 'verified_user', 'visibility', 'wallpaper',
    'warning', 'waving_hand', 'wifi', 'wifi_off', 'wine_bar',
    'workspace_premium',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export const ICON_FONT_URL =
    'https://fonts.googleapis.com/css2' +
    '?family=Material+Symbols+Outlined:wght,FILL@400..700,0..1' +
    `&icon_names=${ICON_NAMES.join(',')}` +
    '&display=block';
