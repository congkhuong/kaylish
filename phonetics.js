/**
 * Kaylish AI Phonetic Transcription Engine (Apinex / DeepSeek API)
 * Converts English sentences into exact IPA transcriptions with CORS fallback support.
 */

const KAYLISH_IPA_DICT = {
  "i": "aɪ", "you": "juː", "he": "hiː", "she": "ʃiː", "it": "ɪt", "we": "wiː", "they": "ðeɪ",
  "me": "miː", "him": "hɪm", "her": "hɜːr", "us": "ʌs", "them": "ðɛm", "my": "maɪ", "your": "jʊər",
  "his": "hɪz", "its": "ɪts", "our": "ˈaʊər", "their": "ðɛr", "a": "ə", "an": "æn", "the": "ðə",
  "this": "ðɪs", "that": "ðæt", "these": "ðiːz", "those": "ðoʊz", "am": "æm", "is": "ɪz", "are": "ɑːr",
  "was": "wʌz", "were": "wɜːr", "be": "biː", "been": "bɪn", "have": "hæv", "has": "hæz", "had": "hæd",
  "do": "duː", "does": "dʌz", "did": "dɪd", "can": "kæn", "could": "kʊd", "would": "wʊd", "should": "ʃʊd",
  "will": "wɪl", "go": "goʊ", "going": "ˈgoʊɪŋ", "get": "gɛt", "got": "gɑːt", "say": "seɪ", "said": "sɛd",
  "make": "meɪk", "made": "meɪd", "know": "noʊ", "knew": "nuː", "think": "θɪŋk", "thought": "θɔːt",
  "take": "teɪk", "took": "tʊk", "see": "siː", "saw": "sɔː", "come": "kʌm", "came": "keɪm", "want": "wɑːnt",
  "look": "lʊk", "use": "juːz", "find": "faɪnd", "give": "gɪv", "tell": "tɛl", "work": "wɜːrk",
  "call": "kɔːl", "try": "traɪ", "ask": "æsk", "need": "niːd", "feel": "fiːl", "leave": "liːv", "put": "pʊt",
  "mean": "miːn", "keep": "kiːp", "let": "lɛt", "begin": "bɪˈgɪn", "seem": "siːm", "help": "hɛlp",
  "talk": "tɔːk", "turn": "tɜːrn", "start": "stɑːrt", "show": "ʃoʊ", "hear": "hɪr", "play": "pleɪ",
  "run": "rʌn", "move": "muːv", "like": "laɪk", "live": "lɪv", "believe": "bɪˈliːv", "hold": "hoʊld",
  "bring": "brɪŋ", "happen": "ˈhæpən", "write": "raɪt", "sit": "sɪt", "stand": "stænd", "lose": "luːz",
  "pay": "peɪ", "meet": "miːt", "in": "ɪn", "on": "ɑːn", "at": "æt", "to": "tuː", "for": "fɔːr",
  "with": "wɪð", "from": "frʌm", "by": "baɪ", "about": "əˈbaʊt", "into": "ˈɪntuː", "through": "θruː",
  "after": "ˈæftər", "over": "ˈoʊvər", "between": "bɪˈtwiːn", "out": "aʊt", "under": "ˈʌndər",
  "around": "əˈraʊnd", "and": "ænd", "but": "bʌt", "or": "ɔːr", "so": "soʊ", "if": "ɪf", "because": "bɪˈkɔːz",
  "as": "æz", "while": "waɪl", "than": "ðæn", "also": "ˈɔːlsoʊ", "very": "ˈvɛri", "never": "ˈnɛvər",
  "now": "naʊ", "then": "ðɛn", "here": "hɪr", "there": "ðɛr", "when": "wɛn", "where": "wɛr",
  "why": "waɪ", "how": "haʊ", "what": "wʌt", "which": "wɪʧ", "who": "huː", "quite": "kwaɪt",
  "catch": "kætʃ", "less": "lɛs", "hour": "ˈaʊər", "award": "əˈwɔːrd", "time": "taɪm", "year": "jɪr",
  "people": "ˈpiːpəl", "way": "weɪ", "day": "deɪ", "man": "mæn", "woman": "ˈwʊmən", "child": "ʧaɪld",
  "life": "laɪf", "world": "wɜːrld", "school": "skuːl", "home": "hoʊm", "water": "ˈwɔːtər", "friend": "frɛnd"
};

const KAYLISH_PHONETICS = {
  API_ENDPOINT: "https://api.apinex.bond/v1/chat/completions",
  API_KEY: "sk-apx96c9838363a1111affacf06cfca968cd92a8ec0fb1c025a",
  MODEL: "free/deepseek-v4-flash-0731",

  // Main entry point for sentence IPA
  async fetchSentenceIPA(sentenceText) {
    if (!sentenceText || !sentenceText.trim()) return "";

    // 1. Try Direct Fetch first
    try {
      const directIpa = await this.rawFetchIPA(this.API_ENDPOINT, sentenceText);
      if (directIpa) return directIpa;
    } catch (err) {
      console.warn("Direct API CORS error, using fallback...", err);
    }

    // 2. Try CORS Proxy fallbacks for Web/GitHub Pages
    const proxies = [
      "https://corsproxy.io/?",
      "https://api.allorigins.win/raw?url="
    ];

    for (let proxy of proxies) {
      try {
        const targetUrl = proxy + encodeURIComponent(this.API_ENDPOINT);
        const proxyIpa = await this.rawFetchIPA(targetUrl, sentenceText);
        if (proxyIpa) return proxyIpa;
      } catch (e) {
        console.warn("CORS proxy error:", proxy, e);
      }
    }

    // 3. Offline Dictionary Fallback if API is blocked by CORS
    return this.getLocalIPA(sentenceText);
  },

  async rawFetchIPA(url, sentenceText) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.MODEL,
        messages: [
          {
            role: "user",
            content: `Phiên âm câu tiếng anh, chỉ trả về đoạn phiên âm: ${sentenceText.trim()}`
          }
        ]
      })
    });

    if (!response.ok) return "";
    const data = await response.json();
    if (data.choices && data.choices.length > 0 && data.choices[0].message) {
      return data.choices[0].message.content.trim();
    }
    return "";
  },

  // Heuristic Local IPA generator if network/CORS blocks API
  getLocalIPA(text) {
    if (!text) return "";
    const tokens = text.trim().split(/(\s+|[.,!?;:"'()])/);
    let result = [];
    for (let token of tokens) {
      if (!token) continue;
      if (/^\s+$/.test(token) || /^[.,!?;:"'()]$/.test(token)) {
        result.push(token);
      } else {
        const clean = token.toLowerCase().replace(/[^a-z0-9']/g, "");
        result.push(KAYLISH_IPA_DICT[clean] || token);
      }
    }
    return "/ " + result.join("").replace(/\s+/g, " ").trim() + " /";
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = KAYLISH_PHONETICS;
}
