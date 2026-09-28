/**
 * Kaylish AI Phonetic Transcription Engine (Apinex / DeepSeek API)
 * Converts English sentences into exact IPA transcriptions using AI API.
 */

const KAYLISH_PHONETICS = {
  API_ENDPOINT: "https://api.apinex.bond/v1/chat/completions",
  API_KEY: "sk-apx96c9838363a1111affacf06cfca968cd92a8ec0fb1c025a",
  MODEL: "free/deepseek-v4-flash-0731",

  // Fetch IPA phonetic transcription from AI API
  async fetchSentenceIPA(sentenceText) {
    if (!sentenceText || !sentenceText.trim()) return "";

    try {
      const response = await fetch(this.API_ENDPOINT, {
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

      if (!response.ok) {
        throw new Error(`API status: ${response.status}`);
      }

      const data = await response.json();
      if (data.choices && data.choices.length > 0 && data.choices[0].message) {
        return data.choices[0].message.content.trim();
      }
      return "";
    } catch (err) {
      console.error("Lỗi lấy phiên âm IPA từ AI API:", err);
      return "";
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = KAYLISH_PHONETICS;
}
