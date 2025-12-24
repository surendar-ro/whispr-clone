import { createClient } from "@deepgram/sdk";

const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY;

export const getDeepgramClient = () => {
  if (!DEEPGRAM_API_KEY) {
    throw new Error("Missing VITE_DEEPGRAM_API_KEY");
  }
  return createClient(DEEPGRAM_API_KEY);
};

export const createTranscriptionConnection = (deepgram: any) => {
  const connection = deepgram.listen.live({
    model: "nova",
    language: "en-US",
    smart_format: true,
  });

  return connection;
};
