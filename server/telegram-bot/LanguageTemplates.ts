export interface LanguageTemplates {
  WELCOME: string;
  BOT_VERSION: string;
  TELETHON_VERSION: string;
  YTDLP_VERSION: string;
  HELP_MESSAGE: string;
  DOWNLOAD_STARTED: string;
  DOWNLOAD_COMPLETED: string;
  DOWNLOAD_FAILED: string;
  DOWNLOAD_PROGRESS: string;
  YOUTUBE_OPTIONS: string;
  FILE_TOO_LARGE: string;
  UNAUTHORIZED_USER: string;
  COMMAND_NOT_FOUND: string;
  EXTRACTION_STARTED: string;
  EXTRACTION_COMPLETED: string;
  EXTRACTION_FAILED: string;
}

const templates: Record<string, LanguageTemplates> = {
  en_EN: {
    WELCOME: "🤖 Welcome to Telegram Downloader Bot!\n\n",
    BOT_VERSION: "🔢 Bot Version: {msg1}\n",
    TELETHON_VERSION: "📱 Protocol: MTProto Core\n",
    YTDLP_VERSION: "🎬 YouTube Engine: {msg1}\n",
    HELP_MESSAGE: `🤖 Telegram Downloader Bot - Complete Guide

📋 AVAILABLE COMMANDS:
• /start - Start the bot and show welcome message
• /help - Show this comprehensive help guide
• /version - Display bot version and system info
• /id - Show your user ID and chat ID
• /status - Show bot status, active downloads, and statistics

📥 HOW TO DOWNLOAD FILES:

1️⃣ MEDIA FILES FROM TELEGRAM:
   • Send any photo, video, audio, or document to the bot
   • Files are automatically saved and organized
   • Progress tracking for large files
   • Original quality preservation

2️⃣ YOUTUBE VIDEOS/AUDIO:
   • Send any YouTube URL (youtube.com or youtu.be)
   • Choose format: 🎥 Video (MP4) or 🎵 Audio (MP3)
   • Best quality downloads (up to 4K for video, 320kbps for audio)
   • Automatic metadata and thumbnail embedding
   • Support for playlists and channels

3️⃣ DIRECT FILE DOWNLOADS:
   • Send any direct download URL
   • Bot automatically detects file type
   • Resume support for interrupted downloads
   • Smart filename detection

📁 FILE ORGANIZATION:
   • Downloads/completed/ - Regular files
   • Downloads/youtube/ - YouTube downloads
   • Downloads/temp/ - Temporary processing files
   • Automatic folder creation and cleanup

📦 ARCHIVE EXTRACTION:
   • Automatic detection of ZIP, RAR, 7Z files
   • Safe extraction with path validation
   • Nested archive support
   • Original file preservation options

🔧 BOT FEATURES:
   • Multi-language support (English/Spanish)
   • Parallel download management
   • Progress tracking and reporting
   • Error handling and retry logic
   • Authorized user access control

🚀 USAGE EXAMPLES:

Example 1 - YouTube Download:
1. Send: https://www.youtube.com/watch?v=dQw4w9WgXcQ
2. Choose: 🎥 Video or 🎵 Audio
3. Wait for completion notification

Example 2 - Direct File:
1. Send: https://example.com/file.pdf
2. Bot automatically downloads and saves

Example 3 - Telegram Media:
1. Forward any photo/video to the bot
2. File is instantly saved to your collection

⚡ QUICK TIPS:
• Send multiple URLs at once for batch downloads
• Use /status to monitor all active downloads
• Files are automatically organized by type
• Bot remembers your language preference
• Only authorized users can access (secure)

🔧 TECHNICAL INFO:
• Node.js & TypeScript powered
• PostgreSQL database integration
• Vercel-ready deployment
• API-first architecture with web interface

Need help? Just type /help anytime!
Made with ❤️ for efficient downloading`,

    DOWNLOAD_STARTED: "📥 Download started: {msg1}",
    DOWNLOAD_COMPLETED: "✅ Download completed: {msg1}\n📁 Saved to: {msg2}",
    DOWNLOAD_FAILED: "❌ Download failed: {msg1}\nReason: {msg2}",
    DOWNLOAD_PROGRESS: "📊 {msg1}\n🔄 Progress: {msg2}%\n📈 Speed: {msg3}\n⏱️ ETA: {msg4}",
    YOUTUBE_OPTIONS: "🎬 YouTube link detected!\n\nChoose your preferred download option:",
    FILE_TOO_LARGE: "❌ File too large: {msg1}\nMaximum allowed size: {msg2}",
    UNAUTHORIZED_USER: "🚫 Unauthorized access. This bot is for authorized users only.",
    COMMAND_NOT_FOUND: "❓ Unknown command: {msg1}\nUse /help to see available commands.",
    EXTRACTION_STARTED: "📦 Extracting archive: {msg1}",
    EXTRACTION_COMPLETED: "✅ Extraction completed: {msg1}\n📁 Extracted {msg2} files to: {msg3}",
    EXTRACTION_FAILED: "❌ Extraction failed: {msg1}\nReason: {msg2}"
  },

  es_ES: {
    WELCOME: "🤖 ¡Bienvenido al Bot Descargador de Telegram!\n\n",
    BOT_VERSION: "🔢 Versión del Bot: {msg1}\n",
    TELETHON_VERSION: "📱 Protocolo: MTProto Core\n", 
    YTDLP_VERSION: "🎬 Motor de YouTube: {msg1}\n",
    HELP_MESSAGE: `🤖 Bot Descargador de Telegram - Guía Completa

📋 COMANDOS DISPONIBLES:
• /start - Iniciar el bot y mostrar mensaje de bienvenida
• /help - Mostrar esta guía completa de ayuda
• /version - Mostrar versión del bot e info del sistema
• /id - Mostrar tu ID de usuario e ID del chat
• /status - Mostrar estado del bot, descargas activas y estadísticas

📥 CÓMO DESCARGAR ARCHIVOS:

1️⃣ ARCHIVOS MULTIMEDIA DE TELEGRAM:
   • Envía cualquier foto, video, audio o documento al bot
   • Los archivos se guardan y organizan automáticamente
   • Seguimiento de progreso para archivos grandes
   • Preservación de calidad original

2️⃣ VIDEOS/AUDIO DE YOUTUBE:
   • Envía cualquier URL de YouTube (youtube.com o youtu.be)
   • Elige formato: 🎥 Video (MP4) o 🎵 Audio (MP3)
   • Descargas de mejor calidad (hasta 4K para video, 320kbps para audio)
   • Incrustación automática de metadatos y miniaturas
   • Soporte para listas de reproducción y canales

3️⃣ DESCARGAS DIRECTAS DE ARCHIVOS:
   • Envía cualquier URL de descarga directa
   • El bot detecta automáticamente el tipo de archivo
   • Soporte de reanudación para descargas interrumpidas
   • Detección inteligente de nombres de archivo

📁 ORGANIZACIÓN DE ARCHIVOS:
   • Downloads/completed/ - Archivos regulares
   • Downloads/youtube/ - Descargas de YouTube
   • Downloads/temp/ - Archivos de procesamiento temporal
   • Creación automática de carpetas y limpieza

📦 EXTRACCIÓN DE ARCHIVOS:
   • Detección automática de archivos ZIP, RAR, 7Z
   • Extracción segura con validación de rutas
   • Soporte para archivos anidados
   • Opciones de preservación de archivos originales

🔧 CARACTERÍSTICAS DEL BOT:
   • Soporte multiidioma (Inglés/Español)
   • Gestión de descargas paralelas
   • Seguimiento e informes de progreso
   • Manejo de errores y lógica de reintento
   • Control de acceso de usuarios autorizados

🚀 EJEMPLOS DE USO:

Ejemplo 1 - Descarga de YouTube:
1. Envía: https://www.youtube.com/watch?v=dQw4w9WgXcQ
2. Elige: 🎥 Video o 🎵 Audio
3. Espera la notificación de finalización

Ejemplo 2 - Archivo Directo:
1. Envía: https://ejemplo.com/archivo.pdf
2. El bot descarga y guarda automáticamente

Ejemplo 3 - Multimedia de Telegram:
1. Reenvía cualquier foto/video al bot
2. El archivo se guarda instantáneamente en tu colección

⚡ CONSEJOS RÁPIDOS:
• Envía múltiples URLs a la vez para descargas por lotes
• Usa /status para monitorear todas las descargas activas
• Los archivos se organizan automáticamente por tipo
• El bot recuerda tu preferencia de idioma
• Solo usuarios autorizados pueden acceder (seguro)

🔧 INFO TÉCNICA:
• Potenciado por Node.js y TypeScript
• Integración con base de datos PostgreSQL
• Despliegue listo para Vercel
• Arquitectura API-first con interfaz web

¿Necesitas ayuda? ¡Solo escribe /help en cualquier momento!
Hecho con ❤️ para descargas eficientes`,

    DOWNLOAD_STARTED: "📥 Descarga iniciada: {msg1}",
    DOWNLOAD_COMPLETED: "✅ Descarga completada: {msg1}\n📁 Guardado en: {msg2}",
    DOWNLOAD_FAILED: "❌ Descarga fallida: {msg1}\nRazón: {msg2}",
    DOWNLOAD_PROGRESS: "📊 {msg1}\n🔄 Progreso: {msg2}%\n📈 Velocidad: {msg3}\n⏱️ Tiempo estimado: {msg4}",
    YOUTUBE_OPTIONS: "🎬 ¡Enlace de YouTube detectado!\n\nElige tu opción de descarga preferida:",
    FILE_TOO_LARGE: "❌ Archivo demasiado grande: {msg1}\nTamaño máximo permitido: {msg2}",
    UNAUTHORIZED_USER: "🚫 Acceso no autorizado. Este bot es solo para usuarios autorizados.",
    COMMAND_NOT_FOUND: "❓ Comando desconocido: {msg1}\nUsa /help para ver los comandos disponibles.",
    EXTRACTION_STARTED: "📦 Extrayendo archivo: {msg1}",
    EXTRACTION_COMPLETED: "✅ Extracción completada: {msg1}\n📁 Extraídos {msg2} archivos a: {msg3}",
    EXTRACTION_FAILED: "❌ Extracción fallida: {msg1}\nRazón: {msg2}"
  }
};

