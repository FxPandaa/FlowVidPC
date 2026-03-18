// Supported subtitle languages with ISO 639-2 codes

export interface SubtitleLanguage {
  code: string; // ISO 639-2/B code (used by OpenSubtitles)
  name: string;
  nativeName: string;
}

export const SUBTITLE_LANGUAGES: SubtitleLanguage[] = [
  { code: "eng", name: "English", nativeName: "English" },
  { code: "spa", name: "Spanish", nativeName: "Español" },
  { code: "fre", name: "French", nativeName: "Français" },
  { code: "ger", name: "German", nativeName: "Deutsch" },
  { code: "dut", name: "Dutch", nativeName: "Nederlands" },
  { code: "por", name: "Portuguese", nativeName: "Português" },
  { code: "ara", name: "Arabic", nativeName: "العربية" },
  { code: "chi", name: "Chinese", nativeName: "中文" },
  { code: "jpn", name: "Japanese", nativeName: "日本語" },
  { code: "kor", name: "Korean", nativeName: "한국어" },
  { code: "rus", name: "Russian", nativeName: "Русский" },
  { code: "ita", name: "Italian", nativeName: "Italiano" },
  { code: "pol", name: "Polish", nativeName: "Polski" },
  { code: "tur", name: "Turkish", nativeName: "Türkçe" },
  { code: "vie", name: "Vietnamese", nativeName: "Tiếng Việt" },
  { code: "tha", name: "Thai", nativeName: "ไทย" },
  { code: "heb", name: "Hebrew", nativeName: "עברית" },
  { code: "gre", name: "Greek", nativeName: "Ελληνικά" },
  { code: "swe", name: "Swedish", nativeName: "Svenska" },
  { code: "nor", name: "Norwegian", nativeName: "Norsk" },
  { code: "dan", name: "Danish", nativeName: "Dansk" },
  { code: "fin", name: "Finnish", nativeName: "Suomi" },
  { code: "cze", name: "Czech", nativeName: "Čeština" },
  { code: "hun", name: "Hungarian", nativeName: "Magyar" },
  { code: "rum", name: "Romanian", nativeName: "Română" },
  { code: "bul", name: "Bulgarian", nativeName: "Български" },
  { code: "hrv", name: "Croatian", nativeName: "Hrvatski" },
  { code: "slv", name: "Slovenian", nativeName: "Slovenščina" },
  { code: "srp", name: "Serbian", nativeName: "Српски" },
  { code: "ukr", name: "Ukrainian", nativeName: "Українська" },
  { code: "ind", name: "Indonesian", nativeName: "Bahasa Indonesia" },
  { code: "may", name: "Malay", nativeName: "Bahasa Melayu" },
  { code: "per", name: "Persian", nativeName: "فارسی" },
  { code: "hin", name: "Hindi", nativeName: "हिन्दी" },
];

export function getLanguageName(code: string): string {
  const lang = SUBTITLE_LANGUAGES.find((l) => l.code === code);
  return lang ? lang.name : code.toUpperCase();
}

export function getLanguageNativeName(code: string): string {
  const lang = SUBTITLE_LANGUAGES.find((l) => l.code === code);
  return lang ? lang.nativeName : code.toUpperCase();
}
