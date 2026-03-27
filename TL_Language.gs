/**
 * TL_Language - canonical Boss-facing UI language helpers.
 *
 * Canonical source text is Hebrew. When the Boss UI language is not Hebrew,
 * we translate the Hebrew UI text at runtime and cache the result.
 *
 * This layer is only for DealWise system/menu/approval scaffolding.
 * It should not be used to translate recipient-facing draft bodies.
 */

const TL_LANGUAGE = {
  SOURCE_LANGUAGE: "Hebrew",
  CACHE_PREFIX: "TL_UI_LANG_CACHE_",
  CACHE_VERSION: "v1"
};

function TL_Language_BossUiLanguage_() {
  return TL_Language_NormalizeLanguage_(TLW_getSetting_("AI_DEFAULT_LANGUAGE") || TL_LANGUAGE.SOURCE_LANGUAGE);
}

function TL_Language_NormalizeLanguage_(language) {
  const raw = String(language || "").trim();
  if (!raw) return TL_LANGUAGE.SOURCE_LANGUAGE;
  const lowered = raw.toLowerCase();
  if (lowered === "he" || lowered === "iw" || lowered === "hebrew" || raw === "עברית") return "Hebrew";
  if (lowered === "en" || lowered === "english") return "English";
  return raw;
}

function TL_Language_IsHebrew_(language) {
  return TL_Language_NormalizeLanguage_(language) === "Hebrew";
}

function TL_Language_UiText_(hebrewText, targetLanguage) {
  const sourceText = String(hebrewText || "");
  if (!sourceText) return "";

  const target = TL_Language_NormalizeLanguage_(targetLanguage || TL_Language_BossUiLanguage_());
  if (TL_Language_IsHebrew_(target)) return sourceText;

  const cacheKey = TL_Language_CacheKey_(target, sourceText);
  const props = PropertiesService.getScriptProperties();
  const cached = String(props.getProperty(cacheKey) || "");
  if (cached) return cached;

  try {
    const translated = TL_Language_TranslateUiText_(sourceText, target);
    if (translated) {
      props.setProperty(cacheKey, translated);
      return translated;
    }
  } catch (e) {
    TLW_logInfo_("ui_translation_fallback", {
      target_language: target,
      error: String(e),
      source_preview: sourceText.slice(0, 120)
    });
  }

  return sourceText;
}

function TL_Language_TranslateUiText_(hebrewText, targetLanguage) {
  const prompt = [
    "You translate DealWise Boss-facing UI copy.",
    "Source language: Hebrew.",
    "Target language: " + String(targetLanguage || "English"),
    "Return plain text only.",
    "Keep line breaks and numbering exactly.",
    "Preserve phone numbers, emails, dates, times, IDs, quoted dynamic content, and punctuation.",
    "Do not add commentary.",
    "Translate only the Hebrew UI text below:",
    String(hebrewText || "")
  ].join("\n");

  const res = TL_AI_call_([{
    role: "user",
    parts: [{ text: prompt }]
  }], {
    temperature: 0,
    responseMimeType: "text/plain"
  });

  return String(TL_AI_parseResponseText_(res.body) || "").trim() || String(hebrewText || "");
}

function TL_Language_CacheKey_(targetLanguage, sourceText) {
  const hashBytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(sourceText || ""),
    Utilities.Charset.UTF_8
  );
  const hash = hashBytes.map(function(b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? ("0" + v) : v;
  }).join("");
  return [
    TL_LANGUAGE.CACHE_PREFIX,
    TL_LANGUAGE.CACHE_VERSION,
    TL_Language_NormalizeLanguage_(targetLanguage || ""),
    hash
  ].join("");
}