export class LanguageManager {
  private currentLanguage: string;
  private templates: LanguageTemplates;

  constructor(language: string = 'en_EN') {
    this.currentLanguage = language;
    this.templates = templates[language] || templates['en_EN'];
  }

  template(key: keyof LanguageTemplates): string {
    return this.templates[key] || key;
  }

  formatTemplate(key: keyof LanguageTemplates, ...args: string[]): string {
    let template = this.template(key);
    
    args.forEach((arg, index) => {
      const placeholder = `{msg${index + 1}}`;
      template = template.replace(new RegExp(placeholder, 'g'), arg);
    });
    
    return template;
  }

  setLanguage(language: string): void {
    if (templates[language]) {
      this.currentLanguage = language;
      this.templates = templates[language];
    } else {
      console.warn(`Language ${language} not found, using default en_EN`);
    }
  }

  getCurrentLanguage(): string {
    return this.currentLanguage;
  }

  getAvailableLanguages(): string[] {
    return Object.keys(templates);
  }

  addCustomTemplate(language: string, key: keyof LanguageTemplates, template: string): void {
    if (!templates[language]) {
      templates[language] = { ...templates['en_EN'] };
    }
    templates[language][key] = template;
  }

  getTemplate(key: keyof LanguageTemplates): string {
    return this.template(key);
  }
}